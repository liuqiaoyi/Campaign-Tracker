# Campaign-Tracker MCP Server — 设计文档

日期：2026-06-30
分支：`feat/mcp-server`
状态：已批准，待实现

## 1. 目标

为 Campaign-Tracker（Electron + sql.js 桌面应用）提供一个 MCP server，让 Claude Code / Codex 能够：

- **A. 导入业绩数据**：给一个 TTD 导出的 Excel/CSV，AI 自动识别列、对应到某个 campaign line，写入 `performance_data` 表。
- **B. 创建 / 修改 campaign**：用自然语言指令建立或更新 campaign（含 campaign line）。
- **查询现有数据**：AI 先读到现状，才能判断该 insert 还是 update。

Deals 管理（功能 D）本期不做。

## 2. 关键技术约束

### 2.1 存储引擎：sql.js（WASM）
- 应用用 `sql.js` 把整个数据库读入内存，**每次改动后把内存整体覆写回磁盘**（`save()` 写整个文件）。
- 产出的 `.db` 是**标准 SQLite 格式**，任何语言都能读写。
- DB 路径：`app.getPath('userData')/campaign-tracker.db`
  - dev：`~/Library/Application Support/campaign-tracker/campaign-tracker.db`
  - packaged（productName=`Campaign Tracker`）：`~/Library/Application Support/Campaign Tracker/campaign-tracker.db`
  - Windows：`%APPDATA%/<同名目录>/campaign-tracker.db`

### 2.2 并发陷阱（last-writer-wins）
- 应用开着时手里是**内存副本**，不会感知磁盘被外部改动。
- 应用一旦在界面里做任何改动并 `save()`，会**覆盖** MCP 写入磁盘的数据。
- 应用界面里的"刷新"不会重读磁盘——**只有重启应用**才会重新加载。

**对策（已与用户确认接受手动刷新）**：
- MCP 写操作流程：读最新文件 → 改 → 存。
- 工具返回里提醒「重启应用才能看到改动」。
- **每次写操作前自动备份**一份带时间戳的 db（复用 `backupDatabaseTo`）。
- 推荐用法：写数据时应用别开着，或写完重启应用。

## 3. 架构

### 3.1 解耦重构（DRY 单一事实源）
把 `src/main/database.ts` 中的纯数据逻辑抽到不依赖 electron 的共享模块（如 `src/core/db.ts`）：

- 对外暴露 `initDb(dbPath)` 以及现有的 `listCampaigns / getCampaign / createCampaign / updateCampaign / queryPerformance / importPerformance / backupDatabaseTo / hasPerformanceData / listCampaignsWithDataStatus` 等。
- 现状中这些逻辑通过模块级单例 `_db` 和直接 `app.getPath()` 与 electron 耦合；重构后由调用方注入 `dbPath`。
- Electron 主进程：照常调用，路径来自 `app.getPath('userData')`。
- MCP server：调用同一份模块，路径来自自己的解析逻辑。
- **状态派生（`deriveLineStatus` / `deriveCampaignStatus` / `syncCampaignStatusesByDate`）和删-插逻辑全部复用**，保证 AI 写入的数据与界面手动操作完全一致。

### 3.2 Excel 解析复用
把 main 进程 `parseFile` IPC handler 的 Excel 解析 + TTD 列映射逻辑（依赖 `xlsx`，返回 `mapped_columns / missing_required_columns`）抽到共享层，供 MCP 复用，确保 MCP 导入结果与 UI 导入一致。

### 3.3 MCP server
- 新目录 `mcp/`，Node/TypeScript，使用官方 `@modelcontextprotocol/sdk`，stdio transport。
- 工具层是薄包装，调用 §3.1 / §3.2 的共享逻辑。
- 构建产物 `mcp/dist/index.js`。

### 3.4 DB 路径解析顺序
1. 环境变量 `CAMPAIGN_TRACKER_DB`（显式指定，最高优先级）
2. 自动探测 macOS 两个候选目录 + Windows `%APPDATA%`
3. 都找不到 → 明确报错，提示用户设置环境变量

## 4. MCP 工具清单

### 读
| 工具 | 入参 | 作用 |
|---|---|---|
| `list_campaigns` | — | 所有 campaign + 是否有业绩数据 + 行数（复用 `listCampaignsWithDataStatus`）|
| `get_campaign` | `id` | 单个 campaign 完整信息（含 lines/flights/deals）|
| `find_campaign` | `query` | 按 name / client / ttd_campaign_id 模糊匹配，返回候选列表 |
| `query_performance` | `campaign_id`, `from?`, `to?` | 查询/汇总业绩数据 |

### 写
| 工具 | 入参 | 作用 |
|---|---|---|
| `create_campaign` | `data`, `lines` | 新建 campaign（含至少一条 line）|
| `update_campaign` | `id`, `data`, `lines` | 全量更新 campaign |
| `preview_import` | `file_path` | **只解析不写**：返回识别列映射、缺失必填列、样本行 |
| `import_performance` | `campaign_id`, `campaign_line_id`, `file_path`, `keep_zero_impressions` | 真正导入（删旧插新，同 UI）|

**不提供 `delete_*` 工具**——AI 无删除权限（用户确认，安全优先）。删除仍只能在应用界面手动操作。

### 字段校验
- `create_campaign`：`name` 必填；`lines` 至少一条，每条 line 必填 `channel / start_date / end_date / primary_kpi`（对齐 schema NOT NULL 约束）。
- 枚举值对齐 `types.ts`：`AdType / KpiType / CampaignStatus / DealType`。

## 5. 典型流程

**建 campaign**
> "给客户 X 建一个 7 月的 campaign，预算 5 万，KPI 是 CTR"
1. AI 调 `find_campaign("X")` 查重
2. 无重复 → `create_campaign({name, client:"X"}, [{channel, start_date, end_date, budget:50000, primary_kpi:"CTR"}])`
3. 返回提示重启应用查看

**导业绩**
> "把这个表导进客户 X 那个 campaign"
1. AI 调 `find_campaign` / `list_campaigns` 定位 campaign 和 line
2. `preview_import(file_path)` 核对列映射、确认无缺失必填列
3. `import_performance(...)`
4. 返回导入行数 + 提示重启应用查看

## 6. 两端配置

提供配置片段：
- Claude Code：项目 `.mcp.json`
- Codex：`~/.codex/config.toml`

均指向 `node <repo>/mcp/dist/index.js`，可通过 `CAMPAIGN_TRACKER_DB` 注入自定义路径。

## 7. 测试

- 对抽出的共享数据层做单元测试（临时 db 文件）：建 campaign → list → 导业绩 → query 验证往返一致。
- 状态派生逻辑单测（draft/active/ended 边界）。
- TDD 先行；MCP 工具层薄包装，集成测试覆盖 preview_import / import_performance。

## 8. 不做（YAGNI）

- Deals 管理（功能 D）
- 应用实时刷新 / 文件监听
- 方案3 的内嵌 HTTP 服务
- 多用户 / 云同步
- AI 删除权限
