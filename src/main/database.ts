/**
 * SQLite persistence via sql.js (WASM — no native compilation needed).
 * Data is stored at: app.getPath('userData')/campaign-tracker.db
 * The DB is loaded into memory on startup and flushed to disk after every mutation.
 */
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { Campaign, Deal, Flight, PerformanceData, ImportOptions, ImportResult } from '../shared/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: any = null
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

/** Run an INSERT and return the new row id. */
function insert(sql: string, params: unknown[] = []): number {
  const db = getDb()
  db.run(sql, params)
  const res = db.exec('SELECT last_insert_rowid()')
  const id = res[0]?.values[0]?.[0] as number
  save()
  return id
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
    CREATE TABLE IF NOT EXISTS flights (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id   INTEGER NOT NULL,
      flight_name   TEXT,
      start_date    TEXT NOT NULL,
      end_date      TEXT NOT NULL,
      budget        REAL DEFAULT 0,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    )`)
  db.run(`
    CREATE TABLE IF NOT EXISTS deals (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id       INTEGER NOT NULL,
      deal_id           TEXT,
      deal_name         TEXT,
      deal_type         TEXT,
      floor_price       REAL,
      inventory_source  TEXT,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    )`)
  db.run(`
    CREATE TABLE IF NOT EXISTS performance_data (
      id                          INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id                 INTEGER NOT NULL,
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
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    )`)
  // Persist schema changes
  save()
}

// ── Init ──────────────────────────────────────────────────────────────────────

export async function initDatabase(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const initSqlJs = require('sql.js')

  // Locate the WASM file
  const wasmPath = app.isPackaged
    ? path.join(process.resourcesPath, 'sql-wasm.wasm')
    : path.join(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm')

  const SQL = await initSqlJs({ locateFile: () => wasmPath })

  _dbPath = path.join(app.getPath('userData'), 'campaign-tracker.db')

  if (fs.existsSync(_dbPath)) {
    _db = new SQL.Database(fs.readFileSync(_dbPath))
  } else {
    _db = new SQL.Database()
  }

  createSchema()
  console.log(`[DB] SQLite ready at: ${_dbPath}`)
}

// ── Campaigns ─────────────────────────────────────────────────────────────────

function loadCampaign(id: number): Campaign | undefined {
  type Row = Omit<Campaign, 'flights' | 'deals'>
  const c = queryOne<Row>('SELECT * FROM campaigns WHERE id = ?', [id])
  if (!c) return undefined
  const flights = queryAll<Flight>('SELECT * FROM flights WHERE campaign_id = ? ORDER BY start_date', [id])
  const deals   = queryAll<Deal>('SELECT * FROM deals   WHERE campaign_id = ?', [id])
  return { ...c, budget: Number(c.budget), flights, deals }
}

export function listCampaigns(): Campaign[] {
  type Row = Omit<Campaign, 'flights' | 'deals'>
  const rows = queryAll<Row>('SELECT * FROM campaigns ORDER BY created_at DESC')
  return rows.map(c => {
    const flights = queryAll<Flight>('SELECT * FROM flights WHERE campaign_id = ? ORDER BY start_date', [c.id])
    const deals   = queryAll<Deal>('SELECT * FROM deals   WHERE campaign_id = ?', [c.id])
    return { ...c, budget: Number(c.budget), flights, deals }
  })
}

export function getCampaign(id: number): Campaign | undefined {
  return loadCampaign(id)
}

export function createCampaign(
  data: Omit<Campaign, 'id' | 'created_at' | 'flights' | 'deals'>,
  deals: Omit<Deal, 'id' | 'campaign_id'>[],
  flights: Omit<Flight, 'id' | 'campaign_id'>[]
): Campaign {
  const db = getDb()
  db.run(
    `INSERT INTO campaigns (name, ttd_campaign_id, start_date, end_date, type, agency, client,
      primary_kpi, secondary_kpi, budget, status, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [data.name, data.ttd_campaign_id ?? null, data.start_date, data.end_date, data.type,
     data.agency ?? null, data.client ?? null, data.primary_kpi ?? null, data.secondary_kpi ?? null,
     data.budget ?? 0, data.status ?? 'Active', data.notes ?? null]
  )
  const id = (db.exec('SELECT last_insert_rowid()')[0].values[0][0]) as number

  for (const f of flights) {
    db.run(
      `INSERT INTO flights (campaign_id, flight_name, start_date, end_date, budget) VALUES (?,?,?,?,?)`,
      [id, f.flight_name ?? null, f.start_date, f.end_date, f.budget ?? 0]
    )
  }
  for (const d of deals) {
    db.run(
      `INSERT INTO deals (campaign_id, deal_id, deal_name, deal_type, floor_price, inventory_source) VALUES (?,?,?,?,?,?)`,
      [id, d.deal_id ?? null, d.deal_name ?? null, d.deal_type ?? null, d.floor_price ?? null, d.inventory_source ?? null]
    )
  }
  save()
  return loadCampaign(id)!
}

