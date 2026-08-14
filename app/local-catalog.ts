import type { TagDefinition, TagKind, TagValueEntry } from "./game-core";
import { defaultCatalog } from "./default-catalog.generated";

export type LocalTag = {
  id: number;
  name: string;
  kind: TagKind;
  unit: string;
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
  category?: string;
  entries?: TagValueEntry[];
};

export type LocalCatalog = {
  tags: LocalTag[];
  characters: LocalCharacter[];
  values: LocalValue[];
};

export type CatalogRecord = {
  id: string;
  name: string;
  official: boolean;
  catalog: LocalCatalog;
};

export type CatalogLibrary = {
  catalogs: CatalogRecord[];
  playCatalogId: string;
  editCatalogId: string;
};

export type LocalStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type CatalogMutation =
  | {
      action: "saveTag";
      id?: number;
      name?: string;
      kind?: TagKind;
      unit?: string;
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
      categories?: Record<string, string>;
      multiValues?: Record<string, string>;
    }
  | { action: "deleteCharacter"; id: number };

const CATALOG_STORAGE_KEY = "dongyiba:catalog:v1";
const CATALOG_LIBRARY_STORAGE_KEY = "dongyiba:catalog-library:v2";
const ACTIVE_GAMES_STORAGE_KEY = "dongyiba:games:v1";
const DEFAULT_OFFICIAL_CATALOG_ID = "official:default";

const REQUIRED_TAG_KINDS: Readonly<Record<string, TagKind>> = {
  "种族": "category-multi",
  "活动区域": "exact-multi",
};
const LEGACY_RACE_CATEGORY = "未分类";

function migrateRequiredTagKinds(tags: LocalTag[]): LocalTag[] {
  return tags.map((tag) => ({ ...tag, kind: REQUIRED_TAG_KINDS[tag.name] ?? tag.kind }));
}

function migrateRequiredValues(tags: LocalTag[], values: LocalValue[]): LocalValue[] {
  const raceTagIds = new Set(tags.filter((tag) => tag.name === "种族").map((tag) => tag.id));
  return values.map((item) => {
    if (!raceTagIds.has(item.tagId)) return item;
    const entries = item.entries?.map((entry) => ({
      ...entry,
      category: entry.category?.trim() || LEGACY_RACE_CATEGORY,
    }));
    return {
      ...item,
      category: item.category?.trim() || LEGACY_RACE_CATEGORY,
      ...(entries ? { entries } : {}),
    };
  });
}

export function createDefaultCatalog(): LocalCatalog {
  const tags = migrateRequiredTagKinds(defaultCatalog.tags.map((tag) => ({ ...tag })));
  return sortCatalog({
    tags,
    characters: defaultCatalog.characters.map((character) => ({ ...character, aliases: [...character.aliases] })),
    values: migrateRequiredValues(tags, defaultCatalog.values.map((item) => ({
      ...item,
      ...(item.entries ? { entries: item.entries.map((entry) => ({ ...entry })) } : {}),
    }))),
  });
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
    values: catalog.values.map((item) => ({ ...item, ...(item.entries ? { entries: item.entries.map((entry) => ({ ...entry })) } : {}) })),
  };
}

function createOfficialCatalogs(): CatalogRecord[] {
  return [{
    id: DEFAULT_OFFICIAL_CATALOG_ID,
    name: "东一把官方题库",
    official: true,
    catalog: createDefaultCatalog(),
  }];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTagKind(value: unknown): value is TagKind {
  return ["exact", "exact-close", "ordered", "category", "exact-multi", "category-multi"].includes(String(value));
}

export function parseMultiValueText(source: string, singleValueAsCategory = false): TagValueEntry[] {
  return source
    .split(/\r?\n|\s*\|\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.indexOf(">");
      if (separatorIndex < 0) return singleValueAsCategory ? { category: part, value: "" } : { value: part };
      const category = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      return { value, ...(category ? { category } : {}) };
    })
    .filter((entry) => entry.value || entry.category);
}

