import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'neevv — Sapno Ka Nirman | AI-Powered Home Design',
  description: 'Design your dream home with AI. NBC 2016 compliant floor plans, Vastu-optimized layouts, professional 3D renders, and complete construction documentation for Indian residential buildings.',
  keywords: ['home design', 'floor plan', 'Vastu', 'NBC 2016', 'Indian architecture', 'AI render', 'construction drawing', 'interior design'],
  authors: [{ name: 'neevv' }],
  openGraph: {
    title: 'neevv — Sapno Ka Nirman',
    description: 'AI-Powered Residential Design Studio for Indian Home Builders',
    type: 'website',
    locale: 'en_IN',
    siteName: 'neevv',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'neevv — Sapno Ka Nirman',
    description: 'AI-Powered Residential Design Studio for Indian Home Builders',
  },
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#2D3436',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
