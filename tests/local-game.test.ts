import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCatalogMutation,
  copyCatalog,
  createCloseMatchCatalog,
  createPlayerCatalog,
  createDefaultCatalog,
  deletePlayerCatalog,
  loadCatalogLibrary,
  loadLocalCatalog,
  selectEditCatalog,
  selectPlayCatalog,
  saveLocalCatalog,
  updatePlayerCatalog,
  type LocalCatalog,
} from "../app/local-catalog";
import {
  createLocalGame,
  createNextUnlimitedGame,
  discardLocalGame,
  getElapsedMs,
  loadGameRecords,
  loadLocalGame,
  loadTimingStats,
  recordCompletedTiming,
  saveLocalGame,
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
  assert.equal(loaded.characters.length, 135);
  assert.equal(loaded.tags.length, 7);
  assert.equal(loaded.values.length, 945);
  assert.equal(loaded.tags.find((item) => item.name === "初登场年份")?.kind, "ordered");
  assert.equal(loaded.tags.find((item) => item.name === "初登场作品")?.kind, "exact");
  const closeMatchCatalog = createCloseMatchCatalog();
  const debutWorkTag = closeMatchCatalog.tags.find((item) => item.name === "初登场作品")!;
  assert.equal(debutWorkTag.kind, "exact-close");
  const reimu = closeMatchCatalog.characters.find((item) => item.name === "博丽灵梦")!;
  assert.match(
    closeMatchCatalog.values.find((item) => item.characterId === reimu.id && item.tagId === debutWorkTag.id)?.value ?? "",
    /^东方灵异传 > .*东方红魔乡/,
  );
  assert.equal(loaded.tags.find((item) => item.name === "发色")?.kind, "exact-multi");
  assert.equal(loaded.tags.find((item) => item.name === "种族")?.kind, "category-multi");
  assert.equal(loaded.tags.find((item) => item.name === "所属地点")?.kind, "category-multi");
  assert.deepEqual(loaded.characters.find((item) => item.name === "驹草山如")?.aliases, ["驹草太夫"]);
});

test("题库集合将官方题库排在玩家题库之前并分别保存游玩与编辑选择", () => {
  const storage = new MemoryStorage();
  const initial = loadCatalogLibrary(storage);
  assert.equal(initial.catalogs.length, 2);
  assert.deepEqual(initial.catalogs.map((item) => [item.name, item.official]), [
    ["东方新作题库（不含秘封）", true],
    ["东方新作题库（新版测试版）", true],
  ]);

  const first = createPlayerCatalog("玩家甲", createDefaultCatalog(), storage);
  const second = createPlayerCatalog("玩家乙", createDefaultCatalog(), storage);
  storage.setItem("dongyiba:games:v1", "旧的进行中游戏");
  selectPlayCatalog(first.id, storage);
  selectEditCatalog(second.id, storage);

  const loaded = loadCatalogLibrary(storage);
  assert.deepEqual(loaded.catalogs.map((item) => [item.name, item.official]), [
    ["东方新作题库（不含秘封）", true],
    ["东方新作题库（新版测试版）", true],
    ["玩家甲", false],
    ["玩家乙", false],
  ]);
  assert.equal(loaded.playCatalogId, first.id);
  assert.equal(loaded.editCatalogId, second.id);
  assert.equal(storage.getItem("dongyiba:games:v1"), null);
});

test("当前官方题库内容更新后会清除旧的进行中游戏", () => {
  const storage = new MemoryStorage();
  const library = loadCatalogLibrary(storage);
  const catalog = loadLocalCatalog(storage);
  saveLocalGame(createLocalGame(catalog, "daily"), storage, catalog);

  const storedLibrary = JSON.parse(storage.getItem("dongyiba:catalog-library:v2")!);
  storedLibrary.officialCatalogVersions[library.playCatalogId] = "outdated";
  storage.setItem("dongyiba:catalog-library:v2", JSON.stringify(storedLibrary));

  loadCatalogLibrary(storage);
  assert.equal(storage.getItem("dongyiba:games:v1"), null);
});

test("未游玩的官方题库更新不会清除玩家题库的进行中游戏", () => {
  const storage = new MemoryStorage();
  const player = createPlayerCatalog("玩家题库", createDefaultCatalog(), storage);
  selectPlayCatalog(player.id, storage);
  const catalog = loadLocalCatalog(storage);
  saveLocalGame(createLocalGame(catalog, "daily"), storage, catalog);

  const storedLibrary = JSON.parse(storage.getItem("dongyiba:catalog-library:v2")!);
  for (const officialId of Object.keys(storedLibrary.officialCatalogVersions)) {
    storedLibrary.officialCatalogVersions[officialId] = "outdated";
  }
  storage.setItem("dongyiba:catalog-library:v2", JSON.stringify(storedLibrary));

  loadCatalogLibrary(storage);
  assert.notEqual(storage.getItem("dongyiba:games:v1"), null);
});

