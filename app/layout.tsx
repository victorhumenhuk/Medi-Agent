import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mediation Room",
  description:
    "A body of desire. Five agents observe a shared space, self-select roles, and conduct a commercial mediation without a coordinator.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB">
      <body className="antialiased">{children}</body>
    </html>
  );
}
