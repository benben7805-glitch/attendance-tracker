import { redirect } from 'next/navigation';
import { getSession, getClassroomsForSelect } from '@/app/actions';
import SuperAdminLayoutClient from './SuperAdminLayoutClient';

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (session.role !== 'super_admin') {
    redirect('/');
  }

  const classrooms = await getClassroomsForSelect();

  return (
    <SuperAdminLayoutClient
      classrooms={classrooms}
      activeAdminId={session.activeAdminId}
    >
      {children}
    </SuperAdminLayoutClient>
  );
}
