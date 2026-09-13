import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Recur — Reconstruct the failure",
  description: "Capture the conditions. Recreate the bug. Prove the fix.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