export function formatMultiValueText(entries: TagValueEntry[] | undefined, separator = "\n") {
  return (entries ?? []).map((entry) => {
    const category = entry.category?.trim() ?? "";
    const value = entry.value.trim();
    return category && value ? `${category} > ${value}` : category || value;
  }).join(separator);
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
        kind: isTagKind(item.kind) ? item.kind : "exact",
        unit: typeof item.unit === "string" ? item.unit : "",
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
      const entries = Array.isArray(item.entries)
        ? item.entries
            .filter((entry): entry is Record<string, unknown> => isRecord(entry) && typeof entry.value === "string")
            .map((entry) => ({
              value: String(entry.value).trim(),
              ...(typeof entry.category === "string" && entry.category.trim() ? { category: entry.category.trim() } : {}),
            }))
            .filter((entry) => entry.value || entry.category)
        : undefined;
      return {
        characterId,
        tagId,
        value: item.value,
        ...(typeof item.category === "string" && item.category.trim() ? { category: item.category.trim() } : {}),
        ...(entries ? { entries } : {}),
      };
    });

    if (tags.some((item) => item === null) || characters.some((item) => item === null) || values.some((item) => item === null)) {
      return null;
    }
    const migratedTags = migrateRequiredTagKinds(tags as LocalTag[]);
    return sortCatalog({
      tags: migratedTags,
      characters: characters as LocalCharacter[],
      values: migrateRequiredValues(migratedTags, values as LocalValue[]),
    });
  } catch {
    return null;
  }
}

const tagNameCollator = new Intl.Collator("zh-CN-u-co-pinyin", { sensitivity: "base", numeric: true });

export function sortTagsByName(tags: LocalTag[]): LocalTag[] {
  return [...tags].sort((a, b) => tagNameCollator.compare(a.name, b.name) || a.id - b.id);
}

function sortCatalog(catalog: LocalCatalog): LocalCatalog {
  return {
    tags: sortTagsByName(catalog.tags),
    characters: [...catalog.characters].sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    values: [...catalog.values].sort((a, b) => a.characterId - b.characterId || a.tagId - b.tagId),
  };
}

export function loadLocalCatalog(storage: LocalStorageLike | null = getBrowserStorage()): LocalCatalog {
  const library = loadCatalogLibrary(storage);
  return cloneCatalog(library.catalogs.find((item) => item.id === library.playCatalogId)?.catalog ?? createDefaultCatalog());
}

export function saveLocalCatalog(catalog: LocalCatalog, storage: LocalStorageLike | null = getBrowserStorage()) {
  if (!storage) return;
  const library = loadCatalogLibrary(storage);
  const editing = library.catalogs.find((item) => item.id === library.editCatalogId);
  if (editing && !editing.official) {
    updatePlayerCatalog(editing.id, catalog, storage);
    return;
  }
  const created = createPlayerCatalog(`${editing?.name ?? "题库"} 副本`, catalog, storage);
  selectPlayCatalog(created.id, storage);
}

export function resetLocalCatalog(storage: LocalStorageLike | null = getBrowserStorage()): LocalCatalog {
  const catalog = createDefaultCatalog();
  saveLocalCatalog(catalog, storage);
  return catalog;
}

type StoredCatalogLibrary = {
  players: Array<{ id: string; name: string; catalog: LocalCatalog }>;
  playCatalogId: string;
  editCatalogId: string;
};

function parseStoredCatalogLibrary(value: string | null): StoredCatalogLibrary | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || !Array.isArray(parsed.players)) return null;
    const players = parsed.players.map((item) => {
      if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") return null;
      const catalog = parseCatalog(JSON.stringify(item.catalog));
      if (!catalog || !item.id.startsWith("player:") || !item.name.trim()) return null;
      return { id: item.id, name: item.name.trim(), catalog };
    });
    if (players.some((item) => item === null)) return null;
    return {
      players: players as StoredCatalogLibrary["players"],
      playCatalogId: typeof parsed.playCatalogId === "string" ? parsed.playCatalogId : DEFAULT_OFFICIAL_CATALOG_ID,
      editCatalogId: typeof parsed.editCatalogId === "string" ? parsed.editCatalogId : DEFAULT_OFFICIAL_CATALOG_ID,
    };
  } catch {
    return null;
  }
}

function persistCatalogLibrary(library: CatalogLibrary, storage: LocalStorageLike) {
  const validIds = new Set(library.catalogs.map((item) => item.id));
  storage.setItem(CATALOG_LIBRARY_STORAGE_KEY, JSON.stringify({
    players: library.catalogs
      .filter((item) => !item.official)
      .map((item) => ({ id: item.id, name: item.name, catalog: sortCatalog(cloneCatalog(item.catalog)) })),
    playCatalogId: validIds.has(library.playCatalogId) ? library.playCatalogId : DEFAULT_OFFICIAL_CATALOG_ID,
    editCatalogId: validIds.has(library.editCatalogId) ? library.editCatalogId : DEFAULT_OFFICIAL_CATALOG_ID,
  } satisfies StoredCatalogLibrary));
}

