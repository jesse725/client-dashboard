import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { fetchGHLOpportunitiesRaw, resolveApiKey } from '@/lib/ghl';
import { Client } from '@/types';

// Lightweight lead list for the Appointment Dispositioning picker — who's
// actually in the pipeline, so the admin/client can pick a real person
// instead of retyping a name.
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
    return NextResponse.json({ leads: [] });
  }

  try {
    const agencyKey = (db.prepare(`SELECT value FROM settings WHERE key = 'ghl_agency_key'`).get() as any)?.value ?? '';
    const apiKey = resolveApiKey(client.ghl_api_key, agencyKey);
    const opps = await fetchGHLOpportunitiesRaw(apiKey, client.ghl_location_id, client.ghl_pipeline_id);

    const leads = opps
      .map(o => ({
        id: o.id,
        name: o.contact?.name || o.name,
        email: o.contact?.email ?? null,
        phone: o.contact?.phone ?? null,
        stageId: o.pipelineStageId,
        createdAt: o.createdAt,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      leads,
      stageNames: {
        leads: client.stage_leads, contacted: client.stage_contacted,
        phone: client.stage_phone, inhome: client.stage_inhome,
        unqualified: client.stage_unqualified,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ leads: [], error: e.message });
  }
}
