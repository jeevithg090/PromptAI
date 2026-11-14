import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Teams",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
