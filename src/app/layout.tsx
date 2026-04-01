import type { Metadata } from "next";
import Script from "next/script";
import "../styles/daisyui.css";
import "../styles/globals.css";
import ClientProviders from '../components/ClientProviders';

export const metadata: Metadata = {
  title: "neevv — Architecture • Structure • MEP • Interiors",
  description: "AI-powered residential design studio for Indian home builders. Get professional floor plans, 3D renders, working drawings, BOQ & interior design — all powered by AI. NBC 2016 compliant. Vastu intelligent.",
  icons: { icon: "/logo.png" },
  openGraph: {
    title: "neevv — AI-Powered Home Design Studio",
    description: "Design your dream home in minutes. Free floor plans, 3D renders, 17 working drawings, BOQ & cost estimation. NBC 2016 compliant.",
    siteName: "neevv",
    type: "website",
    locale: "en_IN",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "neevv — AI-Powered Home Design Studio" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "neevv — AI-Powered Home Design Studio",
    description: "Design your dream home in minutes. Free floor plans, 3D renders, working drawings & BOQ.",
  },
  keywords: ["architecture", "home design", "floor plan", "3D render", "BOQ", "vastu", "NBC 2016", "Indian home", "AI architecture", "neevv"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html data-theme="alfred-light">
      <body className="bg-white text-gray-900">
        {/* Tailwind v4 browser - processes utility classes client-side (same as Tasklet CDN) */}
        <Script
          src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"
          strategy="beforeInteractive"
        />
        {/* Three.js - lazy loaded (only when 3D view is used) */}
        <Script
          src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js"
          strategy="lazyOnload"
        />
        <Script
          src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"
          strategy="lazyOnload"
        />
        {/* Google Analytics - replace GA_MEASUREMENT_ID with actual ID */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-XXXXXXXXXX');
          `}
        </Script>
        {/* Light mode only */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`document.documentElement.setAttribute('data-theme', 'alfred-light');`}
        </Script>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
