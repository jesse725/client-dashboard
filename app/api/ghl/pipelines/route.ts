import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchLocationPipelines } from '@/lib/ghl';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const apiKey = searchParams.get('apiKey');
  const locationId = searchParams.get('locationId');

  if (!apiKey || !locationId) {
    return NextResponse.json({ error: 'apiKey and locationId are required' }, { status: 400 });
  }

  try {
    const pipelines = await fetchLocationPipelines(apiKey, locationId);
    return NextResponse.json(pipelines);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
