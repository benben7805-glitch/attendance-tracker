'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AdminNav from './AdminNav';
import { setActiveClassroomAction, type SessionData } from '@/app/actions';

interface ClassroomOption {
  id: string;
  name: string;
  classroom_name: string;
  classroom_code: string;
}

export default function AdminLayoutClient({
  children,
  session,
  classrooms,
}: {
  children: React.ReactNode;
  session: SessionData;
  classrooms: ClassroomOption[];
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const activeClassroomId = session.isSuperAdmin
    ? session.activeAdminId || classrooms[0]?.id
    : session.adminId;

  const currentClassroom = classrooms.find((c) => c.id === activeClassroomId) || {
    classroom_name: session.classroomName || 'Classroom',
    classroom_code: session.classroomCode || 'MAIN',
  };

  const handleClassroomChange = (newAdminId: string) => {
    if (!newAdminId) return;
    startTransition(async () => {
      await setActiveClassroomAction(newAdminId);
      router.refresh();
    });
  };

  return (
    <div className="admin-container">
      {/* Mobile Top Bar */}
      <div className="mobile-header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.5rem' }}>{session.isSuperAdmin ? '👑' : '🛡️'}</span>
          <span style={{ fontWeight: '600', fontSize: '1.05rem' }}>
            {currentClassroom.classroom_name}
          </span>
        </div>
        <button
          onClick={() => setSidebarOpen(true)}
          className="btn btn-secondary"
          style={{ padding: '8px 12px', fontSize: '0.9rem' }}
        >
          ☰ Menu
        </button>
      </div>

      {/* Backdrop overlay for mobile */}
      <div
        className={`sidebar-backdrop ${sidebarOpen ? 'active' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar Navigation */}
      <aside className={`glass-panel admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div style={logoAreaStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={logoIconStyle}>{session.isSuperAdmin ? '👑' : '🛡️'}</span>
              <div>
                <h2 className="text-gradient-purple" style={logoTitleStyle}>Admin Portal</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  <span style={logoSubtitleStyle}>{currentClassroom.classroom_name}</span>
                  <span className="badge badge-purple" style={{ fontSize: '0.65rem', padding: '1px 5px' }}>
                    {currentClassroom.classroom_code}
                  </span>
                </div>
              </div>
            </div>
            {/* Close button inside sidebar on mobile */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="btn btn-icon mobile-close-btn"
              style={{ display: 'none', padding: '4px 8px' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Super Admin Quick Switcher in Sidebar */}
        {session.isSuperAdmin && (
          <div style={superAdminSidebarNoticeStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#f472b6' }}>
                👑 Super Admin Mode
              </span>
              <Link
                href="/super-admin"
                style={{ fontSize: '0.75rem', color: '#c084fc', textDecoration: 'none' }}
              >
                Hub ↗
              </Link>
            </div>
            <select
              value={activeClassroomId || ''}
              onChange={(e) => handleClassroomChange(e.target.value)}
              disabled={isPending}
              className="input-field"
              style={{ padding: '6px 8px', fontSize: '0.8rem', width: '100%', marginTop: '6px' }}
            >
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.classroom_name} ({c.classroom_code})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Clicking navigation items closes the sidebar on mobile */}
        <div onClick={() => setSidebarOpen(false)} style={{ display: 'flex', flex: 1, flexDirection: 'column' }}>
          <AdminNav />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="admin-main">
        {/* Prominent Super Admin Top Banner */}
        {session.isSuperAdmin && (
          <div
            className="animate-slide-down"
            style={superAdminBannerStyle}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '1.3rem' }}>👑</span>
              <div>
                <strong style={{ color: '#f472b6', fontSize: '0.92rem' }}>
                  Super Admin Omnipotent Mode:
                </strong>{' '}
                <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  Managing <strong>{currentClassroom.classroom_name}</strong> ({currentClassroom.classroom_code})
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Switch:</span>
                <select
                  value={activeClassroomId || ''}
                  onChange={(e) => handleClassroomChange(e.target.value)}
                  disabled={isPending}
                  className="input-field"
                  style={{ padding: '6px 10px', fontSize: '0.82rem', minWidth: '160px' }}
                >
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.classroom_name} ({c.classroom_code})
                    </option>
                  ))}
                </select>
              </div>

              <Link
                href="/super-admin"
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.82rem', textDecoration: 'none' }}
              >
                ← Return to Super Admin Hub
              </Link>
            </div>
          </div>
        )}

        {children}
      </main>

      <style jsx global>{`
        @media (max-width: 768px) {
          .mobile-close-btn {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
}

const logoAreaStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  paddingBottom: '16px',
  borderBottom: '1px solid var(--border-color)',
};

const logoIconStyle: React.CSSProperties = {
  fontSize: '2rem',
};

const logoTitleStyle: React.CSSProperties = {
  fontSize: '1.25rem',
  fontWeight: '700',
  letterSpacing: '-0.3px',
};

const logoSubtitleStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '140px',
};

const superAdminSidebarNoticeStyle: React.CSSProperties = {
  marginTop: '12px',
  marginBottom: '12px',
  padding: '10px',
  borderRadius: '8px',
  background: 'rgba(236, 72, 153, 0.08)',
  border: '1px solid rgba(236, 72, 153, 0.2)',
  display: 'flex',
  flexDirection: 'column',
};

const superAdminBannerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 18px',
  marginBottom: '20px',
  borderRadius: '12px',
  background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.12), rgba(139, 92, 246, 0.12))',
  border: '1px solid rgba(236, 72, 153, 0.3)',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
  flexWrap: 'wrap',
  gap: '12px',
};
