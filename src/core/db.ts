/**
 * SQLite persistence via sql.js (WASM — no native compilation needed).
 * Electron-free: DB path and WASM path are injected by the caller via initDb().
 * The DB is loaded into memory on startup and flushed to disk after every mutation.
 */
import * as fs from 'fs'
import * as path from 'path'
import type { Campaign, CampaignLine, CampaignStatus, Deal, Flight, PerformanceData, ImportOptions, ImportResult } from '../shared/types'

// @ts-expect-error - sql.js ships no bundled types
import initSqlJs from 'sql.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _SQL: any = null
let _dbPath = ''

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDb() {
  if (!_db) throw new Error('Database not initialized. Call initDatabase() first.')
  return _db
}

/** Persist the in-memory DB to disk. Called after every mutation. */
function save() {
  const data: Uint8Array = getDb().export()
  fs.writeFileSync(_dbPath, Buffer.from(data))
}

function timestampForFileName(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function todayLocalDateString(): string {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function deriveLineStatus(line: { start_date: string; end_date: string; status?: string }, today: string): CampaignStatus {
  if (line.status === 'Paused') return 'Paused'
  if (today > line.end_date) return 'Ended'
  if (today >= line.start_date) return 'Active'
  return 'Draft'
}

function deriveCampaignStatus(lines: Array<{ status: string }>, currentStatus?: string): CampaignStatus | null {
  if (currentStatus === 'Paused') return 'Paused'
  if (lines.length === 0) return null
  if (lines.every(line => line.status === 'Ended')) return 'Ended'
  if (lines.some(line => line.status === 'Active')) return 'Active'
  if (lines.some(line => line.status === 'Paused')) return 'Paused'
  return 'Draft'
}

/** Run a statement that produces no result rows. */
function run(sql: string, params: unknown[] = []) {
  getDb().run(sql, params)
  save()
}

/** Query rows and return them as typed objects. */
function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDb().prepare(sql)
  stmt.bind(params)
  const rows: T[] = []
  while (stmt.step()) rows.push(stmt.getAsObject() as T)
  stmt.free()
  return rows
}

function queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
  return queryAll<T>(sql, params)[0]
}

// ── Schema ────────────────────────────────────────────────────────────────────

