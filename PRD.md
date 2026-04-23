# Campaign Tracker — 产品需求文档（PRD）

> **版本：** v1.0  
> **日期：** 2026-04-22  
> **作者：** Derrick Liu  
> **平台：** Windows 本地桌面应用（Electron）

---

## 1. 产品概述

Campaign Tracker 是一个运行在本地的桌面工具，用于追踪在 The Trade Desk（TTD）平台上投放的广告 Campaign 的全生命周期管理和效果监控。

**核心价值：**
- 统一管理所有 Campaign 的元数据（客户、Agency、KPI、Deal 等）
- 通过 Gantt 视图直观掌握当前投放状态
- 将从 TTD 导出的报告数据转化为可视化 Performance Dashboard

**运行方式：** 双击 `.exe` 打开，完全离线，数据存储在本地 SQLite 文件。

---

## 2. 用户画像

**主要用户：Derrick（Campaign Manager / Ad Operations）**

- 同时管理多个 Campaign，涉及不同 Agency 和客户
- 需要快速了解当前有哪些 Campaign 在跑、各自状态如何
- 需要定期向客户汇报 Campaign 效果，需要整理 TTD 导出的数据

**使用场景：**

| 场景 | 频率 | 描述 |
|------|------|------|
| 新 Campaign 上线 | 每周 1-3 次 | 在 TTD 启动新活动后，在工具中录入 Campaign 信息 |
| 日常状态检查 | 每天 | 打开工具，看 Timeline 了解今日在投 Campaign |
| 数据复盘 | 每周 / 每次 flight 结束 | 导入 TTD 报告，生成 Performance Dashboard |

---

## 3. 功能模块

### 3.1 模块一：Campaign 信息录入与管理

#### 用户故事

- 作为用户，我希望能新建一个 Campaign，填写所有相关信息，以便将来追踪
- 作为用户，我希望能编辑已有 Campaign 的信息，以反映实际变化
- 作为用户，我希望能删除不再需要的 Campaign
- 作为用户，我希望能为一个 Campaign 关联多个 Deal
- 作为用户，我希望能在列表中按 Client / Agency / Status 筛选和搜索 Campaign

#### Campaign 字段规格

**基础信息（必填）**

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| Campaign Name | 文本 | 必填，用于识别 | "Nike Q2 2026 CTV" |
| Start Date | 日期 | 必填，投放开始 | 2026-04-01 |
| End Date | 日期 | 必填，投放结束，必须 > Start Date | 2026-06-30 |
| Ad Type | 枚举 | 必填 | CTV / Display / OTT / Audio / DOOH |
| Client | 文本 | 必填 | "Nike" |
| Agency | 文本 | 可选 | "Wavemaker" |
| Status | 枚举 | 必填，默认 Draft | Draft / Active / Paused / Ended |

**KPI 信息**

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| Primary KPI | 枚举 | 必填，客户最关心的指标 | CTR / VCR / Reach / ROAS / CPA / CPM / Viewability |
| Secondary KPI | 枚举 | 可选，第二关心的指标 | 同上 |
| Budget | 数字 | 可选，本次 Campaign 总预算（USD） | 50000 |

**其他**

| 字段 | 类型 | 说明 |
|------|------|------|
| Notes | 多行文本 | 备注，可填写任意信息 |
| Created At | 时间戳 | 自动记录，不可编辑 |

#### Deal 字段规格

一个 Campaign 可以关联 **0 到多个** Deal。

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| Deal ID | 文本 | TTD 平台上的 Deal ID | "TTD-12345" |
| Deal Name | 文本 | Deal 名称 | "Hulu Premium CTV" |
| Deal Type | 枚举 | PMP / PG / Open |
| Floor Price | 数字 | CPM Floor，美元 | 15.00 |
| Inventory Source | 文本 | 媒体来源 | "Hulu / ESPN" |
| Notes | 文本 | 备注 |

#### Campaign 列表视图规格

- 显示列：Name / Type / Client / Agency / Start Date / End Date / Status / Primary KPI
- 支持按列排序（点击表头）
- 支持文本搜索（模糊匹配 Name 和 Client）
- 支持下拉筛选：Status / Ad Type / Agency
- 每行右侧有「编辑」「删除」操作按钮
- 点击行可展开查看 Deal 列表

#### 验收标准

- [ ] 可以成功新建 Campaign，所有必填项未填时显示错误提示
- [ ] End Date < Start Date 时，显示校验错误，无法提交
- [ ] 新建成功后，Campaign 出现在列表中
- [ ] 编辑 Campaign，修改保存后列表中的数据更新
- [ ] 删除 Campaign 时弹出确认提示，确认后 Campaign 从列表消失
- [ ] Campaign 关联的 Deals 随 Campaign 删除一并删除
- [ ] 可以为 Campaign 添加多个 Deal，可以逐个删除 Deal
- [ ] 按 Status 筛选 "Active" 只显示 Active 的 Campaign
- [ ] 搜索 "Nike" 只显示名称或客户包含 "Nike" 的 Campaign

---

### 3.2 模块二：Gantt / Timeline 视图

#### 用户故事

