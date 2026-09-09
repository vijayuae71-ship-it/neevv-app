import type { Metadata } from "next";
import Script from "next/script";
import "../styles/daisyui.css";
import "../styles/globals.css";
import ClientProviders from '../components/ClientProviders';

export const metadata: Metadata = {
  metadataBase: new URL('https://neevv.in'),
  title: "neevv — Architecture • Structure • MEP • Interiors",
  description: "AI-powered residential design studio for Indian home builders. Get professional floor plans, 3D renders, working drawings, BOQ & interior design — all powered by AI. NBC 2016 compliant. Vastu intelligent.",
  icons: { icon: "/logo.png" },
  alternates: { canonical: 'https://neevv.in' },
  openGraph: {
    title: "neevv — AI-Powered Home Design Studio",
    description: "Design your dream home in minutes. Free floor plans, 3D renders, 17 working drawings, BOQ & cost estimation. NBC 2016 compliant.",
    siteName: "neevv",
    type: "website",
    locale: "en_IN",
    url: 'https://neevv.in',
    images: [{ url: 'https://neevv.in/og-image.png', width: 1200, height: 630, alt: "neevv — AI-Powered Home Design Studio" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "neevv — AI-Powered Home Design Studio",
    description: "Design your dream home in minutes. Free floor plans, 3D renders, working drawings & BOQ.",
    images: ['https://neevv.in/og-image.png'],
  },
  keywords: [
    "architecture", "home design", "floor plan", "3D render", "BOQ", "vastu", "NBC 2016", "Indian home", "AI architecture", "neevv",
    "30x40 house plan", "house plan India", "2BHK floor plan", "3BHK house plan", "vastu house plan", "house construction cost India",
    "working drawings", "building plan approval", "residential architect India", "house elevation design",
  ],
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  "name": "neevv",
  "description": "AI-powered architecture studio for Indian homeowners. Professional floor plans, 3D renders, 17+ working drawings, BOQ & interior design.",
  "url": "https://neevv.in",
  "logo": "https://neevv.in/logo.png",
  "image": "https://neevv.in/og-image.png",
  "priceRange": "\u20b90 - \u20b95000",
  "address": { "@type": "PostalAddress", "addressCountry": "IN" },
  "areaServed": { "@type": "Country", "name": "India" },
  "serviceType": ["Architecture", "Interior Design", "Structural Engineering", "MEP Engineering"],
  "knowsAbout": ["NBC 2016", "Vastu Shastra", "Indian Standard Codes", "Residential Architecture"],
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
        {/* Google model-viewer for AR/3D */}
        <Script
          id="model-viewer"
          type="module"
          src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"
          strategy="afterInteractive"
        />
        {/* Three.js - loaded after page interactive, OrbitControls depends on THREE */}
        <Script
          id="three-core"
          src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js"
          strategy="afterInteractive"
        />
        <Script
          id="three-orbit"
          src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"
          strategy="afterInteractive"
        />
        {/* Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-E8FLZYV3NF"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-E8FLZYV3NF');
          `}
        </Script>
        {/* SEO structured data */}
        <Script
          id="structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        {/* Light mode only */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`document.documentElement.setAttribute('data-theme', 'alfred-light');`}
        </Script>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
