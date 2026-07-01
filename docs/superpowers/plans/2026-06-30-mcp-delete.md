# MCP 删除功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Campaign Tracker MCP server 新增 3 个删除工具（campaign / campaign line / performance），删除前强制经过"预览 → 用户确认 → 执行"的两步 token 流程。

**Architecture:** Core 层新增 `deleteCampaignLine` 与只读 `getCampaignLineSummary`；新建进程内存 token 模块 `mcp/src/confirm-tokens.ts`；`tools.ts` 新增 3 个删除工具函数（无 token 返回预览并签发 token，带 token 校验后执行 + 自动备份）；`server.ts` 注册 3 个工具。沿用现有 `fresh()`（每次 reloadFromDisk）、`backupBeforeWrite()`、`as any` 注册等既有模式。

**Tech Stack:** TypeScript（tsx 运行，无构建）、@modelcontextprotocol/sdk 1.29、zod 3.25、sql.js、vitest、node:crypto。

## Global Constraints

- 删除前强制两步 token 确认：无 `confirm_token` 只返回预览且**不写盘**；带 `confirm_token` 校验通过才执行。
- 每个删除工具的 `description` 必须明确指令 AI：拿到预览后先展示给用户、取得明确同意，才可带 `confirm_token` 二次调用；首次调用绝不传 `confirm_token`。
- 三个独立工具：`delete_campaign` / `delete_campaign_line` / `delete_performance`（不做单一带 type 参数的统一 delete）。
- Token：进程内存 Map、TTL **5 分钟**、**一次性**（用完即焚）、绑定 `op` + `targetId`、内容用 `crypto.randomBytes`。不持久化（进程重启即失效）。
- `delete_campaign_line` 若是该 campaign **最后一条 line** → 拒绝；校验权威在 core 层 `deleteCampaignLine`，工具预览步另查以提前拒绝。
- 执行步删除前复用 `backupBeforeWrite()` 自动备份；预览步不备份、不写盘。
- 不暴露 restore/撤销工具；不做删除影响的数量快照一致性校验（dev 单用户，YAGNI）。
- stdio 协议：core/mcp 代码只允许 `console.error`（这些工具不打日志）。
- 工具注册沿用 `const s = new McpServer(...) as any` 规避 TS2589；typecheck 脚本保持 `--max-old-space-size=8192`。
- 测试用真 sql.js wasm + 真临时 db，无 mock；TDD（先写失败测试）。

---

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `src/core/db.ts` | 数据层：新增删除单 line + 只读 line 摘要 | Modify |
| `src/core/db.test.ts` | core 测试 | Modify |
| `mcp/src/confirm-tokens.ts` | token 签发/校验/过期/一次性 | Create |
| `mcp/src/confirm-tokens.test.ts` | token 单元测试 | Create |
| `mcp/src/tools.ts` | 3 个删除工具函数（两步语义 + 备份） | Modify |
| `mcp/src/tools.delete.test.ts` | 删除工具行为测试 | Create |
| `mcp/src/server.ts` | 注册 3 个删除工具 | Modify |
| `mcp/README.md` | 工具表 8→11 + 两步说明 | Modify |
| `docs/MCP-USAGE.md` | 删除调用示例 + 改写"无 delete 工具"句 | Modify |

---

## Task 1: Core — deleteCampaignLine + getCampaignLineSummary

**Files:**
- Modify: `src/core/db.ts`（在 `deleteCampaign` 之后，约 600 行处插入）
- Test: `src/core/db.test.ts`

**Interfaces:**
- Consumes: 既有私有 helper `run(sql, params)`（执行并 save）、`queryOne<T>(sql, params)`。
- Produces:
  - `deleteCampaignLine(line_id: number): boolean` — 删除单条 line（FK CASCADE 清其 performance/flights/deals）；line 不存在返回 `false`；若是该 campaign 唯一 line 则 `throw new Error('Cannot delete the last line ...')`。
  - `getCampaignLineSummary(line_id: number): { line_id: number; campaign_id: number; campaign_name: string; channel: string; line_count: number; performance_rows: number } | undefined` — 只读摘要（`line_count` = 该 campaign 的 line 总数，含本条），供工具层生成预览；line 不存在返回 `undefined`。

- [ ] **Step 1: Write the failing tests**

