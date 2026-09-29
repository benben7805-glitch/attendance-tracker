'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { loginAction, getClassroomsForSelect } from '@/app/actions';

interface ClassroomOption {
  id: string;
  name: string;
  classroom_name: string;
  classroom_code: string;
}

export default function LoginPage() {
  const [mode, setMode] = useState<'student' | 'admin'>('student');
  const [inputValue, setInputValue] = useState('');
  const [selectedClassroomCode, setSelectedClassroomCode] = useState('');
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [candidateClassrooms, setCandidateClassrooms] = useState<{ id: string; name: string; code: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    async function loadClassrooms() {
      try {
        const data = await getClassroomsForSelect();
        setClassrooms(data as unknown as ClassroomOption[]);
      } catch {
        // Fallback gracefully
      }
    }
    loadClassrooms();
  }, []);

  const handleLogin = (val: string, code?: string) => {
    setError(null);
    setCandidateClassrooms(null);

    startTransition(async () => {
      try {
        const result = await loginAction(val, code);
        if (result.success && result.redirect) {
          router.push(result.redirect);
          router.refresh();
        } else if (result.requireClassroom && result.classrooms) {
          setCandidateClassrooms(result.classrooms);
          setError(result.error || 'Please select your classroom:');
        } else {
          setError(result.error || 'Authentication failed.');
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) {
      setError(mode === 'student' ? 'Please enter your Student ID (e.g. MBBS20261).' : 'Please enter your Admin PIN or Master Passcode.');
      return;
    }
    handleLogin(inputValue.trim(), mode === 'admin' ? (selectedClassroomCode || undefined) : undefined);
  };

  return (
    <div style={containerStyle}>
      <div className="glass-panel animate-slide-up" style={cardStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={logoContainerStyle}>
            <span style={logoIconStyle}>{mode === 'student' ? '🎓' : '🛡️'}</span>
          </div>
          <h1 className="text-gradient-purple" style={titleStyle}>Attendance Hub</h1>
          <p style={subtitleStyle}>Enterprise Multi-Classroom Attendance Platform</p>
        </div>

        {/* Mode Selector Tabs */}
        <div style={tabContainerStyle}>
          <button
            type="button"
            onClick={() => {
              setMode('student');
              setError(null);
              setCandidateClassrooms(null);
              setInputValue('');
            }}
            style={{
              ...tabButtonStyle,
              ...(mode === 'student' ? activeTabButtonStyle : {}),
            }}
          >
            👨‍🎓 Student
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('admin');
              setError(null);
              setCandidateClassrooms(null);
              setInputValue('');
            }}
            style={{
              ...tabButtonStyle,
              ...(mode === 'admin' ? activeTabButtonStyle : {}),
            }}
          >
            🛡️ Administrator
          </button>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={formStyle}>
          {error && (
            <div className="alert-error animate-fade-in" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.1rem' }}>⚠️</span>
                <span>{error}</span>
              </div>
              {/* Classroom Ambiguity Pills (Admins sharing same PIN) */}
              {candidateClassrooms && candidateClassrooms.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                  {candidateClassrooms.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleLogin(inputValue, c.code)}
                      disabled={isPending}
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '0.82rem', background: 'rgba(139, 92, 246, 0.2)' }}
                    >
                      {c.name} ({c.code})
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Student Mode Inputs */}
          {mode === 'student' ? (
            <div>
              <label style={labelStyle}>Student ID</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. MBBS20261 or CS202612"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                disabled={isPending}
                style={{
                  ...inputStyle,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                }}
                autoComplete="off"
                autoFocus
              />
              <p style={{ margin: '8px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                💡 Enter your full Student ID including classroom code (e.g. <strong style={{ color: 'var(--accent-primary)' }}>MBBS20261</strong>)
              </p>
            </div>
          ) : (
            /* Administrator Mode Inputs */
            <>
              <div>
                <label style={labelStyle}>Admin PIN or Super Admin Passcode</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Enter PIN / Passcode"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  disabled={isPending}
                  style={inputStyle}
                  autoComplete="current-password"
                />
              </div>

              {classrooms.length > 1 && (
                <div>
                  <label style={labelStyle}>Classroom Code (Optional if unique PIN)</label>
                  <select
                    value={selectedClassroomCode}
                    onChange={(e) => setSelectedClassroomCode(e.target.value)}
                    className="input-field"
                    style={{ width: '100%', padding: '10px', fontSize: '0.95rem' }}
                    disabled={isPending}
                  >
                    <option value="">-- Not Required / Super Admin --</option>
                    {classrooms.map((c) => (
                      <option key={c.id} value={c.classroom_code}>
                        {c.classroom_name} ({c.classroom_code})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isPending}
            style={buttonStyle}
          >
            {isPending ? (
              <span className="flex-center" style={{ gap: '8px' }}>
                <span className="spinner" /> Authenticating...
              </span>
            ) : (
              mode === 'student' ? 'View Attendance Portal' : 'Sign In as Administrator'
            )}
          </button>
        </form>
      </div>

      <style jsx global>{`
        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          border-top-color: #ffffff;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  padding: '20px',
  width: '100%',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '440px',
  padding: '36px 30px',
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

const headerStyle: React.CSSProperties = {
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '10px',
};

const logoContainerStyle: React.CSSProperties = {
  width: '64px',
  height: '64px',
  borderRadius: '16px',
  background: 'rgba(139, 92, 246, 0.1)',
  border: '1px solid rgba(139, 92, 246, 0.2)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: '4px',
};

const logoIconStyle: React.CSSProperties = {
  fontSize: '2rem',
};

const titleStyle: React.CSSProperties = {
  fontSize: '1.9rem',
  fontWeight: '800',
  letterSpacing: '-0.5px',
};

const subtitleStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: '0.9rem',
};

const tabContainerStyle: React.CSSProperties = {
  display: 'flex',
  padding: '4px',
  background: 'rgba(0, 0, 0, 0.25)',
  borderRadius: '10px',
  border: '1px solid var(--border-color)',
};

const tabButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px',
  fontSize: '0.9rem',
  fontWeight: '600',
  borderRadius: '8px',
  border: 'none',
  background: 'transparent',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  transition: 'var(--transition-fast)',
};

const activeTabButtonStyle: React.CSSProperties = {
  background: 'var(--accent-primary)',
  color: '#ffffff',
  boxShadow: '0 2px 8px rgba(139, 92, 246, 0.4)',
};

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '18px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.82rem',
  fontWeight: '600',
  color: 'var(--text-secondary)',
  marginBottom: '6px',
};

const inputStyle: React.CSSProperties = {
  fontSize: '1.02rem',
  textAlign: 'center',
  letterSpacing: '0.5px',
};

const buttonStyle: React.CSSProperties = {
  padding: '13px',
  fontSize: '1rem',
  marginTop: '6px',
};