- 作为用户，我希望看到一个时间轴视图，横轴是时间，纵轴是 Campaign，以便一眼了解当前投放情况
- 作为用户，我希望通过颜色区分不同状态的 Campaign
- 作为用户，我希望点击 Timeline 上的 Campaign 条，查看该 Campaign 的完整详情
- 作为用户，我希望能调整时间轴范围（本月、本季度、半年等）
- 作为用户，我希望能看到今日的标记线，清楚知道当前时间位置
- 作为用户，我希望能按 Agency / Client / Type 过滤 Timeline

#### Timeline 视图规格

**布局：**
- 左侧固定列（200px）：显示 Campaign Name + Client
- 右侧横向滚动区域：时间轴 + Campaign 条
- 顶部时间标尺：按月显示（放大时按周显示）

**时间范围控制：**
- 快捷按钮：「本月」「本季度（3个月）」「半年」
- 自定义：日期范围选择器（DatePicker）
- 默认显示：当前月前后各 1 个月（共 3 个月视图）

**Campaign 条样式：**

| 状态 | 颜色 |
|------|------|
| Active | 绿色 |
| Draft / Pending | 蓝色 |
| Paused | 橙色 |
| Ended | 灰色 |

- 条上显示 Campaign Name（超长截断加省略号）
- 条的起止点精确对应 Start Date 和 End Date

**今日标记线：**
- 红色竖线，覆盖整个时间轴高度
- 顶部标注"今日"

**Campaign 详情侧边栏（点击后打开）：**
- 滑出式侧边栏（Sheet 组件）
- 显示所有 Campaign 字段
- 显示关联的所有 Deal
- 提供「编辑」按钮，跳转到编辑表单

#### 验收标准

- [ ] Timeline 正确显示所有非 Ended 的 Campaign（默认不显示 Ended）
- [ ] Campaign 条的宽度和位置与其 Start/End Date 完全吻合
- [ ] 今日红线正确出现在今日日期位置
- [ ] 点击「本季度」，时间轴范围切换至当前季度
- [ ] 点击某 Campaign 条，右侧侧边栏滑出，显示完整字段
- [ ] 侧边栏中的 Deals 列表正确显示
- [ ] 按 Status 过滤「Active」，只显示 Active Campaign 的条
- [ ] 窗口缩小时，时间轴可以横向滚动，左侧 Campaign 名称列固定不滚动

---

### 3.3 模块三：数据导入

#### 用户故事

- 作为用户，我希望上传从 TTD 导出的 CSV 或 Excel 文件
- 作为用户，我希望将文件中的列名映射到系统字段，以支持不同格式的报告
- 作为用户，我希望在确认导入前能预览数据
- 作为用户，我希望导入后能看到成功/失败的结果统计

#### 数据导入规格

**支持格式：** `.csv`、`.xlsx`

**系统识别的字段（可映射）：**

| 系统字段 | 说明 | 单位 |
|----------|------|------|
| date | 日期 | YYYY-MM-DD |
| impressions | 曝光数 | 整数 |
| clicks | 点击数 | 整数 |
| spend | 消耗 | 美元，小数 |
| ctr | 点击率 | 小数，如 0.0025 |
| vcr | 视频完播率 | 小数，如 0.65 |
| vtr | 视频观看率 | 小数 |
| conversions | 转化数 | 整数 |
| custom_metrics | 自定义字段（JSON存储） | 任意 |

**导入流程：**

1. 选择文件（按钮或拖拽）
2. 自动读取文件，展示前 10 行预览
3. 字段映射：每个系统字段 → 选择对应的文件列（下拉选择器）
4. 选择关联 Campaign（从已有 Campaign 列表中选）
5. 选择导入模式：「追加」（不删除已有数据）或「覆盖」（删除该 Campaign 该日期范围的数据后写入）
6. 点击「确认导入」
7. 显示结果：成功 N 行 / 跳过 N 行（日期格式无法解析等）/ 失败 N 行（有原因）

#### 验收标准

- [ ] 可以选择 `.csv` 文件，成功显示前 10 行预览
- [ ] 可以选择 `.xlsx` 文件，成功显示前 10 行预览
- [ ] 字段映射界面列出所有系统字段，每个字段的下拉选项来自文件的列名
- [ ] 不映射某个字段（选「跳过」），该字段数据不写入
- [ ] 「追加」模式：重复导入同一文件，数据行数翻倍
- [ ] 「覆盖」模式：重复导入同一文件，数据行数不变
- [ ] 日期列格式无法解析的行，被计入「跳过」并列出原因
- [ ] 导入完成后，结果弹窗显示正确的行数统计

---

### 3.4 模块四：Performance Dashboard

#### 用户故事

- 作为用户，我希望选择一个或多个 Campaign，查看其 Performance 数据
- 作为用户，我希望看到关键 KPI 指标的汇总卡片
- 作为用户，我希望看到 Impressions 和 Spend 的每日趋势折线图
- 作为用户，我希望看到 Clicks / Conversions 的每日柱状图
- 作为用户，我希望能筛选日期范围
- 作为用户，我希望能将当前 Dashboard 数据导出为 CSV

#### Dashboard 规格

