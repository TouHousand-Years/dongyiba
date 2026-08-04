import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCatalogMutation,
  createDefaultCatalog,
  loadLocalCatalog,
  saveLocalCatalog,
} from "../app/local-catalog";
import {
  createLocalGame,
  createNextUnlimitedGame,
  getElapsedMs,
  loadTimingStats,
  recordCompletedTiming,
  submitLocalGuess,
} from "../app/local-game";
import {
  exportCatalogCsv,
  hasSameCsvHeaders,
  importCatalogCsv,
  parseCatalogCsv,
} from "../app/catalog-csv";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

test("默认题库可以在本地存储中读写", () => {
  const storage = new MemoryStorage();
  const catalog = createDefaultCatalog();
  saveLocalCatalog(catalog, storage);

  const loaded = loadLocalCatalog(storage);
  assert.equal(loaded.characters.length, 20);
  assert.equal(loaded.tags.length, 5);
  assert.equal(loaded.values.length, 100);
  assert.equal(loaded.tags.find((item) => item.name === "种族")?.kind, "category-multi");
  assert.equal(loaded.tags.find((item) => item.name === "活动区域")?.kind, "exact-multi");
  assert.deepEqual(loaded.characters.find((item) => item.name === "琪露诺")?.aliases, ["⑨"]);
});

test("旧题库载入时自动迁移种族和活动区域的匹配方式", () => {
  const storage = new MemoryStorage();
  const legacy = createDefaultCatalog();
  legacy.tags = legacy.tags.map((tag) => (
    tag.name === "种族" || tag.name === "活动区域" ? { ...tag, kind: "exact" as const } : tag
  ));
  legacy.values = legacy.values.map((item) => ({
    characterId: item.characterId,
    tagId: item.tagId,
    value: item.value,
  }));
  saveLocalCatalog(legacy, storage);

  const migrated = loadLocalCatalog(storage);
  const race = migrated.tags.find((tag) => tag.name === "种族")!;
  const area = migrated.tags.find((tag) => tag.name === "活动区域")!;
  assert.equal(race.kind, "category-multi");
  assert.equal(area.kind, "exact-multi");
  assert.equal(migrated.values.find((item) => item.tagId === race.id)?.category, "未分类");
});

test("本地后台操作会更新题库并级联清理标签值", () => {
  const catalog = createDefaultCatalog();
  const withTag = applyCatalogMutation(catalog, {
    action: "saveTag",
    name: "瞳色",
  });
  assert.deepEqual(withTag.tags.map((tag) => tag.name), ["初登场年份", "发色", "活动区域", "身份", "瞳色", "种族"]);
  const eyeColorTag = withTag.tags.find((tag) => tag.name === "瞳色")!;

  const withCharacter = applyCatalogMutation(withTag, {
    action: "saveCharacter",
    name: "测试角色",
    aliases: ["测试", "测试"],
    values: { [String(eyeColorTag.id)]: "紫色" },
  });
  const character = withCharacter.characters.find((item) => item.name === "测试角色");
  assert.deepEqual(character?.aliases, ["测试"]);
  assert.equal(withCharacter.values.some((item) => item.characterId === character?.id), true);

  const withoutTag = applyCatalogMutation(withCharacter, {
    action: "deleteTag",
    id: eyeColorTag.id,
  });
  assert.equal(withoutTag.tags.some((tag) => tag.name === "瞳色"), false);
  assert.equal(withoutTag.values.some((item) => item.tagId === eyeColorTag.id), false);
});

test("本地游戏可以用别名完成一局并返回标签反馈", () => {
  const catalog = createDefaultCatalog();
  const game = createLocalGame(catalog, "daily");
  const answer = catalog.characters.find((item) => item.id === game.answerCharacterId)!;
  const input = answer.aliases[0] ?? answer.name;
  const result = submitLocalGuess(catalog, game, input);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.answer, answer.name);
  assert.equal(result.game.completed, true);
  assert.equal(result.guess.feedback.length, game.tags.length);
  assert.equal(result.guess.feedback.every((cell) => cell.state === "match"), true);
});

