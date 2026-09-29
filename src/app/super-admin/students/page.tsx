'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  getAllStudentsRegistry,
  getClassroomsForSelect,
  addStudent,
  deleteStudent,
} from '@/app/actions';

interface StudentRegistryItem {
  id: string;
  roll_number: string;
  name: string;
  admin_id: string;
  created_at: string;
  student_id?: string;
  admins?: {
    name: string;
    classroom_name: string;
    classroom_code: string;
  };
}

interface ClassroomOption {
  id: string;
  name: string;
  classroom_name: string;
  classroom_code: string;
}

export default function AllStudentsRegistryPage() {
  const [students, setStudents] = useState<StudentRegistryItem[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Add Student Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [targetClassroomId, setTargetClassroomId] = useState('');
  const [newRollNumber, setNewRollNumber] = useState('');
  const [newName, setNewName] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const [studentsData, classroomsData] = await Promise.all([
          getAllStudentsRegistry(searchQuery, selectedClassroomId || undefined),
          getClassroomsForSelect(),
        ]);
        if (isMounted) {
          setStudents(studentsData as unknown as StudentRegistryItem[]);
          setClassrooms(classroomsData as unknown as ClassroomOption[]);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load students registry.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    init();
    return () => {
      isMounted = false;
    };
  }, [selectedClassroomId, searchQuery]);

  const refreshData = async () => {
    try {
      const [studentsData, classroomsData] = await Promise.all([
        getAllStudentsRegistry(searchQuery, selectedClassroomId || undefined),
        getClassroomsForSelect(),
      ]);
      setStudents(studentsData as unknown as StudentRegistryItem[]);
      setClassrooms(classroomsData as unknown as ClassroomOption[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load students registry.');
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    refreshData();
  };

  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!targetClassroomId || !newRollNumber.trim() || !newName.trim()) {
      setError('Classroom, Roll Number, and Name are all required.');
      return;
    }

    startTransition(async () => {
      try {
        await addStudent(newRollNumber.trim().toUpperCase(), newName.trim(), targetClassroomId);
        setSuccess(`Student "${newName}" enrolled successfully!`);
        setShowAddModal(false);
        setNewRollNumber('');
        setNewName('');
        await refreshData();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to enroll student.');
      }
    });
  };

  const handleDeleteStudent = (student: StudentRegistryItem) => {
    if (
      !confirm(
        `Are you sure you want to delete "${student.name}" (${student.roll_number}) from ${student.admins?.classroom_name}? All attendance records for this student will be removed.`
      )
    ) {
      return;
    }

    startTransition(async () => {
      try {
        await deleteStudent(student.roll_number, student.admin_id);
        setSuccess(`Student "${student.name}" deleted.`);
        await refreshData();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to delete student.');
      }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: '800' }}>All Students Registry</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Unified cross-classroom student management, enrollment, and search
          </p>
        </div>
        <button
          onClick={() => {
            setTargetClassroomId(classrooms[0]?.id || '');
            setShowAddModal(true);
          }}
          className="btn btn-primary"
          style={{ padding: '10px 20px', fontSize: '0.95rem' }}
        >
          <span>➕ Enroll Student</span>
        </button>
      </div>

      {error && (
        <div className="alert-error animate-fade-in">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="alert-success animate-fade-in">
          <span>✅</span>
          <span>{success}</span>
        </div>
      )}

      {/* Filters Bar */}
      <div className="glass-panel" style={{ padding: '18px 20px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '10px', flex: 1, minWidth: '280px' }}>
          <input
            type="text"
            className="input-field"
            placeholder="Search by student name or roll number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%' }}
          />
          <button type="submit" className="btn btn-secondary" style={{ padding: '8px 16px' }}>
            Search
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            Filter Classroom:
          </label>
          <select
            value={selectedClassroomId}
            onChange={(e) => setSelectedClassroomId(e.target.value)}
            className="input-field"
            style={{ padding: '8px 12px', minWidth: '180px' }}
          >
            <option value="">All Classrooms</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.classroom_name} ({c.classroom_code})
              </option>
            ))}
          </select>
        </div>

        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginLeft: 'auto' }}>
          Enrolled: <strong>{students.length}</strong> students
        </div>
      </div>

      {/* Table */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Student Login ID</th>
                <th>Roll No</th>
                <th>Student Name</th>
                <th>Classroom</th>
                <th>Code</th>
                <th>Registered On</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const fullId = s.student_id || `${s.admins?.classroom_code || ''}${s.roll_number}`;
                return (
                  <tr key={s.id || `${s.admin_id}-${s.roll_number}`}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="badge badge-purple" style={{ fontFamily: 'monospace', fontWeight: '700', letterSpacing: '0.5px' }}>
                          {fullId}
                        </span>
                        <button
                          type="button"
                          className="btn btn-icon"
                          style={{ fontSize: '0.8rem', padding: '2px 4px', cursor: 'pointer' }}
                          title="Copy Student Login ID"
                          onClick={() => {
                            navigator.clipboard.writeText(fullId);
                            setSuccess(`Copied ID "${fullId}"!`);
                            setTimeout(() => setSuccess(null), 3000);
                          }}
                        >
                          📋
                        </button>
                      </div>
                    </td>
                    <td>
                      <code style={{ fontSize: '0.85rem' }}>{s.roll_number}</code>
                    </td>
                    <td>
                      <strong style={{ color: 'var(--text-primary)' }}>{s.name}</strong>
                    </td>
                    <td>{s.admins?.classroom_name || 'Classroom'}</td>
                    <td>
                      <span className="badge badge-blue">{s.admins?.classroom_code || 'MAIN'}</span>
                    </td>
                    <td>{s.created_at ? new Date(s.created_at).toLocaleDateString() : 'N/A'}</td>
                    <td>
                      <button
                        onClick={() => handleDeleteStudent(s)}
                        disabled={isPending}
                        className="btn btn-danger"
                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {students.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    No students found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD STUDENT MODAL */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="glass-panel modal-card" style={{ maxWidth: '460px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '6px' }}>
              Enroll Student
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Assign a new student directly into a target classroom
            </p>

            <form onSubmit={handleAddStudent} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Target Classroom</label>
                <select
                  value={targetClassroomId}
                  onChange={(e) => setTargetClassroomId(e.target.value)}
                  className="input-field"
                  required
                >
                  <option value="">Select Classroom</option>
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.classroom_name} ({c.classroom_code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Roll Number</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. 1 or 12"
                  value={newRollNumber}
                  onChange={(e) => setNewRollNumber(e.target.value)}
                  required
                />
                {targetClassroomId && newRollNumber.trim() && (
                  <p style={{ margin: '6px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Student Login ID: <strong style={{ color: 'var(--accent-primary)', fontFamily: 'monospace' }}>
                      {classrooms.find((c) => c.id === targetClassroomId)?.classroom_code || ''}
                      {newRollNumber.trim().toUpperCase()}
                    </strong>
                  </p>
                )}
              </div>

              <div>
                <label style={labelStyle}>Student Full Name</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Alice Cooper"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn btn-secondary"
                  disabled={isPending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isPending}
                >
                  {isPending ? 'Enrolling...' : 'Enroll Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx global>{`
        .modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          z-index: 1000;
        }
        .modal-card {
          width: 100%;
          padding: 28px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          animation: slideUp 0.25s ease-out;
        }
        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
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
