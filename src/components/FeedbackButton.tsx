'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function FeedbackButton() {
  const router = useRouter();
  const [isFeedbackPage, setIsFeedbackPage] = useState(false);

  useEffect(() => {
    setIsFeedbackPage(window.location.pathname === '/feedback');
  }, []);

  if (isFeedbackPage) return null;

  return (
    <button
      type="button"
      onClick={() => router.push('/feedback')}
      className="fixed bottom-20 right-4 z-50 rounded-full bg-[#4f6f52] px-4 py-2.5 text-sm font-medium text-white shadow-lg transition hover:scale-105 hover:bg-[#405b43] focus:outline-none focus:ring-2 focus:ring-[#e8853d] focus:ring-offset-2"
      aria-label="Send feedback"
    >
      💬 Feedback
    </button>
  );
}
