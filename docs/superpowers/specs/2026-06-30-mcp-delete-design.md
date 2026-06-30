# MCP 删除功能设计（两步 token 确认）

> 日期：2026-06-30
> 范围：为 Campaign Tracker MCP server 新增删除能力，删除前强制经过"预览 → 用户确认 → 执行"两步。

## 目标

让 AI（Claude Code / Codex）能通过 MCP 删除 campaign / campaign line / 业绩数据，但**任何删除在真正写盘前必须先返回预览并取得用户明确同意**。MCP server 自身无法联系真人，因此"确认"落在 AI 客户端层：工具用两步 token 机制强制 AI 至少先取得预览，再叠加客户端权限提示作为第二道防线。

## 背景与现状

- Core 层（`src/core/db.ts`）已有 `deleteCampaign(id)`、`deletePerformanceData(campaign_id)`，但**没有删除单条 line 的函数**。
- 现有 8 个 MCP 工具均不暴露删除（原硬约束"AI 无删除权限"本次被用户主动推翻）。
- 写工具（create/update/import）已有模式：`backupBeforeWrite()` 在写前生成 `campaign-tracker-before-mcp-*.db`；`server.ts` 的 `fresh()` 包装在每次工具调用前 `reloadFromDisk()`。
- FK 强制：`reloadFromDisk()` 已在 `loadFromDisk()` 内重设 `PRAGMA foreign_keys = ON`，确保 MCP 路径下 `ON DELETE CASCADE` 生效。

## 设计

### 1. 三个独立删除工具

| 工具 | 删除对象 | 底层函数 |
|---|---|---|
| `delete_campaign` | 整个 campaign，级联 lines/flights/deals/performance | core 已有 `deleteCampaign(id)` |
| `delete_campaign_line` | 单条 line，级联其 performance | **core 新增** `deleteCampaignLine(line_id)` |
| `delete_performance` | 某 campaign 的全部业绩数据 | core 已有 `deletePerformanceData(campaign_id)` |

选独立工具而非单一带 `type` 参数的 `delete` 工具：与现有 8 工具风格一致、参数与描述各自清晰、AI 选错对象的概率更低。

注册仍走 `server.ts` 的 `fresh()` 包装（每次 `reloadFromDisk`），与现有工具一致。

### 2. 两步 token 确认机制

**新模块 `mcp/src/confirm-tokens.ts`**，进程内存单例 Map。

每个删除工具签名为 `(target_id, confirm_token?)`：

- **无 `confirm_token`（预览步）**：只读，不写盘。计算删除影响（对象名称 + 级联数量统计），生成 token 存入 Map，返回 `{ preview, confirm_token }` 给 AI。
- **带 `confirm_token`（执行步）**：校验通过后执行删除，返回实际删除结果。

Token 规格：

- 内容：`crypto.randomBytes` 生成的随机串（如 `del-<op>-<id>-<hex>`，hex 部分保证唯一与不可伪造）。
- Map 值：`{ op, targetId, preview, expiresAt }`。
- **TTL = 5 分钟**；**一次性**（校验成功即从 Map 删除）；绑定 `op`（campaign/line/performance）+ `targetId`。
- 执行步校验顺序：① token 存在；② 未过期；③ `op` 与 `targetId` 与本次调用参数一致；④ `reloadFromDisk` 后目标仍存在（被删/不存在则报错）。任一不满足即抛错、不删除。
- **不做**删除影响数量的快照比对（dev 单用户，两步间数据基本不变，YAGNI）。预览数量仅供展示；执行步按最新数据删除并返回实际删除数量。

**工具描述（写入 `description`）明确指令 AI**：拿到预览后，必须把预览内容原样展示给用户、等用户明确同意后才可带 `confirm_token` 二次调用。这是"跟用户确认"的落点。

### 3. 业务规则与安全

- `delete_campaign_line`：执行步若检测到这是该 campaign 的**最后一条 line**，拒绝删除，报错提示"这是最后一条 line，要删请改用 delete_campaign 删整个 campaign"。预览步也应在 preview 文案中标注此情况。
- 三个工具的**执行步**在删除前复用 `backupBeforeWrite()` 自动备份；**预览步不备份、不写盘**。
- 删除依赖已开启的 FK 约束保证级联正确。

### 4. Core 新增 `deleteCampaignLine(line_id)`

```ts
export function deleteCampaignLine(line_id: number): boolean
```

- **最后一条 line 的校验在 core 层（单一权威）**：删除前查 line 所属 campaign，统计该 campaign 的 line 数；若为 1 则抛错（最后一条 line 不可删），工具执行步直接调用并让错误冒泡。
- 工具**预览步**另行查该 campaign 的 line 数，以便在 preview 文案中标注"这是最后一条 line"的情况。
- 删除 `campaign_lines` 行，FK CASCADE 自动清理其 performance/flights/deals 引用。
- line_id 不存在时返回 `false`（或抛错，与 `deleteCampaign` 对不存在目标的行为保持一致）。

### 5. 测试（vitest，真 sql.js wasm + 真临时 db，无 mock）

Token 机制：
- 无 token 调用返回预览且**不写盘**（删除前后行数不变）。
- 带有效 token 执行删除成功。
- 过期 token（TTL 外）被拒绝。
- token 一次性：同一 token 第二次使用被拒绝。
- `op`/`targetId` 与 token 不匹配被拒绝。

删除行为：
- `delete_campaign` 删除 campaign 并级联清理 lines/performance。
- `delete_campaign_line` 删除非最后一条 line 成功并级联其 performance；删最后一条 line 被拒。
- `delete_performance` 清空业绩、保留 campaign/line 结构。
- 删除不存在的目标报错。
- 执行步删除前生成了备份文件。

### 6. 文档更新

- `mcp/README.md`：工具表 8 → 11；新增删除工具行；说明两步 token 流程。
- `docs/MCP-USAGE.md`：工具速查表更新；新增"删除（两步确认）"调用示例；把"没有 delete 工具——AI 无删除权限"一句改为"删除需两步确认：AI 会先给预览，你点头后才执行"。

## 不在本次范围（YAGNI）

- 不暴露 `restore`/撤销工具（备份文件 + core 已有 `restoreDatabaseFrom` 提供手动恢复路径）。
- 不做删除影响的数量快照一致性校验。
- token 不持久化（进程重启即失效，可接受）。