在 `src/core/db.test.ts` 的 `describe('core/db', ...)` 内、最后一个 `it` 之后追加：

```ts
  it('getCampaignLineSummary reports sibling and performance counts', () => {
    const c = db.createCampaign({ name: 'LineSum Co', client: 'L' } as any, [
      { channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'CTR' } as any,
      { channel: 'Display', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'VCR' } as any,
    ])
    const lineId = c.lines![0].id
    db.importPerformance(
      { campaign_id: c.id, campaign_line_id: lineId, file_path: '', keep_zero_impressions: false },
      [{ campaign_id: c.id, date: '2026-07-02', impressions: 1000 } as any]
    )
    const sum = db.getCampaignLineSummary(lineId)
    expect(sum?.campaign_id).toBe(c.id)
    expect(sum?.campaign_name).toBe('LineSum Co')
    expect(sum?.sibling_count).toBe(2)
    expect(sum?.performance_rows).toBe(1)
    expect(db.getCampaignLineSummary(999999)).toBeUndefined()
  })

  it('deleteCampaignLine removes a non-last line and cascades its performance', () => {
    const c = db.createCampaign({ name: 'DelLine Co', client: 'D' } as any, [
      { channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'CTR' } as any,
      { channel: 'Display', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'VCR' } as any,
    ])
    const lineId = c.lines![0].id
    db.importPerformance(
      { campaign_id: c.id, campaign_line_id: lineId, file_path: '', keep_zero_impressions: false },
      [{ campaign_id: c.id, date: '2026-07-02', impressions: 500 } as any]
    )
    expect(db.deleteCampaignLine(lineId)).toBe(true)
    const after = db.getCampaign(c.id)
    expect(after?.lines?.length).toBe(1)
    expect(after?.lines?.[0].channel).toBe('Display')
    expect(db.queryPerformance(c.id).length).toBe(0)
  })

  it('deleteCampaignLine refuses to delete the last line', () => {
    const c = db.createCampaign({ name: 'LastLine Co', client: 'L' } as any,
      [{ channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'CTR' } as any])
    expect(() => db.deleteCampaignLine(c.lines![0].id)).toThrow(/last line/i)
    expect(db.getCampaign(c.id)?.lines?.length).toBe(1)
  })

  it('deleteCampaignLine returns false for a non-existent line', () => {
    expect(db.deleteCampaignLine(987654)).toBe(false)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/db.test.ts`
Expected: FAIL — `db.getCampaignLineSummary is not a function` / `db.deleteCampaignLine is not a function`.

- [ ] **Step 3: Implement the two functions**

在 `src/core/db.ts` 中 `deleteCampaign`（约 597-600 行）之后插入：

```ts
export function deleteCampaignLine(line_id: number): boolean {
  const row = queryOne<{ campaign_id: number }>('SELECT campaign_id FROM campaign_lines WHERE id = ?', [line_id])
  if (!row) return false
  const siblings = queryOne<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM campaign_lines WHERE campaign_id = ?', [row.campaign_id])?.cnt ?? 0
  if (siblings <= 1) {
    throw new Error('Cannot delete the last line of a campaign. Use delete_campaign to remove the whole campaign instead.')
  }
  // FK CASCADE removes this line's performance/flights/deals.
  run('DELETE FROM campaign_lines WHERE id = ?', [line_id])
  return true
}

export function getCampaignLineSummary(line_id: number):
  { line_id: number; campaign_id: number; campaign_name: string; channel: string; sibling_count: number; performance_rows: number } | undefined {
  const row = queryOne<{ campaign_id: number; channel: string }>(
    'SELECT campaign_id, channel FROM campaign_lines WHERE id = ?', [line_id])
  if (!row) return undefined
  const campaign = queryOne<{ name: string }>('SELECT name FROM campaigns WHERE id = ?', [row.campaign_id])
  const sibling_count = queryOne<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM campaign_lines WHERE campaign_id = ?', [row.campaign_id])?.cnt ?? 0
  const performance_rows = queryOne<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM performance_data WHERE campaign_line_id = ?', [line_id])?.cnt ?? 0
  return { line_id, campaign_id: row.campaign_id, campaign_name: campaign?.name ?? '', channel: row.channel, sibling_count, performance_rows }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/db.test.ts`
