"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Tag = { id: number; name: string; kind: "exact" | "ordered"; unit: string; sort_order: number; active: number };
type Character = { id: number; name: string; aliases: string; active: number };
type Value = { character_id: number; tag_id: number; value: string };
type Catalog = { tags: Tag[]; characters: Character[]; values: Value[] };
type TagDraft = { id?: number; name: string; kind: "exact" | "ordered"; unit: string; sortOrder: number; active: boolean };
type CharacterDraft = { id?: number; name: string; aliases: string; active: boolean; values: Record<string, string> };

const emptyTag: TagDraft = { name: "", kind: "exact", unit: "", sortOrder: 60, active: true };
const emptyCharacter: CharacterDraft = { name: "", aliases: "", active: true, values: {} };

export function AdminPanel() {
  const [catalog, setCatalog] = useState<Catalog>({ tags: [], characters: [], values: [] });
  const [tagDraft, setTagDraft] = useState<TagDraft>(emptyTag);
  const [characterDraft, setCharacterDraft] = useState<CharacterDraft>(emptyCharacter);
  const [notice, setNotice] = useState("正在读取题库……");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  async function refresh() {
    const response = await fetch("/api/admin");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setCatalog(data);
    setNotice(`已载入 ${data.characters.length} 位角色、${data.tags.length} 个标签。`);
  }

  useEffect(() => {
    // Initial data loading intentionally hydrates this client-only admin panel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh().catch(() => setNotice("题库读取失败。"));
  }, []);

  async function mutate(payload: object, success: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await refresh();
      setNotice(success);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "操作失败。");
    } finally {
      setBusy(false);
    }
  }

  async function saveTag(event: FormEvent) {
    event.preventDefault();
    await mutate({ action: "saveTag", ...tagDraft }, tagDraft.id ? "标签已更新。" : "新标签已加入。");
    setTagDraft(emptyTag);
  }

  function editCharacter(character: Character) {
    const values = Object.fromEntries(
      catalog.values.filter((item) => item.character_id === character.id).map((item) => [String(item.tag_id), item.value]),
    );
    setCharacterDraft({
      id: character.id,
      name: character.name,
      aliases: (JSON.parse(character.aliases) as string[]).join("、"),
      active: Boolean(character.active),
      values,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveCharacter(event: FormEvent) {
    event.preventDefault();
    await mutate({
      action: "saveCharacter",
      ...characterDraft,
      aliases: characterDraft.aliases.split(/[、,，]/),
    }, characterDraft.id ? "角色资料已更新。" : "新角色已加入题库。");
    setCharacterDraft(emptyCharacter);
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
        <Link href="/">返回游戏</Link>
      </header>

      <p className="admin-notice" role="status">{notice}</p>

      <div className="admin-grid">
        <section className="admin-card">
          <div className="section-title">
            <div><span>01</span><h2>判定标签</h2></div>
            <button onClick={() => setTagDraft(emptyTag)}>＋ 新标签</button>
          </div>
          <form className="admin-form compact" onSubmit={saveTag}>
            <label>标签名称<input value={tagDraft.name} onChange={(event) => setTagDraft({ ...tagDraft, name: event.target.value })} placeholder="例如：瞳色" required /></label>
            <label>判定方式
              <select value={tagDraft.kind} onChange={(event) => setTagDraft({ ...tagDraft, kind: event.target.value as TagDraft["kind"] })}>
                <option value="exact">文本完全一致</option>
                <option value="ordered">有序数值（支持接近与箭头）</option>
              </select>
            </label>
            <label>单位<input value={tagDraft.unit} onChange={(event) => setTagDraft({ ...tagDraft, unit: event.target.value })} placeholder="可选，例如：年" /></label>
            <label>排序<input type="number" value={tagDraft.sortOrder} onChange={(event) => setTagDraft({ ...tagDraft, sortOrder: Number(event.target.value) })} /></label>
            <label className="check-label"><input type="checkbox" checked={tagDraft.active} onChange={(event) => setTagDraft({ ...tagDraft, active: event.target.checked })} />在游戏中显示</label>
            <button className="admin-primary" disabled={busy}>{tagDraft.id ? "保存修改" : "添加标签"}</button>
          </form>
          <div className="tag-list">
            {catalog.tags.map((tag) => (
              <div className="tag-row" key={tag.id}>
                <div><b>{tag.name}</b><small>{tag.kind === "ordered" ? "有序数值" : "精确匹配"} · 排序 {tag.sort_order}{!tag.active && " · 已隐藏"}</small></div>
                <div>
                  <button onClick={() => setTagDraft({ id: tag.id, name: tag.name, kind: tag.kind, unit: tag.unit, sortOrder: tag.sort_order, active: Boolean(tag.active) })}>编辑</button>
                  <button className="danger" onClick={() => confirm(`删除标签“${tag.name}”？`) && void mutate({ action: "deleteTag", id: tag.id }, "标签已删除。")}>删除</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-card">
          <div className="section-title">
            <div><span>02</span><h2>{characterDraft.id ? "编辑角色" : "添加角色"}</h2></div>
            {characterDraft.id && <button onClick={() => setCharacterDraft(emptyCharacter)}>退出编辑</button>}
          </div>
          <form className="admin-form" onSubmit={saveCharacter}>
            <label>角色名<input value={characterDraft.name} onChange={(event) => setCharacterDraft({ ...characterDraft, name: event.target.value })} placeholder="完整角色名" required /></label>
            <label>可接受的别名<input value={characterDraft.aliases} onChange={(event) => setCharacterDraft({ ...characterDraft, aliases: event.target.value })} placeholder="用顿号分隔，例如：大小姐、蕾咪" /></label>
            <div className="value-grid">
              {catalog.tags.map((tag) => (
                <label key={tag.id}>{tag.name}
                  <input
                    type={tag.kind === "ordered" ? "number" : "text"}
                    value={characterDraft.values[String(tag.id)] ?? ""}
                    onChange={(event) => setCharacterDraft({
                      ...characterDraft,
                      values: { ...characterDraft.values, [String(tag.id)]: event.target.value },
                    })}
                    placeholder={tag.unit ? `数值（${tag.unit}）` : "标签值"}
                  />
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
          {filtered.map((character) => (
            <article key={character.id}>
              <div className="avatar-mark">{character.name.slice(0, 1)}</div>
              <div>
                <h3>{character.name}</h3>
                <p>{(JSON.parse(character.aliases) as string[]).join(" / ") || "暂无别名"}{!character.active && " · 已停用"}</p>
              </div>
              <button onClick={() => editCharacter(character)}>编辑</button>
              <button className="danger" onClick={() => confirm(`删除角色“${character.name}”？`) && void mutate({ action: "deleteCharacter", id: character.id }, "角色已删除。")}>删除</button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
