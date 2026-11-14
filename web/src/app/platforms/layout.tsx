import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Platforms",
  description: "Supported AI platforms and their prompt rules.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
