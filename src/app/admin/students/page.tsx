'use client';

import { useState, useEffect, useTransition } from 'react';
import { getStudents, addStudent, deleteStudent } from '@/app/actions';

interface Student {
  roll_number: string;
  name: string;
  created_at: string;
}

export default function ManageStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [newRollNumber, setNewRollNumber] = useState('');
  const [newName, setNewName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Status states
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Initial load
  useEffect(() => {
    let isMounted = true;

    async function fetchStudents() {
      try {
        const data = await getStudents();
        if (isMounted) {
          setStudents(data as unknown as Student[]);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load students.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchStudents();

    return () => {
      isMounted = false;
    };
  }, []);

  // Handle student creation
  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!newRollNumber.trim() || !newName.trim()) {
      setError('Please fill in both fields.');
      return;
    }

    startTransition(async () => {
      try {
        await addStudent(newRollNumber.trim().toUpperCase(), newName.trim());
        setSuccess(`Student "${newName}" added successfully.`);
        setNewRollNumber('');
        setNewName('');
        // Reload list
        const updatedList = await getStudents();
        setStudents(updatedList as unknown as Student[]);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to add student.');
      }
    });
  };

  // Handle student deletion
  const handleDeleteStudent = async (rollNumber: string, name: string) => {
    if (!confirm(`Are you sure you want to delete student "${name}" (${rollNumber})? This will permanently delete all of their attendance records.`)) {
      return;
    }
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        await deleteStudent(rollNumber);
        setSuccess(`Student "${name}" deleted successfully.`);
        setStudents((prev) => prev.filter((s) => s.roll_number !== rollNumber));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to delete student.');
      }
    });
  };

  // Filter students based on search query
  const filteredStudents = students.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.roll_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <div>
          <h1 className="text-gradient" style={titleStyle}>Manage Students</h1>
          <p style={subtitleStyle}>Register new students and manage the roster</p>
        </div>
      </header>

      {/* Message banners */}
      {error && (
        <div className="alert-error animate-fade-in">
          <span>⚠️</span> <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="alert-success animate-fade-in">
          <span>✅</span> <span>{success}</span>
        </div>
      )}

      <div className="responsive-grid-1-2">
        {/* Registration Form Card */}
        <section className="glass-panel" style={formCardStyle}>
          <h2 style={panelTitleStyle}>Register Student</h2>
          <form onSubmit={handleAddStudent} style={formStyle}>
            <div style={formGroupStyle}>
              <label style={labelStyle}>Roll Number</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. CS202601"
                value={newRollNumber}
                onChange={(e) => setNewRollNumber(e.target.value)}
                disabled={isPending}
                required
              />
            </div>
            <div style={formGroupStyle}>
              <label style={labelStyle}>Full Name</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Simon Vance"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={isPending}
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isPending}
              style={{ marginTop: '8px' }}
            >
              {isPending ? 'Registering...' : 'Add Student'}
            </button>
          </form>
        </section>

        {/* Student Roster Card */}
        <section className="glass-panel" style={listCardStyle}>
          <div style={listHeaderStyle}>
            <h2 style={panelTitleStyle}>Registered Students ({students.length})</h2>
            <input
              type="text"
              className="input-field"
              placeholder="🔍 Search name or roll number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={searchStyle}
            />
          </div>

          {loading ? (
            <div className="flex-center" style={{ minHeight: '200px' }}>
              <div className="loader" />
            </div>
          ) : filteredStudents.length === 0 ? (
            <div style={emptyStateStyle}>
              <p>No students found.</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {searchQuery ? 'Try adjusting your search filter.' : 'Register a new student on the left.'}
              </p>
            </div>
          ) : (
            <div style={tableContainerStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr style={tableHeaderRowStyle}>
                    <th style={{ ...thStyle, width: '35%' }}>Roll Number</th>
                    <th style={{ ...thStyle, width: '45%' }}>Name</th>
                    <th style={{ ...thStyle, width: '20%', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student) => (
                    <tr key={student.roll_number} style={trStyle} className="table-row">
                      <td style={tdStyle}>
                        <code style={codeStyle}>{student.roll_number}</code>
                      </td>
                      <td style={{ ...tdStyle, fontWeight: '500' }}>{student.name}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <button
                          onClick={() => handleDeleteStudent(student.roll_number, student.name)}
                          className="btn btn-icon"
                          title="Delete Student"
                          disabled={isPending}
                          style={{ color: 'var(--danger)' }}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <style jsx global>{`
        .loader {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(255, 255, 255, 0.1);
          border-radius: 50%;
          border-top-color: var(--accent-primary);
          animation: spin 1s ease infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .table-row {
          transition: var(--transition-fast);
        }
        .table-row:hover {
          background: rgba(255, 255, 255, 0.02) !important;
        }
      `}</style>
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


const formCardStyle: React.CSSProperties = {
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
  height: 'fit-content',
};

const listCardStyle: React.CSSProperties = {
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
};

const panelTitleStyle: React.CSSProperties = {
  fontSize: '1.25rem',
  fontWeight: '600',
};

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

const formGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
};

const listHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '12px',
};

const searchStyle: React.CSSProperties = {
  maxWidth: '260px',
  padding: '8px 12px',
  fontSize: '0.9rem',
};

const emptyStateStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '60px 20px',
  color: 'var(--text-secondary)',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
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

const codeStyle: React.CSSProperties = {
  background: 'rgba(139, 92, 246, 0.1)',
  color: '#c084fc',
  padding: '2px 6px',
  borderRadius: '4px',
  fontSize: '0.85rem',
  fontWeight: '600',
};