test("官方题库不能删除或直接写入，编辑副本不会改变官方内容", () => {
  const storage = new MemoryStorage();
  const official = loadCatalogLibrary(storage).catalogs[0];
  assert.throws(() => deletePlayerCatalog(official.id, storage), /官方题库不能删除/);
  assert.throws(() => updatePlayerCatalog(official.id, createDefaultCatalog(), storage), /不能直接修改/);

  const copied = copyCatalog(official.id, storage);
  const changed = applyCatalogMutation(copied.catalog, { action: "saveTag", name: "副本标签" });
  updatePlayerCatalog(copied.id, changed, storage);

  const loaded = loadCatalogLibrary(storage);
  assert.equal(loaded.catalogs[0].catalog.tags.some((tag) => tag.name === "副本标签"), false);
  assert.equal(loaded.catalogs.find((item) => item.id === copied.id)?.catalog.tags.some((tag) => tag.name === "副本标签"), true);
});

test("旧版单题库存档会迁移为玩家题库", () => {
  const storage = new MemoryStorage();
  const legacy = applyCatalogMutation(createDefaultCatalog(), { action: "saveTag", name: "旧版标签" });
  storage.setItem("dongyiba:catalog:v1", JSON.stringify(legacy));

  const loaded = loadCatalogLibrary(storage);
  assert.equal(loaded.catalogs.length, 3);
  assert.equal(loaded.catalogs[2].name, "我的题库");
  assert.equal(loaded.playCatalogId, loaded.catalogs[2].id);
  assert.equal(loadLocalCatalog(storage).tags.some((tag) => tag.name === "旧版标签"), true);
});

test("旧题库载入时自动迁移种族和活动区域的匹配方式", () => {
  const storage = new MemoryStorage();
  const legacy: LocalCatalog = {
    tags: [
      { id: 1, name: "种族", kind: "exact", unit: "", active: true },
      { id: 2, name: "活动区域", kind: "exact", unit: "", active: true },
    ],
    characters: [{ id: 1, name: "测试角色", aliases: [], active: true }],
    values: [
      { characterId: 1, tagId: 1, value: "妖怪" },
      { characterId: 1, tagId: 2, value: "博丽神社" },
    ],
  };
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
  assert.equal(withTag.tags.length, catalog.tags.length + 1);
  assert.equal(withTag.tags.some((tag) => tag.name === "瞳色"), true);
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
  assert.equal(first.guess.guessedAt, 1_000);
  assert.equal(first.guess.elapsedMs, 0);
  assert.equal(first.game.timerStartedAt, 1_000);
  assert.equal(first.game.elapsedMs, 0);
  assert.equal(getElapsedMs(first.game, 3_500), 2_500);

  const won = submitLocalGuess(catalog, first.game, answer.name, 4_000);
  assert.equal(won.ok, true);
  if (!won.ok) return;
  assert.equal(won.guess.guessedAt, 4_000);
  assert.equal(won.guess.elapsedMs, 3_000);
  assert.equal(won.game.completed, true);
  assert.equal(won.game.won, true);
  assert.equal(won.game.timerStartedAt, null);
  assert.equal(won.game.elapsedMs, 3_000);
  assert.equal(getElapsedMs(won.game, 99_000), 3_000);
});

test("退出每日挑战时放弃当局，但不影响无限模式存档", () => {
  const catalog = createDefaultCatalog();
  const storage = new MemoryStorage();
  const dailyGame = createLocalGame(catalog, "daily", 500);
  const wrong = catalog.characters.find((item) => item.active && item.id !== dailyGame.answerCharacterId)!;
  const first = submitLocalGuess(catalog, dailyGame, wrong.name, 1_000);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const unlimitedGame = createLocalGame(catalog, "unlimited", 1_500);
  saveLocalGame(first.game, storage, catalog);
  saveLocalGame(unlimitedGame, storage, catalog);

  discardLocalGame(first.game, storage);

  assert.equal(loadLocalGame("daily", catalog, storage), null);
  assert.equal(loadLocalGame("unlimited", catalog, storage)?.sessionId, unlimitedGame.sessionId);
});

