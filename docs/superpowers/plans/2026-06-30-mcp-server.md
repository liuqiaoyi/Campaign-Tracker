# Campaign-Tracker MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 Campaign-Tracker 增加一个 MCP server，让 Claude Code / Codex 能查询、创建/更新 campaign，并从 Excel 导入业绩数据，全部直接读写应用的 SQLite 文件。

**Architecture:** 把 `src/main/database.ts` 和 `ipc-handlers.ts` 里的纯数据/解析逻辑抽到不依赖 electron 的 `src/core/` 共享层（注入 dbPath）。Electron 主进程和新的 `mcp/` server 都复用同一份共享逻辑，保证 AI 写入与界面手动操作完全一致。MCP 用 stdio 与客户端通信。

**Tech Stack:** TypeScript, sql.js (WASM SQLite), xlsx (SheetJS), `@modelcontextprotocol/sdk`, vitest (测试), tsx/tsc (构建)。

## Global Constraints

- Node 内置 sql.js 是 **WASM 引擎，整库读入内存、每次改动整文件覆写**；外部写入与应用内存副本是 last-writer-wins。所有 MCP 写工具**必须先自动备份**再写。
- 产出 `.db` 是标准 SQLite 格式，sql.js 在 Node 下需要 `sql-wasm.wasm`，路径：`node_modules/sql.js/dist/sql-wasm.wasm`。
- 不依赖 electron 的代码一律放 `src/core/`；`src/main/` 才能 `import { app } from 'electron'`。
- 共享数据层对外 API 名称**保持与现有 `database.ts` 完全一致**（`listCampaigns / getCampaign / createCampaign / updateCampaign / queryPerformance / importPerformance / backupDatabaseTo / getDatabasePath / restoreDatabaseFrom / hasPerformanceData / listCampaignsWithDataStatus / deletePerformanceData`），避免改动 `ipc-handlers.ts` 的调用点。
- **不提供任何 `delete_*` MCP 工具**（用户要求，AI 无删除权限）。
- 必填字段：campaign 的 `name`；每条 line 的 `channel / start_date / end_date / primary_kpi`。业绩导入必填列：`date / impressions`。
- 业绩导入语义为**删旧插新**（同 UI），不是追加。
- DB 默认路径探测顺序：`CAMPAIGN_TRACKER_DB` 环境变量 → macOS `~/Library/Application Support/{campaign-tracker, Campaign Tracker}/campaign-tracker.db` → Windows `%APPDATA%/{campaign-tracker, Campaign Tracker}/campaign-tracker.db`。主力为 dev 版（目录名 `campaign-tracker`）。
- 每个任务结束都 commit，commit message 用英文 conventional commits。

---

### Task 1: 引入 vitest 测试工具

**Files:**
- Modify: `package.json`（devDependencies + scripts）
- Create: `vitest.config.ts`
- Create: `src/core/smoke.test.ts`（临时冒烟测试，Task 2 后删除）

**Interfaces:**
- Produces: `npm test` 可运行 vitest；`src/core/` 下 `*.test.ts` 会被识别。

- [ ] **Step 1: 安装 vitest**

Run:
```bash
npm install -D vitest@^2.1.0
```
Expected: `vitest` 写入 devDependencies，无报错。

- [ ] **Step 2: 写 vitest 配置**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'mcp/**/*.test.ts'],
    environment: 'node',
  },
})
```

- [ ] **Step 3: 加 test 脚本**

在 `package.json` 的 `scripts` 中加入：
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: 写冒烟测试确认工具链**

Create `src/core/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

