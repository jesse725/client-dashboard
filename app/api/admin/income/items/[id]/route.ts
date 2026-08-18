import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireFinancialAccess } from '@/lib/income';

const ALLOWED_FIELDS = ['name', 'category', 'monthly_amount', 'next_review_date', 'active'];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json();
  const updates: string[] = [];
  const values: any[] = [];

  for (const field of ALLOWED_FIELDS) {
    if (field in body) {
      updates.push(`${field} = ?`);
      values.push(field === 'active' ? (body[field] ? 1 : 0) : body[field]);
    }
  }
  if (updates.length === 0) return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });

  values.push(id);
  const db = getDb();
  db.prepare(`UPDATE expense_items SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFinancialAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = getDb();
  db.prepare('DELETE FROM expense_items WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}
