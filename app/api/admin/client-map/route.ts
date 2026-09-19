import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { geocodeAddress, normalizeAddress } from '@/lib/geocode';
import type { MapClient } from '@/types';

// Backs the Client Tracker's "Map" tab. GET never calls the geocoder — it reports
// what's already saved. POST does the lookups, a few per request, so the page can
// show pins as they resolve and no single request runs long (the geocoder is
// throttled to about one lookup a second).

const BATCH_SIZE = 4;
// A network/rate-limit failure is worth another go after a while; "address not
// found" is not — that only changes when the address is edited or Retry is pressed.
const RETRY_ERRORS_AFTER_MS = 10 * 60 * 1000;

interface DbRow {
  id: number;
  name: string;
  contact_name: string | null;
  address: string | null;
  loc_address: string | null;
  loc_status: 'ok' | 'not_found' | 'error' | null;
  lat: number | null;
  lng: number | null;
  match: string | null;
  approximate: number | null;
  error: string | null;
  checked_at: string | null;
}

// Active clients only: still-onboarding placeholders aren't clients yet and a
// churned client no longer holds an area.
const ROWS_SQL = `
  SELECT c.id, c.name, c.contact_name, c.address,
         l.address AS loc_address, l.status AS loc_status, l.lat, l.lng,
         l.match, l.approximate, l.error, l.checked_at
  FROM clients c
  LEFT JOIN client_locations l ON l.client_id = c.id
  WHERE c.onboard_status != 'pending' AND c.client_status != 'Churned'
`;
const ORDER = ' ORDER BY c.name COLLATE NOCASE';

function isStale(checkedAt: string | null): boolean {
  if (!checkedAt) return true;
  return Date.now() - Date.parse(checkedAt.replace(' ', 'T') + 'Z') > RETRY_ERRORS_AFTER_MS;
}

function toClient(r: DbRow): MapClient {
  const address = normalizeAddress(r.address);
  const base = {
    id: r.id, company: r.name, contact: r.contact_name?.trim() || null, address: address || null,
    lat: null, lng: null, match: null, approximate: false, message: null,
  };
  if (!address) return { ...base, status: 'no_address', message: 'No address on file.' };

  // What we have saved only counts if it was looked up for this exact address.
  if (!r.loc_status || r.loc_address !== address) return { ...base, status: 'pending' };
  if (r.loc_status === 'ok' && r.lat != null && r.lng != null) {
    return { ...base, status: 'ok', lat: r.lat, lng: r.lng, match: r.match, approximate: !!r.approximate };
  }
  if (r.loc_status === 'error' && isStale(r.checked_at)) return { ...base, status: 'pending' };
  return { ...base, status: r.loc_status === 'error' ? 'error' : 'not_found', message: r.error };
}

function allClients(): MapClient[] {
  return (getDb().prepare(ROWS_SQL + ORDER).all() as DbRow[]).map(toClient);
}

function oneClient(id: number): MapClient | null {
  const row = getDb().prepare(ROWS_SQL + ' AND c.id = ?').get(id) as DbRow | undefined;
  return row ? toClient(row) : null;
}

// Looks the client's current address up and saves the outcome — including a
// "not found", so a bad address isn't re-queried on every page view.
async function locate(id: number) {
  const db = getDb();
  const row = db.prepare('SELECT address FROM clients WHERE id = ?').get(id) as { address: string | null } | undefined;
  const address = normalizeAddress(row?.address);
  if (!address) return;

  const result = await geocodeAddress(address);
  const [status, lat, lng, match, approximate, error] = result.ok
    ? ['ok', result.hit.lat, result.hit.lng, result.hit.match, result.hit.approximate ? 1 : 0, null]
    : [result.reason, null, null, null, 0, result.message];
  if (!result.ok) console.error(`[map] client #${id}: ${result.reason} — ${result.message}`);

  db.prepare(`
    INSERT INTO client_locations (client_id, address, status, lat, lng, match, approximate, error, checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(client_id) DO UPDATE SET
      address = excluded.address, status = excluded.status, lat = excluded.lat, lng = excluded.lng,
      match = excluded.match, approximate = excluded.approximate, error = excluded.error,
      checked_at = excluded.checked_at
  `).run(id, address, status, lat, lng, match, approximate, error);
}

// Lookups already underway (e.g. from a second open tab) — skip rather than repeat.
const inFlight = new Set<number>();
async function locateOnce(id: number) {
  if (inFlight.has(id)) return;
  inFlight.add(id);
  try { await locate(id); } finally { inFlight.delete(id); }
}

async function isAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  return !!session && (session.user as any)?.role === 'admin';
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const clients = allClients();
  return NextResponse.json({ clients, pending: clients.filter((c) => c.status === 'pending').length });
}

// { id, address? } — save a new address (optional) and look that client up now.
// {}               — look up the next few clients that still need it.
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const db = getDb();

    if (body?.id != null) {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
      if (!db.prepare('SELECT 1 FROM clients WHERE id = ?').get(id)) {
        return NextResponse.json({ error: 'Client not found' }, { status: 404 });
      }
      if ('address' in body) {
        if (body.address != null && typeof body.address !== 'string') {
          return NextResponse.json({ error: 'address must be text' }, { status: 400 });
        }
        db.prepare('UPDATE clients SET address = ? WHERE id = ?').run(normalizeAddress(body.address) || null, id);
      }
      await locateOnce(id);
      return NextResponse.json({ clients: [oneClient(id)].filter(Boolean), remaining: allClients().filter((c) => c.status === 'pending').length });
    }

    const batch = allClients().filter((c) => c.status === 'pending' && !inFlight.has(c.id)).slice(0, BATCH_SIZE);
    for (const c of batch) await locateOnce(c.id);
    const updated = batch.map((c) => oneClient(c.id)).filter(Boolean);
    return NextResponse.json({ clients: updated, remaining: allClients().filter((c) => c.status === 'pending').length });
  } catch (e: any) {
    console.error(`[map] ${e?.message ?? e}`);
    return NextResponse.json({ error: e?.message ?? 'Something went wrong' }, { status: 500 });
  }
}
