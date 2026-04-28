import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scarlett's Spells",
  description: "A calm, elegant spelling companion for parents and children.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="brand-body min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
