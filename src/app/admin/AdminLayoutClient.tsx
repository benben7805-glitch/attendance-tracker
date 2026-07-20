'use client';

import { useState } from 'react';
import AdminNav from './AdminNav';

export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="admin-container">
      {/* Mobile Top Bar */}
      <div className="mobile-header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.5rem' }}>🛡️</span>
          <span style={{ fontWeight: '600', fontSize: '1.1rem' }}>Admin Portal</span>
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
              <span style={logoIconStyle}>🛡️</span>
              <div>
                <h2 className="text-gradient-purple" style={logoTitleStyle}>Admin Portal</h2>
                <span style={logoSubtitleStyle}>Attendance Hub</span>
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

        {/* Clicking navigation items closes the sidebar on mobile */}
        <div onClick={() => setSidebarOpen(false)} style={{ display: 'flex', flex: 1, flexDirection: 'column' }}>
          <AdminNav />
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
  paddingBottom: '20px',
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
};
