import type { LocalCatalog, LocalCharacter, LocalTag, LocalValue } from "./local-catalog";

export const CSV_BASE_HEADERS = ["角色名", "别名", "启用"] as const;

export type CatalogCsvPreview = {
  headers: string[];
  tagNames: string[];
  rows: string[][];
};

export type CatalogCsvImportMode = "append" | "replace";

function parseCsvRows(source: string): string[][] {
  const text = source.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") field += character;
  }

  if (quoted) throw new Error("CSV 中存在未闭合的双引号。");
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((item) => item.some((cell) => cell.trim() !== ""));
}

export function getCatalogCsvHeaders(catalog: LocalCatalog): string[] {
  return [...CSV_BASE_HEADERS, ...catalog.tags.map((tag) => tag.name)];
}

export function hasSameCsvHeaders(catalog: LocalCatalog, preview: CatalogCsvPreview): boolean {
  const current = getCatalogCsvHeaders(catalog);
  return current.length === preview.headers.length && current.every((header, index) => header === preview.headers[index]);
}

export function parseCatalogCsv(source: string): CatalogCsvPreview {
  const rows = parseCsvRows(source);
  if (rows.length === 0) throw new Error("CSV 文件为空。");

  const headers = rows[0].map((header) => header.trim());
  if (headers.length < CSV_BASE_HEADERS.length) throw new Error("CSV 表头缺少角色名、别名或启用列。");
  if (!CSV_BASE_HEADERS.every((header, index) => headers[index] === header)) {
    throw new Error(`CSV 前三列表头必须依次为：${CSV_BASE_HEADERS.join("、")}。`);
  }
  if (headers.some((header) => !header)) throw new Error("CSV 表头不能包含空列名。");
  if (new Set(headers).size !== headers.length) throw new Error("CSV 表头不能包含重复列名。");

  const dataRows = rows.slice(1).map((row, index) => {
    if (row.length > headers.length) throw new Error(`CSV 第 ${index + 2} 行的列数多于表头。`);
    return Array.from({ length: headers.length }, (_, column) => row[column]?.trim() ?? "");
  });
  if (dataRows.length === 0) throw new Error("CSV 中没有角色数据。");
  const names = dataRows.map((row) => row[0]);
  if (names.some((name) => !name)) throw new Error("CSV 中的角色名不能为空。");
  if (new Set(names).size !== names.length) throw new Error("CSV 中不能包含重复角色名。");

  return { headers, tagNames: headers.slice(CSV_BASE_HEADERS.length), rows: dataRows };
}

function parseActive(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (["", "1", "true", "是", "启用", "yes"].includes(normalized)) return true;
  if (["0", "false", "否", "停用", "no"].includes(normalized)) return false;
  throw new Error(`无法识别启用状态“${value}”，请填写是/否或 1/0。`);
}

function createCharactersAndValues(rows: string[][], tags: LocalTag[], firstId: number) {
  const characters: LocalCharacter[] = [];
  const values: LocalValue[] = [];
  rows.forEach((row, index) => {
    const characterId = firstId + index;
    characters.push({
      id: characterId,
      name: row[0],
      aliases: [...new Set(row[1].split(/[、|｜]/).map((alias) => alias.trim()).filter(Boolean))],
      active: parseActive(row[2]),
    });
    tags.forEach((tag, tagIndex) => {
      values.push({ characterId, tagId: tag.id, value: row[CSV_BASE_HEADERS.length + tagIndex] ?? "" });
    });
  });
  return { characters, values };
}

export function importCatalogCsv(
  catalog: LocalCatalog,
  preview: CatalogCsvPreview,
  mode: CatalogCsvImportMode,
): LocalCatalog {
  const sameHeaders = hasSameCsvHeaders(catalog, preview);
  if (mode === "append" && !sameHeaders) throw new Error("CSV 表头与当前题库不同，只能选择替换。");

  if (mode === "append") {
    const existingNames = new Set(catalog.characters.map((character) => character.name));
    const duplicate = preview.rows.find((row) => existingNames.has(row[0]));
    if (duplicate) throw new Error(`角色“${duplicate[0]}”已存在；添加模式不会覆盖现有角色。`);
    const firstId = catalog.characters.reduce((highest, character) => Math.max(highest, character.id), 0) + 1;
    const additions = createCharactersAndValues(preview.rows, catalog.tags, firstId);
    return {
      tags: catalog.tags.map((tag) => ({ ...tag })),
      characters: [...catalog.characters, ...additions.characters].sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
      values: [...catalog.values, ...additions.values].sort((a, b) => a.characterId - b.characterId || a.tagId - b.tagId),
    };
  }

  const tags = preview.tagNames.map((name, index) => {
    const existing = catalog.tags.find((tag) => tag.name === name);
    return existing
      ? { ...existing, id: index + 1, sortOrder: (index + 1) * 10 }
      : { id: index + 1, name, kind: "exact" as const, unit: "", sortOrder: (index + 1) * 10, active: true };
  });
  const replacement = createCharactersAndValues(preview.rows, tags, 1);
  return { tags, ...replacement };
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function exportCatalogCsv(catalog: LocalCatalog): string {
  const headers = getCatalogCsvHeaders(catalog);
  const valueMap = new Map(catalog.values.map((item) => [`${item.characterId}:${item.tagId}`, item.value]));
  const rows = catalog.characters.map((character) => [
    character.name,
    character.aliases.join("、"),
    character.active ? "是" : "否",
    ...catalog.tags.map((tag) => valueMap.get(`${character.id}:${tag.id}`) ?? ""),
  ]);
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
