import { NextResponse } from 'next/server';
import { requireFinancialAccess } from '@/lib/auth';
import {
  addClientTracking, updateClientTracking, removeClientTracking,
  syncClientManagementPay, getClientManagementSummary,
} from '@/lib/clientManagement';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  syncClientManagementPay(Number(id));
  return NextResponse.json({ tracking: getClientManagementSummary(Number(id)) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const { clientId } = await req.json();
  if (!clientId) return NextResponse.json({ error: 'clientId is required' }, { status: 400 });

  try {
    addClientTracking(Number(id), Number(clientId));
  } catch (e: any) {
    if (String(e.message).includes('UNIQUE')) {
      return NextResponse.json({ error: 'That client is already tracked for this employee' }, { status: 409 });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  syncClientManagementPay(Number(id));
  return NextResponse.json({ tracking: getClientManagementSummary(Number(id)) });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const trackingId = searchParams.get('trackingId');
  if (!trackingId) return NextResponse.json({ error: 'trackingId query param required' }, { status: 400 });

  const { id } = await params;
  const body = await req.json();
  // Build the update object with only the keys the caller actually sent —
  // `{ active: undefined }` still has `'active' in obj === true` in JS, so
  // passing an unconditional `active: cond ? x : undefined` here would
  // silently reset active to false on every launch-date-only edit. Omit the
  // key entirely instead of passing it as undefined.
  const updates: { launchedAt?: string | null; active?: boolean } = {};
  if ('launchedAt' in body) updates.launchedAt = body.launchedAt;
  if ('active' in body) updates.active = !!body.active;
  updateClientTracking(Number(trackingId), updates);

  // Setting a date or re-activating may just now satisfy a bonus/fee
  // condition — sync immediately so the new amount shows up right away.
  syncClientManagementPay(Number(id));
  return NextResponse.json({ tracking: getClientManagementSummary(Number(id)) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const trackingId = searchParams.get('trackingId');
  if (!trackingId) return NextResponse.json({ error: 'trackingId query param required' }, { status: 400 });

  const { id } = await params;
  // Removes the tracking relationship only — bonuses already paid stay on
  // the record as real pay_period_bonuses rows, same as removing an
  // employee's future assignment never erases past pay periods.
  removeClientTracking(Number(trackingId));
  return NextResponse.json({ tracking: getClientManagementSummary(Number(id)) });
}
