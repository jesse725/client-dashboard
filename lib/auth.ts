import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
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
        token.canViewFinancials = (user as any).canViewFinancials ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).clientId = token.clientId;
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
