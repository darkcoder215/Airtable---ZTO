import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "صفر لـواحد — منصة إدارة المحتوى",
  description: "منصة إدارة المحتوى لفريق الكتابة — صفر لـواحد",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        {/* Preload Tinta Arabic so the Signal theme doesn't flash a
            generic Arabic fallback on first paint. as=font with crossOrigin
            is required by Chromium to actually use the preloaded asset. */}
        <link
          rel="preload"
          href="/fonts/TintaArabic-Light.otf"
          as="font"
          type="font/otf"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/TintaArabic-Bold.otf"
          as="font"
          type="font/otf"
          crossOrigin="anonymous"
        />
        {/* Naveid Arabic — paired with the ZTO gold themes (dark + light).
            Two weights preloaded (Regular + ExtraBold) — enough to cover
            body and bold display without blocking on Thin, which is only
            used in a few hero headers. */}
        <link
          rel="preload"
          href="/fonts/NaveidArabicDEMO-Regular.otf"
          as="font"
          type="font/otf"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/NaveidArabicDEMO-ExtraBold.otf"
          as="font"
          type="font/otf"
          crossOrigin="anonymous"
        />
        {/* Bootstrap the saved theme synchronously to avoid a flash on
            first paint. We allow all four valid theme keys; anything else
            falls back to the dark default. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('zto-theme');if(t==='light'||t==='dark'||t==='signal'||t==='signal-light'){document.documentElement.setAttribute('data-theme',t);}}catch(_){}})();`,
          }}
        />
      </head>
      <body>
        {/* Drifting geometric shapes — only visible under signal themes
            via CSS. Rendered once at the root so every page picks them
            up automatically and React doesn't need to remount them on
            navigation. */}
        <div className="signal-bg-shapes" aria-hidden="true">
          <svg className="shape s1" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="96" height="96" stroke="currentColor" strokeWidth="1" />
          </svg>
          <svg className="shape s2" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="48" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" />
          </svg>
          <svg className="shape s3" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="50,4 96,80 4,80" stroke="currentColor" strokeWidth="1" />
          </svg>
          <svg className="shape s4" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="50,4 92,28 92,72 50,96 8,72 8,28" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
          </svg>
        </div>
        {children}
      </body>
    </html>
  );
}
