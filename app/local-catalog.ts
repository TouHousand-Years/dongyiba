import type { TagDefinition } from "./game-core";

export type LocalTag = {
  id: number;
  name: string;
  kind: "exact" | "ordered";
  unit: string;
  sortOrder: number;
  active: boolean;
};

export type LocalCharacter = {
  id: number;
  name: string;
  aliases: string[];
  active: boolean;
};

export type LocalValue = {
  characterId: number;
  tagId: number;
  value: string;
};

export type LocalCatalog = {
  tags: LocalTag[];
  characters: LocalCharacter[];
  values: LocalValue[];
};

export type LocalStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type CatalogMutation =
  | {
      action: "saveTag";
      id?: number;
      name?: string;
      kind?: "exact" | "ordered";
      unit?: string;
      sortOrder?: number;
      active?: boolean;
    }
  | { action: "deleteTag"; id: number }
  | {
      action: "saveCharacter";
      id?: number;
      name?: string;
      aliases?: string[];
      active?: boolean;
      values?: Record<string, string>;
    }
  | { action: "deleteCharacter"; id: number };

const CATALOG_STORAGE_KEY = "dongyiba:catalog:v1";

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

export function createDefaultCatalog(): LocalCatalog {
  return {
    tags: seedTags.map(([id, name, kind, unit, sortOrder]) => ({
      id,
      name,
      kind,
      unit,
      sortOrder,
      active: true,
    })),
    characters: seedCharacters.map(([id, name, aliases]) => ({
      id,
      name,
      aliases: [...aliases],
      active: true,
    })),
    values: seedCharacters.flatMap(([characterId, , , values]) =>
      values.map((value, index) => ({
        characterId,
        tagId: seedTags[index][0],
        value,
      })),
    ),
  };
}

function getBrowserStorage(): LocalStorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function cloneCatalog(catalog: LocalCatalog): LocalCatalog {
  return {
    tags: catalog.tags.map((tag) => ({ ...tag })),
    characters: catalog.characters.map((character) => ({ ...character, aliases: [...character.aliases] })),
    values: catalog.values.map((item) => ({ ...item })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseCatalog(value: string): LocalCatalog | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || !Array.isArray(parsed.tags) || !Array.isArray(parsed.characters) || !Array.isArray(parsed.values)) {
      return null;
    }

    const tags = parsed.tags.map((item) => {
      if (!isRecord(item) || typeof item.name !== "string") return null;
      const id = Number(item.id);
      if (!Number.isInteger(id)) return null;
      return {
        id,
        name: item.name,
        kind: item.kind === "ordered" ? "ordered" as const : "exact" as const,
        unit: typeof item.unit === "string" ? item.unit : "",
        sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : 0,
        active: item.active !== false && item.active !== 0,
      };
    });
    const characters = parsed.characters.map((item) => {
      if (!isRecord(item) || typeof item.name !== "string") return null;
      const id = Number(item.id);
      if (!Number.isInteger(id)) return null;
      const aliases = Array.isArray(item.aliases)
        ? item.aliases.filter((alias): alias is string => typeof alias === "string")
        : [];
      return { id, name: item.name, aliases, active: item.active !== false && item.active !== 0 };
    });
    const values = parsed.values.map((item) => {
      if (!isRecord(item) || typeof item.value !== "string") return null;
      const characterId = Number(item.characterId);
      const tagId = Number(item.tagId);
      if (!Number.isInteger(characterId) || !Number.isInteger(tagId)) return null;
      return { characterId, tagId, value: item.value };
    });

    if (tags.some((item) => item === null) || characters.some((item) => item === null) || values.some((item) => item === null)) {
      return null;
    }
    return sortCatalog({
      tags: tags as LocalTag[],
      characters: characters as LocalCharacter[],
      values: values as LocalValue[],
    });
  } catch {
    return null;
  }
}

function sortCatalog(catalog: LocalCatalog): LocalCatalog {
  return {
    tags: [...catalog.tags].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    characters: [...catalog.characters].sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    values: [...catalog.values].sort((a, b) => a.characterId - b.characterId || a.tagId - b.tagId),
  };
}

export function loadLocalCatalog(storage: LocalStorageLike | null = getBrowserStorage()): LocalCatalog {
  if (!storage) return createDefaultCatalog();
  const stored = storage.getItem(CATALOG_STORAGE_KEY);
  return stored ? (parseCatalog(stored) ?? createDefaultCatalog()) : createDefaultCatalog();
}

