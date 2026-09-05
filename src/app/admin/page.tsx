'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  getClassesForDate,
  addCustomClass,
  deleteClass,
  getSubjects,
  getStudents,
  getClassAttendance,
  saveAttendance,
  getBatchesForSubject,
  getBatchMemberRollNumbers,
} from '@/app/actions';
import { getSubjectTypeOption, SubjectType } from '@/lib/attendance';

interface Subject {
  id: string;
  name: string;
  type?: string;
}

interface Student {
  roll_number: string;
  name: string;
}

interface ClassItem {
  id: string;
  subject_id: string;
  date: string;
  start_time: string;
  end_time: string;
  batch_id?: string | null;
  subjects: {
    id: string;
    name: string;
    type?: string;
  };
  batches?: {
    id: string;
    name: string;
  } | null;
}

interface BatchItem {
  id: string;
  subject_id: string;
  name: string;
}

interface AttendanceRecord {
  student_roll_number: string;
  status: 'present' | 'absent';
}

export default function DailyManagerPage() {
  const [date, setDate] = useState(() => {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localDate = new Date(today.getTime() - offset * 60 * 1000);
    return localDate.toISOString().split('T')[0];
  });

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [batches, setBatches] = useState<BatchItem[]>([]);
  
  // Custom class form states
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  
  // UI states
  const [loading, setLoading] = useState(true);
  const [actionPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Attendance management states
  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, 'present' | 'absent'>>({});
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);

  // Load batches for a given subject
  const loadBatches = async (subjectId: string) => {
    try {
      const data = await getBatchesForSubject(subjectId);
      setBatches(data as unknown as BatchItem[]);
      setSelectedBatchId('');
    } catch {
      setBatches([]);
    }
  };

  const handleSubjectChange = (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    setSelectedBatchId('');
    loadBatches(subjectId);
  };

  // Fetch classes, subjects, and students
  useEffect(() => {
    async function loadInitialData() {
      try {
        setLoading(true);
        setError(null);
        const [subjectsData, studentsData] = await Promise.all([
          getSubjects(),
          getStudents(),
        ]);
        setSubjects(subjectsData);
        setStudents(studentsData);
        if (subjectsData.length > 0) {
          setSelectedSubjectId(subjectsData[0].id);
          loadBatches(subjectsData[0].id);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load configuration data.');
      } finally {
        setLoading(false);
      }
    }
    loadInitialData();
  }, []);

  // Fetch classes when date changes
  useEffect(() => {
    async function loadClasses() {
      try {
        setLoading(true);
        setError(null);
        const classesData = await getClassesForDate(date);
        setClasses(classesData as unknown as ClassItem[]);
        // Reset attendance view if active class date changed
        setActiveClassId(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load classes for selected date.');
      } finally {
        setLoading(false);
      }
    }
    loadClasses();
  }, [date]);

  // Create custom class
  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!selectedSubjectId) {
      setError('Please select a subject.');
      return;
    }

    startTransition(async () => {
      try {
        await addCustomClass(selectedSubjectId, date, startTime, endTime, selectedBatchId || undefined);
        setSuccessMsg('Class added successfully.');
        const updatedClasses = await getClassesForDate(date);
        setClasses(updatedClasses as unknown as ClassItem[]);
      } catch (err: any) {
        setError(err.message || 'Failed to add class.');
      }
    });
  };

  // Delete class instance
  const handleDeleteClass = async (classId: string) => {
    if (!confirm('Are you sure you want to cancel/delete this class? All attendance records for this class will be lost.')) {
      return;
    }
    setError(null);
    setSuccessMsg(null);
    startTransition(async () => {
      try {
        await deleteClass(classId);
        setClasses(classes.filter((c) => c.id !== classId));
        if (activeClassId === classId) setActiveClassId(null);
        setSuccessMsg('Class deleted successfully.');
      } catch (err: any) {
        setError(err.message || 'Failed to delete class.');
      }
    });
  };

  // Open attendance grid for a class
  const handleManageAttendance = async (classId: string) => {
    setError(null);
    setSuccessMsg(null);
    setActiveClassId(classId);
    setAttendanceLoading(true);

    try {
      const existingRecords = await getClassAttendance(classId);
      const activeClass = classes.find((c) => c.id === classId);

      // Determine the set of students for this class
      let relevantStudents = students;
      if (activeClass?.batch_id) {
        const memberRolls = await getBatchMemberRollNumbers(activeClass.batch_id);
        const memberSet = new Set(memberRolls);
        relevantStudents = students.filter((s) => memberSet.has(s.roll_number));
      }

      // Create initial local attendance map: roll_number -> status
      const initialMap: Record<string, 'present' | 'absent'> = {};
      
      // Default all relevant students to present if no attendance recorded yet
      relevantStudents.forEach((s) => {
        initialMap[s.roll_number] = 'present';
      });

      // Override with existing records from database
      existingRecords.forEach((record) => {
        initialMap[record.student_roll_number] = record.status as 'present' | 'absent';
      });

      setAttendanceMap(initialMap);
      setFilteredStudents(relevantStudents);
    } catch (err: any) {
      setError(err.message || 'Failed to load attendance.');
      setActiveClassId(null);
    } finally {
      setAttendanceLoading(false);
    }
  };

  // Toggle single student status
  const toggleStudentStatus = (rollNumber: string, status: 'present' | 'absent') => {
    setAttendanceMap((prev) => ({
      ...prev,
      [rollNumber]: status,
    }));
  };

  // Bulk actions
  const markAll = (status: 'present' | 'absent') => {
    const updated = { ...attendanceMap };
    filteredStudents.forEach((s) => {
      updated[s.roll_number] = status;
    });
    setAttendanceMap(updated);
  };

  // Save attendance to database
  const handleSaveAttendance = async () => {
    if (!activeClassId) return;
    setError(null);
    setSuccessMsg(null);

    startTransition(async () => {
      try {
        const records = Object.entries(attendanceMap).map(([rollNumber, status]) => ({
          student_roll_number: rollNumber,
          status,
        }));

        await saveAttendance(activeClassId, records);
        setSuccessMsg('Attendance saved successfully.');
        setActiveClassId(null); // Close panel
      } catch (err: any) {
        setError(err.message || 'Failed to save attendance.');
      }
    });
  };

  return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <div>
          <h1 className="text-gradient" style={titleStyle}>Daily Manager</h1>
          <p style={subtitleStyle}>Manage classes and take attendance for any specific day</p>
        </div>

        {/* Date Selector */}
        <div style={dateContainerStyle}>
          <label style={dateLabelStyle}>Select Date:</label>
          <input
            type="date"
            className="input-field"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={dateInputStyle}
          />
        </div>
      </header>

      {/* Messages */}
      {error && (
        <div className="alert-error animate-fade-in">
          <span>⚠️</span> <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="alert-success animate-fade-in">
          <span>✅</span> <span>{successMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="flex-center" style={{ minHeight: '200px' }}>
          <div className="loader" />
        </div>
      ) : (
        <div className="responsive-grid-2-1">
          {/* Class List Panel */}
          <section className="glass-panel" style={panelStyle}>
            <h2 style={panelTitleStyle}>Scheduled Classes</h2>

            {classes.length === 0 ? (
              <div style={emptyStateStyle}>
                <p>No classes added for this date.</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Add a class using the form on the right.
                </p>
              </div>
            ) : (
              <div style={classListStyle}>
                {classes.map((cls) => {
                  const isActive = activeClassId === cls.id;
                  const typeOption = getSubjectTypeOption(cls.subjects?.type);
                  return (
                    <div
                      key={cls.id}
                      style={{
                        ...classCardStyle,
                        borderColor: isActive ? 'var(--accent-primary)' : 'var(--border-color)',
                        background: isActive ? 'rgba(139, 92, 246, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                      }}
                    >
                      <div style={classInfoStyle}>
                        <div style={classSubjectRowStyle}>
                          <span style={classSubjectStyle}>{cls.subjects?.name}</span>
                          {cls.batches?.name && (
                            <span
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: '600',
                                padding: '2px 10px',
                                borderRadius: '999px',
                                whiteSpace: 'nowrap',
                                color: '#22d3ee',
                                background: 'rgba(34, 211, 238, 0.12)',
                                border: '1px solid rgba(34, 211, 238, 0.35)',
                              }}
                            >
                              👥 {cls.batches.name}
                            </span>
                          )}
                          <span
                            style={{
                              ...typeBadgeBaseStyle,
                              color: typeBadgeColors[typeOption.value].text,
                              background: typeBadgeColors[typeOption.value].bg,
                              border: `1px solid ${typeBadgeColors[typeOption.value].border}`,
                            }}
                          >
                            {typeOption.icon} {typeOption.label}
                          </span>
                        </div>
                        <span style={classTimeStyle}>
                          🕒 {cls.start_time.substring(0, 5)} - {cls.end_time.substring(0, 5)}
                        </span>
                      </div>
                      <div style={classActionsStyle}>
                        <button
                          onClick={() => handleManageAttendance(cls.id)}
                          className={`btn ${isActive ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                          disabled={actionPending}
                        >
                          📝 Attendance
                        </button>
                        <button
                          onClick={() => handleDeleteClass(cls.id)}
                          className="btn btn-icon"
                          style={{ padding: '6px' }}
                          disabled={actionPending}
                          title="Delete class"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Quick Add Custom Class Panel */}
          <section className="glass-panel" style={{ ...panelStyle, gridColumn: 'span 1' }}>
            <h2 style={panelTitleStyle}>Add Custom Class</h2>
            <form onSubmit={handleAddClass} style={addFormStyle}>
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
                    onChange={(e) => handleSubjectChange(e.target.value)}
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
                <label style={labelStyle}>Batch (optional)</label>
                {batches.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No batches for this subject. Class applies to all students.
                  </p>
                ) : (
                  <select
                    className="input-field"
                    value={selectedBatchId}
                    onChange={(e) => setSelectedBatchId(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="">All students</option>
                    {batches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div style={formRowStyle}>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Start Time</label>
                  <input
                    type="time"
                    className="input-field"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                </div>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>End Time</label>
                  <input
                    type="time"
                    className="input-field"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={actionPending || subjects.length === 0}
                style={{ marginTop: '10px' }}
              >
                ➕ Add Class
              </button>
            </form>
          </section>
        </div>
      )}

      {/* Attendance Grid Expansion Drawer */}
      {activeClassId && (
        <section className="glass-panel animate-slide-up" style={attendanceContainerStyle}>
          <div style={attendanceHeaderStyle}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '600' }}>
                Mark Student Attendance
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Class:{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {classes.find((c) => c.id === activeClassId)?.subjects?.name}
                </strong>{' '}
                (
                {
                  getSubjectTypeOption(
                    classes.find((c) => c.id === activeClassId)?.subjects?.type
                  ).label
                }
                )
                {classes.find((c) => c.id === activeClassId)?.batches?.name && (
                  <span> | Batch: <strong style={{ color: 'var(--text-primary)' }}>
                    {classes.find((c) => c.id === activeClassId)?.batches?.name}
                  </strong></span>
                )}
                {' '}| Time:{' '}
                {classes.find((c) => c.id === activeClassId)?.start_time.substring(0, 5)} -{' '}
                {classes.find((c) => c.id === activeClassId)?.end_time.substring(0, 5)}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => markAll('present')}
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                disabled={actionPending}
              >
                Mark All Present
              </button>
              <button
                onClick={() => markAll('absent')}
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                disabled={actionPending}
              >
                Mark All Absent
              </button>
            </div>
          </div>

          {attendanceLoading ? (
            <div className="flex-center" style={{ minHeight: '150px' }}>
              <div className="loader" />
            </div>
          ) : filteredStudents.length === 0 ? (
            <div style={emptyStateStyle}>
              <p>
                {classes.find((c) => c.id === activeClassId)?.batch_id
                  ? 'No students in this batch.'
                  : 'No students registered in the database.'}
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Please add students first.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={attendanceGridStyle}>
                {filteredStudents.map((student) => {
                  const status = attendanceMap[student.roll_number] || 'present';
                  return (
                    <div key={student.roll_number} style={studentRowStyle}>
                      <div style={studentInfoStyle}>
                        <span style={studentNameStyle}>{student.name}</span>
                        <span style={studentRollStyle}>{student.roll_number}</span>
                      </div>
                      <div style={toggleContainerStyle}>
                        <button
                          onClick={() => toggleStudentStatus(student.roll_number, 'present')}
                          className={`btn ${status === 'present' ? 'btn-success' : 'btn-secondary'}`}
                          style={{
                            padding: '6px 16px',
                            fontSize: '0.85rem',
                            flex: 1,
                            backgroundColor: status === 'present' ? 'var(--success)' : 'rgba(255,255,255,0.02)',
                            borderColor: status === 'present' ? 'transparent' : 'var(--border-color)',
                          }}
                        >
                          Present
                        </button>
                        <button
                          onClick={() => toggleStudentStatus(student.roll_number, 'absent')}
                          className={`btn ${status === 'absent' ? 'btn-danger' : 'btn-secondary'}`}
                          style={{
                            padding: '6px 16px',
                            fontSize: '0.85rem',
                            flex: 1,
                            backgroundColor: status === 'absent' ? 'var(--danger)' : 'rgba(255,255,255,0.02)',
                            borderColor: status === 'absent' ? 'transparent' : 'var(--border-color)',
                          }}
                        >
                          Absent
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={attendanceFooterStyle}>
                <button
                  onClick={() => setActiveClassId(null)}
                  className="btn btn-secondary"
                  disabled={actionPending}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAttendance}
                  className="btn btn-primary"
                  disabled={actionPending}
                >
                  {actionPending ? 'Saving...' : 'Save Attendance'}
                </button>
              </div>
            </div>
          )}
        </section>
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
  flexWrap: 'wrap',
  gap: '16px',
};

const titleStyle: React.CSSProperties = {
  fontSize: '2rem',
  fontWeight: '700',
};

const subtitleStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: '0.95rem',
};

const dateContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
};

const dateLabelStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  color: 'var(--text-secondary)',
};

const dateInputStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: '0.95rem',
  width: '180px',
};


const panelStyle: React.CSSProperties = {
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

const panelTitleStyle: React.CSSProperties = {
  fontSize: '1.2rem',
  fontWeight: '600',
};

const classSubjectRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
};

const typeBadgeBaseStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: '600',
  padding: '2px 10px',
  borderRadius: '999px',
  whiteSpace: 'nowrap',
};

const typeBadgeColors: Record<SubjectType, { text: string; bg: string; border: string }> = {
  theory: {
    text: '#a78bfa',
    bg: 'rgba(139, 92, 246, 0.12)',
    border: 'rgba(139, 92, 246, 0.35)',
  },
  practical: {
    text: '#60a5fa',
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.35)',
  },
  clinics: {
    text: '#34d399',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.35)',
  },
};

const emptyStateStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '40px 20px',
  color: 'var(--text-secondary)',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

const classListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

const classCardStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px',
  borderRadius: '12px',
  border: '1px solid var(--border-color)',
  transition: 'var(--transition-fast)',
};

const classInfoStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const classSubjectStyle: React.CSSProperties = {
  fontWeight: '600',
  fontSize: '1.05rem',
};

const classTimeStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
};

const classActionsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const addFormStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
};

const formGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  flex: 1,
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

const formRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
};

// Attendance drawer styles
const attendanceContainerStyle: React.CSSProperties = {
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
  marginTop: '8px',
};

const attendanceHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid var(--border-color)',
  paddingBottom: '16px',
};

const attendanceGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: '12px',
};

const studentRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 16px',
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid var(--border-color)',
  borderRadius: '10px',
  gap: '12px',
};

const studentInfoStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
};

const studentNameStyle: React.CSSProperties = {
  fontWeight: '500',
  fontSize: '0.95rem',
};

const studentRollStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
};

const toggleContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '6px',
  width: '160px',
};

const attendanceFooterStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '12px',
  borderTop: '1px solid var(--border-color)',
  paddingTop: '20px',
};
