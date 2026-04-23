# Campaign Tracker — 技术实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 Electron 本地桌面应用，用于管理和追踪 TTD 广告 Campaign 的全生命周期，包含 Campaign 录入、Gantt 时间轴、数据导入和 Performance Dashboard。

**Architecture:** Electron 主进程负责 SQLite 数据库操作和文件系统访问，通过 contextBridge 将 API 暴露给渲染进程。渲染进程是标准 React + Vite SPA，通过 `window.api` 调用主进程函数，无需 HTTP 服务器。

**Tech Stack:** Electron 28+, React 18, Vite 5, TypeScript 5, better-sqlite3, shadcn/ui, Tailwind CSS 3, Recharts, react-hook-form, zod, date-fns, xlsx (SheetJS), electron-builder

---

## 开发栈详细说明

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 桌面壳层 | Electron | ^28.0 | 桌面 App 容器，主进程 |
| 脚手架 | electron-vite | ^2.0 | 开发服务器 + 构建工具 |
| 前端框架 | React | ^18.0 | UI 框架 |
| 语言 | TypeScript | ^5.0 | 静态类型 |
| 构建 | Vite | ^5.0 | 渲染进程打包 |
| UI 组件 | shadcn/ui | latest | 高质量 React 组件 |
| 样式 | Tailwind CSS | ^3.0 | Utility-first CSS |
| 图表 | Recharts | ^2.0 | React 图表库 |
| 数据库 | better-sqlite3 | ^9.0 | SQLite 同步驱动（主进程） |
| 表单 | react-hook-form | ^7.0 | 表单状态管理 |
| 校验 | zod | ^3.0 | Schema 校验 |
| 日期 | date-fns | ^3.0 | 日期计算 |
| 文件解析 | xlsx (SheetJS) | ^0.18 | CSV/Excel 解析 |
| 打包 | electron-builder | ^24.0 | 生成 .exe 安装包 |
| 路由 | react-router-dom | ^6.0 | 渲染进程内页面路由 |

---

## 架构规则

### 1. 进程边界规则（最重要）

```
主进程 (src/main/)        渲染进程 (src/renderer/)
─────────────────         ──────────────────────────
better-sqlite3  ←───禁止直接访问───  React Components
文件系统 (fs)               │
dialog API                 │ 只能通过
                           ↓
                    window.api.xxx()
                    (由 preload 暴露)
```

- **渲染进程永远不能 `require('better-sqlite3')`**，也不能直接调用 Node.js API
- 所有数据操作必须通过 `ipcMain.handle` / `ipcRenderer.invoke` 通信
- `preload/index.ts` 是唯一的通信桥，使用 `contextBridge.exposeInMainWorld`

### 2. 数据访问规则

- 所有数据库操作在 `src/main/db.ts` 中，函数必须是同步的（`better-sqlite3` 是同步 API）
- 禁止在 IPC handler 之外直接操作数据库
- 每个数据库操作函数必须有明确的 TypeScript 入参和返回类型

### 3. 类型共享规则

- `src/shared/types.ts` 定义跨进程共享的数据类型（Campaign, Deal, PerformanceData）
- 主进程和渲染进程都从 `shared/types.ts` 导入类型，不重复定义
- IPC channel 名称以常量形式定义在 `src/shared/ipc-channels.ts` 中

### 4. 组件规则

- 页面组件放在 `src/renderer/src/pages/`，每个页面对应一个文件
- 可复用组件放在 `src/renderer/src/components/`
- 每个组件文件只导出一个组件（default export）
- 组件不直接调用 `window.api`，通过自定义 hook（`src/renderer/src/hooks/`）访问数据

### 5. 错误处理规则

- 所有 IPC handler 用 `try/catch` 包裹，返回 `{ success: boolean, data?: T, error?: string }` 结构
- 渲染进程检查 `result.success`，失败时显示 toast 通知，不 crash 整个界面

### 6. 样式规则

- 优先使用 shadcn/ui 组件，不自己实现已有的 UI 组件
- 颜色全部使用 Tailwind CSS 的 CSS 变量 token（`bg-background`, `text-foreground` 等），不硬编码 hex
- 深色/浅色主题通过 `class="dark"` 在 `<html>` 上切换，shadcn 自动响应

---

## 项目结构

```
Campaign Tracker/
├── src/
│   ├── main/                          # Electron 主进程
│   │   ├── index.ts                   # 主进程入口，创建窗口
│   │   ├── db.ts                      # SQLite 初始化 + 所有 CRUD 函数
│   │   └── ipc-handlers.ts            # 注册所有 ipcMain.handle
│   │
│   ├── preload/
│   │   └── index.ts                   # contextBridge 暴露 window.api
│   │
│   ├── shared/
│   │   ├── types.ts                   # 跨进程共享的 TypeScript 类型
│   │   └── ipc-channels.ts            # IPC channel 名称常量
│   │
│   └── renderer/
│       └── src/
│           ├── main.tsx               # React 入口，Router 配置
│           ├── App.tsx                # 根组件，Layout + 路由出口
│           ├── index.css              # Tailwind 指令 + shadcn 变量
│           │
│           ├── pages/
│           │   ├── Home.tsx           # 首页摘要
│           │   ├── Campaigns.tsx      # Campaign 列表页
│           │   ├── Timeline.tsx       # Gantt 时间轴页
│           │   ├── Import.tsx         # 数据导入页
│           │   ├── Dashboard.tsx      # Performance Dashboard 页
│           │   └── Settings.tsx       # 设置页（主题、备份）
│           │
│           ├── components/
│           │   ├── layout/
│           │   │   ├── Sidebar.tsx    # 左侧导航栏
│           │   │   └── Layout.tsx     # 整体布局容器
│           │   ├── campaigns/
│           │   │   ├── CampaignTable.tsx       # Campaign 列表表格
│           │   │   ├── CampaignFormDialog.tsx  # 新建/编辑表单 Dialog
│           │   │   └── DealFields.tsx          # Deal 动态字段组
│           │   ├── timeline/
│           │   │   ├── TimelineChart.tsx       # Gantt 时间轴主组件
│           │   │   ├── TimelineBar.tsx         # 单个 Campaign 条
│           │   │   └── TimelineFilters.tsx     # 过滤控制栏
│           │   ├── dashboard/
│           │   │   ├── KpiCards.tsx            # KPI 汇总卡片行
│           │   │   ├── ImpressionsChart.tsx    # 趋势折线+柱状图
│           │   │   ├── ClicksChart.tsx         # Clicks/Conversions 柱状图
│           │   │   └── SpendPieChart.tsx       # Spend 占比饼图
│           │   └── ui/                         # shadcn 生成的组件（不手动编辑）
│           │
│           ├── hooks/
│           │   ├── useCampaigns.ts    # Campaign CRUD hooks
│           │   ├── useDeals.ts        # Deal CRUD hooks
│           │   ├── usePerformance.ts  # Performance 查询 hooks
│           │   └── useTheme.ts        # 主题切换 hook
│           │
│           └── lib/
│               ├── api.ts             # 封装 window.api 的类型安全调用
│               ├── schemas.ts         # Zod 校验 schema
│               └── utils.ts           # 工具函数（格式化数字、日期等）
│
├── electron.vite.config.ts            # electron-vite 配置
├── electron-builder.yml               # 打包配置
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── PRD.md                             # 产品需求文档
├── PLAN.md                            # 本文件
└── .gitignore
```

---

## 测试与验收策略

### 验收测试方式

本项目为个人工具，采用**人工验收测试**，不写自动化单元测试（YAGNI）。

每个任务完成后，按照任务的「验收检查」逐条手动验证。最终用 PRD 中的验收标准做完整回归。

### 测试数据准备

在开发过程中，使用以下测试数据：

**测试 Campaign A（Active CTV）：**
- Name: "Nike Q2 CTV Test"
- Start: 2026-04-01, End: 2026-06-30
- Type: CTV, Client: Nike, Agency: Wavemaker
- Primary KPI: VCR, Status: Active
- Deal: "Hulu PMP", TTD-001, PMP, $15.00, Hulu

**测试 Campaign B（Ended Display）：**
- Name: "Adidas Winter Display"
- Start: 2026-01-01, End: 2026-03-31
- Type: Display, Client: Adidas, Agency: OMG
- Primary KPI: CTR, Status: Ended

**测试 Performance CSV（用于导入测试）：**
```
date,impressions,clicks,spend,ctr,vcr
2026-04-01,100000,250,1500.00,0.0025,0.65
2026-04-02,120000,300,1800.00,0.0025,0.68
2026-04-03,95000,200,1425.00,0.0021,0.62
2026-04-04,110000,275,1650.00,0.0025,0.66
2026-04-05,130000,325,1950.00,0.0025,0.70
```
（保存为 `test-data/sample-performance.csv`）

---

## 分阶段实施计划

---

### Task 1：项目脚手架初始化

**Files:**
- Create: `package.json`（自动生成）
- Create: `electron.vite.config.ts`
- Create: `tailwind.config.js`
- Create: `src/renderer/src/index.css`
- Create: `.gitignore`
- Create: `test-data/sample-performance.csv`

- [ ] **Step 1: 在 Campaign Tracker 目录初始化 electron-vite 项目**

```bash
cd "c:\Users\derrick.liu\OneDrive - The Trade Desk\Works\Campaign Tracker"
npm create @quick-start/electron@latest . -- --template react-ts
```

当询问覆盖目录时选 Yes。

- [ ] **Step 2: 安装所有项目依赖**

```bash
npm install better-sqlite3 react-router-dom recharts react-hook-form zod @hookform/resolvers date-fns xlsx
npm install -D @types/better-sqlite3 tailwindcss postcss autoprefixer electron-builder electron-rebuild
```

- [ ] **Step 3: 初始化 Tailwind CSS**

```bash
npx tailwindcss init -p
```