describe('toolchain', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: 运行测试**

Run: `npm test`
Expected: PASS，1 个测试通过。

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/core/smoke.test.ts
git commit -m "test: add vitest test runner"
```

---

### Task 2: 抽出不依赖 electron 的数据层 `src/core/db.ts`

把 `src/main/database.ts` 的逻辑整体迁到 `src/core/db.ts`，唯一改动是 **DB 路径与 WASM 路径由调用方注入**，不再 `import { app } from 'electron'`。`src/main/database.ts` 变成注入 electron 路径的薄壳并 re-export 全部 API。

**Files:**
- Create: `src/core/db.ts`
- Modify: `src/main/database.ts`（改为薄壳）
- Test: `src/core/db.test.ts`
- Delete: `src/core/smoke.test.ts`

**Interfaces:**
- Produces:
  - `initDb(opts: { dbPath: string; wasmPath: string }): Promise<void>`
  - `getDatabasePath(): string`
  - `listCampaigns(): Campaign[]`
  - `getCampaign(id: number): Campaign | undefined`
  - `createCampaign(data, lines): Campaign`（签名同现有 `database.ts`）
  - `updateCampaign(id, data, lines): Campaign | undefined`
  - `queryPerformance(campaign_id, from?, to?): PerformanceData[]`
  - `importPerformance(opts: ImportOptions, rows: PerformanceData[]): ImportResult`
  - `backupDatabaseTo(destinationPath: string): string`
  - `restoreDatabaseFrom(sourcePath): { dbPath, safetyBackupPath }`
  - `hasPerformanceData(campaign_id): boolean`
  - `listCampaignsWithDataStatus()`
  - `deletePerformanceData(campaign_id): number`
- Consumes（Task 1）：vitest。

- [ ] **Step 1: 写失败测试 `src/core/db.test.ts`**

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as db from './db'

const wasmPath = path.join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm')

describe('core/db', () => {
  beforeAll(async () => {
    const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-')), 'test.db')
    await db.initDb({ dbPath, wasmPath })
  })

  it('creates and lists a campaign with one line', () => {
    const created = db.createCampaign(
      { name: 'Acme Q3', client: 'Acme' } as any,
      [{ channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', budget: 50000, primary_kpi: 'CTR' } as any]
    )
    expect(created.id).toBeGreaterThan(0)
    const all = db.listCampaigns()
    expect(all.find(c => c.id === created.id)?.name).toBe('Acme Q3')
    expect(all.find(c => c.id === created.id)?.lines?.[0].channel).toBe('CTV')
  })

  it('imports and queries performance rows', () => {
    const c = db.createCampaign({ name: 'Perf Co', client: 'P' } as any,
      [{ channel: 'Display', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'VCR' } as any])
    const lineId = c.lines![0].id
    const res = db.importPerformance(
      { campaign_id: c.id, campaign_line_id: lineId, file_path: '', keep_zero_impressions: false },
      [{ campaign_id: c.id, date: '2026-07-02', impressions: 1000, clicks: 5 } as any]
    )
    expect(res.imported_rows).toBe(1)
    const rows = db.queryPerformance(c.id)
    expect(rows[0].impressions).toBe(1000)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/core/db.test.ts`
Expected: FAIL（`./db` 模块不存在）。

- [ ] **Step 3: 创建 `src/core/db.ts`**

把 `src/main/database.ts` 的**全部内容**复制到 `src/core/db.ts`，然后做以下 3 处修改：

1. 删除顶部 `import { app } from 'electron'` 和 `import * as path from 'path'`（path 仍需要，保留 path，仅删 electron 那行）。把 `import type { ... } from '../shared/types'` 改为 `import type { ... } from '../shared/types'`（路径不变，仍是 `../shared/types`）。

2. 把现有的 `export async function initDatabase(): Promise<void> { ... }` 整个替换为接收注入路径的版本：
```ts
export async function initDb(opts: { dbPath: string; wasmPath: string }): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const initSqlJs = require('sql.js')
  _SQL = await initSqlJs({ locateFile: () => opts.wasmPath })
  _dbPath = opts.dbPath
  if (fs.existsSync(_dbPath)) {
    _db = new _SQL.Database(fs.readFileSync(_dbPath))
  } else {
    _db = new _SQL.Database()
  }
  createSchema()
  console.log(`[DB] SQLite ready at: ${_dbPath}`)
}
```

3. 其余所有函数（`createSchema / run / queryAll / createCampaign / updateCampaign / importPerformance / backupDatabaseTo / restoreDatabaseFrom / deriveLineStatus` 等）**原样保留**，不改动。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/core/db.test.ts`
Expected: PASS（2 个测试通过）。

- [ ] **Step 5: 把 `src/main/database.ts` 改成薄壳**

把 `src/main/database.ts` **整个文件内容替换**为：
```ts
/**
 * Electron adapter over the shared, electron-free data layer in src/core/db.ts.
 * Resolves the userData db path + bundled WASM path, then delegates everything.
 */
import { app } from 'electron'
import * as path from 'path'
import * as core from '../core/db'

export * from '../core/db'

export async function initDatabase(): Promise<void> {
  const wasmPath = app.isPackaged
    ? path.join(process.resourcesPath, 'sql-wasm.wasm')
    : path.join(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm')
  const dbPath = path.join(app.getPath('userData'), 'campaign-tracker.db')
  await core.initDb({ dbPath, wasmPath })
}
```

- [ ] **Step 6: 确认主进程仍引用 `initDatabase`**

Run: `grep -rn "initDatabase" src/main/`
Expected: `src/main/index.ts` 调用 `initDatabase()` —— 名称未变，无需改动。

- [ ] **Step 7: 删除冒烟测试并重跑全部**

```bash
rm src/core/smoke.test.ts
npm test
```
Expected: PASS（db.test.ts 通过）。

- [ ] **Step 8: Commit**

```bash
git add src/core/db.ts src/main/database.ts src/core/db.test.ts
git rm --cached src/core/smoke.test.ts 2>/dev/null; git add -A
git commit -m "refactor: extract electron-free data layer into src/core/db.ts"
```

---

### Task 3: 抽出 Excel 列映射 `src/core/import-mapping.ts`

把 `ipc-handlers.ts` 顶部的列映射/行规范化逻辑抽成共享模块并导出，`ipc-handlers.ts` 改为 import。

**Files:**
- Create: `src/core/import-mapping.ts`
- Modify: `src/main/ipc-handlers.ts`（删除本地定义，改为 import）
- Test: `src/core/import-mapping.test.ts`

**Interfaces:**
- Produces:
  - `getImportMapping(columns: string[]): { mapped: Array<{source:string; field:keyof PerformanceData; label:string}>; missingRequired: string[] }`
  - `mapRow(raw: Record<string, unknown>, campaignId: number): PerformanceData`
  - `REQUIRED_IMPORT_FIELDS: Array<keyof PerformanceData>`
- Consumes: `PerformanceData`（`../shared/types`）。

- [ ] **Step 1: 写失败测试 `src/core/import-mapping.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { getImportMapping, mapRow } from './import-mapping'

describe('core/import-mapping', () => {
  it('maps TTD columns and flags missing required', () => {
    const m = getImportMapping(['Date', 'Impressions', 'Clicks'])
    expect(m.missingRequired).toEqual([])
    expect(m.mapped.find(x => x.field === 'impressions')?.source).toBe('Impressions')

    const missing = getImportMapping(['Clicks'])
    expect(missing.missingRequired).toContain('Date')
    expect(missing.missingRequired).toContain('Impressions')
  })

  it('coerces numeric fields and defaults to 0', () => {
    const row = mapRow({ Date: '2026-07-02', Impressions: '1000', Clicks: 5 }, 7)
    expect(row.campaign_id).toBe(7)
    expect(row.impressions).toBe(1000)
    expect(row.clicks).toBe(5)
    expect(row.player_starts).toBe(0)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/core/import-mapping.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 创建 `src/core/import-mapping.ts`**

从 `src/main/ipc-handlers.ts` 把以下内容**整段剪切**到新文件，并在 `getImportMapping`、`mapRow`、`REQUIRED_IMPORT_FIELDS` 前加 `export`：

- `COLUMN_MAP`（完整对象，含所有 `conv_01`..`conv_20` 与所有 TTD 列名映射，位于约 1–57 行）
- `REQUIRED_IMPORT_FIELDS`、`FIELD_LABELS`、`NORMALIZED_COLUMN_MAP`
- `normalizeColumnName`、`getImportMapping`、`getMappedValue`、`parseExcelDate`、`mapRow`

文件顶部加：
```ts
import type { PerformanceData } from '../shared/types'
```
导出三个公共符号：
```ts
export const REQUIRED_IMPORT_FIELDS: Array<keyof PerformanceData> = ['date', 'impressions']
export function getImportMapping(columns: string[]) { /* 原逻辑 */ }
export function mapRow(raw: Record<string, unknown>, campaignId: number): PerformanceData { /* 原逻辑 */ }
```
（`COLUMN_MAP / FIELD_LABELS / NORMALIZED_COLUMN_MAP / normalizeColumnName / getMappedValue / parseExcelDate` 保持模块内私有，无需 export。）

- [ ] **Step 4: 修改 `ipc-handlers.ts` 引用共享模块**

在 `ipc-handlers.ts` 顶部 import 区加入：
```ts
import { getImportMapping, mapRow } from '../core/import-mapping'
```
删除被剪切的本地定义（`COLUMN_MAP` 到 `mapRow`，约 1–160 行之间这些 helper）。**保留** `GitHubReleaseAsset` / `pickPlatformAsset` 等与映射无关的代码。`dialog:parseFile` 和 `PERFORMANCE.IMPORT` 两个 handler 内对 `getImportMapping / mapRow` 的调用保持不变。

- [ ] **Step 5: 运行测试**

Run: `npx vitest run src/core/import-mapping.test.ts`
Expected: PASS。

- [ ] **Step 6: 类型检查**

Run: `npx tsc --noEmit -p tsconfig.node.json`
Expected: 无新增错误（若该 tsconfig 不存在，运行 `npx tsc --noEmit` 确认 `ipc-handlers.ts` 无未定义引用）。

- [ ] **Step 7: Commit**

```bash
git add src/core/import-mapping.ts src/main/ipc-handlers.ts src/core/import-mapping.test.ts
git commit -m "refactor: extract Excel column mapping into src/core/import-mapping.ts"
```

---

### Task 4: 抽出文件解析 `src/core/parse-file.ts`

提供一个独立的 `parseFile(filePath)`（供 MCP 复用），与 UI 的 `dialog:parseFile` 行为一致。

**Files:**
- Create: `src/core/parse-file.ts`
- Modify: `src/main/ipc-handlers.ts`（`dialog:parseFile` handler 改为调用共享函数）
- Test: `src/core/parse-file.test.ts`

**Interfaces:**
- Produces:
  - `parseFile(filePath: string): { columns: string[]; rows: Record<string, unknown>[]; total_rows: number; zero_impression_rows: number; mapped_columns: Array<{source:string; field:string; label:string}>; missing_required_columns: string[] }`
- Consumes: `getImportMapping`（Task 3）；`xlsx`。

- [ ] **Step 1: 写失败测试 `src/core/parse-file.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as XLSX from 'xlsx'
import { parseFile } from './parse-file'

function fixture(): string {
  const ws = XLSX.utils.json_to_sheet([
    { Date: '2026-07-02', Impressions: 1000, Clicks: 5 },
    { Date: '2026-07-03', Impressions: 0, Clicks: 0 },
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-xlsx-')), 'perf.xlsx')
  XLSX.writeFile(wb, p)
  return p
}

describe('core/parse-file', () => {
  it('parses an xlsx and reports mapping', () => {
    const res = parseFile(fixture())
    expect(res.total_rows).toBe(2)
    expect(res.zero_impression_rows).toBe(1)
    expect(res.missing_required_columns).toEqual([])
    expect(res.columns).toContain('Impressions')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/core/parse-file.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 创建 `src/core/parse-file.ts`**

```ts
import * as XLSX from 'xlsx'
import { getImportMapping } from './import-mapping'

export function parseFile(filePath: string) {
  const workbook = XLSX.readFile(filePath)
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { raw: true })
  const columns = rows.length > 0 ? Object.keys(rows[0]) : []
  const mapping = getImportMapping(columns)
  const idx = new Map(mapping.mapped.map(m => [m.field, m.source]))
  const impSource = idx.get('impressions')
  const zero_impression_rows = impSource
    ? rows.filter(r => (Number(r[impSource]) || 0) === 0).length
    : 0
  return {
    columns,
    rows,
    total_rows: rows.length,
    zero_impression_rows,
    mapped_columns: mapping.mapped.map(m => ({ source: m.source, field: String(m.field), label: m.label })),
    missing_required_columns: mapping.missingRequired,
  }
}
```

- [ ] **Step 4: 运行测试**

Run: `npx vitest run src/core/parse-file.test.ts`
Expected: PASS。

- [ ] **Step 5: `dialog:parseFile` handler 改用共享函数**

在 `ipc-handlers.ts` 顶部加 `import { parseFile } from '../core/parse-file'`，把 `dialog:parseFile` handler 改为：
```ts
ipcMain.handle('dialog:parseFile', async (_e, filePath: string) => {
  try { return ok(parseFile(filePath)) } catch (e) { return err(e) }
})
```

- [ ] **Step 6: 运行全部测试**

Run: `npm test`
Expected: PASS（db / import-mapping / parse-file 全通过）。

- [ ] **Step 7: Commit**

```bash
git add src/core/parse-file.ts src/main/ipc-handlers.ts src/core/parse-file.test.ts
git commit -m "refactor: extract file parsing into src/core/parse-file.ts"
```

---

### Task 5: MCP 包脚手架 + DB 路径解析

建立 `mcp/` 子包与 DB 路径探测逻辑。

**Files:**
- Create: `mcp/package.json`
- Create: `mcp/tsconfig.json`
- Create: `mcp/src/db-path.ts`
- Test: `mcp/src/db-path.test.ts`

**Interfaces:**
- Produces:
  - `resolveDbPath(env?: NodeJS.ProcessEnv): string`（找不到抛错）
  - `resolveWasmPath(): string`
- Consumes: 无。

- [ ] **Step 1: 写 `mcp/package.json`**

```json
{
  "name": "campaign-tracker-mcp",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "bin": { "campaign-tracker-mcp": "dist/index.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  }
}
```
（`sql.js`、`xlsx` 复用仓库根 `node_modules`，不重复声明。）

- [ ] **Step 2: 写 `mcp/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "CommonJS",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".."
  },
  "include": ["src/**/*.ts", "../src/core/**/*.ts", "../src/shared/**/*.ts"],
  "exclude": ["**/*.test.ts"]
}
```

- [ ] **Step 3: 安装 SDK**

Run:
```bash
cd mcp && npm install && cd ..
```
Expected: `mcp/node_modules` 生成，无报错。

- [ ] **Step 4: 写失败测试 `mcp/src/db-path.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import { resolveDbPath } from './db-path'

describe('mcp/db-path', () => {
  it('prefers CAMPAIGN_TRACKER_DB when the file exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-env-'))
    const p = path.join(dir, 'campaign-tracker.db')
    fs.writeFileSync(p, '')
    expect(resolveDbPath({ CAMPAIGN_TRACKER_DB: p } as any)).toBe(p)
  })

  it('throws a clear error when nothing is found', () => {
    expect(() => resolveDbPath({ HOME: '/nonexistent-xyz' } as any))
      .toThrow(/CAMPAIGN_TRACKER_DB/)
  })
})
```

- [ ] **Step 5: 运行确认失败**

Run: `npx vitest run mcp/src/db-path.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 6: 创建 `mcp/src/db-path.ts`**

```ts
import * as path from 'path'
import * as fs from 'fs'

const APP_DIR_NAMES = ['campaign-tracker', 'Campaign Tracker']

function candidatePaths(env: NodeJS.ProcessEnv): string[] {
  const out: string[] = []
  const home = env.HOME || env.USERPROFILE || ''
  if (env.APPDATA) {
    for (const d of APP_DIR_NAMES) out.push(path.join(env.APPDATA, d, 'campaign-tracker.db'))
  }
  if (home) {
    for (const d of APP_DIR_NAMES) {
      out.push(path.join(home, 'Library', 'Application Support', d, 'campaign-tracker.db'))
      out.push(path.join(home, '.config', d, 'campaign-tracker.db'))
    }
  }
  return out
}

export function resolveDbPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CAMPAIGN_TRACKER_DB) {
    if (fs.existsSync(env.CAMPAIGN_TRACKER_DB)) return env.CAMPAIGN_TRACKER_DB
    throw new Error(`CAMPAIGN_TRACKER_DB points to a missing file: ${env.CAMPAIGN_TRACKER_DB}`)
  }
  for (const p of candidatePaths(env)) {
    if (fs.existsSync(p)) return p
  }
  throw new Error(
    'Could not locate campaign-tracker.db. Set the CAMPAIGN_TRACKER_DB environment variable to its full path.'
  )
}

export function resolveWasmPath(): string {
  return path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
}
```

- [ ] **Step 7: 运行测试**

Run: `npx vitest run mcp/src/db-path.test.ts`
Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add mcp/package.json mcp/tsconfig.json mcp/src/db-path.ts mcp/src/db-path.test.ts mcp/package-lock.json
git commit -m "feat(mcp): scaffold package and db-path resolution"
```

---

### Task 6: MCP 读工具

实现 4 个只读工具，注册到 MCP server。

**Files:**
- Create: `mcp/src/tools.ts`（工具实现，纯函数，便于测试）
- Test: `mcp/src/tools.read.test.ts`

**Interfaces:**
- Produces:
  - `listCampaignsTool(): unknown`（= `core.listCampaignsWithDataStatus()`）
  - `getCampaignTool(args: { id: number }): unknown`
  - `findCampaignTool(args: { query: string }): { id:number; name:string; client:string; ttd_campaign_id?:string; status:string }[]`
  - `queryPerformanceTool(args: { campaign_id:number; from?:string; to?:string }): unknown`
- Consumes: `src/core/db`（Task 2）。

- [ ] **Step 1: 写失败测试 `mcp/src/tools.read.test.ts`**

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as db from '../../src/core/db'
import { findCampaignTool, getCampaignTool, listCampaignsTool } from './tools'

const wasmPath = path.join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm')

describe('mcp read tools', () => {
  let id: number
  beforeAll(async () => {
    const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-rt-')), 'test.db')
    await db.initDb({ dbPath, wasmPath })
    const c = db.createCampaign({ name: 'Nike Summer', client: 'Nike' } as any,
      [{ channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'VCR' } as any])
    id = c.id
  })

  it('find_campaign matches by client substring (case-insensitive)', () => {
    const hits = findCampaignTool({ query: 'nike' })
    expect(hits.some(h => h.id === id)).toBe(true)
  })

  it('get_campaign returns full record', () => {
    expect((getCampaignTool({ id }) as any).name).toBe('Nike Summer')
  })

  it('list_campaigns includes data status', () => {
    const list = listCampaignsTool() as any[]
    expect(list.find(x => x.campaign.id === id)?.hasData).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run mcp/src/tools.read.test.ts`
Expected: FAIL（`./tools` 不存在）。

- [ ] **Step 3: 创建 `mcp/src/tools.ts`（读工具部分）**

```ts
import * as db from '../../src/core/db'

export function listCampaignsTool() {
  return db.listCampaignsWithDataStatus()
}

export function getCampaignTool(args: { id: number }) {
  const c = db.getCampaign(args.id)
  if (!c) throw new Error(`Campaign ${args.id} not found`)
  return c
}

export function findCampaignTool(args: { query: string }) {
  const q = args.query.toLowerCase()
  return db.listCampaigns()
    .filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.client ?? '').toLowerCase().includes(q) ||
      (c.ttd_campaign_id ?? '').toLowerCase().includes(q))
    .map(c => ({ id: c.id, name: c.name, client: c.client, ttd_campaign_id: c.ttd_campaign_id, status: c.status }))
}

export function queryPerformanceTool(args: { campaign_id: number; from?: string; to?: string }) {
  return db.queryPerformance(args.campaign_id, args.from, args.to)
}
```

- [ ] **Step 4: 运行测试**

Run: `npx vitest run mcp/src/tools.read.test.ts`
Expected: PASS（3 个测试通过）。

- [ ] **Step 5: Commit**

```bash
git add mcp/src/tools.ts mcp/src/tools.read.test.ts
git commit -m "feat(mcp): add read tools (list/get/find/query)"
```

---

### Task 7: MCP 写工具（create / update + 自动备份）

**Files:**
- Modify: `mcp/src/tools.ts`（追加写工具 + 备份 helper）
- Test: `mcp/src/tools.write.test.ts`

**Interfaces:**
- Produces:
  - `backupBeforeWrite(): string`（备份当前 db，返回备份路径）
  - `createCampaignTool(args: { data: {name:string; client:string; agency?:string; status?:string; notes?:string}; lines: Array<{channel:string; start_date:string; end_date:string; primary_kpi:string; country?:string; budget?:number; cpm_goal?:number; secondary_kpi?:string; status?:string; notes?:string}> }): { campaign: unknown; note: string }`
  - `updateCampaignTool(args: { id:number; data:...; lines:... }): { campaign: unknown; note: string }`
- Consumes: `core.createCampaign / updateCampaign / backupDatabaseTo / getDatabasePath`。

- [ ] **Step 1: 写失败测试 `mcp/src/tools.write.test.ts`**

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as db from '../../src/core/db'
import { createCampaignTool, updateCampaignTool } from './tools'

const wasmPath = path.join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm')

describe('mcp write tools', () => {
  let dir: string
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-wt-'))
    await db.initDb({ dbPath: path.join(dir, 'test.db'), wasmPath })
  })

  it('creates a campaign and writes a backup file', () => {
    const before = fs.readdirSync(dir).length
    const res = createCampaignTool({
      data: { name: 'New Co', client: 'NC' },
      lines: [{ channel: 'CTV', start_date: '2026-08-01', end_date: '2026-08-31', primary_kpi: 'CTR', budget: 1000 }],
    })
    expect((res.campaign as any).id).toBeGreaterThan(0)
    expect(res.note).toMatch(/restart/i)
    expect(fs.readdirSync(dir).length).toBeGreaterThan(before) // backup created
  })

  it('updates an existing campaign', () => {
    const created = createCampaignTool({
      data: { name: 'Edit Me', client: 'E' },
      lines: [{ channel: 'Display', start_date: '2026-08-01', end_date: '2026-08-31', primary_kpi: 'VCR' }],
    })
    const id = (created.campaign as any).id
    const updated = updateCampaignTool({
      id,
      data: { name: 'Edited', client: 'E' },
      lines: [{ channel: 'Display', start_date: '2026-08-01', end_date: '2026-08-31', primary_kpi: 'VCR' }],
    })
    expect((updated.campaign as any).name).toBe('Edited')
  })

  it('rejects a campaign with no lines', () => {
    expect(() => createCampaignTool({ data: { name: 'X', client: 'X' }, lines: [] }))
      .toThrow(/at least one line/i)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run mcp/src/tools.write.test.ts`
Expected: FAIL（函数未定义）。

- [ ] **Step 3: 在 `mcp/src/tools.ts` 追加写工具**

```ts
import * as path from 'path'

const RESTART_NOTE = 'Saved. Restart Campaign Tracker (or open it fresh) to see the change — the app caches the DB in memory.'

export function backupBeforeWrite(): string {
  const dbPath = db.getDatabasePath()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = path.join(path.dirname(dbPath), `campaign-tracker-before-mcp-${stamp}.db`)
  return db.backupDatabaseTo(dest)
}

function assertLines(lines: unknown[]) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('A campaign needs at least one line (channel, start_date, end_date, primary_kpi).')
  }
}

export function createCampaignTool(args: { data: any; lines: any[] }) {
  if (!args.data?.name) throw new Error('Campaign name is required.')
  assertLines(args.lines)
  backupBeforeWrite()
  const campaign = db.createCampaign(args.data, args.lines)
  return { campaign, note: RESTART_NOTE }
}

export function updateCampaignTool(args: { id: number; data: any; lines: any[] }) {
  if (!db.getCampaign(args.id)) throw new Error(`Campaign ${args.id} not found`)
  assertLines(args.lines)
  backupBeforeWrite()
  const campaign = db.updateCampaign(args.id, args.data, args.lines)
  return { campaign, note: RESTART_NOTE }
}
```
（`import * as path from 'path'` 若文件顶部已存在则不重复添加。）

- [ ] **Step 4: 运行测试**

Run: `npx vitest run mcp/src/tools.write.test.ts`
Expected: PASS（3 个测试通过）。

- [ ] **Step 5: Commit**

```bash
git add mcp/src/tools.ts mcp/src/tools.write.test.ts
git commit -m "feat(mcp): add create/update tools with auto-backup"
```

---

### Task 8: MCP 导入工具（preview / import）

**Files:**
- Modify: `mcp/src/tools.ts`（追加导入工具）
- Test: `mcp/src/tools.import.test.ts`

**Interfaces:**
- Produces:
  - `previewImportTool(args: { file_path: string }): ReturnType<typeof parseFile>`
  - `importPerformanceTool(args: { campaign_id:number; campaign_line_id:number; file_path:string; keep_zero_impressions?:boolean }): { result: ImportResult; note: string }`
- Consumes: `parseFile`（Task 4）、`mapRow / getImportMapping`（Task 3）、`core.importPerformance`（Task 2）。

- [ ] **Step 1: 写失败测试 `mcp/src/tools.import.test.ts`**

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as XLSX from 'xlsx'
import * as db from '../../src/core/db'
import { previewImportTool, importPerformanceTool } from './tools'

const wasmPath = path.join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm')

function fixture(dir: string): string {
  const ws = XLSX.utils.json_to_sheet([{ Date: '2026-07-02', Impressions: 1000, Clicks: 5 }])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const p = path.join(dir, 'perf.xlsx')
  XLSX.writeFile(wb, p)
  return p
}

describe('mcp import tools', () => {
  let dir: string, campaignId: number, lineId: number
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-it-'))
    await db.initDb({ dbPath: path.join(dir, 'test.db'), wasmPath })
    const c = db.createCampaign({ name: 'Imp Co', client: 'I' } as any,
      [{ channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'VCR' } as any])
    campaignId = c.id; lineId = c.lines![0].id
  })

  it('preview reports columns without writing', () => {
    const res = previewImportTool({ file_path: fixture(dir) })
    expect(res.missing_required_columns).toEqual([])
    expect(db.hasPerformanceData(campaignId)).toBe(false)
  })

  it('import writes rows and returns counts', () => {
    const res = importPerformanceTool({ campaign_id: campaignId, campaign_line_id: lineId, file_path: fixture(dir) })
    expect(res.result.imported_rows).toBe(1)
    expect(db.queryPerformance(campaignId)[0].impressions).toBe(1000)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run mcp/src/tools.import.test.ts`
Expected: FAIL（函数未定义）。

- [ ] **Step 3: 在 `mcp/src/tools.ts` 追加导入工具**

文件顶部 import 区加：
```ts
import { parseFile } from '../../src/core/parse-file'
import { getImportMapping, mapRow } from '../../src/core/import-mapping'
```
追加：
```ts
export function previewImportTool(args: { file_path: string }) {
  return parseFile(args.file_path)
}

export function importPerformanceTool(args: {
  campaign_id: number
  campaign_line_id: number
  file_path: string
  keep_zero_impressions?: boolean
}) {
  const parsed = parseFile(args.file_path)
  const mapping = getImportMapping(parsed.columns)
  if (mapping.missingRequired.length > 0) {
    throw new Error(`Missing required columns: ${mapping.missingRequired.join(', ')}`)
  }
  backupBeforeWrite()
  const rows = parsed.rows.map(r => mapRow(r, args.campaign_id))
  const result = db.importPerformance(
    {
      campaign_id: args.campaign_id,
      campaign_line_id: args.campaign_line_id,
      file_path: args.file_path,
      keep_zero_impressions: args.keep_zero_impressions ?? false,
    },
    rows
  )
  return { result, note: RESTART_NOTE }
}
```

- [ ] **Step 4: 运行测试**

Run: `npx vitest run mcp/src/tools.import.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add mcp/src/tools.ts mcp/src/tools.import.test.ts
git commit -m "feat(mcp): add preview/import performance tools"
```

---

### Task 9: MCP server 入口 + 工具注册 + 客户端配置

把工具接到 `@modelcontextprotocol/sdk` 的 server 上，做入口初始化，提供两端配置与文档。

**Files:**
- Create: `mcp/src/server.ts`（注册工具 schema + handler）
- Create: `mcp/src/index.ts`（入口）
- Create: `mcp/README.md`
- Create: `.mcp.json`（Claude Code 项目级配置）

**Interfaces:**
- Consumes: 全部 `tools.ts` 导出、`resolveDbPath / resolveWasmPath`（Task 5）、`core.initDb`（Task 2）。
- Produces: 可执行 `node mcp/dist/index.js`，stdio MCP server，暴露 8 个工具。

- [ ] **Step 1: 创建 `mcp/src/server.ts`**

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  listCampaignsTool, getCampaignTool, findCampaignTool, queryPerformanceTool,
  createCampaignTool, updateCampaignTool, previewImportTool, importPerformanceTool,
} from './tools'

