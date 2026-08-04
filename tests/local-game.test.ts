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
  assert.deepEqual(loaded.characters.find((item) => item.name === "琪露诺")?.aliases, ["⑨"]);
});

test("本地后台操作会更新题库并级联清理标签值", () => {
  const catalog = createDefaultCatalog();
  const withTag = applyCatalogMutation(catalog, {
    action: "saveTag",
    name: "瞳色",
    sortOrder: 60,
  });
  assert.equal(withTag.tags.at(-1)?.name, "瞳色");

  const withCharacter = applyCatalogMutation(withTag, {
    action: "saveCharacter",
    name: "测试角色",
    aliases: ["测试", "测试"],
    values: { [String(withTag.tags.at(-1)?.id)]: "紫色" },
  });
  const character = withCharacter.characters.find((item) => item.name === "测试角色");
  assert.deepEqual(character?.aliases, ["测试"]);
  assert.equal(withCharacter.values.some((item) => item.characterId === character?.id), true);

  const withoutTag = applyCatalogMutation(withCharacter, {
    action: "deleteTag",
    id: withTag.tags.at(-1)!.id,
  });
  assert.equal(withoutTag.tags.some((tag) => tag.name === "瞳色"), false);
  assert.equal(withoutTag.values.some((item) => item.tagId === withTag.tags.at(-1)!.id), false);
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
  assert.equal(preview.rows.length, 20);
  assert.equal(preview.rows[0][0], "博丽灵梦");

  const addition = parseCatalogCsv("角色名,别名,启用,种族,活动区域,发色,初登场年份,身份\r\n测试角色,测试、测测,是,妖怪,人间之里,紫色,2026,测试员\r\n");
  const added = importCatalogCsv(catalog, addition, "append");
  assert.equal(added.characters.length, 21);
  const character = added.characters.find((item) => item.name === "测试角色")!;
  assert.deepEqual(character.aliases, ["测试", "测测"]);
  assert.equal(added.values.filter((item) => item.characterId === character.id).length, 5);
});

test("不同 CSV 表头禁止添加，但可替换并重建标签", () => {
  const catalog = createDefaultCatalog();
  const preview = parseCatalogCsv('角色名,别名,启用,阵营,"称号,备注"\n"新,角色",简称,否,中立,"带,逗号"\n');
  assert.equal(hasSameCsvHeaders(catalog, preview), false);
  assert.throws(() => importCatalogCsv(catalog, preview, "append"), /只能选择替换/);

  const replaced = importCatalogCsv(catalog, preview, "replace");
  assert.deepEqual(replaced.tags.map((tag) => tag.name), ["阵营", "称号,备注"]);
  assert.equal(replaced.characters[0].name, "新,角色");
  assert.equal(replaced.characters[0].active, false);
  assert.deepEqual(replaced.values.map((item) => item.value), ["中立", "带,逗号"]);
});