function createSchema() {
  const db = getDb()
  db.run(`PRAGMA foreign_keys = ON`)
  db.run(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      name              TEXT NOT NULL,
      ttd_campaign_id   TEXT,
      start_date        TEXT NOT NULL,
      end_date          TEXT NOT NULL,
      type              TEXT NOT NULL,
      agency            TEXT,
      client            TEXT,
      primary_kpi       TEXT,
      secondary_kpi     TEXT,
      budget            REAL DEFAULT 0,
      status            TEXT DEFAULT 'Active',
      notes             TEXT,
      created_at        TEXT DEFAULT (datetime('now'))
    )`)
  db.run(`
    CREATE TABLE IF NOT EXISTS campaign_lines (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id       INTEGER NOT NULL,
      country           TEXT,
      channel           TEXT NOT NULL,
      ttd_campaign_id   TEXT,
      start_date        TEXT NOT NULL,
      end_date          TEXT NOT NULL,
      budget            REAL DEFAULT 0,
      cpm_goal          REAL,
      primary_kpi       TEXT NOT NULL,
      secondary_kpi     TEXT,
      status            TEXT DEFAULT 'Draft',
      notes             TEXT,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    )`)
  db.run(`
    CREATE TABLE IF NOT EXISTS flights (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id   INTEGER NOT NULL,
      campaign_line_id INTEGER,
      flight_name   TEXT,
      start_date    TEXT NOT NULL,
      end_date      TEXT NOT NULL,
      budget        REAL DEFAULT 0,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (campaign_line_id) REFERENCES campaign_lines(id) ON DELETE CASCADE
    )`)
  db.run(`
    CREATE TABLE IF NOT EXISTS deals (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id       INTEGER NOT NULL,
      campaign_line_id   INTEGER,
      deal_id           TEXT,
      deal_name         TEXT,
      deal_type         TEXT,
      floor_price       REAL,
      inventory_source  TEXT,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (campaign_line_id) REFERENCES campaign_lines(id) ON DELETE CASCADE
    )`)
  db.run(`
    CREATE TABLE IF NOT EXISTS performance_data (
      id                          INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id                 INTEGER NOT NULL,
      campaign_line_id            INTEGER,
      ttd_campaign_name           TEXT,
      ad_group                    TEXT,
      ad_group_id                 TEXT,
      publisher_name              TEXT,
      media_type                  TEXT,
      market_type                 TEXT,
      inventory_contract          TEXT,
      date                        TEXT,
      impressions                 INTEGER DEFAULT 0,
      advertiser_cost_usd         REAL    DEFAULT 0,
      clicks                      INTEGER DEFAULT 0,
      media_cost_usd              REAL    DEFAULT 0,
      player_starts               INTEGER DEFAULT 0,
      player_completed_views      INTEGER DEFAULT 0,
      unique_households           INTEGER DEFAULT 0,
      unique_persons              INTEGER DEFAULT 0,
      unique_ids                  INTEGER DEFAULT 0,
      conv_01 INTEGER DEFAULT 0, conv_02 INTEGER DEFAULT 0, conv_03 INTEGER DEFAULT 0,
      conv_04 INTEGER DEFAULT 0, conv_05 INTEGER DEFAULT 0, conv_06 INTEGER DEFAULT 0,
      conv_07 INTEGER DEFAULT 0, conv_08 INTEGER DEFAULT 0, conv_09 INTEGER DEFAULT 0,
      conv_10 INTEGER DEFAULT 0, conv_11 INTEGER DEFAULT 0, conv_12 INTEGER DEFAULT 0,
      conv_13 INTEGER DEFAULT 0, conv_14 INTEGER DEFAULT 0, conv_15 INTEGER DEFAULT 0,
      conv_16 INTEGER DEFAULT 0, conv_17 INTEGER DEFAULT 0, conv_18 INTEGER DEFAULT 0,
      conv_19 INTEGER DEFAULT 0, conv_20 INTEGER DEFAULT 0,
      total_custom_cpa_conversions  INTEGER DEFAULT 0,
      advertiser_cost_adv_currency  REAL    DEFAULT 0,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (campaign_line_id) REFERENCES campaign_lines(id) ON DELETE SET NULL
    )`)
  ensureColumn('flights', 'campaign_line_id', 'INTEGER')
  ensureColumn('deals', 'campaign_line_id', 'INTEGER')
  ensureColumn('performance_data', 'campaign_line_id', 'INTEGER')
  migrateLegacyCampaigns()
  syncCampaignStatusesByDate()
  // Persist schema changes
  save()
}

function hasColumn(table: string, column: string): boolean {
  const rows = queryAll<{ name: string }>(`PRAGMA table_info(${table})`)
  return rows.some(row => row.name === column)
}

function ensureColumn(table: string, column: string, definition: string) {
  if (!hasColumn(table, column)) {
    getDb().run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

function migrateLegacyCampaigns() {
  const db = getDb()
  const legacyCampaigns = queryAll<{
    id: number
    ttd_campaign_id?: string
    start_date?: string
    end_date?: string
    type?: string
    budget?: number
    primary_kpi?: string
    secondary_kpi?: string
    status?: string
  }>(`
    SELECT c.*
    FROM campaigns c
    LEFT JOIN campaign_lines l ON l.campaign_id = c.id
    WHERE l.id IS NULL
  `)
  for (const c of legacyCampaigns) {
    db.run(
      `INSERT INTO campaign_lines
        (campaign_id, country, channel, ttd_campaign_id, start_date, end_date, budget, cpm_goal, primary_kpi, secondary_kpi, status, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        c.id,
        null,
        c.type || 'CTV',
        c.ttd_campaign_id ?? null,
        c.start_date || new Date().toISOString().slice(0, 10),
        c.end_date || new Date().toISOString().slice(0, 10),
        c.budget ?? 0,
        null,
        c.primary_kpi || 'VCR',
        c.secondary_kpi ?? null,
        c.status || 'Draft',
        null,
      ]
    )
    const lineId = (db.exec('SELECT last_insert_rowid()')[0].values[0][0]) as number
    db.run('UPDATE flights SET campaign_line_id = ? WHERE campaign_id = ? AND campaign_line_id IS NULL', [lineId, c.id])
    db.run('UPDATE deals SET campaign_line_id = ? WHERE campaign_id = ? AND campaign_line_id IS NULL', [lineId, c.id])
    db.run('UPDATE performance_data SET campaign_line_id = ? WHERE campaign_id = ? AND campaign_line_id IS NULL', [lineId, c.id])
  }
}

