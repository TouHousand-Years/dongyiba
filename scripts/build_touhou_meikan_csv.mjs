import fs from "node:fs";
import path from "node:path";

const outputPath = path.resolve("db/touhou_meikan.csv");

const WORKS = [
  ["__TH01__", "东方灵异传", ["博丽灵梦"]],
  ["__TH02__", "东方封魔录", ["雾雨魔理沙"]],
  ["__TH04__", "东方幻想乡", ["风见幽香"]],
  ["__TH05__", "东方怪绮谈", ["爱丽丝·玛格特洛依德"]],
  ["__TH06__", "东方红魔乡", ["露米娅", "琪露诺", "红美铃", "帕秋莉·诺蕾姬", "十六夜咲夜", "蕾米莉亚·斯卡蕾特", "芙兰朵露·斯卡蕾特", "大妖精", "小恶魔"]],
  ["__TH07__", "东方妖妖梦", ["莉莉霍瓦特", "蕾蒂·霍瓦特洛克", "橙", "露娜萨·普莉兹姆利巴", "梅露兰·普莉兹姆利巴", "莉莉卡·普莉兹姆利巴", "西行寺幽幽子", "魂魄妖梦", "八云紫", "八云蓝"]],
  ["__TH08__", "东方永夜抄", ["莉格露·奈特巴格", "米斯蒂娅·萝蕾拉", "上白泽慧音", "铃仙·优昙华院·因幡", "因幡天为", "八意永琳", "蓬莱山辉夜", "藤原妹红"]],
  ["__TH075__", "东方萃梦想", ["伊吹萃香"]],
  ["__PRINT_AYA__", "东方文花帖（书籍）", ["射命丸文"]],
  ["__TH09__", "东方花映塚", ["梅蒂欣·梅兰可莉", "小野塚小町", "四季映姬·夜摩仙那度"]],
  ["__TH10__", "东方风神录", ["秋静叶", "秋穰子", "键山雏", "河城荷取", "东风谷早苗", "八坂神奈子", "洩矢诹访子", "犬走椛"]],
  ["__TH105__", "东方绯想天", ["永江衣玖", "比那名居天子"]],
  ["__TH11__", "东方地灵殿", ["黑谷山女", "水桥帕露西", "星熊勇仪", "火焰猫燐", "灵乌路空", "古明地觉", "古明地恋", "琪斯美"]],
  ["__TH12__", "东方星莲船", ["多多良小伞", "村纱水蜜", "娜兹玲", "寅丸星", "圣白莲", "封兽鵺", "云居一轮", "云山"]],
  ["__TH125__", "东方文花帖DS（Double Spoiler）", ["姬海棠果"]],
  ["__TH13__", "东方神灵庙", ["幽谷响子", "霍青娥", "宫古芳香", "物部布都", "苏我屠自古", "丰聪耳神子", "二岩猯藏"]],
  ["__TH135__", "东方心绮楼", ["秦心"]],
  ["__TH14__", "东方辉针城", ["若鹭姬", "赤蛮奇", "今泉影狼", "九十九弁弁", "九十九八桥", "鬼人正邪", "少名针妙丸", "堀川雷鼓"]],
  ["__TH145__", "东方深秘录", ["宇佐见堇子"]],
  ["__TH15__", "东方绀珠传", ["清兰", "铃瑚", "哆来咪·苏伊特", "稀神探女", "纯狐", "赫卡提亚·拉碧斯拉祖利", "克劳恩皮丝"]],
  ["__TH155__", "东方凭依华", ["依神紫苑", "依神女苑"]],
  ["__TH16__", "东方天空璋", ["爱塔妮缇拉尔瓦", "坂田合欢", "高丽野阿吽", "矢田寺成美", "尔子田里乃", "丁礼田舞", "摩多罗隐岐奈"]],
  ["__TH17__", "东方鬼形兽", ["戎璎花", "牛崎润美", "庭渡久侘歌", "吉吊八千慧", "杖刀偶磨弓", "埴安神袿姬", "骊驹早鬼"]],
  ["__KOURINDOU__", "东方香霖堂", ["森近霖之助"]],
  ["__SANGETSUSEI__", "东方三月精", ["桑尼米尔克", "露娜切露德", "斯塔萨菲雅"]],
  ["__AKYUU__", "东方求闻史纪", ["稗田阿求"]],
  ["__BOUGETSU__", "东方儚月抄", ["绵月丰姬", "绵月依姬", "Reisen"]],
  ["__KASEN__", "东方茨歌仙", ["茨木华扇"]],
  ["__KOSUZU__", "东方铃奈庵", ["本居小铃"]],
  ["__MIYOI__", "东方醉蝶华", ["奥野田美宵"]],
];

