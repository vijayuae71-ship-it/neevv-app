import type { Metadata } from "next";
import Script from "next/script";
import "../styles/daisyui.css";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "neevv – AI Architect & Interior Designer",
  description: "Design your dream Indian home with AI-powered architecture",
  icons: { icon: "/logo.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html data-theme="alfred-light">
      <body className="bg-base-100 text-base-content">
        {/* Tailwind v4 browser - processes utility classes client-side (same as Tasklet CDN) */}
        <Script
          src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"
          strategy="beforeInteractive"
        />
        {/* Three.js for 3D model viewer */}
        <Script
          src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js"
          strategy="beforeInteractive"
        />
        <Script
          src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"
          strategy="afterInteractive"
        />
        {/* Light mode only */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`document.documentElement.setAttribute('data-theme', 'alfred-light');`}
        </Script>
        {children}
      </body>
    </html>
  );
}
