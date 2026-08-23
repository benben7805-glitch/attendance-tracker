import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSubjectAttendanceReport } from '@/app/actions';
import {
  getSubjectTypeOption,
  getMinAttendance,
  meetsMinimumAttendance,
  classesNeededToReachMinimum,
  type SubjectType,
} from '@/lib/attendance';

const typeBadgeColors: Record<SubjectType, { color: string; background: string; border: string }> = {
  theory: {
    color: '#a78bfa',
    background: 'rgba(139, 92, 246, 0.12)',
    border: 'rgba(139, 92, 246, 0.3)',
  },
  practical: {
    color: '#22d3ee',
    background: 'rgba(34, 211, 238, 0.1)',
    border: 'rgba(34, 211, 238, 0.3)',
  },
  clinics: {
    color: '#fb7185',
    background: 'rgba(251, 113, 133, 0.1)',
    border: 'rgba(251, 113, 133, 0.3)',
  },
};

export default async function SubjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let report;
  try {
    report = await getSubjectAttendanceReport(id);
  } catch {
    notFound();
  }

  const { subject, rows, totalClassesHeld } = report;
  const minRequired = getMinAttendance(subject.type);

  return (
    <div className="container animate-fade-in" style={containerStyle}>
      <Link href="/admin/subjects" className="back-link">
        ← Back to Subjects
      </Link>

      <header className="glass-panel" style={headerStyle}>
        <div>
          <h1 className="text-gradient" style={titleStyle}>
            {subject.name}
          </h1>
          <span
            style={{
              ...typeBadgeStyle,
              color: typeBadgeColors[subject.type].color,
              background: typeBadgeColors[subject.type].background,
              borderColor: typeBadgeColors[subject.type].border,
            }}
          >
            {getSubjectTypeOption(subject.type).icon} {getSubjectTypeOption(subject.type).label} · Min{' '}
            {minRequired}%
          </span>
        </div>
        <div style={summaryStatStyle}>
          <span style={summaryValueStyle}>{totalClassesHeld}</span>
          <span style={summaryLabelStyle}>Classes Held</span>
        </div>
      </header>

      <section className="glass-panel" style={panelStyle}>
        <h2 style={panelTitleStyle}>Student Attendance ({rows.length})</h2>
        <p style={panelSubtitleStyle}>
          How many classes each student has attended for this subject, lowest attendance first.
        </p>

        {rows.length === 0 ? (
          <div style={emptyStateStyle}>
            <p>No students registered yet.</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Add students under Manage Students.
            </p>
          </div>
        ) : (
          <div style={tableContainerStyle}>
            <table style={tableStyle}>
              <thead>
                <tr style={tableHeaderRowStyle}>
                  <th style={thStyle}>Roll Number</th>
                  <th style={thStyle}>Name</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Classes Gone</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Absent</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Total Marked</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Attendance %</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isBelow =
                    row.pct !== null &&
                    !meetsMinimumAttendance(row.attended, row.totalClasses, minRequired);
                  const needed = classesNeededToReachMinimum(
                    row.attended,
                    row.totalClasses,
                    minRequired
                  );
                  return (
                    <tr key={row.rollNumber} style={trStyle} className="table-row">
                      <td style={tdStyle}>{row.rollNumber}</td>
                      <td style={{ ...tdStyle, fontWeight: '500' }}>{row.name}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{row.attended}</td>
                      <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--danger)' }}>
                        {row.absent}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{row.totalClasses}</td>
                      <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '700' }}>
                        {row.pct !== null ? `${row.pct}%` : '--'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {row.pct === null ? (
                          <span style={neutralBadgeStyle}>No Records</span>
                        ) : isBelow ? (
                          <span style={belowBadgeStyle}>
                            Attend {needed} more class{needed === 1 ? '' : 'es'}
                          </span>
                        ) : (
                          <span style={okBadgeStyle}>✓ Meets {minRequired}%</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
  padding: '20px 32px',
  borderRadius: '20px',
  flexWrap: 'wrap',
  gap: '16px',
};

const titleStyle: React.CSSProperties = {
  fontSize: '2rem',
  fontWeight: '700',
  marginBottom: '8px',
};

const typeBadgeStyle: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '0.8rem',
  fontWeight: '600',
  padding: '4px 12px',
  borderRadius: '6px',
  border: '1px solid transparent',
};

const summaryStatStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '4px',
  padding: '12px 20px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--border-color)',
  borderRadius: '14px',
};

const summaryValueStyle: React.CSSProperties = {
  fontSize: '1.75rem',
  fontWeight: '800',
  lineHeight: '1',
};

const summaryLabelStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const panelStyle: React.CSSProperties = {
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

const panelTitleStyle: React.CSSProperties = {
  fontSize: '1.25rem',
  fontWeight: '600',
};

const panelSubtitleStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  color: 'var(--text-secondary)',
  marginTop: '-10px',
};

const emptyStateStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '60px 20px',
  color: 'var(--text-secondary)',
};

const tableContainerStyle: React.CSSProperties = {
  width: '100%',
  overflowX: 'auto',
  border: '1px solid var(--border-color)',
  borderRadius: '10px',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  textAlign: 'left',
};

const tableHeaderRowStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--border-color)',
  background: 'rgba(255, 255, 255, 0.01)',
};

const thStyle: React.CSSProperties = {
  padding: '14px 16px',
  fontSize: '0.85rem',
  fontWeight: '600',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const trStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--border-color)',
};

const tdStyle: React.CSSProperties = {
  padding: '14px 16px',
  fontSize: '0.95rem',
  color: 'var(--text-primary)',
};

const okBadgeStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: '600',
  padding: '4px 10px',
  borderRadius: '6px',
  whiteSpace: 'nowrap',
  background: 'var(--success-glow)',
  color: 'var(--success)',
};

const belowBadgeStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: '600',
  padding: '4px 10px',
  borderRadius: '6px',
  whiteSpace: 'nowrap',
  background: 'var(--danger-glow)',
  color: 'var(--danger)',
};

const neutralBadgeStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: '600',
  padding: '4px 10px',
  borderRadius: '6px',
  whiteSpace: 'nowrap',
  background: 'rgba(255,255,255,0.05)',
  color: 'var(--text-muted)',
};
