import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const sourcePath = path.resolve("db/东一把题库.csv");
const outputPath = path.resolve("app/default-catalog.generated.ts");
const CSV_BASE_HEADERS = ["角色名", "别名", "启用"];
const TAG_KINDS = ["exact", "exact-close", "ordered", "category", "exact-multi", "category-multi"];
const TAG_HEADER_PATTERN = /^(.*)（类型：(exact|exact-close|ordered|category|exact-multi|category-multi)）$/;

function parseCsvRows(source) {
  const text = source.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
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
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (quoted) throw new Error("CSV 中存在未闭合的双引号。");
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((item) => item.some((cell) => cell.trim() !== ""));
}

function parseTagHeader(header) {
  const match = TAG_HEADER_PATTERN.exec(header);
  const name = match?.[1].trim() ?? "";
  if (!name || !match || !TAG_KINDS.includes(match[2])) {
    throw new Error(`CSV 标签列“${header}”缺少有效的类型代码。`);
  }
  return { name, kind: match[2] };
}

function parseMultiValueText(source, singleValueAsCategory = false) {
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

function parseTagValue(rawValue, tag) {
  if (tag.kind === "exact-multi" || tag.kind === "category-multi") {
    const entries = parseMultiValueText(rawValue, tag.kind === "category-multi");
    const first = entries[0];
    return {
      value: first?.value ?? "",
      ...(first?.category ? { category: first.category } : {}),
      entries,
    };
  }

  if (tag.kind !== "category") return { value: rawValue };
  const separatorIndex = rawValue.indexOf(" > ");
  if (separatorIndex < 0) return { value: rawValue };
  const category = rawValue.slice(0, separatorIndex).trim();
  const value = rawValue.slice(separatorIndex + 3).trim();
  return { value, ...(category ? { category } : {}) };
}

function parseActive(value) {
  const normalized = value.trim().toLowerCase();
  if (["", "1", "true", "是", "启用", "yes"].includes(normalized)) return true;
  if (["0", "false", "否", "停用", "no"].includes(normalized)) return false;
  throw new Error(`无法识别启用状态“${value}”。`);
}

function readCatalog() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`默认题库不存在：${sourcePath}`);
  }

  const rows = parseCsvRows(fs.readFileSync(sourcePath, "utf8"));
  if (rows.length < 2) throw new Error("默认题库 CSV 为空或没有角色数据。");

  const headers = rows[0].map((header) => header.trim());
  if (!CSV_BASE_HEADERS.every((header, index) => headers[index] === header)) {
    throw new Error(`默认题库前三列表头必须依次为：${CSV_BASE_HEADERS.join("、")}。`);
  }
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) {
    throw new Error("默认题库表头不能包含空列名或重复列名。");
  }

  const csvTags = headers.slice(CSV_BASE_HEADERS.length).map(parseTagHeader);
  if (new Set(csvTags.map((tag) => tag.name)).size !== csvTags.length) {
    throw new Error("默认题库不能包含同名标签。");
  }

  const dataRows = rows.slice(1).map((row, index) => {
    if (row.length > headers.length) throw new Error(`默认题库第 ${index + 2} 行的列数多于表头。`);
    return Array.from({ length: headers.length }, (_, column) => row[column]?.trim() ?? "");
  });
  const names = dataRows.map((row) => row[0]);
  if (names.some((name) => !name)) throw new Error("默认题库中的角色名不能为空。");
  if (new Set(names).size !== names.length) throw new Error("默认题库不能包含重复角色名。");

  const tags = csvTags.map((tag, index) => ({
    id: index + 1,
    name: tag.name,
    kind: tag.kind,
    unit: "",
    active: true,
  }));
  const characters = [];
  const values = [];

  dataRows.forEach((row, rowIndex) => {
    const characterId = rowIndex + 1;
    characters.push({
      id: characterId,
      name: row[0],
      aliases: [...new Set(row[1].split(/[、|｜]/).map((alias) => alias.trim()).filter(Boolean))],
      active: parseActive(row[2]),
    });
    tags.forEach((tag, tagIndex) => {
      values.push({
        characterId,
        tagId: tag.id,
        ...parseTagValue(row[CSV_BASE_HEADERS.length + tagIndex] ?? "", tag),
      });
    });
  });

  return { tags, characters, values };
}

function readCatalogGitVersion(fallbackSha) {
  try {
    const relativeSourcePath = path.relative(process.cwd(), sourcePath);
    const record = execFileSync(
      "git",
      ["log", "-1", "--format=%H|%cs", "--", relativeSourcePath],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    const match = /^([0-9a-f]{40})\|(\d{4}-\d{2}-\d{2})$/i.exec(record);
    if (match) return { commitSha: match[1].toLowerCase(), commitDate: match[2] };
  } catch {
    // Source archives may not contain Git history; the blob remains a stable fallback label.
  }
  return { commitSha: fallbackSha, commitDate: "" };
}

const catalog = readCatalog();
const source = fs.readFileSync(sourcePath);
// Git stores text files with LF line endings. Normalize the Windows working
// tree's CRLF bytes so this matches the blob SHA returned by GitHub.
const gitBlobSource = Buffer.from(source.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
const defaultCatalogGitBlobSha = createHash("sha1")
  .update(`blob ${gitBlobSource.length}\0`)
  .update(gitBlobSource)
  .digest("hex");
const { commitSha, commitDate } = readCatalogGitVersion(defaultCatalogGitBlobSha);
const output = `import type { LocalCatalog } from "./local-catalog";\n\nexport const defaultCatalogGitBlobSha = ${JSON.stringify(defaultCatalogGitBlobSha)};\nexport const defaultCatalogGitCommitSha = ${JSON.stringify(commitSha)};\nexport const defaultCatalogGitCommitDate = ${JSON.stringify(commitDate)};\n\nexport const defaultCatalog: LocalCatalog = ${JSON.stringify(catalog, null, 2)};\n`;
fs.writeFileSync(outputPath, output, "utf8");
console.log(`defaultCatalog: ${catalog.characters.length} characters, ${catalog.tags.length} tags`);
