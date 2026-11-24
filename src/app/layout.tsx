import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexo Assist · Service desk de TI",
  description: "Agent de atendimento do service desk de TI da Nexo.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,200..800&family=Schibsted+Grotesk:wght@400..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