export function loadCatalogLibrary(storage: LocalStorageLike | null = getBrowserStorage()): CatalogLibrary {
  const officials = createOfficialCatalogs();
  if (!storage) return { catalogs: officials, playCatalogId: DEFAULT_OFFICIAL_CATALOG_ID, editCatalogId: DEFAULT_OFFICIAL_CATALOG_ID };

  let stored = parseStoredCatalogLibrary(storage.getItem(CATALOG_LIBRARY_STORAGE_KEY));
  if (!stored) {
    const legacy = parseCatalog(storage.getItem(CATALOG_STORAGE_KEY) ?? "");
    stored = legacy
      ? { players: [{ id: "player:1", name: "我的题库", catalog: legacy }], playCatalogId: "player:1", editCatalogId: "player:1" }
      : { players: [], playCatalogId: DEFAULT_OFFICIAL_CATALOG_ID, editCatalogId: DEFAULT_OFFICIAL_CATALOG_ID };
  }

  const catalogs: CatalogRecord[] = [
    ...officials,
    ...stored.players.map((item) => ({ ...item, official: false, catalog: cloneCatalog(item.catalog) })),
  ];
  const ids = new Set(catalogs.map((item) => item.id));
  const library = {
    catalogs,
    playCatalogId: ids.has(stored.playCatalogId) ? stored.playCatalogId : DEFAULT_OFFICIAL_CATALOG_ID,
    editCatalogId: ids.has(stored.editCatalogId) ? stored.editCatalogId : DEFAULT_OFFICIAL_CATALOG_ID,
  };
  persistCatalogLibrary(library, storage);
  return library;
}

function nextPlayerCatalogId(catalogs: CatalogRecord[]): string {
  const highest = catalogs.reduce((value, item) => {
    const match = /^player:(\d+)$/.exec(item.id);
    return Math.max(value, match ? Number(match[1]) : 0);
  }, 0);
  return `player:${highest + 1}`;
}

export function createEmptyCatalog(): LocalCatalog {
  return { tags: [], characters: [], values: [] };
}

export function createPlayerCatalog(
  name: string,
  catalog: LocalCatalog = createEmptyCatalog(),
  storage: LocalStorageLike | null = getBrowserStorage(),
): CatalogRecord {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("题库名称不能为空。");
  const library = loadCatalogLibrary(storage);
  const record = { id: nextPlayerCatalogId(library.catalogs), name: trimmedName, official: false, catalog: sortCatalog(cloneCatalog(catalog)) };
  library.catalogs.push(record);
  library.editCatalogId = record.id;
  if (storage) persistCatalogLibrary(library, storage);
  return { ...record, catalog: cloneCatalog(record.catalog) };
}

export function copyCatalog(catalogId: string, storage: LocalStorageLike | null = getBrowserStorage()): CatalogRecord {
  const source = loadCatalogLibrary(storage).catalogs.find((item) => item.id === catalogId);
  if (!source) throw new Error("题库不存在。");
  return createPlayerCatalog(`${source.name} 副本`, source.catalog, storage);
}

export function updatePlayerCatalog(
  catalogId: string,
  catalog: LocalCatalog,
  storage: LocalStorageLike | null = getBrowserStorage(),
) {
  const library = loadCatalogLibrary(storage);
  const record = library.catalogs.find((item) => item.id === catalogId);
  if (!record) throw new Error("题库不存在。");
  if (record.official) throw new Error("官方题库不能直接修改，请先创建副本。");
  record.catalog = sortCatalog(cloneCatalog(catalog));
  if (storage) persistCatalogLibrary(library, storage);
}

export function renamePlayerCatalog(catalogId: string, name: string, storage: LocalStorageLike | null = getBrowserStorage()) {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("题库名称不能为空。");
  const library = loadCatalogLibrary(storage);
  const record = library.catalogs.find((item) => item.id === catalogId);
  if (!record) throw new Error("题库不存在。");
  if (record.official) throw new Error("官方题库不能重命名。");
  record.name = trimmedName;
  if (storage) persistCatalogLibrary(library, storage);
}

export function deletePlayerCatalog(catalogId: string, storage: LocalStorageLike | null = getBrowserStorage()) {
  const library = loadCatalogLibrary(storage);
  const record = library.catalogs.find((item) => item.id === catalogId);
  if (!record) throw new Error("题库不存在。");
  if (record.official) throw new Error("官方题库不能删除。");
  library.catalogs = library.catalogs.filter((item) => item.id !== catalogId);
  const wasPlaying = library.playCatalogId === catalogId;
  if (wasPlaying) library.playCatalogId = DEFAULT_OFFICIAL_CATALOG_ID;
  if (library.editCatalogId === catalogId) library.editCatalogId = DEFAULT_OFFICIAL_CATALOG_ID;
  if (storage) {
    persistCatalogLibrary(library, storage);
    if (wasPlaying) storage.removeItem(ACTIVE_GAMES_STORAGE_KEY);
  }
}

