import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Novel English Tutor",
  description: "Learn English by reading novels (MVP)"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