export function updateCampaign(
  id: number,
  data: Omit<Campaign, 'id' | 'created_at' | 'flights' | 'deals'>,
  deals: Omit<Deal, 'id' | 'campaign_id'>[],
  flights: Omit<Flight, 'id' | 'campaign_id'>[]
): Campaign | undefined {
  const db = getDb()
  db.run(
    `UPDATE campaigns SET name=?, ttd_campaign_id=?, start_date=?, end_date=?, type=?, agency=?,
      client=?, primary_kpi=?, secondary_kpi=?, budget=?, status=?, notes=? WHERE id=?`,
    [data.name, data.ttd_campaign_id ?? null, data.start_date, data.end_date, data.type,
     data.agency ?? null, data.client ?? null, data.primary_kpi ?? null, data.secondary_kpi ?? null,
     data.budget ?? 0, data.status ?? 'Active', data.notes ?? null, id]
  )
  // Replace flights & deals
  db.run('DELETE FROM flights WHERE campaign_id = ?', [id])
  db.run('DELETE FROM deals   WHERE campaign_id = ?', [id])
  for (const f of flights) {
    db.run(
      `INSERT INTO flights (campaign_id, flight_name, start_date, end_date, budget) VALUES (?,?,?,?,?)`,
      [id, f.flight_name ?? null, f.start_date, f.end_date, f.budget ?? 0]
    )
  }
  for (const d of deals) {
    db.run(
      `INSERT INTO deals (campaign_id, deal_id, deal_name, deal_type, floor_price, inventory_source) VALUES (?,?,?,?,?,?)`,
      [id, d.deal_id ?? null, d.deal_name ?? null, d.deal_type ?? null, d.floor_price ?? null, d.inventory_source ?? null]
    )
  }
  save()
  return loadCampaign(id)
}

export function deleteCampaign(id: number): boolean {
  run('DELETE FROM campaigns WHERE id = ?', [id])
  return true
}

// ── Performance ───────────────────────────────────────────────────────────────

export function queryPerformance(campaign_id: number, from?: string, to?: string): PerformanceData[] {
  let sql = 'SELECT * FROM performance_data WHERE campaign_id = ?'
  const params: unknown[] = [campaign_id]
  if (from) { sql += ' AND date >= ?'; params.push(from) }
  if (to)   { sql += ' AND date <= ?'; params.push(to) }
  sql += ' ORDER BY date'
  return queryAll<PerformanceData>(sql, params)
}

export function importPerformance(opts: ImportOptions, rows: PerformanceData[]): ImportResult {
  const db = getDb()
  // Delete existing data for this campaign before importing
  db.run('DELETE FROM performance_data WHERE campaign_id = ?', [opts.campaign_id])

  const toInsert = opts.keep_zero_impressions ? rows : rows.filter(r => r.impressions > 0)
  const zeroes   = rows.filter(r => r.impressions === 0).length

  for (const r of toInsert) {
    db.run(
      `INSERT INTO performance_data
        (campaign_id, ttd_campaign_name, ad_group, ad_group_id, publisher_name, media_type,
         market_type, inventory_contract, date, impressions, advertiser_cost_usd, clicks,
         media_cost_usd, player_starts, player_completed_views, unique_households,
         unique_persons, unique_ids,
         conv_01, conv_02, conv_03, conv_04, conv_05, conv_06, conv_07, conv_08, conv_09, conv_10,
         conv_11, conv_12, conv_13, conv_14, conv_15, conv_16, conv_17, conv_18, conv_19, conv_20,
         total_custom_cpa_conversions, advertiser_cost_adv_currency)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        opts.campaign_id, r.ttd_campaign_name ?? null, r.ad_group ?? null, r.ad_group_id ?? null,
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