function json(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

const lineSchema = {
  type: 'object',
  required: ['channel', 'start_date', 'end_date', 'primary_kpi'],
  properties: {
    channel: { type: 'string' }, country: { type: 'string' },
    start_date: { type: 'string' }, end_date: { type: 'string' },
    budget: { type: 'number' }, cpm_goal: { type: 'number' },
    primary_kpi: { type: 'string' }, secondary_kpi: { type: 'string' },
    status: { type: 'string' }, notes: { type: 'string' }, ttd_campaign_id: { type: 'string' },
  },
}
const dataSchema = {
  type: 'object', required: ['name', 'client'],
  properties: {
    name: { type: 'string' }, client: { type: 'string' }, agency: { type: 'string' },
    status: { type: 'string' }, notes: { type: 'string' },
  },
}

export function buildServer(): McpServer {
  const server = new McpServer({ name: 'campaign-tracker', version: '0.1.0' })

  server.tool('list_campaigns', 'List all campaigns with whether they have performance data.',
    {}, async () => json(listCampaignsTool()))

  server.tool('get_campaign', 'Get one campaign with its lines, flights and deals.',
    { id: { type: 'number' } }, async (a: any) => json(getCampaignTool(a)))

  server.tool('find_campaign', 'Fuzzy-find campaigns by name, client or TTD campaign id.',
    { query: { type: 'string' } }, async (a: any) => json(findCampaignTool(a)))

  server.tool('query_performance', 'Query performance rows for a campaign, optional date range.',
    { campaign_id: { type: 'number' }, from: { type: 'string' }, to: { type: 'string' } },
    async (a: any) => json(queryPerformanceTool(a)))

  server.tool('create_campaign', 'Create a campaign. Requires name, client and at least one line.',
    { data: dataSchema, lines: { type: 'array', items: lineSchema } },
    async (a: any) => json(createCampaignTool(a)))

  server.tool('update_campaign', 'Replace a campaign and its lines. Requires id.',
    { id: { type: 'number' }, data: dataSchema, lines: { type: 'array', items: lineSchema } },
    async (a: any) => json(updateCampaignTool(a)))

  server.tool('preview_import', 'Parse a TTD Excel/CSV and report column mapping WITHOUT writing.',
    { file_path: { type: 'string' } }, async (a: any) => json(previewImportTool(a)))

  server.tool('import_performance', 'Import performance data from a file into a campaign line (replaces existing rows for that line).',
    {
      campaign_id: { type: 'number' }, campaign_line_id: { type: 'number' },
      file_path: { type: 'string' }, keep_zero_impressions: { type: 'boolean' },
    },
    async (a: any) => json(importPerformanceTool(a)))

  return server
}
```
> 注：`@modelcontextprotocol/sdk` 的 `server.tool(name, description, schema, handler)` 形参以实际安装版本为准；若该版本要求 zod schema，则把上面的 JSON schema 改为等价 zod 定义（`import { z } from 'zod'`，根 node_modules 已随 SDK 提供）。实现时先 `node -e "console.log(require('@modelcontextprotocol/sdk/package.json').version)"` 确认版本再定 schema 写法。

- [ ] **Step 2: 创建 `mcp/src/index.ts`**

```ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import * as db from '../../src/core/db'
import { resolveDbPath, resolveWasmPath } from './db-path'
import { buildServer } from './server'

async function main() {
  const dbPath = resolveDbPath()
  await db.initDb({ dbPath, wasmPath: resolveWasmPath() })
  console.error(`[campaign-tracker-mcp] using db: ${dbPath}`)
  const server = buildServer()
  await server.connect(new StdioServerTransport())
}

main().catch(err => {
  console.error('[campaign-tracker-mcp] fatal:', err)
  process.exit(1)
})
```

- [ ] **Step 3: 构建**

Run:
```bash
cd mcp && npm run build && cd ..
```
Expected: 生成 `mcp/dist/index.js`，无类型错误。（若报 SDK API 不符，按 Step 1 注释调整 schema 写法后重试。）

- [ ] **Step 4: 冒烟测试 server 能启动并列出工具**

Run（在仓库根，先确保 dev 版应用至少跑过一次以生成 db，或临时建一个空 db）：
```bash
CAMPAIGN_TRACKER_DB="$HOME/Library/Application Support/campaign-tracker/campaign-tracker.db" \
  node mcp/dist/index.js <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"tools/list"}