function selectCatalog(kind: "playCatalogId" | "editCatalogId", catalogId: string, storage: LocalStorageLike | null) {
  const library = loadCatalogLibrary(storage);
  if (!library.catalogs.some((item) => item.id === catalogId)) throw new Error("题库不存在。");
  library[kind] = catalogId;
  if (storage) persistCatalogLibrary(library, storage);
}

export function selectPlayCatalog(catalogId: string, storage: LocalStorageLike | null = getBrowserStorage()) {
  const currentId = loadCatalogLibrary(storage).playCatalogId;
  selectCatalog("playCatalogId", catalogId, storage);
  if (storage && currentId !== catalogId) storage.removeItem(ACTIVE_GAMES_STORAGE_KEY);
}

export function selectEditCatalog(catalogId: string, storage: LocalStorageLike | null = getBrowserStorage()) {
  selectCatalog("editCatalogId", catalogId, storage);
}

export function getActiveTags(catalog: LocalCatalog): LocalTag[] {
  return sortTagsByName(catalog.tags.filter((tag) => tag.active));
}

export function getActiveCharacters(catalog: LocalCatalog): LocalCharacter[] {
  return catalog.characters.filter((character) => character.active).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

export function toTagDefinitions(tags: LocalTag[]): TagDefinition[] {
  return tags.map(({ id, name, kind, unit }) => ({ id, name, kind, unit }));
}

function nextId(items: Array<{ id: number }>) {
  return items.reduce((highest, item) => Math.max(highest, item.id), 0) + 1;
}

function assertUniqueName(items: Array<{ id: number; name: string }>, name: string, id?: number) {
  if (items.some((item) => item.name === name && item.id !== id)) {
    throw new Error(`名称“${name}”已经存在。`);
  }
}

function updateCharacterValues(
  catalog: LocalCatalog,
  characterId: number,
  values: Record<string, string> = {},
  categories: Record<string, string> = {},
  multiValues: Record<string, string> = {},
) {
  const tagsById = new Map(catalog.tags.map((tag) => [tag.id, tag]));
  const valueMap = new Map(catalog.values.map((item) => [`${item.characterId}:${item.tagId}`, item]));
  const tagIds = new Set([...Object.keys(values), ...Object.keys(multiValues)]);
  for (const tagIdText of tagIds) {
    const value = values[tagIdText] ?? "";
    const tagId = Number(tagIdText);
    const tag = tagsById.get(tagId);
    if (!Number.isInteger(tagId) || !tag) continue;
    if (tag.kind === "exact-multi" || tag.kind === "category-multi") {
      const entries = parseMultiValueText(multiValues[tagIdText] ?? value, tag.kind === "category-multi");
      const first = entries[0];
      valueMap.set(`${characterId}:${tagId}`, {
        characterId,
        tagId,
        value: first?.value ?? "",
        ...(first?.category ? { category: first.category } : {}),
        entries,
      });
      continue;
    }
    const category = categories[tagIdText]?.trim() ?? "";
    valueMap.set(`${characterId}:${tagId}`, {
      characterId,
      tagId,
      value: value.trim(),
      ...(category ? { category } : {}),
    });
  }
  catalog.values = [...valueMap.values()];
}

export function applyCatalogMutation(catalog: LocalCatalog, mutation: CatalogMutation): LocalCatalog {
  const next = cloneCatalog(catalog);

  if (mutation.action === "saveTag") {
    const name = mutation.name?.trim() ?? "";
    if (!name) throw new Error("标签名不能为空。");
    assertUniqueName(next.tags, name, mutation.id);
    const tag: LocalTag = {
      id: mutation.id ?? nextId(next.tags),
      name,
      kind: isTagKind(mutation.kind) ? mutation.kind : "exact",
      unit: mutation.unit?.trim() ?? "",
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
    updateCharacterValues(next, character.id, mutation.values, mutation.categories, mutation.multiValues);
    return sortCatalog(next);
  }

  if (!next.characters.some((character) => character.id === mutation.id)) throw new Error("角色不存在。");
  next.characters = next.characters.filter((character) => character.id !== mutation.id);
  next.values = next.values.filter((item) => item.characterId !== mutation.id);
  return sortCatalog(next);
}
