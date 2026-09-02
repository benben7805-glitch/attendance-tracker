'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  getSubjects,
  getBatches,
  getStudents,
  getBatchStudents,
  addBatch,
  deleteBatch,
  addMultipleStudentsToBatch,
  removeStudentFromBatch,
} from '@/app/actions';
import { getSubjectTypeOption } from '@/lib/attendance';

interface Subject {
  id: string;
  name: string;
  type: string;
}

interface Batch {
  id: string;
  subject_id: string;
  name: string;
  subjects?: { id: string; name: string; type?: string };
}

interface Student {
  roll_number: string;
  name: string;
}

export default function ManageBatchesPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);

  // Create batch form
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [newBatchName, setNewBatchName] = useState('');

  // Selected batch detail view
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [batchStudents, setBatchStudents] = useState<Student[]>([]);
  const [studentFilter, setStudentFilter] = useState('');

  // Status states
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    async function loadInitial() {
      try {
        setLoading(true);
        const [subjectsData, batchesData, studentsData] = await Promise.all([
          getSubjects(),
          getBatches(),
          getStudents(),
        ]);
        setSubjects(subjectsData as unknown as Subject[]);
        setBatches(batchesData as unknown as Batch[]);
        setAllStudents(studentsData as unknown as Student[]);
        if (subjectsData.length > 0) {
          setSelectedSubjectId(subjectsData[0].id);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load data.');
      } finally {
        setLoading(false);
      }
    }
    loadInitial();
  }, []);

  const reloadBatches = async () => {
    const batchesData = await getBatches();
    setBatches(batchesData as unknown as Batch[]);
  };

  const handleSelectBatch = async (batch: Batch) => {
    setError(null);
    setSuccess(null);
    setSelectedBatch(batch);
    setStudentFilter('');
    try {
      const students = await getBatchStudents(batch.id);
      setBatchStudents(students as unknown as Student[]);
    } catch (err: any) {
      setError(err.message || 'Failed to load batch students.');
      setBatchStudents([]);
    }
  };

  const handleAddBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!selectedSubjectId) {
      setError('Please select a subject.');
      return;
    }
    if (!newBatchName.trim()) {
      setError('Please enter a batch name.');
      return;
    }

    startTransition(async () => {
      try {
        await addBatch(selectedSubjectId, newBatchName.trim());
        setSuccess(`Batch "${newBatchName}" added successfully.`);
        setNewBatchName('');
        await reloadBatches();
      } catch (err: any) {
        setError(err.message || 'Failed to add batch.');
      }
    });
  };

  const handleDeleteBatch = async (batch: Batch) => {
    if (!confirm(`Delete batch "${batch.name}"? Students will be removed from this batch (they are not deleted from the system).`)) {
      return;
    }
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        await deleteBatch(batch.id);
        setSuccess(`Batch "${batch.name}" deleted.`);
        setBatches(batches.filter((b) => b.id !== batch.id));
        if (selectedBatch?.id === batch.id) setSelectedBatch(null);
      } catch (err: any) {
        setError(err.message || 'Failed to delete batch.');
      }
    });
  };

  const allStudentsInBatch = new Set(batchStudents.map((s) => s.roll_number));
  const studentsNotInBatch = allStudents.filter(
    (s) => !allStudentsInBatch.has(s.roll_number) &&
      (!studentFilter || s.name.toLowerCase().includes(studentFilter.toLowerCase()))
  );

  const handleAddSelectedStudents = async (rollNumbers: string[]) => {
    if (!selectedBatch || rollNumbers.length === 0) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        await addMultipleStudentsToBatch(selectedBatch.id, rollNumbers);
        const students = await getBatchStudents(selectedBatch.id);
        setBatchStudents(students as unknown as Student[]);
        setStudentFilter('');
        setSuccess(`${rollNumbers.length} student(s) added to batch.`);
      } catch (err: any) {
        setError(err.message || 'Failed to add students.');
      }
    });
  };

  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([]);

  const handleRemoveStudent = async (rollNumber: string) => {
    if (!selectedBatch) return;
    if (!confirm(`Remove student ${rollNumber} from this batch?`)) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        await removeStudentFromBatch(selectedBatch.id, rollNumber);
        setBatchStudents(batchStudents.filter((s) => s.roll_number !== rollNumber));
        setSuccess('Student removed from batch.');
      } catch (err: any) {
        setError(err.message || 'Failed to remove student.');
      }
    });
  };

  return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <div>
          <h1 className="text-gradient" style={titleStyle}>Manage Batches</h1>
          <p style={subtitleStyle}>
            Create optional batches per subject and assign students. Parents can track attendance per batch.
          </p>
        </div>
      </header>

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

      {loading ? (
        <div className="flex-center" style={{ minHeight: '200px' }}>
          <div className="loader" />
        </div>
      ) : (
        <div className="responsive-grid-1-2">
          {/* Batch list + creation panel */}
          <section className="glass-panel" style={panelStyle}>
            <h2 style={panelTitleStyle}>Batches</h2>

            {/* Create batch form */}
            <form onSubmit={handleAddBatch} style={formStyle}>
              <div style={formGroupStyle}>
                <label style={labelStyle}>Subject</label>
                {subjects.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    No subjects defined. Add subjects first.
                  </p>
                ) : (
                  <select
                    className="input-field"
                    value={selectedSubjectId}
                    onChange={(e) => setSelectedSubjectId(e.target.value)}
                    style={selectStyle}
                  >
                    {subjects.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name} ({getSubjectTypeOption(sub.type).label})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div style={formGroupStyle}>
                <label style={labelStyle}>Batch Name</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Batch A"
                  value={newBatchName}
                  onChange={(e) => setNewBatchName(e.target.value)}
                  disabled={isPending}
                  required
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isPending || subjects.length === 0}
              >
                ➕ Add Batch
              </button>
            </form>

            {/* Batch list */}
            {batches.length === 0 ? (
              <div style={emptyStateStyle}>
                <p>No batches created yet.</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Create a batch using the form above.
                </p>
              </div>
            ) : (
              <div style={batchListStyle}>
                {batches.map((batch) => {
                  const isSelected = selectedBatch?.id === batch.id;
                  const subjectName = batch.subjects?.name || 'Unknown Subject';
                  return (
                    <div
                      key={batch.id}
                      style={{
                        ...batchCardStyle,
                        borderColor: isSelected ? 'var(--accent-primary)' : 'var(--border-color)',
                        background: isSelected ? 'rgba(139, 92, 246, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                      }}
                    >
                      <div
                        style={batchInfoStyle}
                        onClick={() => handleSelectBatch(batch)}
                        role="button"
                        tabIndex={0}
                      >
                        <span style={batchNameStyle}>{batch.name}</span>
                        <span style={batchSubjectStyle}>
                          {getSubjectTypeOption(batch.subjects?.type).icon} {subjectName}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteBatch(batch)}
                        className="btn btn-icon"
                        disabled={isPending}
                        title="Delete batch"
                        style={{ color: 'var(--danger)' }}
                      >
                        🗑️
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Batch detail panel */}
          <section className="glass-panel" style={panelStyle}>
            <h2 style={panelTitleStyle}>
              {selectedBatch ? `Batch: ${selectedBatch.name}` : 'Batch Details'}
            </h2>

            {!selectedBatch ? (
              <div style={emptyStateStyle}>
                <span style={{ fontSize: '2rem' }}>👥</span>
                <p>Select a batch on the left to manage its students.</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Add or remove students assigned to this batch.
                </p>
              </div>
            ) : (
              <div style={detailContentStyle}>
                {/* Current students in batch */}
                <div>
                  <h3 style={subsectionTitleStyle}>
                    Students in Batch ({batchStudents.length})
                  </h3>
                  {batchStudents.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      No students assigned yet.
                    </p>
                  ) : (
                    <div style={assignedListStyle}>
                      {batchStudents.map((s) => (
                        <div key={s.roll_number} style={assignedItemStyle}>
                          <div style={assignedInfoStyle}>
                            <span style={{ fontWeight: '500', fontSize: '0.95rem' }}>{s.name}</span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{s.roll_number}</span>
                          </div>
                          <button
                            onClick={() => handleRemoveStudent(s.roll_number)}
                            className="btn btn-icon"
                            disabled={isPending}
                            title="Remove from batch"
                            style={{ color: 'var(--danger)' }}
                          >
                            ➖
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add students */}
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                  <h3 style={subsectionTitleStyle}>Add Students</h3>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="🔍 Search students by name..."
                    value={studentFilter}
                    onChange={(e) => {
                      setStudentFilter(e.target.value);
                      setSelectedToAdd([]);
                    }}
                    style={{ marginBottom: '10px' }}
                  />

                  {studentsNotInBatch.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      {studentFilter ? 'No students match the search.' : 'All students are already in this batch.'}
                    </p>
                  ) : (
                    <>
                      <div style={availableListStyle}>
                        {studentsNotInBatch.map((s) => {
                          const isChecked = selectedToAdd.includes(s.roll_number);
                          return (
                            <label key={s.roll_number} style={availableItemStyle}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setSelectedToAdd((prev) =>
                                    isChecked
                                      ? prev.filter((r) => r !== s.roll_number)
                                      : [...prev, s.roll_number]
                                  );
                                }}
                                style={{ accentColor: '#8b5cf6' }}
                              />
                              <span style={{ fontWeight: '500', fontSize: '0.9rem' }}>{s.name}</span>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{s.roll_number}</span>
                            </label>
                          );
                        })}
                      </div>
                      <button
                        onClick={() => {
                          handleAddSelectedStudents(selectedToAdd);
                          setSelectedToAdd([]);
                        }}
                        className="btn btn-primary"
                        disabled={isPending || selectedToAdd.length === 0}
                        style={{ marginTop: '10px', width: '100%' }}
                      >
                        ➕ Add Selected ({selectedToAdd.length})
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      <style jsx>{`
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
      `}</style>
    </div>
  );
}

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
  marginTop: '4px',
};

const panelStyle: React.CSSProperties = {
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
  gap: '14px',
  padding: '16px',
  background: 'rgba(255,255,255,0.02)',
  borderRadius: '12px',
  border: '1px solid var(--border-color)',
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

const selectStyle: React.CSSProperties = {
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  backgroundSize: '16px',
  paddingRight: '40px',
};

const emptyStateStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '40px 20px',
  color: 'var(--text-secondary)',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  alignItems: 'center',
};

const batchListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  maxHeight: '420px',
  overflowY: 'auto',
};

const batchCardStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '14px 16px',
  borderRadius: '10px',
  border: '1px solid var(--border-color)',
  cursor: 'pointer',
  transition: 'var(--transition-fast)',
};

const batchInfoStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  flex: 1,
};

const batchNameStyle: React.CSSProperties = {
  fontWeight: '600',
  fontSize: '1rem',
};

const batchSubjectStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
};

const detailContentStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

const subsectionTitleStyle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: '600',
  marginBottom: '10px',
};

const assignedListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  maxHeight: '200px',
  overflowY: 'auto',
};

const assignedItemStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 12px',
  background: 'rgba(16, 185, 129, 0.03)',
  border: '1px solid rgba(16, 185, 129, 0.15)',
  borderRadius: '8px',
};

const assignedInfoStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
};

const availableListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  maxHeight: '200px',
  overflowY: 'auto',
};

const availableItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '10px 12px',
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  cursor: 'pointer',
};
