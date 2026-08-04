"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  applyCatalogMutation,
  formatMultiValueText,
  loadLocalCatalog,
  resetLocalCatalog,
  saveLocalCatalog,
  type CatalogMutation,
  type LocalCatalog,
  type LocalCharacter,
  type LocalTag,
} from "../local-catalog";
import type { TagKind } from "../game-core";
import {
  exportCatalogCsv,
  hasSameCsvHeaders,
  importCatalogCsv,
  parseCatalogCsv,
  type CatalogCsvPreview,
} from "../catalog-csv";

type TagDraft = {
  id?: number;
  name: string;
  kind: TagKind;
  unit: string;
  active: boolean;
};

type CharacterDraft = {
  id?: number;
  name: string;
  aliases: string;
  active: boolean;
  values: Record<string, string>;
  categories: Record<string, string>;
  multiValues: Record<string, string>;
};

const emptyTag: TagDraft = { name: "", kind: "exact", unit: "", active: true };
const emptyCharacter: CharacterDraft = { name: "", aliases: "", active: true, values: {}, categories: {}, multiValues: {} };

const tagKindLabels: Record<TagKind, string> = {
  exact: "精确匹配",
  ordered: "有序数值",
  category: "按类匹配",
  "exact-multi": "完全匹配（多标签）",
  "category-multi": "按类匹配（多标签）",
};

function isMultiTag(kind: TagKind) {
  return kind === "exact-multi" || kind === "category-multi";
}

