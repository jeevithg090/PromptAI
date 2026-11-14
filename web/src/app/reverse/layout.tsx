import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reverse a prompt",
  description: "Recover a structured prompt from an output.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