test("每次猜测及其时间会以不可直接读取的格式保存到本地", () => {
  const catalog = createDefaultCatalog();
  const storage = new MemoryStorage();
  const game = createLocalGame(catalog, "unlimited");
  const guessed = catalog.characters.find((item) => item.active && item.id !== game.answerCharacterId)!;
  const result = submitLocalGuess(catalog, game, guessed.name, 1_725_000_000_123);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  saveLocalGame(result.game, storage);
  const raw = storage.getItem("dongyiba:games:v1")!;
  assert.match(raw, /^dyb-obf-v1:/);
  assert.equal(raw.includes(guessed.name), false);
  assert.equal(raw.includes(String(result.guess.guessedAt)), false);
  assert.throws(() => JSON.parse(raw));

  const restored = loadLocalGame("unlimited", catalog, storage);
  assert.equal(restored?.guesses.length, 1);
  assert.equal(restored?.guesses[0].name, guessed.name);
  assert.equal(restored?.guesses[0].guessedAt, 1_725_000_000_123);
  assert.equal(restored?.guesses[0].elapsedMs, 0);
});

test("完整日志实时更新并可复现包含目标角色的失败局", () => {
  const catalog = createDefaultCatalog();
  const storage = new MemoryStorage();
  let game = createLocalGame(catalog, "unlimited", 500);
  const answer = catalog.characters.find((item) => item.id === game.answerCharacterId)!;
  const wrongCharacters = catalog.characters
    .filter((item) => item.active && item.id !== answer.id)
    .slice(0, game.maxAttempts);

  saveLocalGame(game, storage, catalog);
  assert.equal(loadGameRecords(storage).length, 1);
  assert.equal(loadGameRecords(storage)[0].guesses.length, 0);

  for (const [index, character] of wrongCharacters.entries()) {
    const result = submitLocalGuess(catalog, game, character.name, (index + 1) * 1_000);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    game = result.game;
    saveLocalGame(game, storage, catalog);
    assert.equal(loadGameRecords(storage).length, 1);
    assert.equal(loadGameRecords(storage)[0].guesses.length, index + 1);
  }

  const record = loadGameRecords(storage)[0];
  assert.equal(record.sessionId, game.sessionId);
  assert.equal(record.createdAt, 500);
  assert.equal(record.startedAt, 1_000);
  assert.equal(record.updatedAt, 8_000);
  assert.equal(record.completedAt, 8_000);
  assert.equal(record.answerCharacterId, answer.id);
  assert.equal(record.answerName, answer.name);
  assert.deepEqual(record.candidateNames, game.names);
  assert.deepEqual(record.tags, game.tags);
  assert.equal(record.completed, true);
  assert.equal(record.won, false);
  assert.equal(record.durationMs, 7_000);
  assert.deepEqual(record.guesses.map((guess) => guess.guessedAt), [1_000, 2_000, 3_000, 4_000, 5_000, 6_000, 7_000, 8_000]);
  assert.deepEqual(record.guesses.map((guess) => guess.elapsedMs), [0, 1_000, 2_000, 3_000, 4_000, 5_000, 6_000, 7_000]);
  assert.equal(record.guesses.every((guess) => guess.feedback.length === game.tags.length), true);

  const raw = storage.getItem("dongyiba:game-records:v1")!;
  assert.match(raw, /^dyb-obf-v1:/);
  assert.equal(raw.includes(answer.name), false);
  assert.throws(() => JSON.parse(raw));
});

test("进入无限模式下一轮后仍保留上一局的完整日志", () => {
  const catalog = createDefaultCatalog();
  const storage = new MemoryStorage();
  const firstGame = createLocalGame(catalog, "unlimited", 1_000);
  const firstAnswer = catalog.characters.find((item) => item.id === firstGame.answerCharacterId)!;
  const won = submitLocalGuess(catalog, firstGame, firstAnswer.name, 2_000);
  assert.equal(won.ok, true);
  if (!won.ok) return;
  saveLocalGame(won.game, storage, catalog);

  const nextGame = createNextUnlimitedGame(catalog, won.game, 3_000);
  saveLocalGame(nextGame, storage, catalog);
  const records = loadGameRecords(storage);

  assert.equal(records.length, 2);
  assert.deepEqual(records.map((record) => record.sessionId), [won.game.sessionId, nextGame.sessionId]);
  assert.equal(records[0].answerName, firstAnswer.name);
  assert.equal(records[0].guesses.length, 1);
  assert.equal(records[0].completed, true);
  assert.equal(records[1].guesses.length, 0);
  assert.equal(records[1].completed, false);
  assert.equal(records[1].unlimitedRunId, records[0].unlimitedRunId);
  assert.equal(records[1].unlimitedRound, 2);
});

