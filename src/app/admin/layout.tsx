import { redirect } from 'next/navigation';
import { getSession, getClassroomsForSelect } from '@/app/actions';
import AdminLayoutClient from './AdminLayoutClient';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Protect route server-side for both Classroom Admin and Super Admin
  const session = await getSession();
  if (session.role !== 'admin' && session.role !== 'super_admin') {
    redirect('/');
  }

  const classrooms = await getClassroomsForSelect();

  return (
    <AdminLayoutClient
      session={session}
      classrooms={classrooms}
    >
      {children}
    </AdminLayoutClient>
  );
}
