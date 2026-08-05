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
  assert.match(layout, /东一把｜猜东方 Project 角色/);
  assert.match(layout, /og\.png/);
  assert.match(game, /每日挑战/);
  assert.match(game, /无限模式/);
  assert.doesNotMatch(`${page}${layout}${game}`, /无需登录|无需联网|本地模式|本机浏览器|当前浏览器|本地离线/);
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
  assert.match(panel, /标签按名称首字自动排序/);
  assert.doesNotMatch(panel, /<label>排序/);
  assert.match(catalog, /dongyiba:catalog:v1/);
  assert.match(catalog, /default-catalog\.generated/);
  assert.match(game, /submitLocalGuess/);
  assert.match(game, /dongyiba:games:v1/);
  assert.doesNotMatch(`${panel}${game}`, /fetch\(/);
  assert.doesNotMatch(panel, /无需登录|无需联网|本地模式|本机浏览器|当前浏览器|本地题库/);
});

test("提供无需 Node.js 和 node_modules 的 Windows 便携版", async () => {
  const [launcher, script, packager, config] = await Promise.all([
    readFile(new URL("../启动东一把.cmd", import.meta.url), "utf8"),
    readFile(new URL("../scripts/start-local.ps1", import.meta.url), "utf8"),
    readFile(new URL("../scripts/build-portable.ps1", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
  ]);
  assert.match(launcher, /scripts\\start-local\.ps1/);
  assert.match(script, /http:\/\/127\.0\.0\.1:\$port\//);
  assert.match(script, /TcpListener/);
  assert.match(script, /dist\\client/);
  assert.doesNotMatch(script, /node_modules|npm install|generate_default_catalog/);
  assert.match(packager, /start-dongyiba\.cmd/);
  assert.match(packager, /packageJson\.version/);
  assert.match(packager, /VERSION\.txt/);
  assert.match(packager, /Compress-Archive/);
  assert.match(config, /output: "export"/);
});
