import type { Metadata } from "next";
import "./globals.css";
import { LayoutClient } from "@/components/LayoutClient";

export const metadata: Metadata = {
  title: "PromptForge — Draft great AI prompts",
  description: "Turn rough ideas into excellent, platform-tailored prompts for Midjourney, ChatGPT, Claude, Gemini, and more.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        <LayoutClient>{children}</LayoutClient>
      </body>
    </html>
  );
}