const DANMAKU = "是 > 是弹幕作";
const FIGHTING = "是 > 是格斗作";

// 按作品批次登记可操作角色，再把同一角色在不同作品中的类型合并到 CSV。
// 这里只列入《东方人妖名鉴》当前表格中的角色；同一角色出现在多部作品是允许的。
const PLAYABLE_WORKS = [
  { placeholder: "__TH02__", title: "东方封魔录", type: DANMAKU, playable: ["博丽灵梦"] },
  { placeholder: "__TH03__", title: "东方梦时空", type: DANMAKU, playable: ["博丽灵梦", "雾雨魔理沙"] },
  { placeholder: "__TH04__", title: "东方幻想乡", type: DANMAKU, playable: ["博丽灵梦", "雾雨魔理沙"] },
  { placeholder: "__TH05__", title: "东方怪绮谈", type: DANMAKU, playable: [
    "博丽灵梦", "雾雨魔理沙", "风见幽香", "爱丽丝·玛格特洛依德"
  ] },
  { placeholder: "__TH06__", title: "东方红魔乡", type: DANMAKU, playable: ["博丽灵梦", "雾雨魔理沙"] },
  { placeholder: "__TH07__", title: "东方妖妖梦", type: DANMAKU, playable: ["博丽灵梦", "雾雨魔理沙", "十六夜咲夜"] },
  { placeholder: "__TH075__", title: "东方萃梦想", type: FIGHTING, playable: [
    "博丽灵梦", "雾雨魔理沙", "十六夜咲夜", "爱丽丝·玛格特洛依德", "帕秋莉·诺蕾姬",
    "蕾米莉亚·斯卡蕾特", "魂魄妖梦", "西行寺幽幽子", "八云紫", "伊吹萃香"
  ] },
  { placeholder: "__TH08__", title: "东方永夜抄", type: DANMAKU, playable: [
    "博丽灵梦", "雾雨魔理沙", "十六夜咲夜", "魂魄妖梦", "八云紫", "爱丽丝·玛格特洛依德",
    "蕾米莉亚·斯卡蕾特", "西行寺幽幽子"
  ] },
  { placeholder: "__TH09__", title: "东方花映塚", type: DANMAKU, playable: [
    "博丽灵梦", "雾雨魔理沙", "十六夜咲夜", "魂魄妖梦", "铃仙·优昙华院·因幡", "因幡天为",
    "琪露诺", "露娜萨·普莉兹姆利巴", "梅露兰·普莉兹姆利巴", "莉莉卡·普莉兹姆利巴",
    "米斯蒂娅·萝蕾拉", "射命丸文", "梅蒂欣·梅兰可莉", "风见幽香", "小野塚小町",
    "四季映姬·夜摩仙那度"
  ] },
  { placeholder: "__TH095__", title: "东方文花帖", type: DANMAKU, playable: ["射命丸文"] },
  { placeholder: "__TH10__", title: "东方风神录", type: DANMAKU, playable: ["博丽灵梦", "雾雨魔理沙"] },
  { placeholder: "__TH105__", title: "东方绯想天", type: FIGHTING, playable: [
    "博丽灵梦", "雾雨魔理沙", "十六夜咲夜", "爱丽丝·玛格特洛依德", "帕秋莉·诺蕾姬", "魂魄妖梦",
    "蕾米莉亚·斯卡蕾特", "西行寺幽幽子", "八云紫", "伊吹萃香", "铃仙·优昙华院·因幡", "射命丸文",
    "小野塚小町", "永江衣玖", "比那名居天子"
  ] },
  { placeholder: "__TH11__", title: "东方地灵殿", type: DANMAKU, playable: ["博丽灵梦", "雾雨魔理沙"] },
  { placeholder: "__TH12__", title: "东方星莲船", type: DANMAKU, playable: ["博丽灵梦", "雾雨魔理沙", "东风谷早苗"] },
  { placeholder: "__TH123__", title: "东方非想天则", type: FIGHTING, playable: [
    "博丽灵梦", "雾雨魔理沙", "十六夜咲夜", "爱丽丝·玛格特洛依德", "帕秋莉·诺蕾姬", "魂魄妖梦",
    "蕾米莉亚·斯卡蕾特", "西行寺幽幽子", "八云紫", "伊吹萃香", "铃仙·优昙华院·因幡", "射命丸文",
    "小野塚小町", "永江衣玖", "比那名居天子", "东风谷早苗", "琪露诺", "红美铃", "灵乌路空", "洩矢诹访子"
  ] },
  { placeholder: "__TH125__", title: "东方文花帖DS（Double Spoiler）", type: DANMAKU, playable: ["射命丸文", "姬海棠果"] },
  { placeholder: "__TH128__", title: "妖精大战争", type: DANMAKU, playable: ["琪露诺"] },
  { placeholder: "__TH13__", title: "东方神灵庙", type: DANMAKU, playable: [
    "博丽灵梦", "雾雨魔理沙", "东风谷早苗", "魂魄妖梦"
  ] },
  { placeholder: "__TH135__", title: "东方心绮楼", type: FIGHTING, playable: [
    "博丽灵梦", "雾雨魔理沙", "云居一轮", "圣白莲", "物部布都", "丰聪耳神子", "河城荷取",
    "古明地恋", "二岩猯藏", "秦心"
  ] },
  { placeholder: "__TH14__", title: "东方辉针城", type: DANMAKU, playable: ["博丽灵梦", "雾雨魔理沙", "十六夜咲夜"] },
  { placeholder: "__TH143__", title: "弹幕天邪鬼", type: DANMAKU, playable: ["鬼人正邪"] },
  { placeholder: "__TH145__", title: "东方深秘录", type: FIGHTING, playable: [
    "博丽灵梦", "雾雨魔理沙", "茨木华扇", "云居一轮", "圣白莲", "物部布都", "丰聪耳神子",
    "二岩猯藏", "藤原妹红", "少名针妙丸", "河城荷取", "古明地恋", "秦心", "宇佐见堇子",
    "铃仙·优昙华院·因幡"
  ] },
  { placeholder: "__TH15__", title: "东方绀珠传", type: DANMAKU, playable: [
    "博丽灵梦", "雾雨魔理沙", "东风谷早苗", "铃仙·优昙华院·因幡"
  ] },
  { placeholder: "__TH155__", title: "东方凭依华", type: FIGHTING, playable: [
    "博丽灵梦", "雾雨魔理沙", "云居一轮", "圣白莲", "物部布都", "丰聪耳神子", "河城荷取",
    "古明地恋", "二岩猯藏", "秦心", "茨木华扇", "藤原妹红", "少名针妙丸", "宇佐见堇子",
    "铃仙·优昙华院·因幡", "哆来咪·苏伊特", "比那名居天子", "八云紫", "依神女苑", "依神紫苑"
  ] },
  { placeholder: "__TH16__", title: "东方天空璋", type: DANMAKU, playable: ["博丽灵梦", "雾雨魔理沙", "琪露诺", "射命丸文"] },
  { placeholder: "__TH165__", title: "秘封噩梦日记（Violet Detector）", type: DANMAKU, playable: ["宇佐见堇子"] },
  { placeholder: "__TH17__", title: "东方鬼形兽", type: DANMAKU, playable: ["博丽灵梦", "雾雨魔理沙", "魂魄妖梦"] },
  { placeholder: "__TH18__", title: "东方虹龙洞", type: DANMAKU, playable: ["博丽灵梦", "雾雨魔理沙", "十六夜咲夜", "东风谷早苗"] },
  { placeholder: "__TH185__", title: "弹幕狂们的黑市（100th Black Market）", type: DANMAKU, playable: ["雾雨魔理沙"] },
  { placeholder: "__GOLD_RUSH__", title: "弹幕天邪鬼 Gold Rush", type: DANMAKU, playable: ["雾雨魔理沙"] },
  { placeholder: "__TH19__", title: "东方兽王园", type: DANMAKU, playable: [
    "博丽灵梦", "雾雨魔理沙", "东风谷早苗", "八云蓝", "高丽野阿吽", "娜兹玲", "清兰", "火焰猫燐",
    "二岩猯藏", "吉吊八千慧", "骊驹早鬼", "伊吹萃香"
  ] },
];

