import Database from 'better-sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'dashboard.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','client')),
      client_id INTEGER,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      logo_url TEXT,
      ghl_api_key TEXT,
      ghl_location_id TEXT,
      ghl_pipeline_id TEXT,
      stage_leads TEXT,
      stage_unqualified TEXT,
      stage_phone TEXT,
      stage_inhome TEXT,
      retainer_price REAL DEFAULT 0,
      ad_spend REAL DEFAULT 0,
      contract_url TEXT,
      slack_url TEXT,
      start_date TEXT NOT NULL DEFAULT (date('now')),
      ghl_custom_fields TEXT,
      daily_ad_spend REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      customer_name TEXT NOT NULL,
      value REAL NOT NULL DEFAULT 0,
      profit_margin REAL,
      quote_pdf_url TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed','lost')),
      drive_url TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS call_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      call_type TEXT NOT NULL CHECK(call_type IN ('sales','onboarding','launch','checkin')),
      call_date TEXT DEFAULT (date('now')),
      call_number INTEGER DEFAULT 1,
      fathom_summary TEXT,
      pain_points TEXT,
      goals TEXT,
      solutions_tried TEXT,
      issues_solutions TEXT DEFAULT '[]',
      problems_addressed TEXT,
      next_step_actions TEXT,
      problems_resolved TEXT,
      wins TEXT,
      client_sentiment TEXT,
      agency_action_items TEXT,
      client_action_items TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT DEFAULT (datetime('now')),
      finished_at TEXT,
      status TEXT DEFAULT 'running' CHECK(status IN ('running','success','error')),
      locations_found INTEGER DEFAULT 0,
      clients_created INTEGER DEFAULT 0,
      clients_updated INTEGER DEFAULT 0,
      error_message TEXT
    );
  `);

  // Migrations for quotes table
  const quoteCols = (db.prepare("PRAGMA table_info(quotes)").all() as any[]).map((c: any) => c.name);
  if (!quoteCols.includes('profit_margin')) db.exec('ALTER TABLE quotes ADD COLUMN profit_margin REAL');
  if (!quoteCols.includes('quote_pdf_url')) db.exec('ALTER TABLE quotes ADD COLUMN quote_pdf_url TEXT');

  // Migrations for call_notes table
  const callCols = (db.prepare("PRAGMA table_info(call_notes)").all() as any[]).map((c: any) => c.name);
  for (const col of ['problems_addressed','next_step_actions','problems_resolved','wins','client_sentiment','agency_action_items','client_action_items']) {
    if (!callCols.includes(col)) db.exec(`ALTER TABLE call_notes ADD COLUMN ${col} TEXT`);
  }

  // Migrations for existing databases
  const cols = db.prepare("PRAGMA table_info(clients)").all() as any[];
  const colNames = cols.map((c) => c.name);
  if (!colNames.includes('ghl_custom_fields')) {
    db.exec('ALTER TABLE clients ADD COLUMN ghl_custom_fields TEXT');
  }
  if (!colNames.includes('share_token')) {
    db.exec('ALTER TABLE clients ADD COLUMN share_token TEXT');
  }
  if (!colNames.includes('daily_ad_spend')) {
    db.exec('ALTER TABLE clients ADD COLUMN daily_ad_spend REAL DEFAULT 0');
  }
  if (!colNames.includes('meta_access_token')) {
    db.exec('ALTER TABLE clients ADD COLUMN meta_access_token TEXT');
  }
  if (!colNames.includes('meta_ad_account_id')) {
    db.exec('ALTER TABLE clients ADD COLUMN meta_ad_account_id TEXT');
  }
  if (!colNames.includes('next_checkin')) {
    db.exec('ALTER TABLE clients ADD COLUMN next_checkin TEXT');
  }
  if (!colNames.includes('stage_contacted')) {
    db.exec('ALTER TABLE clients ADD COLUMN stage_contacted TEXT');
  }
  if (!colNames.includes('date_launched')) {
    db.exec('ALTER TABLE clients ADD COLUMN date_launched TEXT');
  }
  if (!colNames.includes('date_billed')) {
    db.exec('ALTER TABLE clients ADD COLUMN date_billed TEXT');
  }
  if (!colNames.includes('rebilling_date')) {
    db.exec('ALTER TABLE clients ADD COLUMN rebilling_date TEXT');
  }
  // Google Forms onboarding fields
  if (!colNames.includes('contact_name')) {
    db.exec('ALTER TABLE clients ADD COLUMN contact_name TEXT');
  }
  if (!colNames.includes('contact_email')) {
    db.exec('ALTER TABLE clients ADD COLUMN contact_email TEXT');
  }
  if (!colNames.includes('contact_phone')) {
    db.exec('ALTER TABLE clients ADD COLUMN contact_phone TEXT');
  }
  if (!colNames.includes('address')) {
    db.exec('ALTER TABLE clients ADD COLUMN address TEXT');
  }
  if (!colNames.includes('ein')) {
    db.exec('ALTER TABLE clients ADD COLUMN ein TEXT');
  }
  if (!colNames.includes('target_locations')) {
    db.exec('ALTER TABLE clients ADD COLUMN target_locations TEXT');
  }
  // 'pending' = came from form, needs setup. 'active' = fully configured.
  if (!colNames.includes('onboard_status')) {
    db.exec("ALTER TABLE clients ADD COLUMN onboard_status TEXT NOT NULL DEFAULT 'active'");
  }
  if (!colNames.includes('client_status')) {
    db.exec("ALTER TABLE clients ADD COLUMN client_status TEXT NOT NULL DEFAULT 'Active'");
  }
  if (!colNames.includes('internal_notes')) {
    db.exec('ALTER TABLE clients ADD COLUMN internal_notes TEXT');
  }
  if (!colNames.includes('cached_leads')) {
    db.exec('ALTER TABLE clients ADD COLUMN cached_leads INTEGER DEFAULT 0');
  }
  if (!colNames.includes('cached_inhome')) {
    db.exec('ALTER TABLE clients ADD COLUMN cached_inhome INTEGER DEFAULT 0');
  }
  if (!colNames.includes('checkin_count')) {
    db.exec('ALTER TABLE clients ADD COLUMN checkin_count INTEGER DEFAULT 0');
  }
  if (!colNames.includes('testimonial_collected')) {
    db.exec('ALTER TABLE clients ADD COLUMN testimonial_collected INTEGER DEFAULT 0');
  }

  // Seed agency GHL settings
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('agency_ghl_location_id', 'NqZup9jK9NOBs8GDIyuX')").run();
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('agency_ghl_pipeline_id', 'hDObd2e6pmi108UBHi15')").run();

  // Upsert primary admin account
  const primaryAdmin = db.prepare("SELECT id FROM users WHERE email = 'jesse@merovamedia.com'").get();
  const primaryHash = bcrypt.hashSync('Merova88*', 10);
  if (!primaryAdmin) {
    db.prepare('INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, ?, ?)').run(
      'jesse@merovamedia.com', primaryHash, 'admin', 'Jesse'
    );
  } else {
    db.prepare('UPDATE users SET password_hash = ?, role = ?, name = ? WHERE email = ?').run(
      primaryHash, 'admin', 'Jesse', 'jesse@merovamedia.com'
    );
  }
}
