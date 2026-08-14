import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("玩家首页使用真实游戏组件和正式元数据", async () => {
  const [page, layout, game, updateCenter, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game-board.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/update-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<GameBoard \/>/);
  assert.match(layout, /东一把｜猜东方 Project 角色/);
  assert.match(layout, /og\.png/);
  assert.match(game, /每日挑战/);
  assert.match(game, /无限模式/);
  assert.doesNotMatch(`${page}${layout}${game}`, /无需登录|无需联网|本地模式|本机浏览器|当前浏览器|本地离线/);
  assert.doesNotMatch(game, /fetch\(/);
  assert.match(layout, /<UpdateCenter \/>/);
  assert.match(updateCenter, /当前版本/);
  assert.match(updateCenter, /手动检查/);
  assert.match(updateCenter, /checkAppVersion\(false/);
  assert.match(updateCenter, /checkCatalog\(false/);
  assert.match(updateCenter, /默认题库有更新/);
  assert.match(updateCenter, /当前题库.*DEFAULT_CATALOG_VERSION/);
  assert.match(game, /document\.documentElement\.dataset\.theme = pageTheme/);
  assert.match(styles, /html\[data-theme="flandre"\] \.update-panel/);
  assert.doesNotMatch(`${page}${layout}${game}`, /codex-preview|react-loading-skeleton/);
});

test("游戏页选择游玩题库，后台点击题库进行编辑或预览", async () => {
  const [panel, catalog, game, gameBoard] = await Promise.all([
    readFile(new URL("../app/admin/panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/local-catalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/local-game.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game-board.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(panel, /loadCatalogLibrary/);
  assert.match(panel, /role="button"/);
  assert.match(panel, /openCatalog\(item\.id, item\.official\)/);
  assert.match(panel, /预览：/);
  assert.match(panel, /official-csv-table/);
  assert.match(panel, /officialTable\.headers\.map/);
  assert.match(panel, /officialTable\.rows\.map/);
  assert.match(panel, /copy-official-title/);
  assert.match(panel, /官方题库不能直接修改/);
  assert.match(panel, /新建题库/);
  assert.match(panel, /role="dialog"/);
  assert.match(panel, /aria-labelledby="create-catalog-title"/);
  assert.match(panel, /htmlFor="new-catalog-name"/);
  assert.match(panel, /创建题库/);
  assert.match(panel, /CSV 文档/);
  assert.match(panel, /保存 CSV 文档/);
  assert.match(panel, /添加到当前题库/);
  assert.match(panel, /替换当前题库/);
  assert.match(panel, /导出当前题库/);
  assert.match(panel, /标签按名称首字自动排序/);
  assert.doesNotMatch(panel, /<label>排序/);
  assert.match(catalog, /dongyiba:catalog:v1/);
  assert.match(catalog, /dongyiba:catalog-library:v2/);
  assert.match(catalog, /official:default/);
  assert.match(catalog, /default-catalog\.generated/);
  assert.match(game, /submitLocalGuess/);
  assert.match(game, /dongyiba:games:v1/);
  assert.match(gameBoard, /catalog-dropdown-trigger/);
  assert.match(gameBoard, /role="listbox"/);
  assert.match(gameBoard, /aria-selected/);
  assert.doesNotMatch(gameBoard, /<select id="play-catalog"/);
  assert.match(gameBoard, /selectPlayCatalog\(catalogId\)/);
  assert.match(gameBoard, /start\(mode, true\)/);
  assert.doesNotMatch(panel, /chooseForPlay|chooseForEdit/);
  assert.doesNotMatch(`${panel}${game}${gameBoard}`, /fetch\(/);
  assert.doesNotMatch(panel, /无需登录|无需联网|本地模式|本机浏览器|当前浏览器|本地题库/);
});

test("提供无需 Node.js 和 node_modules 的 Windows 便携版", async () => {
  const [launcher, script, packager, config, viteConfig] = await Promise.all([
    readFile(new URL("../启动东一把.cmd", import.meta.url), "utf8"),
    readFile(new URL("../scripts/start-local.ps1", import.meta.url), "utf8"),
    readFile(new URL("../scripts/build-portable.ps1", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
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
  assert.match(viteConfig, /base: isGitHubPages \? "\/dongyiba\/" : "\/"/);
});
