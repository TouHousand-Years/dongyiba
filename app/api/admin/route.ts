import { getGameDb, loadCatalog } from "../../../db/game-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const catalog = await loadCatalog();
    return Response.json(catalog);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      action?: string;
      id?: number;
      name?: string;
      kind?: string;
      unit?: string;
      sortOrder?: number;
      active?: boolean;
      aliases?: string[];
      values?: Record<string, string>;
    };
    const db = getGameDb();
    await loadCatalog(db);

    if (body.action === "saveTag") {
      const name = body.name?.trim();
      if (!name) return Response.json({ error: "标签名不能为空。" }, { status: 400 });
      const kind = body.kind === "ordered" ? "ordered" : "exact";
      if (body.id) {
        await db.prepare("UPDATE tags SET name = ?, kind = ?, unit = ?, sort_order = ?, active = ? WHERE id = ?")
          .bind(name, kind, body.unit?.trim() ?? "", Number(body.sortOrder) || 0, body.active === false ? 0 : 1, body.id).run();
      } else {
        await db.prepare("INSERT INTO tags (name, kind, unit, sort_order, active) VALUES (?, ?, ?, ?, ?)")
          .bind(name, kind, body.unit?.trim() ?? "", Number(body.sortOrder) || 0, body.active === false ? 0 : 1).run();
      }
      return Response.json({ ok: true });
    }

    if (body.action === "deleteTag" && body.id) {
      await db.prepare("DELETE FROM tags WHERE id = ?").bind(body.id).run();
      return Response.json({ ok: true });
    }

    if (body.action === "saveCharacter") {
      const name = body.name?.trim();
      if (!name) return Response.json({ error: "角色名不能为空。" }, { status: 400 });
      let characterId = body.id;
      const aliases = JSON.stringify((body.aliases ?? []).map((item) => item.trim()).filter(Boolean));
      if (characterId) {
        await db.prepare("UPDATE characters SET name = ?, aliases = ?, active = ? WHERE id = ?")
          .bind(name, aliases, body.active === false ? 0 : 1, characterId).run();
      } else {
        await db.prepare("INSERT INTO characters (name, aliases, active) VALUES (?, ?, ?)")
          .bind(name, aliases, body.active === false ? 0 : 1).run();
        const created = await db.prepare("SELECT id FROM characters WHERE name = ?").bind(name).first<{ id: number }>();
        characterId = created?.id;
      }
      if (!characterId) throw new Error("未能保存角色。");
      const valueEntries = Object.entries(body.values ?? {});
      await db.batch(valueEntries.map(([tagId, value]) =>
        db.prepare(
          "INSERT INTO character_tag_values (character_id, tag_id, value) VALUES (?, ?, ?) ON CONFLICT(character_id, tag_id) DO UPDATE SET value = excluded.value",
        ).bind(characterId, Number(tagId), value.trim()),
      ));
      return Response.json({ ok: true });
    }

    if (body.action === "deleteCharacter" && body.id) {
      await db.prepare("DELETE FROM characters WHERE id = ?").bind(body.id).run();
      return Response.json({ ok: true });
    }

    return Response.json({ error: "未知操作。" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 500 });
  }
}
