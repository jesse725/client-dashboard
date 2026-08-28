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

    CREATE TABLE IF NOT EXISTS sales_weekly (
      week_start TEXT PRIMARY KEY,
      ad_spend REAL DEFAULT 0,
      cash_collected REAL DEFAULT 0,
      total_ltv REAL DEFAULT 0,
      qualified_calls INTEGER DEFAULT 0,
      booked_ad INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lead_dispositions (
      opp_id TEXT PRIMARY KEY,
      showed INTEGER,
      qualified INTEGER,
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

  // Migrations for sales_weekly table
  const salesWeeklyCols = (db.prepare("PRAGMA table_info(sales_weekly)").all() as any[]).map((c: any) => c.name);
  if (!salesWeeklyCols.includes('booked_ad')) db.exec('ALTER TABLE sales_weekly ADD COLUMN booked_ad INTEGER DEFAULT 0');

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
  if (!colNames.includes('ad_account_url')) {
    db.exec('ALTER TABLE clients ADD COLUMN ad_account_url TEXT');
  }

  // Issues & Solutions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS issues_solutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      date TEXT NOT NULL DEFAULT (date('now')),
      issue TEXT NOT NULL,
      solution TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Income & Earnings tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS startup_funds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      allocated REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expense_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('subscription','payroll','other')),
      monthly_amount REAL NOT NULL DEFAULT 0,
      next_review_date TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expense_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('other','startup_fund')),
      fund_id INTEGER REFERENCES startup_funds(id) ON DELETE SET NULL,
      amount REAL NOT NULL DEFAULT 0,
      date TEXT NOT NULL DEFAULT (date('now')),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Per-month override for a recurring item's amount. A month with no row here
    -- carries forward the most recent prior month's value (or the item's base
    -- monthly_amount if it's never been set) — editing one month never touches
    -- another.
    CREATE TABLE IF NOT EXISTS expense_monthly_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES expense_items(id) ON DELETE CASCADE,
      month TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      UNIQUE(item_id, month)
    );

    -- Manual override for a month's Revenue or Ad Spend, when the live
    -- Whop/Meta figure is missing, wrong, or just not trusted for that month.
    -- A month with no row here uses the live-fetched value.
    CREATE TABLE IF NOT EXISTS income_monthly_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      field TEXT NOT NULL CHECK(field IN ('revenue','adSpend')),
      amount REAL NOT NULL DEFAULT 0,
      UNIQUE(month, field)
    );

    -- Payroll: employees log in directly against this table by email (same
    -- pattern as the clients table — no users-table row needed), so setting
    -- active to 0 both hides them from admin lists and blocks their login.
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      base_amount_per_period REAL NOT NULL DEFAULT 0,
      per_client_fee REAL NOT NULL DEFAULT 0,
      revenue_share_pct REAL NOT NULL DEFAULT 0,
      hourly_bonus_rate REAL NOT NULL DEFAULT 0,
      hourly_bonus_threshold_minutes INTEGER NOT NULL DEFAULT 60,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- One row per employee per payout date. base_amount is a SNAPSHOT of
    -- base_amount_per_period at the moment the period was first created, so
    -- editing an employee's rate later never rewrites payroll history.
    CREATE TABLE IF NOT EXISTS pay_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      payout_date TEXT NOT NULL,
      base_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid')),
      paid_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(employee_id, payout_date)
    );

    -- totalAmount is deliberately NOT stored — always base_amount + SUM(amount)
    -- computed at read time, so it can never drift from its line items.
    CREATE TABLE IF NOT EXISTS pay_period_bonuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pay_period_id INTEGER NOT NULL REFERENCES pay_periods(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      added_by TEXT,
      added_at TEXT DEFAULT (datetime('now'))
    );

    -- One row per actual payment event, kept even if the period is later
    -- un-marked-paid — a genuine ledger rather than a single overwritable
    -- status flag, so "was this ever paid, how, and when" is never lost.
    CREATE TABLE IF NOT EXISTS payment_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pay_period_id INTEGER NOT NULL REFERENCES pay_periods(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      method TEXT NOT NULL DEFAULT 'bank_transfer',
      reference TEXT,
      notes TEXT,
      paid_at TEXT NOT NULL DEFAULT (date('now')),
      recorded_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migrations for employees table — must run after the block above, since
  // that's where the table itself is first created.
  const employeeCols = (db.prepare("PRAGMA table_info(employees)").all() as any[]).map((c: any) => c.name);
  if (!employeeCols.includes('payment_method')) db.exec("ALTER TABLE employees ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'bank_transfer'");
  if (!employeeCols.includes('agreement_url')) db.exec('ALTER TABLE employees ADD COLUMN agreement_url TEXT');
  // Who's assigned to own this employee's payroll card — a plain display
  // name (an admin's or another staff member's), not a hard FK, since the
  // picker sources from two different tables (users + employees).
  if (!employeeCols.includes('assigned_to')) db.exec('ALTER TABLE employees ADD COLUMN assigned_to TEXT');

  seedPayrollData(db);
  seedIncomeData(db);

  // Seed agency GHL settings
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('agency_ghl_location_id', 'NqZup9jK9NOBs8GDIyuX')").run();
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('agency_ghl_pipeline_id', 'hDObd2e6pmi108UBHi15')").run();

  // Upsert Juan's client login
  const juanClient = db.prepare(
    `SELECT id FROM clients WHERE LOWER(contact_email) = 'juancarlo502@yahoo.com' OR LOWER(name) LIKE '%juan%' ORDER BY id LIMIT 1`
  ).get() as any;
  if (juanClient) {
    const juanEmail = 'juancarlo502@yahoo.com';
    const juanHash = bcrypt.hashSync(juanEmail, 10);
    const juanUser = db.prepare("SELECT id FROM users WHERE email = ?").get(juanEmail) as any;
    if (!juanUser) {
      db.prepare("INSERT INTO users (email, password_hash, role, client_id, name) VALUES (?, ?, 'client', ?, 'Juan')").run(juanEmail, juanHash, juanClient.id);
    } else {
      db.prepare("UPDATE users SET client_id = ?, role = 'client', password_hash = ? WHERE email = ?").run(juanClient.id, juanHash, juanEmail);
    }
  }

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

// One-time seed of the starter payroll roster. Figures are unverified against
// signed contracts — flagged both here and in each employee's notes field so
// the warning surfaces in the UI itself, not just in chat. Only runs if the
// table is still empty, so it never overwrites real edits.
function seedPayrollData(db: Database.Database) {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM employees').get() as any).c;
  if (count > 0) return;

  const UNVERIFIED = '⚠️ Seed figure from a planning conversation — confirm against the signed contract before relying on this for real payroll.';
  const roster: { name: string; role: string; email: string; base: number; perClientFee?: number; revSharePct?: number; notes?: string }[] = [
    { name: 'Vojtech', role: 'Media Buyer', email: 'vojtech@example.invalid', base: 400 },
    {
      name: 'Mo', role: 'CSM', email: 'mo@example.invalid', base: 75, revSharePct: 5,
      notes: '5% revenue share applies after a 3-month client renewal; also gets a ~$90 one-time renewal bonus. Neither is a fixed per-period amount — log both as bonus items in the period actually earned.',
    },
    { name: 'Bolu', role: 'Onboarding VA / A2P', email: 'bolu@example.invalid', base: 150, perClientFee: 50 },
    { name: 'Renz', role: 'Automations / GHL', email: 'renz@example.invalid', base: 175 },
    { name: 'Mea', role: 'Creative / Design', email: 'mea@example.invalid', base: 100 },
    { name: 'Appointment Setter', role: 'Speed-to-lead / calls', email: 'appointmentsetter@example.invalid', base: 250 },
  ];

  const insert = db.prepare(`
    INSERT INTO employees (name, role, email, base_amount_per_period, per_client_fee, revenue_share_pct, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const e of roster) {
    const notes = [UNVERIFIED, e.notes].filter(Boolean).join(' ');
    insert.run(e.name, e.role, e.email, e.base, e.perClientFee ?? 0, e.revSharePct ?? 0, notes);
  }
}

// One-time seed from the Merova Media Income Tracker spreadsheet (cycle start Jul-2026).
// Only runs if the tables are still empty, so it never overwrites real edits.
function seedIncomeData(db: Database.Database) {
  const fundCount = (db.prepare('SELECT COUNT(*) AS c FROM startup_funds').get() as any).c;
  if (fundCount === 0) {
    db.prepare("INSERT INTO startup_funds (name, allocated, notes) VALUES ('Course Fund', 2500, 'One-time course purchase, seeded from startup capital')").run();
    db.prepare("INSERT INTO startup_funds (name, allocated, notes) VALUES ('Ad Spend Fund', 5000, 'Draw down as ad spend is logged against this fund')").run();

    const courseFund = db.prepare("SELECT id FROM startup_funds WHERE name = 'Course Fund'").get() as any;
    db.prepare(
      "INSERT INTO expense_entries (name, category, fund_id, amount, date, notes) VALUES ('Course', 'startup_fund', ?, 2500, '2026-07-01', 'Seeded from spreadsheet')"
    ).run(courseFund.id);
  }

  const itemCount = (db.prepare('SELECT COUNT(*) AS c FROM expense_items').get() as any).c;
  if (itemCount === 0) {
    const subscriptions: [string, number][] = [
      ['GHL Base Sub', 297], ['ChatGPT', 25], ['Google Workspace', 25], ['Canva', 21],
      ['Slack', 12], ['GHL Messaging & Phone', 60], ['Loom', 22], ['Claude', 25],
      ['Kling', 30], ['Notion', 12], ['Teleprompter', 19],
    ];
    const payroll: [string, number][] = [
      ['B2B 1 Editor (Paki)', 220], ['B2B 2 Editor', 250], ['B2C Creator', 185],
      ['Ops Guy', 600], ['Media Buyer', 400], ['CSM', 0],
    ];
    const insert = db.prepare("INSERT INTO expense_items (name, category, monthly_amount) VALUES (?, ?, ?)");
    for (const [name, amount] of subscriptions) insert.run(name, 'subscription', amount);
    for (const [name, amount] of payroll) insert.run(name, 'payroll', amount);
  }
}