function syncCampaignStatusesByDate() {
  const db = getDb()
  const today = todayLocalDateString()
  let changed = false

  const lines = queryAll<{ id: number; campaign_id: number; start_date: string; end_date: string; status: string }>(
    'SELECT id, campaign_id, start_date, end_date, status FROM campaign_lines'
  )
  for (const line of lines) {
    const nextStatus = deriveLineStatus(line, today)
    if (nextStatus !== line.status) {
      db.run('UPDATE campaign_lines SET status = ? WHERE id = ?', [nextStatus, line.id])
      changed = true
    }
  }

  const campaigns = queryAll<{ id: number; status: string }>('SELECT id, status FROM campaigns')
  for (const campaign of campaigns) {
    const campaignLines = queryAll<{ status: string }>('SELECT status FROM campaign_lines WHERE campaign_id = ?', [campaign.id])
    const nextStatus = deriveCampaignStatus(campaignLines, campaign.status)
    if (nextStatus && nextStatus !== campaign.status) {
      db.run('UPDATE campaigns SET status = ? WHERE id = ?', [nextStatus, campaign.id])
      changed = true
    }
  }

  if (changed) save()
}

// ── Init ──────────────────────────────────────────────────────────────────────

function loadFromDisk(): void {
  if (fs.existsSync(_dbPath)) {
    _db = new _SQL.Database(fs.readFileSync(_dbPath))
  } else {
    _db = new _SQL.Database()
  }
}

export async function initDb(opts: { dbPath: string; wasmPath: string }): Promise<void> {
  _SQL = await initSqlJs({ locateFile: () => opts.wasmPath })
  _dbPath = opts.dbPath
  loadFromDisk()
  createSchema()
  console.error(`[DB] SQLite ready at: ${_dbPath}`)
}

/** Re-read the DB file from disk, discarding the in-memory copy.
 *  MCP calls this before each tool so the AI never sees stale data
 *  (e.g. campaigns the user just created in the running app). */
export function reloadFromDisk(): void {
  if (!_SQL) throw new Error('Database not initialized. Call initDb() first.')
  _db?.close?.()
  loadFromDisk()
}

export function getDatabasePath(): string {
  return _dbPath
}

export function backupDatabaseTo(destinationPath: string): string {
  save()
  fs.copyFileSync(_dbPath, destinationPath)
  return destinationPath
}

export function restoreDatabaseFrom(sourcePath: string): { dbPath: string; safetyBackupPath: string } {
  if (!_SQL) throw new Error('Database engine not initialized.')
  if (!fs.existsSync(sourcePath)) throw new Error('Backup file does not exist.')

  const candidateBytes = fs.readFileSync(sourcePath)
  const candidate = new _SQL.Database(candidateBytes)
  try {
    // Basic validation: ensure this looks like a SQLite DB and can be read.
    candidate.exec("SELECT name FROM sqlite_master WHERE type='table'")
  } finally {
    candidate.close()
  }

  save()
  const safetyBackupPath = path.join(
    path.dirname(_dbPath),
    `campaign-tracker-before-restore-${timestampForFileName()}.db`
  )
  fs.copyFileSync(_dbPath, safetyBackupPath)

  fs.copyFileSync(sourcePath, _dbPath)
  _db?.close?.()
  _db = new _SQL.Database(fs.readFileSync(_dbPath))
  createSchema()

  return { dbPath: _dbPath, safetyBackupPath }
}

