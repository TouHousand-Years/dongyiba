import fs from "node:fs";

const filePath = process.argv[2] ?? "db/东一把题库.csv";
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

const workHeader = rows[0]?.[4] ?? "";
if (!/^初登场作品（类型：(exact|exact-close)）$/.test(workHeader)) {
  throw new Error(`初登场作品表头类型错误：${workHeader}`);
}
const expectedHeaders = [
  "角色名", "别名", "启用",
  "初登场年份（类型：ordered）", workHeader, "发色（类型：exact-multi）",
  "是敌人吗？（仅整数非对战新作）（类型：category-multi）", "是自机吗？（类型：category-multi）",
  "所属地点（类型：category-multi）", "种族（类型：category-multi）",
];
if (JSON.stringify(rows[0]) !== JSON.stringify(expectedHeaders)) {
  throw new Error(`表头不匹配：${JSON.stringify(rows[0])}`);
}
const dataRows = rows.slice(1).filter((item) => item.some((cell) => cell.trim() !== ""));
if (dataRows.length !== 135) throw new Error(`行数应为 135，实际为 ${dataRows.length}`);
const names = dataRows.map((item) => item[0]);
if (new Set(names).size !== names.length) throw new Error("存在重复角色名。");
const roots = new Set(["人类", "妖怪", "神明"]);
const playRoots = new Set(["是", "不是"]);
const yearColumn = expectedHeaders.indexOf("初登场年份（类型：ordered）");
const workColumn = expectedHeaders.indexOf(workHeader);
const enemyColumn = expectedHeaders.indexOf("是敌人吗？（仅整数非对战新作）（类型：category-multi）");
const playableColumn = expectedHeaders.indexOf("是自机吗？（类型：category-multi）");
const locationColumn = expectedHeaders.indexOf("所属地点（类型：category-multi）");
const raceColumn = expectedHeaders.indexOf("种族（类型：category-multi）");
for (const [index, item] of dataRows.entries()) {
  if (item.length !== expectedHeaders.length) throw new Error(`第 ${index + 2} 行列数不为 ${expectedHeaders.length}。`);
  if (!item[0].trim() || !item[2].trim()) throw new Error(`第 ${index + 2} 行基础字段为空。`);
  if (!item[workColumn].trim()) throw new Error(`第 ${index + 2} 行作品字段为空。`);
  if (workHeader.endsWith("exact-close）") && !/^[^>|]+(?: > [^|]+(?: \| [^|]+)*)?$/.test(item[workColumn])) {
    throw new Error(`第 ${index + 2} 行初登场作品完全+接近匹配格式错误：${item[workColumn]}`);
  }
  if (!/^\d{4}$/.test(item[yearColumn])) throw new Error(`第 ${index + 2} 行初登场年份格式错误：${item[yearColumn]}`);
  if (!item[locationColumn].trim()) throw new Error(`第 ${index + 2} 行所属地点为空。`);
  if (item[locationColumn].includes("、") || item[locationColumn].split(" | ").some((area) => !area.trim())) {
    throw new Error(`第 ${index + 2} 行所属地点多标签格式错误：${item[locationColumn]}`);
  }
  for (const entry of item[raceColumn].split(" | ")) {
    const [category, value] = entry.split(" > ");
    if (!roots.has(category) || (entry.includes(" > ") && !value)) throw new Error(`第 ${index + 2} 行种族分类错误：${entry}`);
  }
  for (const entry of item[playableColumn].split(" | ")) {
    const [category, value] = entry.split(" > ");
    if (!playRoots.has(category)) throw new Error(`第 ${index + 2} 行自机分类错误：${entry}`);
    if (category === "不是" && value && value !== "不是") throw new Error(`第 ${index + 2} 行“不是”小类错误：${entry}`);
    if (category === "是" && !["是弹幕作", "是格斗作"].includes(value)) throw new Error(`第 ${index + 2} 行自机小类错误：${entry}`);
  }
  for (const entry of item[enemyColumn].split(" | ")) {
    const [category, value] = entry.split(" > ");
    if (!["是", "不是"].includes(category)) throw new Error(`第 ${index + 2} 行敌人分类错误：${entry}`);
    if (category === "不是" && value && value !== "不是") throw new Error(`第 ${index + 2} 行“不是”敌人小类错误：${entry}`);
    if (category === "是" && value !== "是EX/PH面" && !/^是第\d+面$/.test(value)) {
      throw new Error(`第 ${index + 2} 行“是”敌人小类错误：${entry}`);
    }
  }
  if (item.some((cell) => /__(WORK|PLAYABLE)_/.test(cell))) throw new Error(`第 ${index + 2} 行残留占位符。`);
}
console.log(`validatedRows=${dataRows.length} uniqueNames=${new Set(names).size}`);
