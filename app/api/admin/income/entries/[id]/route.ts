import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireFinancialAccess } from '@/lib/income';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = getDb();
  db.prepare('DELETE FROM expense_entries WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}