**筛选器（顶部）：**
- Campaign 选择器（多选，从已导入数据的 Campaign 中选）
- 日期范围选择器

**KPI 汇总卡片（第一行，4 个卡片）：**

| 指标 | 显示格式 |
|------|----------|
| Total Impressions | 1,234,567 |
| Total Spend | $12,345.67 |
| Average CTR | 0.25% |
| Average VCR | 65.3%（若为 CTV 类型则高亮） |

- 根据 Campaign 的 Primary KPI，对应卡片边框高亮（accent color）

**图表区：**

1. **Impressions & Spend 趋势图**（ComposedChart，双 Y 轴）
   - 左轴：Impressions（折线）
   - 右轴：Spend USD（柱状）
   - X 轴：日期

2. **Clicks & Conversions 对比图**（BarChart）
   - 分组柱状，每日 Clicks（蓝）vs Conversions（绿）

3. **Campaign Spend 占比**（PieChart，仅多 Campaign 时显示）
   - 每个 Campaign 的总 Spend 占比

**图表 Tooltip 格式：**
- Impressions：千分位格式，如 `1,234,567`
- Spend：`$12,345.67`
- CTR / VCR：`0.25%`

**导出：**
- 「导出 CSV」按钮：触发系统保存对话框，导出当前筛选数据（日期、所有指标列）

#### 验收标准

- [ ] 选择有数据的 Campaign，KPI 卡片正确显示汇总数值
- [ ] 折线图的 Impressions 数值与导入数据一致（可手动验算）
- [ ] 筛选日期范围「2026-04-01 ~ 2026-04-07」，图表只显示该范围数据
- [ ] 选择 2 个 Campaign，PieChart 正确显示两者 Spend 占比
- [ ] 点击「导出 CSV」，系统弹出保存对话框，保存后文件可用 Excel 打开
- [ ] 无数据时（Campaign 未导入数据），图表显示空状态提示

---

### 3.5 首页（Home Dashboard）

#### 规格

首页作为每日打开工具后的第一眼，显示关键摘要：

- **今日活跃 Campaign 数**（Stat 卡片）
- **本月 Total Spend**（Stat 卡片，聚合所有 Campaign）
- **即将结束的 Campaign**（7 天内 End Date 的 Campaign 列表，含倒计时天数）
- **最近添加的 Campaign**（最近 3 条，按 created_at 排序）

---

## 4. 非功能需求

| 需求 | 规格 |
|------|------|
| 启动时间 | 冷启动 < 3 秒 |
| 数据量 | 支持 500 个 Campaign + 每 Campaign 365 天数据（~182,500 行）无明显卡顿 |
| 离线 | 完全离线，无需网络 |
| 数据安全 | 数据存在用户本地，不上传任何数据 |
| 数据备份 | 提供一键备份 SQLite 文件的功能 |
| 窗口 | 默认 1280×800，最小 1024×640，可最大化 |
| 主题 | 支持浅色 / 深色主题切换 |

---

## 5. 数据模型

### campaigns 表

```sql
CREATE TABLE campaigns (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  start_date  TEXT    NOT NULL,  -- ISO 8601: YYYY-MM-DD
  end_date    TEXT    NOT NULL,
  type        TEXT    NOT NULL,  -- CTV | Display | OTT | Audio | DOOH
  agency      TEXT,
  client      TEXT    NOT NULL,
  primary_kpi TEXT    NOT NULL,  -- CTR | VCR | Reach | ROAS | CPA | CPM | Viewability
  secondary_kpi TEXT,
  budget      REAL,
  status      TEXT    NOT NULL DEFAULT 'Draft',  -- Draft | Active | Paused | Ended
  notes       TEXT,
  created_at  TEXT    NOT NULL   -- ISO 8601 datetime
);
```

### deals 表

```sql
CREATE TABLE deals (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id      INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  deal_id          TEXT,
  deal_name        TEXT,
  deal_type        TEXT,   -- PMP | PG | Open
  floor_price      REAL,
  inventory_source TEXT,
  notes            TEXT
);
```

### performance_data 表

```sql
CREATE TABLE performance_data (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id    INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  date           TEXT    NOT NULL,  -- YYYY-MM-DD
  impressions    INTEGER,
  clicks         INTEGER,
  spend          REAL,
  ctr            REAL,
  vcr            REAL,
  vtr            REAL,
  conversions    INTEGER,
  custom_metrics TEXT    -- JSON string for extra fields
);
```

---

## 6. 界面导航结构

```
左侧导航栏（固定）
├── 首页 (Home)
├── Campaign 列表 (Campaigns)
├── Timeline 视图 (Timeline)
├── 数据导入 (Import)
├── Performance Dashboard (Dashboard)
└── 设置 (Settings) — 主题切换、数据备份
```

---

## 7. 范围外（Out of Scope v1.0）

以下功能不在 v1.0 范围内，未来可以考虑：

- 多用户 / 团队协作
- 与 TTD API 直接对接（自动拉取数据）
- 邮件 / Slack 报告自动发送
- Campaign 模板（复制已有 Campaign 新建）
- 预算 pacing 预警（Spend 进度不及预期时提醒）
