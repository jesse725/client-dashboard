'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as LeafletMap, LayerGroup, Circle, CircleMarker, Tooltip } from 'leaflet';
import { AlertTriangle, Check, Eye, EyeOff, Loader2, Maximize2, MapPin, Pencil, RefreshCw } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import type { MapClient } from '@/types';

// The Client Tracker's "Map" tab: every active client's address as a pin with a
// 40-mile service-area ring, labelled with the company and contact name. Clients
// that can't be placed are listed with the reason and can be fixed in place —
// they used to just be left off, which would read as "no clients there".

const RADIUS_MILES = 40;
const RADIUS_METERS = RADIUS_MILES * 1609.344;
const PALETTE = ['#0d9b6e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#84cc16', '#06b6d4', '#a855f7', '#eab308'];
const US_CENTER: [number, number] = [39.5, -98.35];
const LABEL_LIFT = 10; // px between a pin and the bottom of its label
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function textEl(tag: string, text: string, className?: string): HTMLElement {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}

// Built as DOM nodes with textContent — company/contact/address are free text
// and must never be interpreted as HTML.
function labelEl(c: MapClient): HTMLElement {
  const wrap = document.createElement('div');
  wrap.appendChild(textEl('strong', c.company));
  if (c.contact) wrap.appendChild(textEl('span', c.contact));
  return wrap;
}

function popupEl(c: MapClient): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'client-map-popup-body';
  wrap.appendChild(textEl('strong', c.company));
  if (c.contact) wrap.appendChild(textEl('div', c.contact));
  if (c.address) wrap.appendChild(textEl('div', c.address, 'cm-addr'));
  if (c.match) wrap.appendChild(textEl('div', `Pinned at: ${c.match}`, 'cm-match'));
  if (c.approximate) wrap.appendChild(textEl('div', 'Approximate — only the city could be matched', 'cm-approx'));
  const link = textEl('a', 'Open client dashboard →') as HTMLAnchorElement;
  link.href = `/dashboard/${c.id}`;
  wrap.appendChild(link);
  return wrap;
}

type Shapes = { circle: Circle; marker: CircleMarker };

