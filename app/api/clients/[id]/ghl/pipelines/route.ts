import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { fetchLocationPipelines, resolveApiKey } from '@/lib/ghl';
import { Client } from '@/types';

// Same lookup app/api/ghl/pipelines/route.ts does for a BRAND NEW client during
// onboarding — but for an EXISTING one, resolving the key server-side (the
// client's own, or the agency's) exactly like every other per-client GHL route
// already does, instead of requiring the admin to paste a key into the URL.
//
// This is the fix for a real incident: StroTek's Edit Client GHL section is
// plain text boxes with no lookup, someone typed a pipeline ID that didn't
// belong to StroTek's location, and nothing ever caught it — the pipeline
// simply had zero opportunities from that day on. Onboarding already has
// "Fetch GHL Stages"; existing clients had no equivalent at all.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as Client | undefined;
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  // Edit Client lets an admin correct a wrong Location ID/API key and check it
  // immediately, before saving — same reason onboarding's "Fetch Stages" reads
  // its own in-progress form instead of requiring a save first. Fall back to
  // what's already stored so a plain re-check still works with no query params.
  const overrideLocationId = req.nextUrl.searchParams.get('locationId')?.trim();
  const overrideApiKey = req.nextUrl.searchParams.get('apiKey')?.trim();
  const locationId = overrideLocationId || client.ghl_location_id;
  if (!locationId) {
    return NextResponse.json({ error: 'No GoHighLevel Location ID is saved for this client yet — add that first.' }, { status: 400 });
  }

  const agencyKey = (db.prepare("SELECT value FROM settings WHERE key = 'ghl_agency_key'").get() as any)?.value ?? '';
  const apiKey = overrideApiKey || resolveApiKey(client.ghl_api_key, agencyKey);
  if (!apiKey) {
    return NextResponse.json({ error: 'No GoHighLevel API key is saved for this client and no agency key is set (Admin Settings > GHL Sync).' }, { status: 400 });
  }

  try {
    const pipelines = await fetchLocationPipelines(apiKey, locationId);
    if (pipelines.length === 0) {
      return NextResponse.json({ error: "GoHighLevel didn't return any pipelines for this Location ID — double check it's correct." }, { status: 502 });
    }
    return NextResponse.json({ pipelines });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 502 });
  }
}
