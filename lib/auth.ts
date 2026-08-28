import { NextAuthOptions, getServerSession } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb } from './db';

// Only Jesse can see retainer/MRR figures — every other admin (team members
// managing GHL sync, onboarding, etc.) gets those numbers stripped server-side.
export function canViewFinancials(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase() === 'jesse@merovamedia.com';
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null;
        const db = getDb();

        // Email-only client login — match contact_email on active clients, or users table
        if (!credentials.password) {
          const client = db.prepare(
            "SELECT * FROM clients WHERE contact_email = ? AND onboard_status = 'active'"
          ).get(credentials.email) as any;
          if (client) {
            return {
              id: `client-${client.id}`,
              email: credentials.email,
              name: client.name,
              role: 'client',
              clientId: String(client.id),
            };
          }
          // Also allow users-table client logins (email-only, no password needed)
          const userRow = db.prepare("SELECT * FROM users WHERE email = ? AND role = 'client'").get(credentials.email) as any;
          if (userRow?.client_id) {
            const clientRecord = db.prepare('SELECT * FROM clients WHERE id = ?').get(userRow.client_id) as any;
            if (clientRecord) {
              return {
                id: String(userRow.id),
                email: userRow.email,
                name: clientRecord.name,
                role: 'client',
                clientId: String(userRow.client_id),
              };
            }
          }
          // Employee login — same email-only pattern, direct match against the
          // employees table (no users-table row needed at all). Deactivating an
          // employee (active = 0) blocks login immediately.
          const employee = db.prepare(
            'SELECT * FROM employees WHERE LOWER(email) = ? AND active = 1'
          ).get(String(credentials.email).trim().toLowerCase()) as any;
          if (employee) {
            return {
              id: `employee-${employee.id}`,
              email: employee.email,
              name: employee.name,
              role: 'employee',
              employeeId: String(employee.id),
            };
          }
          return null;
        }

        // Admin / team password login
        const user = db
          .prepare('SELECT * FROM users WHERE email = ?')
          .get(credentials.email) as any;
        if (!user) return null;
        const valid = await bcrypt.compare(credentials.password, user.password_hash);
        if (!valid) return null;
        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
          role: user.role,
          clientId: user.client_id ? String(user.client_id) : null,
          canViewFinancials: canViewFinancials(user.email),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.clientId = (user as any).clientId;
        token.employeeId = (user as any).employeeId ?? null;
        token.canViewFinancials = (user as any).canViewFinancials ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).clientId = token.clientId;
        (session.user as any).employeeId = token.employeeId ?? null;
        (session.user as any).id = token.sub;
        (session.user as any).canViewFinancials = token.canViewFinancials ?? false;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET ?? 'dev-secret-change-in-production',
};

// Shared route guard for pages fully restricted to Jesse (Income Statement,
// Sales Tracker) — unlike canViewFinancials() alone, this blocks the whole
// response rather than masking individual fields.
export async function requireFinancialAccess(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user?.role !== 'admin' || !canViewFinancials(user.email)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true };
}

// Guard for an employee's OWN payroll routes. Deliberately returns only the
// employeeId derived from the session — callers must use this id for every
// query and must never accept an employeeId from the request (body/query/
// params) for a "my own data" route, or a signed-in employee could read
// someone else's pay by just changing an id in the request.
export async function requireEmployeeAccess(): Promise<
  { ok: true; employeeId: number } | { ok: false; response: NextResponse }
> {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!session || user?.role !== 'employee' || !user?.employeeId) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, employeeId: Number(user.employeeId) };
}
