import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "صفر لـواحد — منصة إدارة المحتوى",
  description: "منصة إدارة المحتوى لفريق الكتابة — صفر لـواحد",
};

// Strict allowlist for the theme bootstrap script. Kept in sync with
// ThemeToggle's `Theme` type. Any other value lurking in localStorage
// (e.g. left over from earlier themes) falls back to editorial-dark.
const THEME_KEYS = ["editorial-dark", "editorial-light"] as const;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" data-theme="editorial-dark" suppressHydrationWarning>
      <head>
        {/* Preload one editorial weight per family so the default
            (editorial-dark) doesn't flash a Georgia fallback while the
            .otf files stream in. as=font + crossOrigin is required by
            Chromium for the preloaded asset to be used. */}
        <link rel="preload" href="/fonts/EditorialSerif-Bold.otf"   as="font" type="font/otf" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/EditorialText-Regular.otf" as="font" type="font/otf" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/EditorialSans-Medium.otf"  as="font" type="font/otf" crossOrigin="anonymous" />
        {/* Bootstrap the saved theme synchronously to avoid a flash on
            first paint. Only the two editorial keys are honored — any
            stale value from an earlier theme falls back to the default. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var v=${JSON.stringify(THEME_KEYS)};var t=localStorage.getItem('zto-theme');if(t&&v.indexOf(t)!==-1){document.documentElement.setAttribute('data-theme',t);}}catch(_){}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
