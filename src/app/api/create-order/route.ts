import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { userId, amount, credits } = await req.json();

    if (!userId || !amount || !credits) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // In live mode, create Razorpay order via their API
    const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
    const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return NextResponse.json({ success: false, error: 'Payment not configured' }, { status: 500 });
    }

    const orderRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64'),
      },
      body: JSON.stringify({
        amount,
        currency: 'INR',
        receipt: `neevv_${userId}_${Date.now()}`,
        notes: { userId, credits: String(credits) },
      }),
    });

    const order = await orderRes.json();

    if (order.error) {
      return NextResponse.json({ success: false, error: order.error.description }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
