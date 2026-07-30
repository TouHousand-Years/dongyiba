# 东方一把

一个以东方 Project 角色为题库的网页猜谜游戏。玩家有八次机会，每次猜测会按角色标签显示命中、接近或不符；后台可维护角色、别名、标签和值。

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## 页面

- `/`：每日挑战与无限模式
- `/admin`：标签与角色题库管理
- D1：持久化题库和游戏会话

## 数据与部署

后台写操作依赖站点访问策略保护。若将站点改成公开访问，应在 `/api/admin` 前增加管理员身份校验。

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: 构建后运行核心判定与页面渲染测试
- `npm run db:generate`: generate Drizzle migrations after schema changes

