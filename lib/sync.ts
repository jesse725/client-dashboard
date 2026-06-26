import { getDb } from './db';
import {
  fetchAgencyLocations,
  fetchLocationPipelines,
  fetchCustomFields,
  fetchGHLPipelineStats,
  resolveApiKey,
} from './ghl';
import { Client } from '@/types';

export interface SyncResult {
  locationsFound: number;
  clientsCreated: number;
  clientsUpdated: number;
  errors: string[];
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function uniqueSlug(db: ReturnType<typeof getDb>, base: string): string {
  let slug = base;
  let i = 2;
  while (db.prepare('SELECT id FROM clients WHERE slug = ?').get(slug)) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

export async function runGHLSync(): Promise<SyncResult> {
  const db = getDb();
  const result: SyncResult = { locationsFound: 0, clientsCreated: 0, clientsUpdated: 0, errors: [] };

  // Start log entry
  const logId = (db.prepare(
    `INSERT INTO sync_log (status) VALUES ('running')`
  ).run()).lastInsertRowid;

  try {
    const agencyKey = (db.prepare(`SELECT value FROM settings WHERE key = 'ghl_agency_key'`).get() as any)?.value;
    if (!agencyKey) throw new Error('No GHL agency API key configured.');

    const locations = await fetchAgencyLocations(agencyKey);
    result.locationsFound = locations.length;

    for (const loc of locations) {
      try {
        const existing = db
          .prepare('SELECT * FROM clients WHERE ghl_location_id = ?')
          .get(loc.id) as Client | undefined;

        const apiKey = resolveApiKey(existing?.ghl_api_key ?? null, agencyKey);

        // Fetch pipelines to auto-map stages if not already set
        let pipelineId = existing?.ghl_pipeline_id ?? null;
        let stageLeads = existing?.stage_leads ?? null;
        let stageUnqualified = existing?.stage_unqualified ?? null;
        let stagePhone = existing?.stage_phone ?? null;
        let stageInhome = existing?.stage_inhome ?? null;

        const pipelines = await fetchLocationPipelines(apiKey, loc.id);
        const pipeline = pipelines[0]; // default to first pipeline

        if (pipeline && !pipelineId) {
          pipelineId = pipeline.id;
          // Auto-map stages by name (fuzzy match)
          for (const stage of pipeline.stages) {
            const n = stage.name.toLowerCase();
            if (!stageLeads && (n.includes('lead') || n.includes('new') || n.includes('inbound'))) {
              stageLeads = stage.id;
            } else if (!stageUnqualified && (n.includes('unqualif') || n.includes('no show') || n.includes('not a fit') || n.includes('disqualif'))) {
              stageUnqualified = stage.id;
            } else if (!stagePhone && (n.includes('phone') || n.includes('call') || n.includes('booked') && n.includes('call'))) {
              stagePhone = stage.id;
            } else if (!stageInhome && (n.includes('home') || n.includes('in-home') || n.includes('appoint') || n.includes('consult'))) {
              stageInhome = stage.id;
            }
          }
        }

        const customFields = await fetchCustomFields(apiKey, loc.id);
        const customFieldsJson = JSON.stringify(customFields);

        if (!existing) {
          // Create new client
          const slug = uniqueSlug(db, slugify(loc.name));
          db.prepare(`
            INSERT INTO clients (
              name, slug, logo_url, ghl_api_key, ghl_location_id, ghl_pipeline_id,
              stage_leads, stage_unqualified, stage_phone, stage_inhome,
              retainer_price, ad_spend, start_date, ghl_custom_fields
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, date('now'), ?)
          `).run(
            loc.name,
            slug,
            loc.logoUrl ?? null,
            null, // no per-location key by default; uses agency key
            loc.id,
            pipelineId,
            stageLeads,
            stageUnqualified,
            stagePhone,
            stageInhome,
            customFieldsJson
          );
          result.clientsCreated++;
        } else {
          // Update existing client with any new pipeline/stage data
          db.prepare(`
            UPDATE clients SET
              name = ?,
              logo_url = COALESCE(logo_url, ?),
              ghl_pipeline_id = COALESCE(ghl_pipeline_id, ?),
              stage_leads = COALESCE(stage_leads, ?),
              stage_unqualified = COALESCE(stage_unqualified, ?),
              stage_phone = COALESCE(stage_phone, ?),
              stage_inhome = COALESCE(stage_inhome, ?),
              ghl_custom_fields = ?
            WHERE id = ?
          `).run(
            loc.name,
            loc.logoUrl ?? null,
            pipelineId,
            stageLeads,
            stageUnqualified,
            stagePhone,
            stageInhome,
            customFieldsJson,
            existing.id
          );
          result.clientsUpdated++;
        }
      } catch (e: any) {
        result.errors.push(`${loc.name}: ${e.message}`);
      }
    }

    // Finish log
    db.prepare(`
      UPDATE sync_log SET status = 'success', finished_at = datetime('now'),
        locations_found = ?, clients_created = ?, clients_updated = ?
      WHERE id = ?
    `).run(result.locationsFound, result.clientsCreated, result.clientsUpdated, logId);

    // Save last sync time
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('last_sync', ?)`).run(
      new Date().toISOString()
    );

  } catch (e: any) {
    result.errors.push(e.message);
    db.prepare(`
      UPDATE sync_log SET status = 'error', finished_at = datetime('now'), error_message = ?
      WHERE id = ?
    `).run(e.message, logId);
  }

  return result;
}
