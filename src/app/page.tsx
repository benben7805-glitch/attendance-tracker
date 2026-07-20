'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { loginAction } from '@/app/actions';

export default function LoginPage() {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!inputValue.trim()) {
      setError('Please enter a Roll Number or Admin PIN.');
      return;
    }

    startTransition(async () => {
      try {
        const result = await loginAction(inputValue);
        if (result.success && result.redirect) {
          router.push(result.redirect);
          router.refresh();
        } else {
          setError(result.error || 'Authentication failed.');
        }
      } catch (err: any) {
        setError(err.message || 'An unexpected error occurred.');
      }
    });
  };

  return (
    <div style={containerStyle}>
      <div className="glass-panel animate-slide-up" style={cardStyle}>
        <div style={headerStyle}>
          <div style={logoContainerStyle}>
            <span style={logoIconStyle}>📅</span>
          </div>
          <h1 className="text-gradient-purple" style={titleStyle}>Attendance Hub</h1>
          <p style={subtitleStyle}>Enter Student Roll Number or Admin PIN</p>
        </div>

        <form onSubmit={handleSubmit} style={formStyle}>
          {error && (
            <div className="alert-error animate-fade-in">
              <span style={{ fontSize: '1.1rem' }}>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div style={inputGroupStyle}>
            <input
              type="text"
              className="input-field"
              placeholder="e.g., CS202601 or Admin PIN"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isPending}
              style={inputStyle}
              autoComplete="off"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isPending}
            style={buttonStyle}
          >
            {isPending ? (
              <span className="flex-center" style={{ gap: '8px' }}>
                <span className="spinner" /> Signing in...
              </span>
            ) : (
              'Sign In'
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

// Inline styles for login container structure
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
  maxWidth: '420px',
  padding: '40px 32px',
  display: 'flex',
  flexDirection: 'column',
  gap: '30px',
};

const headerStyle: React.CSSProperties = {
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '12px',
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
  marginBottom: '8px',
};

const logoIconStyle: React.CSSProperties = {
  fontSize: '2rem',
};

const titleStyle: React.CSSProperties = {
  fontSize: '2rem',
  fontWeight: '700',
  letterSpacing: '-0.5px',
};

const subtitleStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: '0.95rem',
};

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
};

const inputGroupStyle: React.CSSProperties = {
  position: 'relative',
};

const inputStyle: React.CSSProperties = {
  fontSize: '1.05rem',
  textAlign: 'center',
  letterSpacing: '0.5px',
};

const buttonStyle: React.CSSProperties = {
  padding: '12px',
  fontSize: '1.05rem',
};
