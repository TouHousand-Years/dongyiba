# Progress

## 2026-08-14
- 启动实现任务。
- 采用 Stop That Shit change 边界：只实现版本展示、自动/手动版本检查、默认题库更新及必要验证。
- 创建任务计划，开始现状检查。
- 确认项目为静态 Next/Vinext 应用，已有默认题库更新模块；发现版本号仍为 0.1.1。
- 根据用户澄清，将功能拆为手动“检查版本更新”和手动“检查默认题库更新”；自动检查仅保留应用版本。
- 确认 GitHub 当前无 Releases，决定从 `main/package.json` 获取最新版，并使用全局更新中心承载版本展示和两项手动检查。
- 用户进一步确认两类更新都要自动检查；计划已调整为保留现有题库自动提醒，并新增版本自动检查与两类手动检查。
- 将包版本提升到 0.1.2，并从 `package.json` 派生显示版本 `V0.1.2`。
- 新增应用版本比较/检查模块；GitHub `main/package.json` 是远端版本源。
- 用全局更新中心替换单一题库通知：启动并行检查应用与题库、合并自动提醒、显示版本入口、提供两项独立手动检查。
- 添加应用版本检查测试并更新静态结构测试。

## Test Results
- `npm test`：通过；静态构建成功，35 项测试全部通过。
- `npm run lint`：全仓扫描失败；本次代码最初有 1 条 Effect 初始化规则错误，另有旧 `release` 产物和既有 CJS 脚本问题。已修正本次错误，待运行定向 lint。
- 首次定向 lint 无错误、仅发现 1 条多余的局部禁用注释，已移除。
- `npx eslint app/app-update.ts app/update-center.tsx app/layout.tsx tests/app-update.test.ts tests/rendered-html.test.mjs`：通过，零错误零警告。
- `npx tsc --noEmit`：通过。
- `git diff --check`：通过；仅有仓库既有的 LF/CRLF 转换提示。

## Completion
- 三个阶段全部完成：版本显示、两类启动自动检查、两类独立手动检查、合并提醒、错误降级和验证均已落实。
- 收到题库更新误报反馈，新增 Phase 4。
- 已证实误报来自 CRLF/LF 差异：原始文件 Blob SHA `91747bd...`，仓库规范化 Blob SHA `ff3559e...`。
- 修正生成器：计算 Git Blob SHA 前将 CRLF 规范化为 LF；生成 SHA 现为 `ff3559e...`，与仓库 Blob 完全一致。
- 新增换行符规范化回归测试。
- `npm test`：通过；静态构建成功，36 项测试全部通过。
- 定向 ESLint、`git diff --check`：通过。
- 用户要求在更新中心显示基于题库最后修改 Git 记录的版本，新增 Phase 5。
- 生成器现会写入题库最后修改提交的完整 SHA 与日期；更新中心显示 `当前题库 2026-08-11 (7d4c118)`。
- Pages 工作流改为完整克隆 Git 历史；无历史环境回退为内容 Blob 短 SHA。
- `npm test`：通过；静态构建成功，37 项测试全部通过。
- `npx tsc --noEmit` 与本次修改定向 ESLint：通过。
- 无 Git 历史回退路径的题库更新测试：5 项通过。

## Files Changed
- `task_plan.md`
- `findings.md`
- `progress.md`
- `package.json`
- `package-lock.json`
- `app/app-update.ts`
- `app/update-center.tsx`
- `app/layout.tsx`
- `app/globals.css`
- `tests/app-update.test.ts`
- `tests/rendered-html.test.mjs`
- 删除 `app/catalog-update-notice.tsx`

## 2026-08-14 完整逐局日志
- 启动 Phase 6；范围限定为本地完整回放日志、现有存档迁移及必要测试，不实现联网层。
- 确认现有历史只保留汇总，设计为按 `sessionId` 独立 upsert 的混淆日志。
- 明确完整日志字段：局创建/开始/更新时间、目标快照、候选与标签快照、逐次反馈、绝对/相对猜测时间、最终胜负与耗时。
- 已实现独立混淆日志存储：新局/恢复时建档，每次保存按 `sessionId` upsert，历史轮次不再被当前模式存档覆盖。
- `LocalGuess` 新增局内相对时间，`LocalGame` 新增创建时间；旧存档可从现有猜测时间推导相对时间。
- 针对性本地游戏测试 20/20 通过；TypeScript 类型检查通过。
- 回归覆盖失败局八次猜测完整回放、实时单记录 upsert、多轮历史保留、混淆保存及旧明文存档迁移。
- 定向 ESLint 通过；完整静态构建和 39 项测试全部通过。
- 最终差异检查通过；将类型检查机械更新的 `tsconfig.tsbuildinfo` 恢复，避免提交无关缓存变化。