export default function ClientAreaMap() {
  const [clients, setClients] = useState<MapClient[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [zoom, setZoom] = useState(4);
  // Address edits: a draft per client, which mapped client is being edited, and
  // which one is mid-save (a save also looks the address up, so it takes a moment).
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const shapesRef = useRef<Map<number, Shapes>>(new Map());
  const fittedRef = useRef(false);
  // A client just saved from the list: zoom to them once their ring has been drawn.
  const focusAfterDraw = useRef<number | null>(null);

  // Stable colour per client (by id) so a ring keeps its colour as others come and go.
  const colorOf = useMemo(() => {
    const m = new Map<number, string>();
    [...clients].sort((a, b) => a.id - b.id).forEach((c, i) => m.set(c.id, PALETTE[i % PALETTE.length]));
    return m;
  }, [clients]);

  const merge = useCallback((updated: MapClient[]) => {
    if (updated.length === 0) return;
    const byId = new Map(updated.map((u) => [u.id, u]));
    setClients((cs) => cs.map((c) => byId.get(c.id) ?? c));
  }, []);

  // ── Map setup / teardown ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;
    (async () => {
      const mod: any = await import('leaflet');
      const L: typeof import('leaflet') = mod.default ?? mod;
      if (cancelled || !containerRef.current) return;
      leafletRef.current = L;
      map = L.map(containerRef.current, { zoomSnap: 0.5, minZoom: 3, worldCopyJump: true }).setView(US_CENTER, 4);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      }).addTo(map);
      L.control.scale({ imperial: true, metric: false, position: 'bottomleft' }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setMapReady(true);
    })();
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      layerRef.current = null;
      shapesRef.current.clear();
      setMapReady(false);
    };
  }, []);

  // ── Load clients, then look up any that haven't been located yet ───────────
  const locateAll = useCallback(async (isCancelled: () => boolean) => {
    setLocating(true);
    try {
      // Bounded, so a server that keeps reporting work left can't spin this forever.
      for (let i = 0; i < 60 && !isCancelled(); i++) {
        const res = await fetch('/api/admin/client-map', { method: 'POST', headers: JSON_HEADERS, body: '{}' });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.clients) throw new Error(data?.error ?? `the server returned ${res.status}`);
        if (isCancelled()) return;
        merge(data.clients);
        if (!data.remaining) break;
        // Nothing to do this round means another tab is already locating the rest.
        if (data.clients.length === 0) await sleep(1500);
      }
    } catch (e: any) {
      if (!isCancelled()) setError(`Couldn't finish locating clients — ${e?.message ?? e}`);
    } finally {
      if (!isCancelled()) setLocating(false);
    }
  }, [merge]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/client-map');
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.clients) throw new Error(data?.error ?? `the server returned ${res.status}`);
        if (cancelled) return;
        setClients(data.clients);
        setLoaded(true);
        if (data.pending > 0) await locateAll(() => cancelled);
      } catch (e: any) {
        if (!cancelled) { setError(`Couldn't load the client list — ${e?.message ?? e}`); setLoaded(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [locateAll]);

  // ── Draw pins, rings and labels whenever the data changes ──────────────────
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const group = layerRef.current;
    if (!mapReady || !L || !map || !group) return;

    group.clearLayers();
    shapesRef.current.clear();

    for (const c of clients) {
      if (c.status !== 'ok' || c.lat == null || c.lng == null) continue;
      const color = colorOf.get(c.id) ?? PALETTE[0];

      const circle = L.circle([c.lat, c.lng], {
        radius: RADIUS_METERS, color, weight: 2, opacity: 0.9, fillColor: color, fillOpacity: 0.12, interactive: false,
      }).addTo(group);
      const marker = L.circleMarker([c.lat, c.lng], { radius: 5, color: '#ffffff', weight: 1.5, fillColor: color, fillOpacity: 1 })
        .bindTooltip(labelEl(c), {
          permanent: showLabels, direction: 'top', offset: [0, -LABEL_LIFT], className: 'client-map-label', opacity: 1,
        })
        .bindPopup(popupEl(c), { className: 'client-map-popup', maxWidth: 280 })
        .on('click', () => setSelectedId(c.id))
        .addTo(group);
      shapesRef.current.set(c.id, { circle, marker });
    }

    // Frame everything once, when the first full set of pins is in.
    if (!fittedRef.current && !locating && shapesRef.current.size > 0) {
      fittedRef.current = true;
      fitAll();
    }
    layoutLabels();
    if (focusAfterDraw.current != null) {
      const id = focusAfterDraw.current;
      focusAfterDraw.current = null;
      if (shapesRef.current.has(id)) focusClient(id);
    }
    // fitAll/focusClient only read refs, so they are intentionally not dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, clients, showLabels, locating, colorOf]);

  // Emphasise the ring of the client picked in the list.
  useEffect(() => {
    for (const [id, s] of shapesRef.current) {
      s.circle.setStyle(id === selectedId ? { weight: 3.5, fillOpacity: 0.24 } : { weight: 2, fillOpacity: 0.12 });
    }
  }, [selectedId, clients, mapReady, showLabels, locating]);

  // Labels are wider than the gaps between nearby pins, so two clients in the same
  // town (or a few in one region at a low zoom) would print on top of each other and
  // hide a client. Working south to north, each label keeps its spot unless it
  // would cover one already placed, in which case it rises above that one.
  function layoutLabels() {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const items: { tip: Tooltip; x: number; y: number; w: number; h: number }[] = [];
    for (const s of shapesRef.current.values()) {
      const tip = s.marker.getTooltip();
      const el = tip?.getElement();
      if (!tip || !el) continue; // labels hidden: nothing on screen to position
      const p = map.latLngToContainerPoint(s.marker.getLatLng());
      items.push({ tip, x: p.x, y: p.y, w: el.offsetWidth, h: el.offsetHeight });
    }
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
    for (const it of items) {
      let lift = LABEL_LIFT;
      for (let guard = 0; guard < 20; guard++) {
        const box = { x0: it.x - it.w / 2, x1: it.x + it.w / 2, y0: it.y - lift - it.h, y1: it.y - lift };
        const hit = placed.find((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0);
        if (!hit) { placed.push(box); break; }
        lift = it.y - hit.y0 + 3;
      }
      it.tip.options.offset = L.point(0, -lift);
      it.tip.update();
    }
  }

  // Positions depend on the zoom, so redo them whenever it changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const onZoom = () => { setZoom(map.getZoom()); layoutLabels(); };
    map.on('zoomend', onZoom);
    return () => { map.off('zoomend', onZoom); };
    // layoutLabels only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  function fitAll() {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || shapesRef.current.size === 0) return;
    map.closePopup();
    const bounds = L.latLngBounds([]);
    for (const s of shapesRef.current.values()) bounds.extend(s.circle.getBounds());
    // Extra room top and sides: the name labels sit above the pins and are wider
    // than the rings, so a pin near the edge would otherwise have its label cut off.
    map.fitBounds(bounds, { paddingTopLeft: [90, 80], paddingBottomRight: [90, 40], maxZoom: 9 });
  }

  function focusClient(id: number) {
    const s = shapesRef.current.get(id);
    const map = mapRef.current;
    if (!s || !map) return;
    setSelectedId(id);
    map.flyToBounds(s.circle.getBounds(), { padding: [30, 30], maxZoom: 10, duration: 0.8 });
    s.marker.openPopup();
  }

  // Save a new/changed address (when given) and look it up. `address` omitted =
  // just retry the one already on file.
  async function locateOne(id: number, address?: string) {
    setSavingId(id);
    setRowErrors((e) => ({ ...e, [id]: '' }));
    try {
      const res = await fetch('/api/admin/client-map', {
        method: 'POST', headers: JSON_HEADERS,
        body: JSON.stringify(address === undefined ? { id } : { id, address }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.clients?.[0]) throw new Error(data?.error ?? `the server returned ${res.status}`);
      merge(data.clients);
      setEditingId(null);
      setDrafts((d) => { const { [id]: _gone, ...rest } = d; return rest; });
      if (data.clients[0].status === 'ok') { fittedRef.current = true; focusAfterDraw.current = id; }
    } catch (e: any) {
      setRowErrors((errs) => ({ ...errs, [id]: `Couldn't save — ${e?.message ?? e}` }));
    } finally {
      setSavingId(null);
    }
  }

  const onMap = clients.filter((c) => c.status === 'ok');
  const needsAttention = clients.filter((c) => c.status !== 'ok');
  const pendingCount = clients.filter((c) => c.status === 'pending').length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h2 className="font-semibold flex items-center gap-2"><MapPin size={16} style={{ color: 'var(--accent)' }} /> Client area map</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Each ring is a {RADIUS_MILES}-mile radius around the client's address.
            {loaded && ` ${onMap.length} of ${clients.length} active client${clients.length === 1 ? '' : 's'} on the map.`}
            {/* A 40-mile ring is only a few pixels wide on a country-wide view, which reads as "no ring" */}
            {onMap.length > 0 && zoom < 6 && ' Zoom in, or pick a client in the list, to see each ring at full size.'}
          </p>
        </div>
        {(locating || pendingCount > 0) && !error && (
          <span className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
            <Loader2 size={13} className="animate-spin" /> Locating {pendingCount} client{pendingCount === 1 ? '' : 's'} — only needed the first time, results are saved
          </span>
        )}
      </div>

      {error && (
        <div className="card p-3 mb-3 flex items-start gap-2 text-sm" style={{ borderColor: 'var(--red)' }}>
          <AlertTriangle size={15} className="shrink-0 mt-0.5" style={{ color: 'var(--red)' }} />
          <span style={{ color: 'var(--red)' }}>{error}</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        {/* isolation: Leaflet's internal z-indexes (up to 1000) must not climb over the sticky nav */}
        <div className="card overflow-hidden relative" style={{ isolation: 'isolate' }}>
          <div ref={containerRef} className="client-map" role="application" aria-label="Map of client service areas"
            style={{ height: 'calc(100vh - 230px)', minHeight: 460 }} />
          <div className="absolute top-3 right-3 flex flex-col gap-1.5" style={{ zIndex: 1000 }}>
            <button onClick={() => setShowLabels((v) => !v)} className="btn-ghost text-xs flex items-center gap-1.5"
              style={{ padding: '6px 10px', background: 'var(--surface)' }} title="Show or hide the name labels">
              {showLabels ? <EyeOff size={13} /> : <Eye size={13} />} Labels
            </button>
            <button onClick={fitAll} className="btn-ghost text-xs flex items-center gap-1.5"
              style={{ padding: '6px 10px', background: 'var(--surface)' }} title="Zoom to show every client">
              <Maximize2 size={13} /> Fit all
            </button>
          </div>
        </div>

        <aside className="card overflow-y-auto" style={{ maxHeight: 'calc(100vh - 230px)', minHeight: 200 }}>
          {!loaded && <p className="p-4 text-sm" style={{ color: 'var(--text-muted)' }}>Loading clients…</p>}
          {loaded && clients.length === 0 && !error && (
            <p className="p-4 text-sm" style={{ color: 'var(--text-muted)' }}>No active clients yet.</p>
          )}

          {needsAttention.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--yellow)' }}>
                Not on the map ({needsAttention.length})
              </p>
              {onMap.length === 0 && !locating && needsAttention.every((c) => c.status === 'no_address') && (
                <p className="px-4 pb-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  None of your clients have an address saved yet. Type one in below and it goes straight onto the map.
                </p>
              )}
              {needsAttention.map((c) => (
                <div key={c.id} className="px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-sm font-medium truncate">{c.company}</p>
                  {c.contact && <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{c.contact}</p>}
                  {c.status === 'pending' ? (
                    <p className="text-xs mt-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                      <Loader2 size={11} className="animate-spin" /> Looking up location…
                    </p>
                  ) : (
                    <>
                      <p className="text-xs mt-1.5" style={{ color: c.status === 'no_address' ? 'var(--text-muted)' : 'var(--red)' }}>{c.message}</p>
                      <form className="mt-2 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); locateOne(c.id, drafts[c.id] ?? c.address ?? ''); }}>
                        <input className="input text-xs" style={{ padding: '6px 8px' }} placeholder="Street, City, State ZIP"
                          value={drafts[c.id] ?? c.address ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))} />
                        <button type="submit" disabled={savingId === c.id || !(drafts[c.id] ?? c.address ?? '').trim()}
                          className="btn-primary text-xs shrink-0 flex items-center gap-1" style={{ padding: '6px 10px' }}>
                          {savingId === c.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
                        </button>
                      </form>
                      {c.address && (c.status === 'error' || c.status === 'not_found') && (
                        <button onClick={() => locateOne(c.id)} disabled={savingId === c.id}
                          className="text-xs mt-1.5 flex items-center gap-1 hover:opacity-80" style={{ color: 'var(--accent)' }}>
                          <RefreshCw size={11} /> Try this address again
                        </button>
                      )}
                    </>
                  )}
                  {rowErrors[c.id] && <p className="text-xs mt-1.5" style={{ color: 'var(--red)' }}>{rowErrors[c.id]}</p>}
                </div>
              ))}
            </div>
          )}

          {onMap.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                On the map ({onMap.length})
              </p>
              {onMap.map((c) => (
                <div key={c.id} className="border-t" style={{ borderColor: 'var(--border)', background: selectedId === c.id ? 'var(--surface-2)' : 'transparent' }}>
                  <div className="px-4 py-3 flex items-start gap-3">
                    <button onClick={() => focusClient(c.id)} className="flex-1 min-w-0 flex items-start gap-3 text-left" title="Zoom to this client">
                      <span className="w-3 h-3 rounded-full shrink-0 mt-1" style={{ background: colorOf.get(c.id) }} />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium truncate">{c.company}</span>
                        {c.contact && <span className="block text-xs truncate" style={{ color: 'var(--text-muted)' }}>{c.contact}</span>}
                        <span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{c.address}</span>
                        {c.approximate && (
                          <span className="inline-flex items-center gap-1 text-xs mt-1" style={{ color: 'var(--yellow)' }}
                            title={`Only the city could be matched, so the ring is centred on the town rather than the street. Pinned at: ${c.match ?? ''}`}>
                            <AlertTriangle size={11} /> approximate — city level
                          </span>
                        )}
                      </span>
                    </button>
                    <button onClick={() => { setEditingId(editingId === c.id ? null : c.id); setDrafts((d) => ({ ...d, [c.id]: c.address ?? '' })); }}
                      className="opacity-50 hover:opacity-100 shrink-0 mt-0.5" title="Edit address" style={{ color: 'var(--text-muted)' }}>
                      <Pencil size={13} />
                    </button>
                  </div>
                  {editingId === c.id && (
                    <form className="px-4 pb-3 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); locateOne(c.id, drafts[c.id] ?? ''); }}>
                      <input className="input text-xs" style={{ padding: '6px 8px' }} autoFocus placeholder="Street, City, State ZIP"
                        value={drafts[c.id] ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))} />
                      <button type="submit" disabled={savingId === c.id || !(drafts[c.id] ?? '').trim()}
                        className="btn-primary text-xs shrink-0 flex items-center gap-1" style={{ padding: '6px 10px' }}>
                        {savingId === c.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
                      </button>
                    </form>
                  )}
                  {rowErrors[c.id] && <p className="px-4 pb-3 text-xs" style={{ color: 'var(--red)' }}>{rowErrors[c.id]}</p>}
                </div>
              ))}
            </div>
          )}

          {loaded && clients.length > 0 && (
            <p className="px-4 py-3 border-t text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              Active clients only. Each address is looked up once with OpenStreetMap and saved; click a pin for a link to that client's dashboard.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
