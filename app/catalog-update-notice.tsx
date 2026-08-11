"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_CATALOG_GITHUB_URL,
  hasDefaultCatalogUpdate,
} from "./default-catalog-update";

export function CatalogUpdateNotice() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    void hasDefaultCatalogUpdate((input, init) => fetch(input, {
      ...init,
      signal: controller.signal,
    }))
      .then((available) => {
        if (available) setUpdateAvailable(true);
      })
      .catch(() => {
        // Update checks are best-effort and must never prevent local play.
      });

    return () => controller.abort();
  }, []);

  if (!updateAvailable) return null;

  return (
    <aside className="catalog-update-notice" role="alert">
      <div>
        <strong>默认题库有更新</strong>
        <span>GitHub 上已有新版题库，可查看后更新本地版本。</span>
      </div>
      <a href={DEFAULT_CATALOG_GITHUB_URL} target="_blank" rel="noreferrer">查看更新</a>
      <button type="button" aria-label="关闭题库更新提醒" onClick={() => setUpdateAvailable(false)}>×</button>
    </aside>
  );
}
