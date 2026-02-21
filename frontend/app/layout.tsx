import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LkSGCompass",
  description: "LkSG supplier risk & BAFA reporting SaaS"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