function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const text = source.replace(/^\uFEFF/, "");
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
  return rows.filter((item) => item.some((cell) => cell.trim() !== ""));
}

function csvCell(value) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

const sourceRows = parseCsv(fs.readFileSync(outputPath, "utf8"));
if (sourceRows.length < 2) throw new Error("题库 CSV 为空，无法解析作品占位符。");
const headers = sourceRows[0];
if (headers[0] !== "角色名" || headers[3] !== "初登场作品（类型：exact）") {
  throw new Error("题库 CSV 表头不符合项目格式。");
}

const mode = process.argv[2] ?? "resolve";
if (mode === "prepare") {
  const rows = sourceRows.slice(1).map((row) => {
    const next = [...row];
    next[3] = "__WORK_PENDING__";
    next[7] = "__PLAYABLE_PENDING__";
    return next;
  });
  const output = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
  fs.writeFileSync(outputPath, output, "utf8");
  console.log(`placeholderRows=${rows.length}`);
  process.exit(0);
}

const placeholderByCharacter = new Map();
const titleByPlaceholder = new Map();
for (const [placeholder, title, members] of WORKS) {
  if (titleByPlaceholder.has(placeholder)) throw new Error(`作品占位符重复：${placeholder}`);
  titleByPlaceholder.set(placeholder, title);
  for (const member of members) {
    if (placeholderByCharacter.has(member)) throw new Error(`角色被重复归入作品：${member}`);
    placeholderByCharacter.set(member, placeholder);
  }
}

