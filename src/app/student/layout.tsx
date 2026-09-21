import { redirect } from 'next/navigation';
import { getSession } from '@/app/actions';

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (session.role !== 'student' || !session.rollNumber) {
    redirect('/');
  }

  return <>{children}</>;
}
