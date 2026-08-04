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
