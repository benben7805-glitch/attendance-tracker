import { redirect } from 'next/navigation';
import { getSession } from '@/app/actions';
import AdminLayoutClient from './AdminLayoutClient';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Protect route server-side
  const session = await getSession();
  if (session.role !== 'admin') {
    redirect('/');
  }

  return (
    <AdminLayoutClient>
      {children}
    </AdminLayoutClient>
  );
}
