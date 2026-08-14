import assert from "node:assert/strict";
import test from "node:test";
import { compareGuess, normalizeName, type TagDefinition } from "../app/game-core";

const tags: TagDefinition[] = [
  { id: 1, name: "种族", kind: "exact", unit: "" },
  { id: 2, name: "初登场年份", kind: "ordered", unit: "年" },
];

test("角色别名归一化忽略空格与分隔符", () => {
  assert.equal(normalizeName(" 帕秋莉·诺蕾姬 "), normalizeName("帕秋莉诺蕾姬"));
});

test("标签比较同时支持命中、接近和方向提示", () => {
  const result = compareGuess(
    tags,
    [{ tagId: 1, value: "人类" }, { tagId: 2, value: "2002" }],
    [{ tagId: 1, value: "人类" }, { tagId: 2, value: "2007" }],
  );
  assert.deepEqual(result, [
    { tagId: 1, value: "人类", state: "match" },
    { tagId: 2, value: "2002", state: "close", direction: "higher" },
  ]);
});

test("相差较大的有序标签判为不符", () => {
  const result = compareGuess(
    tags,
    [{ tagId: 1, value: "妖怪" }, { tagId: 2, value: "1997" }],
    [{ tagId: 1, value: "人类" }, { tagId: 2, value: "2008" }],
  );
  assert.equal(result[0].state, "miss");
  assert.equal(result[1].state, "miss");
  assert.equal(result[1].direction, "higher");
});

test("完全+接近匹配区分首标签、后续标签和不匹配", () => {
  const tag: TagDefinition[] = [{ id: 3, name: "作品系列", kind: "exact-close", unit: "" }];
  const answer = [{ tagId: 3, value: "红魔乡 > 妖妖梦 | 永夜抄" }];

  assert.deepEqual(compareGuess(tag, [{ tagId: 3, value: "红魔乡" }], answer)[0], {
    tagId: 3,
    value: "红魔乡",
    state: "match",
  });
  assert.equal(compareGuess(tag, [{ tagId: 3, value: "妖妖梦" }], answer)[0].state, "close");
  assert.equal(compareGuess(tag, [{ tagId: 3, value: "风神录" }], answer)[0].state, "miss");
});

test("完全+接近匹配读取无大于号的完全匹配旧格式", () => {
  const tag: TagDefinition[] = [{ id: 3, name: "作品系列", kind: "exact-close", unit: "" }];
  const answer = [{ tagId: 3, value: "红魔乡" }];

  assert.equal(compareGuess(tag, [{ tagId: 3, value: "红魔乡" }], answer)[0].state, "match");
  assert.equal(compareGuess(tag, [{ tagId: 3, value: "妖妖梦" }], answer)[0].state, "miss");
});

test("按类匹配区分完全相同、同大类和不同大类", () => {
  const categoryTag: TagDefinition[] = [{ id: 3, name: "能力类型", kind: "category", unit: "" }];
  const answer = [{ tagId: 3, category: "自然操纵", value: "风" }];

  assert.equal(compareGuess(categoryTag, [{ tagId: 3, category: "自然操纵", value: "风" }], answer)[0].state, "match");
  assert.equal(compareGuess(categoryTag, [{ tagId: 3, category: "自然操纵", value: "水" }], answer)[0].state, "close");
  assert.equal(compareGuess(categoryTag, [{ tagId: 3, category: "精神干涉", value: "读心" }], answer)[0].state, "miss");
});

test("完全匹配（多标签）命中任意标签值并只返回命中项", () => {
  const tag: TagDefinition[] = [{ id: 4, name: "复合属性", kind: "exact-multi", unit: "" }];
  const result = compareGuess(
    tag,
    [{ tagId: 4, value: "风", entries: [
      { value: "风" },
      { value: "水" },
      { value: "读心" },
    ] }],
    [{ tagId: 4, value: "水", entries: [
      { value: "水" },
      { value: "读心" },
      { value: "祈雨" },
    ] }],
  )[0];

  assert.equal(result.state, "match");
  assert.deepEqual(result.matches, [
    { value: "水" },
    { value: "读心" },
  ]);
});

test("按类匹配（多标签）仅有大类重合时标黄，否则标灰", () => {
  const tag: TagDefinition[] = [{ id: 5, name: "复合能力", kind: "category-multi", unit: "" }];
  const answer = [{ tagId: 5, value: "火", entries: [{ category: "自然", value: "火" }] }];
  const close = compareGuess(tag, [{ tagId: 5, value: "风", entries: [
    { category: "自然", value: "风" },
    { category: "精神", value: "读心" },
  ] }], answer)[0];
  const miss = compareGuess(tag, [{ tagId: 5, value: "祈雨", entries: [{ category: "神术", value: "祈雨" }] }], answer)[0];

  assert.equal(close.state, "close");
  assert.deepEqual(close.matchedCategories, ["自然"]);
  assert.deepEqual(close.matchedValues, []);
  assert.deepEqual(miss, { tagId: 5, value: "无匹配", matchedCategories: [], matchedValues: [], state: "miss" });
});

test("按类匹配（多标签）的大类和小类可分别从不同组合命中", () => {
  const tag: TagDefinition[] = [{ id: 6, name: "多重属性", kind: "category-multi", unit: "" }];
  const result = compareGuess(
    tag,
    [{ tagId: 6, value: "风", entries: [
      { category: "自然", value: "风" },
      { category: "精神", value: "读心" },
    ] }],
    [{ tagId: 6, value: "读心", entries: [
      { category: "自然", value: "火" },
      { category: "神术", value: "读心" },
    ] }],
  )[0];

  assert.equal(result.state, "match");
  assert.deepEqual(result.matchedCategories, ["自然"]);
  assert.deepEqual(result.matchedValues, ["读心"]);
});

test("按类匹配（多标签）单独填写大类时小类视为空", () => {
  const tag: TagDefinition[] = [{ id: 7, name: "分类属性", kind: "category-multi", unit: "" }];
  const result = compareGuess(
    tag,
    [{ tagId: 7, value: "", entries: [{ category: "自然", value: "" }] }],
    [{ tagId: 7, value: "火", entries: [{ category: "自然", value: "火" }] }],
  )[0];

  assert.deepEqual(result, {
    tagId: 7,
    value: "无小类匹配",
    matchedCategories: ["自然"],
    matchedValues: [],
    state: "close",
  });
});

test("按类匹配（多标签）同大类且小类同为空时标绿", () => {
  const tag: TagDefinition[] = [{ id: 8, name: "分类属性", kind: "category-multi", unit: "" }];
  const answer = [{ tagId: 8, value: "", entries: [{ category: "自然", value: "" }] }];

  const result = compareGuess(
    tag,
    [{ tagId: 8, value: "", entries: [{ category: "自然", value: "" }] }],
    answer,
  )[0];

  assert.deepEqual(result, {
    tagId: 8,
    value: "",
    matchedCategories: ["自然"],
    matchedValues: [],
    state: "match",
  });
});
