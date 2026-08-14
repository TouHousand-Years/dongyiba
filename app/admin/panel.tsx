"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  applyCatalogMutation,
  copyCatalog,
  createPlayerCatalog,
  deletePlayerCatalog,
  formatMultiValueText,
  loadCatalogLibrary,
  loadLocalCatalog,
  renamePlayerCatalog,
  selectEditCatalog,
  updatePlayerCatalog,
  type CatalogLibrary,
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
  exact: "完全匹配",
  "exact-close": "完全+接近匹配",
  ordered: "有序数值",
  category: "按类匹配",
  "exact-multi": "完全匹配（多标签）",
  "category-multi": "按类匹配（多标签）",
};

function isMultiTag(kind: TagKind) {
  return kind === "exact-multi" || kind === "category-multi";
}

export function AdminPanel() {
  const [library, setLibrary] = useState<CatalogLibrary>({ catalogs: [], playCatalogId: "", editCatalogId: "" });
  const [catalog, setCatalog] = useState<LocalCatalog>({ tags: [], characters: [], values: [] });
  const [tagDraft, setTagDraft] = useState<TagDraft>(emptyTag);
  const [characterDraft, setCharacterDraft] = useState<CharacterDraft>(emptyCharacter);
  const [notice, setNotice] = useState("正在读取题库……");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [csvPreview, setCsvPreview] = useState<CatalogCsvPreview | null>(null);
  const [csvFilename, setCsvFilename] = useState("");
  const [editorMode, setEditorMode] = useState<"structured" | "csv">("structured");
  const [csvText, setCsvText] = useState("");
  const [showCreateCatalog, setShowCreateCatalog] = useState(false);
  const [newCatalogName, setNewCatalogName] = useState("我的题库");
  const [officialCopyId, setOfficialCopyId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function refresh(message?: string) {
    const nextLibrary = loadCatalogLibrary();
    const editing = nextLibrary.catalogs.find((item) => item.id === nextLibrary.editCatalogId);
    const data = editing?.catalog ?? loadLocalCatalog();
    setLibrary(nextLibrary);
    setCatalog(data);
    setCsvText(exportCatalogCsv(data));
    setNotice(message ?? `题库已载入 ${data.characters.length} 位角色、${data.tags.length} 个标签。`);
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
      updatePlayerCatalog(library.editCatalogId, next);
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

  function resetDrafts() {
    setTagDraft({ ...emptyTag });
    setCharacterDraft({ ...emptyCharacter, values: {}, categories: {}, multiValues: {} });
    setCsvPreview(null);
    setCsvFilename("");
    if (fileInput.current) fileInput.current.value = "";
  }

  function openCatalog(catalogId: string, official: boolean) {
    selectEditCatalog(catalogId);
    resetDrafts();
    setEditorMode("structured");
    refresh(official ? "正在预览官方题库。" : "已切换编辑题库。");
  }

  function confirmOfficialCopy() {
    if (!officialCopyId) return;
    const selected = copyCatalog(officialCopyId);
    setOfficialCopyId(null);
    resetDrafts();
    setEditorMode("structured");
    refresh(`已创建“${selected.name}”，正在编辑该副本。`);
  }

  function createCatalog(event: FormEvent) {
    event.preventDefault();
    const name = newCatalogName.trim();
    if (!name) return;
    createPlayerCatalog(name);
    resetDrafts();
    setEditorMode("structured");
    setShowCreateCatalog(false);
    setNewCatalogName("我的题库");
    refresh(`已创建“${name}”。`);
  }

  function duplicate(catalogId: string) {
    const created = copyCatalog(catalogId);
    resetDrafts();
    refresh(`已创建“${created.name}”。`);
  }

  function renameCatalog(catalogId: string, currentName: string) {
    const name = window.prompt("题库名称", currentName)?.trim();
    if (!name || name === currentName) return;
    renamePlayerCatalog(catalogId, name);
    refresh(`题库已重命名为“${name}”。`);
  }

  function removeCatalog(catalogId: string, name: string) {
    if (!window.confirm(`删除题库“${name}”？此操作无法撤销。`)) return;
    deletePlayerCatalog(catalogId);
    resetDrafts();
    refresh("题库已删除。");
  }

  async function selectCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const preview = parseCatalogCsv(await file.text());
      setCsvPreview(preview);
      setCsvFilename(file.name);
      const same = hasSameCsvHeaders(catalog, preview);
      setNotice(`已读取 ${file.name}：${preview.rows.length} 位角色、${preview.tagNames.length} 个标签。${same ? "标签一致，可添加或替换。" : "标签名称不同，只能替换当前题库。"}`);
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
      updatePlayerCatalog(library.editCatalogId, next);
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

  function saveCsvText() {
    try {
      const preview = parseCatalogCsv(csvText);
      const next = importCatalogCsv(catalog, preview, "replace");
      updatePlayerCatalog(library.editCatalogId, next);
      setCatalog(next);
      setCsvText(exportCatalogCsv(next));
      setNotice(`CSV 文档已保存，共 ${next.characters.length} 位角色、${next.tags.length} 个标签。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "CSV 文档保存失败。");
    }
  }

  const editingCatalog = library.catalogs.find((item) => item.id === library.editCatalogId);
  const officialTable = useMemo(
    () => editingCatalog?.official
      ? parseCatalogCsv(exportCatalogCsv(editingCatalog.catalog))
      : null,
    [editingCatalog],
  );

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
          <a href="../">返回游戏</a>
        </div>
      </header>

      <p className="admin-notice" role="status">{notice}</p>

      <section className="admin-card catalog-manager">
        <div className="section-title">
          <div><span>LIB</span><h2>题库管理</h2></div>
          <button className="admin-primary" onClick={() => setShowCreateCatalog(true)}>＋ 新建题库</button>
        </div>
        <p className="admin-hint">点击玩家题库即可编辑；点击官方题库可先预览内容。</p>
        <div className="catalog-list">
          {library.catalogs.map((item) => (
            <article
              className={`${item.official ? "official" : "player"} ${library.editCatalogId === item.id ? "selected" : ""}`}
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => openCatalog(item.id, item.official)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openCatalog(item.id, item.official);
                }
              }}
            >
              <div>
                <span className="catalog-source">{item.official ? "官方" : "玩家"}</span>
                <h3>{item.name}</h3>
                <p>{item.catalog.characters.length} 位角色 · {item.catalog.tags.length} 个标签</p>
              </div>
              <div className="catalog-badges">
                {library.editCatalogId === item.id && <b>{item.official ? "预览中" : "编辑中"}</b>}
              </div>
              <div className="catalog-actions">
                <button onClick={(event) => { event.stopPropagation(); duplicate(item.id); }}>复制</button>
                {!item.official && <button onClick={(event) => { event.stopPropagation(); renameCatalog(item.id, item.name); }}>重命名</button>}
                {!item.official && <button className="danger" onClick={(event) => { event.stopPropagation(); removeCatalog(item.id, item.name); }}>删除</button>}
              </div>
            </article>
          ))}
        </div>
      </section>

      {editingCatalog?.official ? (
        <section className="admin-card official-readonly">
          <div className="section-title">
            <div><span>VIEW</span><h2>预览：{editingCatalog.name}</h2></div>
            <button className="admin-primary" onClick={() => setOfficialCopyId(editingCatalog.id)}>创建副本并编辑</button>
          </div>
          <p>官方题库为只读，编辑时会创建玩家副本。</p>
          {officialTable && (
            <div className="official-csv-table-wrap">
              <table className="official-csv-table">
                <caption>{editingCatalog.name} · {officialTable.rows.length} 位角色</caption>
                <thead>
                  <tr>{officialTable.headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr>
                </thead>
                <tbody>
                  {officialTable.rows.map((row) => (
                    <tr key={row[0]}>
                      {row.map((cell, index) => index === 0
                        ? <th key={officialTable.headers[index]} scope="row">{cell}</th>
                        : <td key={officialTable.headers[index]}>{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : editingCatalog ? <>

      <section className="admin-card editor-heading">
        <div className="section-title">
          <div><span>EDIT</span><h2>编辑：{editingCatalog.name}</h2></div>
          <div className="editor-mode-switch" aria-label="题库编辑模式">
            <button className={editorMode === "structured" ? "active" : ""} onClick={() => setEditorMode("structured")}>表单编辑</button>
            <button className={editorMode === "csv" ? "active" : ""} onClick={() => { setCsvText(exportCatalogCsv(catalog)); setEditorMode("csv"); }}>CSV 文档</button>
          </div>
        </div>
      </section>

      {editorMode === "csv" ? (
        <section className="admin-card csv-document-card">
          <p className="admin-hint">直接编辑完整 CSV；保存时会校验表头、标签类型和角色数据。</p>
          <textarea aria-label="CSV 文档内容" value={csvText} onChange={(event) => setCsvText(event.target.value)} spellCheck={false} />
          <div className="csv-document-actions">
            <button onClick={() => setCsvText(exportCatalogCsv(catalog))}>放弃文本修改</button>
            <button className="admin-primary" onClick={saveCsvText}>保存 CSV 文档</button>
          </div>
        </section>
      ) : <>

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
                <option value="exact-close">完全+接近匹配</option>
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
                        : "每行一个：大类 > 小类\n也可只填写大类（小类视为空）"}
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
                    placeholder={tag.kind === "category"
                      ? "小类"
                      : tag.kind === "exact-close"
                        ? "标签1 > 标签2 | 标签3"
                        : tag.unit ? `数值（${tag.unit}）` : "标签值"}
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
      </>}
      </> : null}

      {showCreateCatalog && (
        <div className="modal-backdrop" onClick={() => setShowCreateCatalog(false)}>
          <section className="help-modal catalog-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-catalog-title" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" aria-label="关闭" onClick={() => setShowCreateCatalog(false)}>×</button>
            <p className="eyebrow">New archive</p>
            <h2 id="create-catalog-title">新建题库</h2>
            <p>为新题库取一个容易辨认的名字，创建后会直接进入编辑。</p>
            <form onSubmit={createCatalog}>
              <label htmlFor="new-catalog-name">题库名称</label>
              <input
                id="new-catalog-name"
                value={newCatalogName}
                onChange={(event) => setNewCatalogName(event.target.value)}
                autoFocus
                required
              />
              <div>
                <button type="button" onClick={() => setShowCreateCatalog(false)}>取消</button>
                <button className="admin-primary" disabled={!newCatalogName.trim()}>创建题库</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {officialCopyId && (
        <div className="modal-backdrop" onClick={() => setOfficialCopyId(null)}>
          <section className="help-modal catalog-copy-modal" role="dialog" aria-modal="true" aria-labelledby="copy-official-title" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" aria-label="关闭" onClick={() => setOfficialCopyId(null)}>×</button>
            <p className="eyebrow">Official archive</p>
            <h2 id="copy-official-title">创建副本后编辑？</h2>
            <p>官方题库不能直接修改。继续后将创建一个玩家副本，之后的修改只会保存到副本中。</p>
            <div className="catalog-modal-actions">
              <button onClick={() => setOfficialCopyId(null)}>取消</button>
              <button className="admin-primary" onClick={confirmOfficialCopy}>创建副本并编辑</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