- [ ] **Step 4: 更新 `tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./src/renderer/src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Step 5: 更新 `src/renderer/src/index.css`，添加 Tailwind 指令**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 6: 初始化 shadcn/ui**

```bash
npx shadcn@latest init
```

选择：Style = Default，Base color = Slate，CSS variables = Yes

- [ ] **Step 7: 安装需要的 shadcn 组件**

```bash
npx shadcn@latest add button dialog sheet select input label textarea badge card separator toast
```

- [ ] **Step 8: 配置 `better-sqlite3` 的 native module 重新编译**

在 `package.json` 的 `scripts` 中添加：
```json
"postinstall": "electron-rebuild -f -w better-sqlite3"
```

执行：
```bash
npm run postinstall
```

- [ ] **Step 9: 创建测试数据文件**

创建 `test-data/sample-performance.csv`：
```
date,impressions,clicks,spend,ctr,vcr
2026-04-01,100000,250,1500.00,0.0025,0.65
2026-04-02,120000,300,1800.00,0.0025,0.68
2026-04-03,95000,200,1425.00,0.0021,0.62
2026-04-04,110000,275,1650.00,0.0025,0.66
2026-04-05,130000,325,1950.00,0.0025,0.70
```

- [ ] **Step 10: 验证开发环境可以启动**

```bash
npm run dev
```

预期：Electron 窗口打开，显示 Vite 默认页面，无 console 报错

- [ ] **Step 11: 创建 `.gitignore`**

```
node_modules/
dist/
out/
.electron-gyp/
test-data/
```

- [ ] **Step 12: 初始化 git 仓库并提交**

```bash
git init
git add .
git commit -m "feat: initialize electron-vite project with all dependencies"
```

**验收检查：**
- `npm run dev` 打开 Electron 窗口无报错
- `node_modules/better-sqlite3` 存在且已编译（目录中有 `.node` 文件）

---

### Task 2：共享类型与 IPC Channel 定义

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/ipc-channels.ts`

- [ ] **Step 1: 创建 `src/shared/types.ts`**

```typescript
export type AdType = 'CTV' | 'Display' | 'OTT' | 'Audio' | 'DOOH'
export type KpiType = 'CTR' | 'VCR' | 'Reach' | 'ROAS' | 'CPA' | 'CPM' | 'Viewability'
export type CampaignStatus = 'Draft' | 'Active' | 'Paused' | 'Ended'
export type DealType = 'PMP' | 'PG' | 'Open'

export interface Deal {
  id: number
  campaign_id: number
  deal_id: string | null
  deal_name: string | null
  deal_type: DealType | null
  floor_price: number | null
  inventory_source: string | null
  notes: string | null
}

export interface Campaign {
  id: number
  name: string
  start_date: string   // YYYY-MM-DD
  end_date: string     // YYYY-MM-DD
  type: AdType
  agency: string | null
  client: string
  primary_kpi: KpiType
  secondary_kpi: KpiType | null
  budget: number | null
  status: CampaignStatus
  notes: string | null
  created_at: string
  deals?: Deal[]
}

export interface PerformanceData {
  id: number
  campaign_id: number
  date: string
  impressions: number | null
  clicks: number | null
  spend: number | null
  ctr: number | null
  vcr: number | null
  vtr: number | null
  conversions: number | null
  custom_metrics: string | null
}

export interface IpcResponse<T = void> {
  success: boolean
  data?: T
  error?: string
}

export interface ImportRow {
  [column: string]: string | number
}

export interface ImportMapping {
  [systemField: string]: string  // systemField -> 文件列名
}

export interface ImportOptions {
  campaign_id: number
  mapping: ImportMapping
  mode: 'append' | 'overwrite'
  rows: ImportRow[]
}

export interface ImportResult {
  success_count: number
  skip_count: number
  error_count: number
  errors: string[]
}
```

- [ ] **Step 2: 创建 `src/shared/ipc-channels.ts`**

```typescript
export const IPC = {
  CAMPAIGN: {
    LIST:   'campaign:list',
    GET:    'campaign:get',
    CREATE: 'campaign:create',
    UPDATE: 'campaign:update',
    DELETE: 'campaign:delete',
  },
  DEAL: {
    LIST:   'deal:list',
    CREATE: 'deal:create',
    UPDATE: 'deal:update',
    DELETE: 'deal:delete',
  },
  PERFORMANCE: {
    QUERY:  'performance:query',
    IMPORT: 'performance:import',
  },
  DIALOG: {
    OPEN_FILE: 'dialog:open-file',
    SAVE_FILE: 'dialog:save-file',
  },
  DB: {
    BACKUP: 'db:backup',
  },
} as const
```

- [ ] **Step 3: 提交**

```bash
git add src/shared/
git commit -m "feat: add shared types and IPC channel constants"
```

**验收检查：**
- TypeScript 编译无报错（`npx tsc --noEmit`）

---

### Task 3：数据库初始化与 CRUD 函数

**Files:**
- Create: `src/main/db.ts`

- [ ] **Step 1: 创建 `src/main/db.ts`**

```typescript
import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import type { Campaign, Deal, PerformanceData, ImportOptions, ImportResult } from '../shared/types'

const DB_PATH = path.join(app.getPath('userData'), 'campaigns.db')

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH)
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')
    initSchema(_db)
  }
  return _db
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      start_date    TEXT    NOT NULL,
      end_date      TEXT    NOT NULL,
      type          TEXT    NOT NULL,
      agency        TEXT,
      client        TEXT    NOT NULL,
      primary_kpi   TEXT    NOT NULL,
      secondary_kpi TEXT,
      budget        REAL,
      status        TEXT    NOT NULL DEFAULT 'Draft',
      notes         TEXT,
      created_at    TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deals (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id      INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      deal_id          TEXT,
      deal_name        TEXT,
      deal_type        TEXT,
      floor_price      REAL,
      inventory_source TEXT,
      notes            TEXT
    );

    CREATE TABLE IF NOT EXISTS performance_data (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id  INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      date         TEXT    NOT NULL,
      impressions  INTEGER,
      clicks       INTEGER,
      spend        REAL,
      ctr          REAL,
      vcr          REAL,
      vtr          REAL,
      conversions  INTEGER,
      custom_metrics TEXT
    );
  `)
}

// ──── Campaigns ────

export function listCampaigns(): Campaign[] {
  const db = getDb()
  const campaigns = db.prepare('SELECT * FROM campaigns ORDER BY start_date DESC').all() as Campaign[]
  const dealStmt = db.prepare('SELECT * FROM deals WHERE campaign_id = ?')
  return campaigns.map(c => ({ ...c, deals: dealStmt.all(c.id) as Deal[] }))
}

export function getCampaign(id: number): Campaign | undefined {
  const db = getDb()
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) as Campaign | undefined
  if (!campaign) return undefined
  const deals = db.prepare('SELECT * FROM deals WHERE campaign_id = ?').all(id) as Deal[]
  return { ...campaign, deals }
}

export function createCampaign(data: Omit<Campaign, 'id' | 'created_at' | 'deals'>, deals: Omit<Deal, 'id' | 'campaign_id'>[]): Campaign {
  const db = getDb()
  const created_at = new Date().toISOString()

  const campaignStmt = db.prepare(`
    INSERT INTO campaigns (name, start_date, end_date, type, agency, client, primary_kpi, secondary_kpi, budget, status, notes, created_at)
    VALUES (@name, @start_date, @end_date, @type, @agency, @client, @primary_kpi, @secondary_kpi, @budget, @status, @notes, @created_at)
  `)

  const insertDeals = db.transaction((campaignId: number, ds: typeof deals) => {
    const dealStmt = db.prepare(`
      INSERT INTO deals (campaign_id, deal_id, deal_name, deal_type, floor_price, inventory_source, notes)
      VALUES (@campaign_id, @deal_id, @deal_name, @deal_type, @floor_price, @inventory_source, @notes)
    `)
    for (const d of ds) dealStmt.run({ campaign_id: campaignId, ...d })
  })

  const runAll = db.transaction(() => {
    const result = campaignStmt.run({ ...data, created_at })
    const id = result.lastInsertRowid as number
    insertDeals(id, deals)
    return getCampaign(id)!
  })

  return runAll()
}

export function updateCampaign(id: number, data: Omit<Campaign, 'id' | 'created_at' | 'deals'>, deals: Omit<Deal, 'id' | 'campaign_id'>[]): Campaign {
  const db = getDb()

  const runAll = db.transaction(() => {
    db.prepare(`
      UPDATE campaigns SET name=@name, start_date=@start_date, end_date=@end_date, type=@type,
      agency=@agency, client=@client, primary_kpi=@primary_kpi, secondary_kpi=@secondary_kpi,
      budget=@budget, status=@status, notes=@notes WHERE id=@id
    `).run({ ...data, id })

    db.prepare('DELETE FROM deals WHERE campaign_id = ?').run(id)

    const dealStmt = db.prepare(`
      INSERT INTO deals (campaign_id, deal_id, deal_name, deal_type, floor_price, inventory_source, notes)
      VALUES (@campaign_id, @deal_id, @deal_name, @deal_type, @floor_price, @inventory_source, @notes)
    `)
    for (const d of deals) dealStmt.run({ campaign_id: id, ...d })

    return getCampaign(id)!
  })

  return runAll()
}

export function deleteCampaign(id: number): void {
  getDb().prepare('DELETE FROM campaigns WHERE id = ?').run(id)
}

// ──── Performance Data ────

export function queryPerformance(campaign_id: number, from?: string, to?: string): PerformanceData[] {
  const db = getDb()
  let sql = 'SELECT * FROM performance_data WHERE campaign_id = ?'
  const params: (number | string)[] = [campaign_id]
  if (from) { sql += ' AND date >= ?'; params.push(from) }
  if (to)   { sql += ' AND date <= ?'; params.push(to) }
  sql += ' ORDER BY date ASC'
  return db.prepare(sql).all(...params) as PerformanceData[]
}

