import fs from "node:fs";

const filePath = "db/touhou_meikan.csv";
const source = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
const rows = [];
let row = [];
let field = "";
let quoted = false;
for (let index = 0; index < source.length; index += 1) {
  const character = source[index];
  if (quoted) {
    if (character === '"' && source[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = false;
    } else {
      field += character;
    }
  } else if (character === '"') {
    quoted = true;
  } else if (character === ",") {
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
if (field || row.length) {
  row.push(field);
  rows.push(row);
}

const expectedHeaders = [
  "角色名", "别名", "启用",
  "初登场作品（类型：exact）", "发色（类型：exact-multi）", "所属地点（类型：exact-multi）",
  "种族（类型：category-multi）", "是自机吗？（类型：category-multi）",
];
if (JSON.stringify(rows[0]) !== JSON.stringify(expectedHeaders)) {
  throw new Error(`表头不匹配：${JSON.stringify(rows[0])}`);
}
const dataRows = rows.slice(1).filter((item) => item.some((cell) => cell.trim() !== ""));
if (dataRows.length !== 133) throw new Error(`行数应为 133，实际为 ${dataRows.length}`);
const names = dataRows.map((item) => item[0]);
if (new Set(names).size !== names.length) throw new Error("存在重复角色名。");
const roots = new Set(["人类", "妖怪", "神明"]);
const playRoots = new Set(["是", "不是"]);
for (const [index, item] of dataRows.entries()) {
  if (item.length !== expectedHeaders.length) throw new Error(`第 ${index + 2} 行列数不为 8。`);
  if (!item[0].trim() || !item[2].trim()) throw new Error(`第 ${index + 2} 行基础字段为空。`);
  if (!item[3].trim() || /^\d{4} > /.test(item[3])) throw new Error(`第 ${index + 2} 行作品字段格式错误：${item[3]}`);
  if (!item[5].trim()) throw new Error(`第 ${index + 2} 行所属地点为空。`);
  if (item[5].includes("、") || item[5].split(" | ").slice(1).some((area) => !area.trim())) {
    throw new Error(`第 ${index + 2} 行活动区域多标签格式错误：${item[5]}`);
  }
  for (const entry of item[6].split(" | ")) {
    const [category, value] = entry.split(" > ");
    if (!roots.has(category) || !value) throw new Error(`第 ${index + 2} 行种族分类错误：${entry}`);
  }
  for (const entry of item[7].split(" | ")) {
    const [category, value] = entry.split(" > ");
    if (!playRoots.has(category) || !value) throw new Error(`第 ${index + 2} 行自机分类错误：${entry}`);
    if (category === "不是" && value !== "不是") throw new Error(`第 ${index + 2} 行“不是”小类错误：${entry}`);
    if (category === "是" && !["是弹幕作", "是格斗作"].includes(value)) throw new Error(`第 ${index + 2} 行自机小类错误：${entry}`);
  }
  if (item.some((cell) => /__(WORK|PLAYABLE)_/.test(cell))) throw new Error(`第 ${index + 2} 行残留占位符。`);
}
console.log(`validatedRows=${dataRows.length} uniqueNames=${new Set(names).size}`);