EOF
```
Expected: stderr 打印 `using db:` 行；stdout 返回包含 8 个工具的 JSON-RPC 响应。（若 db 文件不存在会明确报错提示设置环境变量——属预期。）

- [ ] **Step 5: 创建 `.mcp.json`（Claude Code）**

```json
{
  "mcpServers": {
    "campaign-tracker": {
      "command": "node",
      "args": ["./mcp/dist/index.js"],
      "env": {
        "CAMPAIGN_TRACKER_DB": "${HOME}/Library/Application Support/campaign-tracker/campaign-tracker.db"
      }
    }
  }
}
```

- [ ] **Step 6: 创建 `mcp/README.md`**

写明：
- 构建：`cd mcp && npm install && npm run build`
- 写操作前 app 最好关闭；写完**重启 app** 才能看到改动；每次写会自动备份 `campaign-tracker-before-mcp-*.db`。
- 8 个工具一览（名称 + 一句话）。
- Claude Code：仓库已带 `.mcp.json`，在该目录启动 Claude Code 即自动加载。
- Codex：在 `~/.codex/config.toml` 加：
```toml
[mcp_servers.campaign-tracker]
command = "node"
args = ["/Users/derrick/Desktop/Campaign-Tracker/mcp/dist/index.js"]
env = { CAMPAIGN_TRACKER_DB = "/Users/derrick/Library/Application Support/campaign-tracker/campaign-tracker.db" }
```

- [ ] **Step 7: 运行全部测试**

Run: `npm test`
Expected: PASS（core + mcp 全部测试通过）。

- [ ] **Step 8: Commit**

```bash
git add mcp/src/server.ts mcp/src/index.ts mcp/README.md .mcp.json
git commit -m "feat(mcp): wire stdio server, tool registration and client configs"
```

---

## Self-Review

**Spec coverage:**
- A 导入业绩 → Task 4（parse）+ Task 8（preview/import）✅
- B 建/改 campaign → Task 7 ✅
- 查询现有数据 → Task 6 ✅
- 解耦重构 DRY → Task 2/3/4 ✅
- 自动备份 + 重启提示 → Task 7/8 ✅
- DB 路径探测（dev 优先）→ Task 5 ✅
- 不给删除权限 → 全程无 `delete_*` 工具，Global Constraints 明确 ✅
- 两端配置 → Task 9 Step 5/6 ✅
- 测试 → 每个 core/mcp 模块均有 vitest 测试 ✅

**Placeholder scan:** 无 TBD/TODO；唯一"按实际版本确认"的点（SDK schema 写法）已给出确认命令与 fallback，非占位。

**Type consistency:** `initDb({dbPath, wasmPath})`、`createCampaign(data, lines)`、`importPerformance(opts, rows)`、`parseFile(filePath)`、`getImportMapping/mapRow`、`resolveDbPath/resolveWasmPath`、各 `*Tool` 命名在任务间一致。共享层 API 名称与现有 `database.ts` 保持一致，`ipc-handlers.ts` 调用点无需改动。