export function AdminPanel() {
  const [catalog, setCatalog] = useState<LocalCatalog>({ tags: [], characters: [], values: [] });
  const [tagDraft, setTagDraft] = useState<TagDraft>(emptyTag);
  const [characterDraft, setCharacterDraft] = useState<CharacterDraft>(emptyCharacter);
  const [notice, setNotice] = useState("正在读取题库……");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [csvPreview, setCsvPreview] = useState<CatalogCsvPreview | null>(null);
  const [csvFilename, setCsvFilename] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function refresh() {
    const data = loadLocalCatalog();
    setCatalog(data);
    setNotice(`题库已载入 ${data.characters.length} 位角色、${data.tags.length} 个标签。`);
  }

  useEffect(() => {
    // Initial data loading intentionally hydrates this client-only admin panel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, []);

  function mutate(payload: CatalogMutation, success: string): boolean {
    setBusy(true);
    try {
      const next = applyCatalogMutation(catalog, payload);
      saveLocalCatalog(next);
      setCatalog(next);
      setNotice(success);
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "操作失败。");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function saveTag(event: FormEvent) {
    event.preventDefault();
    const saved = mutate({ action: "saveTag", ...tagDraft }, tagDraft.id ? "标签已更新。" : "新标签已加入。");
    if (saved) setTagDraft({ ...emptyTag });
  }

  function editCharacter(character: LocalCharacter) {
    const characterValues = catalog.values.filter((item) => item.characterId === character.id);
    const values = Object.fromEntries(characterValues.map((item) => [String(item.tagId), item.value]));
    const categories = Object.fromEntries(
      characterValues
        .filter((item) => item.category)
        .map((item) => [String(item.tagId), item.category ?? ""]),
    );
    const multiValues = Object.fromEntries(
      characterValues
        .filter((item) => {
          const kind = catalog.tags.find((tag) => tag.id === item.tagId)?.kind;
          return kind === "exact-multi" || kind === "category-multi";
        })
        .map((item) => [
          String(item.tagId),
          formatMultiValueText(item.entries ?? [{ value: item.value, ...(item.category ? { category: item.category } : {}) }]),
        ]),
    );
    setCharacterDraft({
      id: character.id,
      name: character.name,
      aliases: character.aliases.join("、"),
      active: character.active,
      values,
      categories,
      multiValues,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function saveCharacter(event: FormEvent) {
    event.preventDefault();
    const saved = mutate({
      action: "saveCharacter",
      ...characterDraft,
      aliases: characterDraft.aliases.split(/[、,，]/),
    }, characterDraft.id ? "角色资料已更新。" : "新角色已加入题库。");
    if (saved) setCharacterDraft({ ...emptyCharacter, values: {}, categories: {}, multiValues: {} });
  }

  function restoreDefaults() {
    if (!window.confirm("恢复默认题库会覆盖当前编辑，确定继续吗？")) return;
    const next = resetLocalCatalog();
    setCatalog(next);
    setTagDraft({ ...emptyTag });
    setCharacterDraft({ ...emptyCharacter, values: {}, categories: {}, multiValues: {} });
    setNotice("默认题库已恢复。");
  }

  async function selectCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const preview = parseCatalogCsv(await file.text());
      setCsvPreview(preview);
      setCsvFilename(file.name);
      const same = hasSameCsvHeaders(catalog, preview);
      setNotice(`已读取 ${file.name}：${preview.rows.length} 位角色、${preview.tagNames.length} 个标签。${same ? "表头一致，可添加或替换。" : "表头不同，只能替换当前题库。"}`);
    } catch (error) {
      setCsvPreview(null);
      setCsvFilename("");
      setNotice(error instanceof Error ? error.message : "CSV 读取失败。");
    }
  }

  function importCsv(mode: "append" | "replace") {
    if (!csvPreview) return;
    if (mode === "replace" && !window.confirm("替换会覆盖当前全部标签和角色，确定继续吗？")) return;
    try {
      const next = importCatalogCsv(catalog, csvPreview, mode);
      saveLocalCatalog(next);
      setCatalog(next);
      setCsvPreview(null);
      setCsvFilename("");
      if (fileInput.current) fileInput.current.value = "";
      setNotice(mode === "append" ? `已从 CSV 添加 ${csvPreview.rows.length} 位角色。` : `已用 CSV 替换题库，共 ${csvPreview.rows.length} 位角色。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "CSV 导入失败。");
    }
  }

  function exportCsv() {
    const blob = new Blob([exportCatalogCsv(catalog)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `东一把题库-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice(`已导出 ${catalog.characters.length} 位角色的 CSV 文件。`);
  }

  const filtered = useMemo(
    () => catalog.characters.filter((item) => item.name.includes(search.trim())),
    [catalog.characters, search],
  );

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Gensokyo archive</p>
          <h1>内容后台</h1>
          <p>维护角色、别名和每一列判定标签。</p>
        </div>
        <div className="admin-actions">
          <button className="admin-reset" onClick={restoreDefaults}>恢复默认题库</button>
          <Link href="/">返回游戏</Link>
        </div>
      </header>

      <p className="admin-notice" role="status">{notice}</p>

      <section className="admin-card csv-card">
        <div className="section-title">
          <div><span>CSV</span><h2>导入与导出</h2></div>
          <button onClick={exportCsv}>导出当前题库</button>
        </div>
        <div className="csv-tools">
          <label className="csv-picker">
            <span>选择 CSV 文件</span>
            <input ref={fileInput} type="file" accept=".csv,text/csv" onChange={selectCsv} />
          </label>
          <p>{csvFilename || "表头格式：角色名、别名、启用，后续每列为“标签名（类型：类型代码）”。"}</p>
          {csvPreview && (
            <div className="csv-import-actions">
              <button
                className="admin-primary"
                disabled={!hasSameCsvHeaders(catalog, csvPreview)}
                onClick={() => importCsv("append")}
              >添加到当前题库</button>
              <button className="admin-replace" onClick={() => importCsv("replace")}>替换当前题库</button>
            </div>
          )}
        </div>
      </section>

      <div className="admin-grid">
        <section className="admin-card">
          <div className="section-title">
            <div><span>01</span><h2>判定标签</h2></div>
            <button onClick={() => setTagDraft({ ...emptyTag })}>＋ 新标签</button>
          </div>
          <p className="admin-hint">标签按名称首字自动排序。</p>
          <form className="admin-form compact" onSubmit={saveTag}>
            <label>标签名称<input value={tagDraft.name} onChange={(event) => setTagDraft({ ...tagDraft, name: event.target.value })} placeholder="例如：瞳色" required /></label>
            <label>判定方式
              <select value={tagDraft.kind} onChange={(event) => setTagDraft({ ...tagDraft, kind: event.target.value as TagDraft["kind"] })}>
                <option value="ordered">有序数值（支持接近与箭头）</option>
                <option value="exact">完全匹配</option>
                <option value="category">按类匹配</option>
                <option value="exact-multi">完全匹配（多标签）</option>
                <option value="category-multi">按类匹配（多标签）</option>
              </select>
            </label>
            <label>单位<input value={tagDraft.unit} onChange={(event) => setTagDraft({ ...tagDraft, unit: event.target.value })} placeholder="可选，例如：年" /></label>
            <label className="check-label"><input type="checkbox" checked={tagDraft.active} onChange={(event) => setTagDraft({ ...tagDraft, active: event.target.checked })} />在游戏中显示</label>
            <button className="admin-primary" disabled={busy}>{tagDraft.id ? "保存修改" : "添加标签"}</button>
          </form>
          <div className="tag-list">
            {catalog.tags.map((tag: LocalTag) => (
              <div className="tag-row" key={tag.id}>
                <div><b>{tag.name}</b><small>{tagKindLabels[tag.kind]}{!tag.active && " · 已隐藏"}</small></div>
                <div>
                  <button onClick={() => setTagDraft({ id: tag.id, name: tag.name, kind: tag.kind, unit: tag.unit, active: tag.active })}>编辑</button>
                  <button className="danger" onClick={() => window.confirm(`删除标签“${tag.name}”？`) && mutate({ action: "deleteTag", id: tag.id }, "标签已删除。")}>删除</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-card">
          <div className="section-title">
            <div><span>02</span><h2>{characterDraft.id ? "编辑角色" : "添加角色"}</h2></div>
            {characterDraft.id && <button onClick={() => setCharacterDraft({ ...emptyCharacter, values: {}, categories: {}, multiValues: {} })}>退出编辑</button>}
          </div>
          <form className="admin-form" onSubmit={saveCharacter}>
            <label>角色名<input value={characterDraft.name} onChange={(event) => setCharacterDraft({ ...characterDraft, name: event.target.value })} placeholder="完整角色名" required /></label>
            <label>可接受的别名<input value={characterDraft.aliases} onChange={(event) => setCharacterDraft({ ...characterDraft, aliases: event.target.value })} placeholder="用顿号分隔，例如：大小姐、蕾咪" /></label>
            <div className="value-grid">
              {catalog.tags.map((tag) => (
                <label key={tag.id}>{tag.name}
                  {isMultiTag(tag.kind) ? (
                    <textarea
                      rows={3}
                      value={characterDraft.multiValues[String(tag.id)] ?? ""}
                      onChange={(event) => setCharacterDraft({
                        ...characterDraft,
                        multiValues: { ...characterDraft.multiValues, [String(tag.id)]: event.target.value },
                      })}
                      placeholder={tag.kind === "exact-multi"
                        ? "每行一个标签值"
                        : "每行一个：大类 > 小类"}
                    />
                  ) : <>
                  {tag.kind === "category" && (
                    <input
                      type="text"
                      value={characterDraft.categories[String(tag.id)] ?? ""}
                      onChange={(event) => setCharacterDraft({
                        ...characterDraft,
                        categories: { ...characterDraft.categories, [String(tag.id)]: event.target.value },
                      })}
                      placeholder="大类"
                    />
                  )}
                  <input
                    type={tag.kind === "ordered" ? "number" : "text"}
                    value={characterDraft.values[String(tag.id)] ?? ""}
                    onChange={(event) => setCharacterDraft({
                      ...characterDraft,
                      values: { ...characterDraft.values, [String(tag.id)]: event.target.value },
                    })}
                    placeholder={tag.kind === "category" ? "小类" : tag.unit ? `数值（${tag.unit}）` : "标签值"}
                  />
                  </>}
                </label>
              ))}
            </div>
            <label className="check-label"><input type="checkbox" checked={characterDraft.active} onChange={(event) => setCharacterDraft({ ...characterDraft, active: event.target.checked })} />加入可猜题库</label>
            <button className="admin-primary" disabled={busy}>{characterDraft.id ? "保存角色资料" : "添加到题库"}</button>
          </form>
        </section>
      </div>

      <section className="admin-card roster">
        <div className="section-title">
          <div><span>03</span><h2>角色题库</h2></div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索角色" />
        </div>
        <div className="character-list">
          {filtered.map((character: LocalCharacter) => (
            <article key={character.id}>
              <div className="avatar-mark">{character.name.slice(0, 1)}</div>
              <div>
                <h3>{character.name}</h3>
                <p>{character.aliases.join(" / ") || "暂无别名"}{!character.active && " · 已停用"}</p>
              </div>
              <button onClick={() => editCharacter(character)}>编辑</button>
              <button className="danger" onClick={() => window.confirm(`删除角色“${character.name}”？`) && mutate({ action: "deleteCharacter", id: character.id }, "角色已删除。")}>删除</button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
