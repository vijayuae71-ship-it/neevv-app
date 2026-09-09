'use client';
import React, { useState, useCallback } from 'react';

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface RazorpayPaymentProps {
  userId: string;
  onSuccess: (credits: number) => void;
  onClose?: () => void;
  creditsRemaining: number;
}

// Toggle this when ready to go live
function isLiveMode(): boolean {
  return process.env.NEXT_PUBLIC_PAYMENT_LIVE === 'true';
}

const BRAND_GREEN = '#4f6f52';
const BRAND_ACCENT = '#e07b39';

export default function RazorpayPayment({ userId, onSuccess, onClose, creditsRemaining }: RazorpayPaymentProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRazorpayScript = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }, []);

  const handlePayment = useCallback(async () => {
    if (!isLiveMode()) {
      onSuccess(99); // Beta: give free credits
      return;
    }

    setLoading(true);
    setError(null);

    const loaded = await loadRazorpayScript();
    if (!loaded) {
      setError('Payment service unavailable. Please try again.');
      setLoading(false);
      return;
    }

    try {
      // Create order on server
      const res = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amount: 4900, credits: 3 }), // ₹49 = 4900 paise
      });
      const order = await res.json();

      if (!order.success) {
        setError(order.error || 'Failed to create order');
        setLoading(false);
        return;
      }

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY,
        amount: order.amount,
        currency: 'INR',
        name: 'neevv',
        description: '3 Re-render Credits',
        order_id: order.orderId,
        handler: async (response: any) => {
          // Verify payment on server
          const verifyRes = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              credits: 3,
            }),
          });
          const result = await verifyRes.json();
          if (result.success) {
            onSuccess(result.totalCredits);
          } else {
            setError('Payment verification failed. Contact support.');
          }
        },
        prefill: {},
        theme: { color: BRAND_GREEN },
        modal: {
          ondismiss: () => {
            setLoading(false);
            onClose?.();
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      setError('Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [userId, onSuccess, onClose, loadRazorpayScript]);

  // Beta mode — free credits
  if (!isLiveMode()) {
    return (
      <div style={{
        padding: '16px 20px',
        background: `linear-gradient(135deg, ${BRAND_GREEN}08, ${BRAND_ACCENT}08)`,
        borderRadius: 12,
        border: `1px solid ${BRAND_GREEN}20`,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>
          🎉 Free during beta
        </div>
        <div style={{ fontSize: 13, color: '#999' }}>
          {creditsRemaining > 0
            ? `${creditsRemaining} re-render credits remaining today`
            : 'Daily limit reached — resets tomorrow'}
        </div>
      </div>
    );
  }

  // Live mode — payment UI
  return (
    <div style={{
      padding: '16px 20px',
      background: '#fff',
      borderRadius: 12,
      border: '1px solid #e5e7eb',
      textAlign: 'center',
    }}>
      {creditsRemaining > 0 ? (
        <div style={{ fontSize: 13, color: '#666' }}>
          {creditsRemaining} re-render credits remaining
        </div>
      ) : (
        <>
          <div style={{ fontSize: 14, color: '#333', fontWeight: 600, marginBottom: 8 }}>
            Out of re-render credits
          </div>
          <button
            onClick={handlePayment}
            disabled={loading}
            style={{
              padding: '10px 24px',
              background: loading ? '#ccc' : BRAND_ACCENT,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: 8,
            }}
          >
            {loading ? 'Processing...' : 'Buy 3 Credits — ₹49'}
          </button>
          <div style={{ fontSize: 12, color: '#999' }}>
            Secure payment via Razorpay
          </div>
          {error && (
            <div style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>{error}</div>
          )}
        </>
      )}
    </div>
  );
}
