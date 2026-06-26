import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { fetchLocationPipelines, resolveApiKey } from '@/lib/ghl';
import { Client } from '@/types';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as Client;
  if (!client || !client.ghl_location_id) {
    return NextResponse.json({ error: 'No GHL location configured' }, { status: 400 });
  }

  const agencyKey = (db.prepare(`SELECT value FROM settings WHERE key = 'ghl_agency_key'`).get() as any)?.value ?? '';
  const apiKey = resolveApiKey(client.ghl_api_key, agencyKey);

  const pipelines = await fetchLocationPipelines(apiKey, client.ghl_location_id);
  return NextResponse.json(pipelines);
}