Expected: PASS（全部，含新增 4 个）。

- [ ] **Step 5: Commit**

```bash
git add src/core/db.ts src/core/db.test.ts
git commit -m "feat(core): add deleteCampaignLine and getCampaignLineSummary"
```

---

## Task 2: Confirm-token module

**Files:**
- Create: `mcp/src/confirm-tokens.ts`
- Test: `mcp/src/confirm-tokens.test.ts`

**Interfaces:**
- Produces:
  - `type DeleteOp = 'campaign' | 'campaign_line' | 'performance'`
  - `interface PendingDelete { op: DeleteOp; targetId: number; preview: string; expiresAt: number }`
  - `issueToken(op: DeleteOp, targetId: number, preview: string, ttlMs?: number): string` — 签发并存入内存 Map，返回 token 字符串；`ttlMs` 默认 5 分钟（测试可注入更短/负值制造过期）。
  - `consumeToken(token: string, op: DeleteOp, targetId: number): PendingDelete` — 校验存在/未过期/op+targetId 匹配；成功则从 Map 删除（一次性）并返回条目；任一不满足 `throw`。

- [ ] **Step 1: Write the failing tests**

Create `mcp/src/confirm-tokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { issueToken, consumeToken } from './confirm-tokens'

describe('confirm-tokens', () => {
  it('issues a token bound to op and target, consumable once', () => {
    const t = issueToken('campaign', 5, 'will delete campaign 5')
    expect(typeof t).toBe('string')
    expect(t.length).toBeGreaterThan(0)
    const entry = consumeToken(t, 'campaign', 5)
    expect(entry.preview).toBe('will delete campaign 5')
    // one-time: second consume of the same token fails
    expect(() => consumeToken(t, 'campaign', 5)).toThrow(/invalid|expired/i)
  })

  it('rejects an unknown token', () => {
    expect(() => consumeToken('nope', 'campaign', 1)).toThrow(/invalid|expired/i)
  })

  it('rejects an expired token', () => {
    const t = issueToken('performance', 7, 'p', -1) // already expired
    expect(() => consumeToken(t, 'performance', 7)).toThrow(/expired/i)
  })

  it('rejects op/target mismatch and does not consume the token', () => {
    const t = issueToken('campaign_line', 3, 'line 3')
    expect(() => consumeToken(t, 'campaign', 3)).toThrow(/mismatch|does not match/i)
    expect(() => consumeToken(t, 'campaign_line', 9)).toThrow(/mismatch|does not match/i)
    // still valid for the correct op/target
    expect(consumeToken(t, 'campaign_line', 3).targetId).toBe(3)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run mcp/src/confirm-tokens.test.ts`（从仓库根跑——根 vitest.config 已含 mcp/**）
Expected: FAIL — cannot resolve `./confirm-tokens`.

- [ ] **Step 3: Implement the module**

Create `mcp/src/confirm-tokens.ts`:

```ts
import { randomBytes } from 'crypto'

export type DeleteOp = 'campaign' | 'campaign_line' | 'performance'

export interface PendingDelete {
  op: DeleteOp
  targetId: number
  preview: string
  expiresAt: number // epoch ms
}

const DEFAULT_TTL_MS = 5 * 60 * 1000
const pending = new Map<string, PendingDelete>()

/** Issue a one-time confirmation token for a pending delete. */
export function issueToken(op: DeleteOp, targetId: number, preview: string, ttlMs: number = DEFAULT_TTL_MS): string {
  const token = `del-${op}-${targetId}-${randomBytes(6).toString('hex')}`
  pending.set(token, { op, targetId, preview, expiresAt: Date.now() + ttlMs })
  return token
}

