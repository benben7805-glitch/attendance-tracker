'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const includedItems = [
  { icon: '👨‍🎓', label: 'Students', detail: 'Roll numbers & names' },
  { icon: '📚', label: 'Subjects', detail: 'Names & types (Theory / Practical / Clinics)' },
  { icon: '📅', label: 'Classes', detail: 'Every class held, with date & time' },
  { icon: '📝', label: 'Attendance Log', detail: 'Present/Absent for every student & class' },
  { icon: '📊', label: 'Summary', detail: 'Per-student-per-subject % vs. the minimum requirement' },
];

const restorableItems = [
  { icon: '👨‍🎓', label: 'Students', detail: 'From the "Students" sheet' },
  { icon: '📚', label: 'Subjects', detail: 'From the "Subjects" sheet (incl. type)' },
  { icon: '📅', label: 'Classes', detail: 'From the "Classes" sheet' },
  { icon: '📝', label: 'Attendance Log', detail: 'From the "Attendance Log" sheet' },
];

interface RestoreResult {
  counts: {
    students: number;
    subjects: number;
    classes: number;
    attendance: number;
  };
  warnings: string[];
}

export default function BackupPage() {
  const router = useRouter();
  const [isDownloading, setIsDownloading] = useState(false);

  // Restore states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);

  const handleDownload = () => {
    // Navigate to the route handler; Content-Disposition triggers the download
    setIsDownloading(true);
    window.location.href = '/api/backup';
    // Reset in case navigation is blocked; harmless otherwise
    setTimeout(() => setIsDownloading(false), 4000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(e.target.files?.[0] || null);
    setRestoreError(null);
    setRestoreResult(null);
  };

  const handleRestore = async () => {
    if (!selectedFile) return;
    if (
      !confirm(
        'Restoring will DELETE all current data and replace it with the contents of this Excel file. Continue?'
      )
    ) {
      return;
    }

    setRestoreError(null);
    setRestoreResult(null);
    setIsRestoring(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch('/api/restore', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setRestoreError(data.error || 'Restore failed.');
      } else {
        setRestoreResult(data as RestoreResult);
        setSelectedFile(null);
        setConfirmChecked(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        router.refresh();
      }
    } catch {
      setRestoreError('Something went wrong while uploading the file. Please try again.');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="container animate-fade-in" style={containerStyle}>
      <header style={headerStyle}>
        <div>
          <h1 className="text-gradient" style={titleStyle}>Backup</h1>
          <p style={subtitleStyle}>Download your data, or restore it from a previous backup</p>
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

      <section className="glass-panel" style={{ ...panelStyle, ...dangerPanelStyle }}>
        <h2 style={panelTitleStyle}>♻️ Restore from Backup</h2>
        <p style={panelDescriptionStyle}>
          Upload an Excel backup previously downloaded from this app. Everything currently in the
          system will be <strong>permanently deleted</strong> and replaced with the data from the
          file:
        </p>

        <div style={gridStyle}>
          {restorableItems.map((item) => (
            <div key={item.label} style={itemCardStyle}>
              <span style={itemIconStyle}>{item.icon}</span>
              <div>
                <div style={itemLabelStyle}>{item.label}</div>
                <div style={itemDetailStyle}>{item.detail}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={fileRowStyle}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            className="input-field"
            style={{ cursor: 'pointer' }}
          />
          {selectedFile && (
            <span style={fileNameStyle}>📄 {selectedFile.name}</span>
          )}
        </div>

        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={confirmChecked}
            onChange={(e) => setConfirmChecked(e.target.checked)}
          />
          <span>I understand that restoring will erase all current data.</span>
        </label>

        <button
          onClick={handleRestore}
          className="btn btn-danger"
          disabled={!selectedFile || !confirmChecked || isRestoring}
        >
          {isRestoring ? 'Restoring...' : '♻️ Upload & Restore'}
        </button>

        {restoreError && (
          <div className="alert-error animate-fade-in">
            <span>⚠️</span> <span>{restoreError}</span>
          </div>
        )}

        {restoreResult && (
          <div className="alert-success animate-fade-in" style={resultStyle}>
            <span>✅</span>
            <div>
              <strong>Restore complete!</strong>{' '}
              Restored {restoreResult.counts.students} students,{' '}
              {restoreResult.counts.subjects} subjects, {restoreResult.counts.classes} classes and{' '}
              {restoreResult.counts.attendance} attendance records.
              {restoreResult.warnings.length > 0 && (
                <ul style={warningListStyle}>
                  {restoreResult.warnings.map((w, i) => (
                    <li key={i} style={warningItemStyle}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
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

const dangerPanelStyle: React.CSSProperties = {
  borderColor: 'rgba(239, 68, 68, 0.35)',
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

const fileRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const fileNameStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
};

const checkboxLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  fontSize: '0.9rem',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
};

const resultStyle: React.CSSProperties = {
  alignItems: 'flex-start',
};

const warningListStyle: React.CSSProperties = {
  marginTop: '10px',
  paddingLeft: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const warningItemStyle: React.CSSProperties = {
  fontSize: '0.82rem',
};
