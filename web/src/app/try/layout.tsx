import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Try it",
  description: "Run a live demo draft without an account.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