test("旧版明文游戏存档仍可读取，并在下次保存时转为混淆格式", () => {
  const catalog = createDefaultCatalog();
  const storage = new MemoryStorage();
  const game = createLocalGame(catalog, "unlimited");
  const answer = catalog.characters.find((item) => item.id === game.answerCharacterId)!;
  const guessed = catalog.characters.find((item) => item.active && item.id !== game.answerCharacterId)!;
  const result = submitLocalGuess(catalog, game, guessed.name, 2_000);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const legacyGuess = { ...result.guess } as Partial<typeof result.guess>;
  delete legacyGuess.guessedAt;
  delete legacyGuess.elapsedMs;
  const legacyGame = { ...result.game } as Partial<typeof result.game>;
  delete legacyGame.createdAt;
  storage.setItem("dongyiba:games:v1", JSON.stringify({
    unlimited: { ...legacyGame, guesses: [legacyGuess] },
  }));

  const restored = loadLocalGame("unlimited", catalog, storage);
  assert.equal(restored?.guesses[0].guessedAt, null);
  assert.equal(restored?.guesses[0].elapsedMs, null);
  assert.equal(restored?.createdAt, null);
  saveLocalGame(restored!, storage, catalog);
  assert.match(storage.getItem("dongyiba:games:v1")!, /^dyb-obf-v1:/);
  assert.equal(loadGameRecords(storage)[0].answerName, answer.name);
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
  assert.deepEqual(preview.tagKinds, catalog.tags.map((tag) => tag.kind));
  assert.equal(preview.rows.length, catalog.characters.length);
  assert.equal(preview.rows[0][0], catalog.characters[0].name);

  const addition = parseCatalogCsv([
    preview.headers.join(","),
    ["测试角色", "测试、测测", "是", ...catalog.tags.map((tag) => (
      tag.kind === "ordered" ? "2026" : tag.kind === "category-multi" ? "测试大类" : "测试值"
    ))].join(","),
  ].join("\r\n"));
  const added = importCatalogCsv(catalog, addition, "append");
  assert.equal(added.characters.length, catalog.characters.length + 1);
  const character = added.characters.find((item) => item.name === "测试角色")!;
  assert.deepEqual(character.aliases, ["测试", "测测"]);
  assert.equal(added.values.filter((item) => item.characterId === character.id).length, catalog.tags.length);
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
  const headers = [
    "角色名",
    "别名",
    "启用",
    ...catalog.tags.map((tag) => `${tag.name}（类型：${tag.name === "初登场年份" ? "exact" : tag.kind}）`),
  ];
  const sameNameDifferentKind = parseCatalogCsv(
    [
      headers.join(","),
      ["测试角色", "", "是", ...catalog.tags.map((tag) => (
        tag.name === "初登场年份" ? "2026" : tag.kind === "category-multi" ? "测试大类" : "测试值"
      ))].join(","),
    ].join("\n"),
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

test("完全+接近匹配可保存并通过 CSV 往返，且兼容无后续标签的值", () => {
  const catalog = applyCatalogMutation(createDefaultCatalog(), {
    action: "saveTag",
    name: "作品系列",
    kind: "exact-close",
  });
  const tag = catalog.tags.find((item) => item.name === "作品系列")!;
  const withCharacters = applyCatalogMutation(
    applyCatalogMutation(catalog, {
      action: "saveCharacter",
      name: "接近测试角色",
      values: { [String(tag.id)]: "红魔乡 > 妖妖梦 | 永夜抄" },
    }),
    {
      action: "saveCharacter",
      name: "旧格式测试角色",
      values: { [String(tag.id)]: "红魔乡" },
    },
  );

  const imported = importCatalogCsv(withCharacters, parseCatalogCsv(exportCatalogCsv(withCharacters)), "replace");
  const importedTag = imported.tags.find((item) => item.name === "作品系列")!;
  assert.equal(importedTag.kind, "exact-close");
  assert.deepEqual(
    ["接近测试角色", "旧格式测试角色"].map((name) => {
      const character = imported.characters.find((item) => item.name === name)!;
      return imported.values.find((item) => item.characterId === character.id && item.tagId === importedTag.id)?.value;
    }),
    ["红魔乡 > 妖妖梦 | 永夜抄", "红魔乡"],
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
