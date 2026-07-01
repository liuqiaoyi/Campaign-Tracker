# Campaign Tracker MCP — 调用指南（Claude Code & Codex）

本文讲**怎么在 Claude Code 和 Codex 里接入并调用** Campaign Tracker MCP server，让 AI 通过自然语言 / 丢 Excel 来读写软件里的数据。

> 参考型完整文档（工具清单、环境变量、注意事项）见 [`mcp/README.md`](../mcp/README.md)。本文聚焦上手与实际用法。

---

## 0. 一次性安装

```bash
npm install
cd mcp && npm install
```

无需构建，运行时由 `tsx` 直接执行 TypeScript 源码。需要同时安装仓库根目录依赖和 `mcp/` 依赖，因为 MCP 会复用 `src/core/` 里的共享代码。

数据库路径默认自动探测；dev 版（`npm run dev`）的 db 在：

```
~/Library/Application Support/campaign-tracker/campaign-tracker.db
```

如果你的 db 在别处，用环境变量 `CAMPAIGN_TRACKER_DB` 指向它的完整路径。

---

## 1. Claude Code 接入

仓库根已自带 `.mcp.json`。**在 `Campaign-Tracker` 目录下启动 Claude Code，MCP server 自动加载，无需额外配置。**

```json
{
  "mcpServers": {
    "campaign-tracker": {
      "command": "npx",
      "args": ["tsx", "./mcp/src/index.ts"]
    }
  }
}
```

**验证已加载**：在 Claude Code 里运行 `/mcp`，应能看到 `campaign-tracker` 及其 11 个工具。

---

## 2. Codex 接入

把下面这段加到 `~/.codex/config.toml`：

```toml
[mcp_servers.campaign-tracker]
command = "npx"
args = ["tsx", "/Users/derrick/Desktop/Campaign-Tracker/mcp/src/index.ts"]
env = { CAMPAIGN_TRACKER_DB = "/Users/derrick/Library/Application Support/campaign-tracker/campaign-tracker.db" }
```

> 注意：Codex 配置里用**绝对路径**（不像 Claude Code 可用项目相对路径）。若项目或 db 在别处，相应调整两处路径。

改完重启 Codex 会话即生效。

---

## 3. 十一个工具速查

| 类别 | 工具 | 作用 |
|---|---|---|
| 读 | `list_campaigns` | 列出所有 campaign + 是否有业绩数据 |
| 读 | `get_campaign` | 取单个 campaign 完整信息（含 lines/flights/deals）|
| 读 | `find_campaign` | 按 name / client / TTD campaign id 模糊查找 |
| 读 | `query_performance` | 查询某 campaign 的业绩行（可带日期范围）|
| 写 | `create_campaign` | 新建 campaign（至少一条 line）|
| 写 | `update_campaign` | patch campaign / lines；未提到的现有 lines 会保留 |
| 写 | `preview_import` | **只解析不写**：返回 sheet、列映射、缺失必填列、样本行；可指定 `sheet_name` |
| 写 | `import_performance` | 真正导入业绩（按 line 删旧插新）；可指定 `sheet_name` |
| 删 | `delete_campaign` | 删整个 campaign（级联 lines/flights/deals/performance）；两步确认 |
| 删 | `delete_campaign_line` | 删单条 line 及其业绩（最后一条 line 拒删）；两步确认 |
| 删 | `delete_performance` | 清空某 campaign 的业绩数据（保留结构）；两步确认 |

> **删除需两步确认**：调用删除工具会先返回预览 + 一次性 `confirm_token`；AI 应把预览给你看、你点头后才带 token 二次调用执行。token 存内存、5 分钟过期、一次性、绑定具体操作和目标，并带一个"将删除什么"的指纹（行数/条数）——两步之间数据若变了（比如又导入了业绩），执行会被拒绝、需重新预览。每次真正删除前都会自动备份。
>
> ⚠️ **这不是强制的人类审批**：MCP server 走 stdio、无法直接联系真人，两步 token 只保证"预览被取过且未过期失效"，是否把预览给你看依赖 AI 配合。真正的人类关卡是你的 MCP 客户端（Claude Code / Codex）调用工具时的权限提示。**不要对删除工具开 auto-approve**——让它们保持交互确认，这样 AI 的失误无法在你不知情时删数据。

---

## 4. 实际调用示例（直接对 AI 说人话即可）

你不需要记工具名，直接用自然语言，AI 会自己挑工具、必要时先查再写。

### A. 导入业绩数据（丢 Excel）

> 「把 `~/Downloads/nike_july.xlsx` 这张 TTD 导出表导进 Nike 那个 campaign 的 CTV line。」

AI 的典型流程：
1. `find_campaign("Nike")` 定位 campaign 和它的 line
2. `preview_import("~/Downloads/nike_july.xlsx")` 核对 sheet、列映射、确认无缺失必填列
3. `import_performance(campaign_id, campaign_line_id, file_path)` 删旧插新
4. 返回导入行数 + 提示重启应用查看

### B. 用自然语言建 / 改 campaign

> 「给客户 X 建一个 7 月的 campaign，预算 5 万，KPI 是 CTR，渠道 CTV。」

AI 流程：
1. `find_campaign("X")` 查重
2. 无重复 → `create_campaign({name, client:"X"}, [{channel:"CTV", start_date, end_date, budget:50000, primary_kpi:"CTR"}])`
3. 返回新建结果 + 提示重启应用查看

### C. 查询现状

> 「Nike 这个 campaign 7 月的总展示量是多少？」

AI 流程：`find_campaign` → `query_performance(campaign_id, from, to)` → 汇总返回。

### D. 删除（两步确认）

> 「把 Nike 那个 campaign 删掉。」

AI 流程：
1. `find_campaign("Nike")` 定位 campaign id
2. `delete_campaign(id)`（不带 token）→ 拿到预览"将删 campaign 'Nike' 及 N 条 line、M 行业绩"和 `confirm_token`
3. **把预览念给你听，等你确认**
4. 你同意 → `delete_campaign(id, confirm_token)` 真正删除（删前自动备份）
5. 返回删除结果 + 提示重启应用查看

---

## 5. 重要前提（务必看）

MCP 与应用共用同一个 SQLite 文件，但应用持有**内存副本**，遵循 last-writer-wins：

- ✅ **写操作时应用最好关闭**；写完**重启应用**才能在界面看到改动（应用启动时才重新读盘，界面里的「刷新」不会重读磁盘）。
- ✅ 每次写操作前会在 db 同目录自动生成带时间戳的安全备份 `campaign-tracker-before-mcp-*.db`，确认无误后可定期清理。
- ✅ 读工具会按当天日期同步 campaign 状态（与应用自身逻辑一致、幂等）；只要写时应用没开着就无副作用。
- ✅ 多 sheet Excel 会自动选择第一个能识别出 `Date` + `Impressions` 的 sheet；如果要强制某个 sheet，用 `sheet_name`。

---

## 6. 手动启动 / 排错

```bash
CAMPAIGN_TRACKER_DB="/path/to/campaign-tracker.db" npx tsx mcp/src/index.ts
```

- 启动成功会在 **stderr** 打印 `[campaign-tracker-mcp] using db: <路径>`。
- server 走 stdio（stdout 专用于 JSON-RPC 协议），所有诊断信息都走 stderr。
- 报 `Could not locate campaign-tracker.db`：说明自动探测没命中，显式设置 `CAMPAIGN_TRACKER_DB` 指向 db 完整路径即可。