export function saveLocalCatalog(catalog: LocalCatalog, storage: LocalStorageLike | null = getBrowserStorage()) {
  storage?.setItem(CATALOG_STORAGE_KEY, JSON.stringify(sortCatalog(cloneCatalog(catalog))));
}

export function resetLocalCatalog(storage: LocalStorageLike | null = getBrowserStorage()): LocalCatalog {
  const catalog = createDefaultCatalog();
  saveLocalCatalog(catalog, storage);
  return catalog;
}

export function getActiveTags(catalog: LocalCatalog): LocalTag[] {
  return catalog.tags.filter((tag) => tag.active).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

export function getActiveCharacters(catalog: LocalCatalog): LocalCharacter[] {
  return catalog.characters.filter((character) => character.active).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

export function toTagDefinitions(tags: LocalTag[]): TagDefinition[] {
  return tags.map(({ id, name, kind, unit, sortOrder }) => ({ id, name, kind, unit, sortOrder }));
}

function nextId(items: Array<{ id: number }>) {
  return items.reduce((highest, item) => Math.max(highest, item.id), 0) + 1;
}

function assertUniqueName(items: Array<{ id: number; name: string }>, name: string, id?: number) {
  if (items.some((item) => item.name === name && item.id !== id)) {
    throw new Error(`名称“${name}”已经存在。`);
  }
}

function updateCharacterValues(catalog: LocalCatalog, characterId: number, values: Record<string, string> = {}) {
  const knownTagIds = new Set(catalog.tags.map((tag) => tag.id));
  const valueMap = new Map(catalog.values.map((item) => [`${item.characterId}:${item.tagId}`, item]));
  for (const [tagIdText, value] of Object.entries(values)) {
    const tagId = Number(tagIdText);
    if (!Number.isInteger(tagId) || !knownTagIds.has(tagId)) continue;
    valueMap.set(`${characterId}:${tagId}`, { characterId, tagId, value: value.trim() });
  }
  catalog.values = [...valueMap.values()];
}

export function applyCatalogMutation(catalog: LocalCatalog, mutation: CatalogMutation): LocalCatalog {
  const next = cloneCatalog(catalog);

  if (mutation.action === "saveTag") {
    const name = mutation.name?.trim() ?? "";
    if (!name) throw new Error("标签名不能为空。");
    assertUniqueName(next.tags, name, mutation.id);
    const tag = {
      id: mutation.id ?? nextId(next.tags),
      name,
      kind: mutation.kind === "ordered" ? "ordered" as const : "exact" as const,
      unit: mutation.unit?.trim() ?? "",
      sortOrder: Number.isFinite(Number(mutation.sortOrder)) ? Number(mutation.sortOrder) : 0,
      active: mutation.active !== false,
    };
    const index = next.tags.findIndex((item) => item.id === tag.id);
    if (index >= 0) next.tags[index] = tag;
    else next.tags.push(tag);
    return sortCatalog(next);
  }

  if (mutation.action === "deleteTag") {
    if (!next.tags.some((tag) => tag.id === mutation.id)) throw new Error("标签不存在。");
    next.tags = next.tags.filter((tag) => tag.id !== mutation.id);
    next.values = next.values.filter((item) => item.tagId !== mutation.id);
    return sortCatalog(next);
  }

  if (mutation.action === "saveCharacter") {
    const name = mutation.name?.trim() ?? "";
    if (!name) throw new Error("角色名不能为空。");
    assertUniqueName(next.characters, name, mutation.id);
    const character = {
      id: mutation.id ?? nextId(next.characters),
      name,
      aliases: [...new Set((mutation.aliases ?? []).map((alias) => alias.trim()).filter(Boolean))],
      active: mutation.active !== false,
    };
    const index = next.characters.findIndex((item) => item.id === character.id);
    if (index >= 0) next.characters[index] = character;
    else next.characters.push(character);
    updateCharacterValues(next, character.id, mutation.values);
    return sortCatalog(next);
  }

  if (!next.characters.some((character) => character.id === mutation.id)) throw new Error("角色不存在。");
  next.characters = next.characters.filter((character) => character.id !== mutation.id);
  next.values = next.values.filter((item) => item.characterId !== mutation.id);
  return sortCatalog(next);
}
