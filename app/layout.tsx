import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "东一把｜猜东方 Project 角色",
  description: "用八次机会猜出今天的东方 Project 角色。",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "东一把",
    description: "猜东方 Project 角色小游戏。",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "东一把" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "东一把",
    description: "猜东方 Project 角色小游戏。",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
