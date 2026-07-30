import { env } from "cloudflare:workers";

type Statement = {
  bind(...values: unknown[]): Statement;
  run<T = unknown>(): Promise<T>;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
};

type Database = {
  prepare(sql: string): Statement;
  batch<T = unknown>(statements: Statement[]): Promise<T[]>;
};

export type CharacterRow = { id: number; name: string; aliases: string; active: number };
export type TagRow = { id: number; name: string; kind: "exact" | "ordered"; unit: string; sort_order: number; active: number };
export type ValueRow = { character_id: number; tag_id: number; value: string };

const seedTags = [
  [1, "种族", "exact", "", 10],
  [2, "活动区域", "exact", "", 20],
  [3, "发色", "exact", "", 30],
  [4, "初登场年份", "ordered", "年", 40],
  [5, "身份", "exact", "", 50],
] as const;

const seedCharacters = [
  [1, "博丽灵梦", ["灵梦"], ["人类", "博丽神社", "黑色", "1997", "巫女"]],
  [2, "雾雨魔理沙", ["魔理沙"], ["人类", "魔法森林", "金色", "1997", "魔法使"]],
  [3, "露米娅", [], ["妖怪", "魔法森林", "金色", "2002", "黑暗妖怪"]],
  [4, "琪露诺", ["⑨"], ["妖精", "雾之湖", "蓝色", "2002", "冰之妖精"]],
  [5, "红美铃", ["美铃"], ["妖怪", "红魔馆", "红色", "2002", "门番"]],
  [6, "帕秋莉·诺蕾姬", ["帕秋莉"], ["魔法使", "红魔馆", "紫色", "2002", "图书管理员"]],
  [7, "十六夜咲夜", ["咲夜"], ["人类", "红魔馆", "银色", "2002", "女仆长"]],
  [8, "蕾米莉亚·斯卡蕾特", ["蕾米莉亚"], ["吸血鬼", "红魔馆", "蓝色", "2002", "馆主"]],
  [9, "芙兰朵露·斯卡蕾特", ["芙兰朵露"], ["吸血鬼", "红魔馆", "金色", "2002", "馆主之妹"]],
  [10, "魂魄妖梦", ["妖梦"], ["半人半灵", "白玉楼", "银色", "2003", "庭师"]],
  [11, "西行寺幽幽子", ["幽幽子"], ["亡灵", "白玉楼", "粉色", "2003", "亡灵公主"]],
  [12, "八云紫", ["紫"], ["妖怪", "迷途之家", "金色", "2003", "隙间妖怪"]],
  [13, "铃仙·优昙华院·因幡", ["铃仙"], ["月兔", "永远亭", "紫色", "2004", "药师学徒"]],
  [14, "蓬莱山辉夜", ["辉夜"], ["月人", "永远亭", "黑色", "2004", "公主"]],
  [15, "藤原妹红", ["妹红"], ["人类", "迷途竹林", "银色", "2004", "蓬莱人"]],
  [16, "射命丸文", ["文"], ["天狗", "妖怪之山", "黑色", "2005", "记者"]],
  [17, "东风谷早苗", ["早苗"], ["人类", "守矢神社", "绿色", "2007", "风祝"]],
  [18, "古明地觉", ["觉"], ["妖怪", "地灵殿", "粉色", "2008", "地灵殿主人"]],
  [19, "古明地恋", ["恋"], ["妖怪", "地灵殿", "绿色", "2008", "觉之妹"]],
  [20, "秦心", [], ["面灵气", "人间之里", "粉色", "2013", "付丧神"]],
] as const;

export function getGameDb(): Database {
  const db = (env as unknown as { DB?: Database }).DB;
  if (!db) throw new Error("D1 database binding DB is unavailable.");
  return db;
}

export async function ensureGameDatabase(db = getGameDb()) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      aliases TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL DEFAULT 'exact',
      unit TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS character_tag_values (
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      value TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (character_id, tag_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS game_sessions (
      id TEXT PRIMARY KEY,
      answer_character_id INTEGER NOT NULL REFERENCES characters(id),
      mode TEXT NOT NULL,
      day_key TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 8,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`),
  ]);

  const count = await db.prepare("SELECT COUNT(*) AS count FROM characters").first<{ count: number }>();
  if ((count?.count ?? 0) > 0) return;

  await db.batch([
    ...seedTags.map((tag) =>
      db.prepare("INSERT OR IGNORE INTO tags (id, name, kind, unit, sort_order) VALUES (?, ?, ?, ?, ?)").bind(...tag),
    ),
    ...seedCharacters.map((character) =>
      db.prepare("INSERT OR IGNORE INTO characters (id, name, aliases) VALUES (?, ?, ?)").bind(
        character[0], character[1], JSON.stringify(character[2]),
      ),
    ),
  ]);
  await db.batch(seedCharacters.flatMap((character) =>
    character[3].map((value, index) =>
      db.prepare("INSERT OR IGNORE INTO character_tag_values (character_id, tag_id, value) VALUES (?, ?, ?)")
        .bind(character[0], seedTags[index][0], value),
    ),
  ));
}

export async function loadCatalog(db = getGameDb()) {
  await ensureGameDatabase(db);
  const [characters, tags, values] = await Promise.all([
    db.prepare("SELECT id, name, aliases, active FROM characters ORDER BY name").all<CharacterRow>(),
    db.prepare("SELECT id, name, kind, unit, sort_order, active FROM tags ORDER BY sort_order, id").all<TagRow>(),
    db.prepare("SELECT character_id, tag_id, value FROM character_tag_values").all<ValueRow>(),
  ]);
  return { characters: characters.results, tags: tags.results, values: values.results };
}
