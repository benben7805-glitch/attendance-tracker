'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { logoutAction } from '@/app/actions';

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

const navItems: NavItem[] = [
  { label: 'Daily Manager', href: '/admin', icon: '📅' },
  { label: 'Manage Students', href: '/admin/students', icon: '👨‍🎓' },
  { label: 'Manage Subjects', href: '/admin/subjects', icon: '📚' },
  { label: 'Batches', href: '/admin/batches', icon: '👥' },
  { label: 'Events', href: '/admin/events', icon: '📆' },
  { label: 'Backup', href: '/admin/backup', icon: '💾' },
];

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleLogout = async () => {
    startTransition(async () => {
      await logoutAction();
      router.push('/');
      router.refresh();
    });
  };

  return (
    <nav style={navContainerStyle}>
      <div style={menuSectionStyle}>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                ...navLinkStyle,
                ...(isActive ? activeNavLinkStyle : {}),
              }}
              className="nav-link-hover"
            >
              <span style={iconStyle}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div style={footerSectionStyle}>
        <button
          onClick={handleLogout}
          disabled={isPending}
          style={logoutButtonStyle}
          className="btn btn-secondary"
        >
          <span>🚪</span>
          <span>{isPending ? 'Logging out...' : 'Sign Out'}</span>
        </button>
      </div>

      <style jsx global>{`
        .nav-link-hover {
          transition: var(--transition-fast);
        }
        .nav-link-hover:hover {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-primary) !important;
          transform: translateX(4px);
        }
      `}</style>
    </nav>
  );
}

// Styles
const navContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  flex: 1,
};

const menuSectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const navLinkStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px 16px',
  borderRadius: '10px',
  color: 'var(--text-secondary)',
  fontSize: '0.95rem',
  fontWeight: '500',
  textDecoration: 'none',
};

const activeNavLinkStyle: React.CSSProperties = {
  background: 'rgba(139, 92, 246, 0.15)',
  color: '#a78bfa',
  borderLeft: '3px solid var(--accent-primary)',
  paddingLeft: '13px', // Adjust for border to keep alignment
};

const iconStyle: React.CSSProperties = {
  fontSize: '1.2rem',
};

const footerSectionStyle: React.CSSProperties = {
  paddingTop: '20px',
  borderTop: '1px solid var(--border-color)',
};

const logoutButtonStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  padding: '12px',
  fontSize: '0.95rem',
};
