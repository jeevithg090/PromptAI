import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prompt library",
  description: "Browse and reuse community prompts.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
