// Setup script for Smart Wire AV Systems
// Run with: node scripts/setup-smartwire.js

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'dashboard.db');

if (!fs.existsSync(DB_PATH)) {
  console.error('❌  Database not found at', DB_PATH);
  console.error('    Start the app first (npm run dev) so the DB gets created.');
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

// ── 1. Read agency key from DB ──────────────────────────────────────────────
const agencyKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'ghl_agency_key'").get();
if (!agencyKeyRow) {
  console.error('❌  No agency API key found in settings.');
  console.error('    Go to http://localhost:3000/admin → GHL Sync → paste your agency key and save.');
  process.exit(1);
}
const AGENCY_KEY = agencyKeyRow.value;
const LOCATION_ID = 'ZJqSzUdBgcWGGCFcgQ3d';

// Stage name → funnel slot mapping (in order of priority)
const STAGE_MAP = {
  leads: ['new lead'],
  unqualified: ['unqualified'],
  phone: ['discovery call booked', 'discovery call', 'booked call'],
  inhome: ['in person quote scheduled', 'in-person quote', 'in home', 'in-home', 'quote scheduled'],
};

async function main() {
  console.log('\n🔑  Exchanging agency token for location token…\n');

  // ── 2. Exchange agency PIT for location-scoped token ─────────────────────
  let locationToken = AGENCY_KEY; // fallback: try agency key directly

  const tokenRes = await fetch('https://services.leadconnectorhq.com/oauth/locationToken', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AGENCY_KEY}`,
      Version: '2021-07-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ locationId: LOCATION_ID }),
  });

  if (tokenRes.ok) {
    const tokenData = await tokenRes.json();
    locationToken = tokenData.access_token ?? tokenData.token ?? AGENCY_KEY;
    console.log('✓   Got location-scoped token\n');
  } else {
    const txt = await tokenRes.text();
    console.log(`⚠️   Location token exchange failed (${tokenRes.status}): ${txt}`);
    console.log('    Trying with agency key directly…\n');
  }

  console.log('🔍  Fetching pipelines for location', LOCATION_ID, '…\n');

  // ── 3. Fetch pipelines ────────────────────────────────────────────────────
  const res = await fetch(`https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${LOCATION_ID}`, {
    headers: {
      Authorization: `Bearer ${locationToken}`,
      Version: '2021-07-28',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`❌  GHL API error ${res.status}:`, text);
    process.exit(1);
  }

  const data = await res.json();
  const pipelines = data.pipelines ?? [];

  if (pipelines.length === 0) {
    console.error('❌  No pipelines found for this location. Check the location ID and agency key.');
    process.exit(1);
  }

  console.log(`✓   Found ${pipelines.length} pipeline(s):`);
  pipelines.forEach((p, i) => console.log(`    [${i}] ${p.name} (${p.id}) — ${p.stages?.length ?? 0} stages`));

  // Pick "New prospect" pipeline, or first one if not found
  const pipeline =
    pipelines.find(p => p.name.toLowerCase().includes('new prospect')) ??
    pipelines.find(p => p.name.toLowerCase().includes('prospect')) ??
    pipelines[0];

  console.log(`\n✓   Using pipeline: "${pipeline.name}" (${pipeline.id})`);
  console.log('\n    Stages:');
  (pipeline.stages ?? []).forEach(s => console.log(`      "${s.name}" → ${s.id}`));

  // ── 3. Auto-map stages by name ────────────────────────────────────────────
  const resolved = { leads: null, unqualified: null, phone: null, inhome: null };

  for (const stage of (pipeline.stages ?? [])) {
    const n = stage.name.toLowerCase().trim();
    for (const [slot, patterns] of Object.entries(STAGE_MAP)) {
      if (!resolved[slot] && patterns.some(p => n.includes(p))) {
        resolved[slot] = stage.id;
        console.log(`\n✓   Mapped "${stage.name}" → ${slot}`);
      }
    }
  }

  console.log('\n    Final stage mapping:');
  for (const [slot, id] of Object.entries(resolved)) {
    const stage = (pipeline.stages ?? []).find(s => s.id === id);
    console.log(`      ${slot.padEnd(12)} → ${stage ? `"${stage.name}"` : '⚠️  NOT MAPPED'} (${id ?? 'null'})`);
  }

  // ── 4. Upsert Smart Wire AV client ────────────────────────────────────────
  const existing = db.prepare('SELECT id FROM clients WHERE ghl_location_id = ?').get(LOCATION_ID);

  const START_DATE = '2026-06-25';
  const RETAINER = 1750;
  const DAILY_SPEND = 50;

  // Total ad spend = daily × days running (day 1 today)
  const startMs = new Date(START_DATE).getTime();
  const daysRunning = Math.max(1, Math.ceil((Date.now() - startMs) / 86400000));
  const adSpend = DAILY_SPEND * daysRunning;

  const token = crypto.randomBytes(24).toString('hex');

  if (existing) {
    db.prepare(`
      UPDATE clients SET
        ghl_pipeline_id = ?,
        stage_leads = ?,
        stage_unqualified = ?,
        stage_phone = ?,
        stage_inhome = ?,
        retainer_price = ?,
        ad_spend = ?,
        daily_ad_spend = ?,
        start_date = ?,
        share_token = COALESCE(share_token, ?)
      WHERE id = ?
    `).run(
      pipeline.id,
      resolved.leads, resolved.unqualified, resolved.phone, resolved.inhome,
      RETAINER, adSpend, DAILY_SPEND, START_DATE, token,
      existing.id
    );
    console.log(`\n✓   Updated existing client (id ${existing.id})`);
  } else {
    // Build unique slug
    let slug = 'smart-wire-av-systems';
    let i = 2;
    while (db.prepare('SELECT id FROM clients WHERE slug = ?').get(slug)) slug = `smart-wire-av-systems-${i++}`;

    db.prepare(`
      INSERT INTO clients (
        name, slug, ghl_api_key, ghl_location_id, ghl_pipeline_id,
        stage_leads, stage_unqualified, stage_phone, stage_inhome,
        retainer_price, ad_spend, daily_ad_spend, start_date, share_token
      ) VALUES (?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'Smart Wire AV Systems', slug, LOCATION_ID, pipeline.id,
      resolved.leads, resolved.unqualified, resolved.phone, resolved.inhome,
      RETAINER, adSpend, DAILY_SPEND, START_DATE, token
    );
    console.log('\n✓   Created Smart Wire AV Systems client');
  }

  const client = db.prepare('SELECT id, share_token FROM clients WHERE ghl_location_id = ?').get(LOCATION_ID);

  console.log('\n' + '─'.repeat(60));
  console.log('✅  Smart Wire AV Systems is ready!\n');
  console.log(`    Dashboard:  http://localhost:3000/dashboard/${client.id}`);
  console.log(`    Share link: http://localhost:3000/c/${client.share_token}`);
  console.log('\n    Paste the share link into GHL → Sub-account Settings →');
  console.log('    Custom Menu Links → Add Link (open in iframe).');
  console.log('─'.repeat(60) + '\n');
}

main().catch(err => {
  console.error('❌  Unexpected error:', err.message);
  process.exit(1);
});
