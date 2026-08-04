import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  return {
    metadataBase: base,
    title: "东方一把｜猜东方 Project 角色",
    description: "用八次机会猜出今天的东方 Project 角色。",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "东方一把",
      description: "猜东方 Project 角色小游戏。",
      type: "website",
      images: [{ url: new URL("/og.png", base), width: 1200, height: 630, alt: "东方一把" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "东方一把",
      description: "猜东方 Project 角色小游戏。",
      images: [new URL("/og.png", base)],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
