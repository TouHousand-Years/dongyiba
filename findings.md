# Findings

## Repository State
- 2026-08-14：工作区初始状态干净，当前分支为 `main`。

## Discoveries
- 项目是 Next/Vinext 静态网页，`package.json` 当前版本仍为 `0.1.1`，需提升为 `0.1.2`。
- README 给出的线上仓库/站点归属为 `touhousand-years/dongyiba`，GitHub Pages 地址为 `https://touhousand-years.github.io/dongyiba/`。
- 已存在默认题库生成、更新提示和更新逻辑文件：`default-catalog.generated.ts`、`default-catalog-update.ts`、`catalog-update-notice.tsx`，应复用而非另建体系。
- 现有测试已覆盖默认题库更新，且 `npm test` 会先完成静态构建。
- 用户最终确认：应用版本和默认题库都要在启动时自动检查，并保留两个独立的手动检查操作。
- GitHub 仓库目前没有 Releases，不能依赖 `/releases/latest`；可用 `main` 分支上的 `package.json` 作为最新版来源，并把更新提醒链接到仓库主页。
- `tsconfig.json` 已启用 `resolveJsonModule`，客户端组件可以从根 `package.json` 读取单一版本号来源。
- 全局 `layout.tsx` 当前挂载自动题库提醒组件；适合替换为全局更新中心，使游戏页和后台都能显示版本并手动检查两类更新。
- 现有更新提醒 CSS 可扩展为应用版本通知和更新面板，无需新增依赖。
- 题库误报根因已复现：生成文件记录的原始工作区 SHA 为 `91747bd...`，而 `git ls-tree HEAD` 与应用 Git 文本过滤后的 SHA 均为 `ff3559e...`。Windows CRLF 在 Git Blob 中被规范化为 LF，原生成器却直接哈希 CRLF 字节。
- 当前最后一次修改 `db/东一把题库.csv` 的提交为 `7d4c1183...`，日期为 `2026-08-11`；适合显示为 `2026-08-11 (7d4c118)`。
- GitHub Actions 默认浅克隆可能没有题库最后修改记录；部署构建需要完整历史，其他无历史环境则回退显示内容 Blob 短 SHA。

## External Sources
- GitHub 仓库页面显示项目公开、默认分支为 `main`，且当前无 Releases 区目；版本检查将读取该分支的 `package.json`。
