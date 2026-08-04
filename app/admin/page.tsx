import type { Metadata } from "next";
import { AdminPanel } from "./panel";

export const metadata: Metadata = {
  title: "内容后台｜东方一把",
  description: "在本地浏览器管理东方一把的角色、别名和判定标签。",
};

export default function AdminPage() {
  return <AdminPanel />;
}
