import type { Metadata, Viewport } from 'next';
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
      <head>
        {/* DaisyUI v5 — exact same as Tasklet instant app */}
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/daisyui@5" type="text/css" />

        {/* Custom neevv themes — exact copy from Tasklet index.html */}
        <style dangerouslySetInnerHTML={{ __html: `
          [data-theme='alfred-light'] {
            color-scheme: light;
            --radius-selector: 0rem;
            --radius-field: 0.25rem;
            --radius-box: 0.25rem;
            --size-selector: 0.25rem;
            --size-field: 0.25rem;
            --border: 1px;
            --depth: 1;
            --noise: 0;
            --color-base-100: #f5f5f5;
            --color-base-200: #eaeaea;
            --color-base-300: #dfdfdf;
            --color-base-content: #1c1c1e;
            --color-primary: #4f6f52;
            --color-primary-content: #ffffff;
            --color-secondary: #ff7f50;
            --color-secondary-content: #1c1c1e;
            --color-accent: #ff7f50;
            --color-accent-content: #1c1c1e;
            --color-neutral: #1f1f23;
            --color-neutral-content: #e8e8ec;
            --color-info: #4a7c9b;
            --color-info-content: #f4f4f5;
            --color-success: #3d8b6e;
            --color-success-content: #f4f4f5;
            --color-warning: #b8860b;
            --color-warning-content: #1c1c1e;
            --color-error: #9e3d32;
            --color-error-content: #f4f4f5;
          }
          [data-theme='alfred-dark'] {
            color-scheme: dark;
            --radius-selector: 0rem;
            --radius-field: 0.25rem;
            --radius-box: 0.25rem;
            --size-selector: 0.25rem;
            --size-field: 0.25rem;
            --border: 1px;
            --depth: 1;
            --noise: 0;
            --color-base-100: #121215;
            --color-base-200: #1a1a1e;
            --color-base-300: #252529;
            --color-base-content: #f4f4f5;
            --color-primary: #4f6f52;
            --color-primary-content: #ffffff;
            --color-secondary: #ff7f50;
            --color-secondary-content: #1c1c1e;
            --color-accent: #ff7f50;
            --color-accent-content: #1c1c1e;
            --color-neutral: #3a3a42;
            --color-neutral-content: #b8b8c0;
            --color-info: #4a7c9b;
            --color-info-content: #f4f4f5;
            --color-success: #3d8b6e;
            --color-success-content: #f4f4f5;
            --color-warning: #b8860b;
            --color-warning-content: #1c1c1e;
            --color-error: #9e3d32;
            --color-error-content: #f4f4f5;
          }

          /* Custom scrollbar */
          ::-webkit-scrollbar { width: 6px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.4); border-radius: 9999px; }
          ::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.6); }

          /* Print styles */
          @media print {
            .no-print { display: none !important; }
            body { background: white; }
          }
        ` }} />

        {/* Tailwind v4 CDN — exact same as Tasklet instant app */}
        <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4" />

        {/* Three.js for 3D rendering — exact same as Tasklet instant app */}
        <script crossOrigin="anonymous" src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js" />
        <script crossOrigin="anonymous" src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js" />

        {/* Auto-detect system theme */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'alfred-dark' : 'alfred-light';
            document.documentElement.setAttribute('data-theme', theme);
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
              document.documentElement.setAttribute('data-theme', e.matches ? 'alfred-dark' : 'alfred-light');
            });
          })();
        ` }} />
      </head>
      <body className="bg-base-100 text-base-content">
        {children}
      </body>
    </html>
  );
}