const names = new Set(sourceRows.slice(1).map((row) => row[0]));
const missingFromTable = [...placeholderByCharacter.keys()].filter((name) => !names.has(name));
const missingFromWorks = [...names].filter((name) => !placeholderByCharacter.has(name));
if (missingFromTable.length) throw new Error(`作品清单中的角色尚未写入表格：${missingFromTable.join("、")}`);
if (missingFromWorks.length) throw new Error(`表格角色尚未归入任何作品：${missingFromWorks.join("、")}`);

const playableByCharacter = new Map();
const seenPlayableWorks = new Set();
for (const work of PLAYABLE_WORKS) {
  if (seenPlayableWorks.has(work.placeholder)) throw new Error(`自机作品占位符重复：${work.placeholder}`);
  seenPlayableWorks.add(work.placeholder);
  if (![DANMAKU, FIGHTING].includes(work.type)) throw new Error(`自机作品类型无效：${work.title}`);
  const seenMembers = new Set();
  for (const member of work.playable) {
    if (!names.has(member)) throw new Error(`作品“${work.title}”的自机尚未写入表格：${member}`);
    if (seenMembers.has(member)) throw new Error(`作品“${work.title}”的自机重复：${member}`);
    seenMembers.add(member);
    const types = playableByCharacter.get(member) ?? new Set();
    types.add(work.type);
    playableByCharacter.set(member, types);
  }
}
for (const name of names) {
  const types = playableByCharacter.get(name);
  if (!types) {
    playableByCharacter.set(name, "不是 > 不是");
    continue;
  }
  const orderedTypes = [DANMAKU, FIGHTING].filter((type) => types.has(type));
  playableByCharacter.set(name, orderedTypes.join(" | "));
}

// 先把每一行映射到按作品批次建立的占位符，再统一解析为最终标签。
const rows = sourceRows.slice(1).map((row) => {
  const placeholder = placeholderByCharacter.get(row[0]);
  const resolvedWork = titleByPlaceholder.get(placeholder);
  if (!resolvedWork) throw new Error(`无法解析角色的作品占位符：${row[0]}`);
  const next = [...row];
  next[3] = resolvedWork;
  next[7] = playableByCharacter.get(row[0]);
  return next;
});

const output = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
fs.writeFileSync(outputPath, output, "utf8");
console.log(`resolvedRows=${rows.length} debutWorks=${WORKS.length} playableWorks=${PLAYABLE_WORKS.length}`);
