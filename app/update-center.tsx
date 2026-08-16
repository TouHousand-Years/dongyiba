"use client";

import { useEffect, useState } from "react";
import {
  APP_GITHUB_URL,
  checkForAppUpdate,
  DISPLAY_VERSION,
} from "./app-update";
import {
  DEFAULT_CATALOG_VERSION,
  OFFICIAL_CATALOG_GITHUB_URL,
  hasOfficialCatalogUpdate,
} from "./default-catalog-update";

type CheckState = "idle" | "checking" | "latest" | "available" | "error";

export function UpdateCenter() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [noticeVisible, setNoticeVisible] = useState(true);
  const [appState, setAppState] = useState<CheckState>("checking");
  const [catalogState, setCatalogState] = useState<CheckState>("checking");
  const [latestVersion, setLatestVersion] = useState("");

  async function checkAppVersion(manual = false, signal?: AbortSignal) {
    if (manual) setAppState("checking");
    try {
      const result = await checkForAppUpdate((input, init) => fetch(input, { ...init, signal }));
      setLatestVersion(result.latestVersion);
      setAppState(result.updateAvailable ? "available" : "latest");
      if (result.updateAvailable) setNoticeVisible(true);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setAppState("error");
    }
  }

  async function checkCatalog(manual = false, signal?: AbortSignal) {
    if (manual) setCatalogState("checking");
    try {
      const available = await hasOfficialCatalogUpdate((input, init) => fetch(input, { ...init, signal }));
      setCatalogState(available ? "available" : "latest");
      if (available) setNoticeVisible(true);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setCatalogState("error");
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    // These async checks intentionally populate update state after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void checkAppVersion(false, controller.signal);
    void checkCatalog(false, controller.signal);
    return () => controller.abort();
  }, []);

  const hasAppUpdate = appState === "available";
  const hasCatalogUpdate = catalogState === "available";
  const showNotice = noticeVisible && (hasAppUpdate || hasCatalogUpdate);

  return (
    <>
      {showNotice && (
        <aside className="update-notice" role="alert">
          <div>
            <strong>{hasAppUpdate && hasCatalogUpdate ? "应用和官方题库都有更新" : hasAppUpdate ? `发现新版本 v${latestVersion}` : "官方题库有更新"}</strong>
            <span>打开更新中心查看详情。</span>
          </div>
          <button type="button" className="update-notice-action" onClick={() => setPanelOpen(true)}>查看</button>
          <button type="button" className="update-notice-close" aria-label="关闭更新提醒" onClick={() => setNoticeVisible(false)}>×</button>
        </aside>
      )}

      <button type="button" className="version-badge" onClick={() => setPanelOpen(true)} aria-label={`打开更新中心，当前版本 ${DISPLAY_VERSION}`}>
        {DISPLAY_VERSION}
      </button>

      {panelOpen && (
        <div className="update-backdrop" onClick={() => setPanelOpen(false)}>
          <section className="update-panel" role="dialog" aria-modal="true" aria-labelledby="update-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="update-panel-close" aria-label="关闭更新中心" onClick={() => setPanelOpen(false)}>×</button>
            <p className="eyebrow">Update center</p>
            <h2 id="update-title">更新中心</h2>
            <p className="current-version">当前版本 <strong>{DISPLAY_VERSION}</strong></p>

            <UpdateRow
              title="应用版本"
              state={appState}
              availableText={`发现新版本 v${latestVersion}`}
              onCheck={() => void checkAppVersion(true)}
              updateUrl={APP_GITHUB_URL}
            />
            <UpdateRow
              title="官方题库"
              version={`当前题库基线 ${DEFAULT_CATALOG_VERSION}`}
              state={catalogState}
              availableText="GitHub 上有新版官方题库"
              onCheck={() => void checkCatalog(true)}
              updateUrl={OFFICIAL_CATALOG_GITHUB_URL}
            />
          </section>
        </div>
      )}
    </>
  );
}

function UpdateRow({
  title,
  version,
  state,
  availableText,
  onCheck,
  updateUrl,
}: {
  title: string;
  version?: string;
  state: CheckState;
  availableText: string;
  onCheck: () => void;
  updateUrl: string;
}) {
  const statusText = state === "checking"
    ? "正在检查……"
    : state === "latest"
      ? "已是最新"
      : state === "available"
        ? availableText
        : state === "error"
          ? "检查失败，请稍后重试"
          : "尚未检查";

  return (
    <div className="update-row">
      <div>
        <strong>{title}</strong>
        {version && <small className="update-row-version">{version}</small>}
        <span data-state={state}>{statusText}</span>
      </div>
      <div className="update-row-actions">
        <button type="button" disabled={state === "checking"} onClick={onCheck}>手动检查</button>
        {state === "available" && <a href={updateUrl} target="_blank" rel="noreferrer">查看更新</a>}
      </div>
    </div>
  );
}
