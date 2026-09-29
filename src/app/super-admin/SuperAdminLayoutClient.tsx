'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import SuperAdminNav from './SuperAdminNav';
import { setActiveClassroomAction } from '@/app/actions';

interface ClassroomOption {
  id: string;
  name: string;
  classroom_name: string;
  classroom_code: string;
}

export default function SuperAdminLayoutClient({
  children,
  classrooms,
  activeAdminId,
}: {
  children: React.ReactNode;
  classrooms: ClassroomOption[];
  activeAdminId: string | null;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedClassroomId, setSelectedClassroomId] = useState(activeAdminId || '');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSwitchClassroom = (targetId: string) => {
    setSelectedClassroomId(targetId);
    if (!targetId) return;

    startTransition(async () => {
      await setActiveClassroomAction(targetId);
      router.push('/admin');
      router.refresh();
    });
  };

  return (
    <div className="admin-container">
      {/* Mobile Top Bar */}
      <div className="mobile-header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.5rem' }}>👑</span>
          <span style={{ fontWeight: '700', fontSize: '1.1rem', color: '#f472b6' }}>Super Admin</span>
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
              <span style={logoIconStyle}>👑</span>
              <div>
                <h2 style={logoTitleStyle}>Super Admin</h2>
                <span style={logoSubtitleStyle}>Omnipotent Control Center</span>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="btn btn-icon mobile-close-btn"
              style={{ display: 'none', padding: '4px 8px' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Universal Classroom Switcher Quick Bar */}
        <div style={switcherContainerStyle}>
          <label style={switcherLabelStyle}>⚡ Jump to Classroom as Admin:</label>
          <select
            value={selectedClassroomId}
            onChange={(e) => handleSwitchClassroom(e.target.value)}
            disabled={isPending}
            className="input-field"
            style={switcherSelectStyle}
          >
            <option value="">-- Choose Classroom --</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.classroom_name} ({c.classroom_code})
              </option>
            ))}
          </select>
          {isPending && <span style={switchingTextStyle}>Switching context...</span>}
        </div>

        {/* Navigation links */}
        <div onClick={() => setSidebarOpen(false)} style={{ display: 'flex', flex: 1, flexDirection: 'column' }}>
          <SuperAdminNav />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="admin-main">
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
  fontWeight: '800',
  letterSpacing: '-0.3px',
  background: 'linear-gradient(135deg, #f472b6, #ec4899, #8b5cf6)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
};

const logoSubtitleStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
  fontWeight: '500',
};

const switcherContainerStyle: React.CSSProperties = {
  marginTop: '16px',
  marginBottom: '16px',
  padding: '12px',
  borderRadius: '12px',
  background: 'rgba(236, 72, 153, 0.08)',
  border: '1px solid rgba(236, 72, 153, 0.2)',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

const switcherLabelStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: '600',
  color: '#f472b6',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const switcherSelectStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: '0.85rem',
  width: '100%',
  cursor: 'pointer',
};

const switchingTextStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#a78bfa',
  fontStyle: 'italic',
};
