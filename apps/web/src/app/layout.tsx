import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const tagline = "Built on Trust. Powered by Operations.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Revora",
    template: "%s · Revora",
  },
  description: tagline,
  applicationName: "Revora",
  appleWebApp: {
    capable: true,
    title: "Revora",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    type: "website",
    siteName: "Revora",
    title: "Revora",
    description: tagline,
  },
  twitter: {
    card: "summary_large_image",
    title: "Revora",
    description: tagline,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0B7A3F" },
    { media: "(prefers-color-scheme: dark)", color: "#14171C" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="antialiased">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
