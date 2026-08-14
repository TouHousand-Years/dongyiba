# 版本与题库更新功能

## Goal
显示当前版本 V0.1.2；应用每次启动从 GitHub 检查新版本并在有更新时提醒；提供手动检查版本更新和更新默认题库的入口。

## Phases

### Phase 1: 现状与发布源检查
**Status:** complete
- [x] 定位应用壳、启动流程、设置或关于界面
- [x] 定位 GitHub 仓库、版本发布方式和默认题库来源
- [x] 识别现有测试与构建约束

### Phase 2: 设计与实现
**Status:** complete
- [x] 统一版本常量并显示 V0.1.2
- [x] 实现 GitHub 版本检查与启动提醒
- [x] 增加手动检查版本更新
- [x] 增加默认题库更新

### Phase 3: 验证
**Status:** complete
- [x] 添加或调整必要测试
- [x] 运行类型检查、测试和构建
- [x] 检查最终差异与用户可见行为

## Decisions Made
| Decision | Rationale |
|---|---|
| 使用 change 模式 | 用户明确要求实现功能 |
| 不新增依赖，除非现有代码无法安全完成 | 避免超出请求范围 |
| 以 GitHub `main/package.json` 为远端版本源 | 仓库当前没有 Releases，package.json 是现有打包版本的权威来源 |
| 启动时并行检查应用版本和默认题库 | 用户最终澄清二者都自动检查，并要求保留原题库提醒功能 |

## Errors Encountered
| Error | Attempt | Resolution |
|---|---|---|
| `react-hooks/set-state-in-effect` 标记启动检查调用 | 1 | 按项目现有水合模式为两处有意的异步初始化添加局部规则说明 |
| 全仓库 lint 扫描旧 `release` 构建产物与既有 CJS 脚本，产生大量既有告警/错误 | 1 | 改为对本次修改的源码和测试做定向 lint，同时保留完整测试与构建验证 |

## Next Step
全部阶段已完成。
