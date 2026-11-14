import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Download",
  description: "Desktop app and browser extensions.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
