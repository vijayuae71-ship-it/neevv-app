import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Calling bot console',
  robots: { index: false, follow: false },
};

export default function CallbotLayout({ children }: { children: React.ReactNode }) {
  return children;
}
