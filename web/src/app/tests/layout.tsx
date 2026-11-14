import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prompt tests",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
