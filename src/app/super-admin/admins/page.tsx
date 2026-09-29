'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  getAdminsAction,
  createAdminAction,
  updateAdminAction,
  resetAdminPinAction,
  deleteAdminAction,
  setActiveClassroomAction,
} from '@/app/actions';

interface AdminRosterItem {
  id: string;
  name: string;
  classroom_name: string;
  classroom_code: string;
  is_active: boolean;
  pin: string;
  created_at: string;
  studentCount?: number;
  classCount?: number;
}

export default function ManageAdminsPage() {
  const [admins, setAdmins] = useState<AdminRosterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Create Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newAdminName, setNewAdminName] = useState('');
  const [newClassroomName, setNewClassroomName] = useState('');
  const [newClassroomCode, setNewClassroomCode] = useState('');
  const [newPin, setNewPin] = useState('');

  // Reset PIN Modal state
  const [pinModalAdmin, setPinModalAdmin] = useState<AdminRosterItem | null>(null);
  const [resetPinValue, setResetPinValue] = useState('');

  // Edit Modal state
  const [editModalAdmin, setEditModalAdmin] = useState<AdminRosterItem | null>(null);
  const [editAdminName, setEditAdminName] = useState('');
  const [editClassroomName, setEditClassroomName] = useState('');
  const [editClassroomCode, setEditClassroomCode] = useState('');

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  const refreshAdmins = async () => {
    try {
      const data = await getAdminsAction();
      setAdmins(data as unknown as AdminRosterItem[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load classroom admins.');
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const data = await getAdminsAction();
        if (isMounted) {
          setAdmins(data as unknown as AdminRosterItem[]);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load classroom admins.');
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
  }, []);

  const handleCreateAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!newAdminName || !newClassroomName || !newClassroomCode || !newPin) {
      setError('All fields are required.');
      return;
    }

    startTransition(async () => {
      try {
        await createAdminAction({
          name: newAdminName,
          classroomName: newClassroomName,
          classroomCode: newClassroomCode,
          pin: newPin,
        });
        setSuccess(`Classroom "${newClassroomName}" and Admin "${newAdminName}" created successfully!`);
        setShowCreateModal(false);
        setNewAdminName('');
        setNewClassroomName('');
        setNewClassroomCode('');
        setNewPin('');
        await refreshAdmins();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to create admin.');
      }
    });
  };

  const handleResetPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinModalAdmin || !resetPinValue.trim()) return;

    startTransition(async () => {
      try {
        await resetAdminPinAction(pinModalAdmin.id, resetPinValue.trim());
        setSuccess(`PIN for "${pinModalAdmin.name}" has been updated.`);
        setPinModalAdmin(null);
        setResetPinValue('');
        await refreshAdmins();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to reset PIN.');
      }
    });
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalAdmin) return;

    startTransition(async () => {
      try {
        await updateAdminAction(editModalAdmin.id, {
          name: editAdminName,
          classroomName: editClassroomName,
          classroomCode: editClassroomCode,
        });
        setSuccess(`Classroom details updated.`);
        setEditModalAdmin(null);
        await refreshAdmins();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to update details.');
      }
    });
  };

  const handleToggleStatus = (admin: AdminRosterItem) => {
    startTransition(async () => {
      try {
        await updateAdminAction(admin.id, { isActive: !admin.is_active });
        setSuccess(`Status for "${admin.classroom_name}" set to ${!admin.is_active ? 'Active' : 'Inactive'}.`);
        await refreshAdmins();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to toggle status.');
      }
    });
  };

  const handleDeleteAdmin = (admin: AdminRosterItem) => {
    if (
      !confirm(
        `Are you sure you want to permanently delete "${admin.classroom_name}" and its admin "${admin.name}"?\n\nWARNING: All students, classes, attendance records, and batches belonging to this classroom will be deleted!`
      )
    ) {
      return;
    }

    startTransition(async () => {
      try {
        await deleteAdminAction(admin.id);
        setSuccess(`Classroom "${admin.classroom_name}" deleted.`);
        await refreshAdmins();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to delete admin.');
      }
    });
  };

  const handleManageAsAdmin = (adminId: string) => {
    startTransition(async () => {
      try {
        await setActiveClassroomAction(adminId);
        router.push('/admin');
        router.refresh();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to enter classroom context.');
      }
    });
  };

  const filteredAdmins = admins.filter(
    (a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.classroom_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.classroom_code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: '800' }}>Classrooms & Admins</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Provision and manage classroom administrators, credentials, and access permissions
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary"
          style={{ padding: '10px 20px', fontSize: '0.95rem' }}
        >
          <span>➕ Provision New Admin</span>
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

      {/* Search Bar */}
      <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', gap: '16px', alignItems: 'center' }}>
        <span style={{ fontSize: '1.2rem' }}>🔍</span>
        <input
          type="text"
          className="input-field"
          placeholder="Filter by Admin name, classroom name, or code..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: '100%', maxWidth: '500px' }}
        />
        <div style={{ marginLeft: 'auto', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Total: <strong>{filteredAdmins.length}</strong> classrooms
        </div>
      </div>

      {/* Admins Table */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Classroom Name</th>
                <th>Code</th>
                <th>Admin Name</th>
                <th>Status</th>
                <th>Students</th>
                <th>Classes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAdmins.map((admin) => (
                <tr key={admin.id}>
                  <td>
                    <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                      {admin.classroom_name}
                    </strong>
                  </td>
                  <td>
                    <span className="badge badge-purple" style={{ fontFamily: 'monospace', fontWeight: '700' }}>
                      {admin.classroom_code}
                    </span>
                  </td>
                  <td>{admin.name}</td>
                  <td>
                    <button
                      onClick={() => handleToggleStatus(admin)}
                      disabled={isPending}
                      className={admin.is_active ? 'badge badge-green' : 'badge badge-red'}
                      style={{ cursor: 'pointer', border: 'none' }}
                      title="Click to toggle status"
                    >
                      {admin.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td>{admin.studentCount ?? 0}</td>
                  <td>{admin.classCount ?? 0}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleManageAsAdmin(admin.id)}
                        disabled={isPending}
                        className="btn btn-primary"
                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      >
                        ⚡ Manage as Admin
                      </button>
                      <button
                        onClick={() => {
                          setPinModalAdmin(admin);
                          setResetPinValue('');
                        }}
                        className="btn btn-secondary"
                        style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                        title="Reset PIN"
                      >
                        🔑 PIN
                      </button>
                      <button
                        onClick={() => {
                          setEditModalAdmin(admin);
                          setEditAdminName(admin.name);
                          setEditClassroomName(admin.classroom_name);
                          setEditClassroomCode(admin.classroom_code);
                        }}
                        className="btn btn-secondary"
                        style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                        title="Edit Info"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => handleDeleteAdmin(admin)}
                        disabled={isPending}
                        className="btn btn-danger"
                        style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                        title="Delete Classroom"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredAdmins.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    No classrooms found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE ADMIN MODAL */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="glass-panel modal-card" style={{ maxWidth: '500px' }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: '700', marginBottom: '8px' }}>
              Provision Classroom & Admin
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Create a dedicated administrator and isolated classroom space
            </p>

            <form onSubmit={handleCreateAdmin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Admin Full Name</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Dr. Jane Smith"
                  value={newAdminName}
                  onChange={(e) => setNewAdminName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={labelStyle}>Classroom / Section Name</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Grade 10 - Section A"
                  value={newClassroomName}
                  onChange={(e) => setNewClassroomName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={labelStyle}>Unique Classroom Code (Uppercase Slug)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. 10A or MBBS2026"
                  value={newClassroomCode}
                  onChange={(e) => setNewClassroomCode(e.target.value.toUpperCase())}
                  required
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Used by students and admins to identify this classroom.
                </span>
              </div>

              <div>
                <label style={labelStyle}>Admin Login PIN</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="e.g. 4-6 digit passcode"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
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
                  {isPending ? 'Provisioning...' : 'Create Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET PIN MODAL */}
      {pinModalAdmin && (
        <div className="modal-backdrop">
          <div className="glass-panel modal-card" style={{ maxWidth: '420px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '6px' }}>
              Reset Admin PIN
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Update access credential for <strong>{pinModalAdmin.name}</strong> ({pinModalAdmin.classroom_name})
            </p>

            <form onSubmit={handleResetPin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>New PIN</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Enter new PIN"
                  value={resetPinValue}
                  onChange={(e) => setResetPinValue(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setPinModalAdmin(null)}
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
                  {isPending ? 'Saving...' : 'Update PIN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editModalAdmin && (
        <div className="modal-backdrop">
          <div className="glass-panel modal-card" style={{ maxWidth: '480px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '6px' }}>
              Edit Classroom Details
            </h2>

            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '14px' }}>
              <div>
                <label style={labelStyle}>Admin Name</label>
                <input
                  type="text"
                  className="input-field"
                  value={editAdminName}
                  onChange={(e) => setEditAdminName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={labelStyle}>Classroom Name</label>
                <input
                  type="text"
                  className="input-field"
                  value={editClassroomName}
                  onChange={(e) => setEditClassroomName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={labelStyle}>Classroom Code</label>
                <input
                  type="text"
                  className="input-field"
                  value={editClassroomCode}
                  onChange={(e) => setEditClassroomCode(e.target.value.toUpperCase())}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setEditModalAdmin(null)}
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
                  {isPending ? 'Saving...' : 'Save Changes'}
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
