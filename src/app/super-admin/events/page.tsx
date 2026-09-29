'use client';

import { useState, useEffect, useTransition } from 'react';
import { getEvents, broadcastGlobalEvent, deleteEvent } from '@/app/actions';

interface EventItem {
  id: string;
  title: string;
  description: string | null;
  date: string;
  is_global: boolean;
  admin_id?: string | null;
}

export default function SuperAdminEventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refreshEvents = async () => {
    try {
      const data = await getEvents();
      setEvents(data as unknown as EventItem[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load events.');
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const data = await getEvents();
        if (isMounted) {
          setEvents(data as unknown as EventItem[]);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load events.');
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

  const handleBroadcastEvent = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!title.trim() || !date) {
      setError('Title and Date are required.');
      return;
    }

    startTransition(async () => {
      try {
        await broadcastGlobalEvent(title.trim(), description.trim(), date);
        setSuccess(`Institution-wide event "${title}" broadcasted successfully!`);
        setTitle('');
        setDescription('');
        await refreshEvents();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to broadcast event.');
      }
    });
  };

  const handleDeleteEvent = (eventId: string, eventTitle: string) => {
    if (!confirm(`Delete event "${eventTitle}"?`)) return;

    startTransition(async () => {
      try {
        await deleteEvent(eventId);
        setSuccess(`Event deleted.`);
        await refreshEvents();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to delete event.');
      }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: '800' }}>Global Events & Holidays</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Broadcast institution-wide holidays and academic notices across all classroom portals
        </p>
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

      {/* Broadcast Form */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '16px' }}>
          📢 Broadcast New Global Event
        </h2>
        <form onSubmit={handleBroadcastEvent} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Event Title</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. National Holiday / Annual Sports Meet"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={labelStyle}>Event Date</label>
              <input
                type="date"
                className="input-field"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Description / Notice (Optional)</label>
            <textarea
              className="input-field"
              placeholder="Provide details or announcements for students and faculty..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={isPending}
              className="btn btn-primary"
              style={{ padding: '10px 24px' }}
            >
              {isPending ? 'Broadcasting...' : '📢 Broadcast Event to All Classrooms'}
            </button>
          </div>
        </form>
      </div>

      {/* Events Roster */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '16px' }}>
          Active Calendar Events
        </h2>
        {events.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {events.map((ev) => (
              <div
                key={ev.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-color)',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                      {ev.title}
                    </span>
                    <span className={ev.is_global ? 'badge badge-purple' : 'badge badge-blue'}>
                      {ev.is_global ? '🌍 Global Notice' : '🏫 Classroom Event'}
                    </span>
                  </div>
                  {ev.description && (
                    <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      {ev.description}
                    </p>
                  )}
                  <span style={{ fontSize: '0.8rem', color: '#a78bfa' }}>
                    📅 {new Date(ev.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </div>

                <button
                  onClick={() => handleDeleteEvent(ev.id, ev.title)}
                  disabled={isPending}
                  className="btn btn-danger"
                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
            {loading ? 'Loading events...' : 'No events scheduled.'}
          </div>
        )}
      </div>
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