test("计时在第一次有效猜测后开始，并在猜中时冻结", () => {
  const catalog = createDefaultCatalog();
  const game = createLocalGame(catalog, "unlimited");
  const answer = catalog.characters.find((item) => item.id === game.answerCharacterId)!;
  const wrong = catalog.characters.find((item) => item.active && item.id !== answer.id)!;

  const first = submitLocalGuess(catalog, game, wrong.name, 1_000);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.game.timerStartedAt, 1_000);
  assert.equal(first.game.elapsedMs, 0);
  assert.equal(getElapsedMs(first.game, 3_500), 2_500);

  const won = submitLocalGuess(catalog, first.game, answer.name, 4_000);
  assert.equal(won.ok, true);
  if (!won.ok) return;
  assert.equal(won.game.completed, true);
  assert.equal(won.game.won, true);
  assert.equal(won.game.timerStartedAt, null);
  assert.equal(won.game.elapsedMs, 3_000);
  assert.equal(getElapsedMs(won.game, 99_000), 3_000);
});

test("次数用完时计时冻结并标记为失败", () => {
  const catalog = createDefaultCatalog();
  let game = createLocalGame(catalog, "unlimited");
  const wrongCharacters = catalog.characters
    .filter((item) => item.active && item.id !== game.answerCharacterId)
    .slice(0, game.maxAttempts);

  for (const [index, character] of wrongCharacters.entries()) {
    const result = submitLocalGuess(catalog, game, character.name, (index + 1) * 1_000);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    game = result.game;
  }

  assert.equal(game.completed, true);
  assert.equal(game.won, false);
  assert.equal(game.timerStartedAt, null);
  assert.equal(game.elapsedMs, 7_000);
  assert.equal(getElapsedMs(game, 99_000), 7_000);
});

test("无限模式下一轮会保留本次游戏的累计用时与前轮记录", () => {
  const catalog = createDefaultCatalog();
  const game = createLocalGame(catalog, "unlimited");
  const answer = catalog.characters.find((item) => item.id === game.answerCharacterId)!;
  const wrong = catalog.characters.find((item) => item.active && item.id !== answer.id)!;
  const first = submitLocalGuess(catalog, game, wrong.name, 2_000);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const won = submitLocalGuess(catalog, first.game, answer.name, 7_000);
  assert.equal(won.ok, true);
  if (!won.ok) return;

  const next = createNextUnlimitedGame(catalog, won.game);
  assert.equal(next.unlimitedRunId, game.unlimitedRunId);
  assert.equal(next.unlimitedRound, 2);
  assert.equal(next.unlimitedElapsedMs, 5_000);
  assert.deepEqual(next.unlimitedHistory, [{
    round: 1,
    answer: answer.name,
    attempts: 2,
    won: true,
    durationMs: 5_000,
  }]);
});

test("无限模式生涯计时只统计成功对局，且同一局不会重复记录", () => {
  const catalog = createDefaultCatalog();
  const storage = new MemoryStorage();
  const game = createLocalGame(catalog, "unlimited");
  const answer = catalog.characters.find((item) => item.id === game.answerCharacterId)!;
  const won = submitLocalGuess(catalog, game, answer.name, 1_000);
  assert.equal(won.ok, true);
  if (!won.ok) return;

  recordCompletedTiming(won.game, storage);
  recordCompletedTiming(won.game, storage);
  assert.deepEqual(loadTimingStats(storage).winDurationsMs, [0]);
  assert.deepEqual(loadTimingStats(storage).winAttempts, [1]);
  assert.equal(loadTimingStats(storage).completedSessionIds.length, 1);
});

test("CSV 导出后可按相同表头添加角色", () => {
  const catalog = createDefaultCatalog();
  const exported = exportCatalogCsv(catalog);
  const preview = parseCatalogCsv(exported);
  assert.equal(hasSameCsvHeaders(catalog, preview), true);
  assert.deepEqual(preview.tagKinds, ["ordered", "exact", "exact-multi", "exact", "category-multi"]);
  assert.equal(preview.rows.length, 20);
  assert.equal(preview.rows[0][0], "博丽灵梦");

  const addition = parseCatalogCsv("角色名,别名,启用,初登场年份（类型：ordered）,发色（类型：exact）,活动区域（类型：exact-multi）,身份（类型：exact）,种族（类型：category-multi）\r\n测试角色,测试、测测,是,2026,紫色,人间之里,测试员,妖怪\r\n");
  const added = importCatalogCsv(catalog, addition, "append");
  assert.equal(added.characters.length, 21);
  const character = added.characters.find((item) => item.name === "测试角色")!;
  assert.deepEqual(character.aliases, ["测试", "测测"]);
  assert.equal(added.values.filter((item) => item.characterId === character.id).length, 5);
});

