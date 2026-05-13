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
        {/* Arabic display fonts used by the dashboard chrome. Preloaded
            so first paint matches the loaded state. */}
        <link rel="preload" href="/fonts/TintaArabic-Light.otf"          as="font" type="font/otf" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/TintaArabic-Bold.otf"           as="font" type="font/otf" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/NaveidArabicDEMO-Regular.otf"   as="font" type="font/otf" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/NaveidArabicDEMO-ExtraBold.otf" as="font" type="font/otf" crossOrigin="anonymous" />
        {/* Bootstrap the saved theme synchronously to avoid a flash on
            first paint. Only `dark` and `light` are accepted; any stale
            value from earlier themes falls back to the dark default. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('zto-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(_){}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
