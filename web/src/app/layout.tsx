import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { LayoutClient } from "@/components/LayoutClient";
import { themeInitScript } from "@/lib/theme";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600", "700"], display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-code", display: "swap" });

const description =
  "Turn rough ideas into excellent, platform-tailored prompts for Midjourney, ChatGPT, Claude, Gemini, and more.";

export const metadata: Metadata = {
  // Absolute base for Open Graph URLs. Set NEXT_PUBLIC_SITE_URL to the deployed origin.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: "PromptForge — Forge great AI prompts", template: "%s · PromptForge" },
  description,
  applicationName: "PromptForge",
  manifest: "/manifest.json",
  icons: { icon: "/favicon.ico", apple: "/icons/icon-192.png" },
  appleWebApp: { capable: true, title: "PromptForge", statusBarStyle: "default" },
  openGraph: {
    type: "website",
    siteName: "PromptForge",
    title: "PromptForge — Forge great AI prompts",
    description,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "PromptForge landing page" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "PromptForge — Forge great AI prompts",
    description,
    images: ["/og.png"],
  },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f6f1" },
    { media: "(prefers-color-scheme: dark)", color: "#14120e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-paper text-ink antialiased">
        <LayoutClient>{children}</LayoutClient>
      </body>
    </html>
  );
}