import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Enhance a prompt",
  description: "Strengthen a prompt you already have.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
