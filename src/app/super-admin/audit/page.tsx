'use client';

import { useState, useEffect } from 'react';
import { getAuditLogsAction, getClassroomsForSelect } from '@/app/actions';

interface AuditItem {
  id: string;
  actor_role: string;
  actor_id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  admins?: {
    name: string;
    classroom_name: string;
    classroom_code: string;
  } | null;
}

interface ClassroomOption {
  id: string;
  classroom_name: string;
  classroom_code: string;
}

export default function SuperAdminAuditTrailPage() {
  const [logs, setLogs] = useState<AuditItem[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState('');
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchAuditData() {
      try {
        const [logsData, classroomsData] = await Promise.all([
          getAuditLogsAction(limit, selectedClassroomId || undefined),
          getClassroomsForSelect(),
        ]);
        if (isMounted) {
          setLogs(logsData as unknown as AuditItem[]);
          setClassrooms(classroomsData as unknown as ClassroomOption[]);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load audit logs.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    fetchAuditData();
    return () => {
      isMounted = false;
    };
  }, [selectedClassroomId, limit]);

  const handleRefresh = async () => {
    try {
      setLoading(true);
      const [logsData, classroomsData] = await Promise.all([
        getAuditLogsAction(limit, selectedClassroomId || undefined),
        getClassroomsForSelect(),
      ]);
      setLogs(logsData as unknown as AuditItem[]);
      setClassrooms(classroomsData as unknown as ClassroomOption[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: '800' }}>Enterprise Audit Trail</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Immutable activity logging and administrative security provenance
        </p>
      </div>

      {error && (
        <div className="alert-error animate-fade-in">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Filter bar */}
      <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Filter Classroom:</label>
          <select
            value={selectedClassroomId}
            onChange={(e) => setSelectedClassroomId(e.target.value)}
            className="input-field"
            style={{ padding: '6px 12px' }}
          >
            <option value="">All Classrooms</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.classroom_name} ({c.classroom_code})
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Limit:</label>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="input-field"
            style={{ padding: '6px 12px' }}
          >
            <option value={25}>25 entries</option>
            <option value={50}>50 entries</option>
            <option value={100}>100 entries</option>
            <option value={200}>200 entries</option>
          </select>
        </div>

        <button
          onClick={handleRefresh}
          className="btn btn-secondary"
          style={{ padding: '6px 14px', fontSize: '0.85rem' }}
        >
          🔄 Refresh
        </button>

        <div style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Showing <strong>{logs.length}</strong> events
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor Role</th>
                <th>Action</th>
                <th>Target Classroom</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td>
                    <span
                      className={log.actor_role === 'super_admin' ? 'badge badge-purple' : 'badge badge-blue'}
                      style={{ fontSize: '0.75rem', fontWeight: '700' }}
                    >
                      {log.actor_role === 'super_admin' ? '👑 Super Admin' : '🛡️ Admin'}
                    </span>
                  </td>
                  <td>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: '600',
                        fontSize: '0.82rem',
                        color: log.action.includes('DELETE') || log.action.includes('RESET') ? '#ef4444' : '#10b981',
                      }}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td>
                    {log.admins ? (
                      <span>
                        {log.admins.classroom_name}{' '}
                        <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>
                          {log.admins.classroom_code}
                        </span>
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>System / Global</span>
                    )}
                  </td>
                  <td>
                    <pre
                      style={{
                        fontSize: '0.75rem',
                        background: 'rgba(0, 0, 0, 0.3)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        maxWidth: '360px',
                        overflowX: 'auto',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {log.details ? JSON.stringify(log.details) : '{}'}
                    </pre>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    No audit records logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
