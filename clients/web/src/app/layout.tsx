import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Discord Clone",
  description: "A production-grade Discord clone built with Rust & Next.js",
  themeColor: "#5865f2",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased bg-brand-900 text-brand-100`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
