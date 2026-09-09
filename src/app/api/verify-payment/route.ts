import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAdminDb } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const { userId, orderId, paymentId, signature, credits } = await req.json();

    if (!userId || !orderId || !paymentId || !signature) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
    if (!RAZORPAY_KEY_SECRET) {
      return NextResponse.json({ success: false, error: 'Payment not configured' }, { status: 500 });
    }

    // Verify Razorpay signature
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== signature) {
      return NextResponse.json({ success: false, error: 'Invalid payment signature' }, { status: 400 });
    }

    // Payment verified — add credits to user
    const db = getAdminDb();
    const userCreditsRef = db.collection('credits').doc(userId);

    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(userCreditsRef);
      const current = doc.exists ? (doc.data()?.credits || 0) : 0;
      const newTotal = current + (credits || 3);

      transaction.set(userCreditsRef, {
        credits: newTotal,
        lastPurchase: new Date().toISOString(),
        userId,
      }, { merge: true });

      // Log the transaction
      const txRef = db.collection('transactions').doc();
      transaction.set(txRef, {
        userId,
        orderId,
        paymentId,
        credits: credits || 3,
        amount: 4900,
        currency: 'INR',
        timestamp: new Date().toISOString(),
        verified: true,
      });

      return newTotal;
    });

    return NextResponse.json({ success: true, totalCredits: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
