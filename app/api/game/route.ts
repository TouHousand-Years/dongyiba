import { compareGuess, normalizeName, type TagDefinition } from "../../game-core";
import { ensureGameDatabase, getGameDb, loadCatalog } from "../../../db/game-store";

export const dynamic = "force-dynamic";

function shanghaiDay() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function challengeNumber(day: string) {
  return Math.floor((Date.parse(`${day}T00:00:00+08:00`) - Date.parse("2024-01-01T00:00:00+08:00")) / 86400000) + 1;
}

function dayHash(day: string) {
  return [...day].reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 2166136261);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; mode?: string; sessionId?: string; name?: string };
    const db = getGameDb();
    await ensureGameDatabase(db);

    if (body.action === "start") {
      const catalog = await loadCatalog(db);
      const characters = catalog.characters.filter((item) => item.active);
      const tags = catalog.tags.filter((item) => item.active);
      if (!characters.length || !tags.length) {
        return Response.json({ error: "题库尚未配置完成。" }, { status: 503 });
      }

      const mode = body.mode === "unlimited" ? "unlimited" : "daily";
      const day = shanghaiDay();
      const index = mode === "daily"
        ? dayHash(day) % characters.length
        : crypto.getRandomValues(new Uint32Array(1))[0] % characters.length;
      const id = crypto.randomUUID();
      await db.prepare(
        "INSERT INTO game_sessions (id, answer_character_id, mode, day_key, attempts, max_attempts, completed, created_at) VALUES (?, ?, ?, ?, 0, 8, 0, ?)",
      ).bind(id, characters[index].id, mode, day, new Date().toISOString()).run();

      return Response.json({
        sessionId: id,
        challengeNumber: challengeNumber(day),
        mode,
        maxAttempts: 8,
        names: characters.map((item) => item.name),
        tags: tags.map((tag) => ({
          id: tag.id, name: tag.name, kind: tag.kind, unit: tag.unit, sortOrder: tag.sort_order,
        })),
      });
    }

    if (body.action === "guess") {
      const session = await db.prepare(
        "SELECT id, answer_character_id, attempts, max_attempts, completed FROM game_sessions WHERE id = ?",
      ).bind(body.sessionId ?? "").first<{
        id: string; answer_character_id: number; attempts: number; max_attempts: number; completed: number;
      }>();
      if (!session) return Response.json({ error: "本局已失效，请重新开始。" }, { status: 404 });
      if (session.completed) return Response.json({ error: "本局已经结束。" }, { status: 409 });

      const catalog = await loadCatalog(db);
      const targetName = normalizeName(body.name ?? "");
      const guessedCharacter = catalog.characters.find((character) => {
        const aliases = JSON.parse(character.aliases) as string[];
        return [character.name, ...aliases].some((name) => normalizeName(name) === targetName);
      });
      if (!guessedCharacter || !guessedCharacter.active) {
        return Response.json({ error: "题库中没有这位角色，请从候选列表中选择。" }, { status: 404 });
      }

      const answer = catalog.characters.find((item) => item.id === session.answer_character_id);
      if (!answer) return Response.json({ error: "答案角色已被移除，请重新开始。" }, { status: 409 });
      const tags: TagDefinition[] = catalog.tags.filter((tag) => tag.active).map((tag) => ({
        id: tag.id, name: tag.name, kind: tag.kind, unit: tag.unit, sortOrder: tag.sort_order,
      }));
      const valuesFor = (characterId: number) => catalog.values
        .filter((item) => item.character_id === characterId)
        .map((item) => ({ tagId: item.tag_id, value: item.value }));
      const won = guessedCharacter.id === answer.id;
      const attempts = session.attempts + 1;
      const lost = attempts >= session.max_attempts && !won;
      await db.prepare("UPDATE game_sessions SET attempts = ?, completed = ? WHERE id = ?")
        .bind(attempts, won || lost ? 1 : 0, session.id).run();

      return Response.json({
        guess: {
          id: guessedCharacter.id,
          name: guessedCharacter.name,
          feedback: compareGuess(tags, valuesFor(guessedCharacter.id), valuesFor(answer.id)),
        },
        message: won ? `正解！${answer.name} 从弹幕中现身了。` : lost ? `机会用完了，答案是 ${answer.name}。` : `还有 ${session.max_attempts - attempts} 次机会。`,
        answer: won || lost ? answer.name : null,
      });
    }

    return Response.json({ error: "未知操作。" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
