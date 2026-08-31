import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// Role-based landing redirect — reads the session fresh on the server for
// every visit, so there's no client-side "session hasn't hydrated yet" race
// (the login page used to guess this via a client-side getSession() call
// right after signIn(), which could resolve before the session was ready and
// send people to the wrong place).
export default async function Home() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const user = session.user as any;
  if (user.role === 'client' && user.clientId) redirect(`/dashboard/${user.clientId}`);
  if (user.role === 'employee') redirect('/employee');
  redirect('/dashboard');
}
