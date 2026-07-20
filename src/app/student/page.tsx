'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, getStudentReport, logoutAction } from '@/app/actions';

interface SubjectStat {
  id: string;
  name: string;
  totalClasses: number;
  attended: number;
  absent: number;
}

interface AbsentDay {
  date: string;
  time: string;
  subject: string;
}

interface LogItem {
  classId: string;
  subjectName: string;
  date: string;
  time: string;
  status: 'present' | 'absent' | 'unmarked';
}

interface StudentReport {
  student: {
    roll_number: string;
    name: string;
  };
  subjectStats: SubjectStat[];
  absentDays: AbsentDay[];
  fullAttendanceLog: LogItem[];
}

export default function StudentDashboard() {
  const [report, setReport] = useState<StudentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activeFilter, setActiveFilter] = useState<'all' | 'present' | 'absent' | 'unmarked'>('all');
  const router = useRouter();

  useEffect(() => {
    async function loadReport() {
      try {
        setLoading(true);
        const session = await getSession();
        if (session.role !== 'student' || !session.rollNumber) {
          router.push('/');
          router.refresh();
          return;
        }

        const data = await getStudentReport(session.rollNumber);
        setReport(data as unknown as StudentReport);
      } catch (err: any) {
        setError(err.message || 'Failed to load attendance report.');
      } finally {
        setLoading(false);
      }
    }
    loadReport();
  }, [router]);

  const handleLogout = async () => {
    startTransition(async () => {
      await logoutAction();
      router.push('/');
      router.refresh();
    });
  };

  // Filter full history logs
  const filteredLogs = report?.fullAttendanceLog.filter((log) => {
    if (activeFilter === 'all') return true;
    return log.status === activeFilter;
  }) || [];

  if (loading) {
    return (
      <div style={fullPageSpinnerStyle}>
        <div className="loader" />
        <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Loading your dashboard...</p>
        <style jsx>{`
          .loader {
            width: 48px;
            height: 48px;
            border: 4px solid rgba(255, 255, 255, 0.1);
            border-radius: 50%;
            border-top-color: var(--accent-primary);
            animation: spin 1s ease infinite;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div style={fullPageSpinnerStyle}>
        <div className="alert-error" style={{ maxWidth: '400px' }}>
          <span>⚠️</span> <span>{error || 'Access denied.'}</span>
        </div>
        <button onClick={() => router.push('/')} className="btn btn-secondary" style={{ marginTop: '16px' }}>
          Go to Login
        </button>
      </div>
    );
  }

  const { student, subjectStats, absentDays } = report;

  return (
    <div className="container animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header Bar */}
      <header className="glass-panel" style={headerStyle}>
        <div style={studentProfileStyle}>
          <div style={avatarStyle}>🎓</div>
          <div>
            <span style={rollBadgeStyle}>{student.roll_number}</span>
            <h1 className="text-gradient" style={studentNameStyle}>{student.name}</h1>
          </div>
        </div>
        <button onClick={handleLogout} className="btn btn-secondary" disabled={isPending} style={logoutBtnStyle}>
          🚪 Sign Out
        </button>
      </header>

      {/* Subject Wise Cards Grid */}
      <section style={sectionContainerStyle}>
        <h2 style={sectionTitleStyle}>Subject Attendance Summary</h2>
        <div style={cardsGridStyle}>
          {subjectStats.map((stat) => {
            const pct = stat.totalClasses > 0 ? Math.round((stat.attended / stat.totalClasses) * 100) : null;
            const isOnTrack = pct !== null && pct >= 75;
            
            return (
              <div key={stat.id} className="glass-panel" style={cardStyle}>
                <h3 style={cardSubjectTitleStyle}>{stat.name}</h3>
                
                <div style={cardDataContainerStyle}>
                  {pct !== null ? (
                    <div style={pctDisplayContainerStyle}>
                      <span
                        className="text-gradient-purple"
                        style={{
                          fontSize: '2.5rem',
                          fontWeight: '800',
                          lineHeight: '1',
                        }}
                      >
                        {pct}%
                      </span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontWeight: '600',
                          backgroundColor: isOnTrack ? 'var(--success-glow)' : 'var(--danger-glow)',
                          color: isOnTrack ? 'var(--success)' : 'var(--danger)',
                          alignSelf: 'center',
                        }}
                      >
                        {isOnTrack ? 'Good' : 'Low'}
                      </span>
                    </div>
                  ) : (
                    <div style={pctDisplayContainerStyle}>
                      <span style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--text-muted)' }}>
                        -- %
                      </span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontWeight: '600',
                          backgroundColor: 'rgba(255,255,255,0.05)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        No Classes
                      </span>
                    </div>
                  )}

                  {/* Ratio bar */}
                  <div style={pctBarContainerStyle}>
                    <div
                      style={{
                        ...pctBarFillStyle,
                        width: pct !== null ? `${pct}%` : '0%',
                        background: pct !== null 
                          ? (isOnTrack ? 'linear-gradient(90deg, #10b981, #059669)' : 'linear-gradient(90deg, #ef4444, #dc2626)') 
                          : 'rgba(255,255,255,0.1)',
                      }}
                    />
                  </div>

                  <div style={ratioTextStyle}>
                    <span>Attended: <strong>{stat.attended}</strong></span>
                    <span>Total Held: <strong>{stat.totalClasses}</strong></span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Details Grid (Absences & Logs) */}
      <div className="responsive-grid-1-2">
        {/* Left: Absence Log */}
        <section className="glass-panel" style={detailPanelStyle}>
          <h2 style={detailPanelTitleStyle}>
            ⚠️ Absent Days Report ({absentDays.length})
          </h2>
          <p style={detailPanelSubtitleStyle}>List of dates and times you were marked absent</p>

          {absentDays.length === 0 ? (
            <div style={emptyLogsStyle}>
              <span style={{ fontSize: '2.5rem' }}>🎉</span>
              <p style={{ fontWeight: '500', color: 'var(--success)' }}>Perfect attendance! No absent days recorded.</p>
            </div>
          ) : (
            <div style={absentListStyle}>
              {absentDays.map((day, idx) => (
                <div key={idx} style={absentItemStyle}>
                  <div style={absentInfoStyle}>
                    <span style={absentSubjectStyle}>{day.subject}</span>
                    <span style={absentTimeStyle}>🕒 {day.time}</span>
                  </div>
                  <div style={absentDateStyle}>
                    {new Date(day.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right: Full Log */}
        <section className="glass-panel" style={detailPanelStyle}>
          <div style={detailPanelHeaderStyle}>
            <div>
              <h2 style={detailPanelTitleStyle}>📋 Full History Logs</h2>
              <p style={detailPanelSubtitleStyle}>Complete record of all classes held</p>
            </div>
            
            {/* Filter selectors */}
            <div style={filterContainerStyle}>
              {(['all', 'present', 'absent', 'unmarked'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  style={{
                    ...filterBtnStyle,
                    ...(activeFilter === filter ? activeFilterBtnStyle : {}),
                  }}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {filteredLogs.length === 0 ? (
            <div style={emptyLogsStyle}>
              <p>No records match the selected filter.</p>
            </div>
          ) : (
            <div style={logListStyle}>
              {filteredLogs.map((log) => (
                <div key={log.classId} style={logItemStyle}>
                  <div style={logInfoStyle}>
                    <span style={logSubjectStyle}>{log.subjectName}</span>
                    <div style={logMetaRowStyle}>
                      <span>📅 {log.date}</span>
                      <span>🕒 {log.time}</span>
                    </div>
                  </div>
                  <span
                    style={{
                      ...statusBadgeStyle,
                      ...(log.status === 'present'
                        ? presentBadgeStyle
                        : log.status === 'absent'
                        ? absentBadgeStyle
                        : unmarkedBadgeStyle),
                    }}
                  >
                    {log.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// Styles
const fullPageSpinnerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  width: '100%',
  background: 'var(--bg-primary)',
};


const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '20px 32px',
  borderRadius: '20px',
  flexWrap: 'wrap',
  gap: '16px',
};

const studentProfileStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
};

const avatarStyle: React.CSSProperties = {
  width: '56px',
  height: '56px',
  borderRadius: '14px',
  background: 'rgba(6, 182, 212, 0.1)',
  border: '1px solid rgba(6, 182, 212, 0.2)',
  display: 'flex',
  alignItems: 'center',
  fontSize: '1.75rem',
  // Flex center helper
  justifyContent: 'center',
};

const rollBadgeStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid var(--border-color)',
  padding: '2px 8px',
  borderRadius: '6px',
  color: 'var(--text-secondary)',
  fontWeight: '600',
  letterSpacing: '0.5px',
};

const studentNameStyle: React.CSSProperties = {
  fontSize: '1.5rem',
  fontWeight: '700',
  marginTop: '4px',
};

const logoutBtnStyle: React.CSSProperties = {
  padding: '10px 18px',
  fontSize: '0.9rem',
};

const sectionContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '1.25rem',
  fontWeight: '600',
  color: 'var(--text-primary)',
};

const cardsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: '20px',
};

const cardStyle: React.CSSProperties = {
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
};

const cardSubjectTitleStyle: React.CSSProperties = {
  fontSize: '1.1rem',
  fontWeight: '600',
  lineHeight: '1.3',
  minHeight: '2.6em', // Reserve space for 2 lines
};

const cardDataContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

const pctDisplayContainerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
};

const pctBarContainerStyle: React.CSSProperties = {
  height: '6px',
  background: 'rgba(255, 255, 255, 0.05)',
  borderRadius: '3px',
  overflow: 'hidden',
  width: '100%',
};

const pctBarFillStyle: React.CSSProperties = {
  height: '100%',
  borderRadius: '3px',
  transition: 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
};

const ratioTextStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
};


const detailPanelStyle: React.CSSProperties = {
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

const detailPanelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '12px',
  borderBottom: '1px solid var(--border-color)',
  paddingBottom: '16px',
};

const detailPanelTitleStyle: React.CSSProperties = {
  fontSize: '1.2rem',
  fontWeight: '600',
};

const detailPanelSubtitleStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  marginTop: '2px',
};

const emptyLogsStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '60px 20px',
  color: 'var(--text-secondary)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '10px',
};

const absentListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  maxHeight: '400px',
  overflowY: 'auto',
  paddingRight: '4px',
};

const absentItemStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 16px',
  background: 'rgba(239, 68, 68, 0.03)',
  border: '1px solid rgba(239, 68, 68, 0.1)',
  borderRadius: '10px',
};

const absentInfoStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const absentSubjectStyle: React.CSSProperties = {
  fontWeight: '600',
  fontSize: '0.95rem',
};

const absentTimeStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
};

const absentDateStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  fontWeight: '600',
  color: '#fca5a5',
};

// Filter tab styles
const filterContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '4px',
  background: 'rgba(0,0,0,0.2)',
  padding: '4px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
};

const filterBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: '0.8rem',
  border: 'none',
  background: 'transparent',
  color: 'var(--text-secondary)',
  borderRadius: '6px',
  cursor: 'pointer',
  transition: 'var(--transition-fast)',
  outline: 'none',
};

const activeFilterBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  color: 'var(--text-primary)',
  fontWeight: '500',
};

const logListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  maxHeight: '400px',
  overflowY: 'auto',
  paddingRight: '4px',
};

const logItemStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 16px',
  background: 'rgba(255,255,255,0.01)',
  border: '1px solid var(--border-color)',
  borderRadius: '10px',
};

const logInfoStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const logSubjectStyle: React.CSSProperties = {
  fontWeight: '600',
  fontSize: '0.95rem',
};

const logMetaRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
};

const statusBadgeStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  padding: '4px 10px',
  borderRadius: '6px',
  fontWeight: '700',
  letterSpacing: '0.5px',
};

const presentBadgeStyle: React.CSSProperties = {
  background: 'var(--success-glow)',
  color: 'var(--success)',
};

const absentBadgeStyle: React.CSSProperties = {
  background: 'var(--danger-glow)',
  color: 'var(--danger)',
};

const unmarkedBadgeStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  color: 'var(--text-muted)',
};
