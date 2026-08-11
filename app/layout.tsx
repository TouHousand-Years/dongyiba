import type { Metadata } from "next";
import "./globals.css";
import { CatalogUpdateNotice } from "./catalog-update-notice";

const publicAssetPrefix = process.env.GITHUB_PAGES === "true" ? "/dongyiba" : "";

export const metadata: Metadata = {
  title: "东一把｜猜东方 Project 角色",
  description: "用八次机会猜出今天的东方 Project 角色。",
  icons: {
    icon: `${publicAssetPrefix}/favicon.svg`,
    shortcut: `${publicAssetPrefix}/favicon.svg`,
  },
  openGraph: {
    title: "东一把",
    description: "猜东方 Project 角色小游戏。",
    type: "website",
    images: [{ url: `${publicAssetPrefix}/og.png`, width: 1200, height: 630, alt: "东一把" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "东一把",
    description: "猜东方 Project 角色小游戏。",
    images: [`${publicAssetPrefix}/og.png`],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <CatalogUpdateNotice />
        {children}
      </body>
    </html>
  );
}
