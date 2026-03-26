import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import '@/styles/globals.css';

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
  themeColor: '#121215',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="alfred-dark">
      <body className="bg-base-100 text-base-content">
        {/* Auto-detect system theme */}
        <Script id="theme-detect" strategy="beforeInteractive">{`
          (function() {
            var theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'alfred-dark' : 'alfred-light';
            document.documentElement.setAttribute('data-theme', theme);
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
              document.documentElement.setAttribute('data-theme', e.matches ? 'alfred-dark' : 'alfred-light');
            });
          })();
        `}</Script>

        {/* Three.js for 3D rendering */}
        <Script
          src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js"
          strategy="beforeInteractive"
        />
        <Script
          src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"
          strategy="beforeInteractive"
        />

        {children}
      </body>
    </html>
  );
}
