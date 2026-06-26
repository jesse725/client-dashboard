import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { fetchGHLPipelineStats, resolveApiKey } from '@/lib/ghl';
import { fetchMetaAdStats } from '@/lib/meta';
import { Client } from '@/types';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'admin' && String(user.clientId) !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as Client;
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!client.ghl_location_id || !client.ghl_pipeline_id) {
    return NextResponse.json({ leads: 0, contacted: 0, unqualified: 0, phone: 0, inhome: 0 });
  }

  const agencyKey = (db.prepare(`SELECT value FROM settings WHERE key = 'ghl_agency_key'`).get() as any)?.value ?? '';
  const apiKey = resolveApiKey(client.ghl_api_key, agencyKey);

  try {
    const [pipeline, metaStats] = await Promise.all([
      fetchGHLPipelineStats(apiKey, client.ghl_location_id, client.ghl_pipeline_id, {
        leads: client.stage_leads ?? undefined,
        contacted: client.stage_contacted ?? undefined,
        unqualified: client.stage_unqualified ?? undefined,
        phone: client.stage_phone ?? undefined,
        inhome: client.stage_inhome ?? undefined,
      }),
      client.meta_access_token && client.meta_ad_account_id
        ? fetchMetaAdStats(client.meta_access_token, client.meta_ad_account_id).catch(() => null)
        : Promise.resolve(null),
    ]);
    // Cache pipeline counts for tracker view
    db.prepare('UPDATE clients SET cached_leads = ?, cached_inhome = ? WHERE id = ?')
      .run(pipeline.leads ?? 0, pipeline.inhome ?? 0, id);

    return NextResponse.json({ pipeline, metaStats });
  } catch {
    return NextResponse.json({ pipeline: { leads: 0, contacted: 0, unqualified: 0, phone: 0, inhome: 0 }, metaStats: null });
  }
}