/** Validate and consume a token. Throws on unknown/expired/mismatch. */
export function consumeToken(token: string, op: DeleteOp, targetId: number): PendingDelete {
  const entry = pending.get(token)
  if (!entry) throw new Error('Invalid or expired confirm_token. Re-run without confirm_token to get a fresh preview.')
  if (Date.now() > entry.expiresAt) {
    pending.delete(token)
    throw new Error('Expired confirm_token. Re-run without confirm_token to get a fresh preview.')
  }
  if (entry.op !== op || entry.targetId !== targetId) {
    throw new Error('confirm_token does not match the requested operation or target.')
  }
  pending.delete(token) // one-time use
  return entry
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run mcp/src/confirm-tokens.test.ts`
Expected: PASS（4 个）。

- [ ] **Step 5: Commit**

```bash
git add mcp/src/confirm-tokens.ts mcp/src/confirm-tokens.test.ts
git commit -m "feat(mcp): add in-memory confirm-token module for two-step deletes"
```

---

## Task 3: Delete tool functions

**Files:**
- Modify: `mcp/src/tools.ts`（文件末尾追加 3 个函数）
- Test: `mcp/src/tools.delete.test.ts`

**Interfaces:**
- Consumes: `db.getCampaign`、`db.queryPerformance`、`db.deleteCampaign`、`db.deletePerformanceData`、`db.deleteCampaignLine`、`db.getCampaignLineSummary`（Task 1）、`issueToken`/`consumeToken`（Task 2）、既有 `backupBeforeWrite()`、`RESTART_NOTE`。
- Produces（两步语义，无 token 返回 `{ preview, confirm_token, requires_confirmation: true }`；带 token 返回 `{ deleted, note }`）：
  - `deleteCampaignTool(args: { id: number; confirm_token?: string })`
  - `deleteCampaignLineTool(args: { line_id: number; confirm_token?: string })`
  - `deletePerformanceTool(args: { campaign_id: number; confirm_token?: string })`

- [ ] **Step 1: Write the failing tests**

Create `mcp/src/tools.delete.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as db from '../../src/core/db'
import { deleteCampaignTool, deleteCampaignLineTool, deletePerformanceTool } from './tools'

const wasmPath = path.join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm') // tests run from repo root

let dir: string
async function freshDb() {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-del-'))
  await db.initDb({ dbPath: path.join(dir, 'test.db'), wasmPath })
}
function backupCount(): number {
  return fs.readdirSync(dir).filter(f => f.startsWith('campaign-tracker-before-mcp-')).length
}

describe('mcp delete tools', () => {
  beforeEach(async () => { await freshDb() })

  it('delete_campaign previews without writing, then deletes with token', () => {
    const c = db.createCampaign({ name: 'Del Co', client: 'D' } as any,
      [{ channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'CTR' } as any])
    db.importPerformance({ campaign_id: c.id, campaign_line_id: c.lines![0].id, file_path: '', keep_zero_impressions: false },
      [{ campaign_id: c.id, date: '2026-07-02', impressions: 1000 } as any])

    const preview = deleteCampaignTool({ id: c.id }) as any
    expect(preview.requires_confirmation).toBe(true)
    expect(typeof preview.confirm_token).toBe('string')
    expect(db.getCampaign(c.id)).toBeTruthy()       // not deleted yet
    expect(backupCount()).toBe(0)                    // preview did not back up

    const done = deleteCampaignTool({ id: c.id, confirm_token: preview.confirm_token }) as any
    expect(done.deleted.type).toBe('campaign')
    expect(db.getCampaign(c.id)).toBeUndefined()
    expect(db.queryPerformance(c.id).length).toBe(0) // cascaded
    expect(backupCount()).toBe(1)                     // execution backed up
  })

  it('delete_campaign rejects a wrong/expired token', () => {
    const c = db.createCampaign({ name: 'Tok Co', client: 'T' } as any,
      [{ channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'CTR' } as any])
    expect(() => deleteCampaignTool({ id: c.id, confirm_token: 'bogus' })).toThrow(/invalid|expired/i)
    expect(db.getCampaign(c.id)).toBeTruthy()
  })

  it('delete_campaign on a missing campaign throws', () => {
    expect(() => deleteCampaignTool({ id: 424242 })).toThrow(/not found/i)
  })

  it('delete_campaign_line deletes a non-last line with token', () => {
    const c = db.createCampaign({ name: 'Line Co', client: 'L' } as any, [
      { channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'CTR' } as any,
      { channel: 'Display', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'VCR' } as any,
    ])
    const lineId = c.lines![0].id
    const preview = deleteCampaignLineTool({ line_id: lineId }) as any
    expect(preview.requires_confirmation).toBe(true)
    const done = deleteCampaignLineTool({ line_id: lineId, confirm_token: preview.confirm_token }) as any
    expect(done.deleted.type).toBe('campaign_line')
    expect(db.getCampaign(c.id)?.lines?.length).toBe(1)
  })

  it('delete_campaign_line refuses the last line at preview (no token issued)', () => {
    const c = db.createCampaign({ name: 'Solo Co', client: 'S' } as any,
      [{ channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'CTR' } as any])
    expect(() => deleteCampaignLineTool({ line_id: c.lines![0].id })).toThrow(/last line/i)
    expect(db.getCampaign(c.id)?.lines?.length).toBe(1)
  })

  it('delete_performance clears rows but keeps campaign and lines', () => {
    const c = db.createCampaign({ name: 'Perf Co', client: 'P' } as any,
      [{ channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'CTR' } as any])
    db.importPerformance({ campaign_id: c.id, campaign_line_id: c.lines![0].id, file_path: '', keep_zero_impressions: false },
      [{ campaign_id: c.id, date: '2026-07-02', impressions: 1000 } as any])

    const preview = deletePerformanceTool({ campaign_id: c.id }) as any
    expect(preview.requires_confirmation).toBe(true)
    expect(db.queryPerformance(c.id).length).toBe(1) // not cleared yet

    const done = deletePerformanceTool({ campaign_id: c.id, confirm_token: preview.confirm_token }) as any
    expect(done.deleted.type).toBe('performance')
    expect(db.queryPerformance(c.id).length).toBe(0)
    expect(db.getCampaign(c.id)?.lines?.length).toBe(1) // structure kept
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run mcp/src/tools.delete.test.ts`（从仓库根跑）
Expected: FAIL — `deleteCampaignTool` 等未从 `./tools` 导出。

- [ ] **Step 3: Implement the three tool functions**

在 `mcp/src/tools.ts` 顶部 import 区追加：

```ts
import { issueToken, consumeToken } from './confirm-tokens'
```

在文件末尾追加：

```ts
export function deleteCampaignTool(args: { id: number; confirm_token?: string }) {
  const c = db.getCampaign(args.id)
  if (!c) throw new Error(`Campaign ${args.id} not found`)
  if (!args.confirm_token) {
    const lineCount = c.lines?.length ?? 0
    const perfRows = db.queryPerformance(args.id).length
    const preview = `Will DELETE campaign '${c.name}' (id ${args.id}) and its ${lineCount} line(s) and ${perfRows} performance row(s). Cascades; cannot be undone via MCP.`
    return { preview, confirm_token: issueToken('campaign', args.id, preview), requires_confirmation: true }
  }
  consumeToken(args.confirm_token, 'campaign', args.id)
  backupBeforeWrite()
  db.deleteCampaign(args.id)
  return { deleted: { type: 'campaign', id: args.id, name: c.name }, note: RESTART_NOTE }
}

export function deleteCampaignLineTool(args: { line_id: number; confirm_token?: string }) {
  const summary = db.getCampaignLineSummary(args.line_id)
  if (!summary) throw new Error(`Campaign line ${args.line_id} not found`)
  if (!args.confirm_token) {
    if (summary.line_count <= 1) {
      // Refuse at preview: issue no token so the AI must report this to the user.
      throw new Error(`Campaign line ${args.line_id} ('${summary.channel}') is the last line of campaign '${summary.campaign_name}'. Use delete_campaign to remove the whole campaign instead.`)
    }
    const preview = `Will DELETE campaign line ${args.line_id} ('${summary.channel}') of campaign '${summary.campaign_name}' and its ${summary.performance_rows} performance row(s). Cascades; cannot be undone via MCP.`
    return { preview, confirm_token: issueToken('campaign_line', args.line_id, preview), requires_confirmation: true }
  }
  consumeToken(args.confirm_token, 'campaign_line', args.line_id)
  backupBeforeWrite()
  db.deleteCampaignLine(args.line_id) // core re-validates the last-line rule (authoritative)
  return { deleted: { type: 'campaign_line', line_id: args.line_id, campaign_id: summary.campaign_id }, note: RESTART_NOTE }
}

export function deletePerformanceTool(args: { campaign_id: number; confirm_token?: string }) {
  const c = db.getCampaign(args.campaign_id)
  if (!c) throw new Error(`Campaign ${args.campaign_id} not found`)
  if (!args.confirm_token) {
    const perfRows = db.queryPerformance(args.campaign_id).length
    const preview = `Will DELETE all ${perfRows} performance row(s) for campaign '${c.name}' (id ${args.campaign_id}). Campaign and line structure are kept.`
    return { preview, confirm_token: issueToken('performance', args.campaign_id, preview), requires_confirmation: true }
  }
  consumeToken(args.confirm_token, 'performance', args.campaign_id)
  backupBeforeWrite()
  const rows = db.deletePerformanceData(args.campaign_id)
  return { deleted: { type: 'performance', campaign_id: args.campaign_id, rows }, note: RESTART_NOTE }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run mcp/src/tools.delete.test.ts`
Expected: PASS（6 个）。

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npx vitest run`（从仓库根跑全量）
Expected: PASS（既有 + 新增删除测试全过）。

- [ ] **Step 6: Commit**

```bash
git add mcp/src/tools.ts mcp/src/tools.delete.test.ts
git commit -m "feat(mcp): add two-step delete tool functions (campaign/line/performance)"
```

---

## Task 4: Register tools on server + docs

**Files:**
- Modify: `mcp/src/server.ts`（import + 3 个 `s.tool(...)` 注册）
- Modify: `mcp/README.md`
- Modify: `docs/MCP-USAGE.md`

**Interfaces:**
- Consumes: `deleteCampaignTool`、`deleteCampaignLineTool`、`deletePerformanceTool`（Task 3）、既有 `fresh()`。

- [ ] **Step 1: Register the three tools**

在 `mcp/src/server.ts` 的 import 块（第 4-7 行的 `from './tools'`）追加三个名字：

```ts
import {
  listCampaignsTool, getCampaignTool, findCampaignTool, queryPerformanceTool,
  createCampaignTool, updateCampaignTool, previewImportTool, importPerformanceTool,
  deleteCampaignTool, deleteCampaignLineTool, deletePerformanceTool,
} from './tools'
```

在 `import_performance` 注册（约第 101-106 行）之后、`return s as McpServer` 之前插入：

```ts
  s.tool('delete_campaign',
    'Delete a campaign and everything under it (lines, flights, deals, performance). TWO-STEP: call WITHOUT confirm_token first to get a preview + confirm_token; SHOW the preview to the user, get their explicit approval, THEN call again WITH the confirm_token to actually delete. Never pass confirm_token on the first call.',
    { id: z.number(), confirm_token: z.string().optional() },
    fresh(deleteCampaignTool))

  s.tool('delete_campaign_line',
    "Delete one campaign line and its performance data. Refuses if it is the campaign's last line (use delete_campaign instead). TWO-STEP: call WITHOUT confirm_token to preview, SHOW the user, get approval, THEN call again WITH confirm_token. Never pass confirm_token on the first call.",
    { line_id: z.number(), confirm_token: z.string().optional() },
    fresh(deleteCampaignLineTool))

  s.tool('delete_performance',
    'Delete ALL performance rows for a campaign (keeps the campaign and its lines). TWO-STEP: call WITHOUT confirm_token to preview, SHOW the user, get approval, THEN call again WITH confirm_token. Never pass confirm_token on the first call.',
    { campaign_id: z.number(), confirm_token: z.string().optional() },
    fresh(deletePerformanceTool))
```

- [ ] **Step 2: Typecheck the mcp package**

Run: `cd mcp && npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Smoke-test that the server registers 11 tools**

macOS 无 `timeout`，用 perl 限时启动并确认 server 就绪（stderr 打印 db 路径即成功；不报注册错误即工具加载成功）：

Run:
```bash
cd /Users/derrick/Desktop/Campaign-Tracker && \
CAMPAIGN_TRACKER_DB="$(mktemp -d)/smoke.db" perl -e 'alarm 8; exec @ARGV' npx tsx mcp/src/index.ts < /dev/null 2>&1 | head -5
```
Expected: 出现 `[DB] SQLite ready at:` / `[campaign-tracker-mcp] using db:` 一类 stderr 行，无抛错堆栈。

- [ ] **Step 4: Update mcp/README.md**

在工具表（`import_performance` 行之后）追加三行，并把标题处工具数从 8 改为 11：

```markdown
| `delete_campaign` | Delete a campaign and all its lines/performance — two-step: preview then confirm with a token |
| `delete_campaign_line` | Delete one line and its performance (refuses the last line) — two-step preview/confirm |
| `delete_performance` | Delete all performance rows for a campaign (keeps structure) — two-step preview/confirm |
```

在 "Tools" 表后新增一小节：

```markdown
### Deleting (two-step confirmation)

Delete tools never act in one shot. Call the tool **without** `confirm_token` to get a human-readable `preview` plus a one-time `confirm_token`. The assistant must show the preview to you and get your explicit approval, then call the tool **again with** the `confirm_token` to execute. Tokens are held in memory, expire after 5 minutes, are single-use, and are bound to the exact operation and target. Every executed delete writes a `campaign-tracker-before-mcp-*.db` backup first.
```

- [ ] **Step 5: Update docs/MCP-USAGE.md**

① 把第 3 节标题 "## 3. 八个工具速查" 改为 "## 3. 十一个工具速查"，并在表格 `import_performance` 行后追加：

```markdown
| 删 | `delete_campaign` | 删整个 campaign（级联 lines/flights/deals/performance）；两步确认 |
| 删 | `delete_campaign_line` | 删单条 line 及其业绩（最后一条 line 拒删）；两步确认 |
| 删 | `delete_performance` | 清空某 campaign 的业绩数据（保留结构）；两步确认 |
```

② 把表格下方那句：

```markdown
> **没有 delete 工具**——AI 无删除权限，删除只能在应用界面手动操作。
```

替换为：

```markdown
> **删除需两步确认**：调用删除工具会先返回预览 + 一次性 `confirm_token`；AI 必须把预览给你看、你点头后才带 token 二次调用执行。token 存内存、5 分钟过期、一次性、绑定具体操作和目标；每次真正删除前都会自动备份。
```

③ 在第 4 节示例（"### C. 查询现状" 之后）追加：

```markdown
### D. 删除（两步确认）

> 「把 Nike 那个 campaign 删掉。」

AI 流程：
1. `find_campaign("Nike")` 定位 campaign id
2. `delete_campaign(id)`（不带 token）→ 拿到预览"将删 campaign 'Nike' 及 N 条 line、M 行业绩"和 `confirm_token`
3. **把预览念给你听，等你确认**
4. 你同意 → `delete_campaign(id, confirm_token)` 真正删除（删前自动备份）
5. 返回删除结果 + 提示重启应用查看
```

- [ ] **Step 6: Run the full repo suite**

Run: `cd /Users/derrick/Desktop/Campaign-Tracker && npx vitest run`
Expected: PASS（全部）。

- [ ] **Step 7: Commit**

```bash
git add mcp/src/server.ts mcp/README.md docs/MCP-USAGE.md
git commit -m "feat(mcp): register delete tools and document two-step confirmation"
```

---

## Self-Review 记录

- **Spec coverage:** 三工具（Task 3/4）✓；core deleteCampaignLine + 最后一条校验（Task 1）✓；token 两步/TTL/一次性/绑定/crypto（Task 2）✓；执行步备份、预览步不写盘（Task 3 测试 `backupCount`）✓；FK 级联（Task 1/3 测试）✓；文档（Task 4）✓；不做 restore/快照比对（计划未引入）✓。
- **Type consistency:** `getCampaignLineSummary` 字段 `sibling_count`/`performance_rows`/`campaign_name`/`channel` 在 Task 1 定义、Task 3 消费一致；`DeleteOp` 值 `campaign`/`campaign_line`/`performance` 在 Task 2 定义、Task 3 与 server 注册一致；`issueToken`/`consumeToken` 签名一致。
- **Placeholder scan:** 无 TBD/TODO；每个代码步含完整代码与确切命令。
- **测试运行目录（已核实）:** 根 `vitest.config.ts` 的 `include` 已含 `mcp/**/*.test.ts`，全部测试统一从**仓库根**跑（`process.cwd()` = 根）；mcp 无独立 test 脚本。故所有 vitest 命令均为根目录 `npx vitest run [path]`，wasmPath 统一 `process.cwd()/node_modules/sql.js/dist/sql-wasm.wasm`（与现有 `tools.import.test.ts` 一致）。唯独 `npm run typecheck` 在 `cd mcp` 下跑（mcp 有独立 tsconfig）。
