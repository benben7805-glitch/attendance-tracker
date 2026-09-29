'use client';

import { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSuperAdminDashboardMetrics, setActiveClassroomAction } from '@/app/actions';

interface AuditLog {
  id: string;
  actor_role: string;
  actor_id: string;
  action: string;
  created_at: string;
  admins?: {
    classroom_name: string;
    classroom_code: string;
  } | null;
}

interface AdminItem {
  id: string;
  name: string;
  classroom_name: string;
  classroom_code: string;
  is_active: boolean;
  studentCount?: number;
  classCount?: number;
}

interface MetricsData {
  totalClassrooms: number;
  activeAdmins: number;
  totalStudents: number;
  classesToday: number;
  recentAudits: AuditLog[];
  adminsList: AdminItem[];
}

export default function SuperAdminDashboardPage() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    async function loadMetrics() {
      try {
        setLoading(true);
        const data = await getSuperAdminDashboardMetrics();
        if (isMounted) {
          setMetrics(data as unknown as MetricsData);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load system metrics.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadMetrics();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleOpenClassroom = (adminId: string) => {
    startTransition(async () => {
      try {
        await setActiveClassroomAction(adminId);
        router.push('/admin');
        router.refresh();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to switch classroom context.');
      }
    });
  };

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: '60vh', flexDirection: 'column', gap: '16px' }}>
        <div className="spinner" style={{ width: '36px', height: '36px', borderWidth: '3px' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Loading system telemetry and classrooms...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <h1 style={titleStyle}>Universal Control Hub</h1>
          <p style={subtitleStyle}>Enterprise platform overview, multi-classroom metrics, and omnipotent management</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link href="/super-admin/admins" className="btn btn-primary" style={{ padding: '10px 18px' }}>
            <span>➕ Create Admin</span>
          </Link>
          <a
            href="/api/backup?all=true"
            className="btn btn-secondary"
            style={{ padding: '10px 18px', textDecoration: 'none' }}
          >
            <span>💾 Master Export</span>
          </a>
        </div>
      </div>

      {error && (
        <div className="alert-error animate-fade-in">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* KPI Metric Cards */}
      <div style={metricGridStyle}>
        <div className="glass-panel" style={metricCardStyle}>
          <div style={metricIconWrapper('rgba(139, 92, 246, 0.15)', '#a78bfa')}>🏫</div>
          <div>
            <div style={metricValueStyle}>{metrics?.totalClassrooms ?? 0}</div>
            <div style={metricLabelStyle}>Total Classrooms</div>
          </div>
        </div>

        <div className="glass-panel" style={metricCardStyle}>
          <div style={metricIconWrapper('rgba(16, 185, 129, 0.15)', '#34d399')}>🛡️</div>
          <div>
            <div style={metricValueStyle}>{metrics?.activeAdmins ?? 0}</div>
            <div style={metricLabelStyle}>Active Admins</div>
          </div>
        </div>

        <div className="glass-panel" style={metricCardStyle}>
          <div style={metricIconWrapper('rgba(6, 182, 212, 0.15)', '#22d3ee')}>👨‍🎓</div>
          <div>
            <div style={metricValueStyle}>{metrics?.totalStudents ?? 0}</div>
            <div style={metricLabelStyle}>Total Students</div>
          </div>
        </div>

        <div className="glass-panel" style={metricCardStyle}>
          <div style={metricIconWrapper('rgba(244, 114, 182, 0.15)', '#f472b6')}>📅</div>
          <div>
            <div style={metricValueStyle}>{metrics?.classesToday ?? 0}</div>
            <div style={metricLabelStyle}>Classes Held Today</div>
          </div>
        </div>
      </div>

      {/* Classrooms Quick Launch Directory */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700' }}>Active Classrooms Directory</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Jump straight into any classroom as administrator with complete write authority
            </p>
          </div>
          <Link href="/super-admin/admins" style={{ fontSize: '0.9rem', color: '#a78bfa', textDecoration: 'none' }}>
            Manage All Admins →
          </Link>
        </div>

        {metrics?.adminsList && metrics.adminsList.length > 0 ? (
          <div style={classroomGridStyle}>
            {metrics.adminsList.map((admin) => (
              <div
                key={admin.id}
                style={classroomCardStyle}
                className="glass-panel"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '4px' }}>
                      {admin.classroom_name}
                    </h3>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span className="badge badge-purple" style={{ fontSize: '0.75rem' }}>
                        Code: {admin.classroom_code}
                      </span>
                      <span
                        className={admin.is_active ? 'badge badge-green' : 'badge badge-red'}
                        style={{ fontSize: '0.72rem' }}
                      >
                        {admin.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                  👨‍🏫 In-Charge: <strong style={{ color: 'var(--text-primary)' }}>{admin.name}</strong>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                  <button
                    onClick={() => handleOpenClassroom(admin.id)}
                    disabled={isPending}
                    className="btn btn-primary"
                    style={{ flex: 1, padding: '8px 12px', fontSize: '0.85rem' }}
                  >
                    ⚡ Manage as Admin
                  </button>
                  <Link
                    href={`/super-admin/admins`}
                    className="btn btn-secondary"
                    style={{ padding: '8px 12px', fontSize: '0.85rem', textDecoration: 'none' }}
                  >
                    ⚙️
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
            No classrooms configured yet. Click &quot;Create Admin&quot; to provision your first classroom.
          </div>
        )}
      </div>

      {/* Recent Enterprise Audit Trail */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700' }}>Recent Platform Activity</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Real-time audit log of security and administrative operations
            </p>
          </div>
          <Link href="/super-admin/audit" style={{ fontSize: '0.9rem', color: '#a78bfa', textDecoration: 'none' }}>
            View Full Audit Trail →
          </Link>
        </div>

        {metrics?.recentAudits && metrics.recentAudits.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {metrics.recentAudits.map((log) => (
              <div
                key={log.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-color)',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span
                    className={
                      log.action.includes('DELETE') || log.action.includes('RESET')
                        ? 'badge badge-red'
                        : 'badge badge-purple'
                    }
                    style={{ fontSize: '0.75rem', fontWeight: '600' }}
                  >
                    {log.action}
                  </span>
                  <span style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                    By <strong style={{ color: '#f472b6' }}>{log.actor_role}</strong>
                    {log.admins ? ` on ${log.admins.classroom_name} (${log.admins.classroom_code})` : ''}
                  </span>
                </div>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No recent activity recorded yet.
          </div>
        )}
      </div>
    </div>
  );
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '16px',
};

const titleStyle: React.CSSProperties = {
  fontSize: '2rem',
  fontWeight: '800',
  letterSpacing: '-0.5px',
  background: 'linear-gradient(135deg, #f8fafc, #c084fc, #f472b6)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
};

const subtitleStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: '0.95rem',
  marginTop: '4px',
};

const metricGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '20px',
};

const metricCardStyle: React.CSSProperties = {
  padding: '24px 20px',
  display: 'flex',
  alignItems: 'center',
  gap: '18px',
};

const metricIconWrapper = (bg: string, color: string): React.CSSProperties => ({
  width: '52px',
  height: '52px',
  borderRadius: '14px',
  background: bg,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '1.6rem',
  color,
});

const metricValueStyle: React.CSSProperties = {
  fontSize: '1.8rem',
  fontWeight: '800',
  lineHeight: '1.1',
};

const metricLabelStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  marginTop: '4px',
};

const classroomGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: '18px',
};

const classroomCardStyle: React.CSSProperties = {
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  background: 'rgba(255, 255, 255, 0.02)',
  transition: 'var(--transition-fast)',
};