// ── Campaigns ─────────────────────────────────────────────────────────────────

function loadCampaignLine(id: number): CampaignLine | undefined {
  type Row = Omit<CampaignLine, 'flights' | 'deals'>
  const line = queryOne<Row>('SELECT * FROM campaign_lines WHERE id = ?', [id])
  if (!line) return undefined
  const flights = queryAll<Flight>('SELECT * FROM flights WHERE campaign_line_id = ? ORDER BY start_date', [id])
  const deals = queryAll<Deal>('SELECT * FROM deals WHERE campaign_line_id = ?', [id])
  return {
    ...line,
    budget: Number(line.budget ?? 0),
    cpm_goal: line.cpm_goal == null ? undefined : Number(line.cpm_goal),
    flights,
    deals,
  }
}

function loadLines(campaignId: number): CampaignLine[] {
  const rows = queryAll<{ id: number }>('SELECT id FROM campaign_lines WHERE campaign_id = ? ORDER BY start_date', [campaignId])
  return rows.map(row => loadCampaignLine(row.id)).filter(Boolean) as CampaignLine[]
}

function loadCampaign(id: number): Campaign | undefined {
  type Row = Omit<Campaign, 'lines'>
  const c = queryOne<Row>('SELECT * FROM campaigns WHERE id = ?', [id])
  if (!c) return undefined
  const lines = loadLines(id)
  const firstLine = lines[0]
  const flights = lines.flatMap(line => line.flights ?? [])
  const deals = lines.flatMap(line => line.deals ?? [])
  return {
    ...c,
    lines,
    flights,
    deals,
    // Rollups for older UI areas while they are migrated.
    ttd_campaign_id: firstLine?.ttd_campaign_id,
    start_date: firstLine?.start_date,
    end_date: firstLine?.end_date,
    type: Array.from(new Set(lines.map(l => l.channel).filter(Boolean))).join(', '),
    primary_kpi: firstLine?.primary_kpi,
    secondary_kpi: firstLine?.secondary_kpi,
    budget: lines.reduce((sum, line) => sum + (Number(line.budget) || 0), 0),
  }
}

export function listCampaigns(): Campaign[] {
  syncCampaignStatusesByDate()
  const rows = queryAll<{ id: number }>('SELECT id FROM campaigns ORDER BY created_at DESC')
  return rows.map(c => loadCampaign(c.id)).filter(Boolean) as Campaign[]
}

export function getCampaign(id: number): Campaign | undefined {
  syncCampaignStatusesByDate()
  return loadCampaign(id)
}

