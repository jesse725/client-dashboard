// Turns a free-text street address into coordinates for the Client Tracker's
// area map.
//
// Uses OpenStreetMap's Nominatim: free, no API key. Its usage policy
// (operations.osmfoundation.org/policies/nominatim) asks for an identifying
// User-Agent, at most one request per second, and cached results — hence the
// throttle below and the client_locations table. A 40-mile service radius
// doesn't need rooftop accuracy, so a city-level match is an acceptable last
// resort; it's flagged `approximate` so the UI can say so instead of implying a
// precise pin.

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'MerovaMedia-ClientDashboard/1.0 (client area map; dashboard.merovamedia.com)';
const MIN_GAP_MS = 1100;
const TIMEOUT_MS = 10_000;
// Nominatim's place_rank: 30 is a building, about 26 a street, 22 a neighbourhood.
// Under 20 it's a town, city, county or state — the street wasn't found and all
// we have is the general area.
const COARSE_RANK = 20;

export interface GeocodeHit {
  lat: number;
  lng: number;
  match: string; // how the geocoder describes what it found, so a wrong match is easy to spot
  approximate: boolean;
}

export type GeocodeResult =
  | { ok: true; hit: GeocodeHit }
  | { ok: false; reason: 'not_found' | 'error'; message: string };

// Google Form "paragraph" answers often arrive with line breaks and stray commas.
export function normalizeAddress(raw: string | null | undefined): string {
  return (raw ?? '')
    .replace(/\s*[\r\n]+\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/(\s*,\s*)+/g, ', ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .slice(0, 300);
}

// Queries to try, most specific first. Stops at the first that finds something.
function addressVariants(address: string): { q: string; cityLevel: boolean }[] {
  const out: { q: string; cityLevel: boolean }[] = [{ q: address, cityLevel: false }];

  // "Suite 200" / "Unit 4" / "#12" often stop a street address matching at all.
  const noUnit = normalizeAddress(
    address.replace(/[,\s]+(?:suite|ste\.?|unit|apt\.?|apartment|bldg\.?|building|floor|fl\.?|room|rm\.?|#)\s*#?\s*[\w-]+/gi, '')
  );
  if (noUnit && noUnit !== address) out.push({ q: noUnit, cityLevel: false });

  // Last resort: drop the street, keep "City, ST 12345" (a trailing country is
  // ignored when picking the tail).
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1 && /^(usa|u\.s\.a\.?|us|u\.s\.|united states( of america)?)$/i.test(parts[parts.length - 1])) parts.pop();
  const tail =
    parts.length >= 3 ? parts.slice(-2).join(', ')
    : parts.length === 2 && /^\d/.test(parts[0]) ? parts[1] // "123 Main St, Dallas TX 75201"
    : '';
  if (tail && !out.some((v) => v.q === tail)) out.push({ q: tail, cityLevel: true });

  return out;
}

// Serialises every lookup process-wide so two browser tabs (or a Retry during a
// batch) can never push past the geocoder's one-request-per-second limit.
let chain: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = lastCallAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
    return fn();
  });
  chain = run.catch(() => undefined);
  return run;
}

async function queryOnce(q: string): Promise<{ lat: number; lng: number; match: string; rank: number | null } | null> {
  const url = `${NOMINATIM_URL}?${new URLSearchParams({ q, format: 'jsonv2', limit: '1' })}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'Accept-Language': 'en' },
      signal: ctrl.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`the geocoder answered HTTP ${res.status}${res.status === 429 ? ' (rate limited)' : ''}`);
    const data = await res.json();
    const first = Array.isArray(data) ? data[0] : null;
    if (!first) return null;
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return {
      lat, lng,
      match: String(first.display_name ?? q).slice(0, 200),
      rank: typeof first.place_rank === 'number' ? first.place_rank : null,
    };
  } catch (e: any) {
    throw new Error(e?.name === 'AbortError' ? 'the geocoder timed out' : (e?.message ?? String(e)));
  } finally {
    clearTimeout(timer);
  }
}

export async function geocodeAddress(raw: string): Promise<GeocodeResult> {
  const address = normalizeAddress(raw);
  if (address.replace(/[^a-z0-9]/gi, '').length < 3) {
    return { ok: false, reason: 'not_found', message: 'There is no usable address to look up.' };
  }

  for (const variant of addressVariants(address)) {
    let hit;
    try {
      hit = await throttled(() => queryOnce(variant.q));
    } catch (e: any) {
      // A network/HTTP failure is not "address not found" — say so, and stop
      // rather than hammer a service that may be rate-limiting us.
      return { ok: false, reason: 'error', message: `Couldn't reach the map lookup service (${e?.message ?? e}).` };
    }
    if (hit) {
      return {
        ok: true,
        hit: {
          lat: hit.lat, lng: hit.lng, match: hit.match,
          approximate: variant.cityLevel || (hit.rank != null && hit.rank < COARSE_RANK),
        },
      };
    }
  }
  return { ok: false, reason: 'not_found', message: "That address couldn't be found — check it for typos, or add the city and state." };
}
