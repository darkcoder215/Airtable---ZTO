import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZTO - نظام إدارة المحتوى",
  description: "نظام إدارة المحتوى لفريق الكتابة - Zero to One",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