export function createCampaign(
  data: Omit<Campaign, 'id' | 'created_at' | 'lines'>,
  lines: Array<Omit<CampaignLine, 'id' | 'campaign_id'>>
): Campaign {
  const db = getDb()
  const firstLine = lines[0]
  db.run(
    `INSERT INTO campaigns
      (name, ttd_campaign_id, start_date, end_date, type, agency, client, primary_kpi, secondary_kpi, budget, status, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      data.name,
      firstLine?.ttd_campaign_id ?? null,
      firstLine?.start_date ?? new Date().toISOString().slice(0, 10),
      firstLine?.end_date ?? new Date().toISOString().slice(0, 10),
      firstLine?.channel ?? 'CTV',
      data.agency ?? null,
      data.client ?? null,
      firstLine?.primary_kpi ?? 'VCR',
      firstLine?.secondary_kpi ?? null,
      firstLine?.budget ?? 0,
      data.status ?? 'Draft',
      data.notes ?? null,
    ]
  )
  const id = (db.exec('SELECT last_insert_rowid()')[0].values[0][0]) as number

  insertCampaignLines(id, lines)
  save()
  return loadCampaign(id)!
}

export function updateCampaign(
  id: number,
  data: Omit<Campaign, 'id' | 'created_at' | 'lines'>,
  lines: Array<Omit<CampaignLine, 'id' | 'campaign_id'>>
): Campaign | undefined {
  const db = getDb()
  const firstLine = lines[0]
  db.run(
    `UPDATE campaigns SET name=?, ttd_campaign_id=?, start_date=?, end_date=?, type=?, agency=?,
      client=?, primary_kpi=?, secondary_kpi=?, budget=?, status=?, notes=? WHERE id=?`,
    [
      data.name,
      firstLine?.ttd_campaign_id ?? null,
      firstLine?.start_date ?? new Date().toISOString().slice(0, 10),
      firstLine?.end_date ?? new Date().toISOString().slice(0, 10),
      firstLine?.channel ?? 'CTV',
      data.agency ?? null,
      data.client ?? null,
      firstLine?.primary_kpi ?? 'VCR',
      firstLine?.secondary_kpi ?? null,
      firstLine?.budget ?? 0,
      data.status ?? 'Draft',
      data.notes ?? null,
      id,
    ]
  )
  // Replace lines; cascading deletes their flights/deals.
  db.run('DELETE FROM campaign_lines WHERE campaign_id = ?', [id])
  insertCampaignLines(id, lines)
  save()
  return loadCampaign(id)
}

function insertCampaignLines(campaignId: number, lines: Array<Omit<CampaignLine, 'id' | 'campaign_id'>>) {
  const db = getDb()
  for (const line of lines) {
    db.run(
      `INSERT INTO campaign_lines
        (campaign_id, country, channel, ttd_campaign_id, start_date, end_date, budget, cpm_goal, primary_kpi, secondary_kpi, status, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        campaignId,
        line.country ?? null,
        line.channel,
        line.ttd_campaign_id ?? null,
        line.start_date,
        line.end_date,
        line.budget ?? 0,
        line.cpm_goal ?? null,
        line.primary_kpi,
        line.secondary_kpi ?? null,
        line.status ?? 'Draft',
        line.notes ?? null,
      ]
    )
    const lineId = (db.exec('SELECT last_insert_rowid()')[0].values[0][0]) as number
    for (const f of line.flights ?? []) {
      db.run(
        `INSERT INTO flights (campaign_id, campaign_line_id, flight_name, start_date, end_date, budget) VALUES (?,?,?,?,?,?)`,
        [campaignId, lineId, f.flight_name ?? null, f.start_date, f.end_date, f.budget ?? 0]
      )
    }
    for (const d of line.deals ?? []) {
      db.run(
        `INSERT INTO deals (campaign_id, campaign_line_id, deal_id, deal_name, deal_type, floor_price, inventory_source) VALUES (?,?,?,?,?,?,?)`,
        [campaignId, lineId, d.deal_id ?? null, d.deal_name ?? null, d.deal_type ?? null, d.floor_price ?? null, d.inventory_source ?? null]
      )
    }
  }
}

export function deleteCampaign(id: number): boolean {
  run('DELETE FROM campaigns WHERE id = ?', [id])
  return true
}

// ── Performance ───────────────────────────────────────────────────────────────

export function queryPerformance(campaign_id: number, from?: string, to?: string): PerformanceData[] {
  let sql = `
    SELECT p.*, l.country, l.channel
    FROM performance_data p
    LEFT JOIN campaign_lines l ON l.id = p.campaign_line_id
    WHERE p.campaign_id = ?
  `
  const params: unknown[] = [campaign_id]
  if (from) { sql += ' AND p.date >= ?'; params.push(from) }
  if (to)   { sql += ' AND p.date <= ?'; params.push(to) }
  sql += ' ORDER BY p.date'
  return queryAll<PerformanceData>(sql, params)
}