export function importPerformance(opts: ImportOptions): ImportResult {
  const db = getDb()
  const result: ImportResult = { success_count: 0, skip_count: 0, error_count: 0, errors: [] }

  const systemFields = ['impressions', 'clicks', 'spend', 'ctr', 'vcr', 'vtr', 'conversions']

  if (opts.mode === 'overwrite') {
    db.prepare('DELETE FROM performance_data WHERE campaign_id = ?').run(opts.campaign_id)
  }

  const stmt = db.prepare(`
    INSERT INTO performance_data (campaign_id, date, impressions, clicks, spend, ctr, vcr, vtr, conversions, custom_metrics)
    VALUES (@campaign_id, @date, @impressions, @clicks, @spend, @ctr, @vcr, @vtr, @conversions, @custom_metrics)
  `)

  const insert = db.transaction(() => {
    for (const row of opts.rows) {
      const dateCol = opts.mapping['date']
      const rawDate = dateCol ? String(row[dateCol]) : null
      if (!rawDate) { result.skip_count++; result.errors.push(`Row missing date value`); continue }

      const dateMatch = rawDate.match(/\d{4}-\d{2}-\d{2}/)
      if (!dateMatch) { result.skip_count++; result.errors.push(`Cannot parse date: ${rawDate}`); continue }

      const record: Record<string, number | string | null> = {
        campaign_id: opts.campaign_id,
        date: dateMatch[0],
        impressions: null, clicks: null, spend: null,
        ctr: null, vcr: null, vtr: null, conversions: null,
        custom_metrics: null,
      }

      for (const field of systemFields) {
        const col = opts.mapping[field]
        if (col && row[col] !== undefined && row[col] !== '') {
          record[field] = Number(row[col])
        }
      }

      try {
        stmt.run(record)
        result.success_count++
      } catch (e) {
        result.error_count++
        result.errors.push(String(e))
      }
    }
  })

  insert()
  return result
}

export function getDbPath(): string {
  return DB_PATH
}
```

- [ ] **Step 2: 提交**

```bash
git add src/main/db.ts
git commit -m "feat: add SQLite database initialization and CRUD functions"
```

**验收检查：**
- TypeScript 编译无报错
- （人工）主进程启动时，`userData` 目录下出现 `campaigns.db` 文件

---

### Task 4：IPC Handlers 与 Preload Bridge

**Files:**
- Create: `src/main/ipc-handlers.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Create: `src/renderer/src/lib/api.ts`

- [ ] **Step 1: 创建 `src/main/ipc-handlers.ts`**

```typescript
import { ipcMain, dialog, app } from 'electron'
import { IPC } from '../shared/ipc-channels'
import * as db from './db'
import type { IpcResponse, Campaign, Deal, ImportOptions } from '../shared/types'
import path from 'path'
import fs from 'fs'

function ok<T>(data: T): IpcResponse<T> { return { success: true, data } }
function err(error: unknown): IpcResponse { return { success: false, error: String(error) } }

export function registerHandlers(): void {
  // Campaigns
  ipcMain.handle(IPC.CAMPAIGN.LIST, () => {
    try { return ok(db.listCampaigns()) } catch (e) { return err(e) }
  })
  ipcMain.handle(IPC.CAMPAIGN.GET, (_e, id: number) => {
    try { return ok(db.getCampaign(id)) } catch (e) { return err(e) }
  })
  ipcMain.handle(IPC.CAMPAIGN.CREATE, (_e, data: Omit<Campaign, 'id' | 'created_at' | 'deals'>, deals: Omit<Deal, 'id' | 'campaign_id'>[]) => {
    try { return ok(db.createCampaign(data, deals)) } catch (e) { return err(e) }
  })
  ipcMain.handle(IPC.CAMPAIGN.UPDATE, (_e, id: number, data: Omit<Campaign, 'id' | 'created_at' | 'deals'>, deals: Omit<Deal, 'id' | 'campaign_id'>[]) => {
    try { return ok(db.updateCampaign(id, data, deals)) } catch (e) { return err(e) }
  })
  ipcMain.handle(IPC.CAMPAIGN.DELETE, (_e, id: number) => {
    try { db.deleteCampaign(id); return ok(undefined) } catch (e) { return err(e) }
  })

  // Performance
  ipcMain.handle(IPC.PERFORMANCE.QUERY, (_e, campaign_id: number, from?: string, to?: string) => {
    try { return ok(db.queryPerformance(campaign_id, from, to)) } catch (e) { return err(e) }
  })
  ipcMain.handle(IPC.PERFORMANCE.IMPORT, (_e, opts: ImportOptions) => {
    try { return ok(db.importPerformance(opts)) } catch (e) { return err(e) }
  })

  // Dialog
  ipcMain.handle(IPC.DIALOG.OPEN_FILE, async (_e, filters: Electron.FileFilter[]) => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters })
    if (result.canceled) return ok(null)
    return ok(result.filePaths[0])
  })
  ipcMain.handle(IPC.DIALOG.SAVE_FILE, async (_e, defaultName: string, content: string) => {
    const result = await dialog.showSaveDialog({ defaultPath: defaultName })
    if (result.canceled || !result.filePath) return ok(false)
    fs.writeFileSync(result.filePath, content, 'utf-8')
    return ok(true)
  })

  // DB Backup
  ipcMain.handle(IPC.DB.BACKUP, async () => {
    const result = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath('documents'), `campaigns-backup-${new Date().toISOString().slice(0,10)}.db`),
      filters: [{ name: 'SQLite', extensions: ['db'] }],
    })
    if (result.canceled || !result.filePath) return ok(false)
    fs.copyFileSync(db.getDbPath(), result.filePath)
    return ok(true)
  })
}
```

- [ ] **Step 2: 在 `src/main/index.ts` 中调用 `registerHandlers()`**

在现有的 `app.whenReady()` 回调中，窗口创建之前添加：

```typescript
import { registerHandlers } from './ipc-handlers'
// ...
app.whenReady().then(() => {
  registerHandlers()  // ← 添加这行
  createWindow()
})
```

- [ ] **Step 3: 更新 `src/preload/index.ts`**

```typescript
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'

const api = {
  campaign: {
    list:   ()                    => ipcRenderer.invoke(IPC.CAMPAIGN.LIST),
    get:    (id: number)          => ipcRenderer.invoke(IPC.CAMPAIGN.GET, id),
    create: (data: unknown, deals: unknown) => ipcRenderer.invoke(IPC.CAMPAIGN.CREATE, data, deals),
    update: (id: number, data: unknown, deals: unknown) => ipcRenderer.invoke(IPC.CAMPAIGN.UPDATE, id, data, deals),
    delete: (id: number)          => ipcRenderer.invoke(IPC.CAMPAIGN.DELETE, id),
  },
  performance: {
    query:  (campaign_id: number, from?: string, to?: string) => ipcRenderer.invoke(IPC.PERFORMANCE.QUERY, campaign_id, from, to),
    import: (opts: unknown)       => ipcRenderer.invoke(IPC.PERFORMANCE.IMPORT, opts),
  },
  dialog: {
    openFile: (filters: unknown)  => ipcRenderer.invoke(IPC.DIALOG.OPEN_FILE, filters),
    saveFile: (name: string, content: string) => ipcRenderer.invoke(IPC.DIALOG.SAVE_FILE, name, content),
  },
  db: {
    backup: () => ipcRenderer.invoke(IPC.DB.BACKUP),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
```

- [ ] **Step 4: 创建 `src/renderer/src/lib/api.ts`**

```typescript
import type { Campaign, Deal, PerformanceData, ImportOptions, ImportResult, IpcResponse } from '../../../shared/types'

declare global {
  interface Window {
    api: {
      campaign: {
        list:   () => Promise<IpcResponse<Campaign[]>>
        get:    (id: number) => Promise<IpcResponse<Campaign>>
        create: (data: Omit<Campaign, 'id' | 'created_at' | 'deals'>, deals: Omit<Deal, 'id' | 'campaign_id'>[]) => Promise<IpcResponse<Campaign>>
        update: (id: number, data: Omit<Campaign, 'id' | 'created_at' | 'deals'>, deals: Omit<Deal, 'id' | 'campaign_id'>[]) => Promise<IpcResponse<Campaign>>
        delete: (id: number) => Promise<IpcResponse>
      }
      performance: {
        query:  (campaign_id: number, from?: string, to?: string) => Promise<IpcResponse<PerformanceData[]>>
        import: (opts: ImportOptions) => Promise<IpcResponse<ImportResult>>
      }
      dialog: {
        openFile: (filters: { name: string; extensions: string[] }[]) => Promise<IpcResponse<string | null>>
        saveFile: (name: string, content: string) => Promise<IpcResponse<boolean>>
      }
      db: {
        backup: () => Promise<IpcResponse<boolean>>
      }
    }
  }
}

export const api = window.api
```

- [ ] **Step 5: 提交**

```bash
git add src/main/ipc-handlers.ts src/main/index.ts src/preload/index.ts src/renderer/src/lib/api.ts
git commit -m "feat: register IPC handlers and expose window.api via contextBridge"
```

**验收检查：**
- `npm run dev` 打开窗口无报错
- 在 DevTools Console 输入 `window.api`，能看到对象结构

---

### Task 5：全局布局与路由

**Files:**
- Modify: `src/renderer/src/main.tsx`
- Modify: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/components/layout/Sidebar.tsx`
- Create: `src/renderer/src/components/layout/Layout.tsx`
- Create: `src/renderer/src/lib/utils.ts`

- [ ] **Step 1: 安装 lucide-react（shadcn 使用的图标库）**

```bash
npm install lucide-react
```

- [ ] **Step 2: 创建 `src/renderer/src/lib/utils.ts`**

```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('en-US')
}

