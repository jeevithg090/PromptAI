import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Debug a prompt",
  description: "Diagnose why a prompt produced the wrong output.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