test("不同 CSV 表头禁止添加，但可替换并重建标签", () => {
  const catalog = createDefaultCatalog();
  const preview = parseCatalogCsv('角色名,别名,启用,阵营（类型：category）,"称号,备注（类型：exact-multi）"\n"新,角色",简称,否,阵营 > 中立,"类别 > 带,逗号"\n');
  assert.equal(hasSameCsvHeaders(catalog, preview), false);
  assert.throws(() => importCatalogCsv(catalog, preview, "append"), /只能选择替换/);

  const replaced = importCatalogCsv(catalog, preview, "replace");
  assert.deepEqual(replaced.tags.map((tag) => tag.name), ["称号,备注", "阵营"]);
  assert.deepEqual(replaced.tags.map((tag) => tag.kind), ["exact-multi", "category"]);
  assert.equal(replaced.characters[0].name, "新,角色");
  assert.equal(replaced.characters[0].active, false);
  assert.deepEqual(replaced.values.map((item) => item.value), ["中立", "带,逗号"]);
});

test("CSV 添加只按标签名称匹配，并采用当前题库的标签类型", () => {
  const catalog = createDefaultCatalog();
  const sameNameDifferentKind = parseCatalogCsv(
    "角色名,别名,启用,初登场年份（类型：exact）,发色（类型：exact）,活动区域（类型：exact-multi）,身份（类型：exact）,种族（类型：category-multi）\n测试角色,,是,2026,紫色,人间之里,测试员,妖怪\n",
  );

  assert.equal(hasSameCsvHeaders(catalog, sameNameDifferentKind), true);
  const appended = importCatalogCsv(catalog, sameNameDifferentKind, "append");
  assert.equal(appended.tags.find((tag) => tag.name === "初登场年份")?.kind, "ordered");
  assert.equal(appended.characters.some((character) => character.name === "测试角色"), true);

  const replaced = importCatalogCsv(catalog, sameNameDifferentKind, "replace");
  assert.equal(replaced.tags.find((tag) => tag.name === "初登场年份")?.kind, "exact");
});

test("CSV 替换引起标签重排后仍可按名称正确添加", () => {
  const catalog = createDefaultCatalog();
  const replacement = parseCatalogCsv(
    "角色名,别名,启用,种族（类型：category-multi）,身份（类型：exact）,活动区域（类型：exact-multi）,发色（类型：exact）,初登场年份（类型：ordered）\n替换角色,,是,妖怪,测试员,人间之里,紫色,2025\n",
  );
  const replaced = importCatalogCsv(catalog, replacement, "replace");

  assert.equal(hasSameCsvHeaders(replaced, replacement), true);

  const addition = parseCatalogCsv(
    "角色名,别名,启用,种族（类型：category-multi）,身份（类型：exact）,活动区域（类型：exact-multi）,发色（类型：exact）,初登场年份（类型：ordered）\n添加角色,,是,神明,守矢神社,妖怪之山,蓝色,2007\n",
  );
  const appended = importCatalogCsv(replaced, addition, "append");
  const character = appended.characters.find((item) => item.name === "添加角色")!;
  const valuesByTagName = Object.fromEntries(appended.tags.map((tag) => [
    tag.name,
    (() => {
      const value = appended.values.find((item) => item.characterId === character.id && item.tagId === tag.id);
      return value?.category || value?.value;
    })(),
  ]));

  assert.deepEqual(valuesByTagName, {
    初登场年份: "2007",
    发色: "蓝色",
    活动区域: "妖怪之山",
    身份: "守矢神社",
    种族: "神明",
  });
});

test("CSV 标签列表头必须记录类型", () => {
  assert.throws(
    () => parseCatalogCsv("角色名,别名,启用,阵营\n测试角色,,是,中立\n"),
    /标签列表头.*格式无效/,
  );
});

