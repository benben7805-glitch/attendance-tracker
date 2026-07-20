'use client';

import { useState, useEffect, useTransition } from 'react';
import { getSubjects, addSubject, deleteSubject } from '@/app/actions';

interface Subject {
  id: string;
  name: string;
  created_at: string;
}

export default function ManageSubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Status states
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load subjects
  const loadSubjectsList = async () => {
    try {
      setLoading(true);
      const data = await getSubjects();
      setSubjects(data as unknown as Subject[]);
    } catch (err: any) {
      setError(err.message || 'Failed to load subjects.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubjectsList();
  }, []);

  // Handle subject creation
  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!newSubjectName.trim()) {
      setError('Please enter a subject name.');
      return;
    }

    startTransition(async () => {
      try {
        await addSubject(newSubjectName.trim());
        setSuccess(`Subject "${newSubjectName}" added successfully.`);
        setNewSubjectName('');
        // Reload list
        const updatedList = await getSubjects();
        setSubjects(updatedList as unknown as Subject[]);
      } catch (err: any) {
        setError(err.message || 'Failed to add subject.');
      }
    });
  };

  // Handle subject deletion
  const handleDeleteSubject = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete subject "${name}"? This will permanently delete all weekly schedules and attendance records for this subject.`)) {
      return;
    }
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        await deleteSubject(id);
        setSuccess(`Subject "${name}" deleted successfully.`);
        setSubjects(subjects.filter((s) => s.id !== id));
      } catch (err: any) {
        setError(err.message || 'Failed to delete subject.');
      }
    });
  };

  // Filter subjects based on search query
  const filteredSubjects = subjects.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <div>
          <h1 className="text-gradient" style={titleStyle}>Manage Subjects</h1>
          <p style={subtitleStyle}>Create and manage academic subjects</p>
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
          <h2 style={panelTitleStyle}>Add Subject</h2>
          <form onSubmit={handleAddSubject} style={formStyle}>
            <div style={formGroupStyle}>
              <label style={labelStyle}>Subject Name</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Mathematics II"
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
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
              {isPending ? 'Adding...' : 'Add Subject'}
            </button>
          </form>
        </section>

        {/* Subjects list Card */}
        <section className="glass-panel" style={listCardStyle}>
          <div style={listHeaderStyle}>
            <h2 style={panelTitleStyle}>Created Subjects ({subjects.length})</h2>
            <input
              type="text"
              className="input-field"
              placeholder="🔍 Search subjects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={searchStyle}
            />
          </div>

          {loading ? (
            <div className="flex-center" style={{ minHeight: '200px' }}>
              <div className="loader" />
            </div>
          ) : filteredSubjects.length === 0 ? (
            <div style={emptyStateStyle}>
              <p>No subjects found.</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {searchQuery ? 'Try adjusting your search filter.' : 'Add a new subject on the left.'}
              </p>
            </div>
          ) : (
            <div style={tableContainerStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr style={tableHeaderRowStyle}>
                    <th style={{ ...thStyle, width: '80%' }}>Subject Name</th>
                    <th style={{ ...thStyle, width: '20%', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubjects.map((sub) => (
                    <tr key={sub.id} style={trStyle} className="table-row">
                      <td style={{ ...tdStyle, fontWeight: '500' }}>{sub.name}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <button
                          onClick={() => handleDeleteSubject(sub.id, sub.name)}
                          className="btn btn-icon"
                          title="Delete Subject"
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

// Styles (Reused from students page for visual consistency)
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
