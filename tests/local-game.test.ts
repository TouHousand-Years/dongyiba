import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCatalogMutation,
  createDefaultCatalog,
  loadLocalCatalog,
  saveLocalCatalog,
} from "../app/local-catalog";
import { createLocalGame, submitLocalGuess } from "../app/local-game";
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

test("CSV 标签只有名称和类型都相同才匹配", () => {
  const catalog = createDefaultCatalog();
  const sameNameDifferentKind = parseCatalogCsv(
    "角色名,别名,启用,初登场年份（类型：exact）,发色（类型：exact）,活动区域（类型：exact-multi）,身份（类型：exact）,种族（类型：category-multi）\n测试角色,,是,2026,紫色,人间之里,测试员,妖怪\n",
  );

  assert.equal(hasSameCsvHeaders(catalog, sameNameDifferentKind), false);
  assert.throws(() => importCatalogCsv(catalog, sameNameDifferentKind, "append"), /只能选择替换/);
  const replaced = importCatalogCsv(catalog, sameNameDifferentKind, "replace");
  assert.equal(replaced.tags.find((tag) => tag.name === "初登场年份")?.kind, "exact");
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
