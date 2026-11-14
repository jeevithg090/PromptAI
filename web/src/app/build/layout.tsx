import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Build a prompt",
  description: "Turn a rough idea into a platform-tailored, scored prompt.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
