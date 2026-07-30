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
  assert.doesNotMatch(`${page}${layout}${game}`, /codex-preview|react-loading-skeleton/);
});

test("后台与 API 串联标签和角色管理", async () => {
  const [panel, adminApi, gameApi] = await Promise.all([
    readFile(new URL("../app/admin/panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/game/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(panel, /判定标签/);
  assert.match(panel, /角色题库/);
  assert.match(adminApi, /saveTag/);
  assert.match(adminApi, /saveCharacter/);
  assert.match(gameApi, /compareGuess/);
  assert.match(gameApi, /game_sessions/);
});
