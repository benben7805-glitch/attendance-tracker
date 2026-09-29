'use client';

import { useState, useEffect, useRef } from 'react';
import { getClassroomsForSelect } from '@/app/actions';

interface ClassroomOption {
  id: string;
  name: string;
  classroom_name: string;
  classroom_code: string;
}

export default function SuperAdminBackupPage() {
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  // Restore states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [restoreTargetClassroomId, setRestoreTargetClassroomId] = useState('');
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadClassrooms() {
      const data = await getClassroomsForSelect();
      setClassrooms(data as unknown as ClassroomOption[]);
      if (data && data.length > 0) {
        setRestoreTargetClassroomId(data[0].id);
      }
    }
    loadClassrooms();
  }, []);

  const handleDownloadMaster = () => {
    setIsDownloading(true);
    const link = document.createElement('a');
    link.href = '/api/backup?all=true';
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => setIsDownloading(false), 4000);
  };

  const handleDownloadClassroom = () => {
    if (!selectedClassroomId) return;
    setIsDownloading(true);
    const link = document.createElement('a');
    link.href = `/api/backup?classroom_id=${selectedClassroomId}`;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => setIsDownloading(false), 4000);
  };

  const handleRestore = async () => {
    if (!selectedFile || !restoreTargetClassroomId) return;

    if (
      !confirm(
        'Restoring will replace the target classroom data with the contents of this Excel file. Continue?'
      )
    ) {
      return;
    }

    setIsRestoring(true);
    setRestoreError(null);
    setRestoreSuccess(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('classroom_id', restoreTargetClassroomId);

      const res = await fetch('/api/restore', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Restore failed.');
      }

      setRestoreSuccess(
        `Classroom data restored successfully! Restored ${data.counts?.students || 0} students, ${data.counts?.subjects || 0} subjects, and ${data.counts?.classes || 0} classes.`
      );
      setSelectedFile(null);
      setConfirmChecked(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: unknown) {
      setRestoreError(err instanceof Error ? err.message : 'Failed to restore.');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: '800' }}>Master Backup & Disaster Recovery</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Generate platform-wide spreadsheet archives or selectively restore individual classrooms
        </p>
      </div>

      {restoreError && (
        <div className="alert-error animate-fade-in">
          <span>⚠️</span>
          <span>{restoreError}</span>
        </div>
      )}

      {restoreSuccess && (
        <div className="alert-success animate-fade-in">
          <span>✅</span>
          <span>{restoreSuccess}</span>
        </div>
      )}

      {/* Export Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Master Full System Export */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '2rem' }}>🌐</span>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: '700' }}>Full Platform Master Export</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Exports all classrooms, admins, students, subjects, classes, and logs into a single master workbook
              </p>
            </div>
          </div>

          <button
            onClick={handleDownloadMaster}
            disabled={isDownloading}
            className="btn btn-primary"
            style={{ padding: '12px 20px', marginTop: 'auto' }}
          >
            {isDownloading ? 'Generating Workbook...' : '📥 Download Master Excel Archive'}
          </button>
        </div>

        {/* Individual Classroom Export */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '2rem' }}>🏫</span>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: '700' }}>Classroom-Specific Export</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Download an isolated Excel backup for any individual classroom
              </p>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Select Target Classroom</label>
            <select
              value={selectedClassroomId}
              onChange={(e) => setSelectedClassroomId(e.target.value)}
              className="input-field"
              style={{ width: '100%' }}
            >
              <option value="">-- Choose Classroom --</option>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.classroom_name} ({c.classroom_code})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleDownloadClassroom}
            disabled={isDownloading || !selectedClassroomId}
            className="btn btn-secondary"
            style={{ padding: '12px 20px', marginTop: 'auto' }}
          >
            📥 Download Classroom Backup
          </button>
        </div>
      </div>

      {/* Selective Restore Section */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '2rem' }}>♻️</span>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '700' }}>Restore Classroom from Excel Backup</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Replaces all data within the selected classroom with the contents of an uploaded backup spreadsheet
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Select Target Classroom to Restore</label>
            <select
              value={restoreTargetClassroomId}
              onChange={(e) => setRestoreTargetClassroomId(e.target.value)}
              className="input-field"
              style={{ width: '100%' }}
            >
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.classroom_name} ({c.classroom_code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Select .xlsx Backup File</label>
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="input-field"
              style={{ padding: '8px' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
          <input
            type="checkbox"
            id="confirmRestore"
            checked={confirmChecked}
            onChange={(e) => setConfirmChecked(e.target.checked)}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
          <label htmlFor="confirmRestore" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            I understand that this will overwrite existing records in the selected classroom.
          </label>
        </div>

        <div>
          <button
            onClick={handleRestore}
            disabled={!selectedFile || !confirmChecked || isRestoring || !restoreTargetClassroomId}
            className="btn btn-danger"
            style={{ padding: '10px 20px' }}
          >
            {isRestoring ? 'Restoring...' : '⚠️ Execute Classroom Restore'}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.85rem',
  fontWeight: '600',
  color: 'var(--text-secondary)',
  marginBottom: '6px',
};