export function importPerformance(opts: ImportOptions, rows: PerformanceData[]): ImportResult {
  const db = getDb()
  // Delete existing data for this campaign line before importing. Fallback to campaign-level delete for legacy imports.
  if (opts.campaign_line_id) {
    db.run('DELETE FROM performance_data WHERE campaign_line_id = ?', [opts.campaign_line_id])
  } else {
    db.run('DELETE FROM performance_data WHERE campaign_id = ?', [opts.campaign_id])
  }

  const toInsert = opts.keep_zero_impressions ? rows : rows.filter(r => r.impressions > 0)
  const zeroes   = rows.filter(r => r.impressions === 0).length

  for (const r of toInsert) {
    db.run(
      `INSERT INTO performance_data
        (campaign_id, campaign_line_id, ttd_campaign_name, ad_group, ad_group_id, publisher_name, media_type,
         market_type, inventory_contract, date, impressions, advertiser_cost_usd, clicks,
         media_cost_usd, player_starts, player_completed_views, unique_households,
         unique_persons, unique_ids,
         conv_01, conv_02, conv_03, conv_04, conv_05, conv_06, conv_07, conv_08, conv_09, conv_10,
         conv_11, conv_12, conv_13, conv_14, conv_15, conv_16, conv_17, conv_18, conv_19, conv_20,
         total_custom_cpa_conversions, advertiser_cost_adv_currency)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        opts.campaign_id, opts.campaign_line_id ?? null, r.ttd_campaign_name ?? null, r.ad_group ?? null, r.ad_group_id ?? null,
        r.publisher_name ?? null, r.media_type ?? null, r.market_type ?? null, r.inventory_contract ?? null,
        r.date ?? null, r.impressions ?? 0, r.advertiser_cost_usd ?? 0, r.clicks ?? 0,
        r.media_cost_usd ?? 0, r.player_starts ?? 0, r.player_completed_views ?? 0,
        r.unique_households ?? 0, r.unique_persons ?? 0, r.unique_ids ?? 0,
        r.conv_01 ?? 0, r.conv_02 ?? 0, r.conv_03 ?? 0, r.conv_04 ?? 0, r.conv_05 ?? 0,
        r.conv_06 ?? 0, r.conv_07 ?? 0, r.conv_08 ?? 0, r.conv_09 ?? 0, r.conv_10 ?? 0,
        r.conv_11 ?? 0, r.conv_12 ?? 0, r.conv_13 ?? 0, r.conv_14 ?? 0, r.conv_15 ?? 0,
        r.conv_16 ?? 0, r.conv_17 ?? 0, r.conv_18 ?? 0, r.conv_19 ?? 0, r.conv_20 ?? 0,
        r.total_custom_cpa_conversions ?? 0, r.advertiser_cost_adv_currency ?? 0,
      ]
    )
  }
  save()

  return {
    total_rows:           rows.length,
    imported_rows:        toInsert.length,
    skipped_rows:         rows.length - toInsert.length,
    zero_impression_rows: zeroes,
  }
}

export function deletePerformanceData(campaign_id: number): number {
  const before = queryAll('SELECT id FROM performance_data WHERE campaign_id = ?', [campaign_id]).length
  run('DELETE FROM performance_data WHERE campaign_id = ?', [campaign_id])
  return before
}

export function hasPerformanceData(campaign_id: number): boolean {
  const r = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM performance_data WHERE campaign_id = ?', [campaign_id])
  return (r?.cnt ?? 0) > 0
}

export function listCampaignsWithDataStatus() {
  return listCampaigns().map(c => ({
    campaign: c,
    hasData:  hasPerformanceData(c.id),
    rowCount: queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM performance_data WHERE campaign_id = ?', [c.id])?.cnt ?? 0,
  }))
}