export function formatCurrency(n: number | null | undefined): string {
  if (n == null) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatPercent(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${(n * 100).toFixed(2)}%`
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return format(new Date(d), 'MMM d, yyyy')
}
```

- [ ] **Step 3: 创建 `src/renderer/src/components/layout/Sidebar.tsx`**

```tsx
import { NavLink } from 'react-router-dom'
import { Home, List, Calendar, Upload, BarChart2, Settings } from 'lucide-react'
import { cn } from '../../lib/utils'

const NAV_ITEMS = [
  { to: '/',          label: 'Home',       icon: Home },
  { to: '/campaigns', label: 'Campaigns',  icon: List },
  { to: '/timeline',  label: 'Timeline',   icon: Calendar },
  { to: '/import',    label: 'Import',     icon: Upload },
  { to: '/dashboard', label: 'Dashboard',  icon: BarChart2 },
  { to: '/settings',  label: 'Settings',   icon: Settings },
]

export default function Sidebar() {
  return (
    <aside className="w-52 flex-shrink-0 border-r border-border bg-card flex flex-col py-4">
      <div className="px-4 mb-6">
        <h1 className="text-sm font-semibold text-foreground">Campaign Tracker</h1>
        <p className="text-xs text-muted-foreground">TTD Ad Operations</p>
      </div>
      <nav className="flex flex-col gap-1 px-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 4: 创建 `src/renderer/src/components/layout/Layout.tsx`**

```tsx
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 5: 创建各页面占位组件**

创建 `src/renderer/src/pages/Home.tsx`：
```tsx
export default function Home() { return <div><h1 className="text-2xl font-semibold mb-4">Home</h1><p className="text-muted-foreground">Dashboard coming soon.</p></div> }
```

创建 `src/renderer/src/pages/Campaigns.tsx`：
```tsx
export default function Campaigns() { return <div><h1 className="text-2xl font-semibold">Campaigns</h1></div> }
```

创建 `src/renderer/src/pages/Timeline.tsx`：
```tsx
export default function Timeline() { return <div><h1 className="text-2xl font-semibold">Timeline</h1></div> }
```

创建 `src/renderer/src/pages/Import.tsx`：
```tsx
export default function Import() { return <div><h1 className="text-2xl font-semibold">Import</h1></div> }
```

创建 `src/renderer/src/pages/Dashboard.tsx`：
```tsx
export default function Dashboard() { return <div><h1 className="text-2xl font-semibold">Dashboard</h1></div> }
```

创建 `src/renderer/src/pages/Settings.tsx`：
```tsx
export default function Settings() { return <div><h1 className="text-2xl font-semibold">Settings</h1></div> }
```

- [ ] **Step 6: 更新 `src/renderer/src/App.tsx`**

```tsx
import { HashRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Home from './pages/Home'
import Campaigns from './pages/Campaigns'
import Timeline from './pages/Timeline'
import Import from './pages/Import'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="campaigns" element={<Campaigns />} />
          <Route path="timeline" element={<Timeline />} />
          <Route path="import" element={<Import />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
```

- [ ] **Step 7: 提交**

```bash
git add .
git commit -m "feat: add global layout, sidebar navigation, and page stubs"
```

**验收检查：**
- 左侧导航栏显示 6 个导航项
- 点击每个导航项，右侧内容区域显示对应页面标题
- 当前页导航项高亮

---

### Task 6：Campaign 列表页 + Zod Schema

**Files:**
- Create: `src/renderer/src/lib/schemas.ts`
- Create: `src/renderer/src/hooks/useCampaigns.ts`
- Modify: `src/renderer/src/pages/Campaigns.tsx`
- Create: `src/renderer/src/components/campaigns/CampaignTable.tsx`

- [ ] **Step 1: 创建 `src/renderer/src/lib/schemas.ts`**

```typescript
import { z } from 'zod'

export const dealSchema = z.object({
  deal_id:          z.string().optional(),
  deal_name:        z.string().optional(),
  deal_type:        z.enum(['PMP', 'PG', 'Open']).optional(),
  floor_price:      z.coerce.number().optional(),
  inventory_source: z.string().optional(),
  notes:            z.string().optional(),
})

export const campaignSchema = z.object({
  name:          z.string().min(1, 'Campaign name is required'),
  start_date:    z.string().min(1, 'Start date is required'),
  end_date:      z.string().min(1, 'End date is required'),
  type:          z.enum(['CTV', 'Display', 'OTT', 'Audio', 'DOOH']),
  agency:        z.string().optional(),
  client:        z.string().min(1, 'Client is required'),
  primary_kpi:   z.enum(['CTR', 'VCR', 'Reach', 'ROAS', 'CPA', 'CPM', 'Viewability']),
  secondary_kpi: z.enum(['CTR', 'VCR', 'Reach', 'ROAS', 'CPA', 'CPM', 'Viewability']).optional(),
  budget:        z.coerce.number().optional(),
  status:        z.enum(['Draft', 'Active', 'Paused', 'Ended']),
  notes:         z.string().optional(),
  deals:         z.array(dealSchema).default([]),
}).refine(
  (d) => new Date(d.end_date) > new Date(d.start_date),
  { message: 'End date must be after start date', path: ['end_date'] }
)

export type CampaignFormValues = z.infer<typeof campaignSchema>
```

- [ ] **Step 2: 创建 `src/renderer/src/hooks/useCampaigns.ts`**

```typescript
import { useState, useEffect, useCallback } from 'react'
import type { Campaign } from '../../../shared/types'
import { api } from '../lib/api'

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await api.campaign.list()
    if (result.success && result.data) {
      setCampaigns(result.data)
    } else {
      setError(result.error ?? 'Unknown error')
    }
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const deleteCampaign = useCallback(async (id: number) => {
    const result = await api.campaign.delete(id)
    if (result.success) refresh()
    return result
  }, [refresh])

  return { campaigns, loading, error, refresh, deleteCampaign }
}
```

- [ ] **Step 3: 创建 `src/renderer/src/components/campaigns/CampaignTable.tsx`**

```tsx
import type { Campaign } from '../../../../shared/types'
import { formatDate } from '../../lib/utils'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  Active: 'default', Draft: 'secondary', Paused: 'outline', Ended: 'destructive',
}

interface Props {
  campaigns: Campaign[]
  onEdit: (c: Campaign) => void
  onDelete: (id: number) => void
}

export default function CampaignTable({ campaigns, onEdit, onDelete }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const toggle = (id: number) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  if (campaigns.length === 0) {
    return <p className="text-muted-foreground text-sm py-8 text-center">No campaigns yet. Click "New Campaign" to add one.</p>
  }

  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="w-8 px-3 py-2" />
            <th className="text-left px-3 py-2 font-medium">Name</th>
            <th className="text-left px-3 py-2 font-medium">Client</th>
            <th className="text-left px-3 py-2 font-medium">Type</th>
            <th className="text-left px-3 py-2 font-medium">Dates</th>
            <th className="text-left px-3 py-2 font-medium">Status</th>
            <th className="text-left px-3 py-2 font-medium">Primary KPI</th>
            <th className="w-20 px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {campaigns.map(c => (
            <>
              <tr key={c.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => toggle(c.id)}>
                <td className="px-3 py-2 text-muted-foreground">
                  {expanded.has(c.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </td>
                <td className="px-3 py-2 font-medium">{c.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{c.client}</td>
                <td className="px-3 py-2"><Badge variant="outline">{c.type}</Badge></td>
                <td className="px-3 py-2 text-muted-foreground text-xs">{formatDate(c.start_date)} – {formatDate(c.end_date)}</td>
                <td className="px-3 py-2"><Badge variant={STATUS_VARIANT[c.status] ?? 'secondary'}>{c.status}</Badge></td>
                <td className="px-3 py-2 text-muted-foreground">{c.primary_kpi}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(c)}><Pencil size={13} /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(c.id)}><Trash2 size={13} /></Button>
                  </div>
                </td>
              </tr>
              {expanded.has(c.id) && c.deals && c.deals.length > 0 && (
                <tr key={`${c.id}-deals`} className="border-b bg-muted/10">
                  <td colSpan={8} className="px-8 py-2">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Deals ({c.deals.length})</p>
                    <div className="flex flex-wrap gap-2">
                      {c.deals.map(d => (
                        <div key={d.id} className="text-xs border rounded px-2 py-1 bg-background">
                          <span className="font-medium">{d.deal_name || d.deal_id || 'Unnamed Deal'}</span>
                          {d.deal_type && <span className="text-muted-foreground ml-1">({d.deal_type})</span>}
                          {d.floor_price != null && <span className="text-muted-foreground ml-1">${d.floor_price} CPM</span>}
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: 更新 `src/renderer/src/pages/Campaigns.tsx`（添加列表 + 删除，表单 Dialog 下一步添加）**

```tsx
import { useState } from 'react'
import { Button } from '../components/ui/button'
import CampaignTable from '../components/campaigns/CampaignTable'
import { useCampaigns } from '../hooks/useCampaigns'
import type { Campaign } from '../../../shared/types'
import { Plus } from 'lucide-react'

export default function Campaigns() {
  const { campaigns, loading, refresh, deleteCampaign } = useCampaigns()
  const [editTarget, setEditTarget] = useState<Campaign | null>(null)
  const [showForm, setShowForm] = useState(false)

  const handleDelete = async (id: number) => {
    if (window.confirm('Delete this campaign and all its data?')) {
      await deleteCampaign(id)
    }
  }

  const handleEdit = (c: Campaign) => {
    setEditTarget(c)
    setShowForm(true)
  }

  const handleNew = () => {
    setEditTarget(null)
    setShowForm(true)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Campaigns</h1>
        <Button onClick={handleNew}><Plus size={16} className="mr-2" />New Campaign</Button>
      </div>
      {loading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : (
        <CampaignTable campaigns={campaigns} onEdit={handleEdit} onDelete={handleDelete} />
      )}
    </div>
  )
}
```

- [ ] **Step 5: 提交**

```bash
git add .
git commit -m "feat: add Campaign list page with table, delete, and Zod schemas"
```

**验收检查：**
- Campaigns 页面显示表格（无数据时显示空状态文字）
- 点击「New Campaign」按钮（暂时无弹窗，下一步实现）
- 导航高亮正确

---

### Task 7：Campaign 录入表单 Dialog

**Files:**
- Create: `src/renderer/src/components/campaigns/DealFields.tsx`
- Create: `src/renderer/src/components/campaigns/CampaignFormDialog.tsx`
- Modify: `src/renderer/src/pages/Campaigns.tsx`

- [ ] **Step 1: 安装 shadcn DatePicker 相关组件（如缺少）**

```bash
npx shadcn@latest add popover calendar
npm install react-day-picker
```

- [ ] **Step 2: 创建 `src/renderer/src/components/campaigns/DealFields.tsx`**

```tsx
import { useFieldArray, UseFormReturn } from 'react-hook-form'
import type { CampaignFormValues } from '../../lib/schemas'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Plus, Trash2 } from 'lucide-react'

interface Props { form: UseFormReturn<CampaignFormValues> }

export default function DealFields({ form }: Props) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'deals' })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Deals</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => append({ deal_id: '', deal_name: '', deal_type: undefined, floor_price: undefined, inventory_source: '', notes: '' })}>
          <Plus size={13} className="mr-1" /> Add Deal
        </Button>
      </div>
      {fields.length === 0 && <p className="text-xs text-muted-foreground">No deals. Click "Add Deal" to associate deals.</p>}
      {fields.map((field, index) => (
        <div key={field.id} className="border rounded-md p-3 space-y-2 bg-muted/20">
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-muted-foreground">Deal {index + 1}</span>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => remove(index)}><Trash2 size={12} /></Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Deal ID</Label>
              <Input className="h-7 text-xs" {...form.register(`deals.${index}.deal_id`)} placeholder="TTD-12345" />
            </div>
            <div>
              <Label className="text-xs">Deal Name</Label>
              <Input className="h-7 text-xs" {...form.register(`deals.${index}.deal_name`)} placeholder="Hulu Premium CTV" />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select onValueChange={v => form.setValue(`deals.${index}.deal_type`, v as 'PMP' | 'PG' | 'Open')} defaultValue={field.deal_type ?? ''}>
                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent><SelectItem value="PMP">PMP</SelectItem><SelectItem value="PG">PG</SelectItem><SelectItem value="Open">Open</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Floor Price (CPM $)</Label>
              <Input className="h-7 text-xs" type="number" step="0.01" {...form.register(`deals.${index}.floor_price`)} placeholder="15.00" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Inventory Source</Label>
              <Input className="h-7 text-xs" {...form.register(`deals.${index}.inventory_source`)} placeholder="Hulu / ESPN" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: 创建 `src/renderer/src/components/campaigns/CampaignFormDialog.tsx`**

```tsx
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { campaignSchema, type CampaignFormValues } from '../../lib/schemas'
import type { Campaign } from '../../../../shared/types'
import { api } from '../../lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import DealFields from './DealFields'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  editTarget?: Campaign | null
}

const AD_TYPES = ['CTV', 'Display', 'OTT', 'Audio', 'DOOH'] as const
const KPI_TYPES = ['CTR', 'VCR', 'Reach', 'ROAS', 'CPA', 'CPM', 'Viewability'] as const
const STATUSES = ['Draft', 'Active', 'Paused', 'Ended'] as const

export default function CampaignFormDialog({ open, onClose, onSuccess, editTarget }: Props) {
  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignSchema),
    defaultValues: { name: '', start_date: '', end_date: '', type: 'CTV', agency: '', client: '', primary_kpi: 'VCR', secondary_kpi: undefined, budget: undefined, status: 'Draft', notes: '', deals: [] },
  })

  useEffect(() => {
    if (editTarget) {
      form.reset({
        name: editTarget.name, start_date: editTarget.start_date, end_date: editTarget.end_date,
        type: editTarget.type, agency: editTarget.agency ?? '', client: editTarget.client,
        primary_kpi: editTarget.primary_kpi, secondary_kpi: editTarget.secondary_kpi ?? undefined,
        budget: editTarget.budget ?? undefined, status: editTarget.status,
        notes: editTarget.notes ?? '', deals: editTarget.deals ?? [],
      })
    } else {
      form.reset({ name: '', start_date: '', end_date: '', type: 'CTV', agency: '', client: '', primary_kpi: 'VCR', secondary_kpi: undefined, budget: undefined, status: 'Draft', notes: '', deals: [] })
    }
  }, [editTarget, open])

  const onSubmit = async (values: CampaignFormValues) => {
    const { deals, ...campaignData } = values
    const result = editTarget
      ? await api.campaign.update(editTarget.id, campaignData as never, deals as never)
      : await api.campaign.create(campaignData as never, deals as never)
    if (result.success) { onSuccess(); onClose() }
    else alert(`Error: ${result.error}`)
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editTarget ? 'Edit Campaign' : 'New Campaign'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Campaign Name *</Label>
              <Input {...form.register('name')} placeholder="Nike Q2 2026 CTV" />
              {form.formState.errors.name && <p className="text-xs text-destructive mt-1">{form.formState.errors.name.message}</p>}
            </div>
            <div>
              <Label>Start Date *</Label>
              <Input type="date" {...form.register('start_date')} />
              {form.formState.errors.start_date && <p className="text-xs text-destructive mt-1">{form.formState.errors.start_date.message}</p>}
            </div>
            <div>
              <Label>End Date *</Label>
              <Input type="date" {...form.register('end_date')} />
              {form.formState.errors.end_date && <p className="text-xs text-destructive mt-1">{form.formState.errors.end_date.message}</p>}
            </div>
            <div>
              <Label>Ad Type *</Label>
              <Select defaultValue={form.getValues('type')} onValueChange={v => form.setValue('type', v as typeof AD_TYPES[number])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{AD_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status *</Label>
              <Select defaultValue={form.getValues('status')} onValueChange={v => form.setValue('status', v as typeof STATUSES[number])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Client *</Label>
              <Input {...form.register('client')} placeholder="Nike" />
              {form.formState.errors.client && <p className="text-xs text-destructive mt-1">{form.formState.errors.client.message}</p>}
            </div>
            <div>
              <Label>Agency</Label>
              <Input {...form.register('agency')} placeholder="Wavemaker" />
            </div>
            <div>
              <Label>Primary KPI *</Label>
              <Select defaultValue={form.getValues('primary_kpi')} onValueChange={v => form.setValue('primary_kpi', v as typeof KPI_TYPES[number])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{KPI_TYPES.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Secondary KPI</Label>
              <Select onValueChange={v => form.setValue('secondary_kpi', v as typeof KPI_TYPES[number])}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent><SelectItem value="">None</SelectItem>{KPI_TYPES.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Budget (USD)</Label>
              <Input type="number" {...form.register('budget')} placeholder="50000" />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea {...form.register('notes')} rows={3} placeholder="Any additional notes..." />
            </div>
          </div>
          <DealFields form={form} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">{editTarget ? 'Save Changes' : 'Create Campaign'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: 更新 `src/renderer/src/pages/Campaigns.tsx`，接入表单 Dialog**

```tsx
import { useState } from 'react'
import { Button } from '../components/ui/button'
import CampaignTable from '../components/campaigns/CampaignTable'
import CampaignFormDialog from '../components/campaigns/CampaignFormDialog'
import { useCampaigns } from '../hooks/useCampaigns'
import type { Campaign } from '../../../shared/types'
import { Plus } from 'lucide-react'

export default function Campaigns() {
  const { campaigns, loading, refresh, deleteCampaign } = useCampaigns()
  const [editTarget, setEditTarget] = useState<Campaign | null>(null)
  const [showForm, setShowForm] = useState(false)

  const handleDelete = async (id: number) => {
    if (window.confirm('Delete this campaign and all its data?')) {
      await deleteCampaign(id)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Campaigns</h1>
        <Button onClick={() => { setEditTarget(null); setShowForm(true) }}>
          <Plus size={16} className="mr-2" />New Campaign
        </Button>
      </div>
      {loading ? <p className="text-muted-foreground text-sm">Loading...</p> : (
        <CampaignTable campaigns={campaigns} onEdit={c => { setEditTarget(c); setShowForm(true) }} onDelete={handleDelete} />
      )}
      <CampaignFormDialog open={showForm} onClose={() => setShowForm(false)} onSuccess={refresh} editTarget={editTarget} />
    </div>
  )
}
```

- [ ] **Step 5: 提交**

```bash
git add .
git commit -m "feat: add Campaign form dialog with deal sub-fields and form validation"
```

**验收检查：**
- 点击「New Campaign」打开表单 Dialog
- 不填 Name 或 Client 点提交，显示红色错误提示
- End Date < Start Date 时显示日期逻辑错误
- 填写完整信息提交，Campaign 出现在列表中
- 点击编辑图标，表单预填已有数据
- 点击删除图标，确认后 Campaign 从列表消失
- 可以添加和删除 Deal 条目

---

### Task 8：Timeline 视图

**Files:**
- Create: `src/renderer/src/components/timeline/TimelineChart.tsx`
- Create: `src/renderer/src/components/timeline/CampaignDetailSheet.tsx`
- Modify: `src/renderer/src/pages/Timeline.tsx`

- [ ] **Step 1: 创建 `src/renderer/src/components/timeline/CampaignDetailSheet.tsx`**

```tsx
import type { Campaign } from '../../../../shared/types'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet'
import { Badge } from '../ui/badge'
import { Separator } from '../ui/separator'
import { formatDate, formatCurrency } from '../../lib/utils'

interface Props { campaign: Campaign | null; open: boolean; onClose: () => void }

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  Active: 'default', Draft: 'secondary', Paused: 'outline', Ended: 'destructive',
}

export default function CampaignDetailSheet({ campaign, open, onClose }: Props) {
  if (!campaign) return null
  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-96 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{campaign.name}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4 text-sm">
          <div className="flex gap-2">
            <Badge variant={STATUS_VARIANT[campaign.status] ?? 'secondary'}>{campaign.status}</Badge>
            <Badge variant="outline">{campaign.type}</Badge>
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-2">
            <div><p className="text-xs text-muted-foreground">Client</p><p className="font-medium">{campaign.client}</p></div>
            <div><p className="text-xs text-muted-foreground">Agency</p><p className="font-medium">{campaign.agency || '—'}</p></div>
            <div><p className="text-xs text-muted-foreground">Start</p><p>{formatDate(campaign.start_date)}</p></div>
            <div><p className="text-xs text-muted-foreground">End</p><p>{formatDate(campaign.end_date)}</p></div>
            <div><p className="text-xs text-muted-foreground">Primary KPI</p><p className="font-medium text-primary">{campaign.primary_kpi}</p></div>
            <div><p className="text-xs text-muted-foreground">Secondary KPI</p><p>{campaign.secondary_kpi || '—'}</p></div>
            <div><p className="text-xs text-muted-foreground">Budget</p><p>{formatCurrency(campaign.budget)}</p></div>
          </div>
          {campaign.notes && (
            <div><p className="text-xs text-muted-foreground mb-1">Notes</p><p className="text-sm">{campaign.notes}</p></div>
          )}
          {campaign.deals && campaign.deals.length > 0 && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Deals ({campaign.deals.length})</p>
                <div className="space-y-2">
                  {campaign.deals.map(d => (
                    <div key={d.id} className="border rounded p-2 text-xs space-y-1">
                      <p className="font-medium">{d.deal_name || d.deal_id || 'Unnamed Deal'}</p>
                      <div className="text-muted-foreground flex gap-3">
                        {d.deal_id && <span>ID: {d.deal_id}</span>}
                        {d.deal_type && <span>{d.deal_type}</span>}
                        {d.floor_price != null && <span>${d.floor_price} CPM</span>}
                      </div>
                      {d.inventory_source && <p className="text-muted-foreground">{d.inventory_source}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 2: 创建 `src/renderer/src/components/timeline/TimelineChart.tsx`**

```tsx
import { useMemo, useRef } from 'react'
import type { Campaign } from '../../../../shared/types'
import { startOfMonth, endOfMonth, addMonths, subMonths, eachMonthOfInterval, differenceInDays, parseISO, isWithinInterval, format } from 'date-fns'

const STATUS_COLOR: Record<string, string> = {
  Active: 'bg-green-500',
  Draft:  'bg-blue-400',
  Paused: 'bg-orange-400',
  Ended:  'bg-gray-400',
}

interface Props {
  campaigns: Campaign[]
  rangeStart: Date
  rangeEnd: Date
  onClickCampaign: (c: Campaign) => void
}

export default function TimelineChart({ campaigns, rangeStart, rangeEnd, onClickCampaign }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const totalDays = differenceInDays(rangeEnd, rangeStart)
  const months = eachMonthOfInterval({ start: rangeStart, end: rangeEnd })
  const today = new Date()

  const todayPct = useMemo(() => {
    const d = differenceInDays(today, rangeStart)
    return Math.max(0, Math.min(100, (d / totalDays) * 100))
  }, [today, rangeStart, totalDays])

  const getBarStyle = (c: Campaign) => {
    const start = parseISO(c.start_date)
    const end = parseISO(c.end_date)
    const left = Math.max(0, (differenceInDays(start, rangeStart) / totalDays) * 100)
    const rawRight = (differenceInDays(end, rangeStart) / totalDays) * 100
    const width = Math.max(0.5, Math.min(rawRight, 100) - left)
    return { left: `${left}%`, width: `${width}%` }
  }

  const visibleCampaigns = campaigns.filter(c => {
    const start = parseISO(c.start_date)
    const end = parseISO(c.end_date)
    return start <= rangeEnd && end >= rangeStart
  })

  return (
    <div className="flex border rounded-md overflow-hidden">
      {/* Left: Campaign names */}
      <div className="w-52 flex-shrink-0 border-r bg-card">
        <div className="h-8 border-b bg-muted/50 flex items-center px-3">
          <span className="text-xs font-medium text-muted-foreground">Campaign</span>
        </div>
        {visibleCampaigns.map(c => (
          <div key={c.id} className="h-10 border-b flex flex-col justify-center px-3 hover:bg-muted/30">
            <p className="text-xs font-medium truncate">{c.name}</p>
            <p className="text-xs text-muted-foreground truncate">{c.client}</p>
          </div>
        ))}
      </div>

      {/* Right: Timeline */}
      <div className="flex-1 overflow-x-auto" ref={scrollRef}>
        <div style={{ minWidth: `${Math.max(800, totalDays * 3)}px` }}>
          {/* Month headers */}
          <div className="h-8 border-b bg-muted/50 flex relative">
            {months.map(m => {
              const left = (differenceInDays(m, rangeStart) / totalDays) * 100
              const monthEnd = endOfMonth(m)
              const effectiveEnd = monthEnd > rangeEnd ? rangeEnd : monthEnd
              const width = (differenceInDays(effectiveEnd, m) / totalDays) * 100
              return (
                <div key={m.toISOString()} className="absolute flex items-center px-2 border-r h-full" style={{ left: `${left}%`, width: `${width}%` }}>
                  <span className="text-xs font-medium text-muted-foreground">{format(m, 'MMM yyyy')}</span>
                </div>
              )
            })}
          </div>

          {/* Rows */}
          <div className="relative">
            {visibleCampaigns.map(c => (
              <div key={c.id} className="h-10 border-b relative flex items-center">
                <div
                  className={`absolute h-6 rounded-sm cursor-pointer opacity-90 hover:opacity-100 flex items-center px-2 ${STATUS_COLOR[c.status] ?? 'bg-gray-400'}`}
                  style={getBarStyle(c)}
                  onClick={() => onClickCampaign(c)}
                  title={c.name}
                >
                  <span className="text-white text-xs font-medium truncate">{c.name}</span>
                </div>
              </div>
            ))}
            {/* Today line */}
            {todayPct >= 0 && todayPct <= 100 && (
              <div className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none" style={{ left: `${todayPct}%` }}>
                <span className="absolute -top-5 -translate-x-1/2 text-xs text-red-500 font-medium whitespace-nowrap">Today</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 更新 `src/renderer/src/pages/Timeline.tsx`**

```tsx
import { useState, useMemo } from 'react'
import { addMonths, subMonths, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, addMonths as addM } from 'date-fns'
import { useCampaigns } from '../hooks/useCampaigns'
import TimelineChart from '../components/timeline/TimelineChart'
import CampaignDetailSheet from '../components/timeline/CampaignDetailSheet'
import type { Campaign } from '../../../shared/types'
import { Button } from '../components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'

type RangePreset = '3m' | 'quarter' | '6m'

export default function Timeline() {
  const { campaigns } = useCampaigns()
  const [preset, setPreset] = useState<RangePreset>('3m')
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const { rangeStart, rangeEnd } = useMemo(() => {
    const now = new Date()
    if (preset === '3m') return { rangeStart: startOfMonth(subMonths(now, 1)), rangeEnd: endOfMonth(addMonths(now, 1)) }
    if (preset === 'quarter') return { rangeStart: startOfQuarter(now), rangeEnd: endOfQuarter(now) }
    return { rangeStart: startOfMonth(now), rangeEnd: endOfMonth(addM(now, 5)) }
  }, [preset])

  const filtered = useMemo(() => campaigns.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (typeFilter !== 'all' && c.type !== typeFilter) return false
    return true
  }), [campaigns, statusFilter, typeFilter])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Timeline</h1>
        <div className="flex gap-2">
          <Button variant={preset === '3m' ? 'default' : 'outline'} size="sm" onClick={() => setPreset('3m')}>3 Months</Button>
          <Button variant={preset === 'quarter' ? 'default' : 'outline'} size="sm" onClick={() => setPreset('quarter')}>This Quarter</Button>
          <Button variant={preset === '6m' ? 'default' : 'outline'} size="sm" onClick={() => setPreset('6m')}>6 Months</Button>
        </div>
      </div>
      <div className="flex gap-3 mb-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
            <SelectItem value="Paused">Paused</SelectItem>
            <SelectItem value="Ended">Ended</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {['CTV', 'Display', 'OTT', 'Audio', 'DOOH'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <TimelineChart campaigns={filtered} rangeStart={rangeStart} rangeEnd={rangeEnd} onClickCampaign={setSelectedCampaign} />
      <CampaignDetailSheet campaign={selectedCampaign} open={!!selectedCampaign} onClose={() => setSelectedCampaign(null)} />
    </div>
  )
}
```

- [ ] **Step 4: 提交**

```bash
git add .
git commit -m "feat: add Timeline Gantt view with status colors, today line, and detail sheet"
```

**验收检查：**
- Timeline 页面显示 Campaign 条，位置与日期匹配
- 红色今日线正确显示
- 切换「This Quarter」范围，时间轴更新
- 点击 Campaign 条，右侧侧边栏滑出显示详情
- 按 Status 过滤，只显示对应 Campaign

---

### Task 9：数据导入模块

**Files:**
- Modify: `src/renderer/src/pages/Import.tsx`

- [ ] **Step 1: 更新 `src/renderer/src/pages/Import.tsx`**

```tsx
import { useState } from 'react'
import { api } from '../lib/api'
import type { ImportMapping, ImportRow, ImportResult } from '../../../shared/types'
import { useCampaigns } from '../hooks/useCampaigns'
import { Button } from '../components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Label } from '../components/ui/label'
import { Badge } from '../components/ui/badge'
import { Upload } from 'lucide-react'

const SYSTEM_FIELDS = ['date', 'impressions', 'clicks', 'spend', 'ctr', 'vcr', 'vtr', 'conversions']

export default function Import() {
  const { campaigns } = useCampaigns()
  const [fileColumns, setFileColumns] = useState<string[]>([])
  const [rows, setRows] = useState<ImportRow[]>([])
  const [mapping, setMapping] = useState<ImportMapping>({})
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null)
  const [importMode, setImportMode] = useState<'append' | 'overwrite'>('append')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [step, setStep] = useState<'upload' | 'map' | 'done'>('upload')
  const [fileName, setFileName] = useState<string>('')

  const handleSelectFile = async () => {
    const res = await api.dialog.openFile([
      { name: 'Data Files', extensions: ['csv', 'xlsx'] }
    ])
    if (!res.success || !res.data) return
    const filePath = res.data
    setFileName(filePath.split(/[\\/]/).pop() ?? filePath)

    // Read file via xlsx in main process — we use a custom IPC for this
    // For now, read raw bytes via a workaround: we expose readXlsxFile in preload
    // Since we can't call fs directly in renderer, we add a new IPC call below
    // This step adds the IPC to read and parse the xlsx file
    const parseRes = await (window as any).api.dialog.parseFile(filePath)
    if (!parseRes.success || !parseRes.data) return
    const { columns, rows: parsedRows } = parseRes.data
    setFileColumns(columns)
    setRows(parsedRows)
    setMapping({})
    setStep('map')
  }

  const handleImport = async () => {
    if (!selectedCampaignId) { alert('Please select a campaign'); return }
    if (!mapping['date']) { alert('Date column must be mapped'); return }
    const res = await api.performance.import({ campaign_id: selectedCampaignId, mapping, mode: importMode, rows })
    if (res.success && res.data) { setResult(res.data); setStep('done') }
    else alert(`Import failed: ${res.error}`)
  }

  if (step === 'done' && result) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-6">Import</h1>
        <div className="border rounded-md p-6 max-w-md space-y-3">
          <h2 className="font-medium">Import Complete</h2>
          <div className="flex gap-3">
            <Badge variant="default">{result.success_count} rows imported</Badge>
            {result.skip_count > 0 && <Badge variant="secondary">{result.skip_count} skipped</Badge>}
            {result.error_count > 0 && <Badge variant="destructive">{result.error_count} errors</Badge>}
          </div>
          {result.errors.length > 0 && (
            <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto">
              {result.errors.slice(0, 10).map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}
          <Button onClick={() => { setStep('upload'); setResult(null); setRows([]); setFileColumns([]) }}>Import Another File</Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Import Performance Data</h1>
      {step === 'upload' && (
        <div className="border-2 border-dashed border-border rounded-md p-12 text-center max-w-lg">
          <Upload size={32} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground mb-4">Select a CSV or Excel file exported from TTD</p>
          <Button onClick={handleSelectFile}>Select File</Button>
        </div>
      )}
      {step === 'map' && (
        <div className="space-y-6 max-w-2xl">
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">File:</p>
            <Badge variant="outline">{fileName}</Badge>
            <Badge variant="secondary">{rows.length} rows</Badge>
          </div>

          {/* Preview */}
          <div>
            <p className="text-sm font-medium mb-2">Preview (first 5 rows)</p>
            <div className="overflow-x-auto border rounded-md">
              <table className="text-xs w-full">
                <thead><tr className="border-b bg-muted/50">{fileColumns.map(c => <th key={c} className="px-2 py-1 text-left font-medium">{c}</th>)}</tr></thead>
                <tbody>{rows.slice(0, 5).map((row, i) => <tr key={i} className="border-b">{fileColumns.map(c => <td key={c} className="px-2 py-1 text-muted-foreground">{String(row[c] ?? '')}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </div>

          {/* Field mapping */}
          <div>
            <p className="text-sm font-medium mb-2">Map Columns</p>
            <div className="grid grid-cols-2 gap-3">
              {SYSTEM_FIELDS.map(field => (
                <div key={field}>
                  <Label className="text-xs capitalize">{field} {field === 'date' && '*'}</Label>
                  <Select value={mapping[field] ?? ''} onValueChange={v => setMapping(prev => ({ ...prev, [field]: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Skip" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Skip</SelectItem>
                      {fileColumns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          {/* Campaign + mode */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Campaign *</Label>
              <Select onValueChange={v => setSelectedCampaignId(Number(v))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select campaign" /></SelectTrigger>
                <SelectContent>{campaigns.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Import Mode</Label>
              <Select value={importMode} onValueChange={v => setImportMode(v as 'append' | 'overwrite')}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="append">Append</SelectItem>
                  <SelectItem value="overwrite">Overwrite</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('upload')}>Back</Button>
            <Button onClick={handleImport}>Import Data</Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 在 `src/main/ipc-handlers.ts` 中添加文件解析 handler**

在 `registerHandlers()` 函数末尾添加：

```typescript
  // File parsing (xlsx)
  ipcMain.handle('dialog:parseFile', async (_e, filePath: string) => {
    try {
      const XLSX = await import('xlsx')
      const workbook = XLSX.readFile(filePath)
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows: ImportRow[] = XLSX.utils.sheet_to_json(sheet, { raw: false })
      const columns = rows.length > 0 ? Object.keys(rows[0]) : []
      return ok({ columns, rows })
    } catch (e) { return err(e) }
  })
```

也在 `src/preload/index.ts` 中添加：
```typescript
parseFile: (filePath: string) => ipcRenderer.invoke('dialog:parseFile', filePath),
```
（添加到 `dialog` 对象中）

- [ ] **Step 3: 提交**

```bash
git add .
git commit -m "feat: add data import module with file parsing, column mapping, and CSV/Excel support"
```

**验收检查：**
- 点击「Select File」，弹出文件选择对话框
- 选择 `test-data/sample-performance.csv`，显示预览表格和列映射
- 正确映射 date / impressions / spend 等列
- 选择 Campaign 后点击「Import Data」，显示成功结果

---

### Task 10：Performance Dashboard

**Files:**
- Create: `src/renderer/src/hooks/usePerformance.ts`
- Create: `src/renderer/src/components/dashboard/KpiCards.tsx`
- Create: `src/renderer/src/components/dashboard/ImpressionsChart.tsx`
- Create: `src/renderer/src/components/dashboard/ClicksChart.tsx`
- Create: `src/renderer/src/components/dashboard/SpendPieChart.tsx`
- Modify: `src/renderer/src/pages/Dashboard.tsx`

- [ ] **Step 1: 创建 `src/renderer/src/hooks/usePerformance.ts`**

```typescript
import { useState, useCallback } from 'react'
import type { PerformanceData } from '../../../shared/types'
import { api } from '../lib/api'

export function usePerformance() {
  const [data, setData] = useState<PerformanceData[]>([])
  const [loading, setLoading] = useState(false)

  const query = useCallback(async (campaignIds: number[], from?: string, to?: string) => {
    if (campaignIds.length === 0) { setData([]); return }
    setLoading(true)
    const results = await Promise.all(campaignIds.map(id => api.performance.query(id, from, to)))
    const combined = results.flatMap(r => r.data ?? [])
    combined.sort((a, b) => a.date.localeCompare(b.date))
    setData(combined)
    setLoading(false)
  }, [])

  return { data, loading, query }
}
```

- [ ] **Step 2: 创建 `src/renderer/src/components/dashboard/KpiCards.tsx`**

```tsx
import type { PerformanceData, Campaign } from '../../../../shared/types'
import { formatNumber, formatCurrency, formatPercent } from '../../lib/utils'

interface Props { data: PerformanceData[]; campaign?: Campaign | null }

export default function KpiCards({ data, campaign }: Props) {
  const total_impressions = data.reduce((s, r) => s + (r.impressions ?? 0), 0)
  const total_spend = data.reduce((s, r) => s + (r.spend ?? 0), 0)
  const avg_ctr = data.length ? data.reduce((s, r) => s + (r.ctr ?? 0), 0) / data.filter(r => r.ctr != null).length : 0
  const avg_vcr = data.length ? data.reduce((s, r) => s + (r.vcr ?? 0), 0) / data.filter(r => r.vcr != null).length : 0

  const primaryKpi = campaign?.primary_kpi

  const cards = [
    { label: 'Total Impressions', value: formatNumber(total_impressions), highlight: primaryKpi === 'CPM' },
    { label: 'Total Spend', value: formatCurrency(total_spend), highlight: primaryKpi === 'ROAS' || primaryKpi === 'CPA' },
    { label: 'Avg CTR', value: formatPercent(avg_ctr), highlight: primaryKpi === 'CTR' },
    { label: 'Avg VCR', value: formatPercent(avg_vcr), highlight: primaryKpi === 'VCR' },
  ]

  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map(c => (
        <div key={c.label} className={`border rounded-md p-4 ${c.highlight ? 'border-primary bg-primary/5' : ''}`}>
          <p className="text-xs text-muted-foreground">{c.label}</p>
          <p className="text-2xl font-semibold mt-1">{c.value}</p>
          {c.highlight && <p className="text-xs text-primary mt-1">Primary KPI</p>}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: 创建 `src/renderer/src/components/dashboard/ImpressionsChart.tsx`**

```tsx
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { PerformanceData } from '../../../../shared/types'
import { formatNumber, formatCurrency } from '../../lib/utils'
import { format, parseISO } from 'date-fns'

interface Props { data: PerformanceData[] }

export default function ImpressionsChart({ data }: Props) {
  const chartData = data.map(d => ({
    date: format(parseISO(d.date), 'MM/dd'),
    impressions: d.impressions ?? 0,
    spend: d.spend ?? 0,
  }))

  return (
    <div>
      <p className="text-sm font-medium mb-3">Impressions & Spend</p>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="left" tickFormatter={v => formatNumber(v)} tick={{ fontSize: 11 }} />
          <YAxis yAxisId="right" orientation="right" tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value, name) => name === 'spend' ? formatCurrency(Number(value)) : formatNumber(Number(value))}
          />
          <Legend />
          <Line yAxisId="left" type="monotone" dataKey="impressions" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
          <Bar yAxisId="right" dataKey="spend" fill="hsl(var(--muted-foreground))" opacity={0.6} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 4: 创建 `src/renderer/src/components/dashboard/ClicksChart.tsx`**

```tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { PerformanceData } from '../../../../shared/types'
import { formatNumber } from '../../lib/utils'
import { format, parseISO } from 'date-fns'

interface Props { data: PerformanceData[] }

export default function ClicksChart({ data }: Props) {
  const chartData = data.map(d => ({
    date: format(parseISO(d.date), 'MM/dd'),
    clicks: d.clicks ?? 0,
    conversions: d.conversions ?? 0,
  }))

  return (
    <div>
      <p className="text-sm font-medium mb-3">Clicks & Conversions</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={v => formatNumber(v)} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => formatNumber(Number(v))} />
          <Legend />
          <Bar dataKey="clicks" fill="hsl(var(--primary))" opacity={0.8} />
          <Bar dataKey="conversions" fill="hsl(142 71% 45%)" opacity={0.8} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 5: 更新 `src/renderer/src/pages/Dashboard.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { useCampaigns } from '../hooks/useCampaigns'
import { usePerformance } from '../hooks/usePerformance'
import KpiCards from '../components/dashboard/KpiCards'
import ImpressionsChart from '../components/dashboard/ImpressionsChart'
import ClicksChart from '../components/dashboard/ClicksChart'
import { Button } from '../components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Label } from '../components/ui/label'
import { Input } from '../components/ui/input'
import { api } from '../lib/api'

export default function Dashboard() {
  const { campaigns } = useCampaigns()
  const { data, loading, query } = usePerformance()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const selectedCampaign = campaigns.find(c => c.id === selectedId) ?? null

  useEffect(() => {
    if (selectedId) query([selectedId], fromDate || undefined, toDate || undefined)
  }, [selectedId, fromDate, toDate])

  const handleExport = async () => {
    if (!data.length) return
    const headers = ['date', 'impressions', 'clicks', 'spend', 'ctr', 'vcr', 'vtr', 'conversions']
    const csv = [headers.join(','), ...data.map(r => headers.map(h => String((r as Record<string, unknown>)[h] ?? '')).join(','))].join('\n')
    await api.dialog.saveFile(`performance-export-${new Date().toISOString().slice(0,10)}.csv`, csv)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Performance Dashboard</h1>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={!data.length}>Export CSV</Button>
      </div>

      <div className="flex gap-4 mb-6">
        <div>
          <Label className="text-xs">Campaign</Label>
          <Select onValueChange={v => setSelectedId(Number(v))}>
            <SelectTrigger className="w-56 h-8 text-xs"><SelectValue placeholder="Select campaign" /></SelectTrigger>
            <SelectContent>{campaigns.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">From</Label>
          <Input type="date" className="h-8 text-xs w-36" value={fromDate} onChange={e => setFromDate(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input type="date" className="h-8 text-xs w-36" value={toDate} onChange={e => setToDate(e.target.value)} />
        </div>
      </div>

      {!selectedId ? (
        <p className="text-muted-foreground text-sm">Select a campaign to view performance data.</p>
      ) : loading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : data.length === 0 ? (
        <p className="text-muted-foreground text-sm">No data for this campaign. Import data first.</p>
      ) : (
        <div className="space-y-8">
          <KpiCards data={data} campaign={selectedCampaign} />
          <ImpressionsChart data={data} />
          <ClicksChart data={data} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: 提交**

```bash
git add .
git commit -m "feat: add Performance Dashboard with KPI cards and charts"
```

**验收检查：**
- 选择有数据的 Campaign，KPI 卡片显示正确数值
- 折线/柱状图显示每日数据
- 日期范围筛选器有效
- 「Export CSV」弹出保存对话框，文件可用 Excel 打开

---

### Task 11：首页摘要与设置页

**Files:**
- Modify: `src/renderer/src/pages/Home.tsx`
- Modify: `src/renderer/src/pages/Settings.tsx`

- [ ] **Step 1: 更新 `src/renderer/src/pages/Home.tsx`**

```tsx
import { useMemo } from 'react'
import { useCampaigns } from '../hooks/useCampaigns'
import { formatDate, formatCurrency } from '../lib/utils'
import { Badge } from '../components/ui/badge'
import { differenceInDays, parseISO, isAfter, isBefore, addDays } from 'date-fns'

export default function Home() {
  const { campaigns, loading } = useCampaigns()

  const today = new Date()

  const activeCampaigns = useMemo(() => campaigns.filter(c => c.status === 'Active'), [campaigns])

  const endingSoon = useMemo(() => campaigns.filter(c => {
    if (c.status === 'Ended') return false
    const end = parseISO(c.end_date)
    return isAfter(end, today) && isBefore(end, addDays(today, 8))
  }).sort((a, b) => a.end_date.localeCompare(b.end_date)), [campaigns, today])

  const recent = useMemo(() => [...campaigns].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3), [campaigns])

  if (loading) return <p className="text-muted-foreground text-sm">Loading...</p>

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Good day, Derrick</h1>
        <p className="text-muted-foreground text-sm">{today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="border rounded-md p-4">
          <p className="text-xs text-muted-foreground">Active Campaigns</p>
          <p className="text-3xl font-semibold mt-1">{activeCampaigns.length}</p>
        </div>
        <div className="border rounded-md p-4">
          <p className="text-xs text-muted-foreground">Total Campaigns</p>
          <p className="text-3xl font-semibold mt-1">{campaigns.length}</p>
        </div>
        <div className="border rounded-md p-4">
          <p className="text-xs text-muted-foreground">Ending in 7 Days</p>
          <p className={`text-3xl font-semibold mt-1 ${endingSoon.length > 0 ? 'text-orange-500' : ''}`}>{endingSoon.length}</p>
        </div>
      </div>

      {endingSoon.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3">Ending Soon</h2>
          <div className="space-y-2">
            {endingSoon.map(c => (
              <div key={c.id} className="flex items-center justify-between border rounded-md p-3">
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.client} · {c.type}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-orange-500 font-medium">{differenceInDays(parseISO(c.end_date), today)} days left</p>
                  <p className="text-xs text-muted-foreground">{formatDate(c.end_date)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold mb-3">Recently Added</h2>
        {recent.length === 0
          ? <p className="text-sm text-muted-foreground">No campaigns yet.</p>
          : <div className="space-y-2">
              {recent.map(c => (
                <div key={c.id} className="flex items-center justify-between border rounded-md p-3">
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.client} · {c.type}</p>
                  </div>
                  <Badge variant={c.status === 'Active' ? 'default' : 'secondary'}>{c.status}</Badge>
                </div>
              ))}
            </div>
        }
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 更新 `src/renderer/src/pages/Settings.tsx`**

```tsx
import { Button } from '../components/ui/button'
import { api } from '../lib/api'
import { useState } from 'react'

export default function Settings() {
  const [backupStatus, setBackupStatus] = useState<'idle' | 'success' | 'fail'>('idle')

  const handleBackup = async () => {
    const res = await api.db.backup()
    setBackupStatus(res.success && res.data ? 'success' : 'fail')
    setTimeout(() => setBackupStatus('idle'), 3000)
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>
      <div className="max-w-md space-y-6">
        <div className="border rounded-md p-4 space-y-3">
          <h2 className="text-sm font-medium">Data Backup</h2>
          <p className="text-xs text-muted-foreground">Save a copy of your local database file to a location of your choice.</p>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleBackup}>Backup Database</Button>
            {backupStatus === 'success' && <span className="text-xs text-green-600">Backup saved successfully.</span>}
            {backupStatus === 'fail' && <span className="text-xs text-destructive">Backup failed or was cancelled.</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 提交**

```bash
git add .
git commit -m "feat: add Home summary page and Settings with database backup"
```

**验收检查：**
- 首页显示活跃 Campaign 数、即将结束 Campaign 列表、最近添加的 Campaign
- Settings 页面「Backup Database」弹出保存对话框，成功后显示确认信息

---

### Task 12：打包为 Windows .exe

**Files:**
- Create: `electron-builder.yml`
- Modify: `package.json`（添加 build 脚本）

- [ ] **Step 1: 创建 `electron-builder.yml`**

```yaml
appId: com.ttd.campaign-tracker
productName: Campaign Tracker
directories:
  output: dist
  buildResources: build
files:
  - out/**/*
  - node_modules/**/*
  - package.json
win:
  target:
    - target: nsis
      arch:
        - x64
  icon: build/icon.ico
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  installerIcon: build/icon.ico
  installerHeader: build/installerHeader.bmp
  createDesktopShortcut: always
  createStartMenuShortcut: true
asar: true
compression: maximum
```

- [ ] **Step 2: 在 `package.json` 中添加打包脚本**

```json
"scripts": {
  "build:win": "electron-vite build && electron-builder --win"
}
```

- [ ] **Step 3: 运行打包**

```bash
npm run build:win
```

预期：`dist/` 目录中生成 `Campaign Tracker Setup x.x.x.exe`

- [ ] **Step 4: 安装并测试打包后的 .exe**

双击安装，安装完成后从桌面快捷方式打开，验证所有功能正常。

- [ ] **Step 5: 最终提交**

```bash
git add electron-builder.yml
git commit -m "feat: add electron-builder config for Windows .exe packaging"
```

**验收检查：**
- `dist/` 目录中存在 `.exe` 文件
- 安装后双击打开，所有页面功能正常
- 关闭重新打开，之前创建的 Campaign 数据依然存在

---

## 最终验收回归清单

按照 PRD 中的验收标准逐条核对，使用以下测试数据：

1. 创建 **Campaign A**（Nike Q2 CTV，Active，有 1 个 Deal）
2. 创建 **Campaign B**（Adidas Winter Display，Ended，无 Deal）
3. 导入 `test-data/sample-performance.csv` 到 Campaign A
4. 验证以下内容：

### 模块一验收
- [ ] Campaign A 和 B 出现在列表
- [ ] 点击展开，Campaign A 显示 Deal 信息
- [ ] 编辑 Campaign B，修改 Client 名称，保存后列表更新
- [ ] 删除确认弹窗出现，删除后消失
- [ ] 搜索「Nike」只显示 Campaign A

### 模块二验收
- [ ] Timeline 显示 Campaign A 的绿色条（Active）
- [ ] Timeline 显示 Campaign B 的灰色条（Ended）
- [ ] 今日红线正确
- [ ] 点击 Campaign A 条，侧边栏显示全部字段 + Deal
- [ ] 过滤 Status = Active，只显示 Campaign A

### 模块三（导入）验收
- [ ] 选择 CSV 文件，预览 5 行正确
- [ ] 映射 date → date, impressions → impressions, spend → spend
- [ ] 导入成功，显示「5 rows imported」
- [ ] 「Overwrite」再次导入，结果仍是 5 行

### 模块三（Dashboard）验收
- [ ] 选择 Campaign A，KPI 卡片显示正确数值
- [ ] VCR 卡片有高亮边框（Primary KPI = VCR）
- [ ] 图表显示 5 天数据
- [ ] Export CSV 保存文件，可用 Excel 打开

### 首页验收
- [ ] 活跃 Campaign 计数正确
- [ ] 最近添加列表显示正确
