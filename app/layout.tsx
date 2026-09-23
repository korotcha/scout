import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Market Radar — поиск товаров WB",
  description: "Загрузка, проверка и первичный скрининг предметов и запросов Wildberries.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
