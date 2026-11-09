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
      className="fixed bottom-24 right-3 md:bottom-6 md:right-6 z-40 flex h-11 w-11 md:h-auto md:w-auto items-center justify-center rounded-full bg-[#4f6f52]/90 md:px-4 md:py-2.5 text-sm font-medium text-white shadow-lg transition hover:scale-105 hover:bg-[#405b43] focus:outline-none focus:ring-2 focus:ring-[#e8853d] focus:ring-offset-2"
      aria-label="Send feedback"
      title="Send feedback"
    >
      💬<span className="hidden md:inline ml-1.5">Feedback</span>
    </button>
  );
}
