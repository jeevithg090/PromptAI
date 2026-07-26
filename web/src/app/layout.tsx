import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { LayoutClient } from "@/components/LayoutClient";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600", "700"], display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-code", display: "swap" });

export const metadata: Metadata = {
  title: "PromptForge — Forge great AI prompts",
  description: "Turn rough ideas into excellent, platform-tailored prompts for Midjourney, ChatGPT, Claude, Gemini, and more.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "PromptForge", statusBarStyle: "default" },
};

export const viewport = {
  themeColor: "#d9480f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-paper text-ink antialiased">
        <LayoutClient>{children}</LayoutClient>
      </body>
    </html>
  );
}