test("按类匹配标签可保存大类和小类并通过 CSV 往返", () => {
  const catalog = applyCatalogMutation(createDefaultCatalog(), {
    action: "saveTag",
    name: "能力类型",
    kind: "category",
  });
  const tag = catalog.tags.find((item) => item.name === "能力类型")!;
  const withCharacter = applyCatalogMutation(catalog, {
    action: "saveCharacter",
    name: "分类测试角色",
    values: { [String(tag.id)]: "风" },
    categories: { [String(tag.id)]: "自然操纵" },
  });
  const character = withCharacter.characters.find((item) => item.name === "分类测试角色")!;
  const storedValue = withCharacter.values.find((item) => item.characterId === character.id && item.tagId === tag.id)!;
  assert.deepEqual(storedValue, { characterId: character.id, tagId: tag.id, value: "风", category: "自然操纵" });

  const imported = importCatalogCsv(withCharacter, parseCatalogCsv(exportCatalogCsv(withCharacter)), "replace");
  const importedTag = imported.tags.find((item) => item.name === "能力类型")!;
  const importedCharacter = imported.characters.find((item) => item.name === "分类测试角色")!;
  assert.deepEqual(
    imported.values.find((item) => item.characterId === importedCharacter.id && item.tagId === importedTag.id),
    { characterId: importedCharacter.id, tagId: importedTag.id, value: "风", category: "自然操纵" },
  );
});

test("完全匹配（多标签）可保存多个标签值并通过 CSV 往返", () => {
  const catalog = applyCatalogMutation(createDefaultCatalog(), {
    action: "saveTag",
    name: "复合属性",
    kind: "exact-multi",
  });
  const tag = catalog.tags.find((item) => item.name === "复合属性")!;
  const withCharacter = applyCatalogMutation(catalog, {
    action: "saveCharacter",
    name: "多标签测试角色",
    multiValues: { [String(tag.id)]: "风\n读心" },
  });
  const character = withCharacter.characters.find((item) => item.name === "多标签测试角色")!;
  const storedValue = withCharacter.values.find((item) => item.characterId === character.id && item.tagId === tag.id)!;
  assert.deepEqual(storedValue.entries, [
    { value: "风" },
    { value: "读心" },
  ]);

  const exported = exportCatalogCsv(withCharacter);
  assert.match(exported, /风 \| 读心/);
  const imported = importCatalogCsv(withCharacter, parseCatalogCsv(exported), "replace");
  const importedTag = imported.tags.find((item) => item.name === "复合属性")!;
  const importedCharacter = imported.characters.find((item) => item.name === "多标签测试角色")!;
  assert.deepEqual(
    imported.values.find((item) => item.characterId === importedCharacter.id && item.tagId === importedTag.id)?.entries,
    [
      { value: "风" },
      { value: "读心" },
    ],
  );
});

test("按类匹配（多标签）允许只填写大类并通过 CSV 导入", () => {
  const catalog = applyCatalogMutation(createDefaultCatalog(), {
    action: "saveTag",
    name: "分类多标签",
    kind: "category-multi",
  });
  const tag = catalog.tags.find((item) => item.name === "分类多标签")!;
  const filled = applyCatalogMutation(catalog, {
    action: "saveCharacter",
    name: "单大类角色",
    multiValues: { [String(tag.id)]: "妖怪 > 兽类\n神明" },
  });
  const character = filled.characters.find((item) => item.name === "单大类角色")!;
  const storedValue = filled.values.find((item) => item.characterId === character.id && item.tagId === tag.id)!;
  assert.deepEqual(storedValue.entries, [
    { category: "妖怪", value: "兽类" },
    { category: "神明", value: "" },
  ]);

  const imported = importCatalogCsv(
    catalog,
    parseCatalogCsv("角色名,别名,启用,分类多标签（类型：category-multi）\n导入角色,,是,妖怪\n"),
    "replace",
  );
  const importedTag = imported.tags.find((item) => item.name === "分类多标签")!;
  const importedCharacter = imported.characters.find((item) => item.name === "导入角色")!;
  assert.deepEqual(
    imported.values.find((item) => item.characterId === importedCharacter.id && item.tagId === importedTag.id),
    {
      characterId: importedCharacter.id,
      tagId: importedTag.id,
      value: "",
      category: "妖怪",
      entries: [{ category: "妖怪", value: "" }],
    },
  );
  assert.match(exportCatalogCsv(imported), /导入角色,,是,妖怪/);
});
