import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("玩家首页使用真实游戏组件和正式元数据", async () => {
  const [page, layout, game] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game-board.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<GameBoard \/>/);
  assert.match(layout, /东方一把｜猜东方 Project 角色/);
  assert.match(layout, /og\.png/);
  assert.match(game, /每日挑战/);
  assert.match(game, /无限模式/);
  assert.match(game, /本地模式/);
  assert.doesNotMatch(game, /fetch\(/);
  assert.doesNotMatch(`${page}${layout}${game}`, /codex-preview|react-loading-skeleton/);
});

test("游戏页与后台共用本地题库，不请求远程服务", async () => {
  const [panel, catalog, game] = await Promise.all([
    readFile(new URL("../app/admin/panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/local-catalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/local-game.ts", import.meta.url), "utf8"),
  ]);
  assert.match(panel, /saveLocalCatalog/);
  assert.match(panel, /恢复默认题库/);
  assert.match(panel, /添加到当前题库/);
  assert.match(panel, /替换当前题库/);
  assert.match(panel, /导出当前题库/);
  assert.match(catalog, /dongyiba:catalog:v1/);
  assert.match(catalog, /博丽灵梦/);
  assert.match(game, /submitLocalGuess/);
  assert.match(game, /dongyiba:games:v1/);
  assert.doesNotMatch(`${panel}${game}`, /fetch\(/);
});

test("提供双击启动本地网页的快捷脚本", async () => {
  const [launcher, script] = await Promise.all([
    readFile(new URL("../启动东方一把.cmd", import.meta.url), "utf8"),
    readFile(new URL("../scripts/start-local.ps1", import.meta.url), "utf8"),
  ]);
  assert.match(launcher, /scripts\\start-local\.ps1/);
  assert.match(script, /localhost:\$port/);
  assert.match(script, /Start-Process \$localUrl/);
});
