'use client';

import { useState } from 'react';

const includedItems = [
  { icon: '👨‍🎓', label: 'Students', detail: 'Roll numbers & names' },
  { icon: '📚', label: 'Subjects', detail: 'Names & types (Theory / Practical / Clinics)' },
  { icon: '⏳', label: 'Weekly Schedule', detail: 'Recurring class template' },
  { icon: '📅', label: 'Classes', detail: 'Every class held, with date & time' },
  { icon: '📝', label: 'Attendance Log', detail: 'Present/Absent for every student & class' },
  { icon: '📊', label: 'Summary', detail: 'Per-student-per-subject % vs. the minimum requirement' },
];

export default function BackupPage() {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = () => {
    // Navigate to the route handler; Content-Disposition triggers the download
    setIsDownloading(true);
    window.location.href = '/api/backup';
    // Reset in case navigation is blocked; harmless otherwise
    setTimeout(() => setIsDownloading(false), 4000);
  };

  return (
    <div className="container animate-fade-in" style={containerStyle}>
      <header style={headerStyle}>
        <div>
          <h1 className="text-gradient" style={titleStyle}>Backup</h1>
          <p style={subtitleStyle}>Download all attendance data as an Excel workbook</p>
        </div>
      </header>

      <section className="glass-panel" style={panelStyle}>
        <h2 style={panelTitleStyle}>Excel Backup (.xlsx)</h2>
        <p style={panelDescriptionStyle}>
          Generates a snapshot of everything currently stored in the system. The file contains one
          worksheet per section below:
        </p>

        <div style={gridStyle}>
          {includedItems.map((item) => (
            <div key={item.label} style={itemCardStyle}>
              <span style={itemIconStyle}>{item.icon}</span>
              <div>
                <div style={itemLabelStyle}>{item.label}</div>
                <div style={itemDetailStyle}>{item.detail}</div>
              </div>
            </div>
          ))}
        </div>

        <button onClick={handleDownload} className="btn btn-primary" disabled={isDownloading}>
          {isDownloading ? 'Preparing download...' : '⬇️ Download Excel Backup'}
        </button>
      </section>
    </div>
  );
}

// Styles
const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const titleStyle: React.CSSProperties = {
  fontSize: '2rem',
  fontWeight: '700',
};

const subtitleStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: '0.95rem',
};

const panelStyle: React.CSSProperties = {
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
  maxWidth: '720px',
};

const panelTitleStyle: React.CSSProperties = {
  fontSize: '1.25rem',
  fontWeight: '600',
};

const panelDescriptionStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  color: 'var(--text-secondary)',
  lineHeight: '1.6',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: '12px',
};

const itemCardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '14px 16px',
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid var(--border-color)',
  borderRadius: '10px',
};

const itemIconStyle: React.CSSProperties = {
  fontSize: '1.4rem',
};

const itemLabelStyle: React.CSSProperties = {
  fontWeight: '600',
  fontSize: '0.95rem',
};

const itemDetailStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  color: 'var(--text-secondary)',
};
