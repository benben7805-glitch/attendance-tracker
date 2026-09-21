'use client';

import { useState, useEffect, useTransition } from 'react';
import { getEvents, addEvent, deleteEvent } from '@/app/actions';

interface EventItem {
  id: string;
  title: string;
  description: string | null;
  date: string;
  created_at: string;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toLocalDateKey(d: Date): string {
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().split('T')[0];
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // Add event form
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDate, setNewDate] = useState(() => toLocalDateKey(new Date()));

  // Status states
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Initial load
  useEffect(() => {
    let isMounted = true;

    async function fetchEvents() {
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

    fetchEvents();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!newTitle.trim()) {
      setError('Please enter an event title.');
      return;
    }
    if (!newDate) {
      setError('Please select an event date.');
      return;
    }

    startTransition(async () => {
      try {
        await addEvent(newTitle.trim(), newDescription.trim(), newDate);
        setSuccess(`Event "${newTitle}" added successfully.`);
        setNewTitle('');
        setNewDescription('');
        const updated = await getEvents();
        setEvents(updated as unknown as EventItem[]);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to add event.');
      }
    });
  };

  const handleDeleteEvent = async (event: EventItem) => {
    if (!confirm(`Delete event "${event.title}"?`)) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        await deleteEvent(event.id);
        setSuccess('Event deleted.');
        setEvents((prev) => prev.filter((ev) => ev.id !== event.id));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to delete event.');
      }
    });
  };

  // Build calendar grid for current month
  const firstDayOfMonth = new Date(currentMonth.year, currentMonth.month, 1);
  const startOffset = firstDayOfMonth.getDay();
  const daysInMonth = new Date(currentMonth.year, currentMonth.month + 1, 0).getDate();

  const monthEventsMap: Record<string, EventItem[]> = {};
  events.forEach((ev) => {
    const evKey = typeof ev.date === 'string' ? ev.date.slice(0, 10) : ev.date;
    if (!monthEventsMap[evKey]) monthEventsMap[evKey] = [];
    monthEventsMap[evKey].push(ev);
  });

  const todayKey = toLocalDateKey(new Date());

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const changeMonth = (delta: number) => {
    setCurrentMonth((prev) => {
      const newMonth = new Date(prev.year, prev.month + delta, 1);
      return { year: newMonth.getFullYear(), month: newMonth.getMonth() };
    });
  };

  const goToToday = () => {
    const now = new Date();
    setCurrentMonth({ year: now.getFullYear(), month: now.getMonth() });
  };

  // Sorted upcoming events (today and later)
  const upcomingEvents = [...events]
    .filter((ev) => (typeof ev.date === 'string' ? ev.date.slice(0, 10) : ev.date) >= todayKey)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <div>
          <h1 className="text-gradient" style={titleStyle}>Events & Calendar</h1>
          <p style={subtitleStyle}>
            Add important dates and events. Students can see these from their dashboard.
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
        <div className="responsive-grid-2-1">
          {/* Calendar Panel */}
          <section className="glass-panel" style={panelStyle}>
            <div style={calendarHeaderStyle}>
              <div style={monthNavStyle}>
                <button onClick={() => changeMonth(-1)} className="btn btn-secondary" title="Previous month">
                  ‹
                </button>
                <span style={monthLabelStyle}>
                  {MONTH_NAMES[currentMonth.month]} {currentMonth.year}
                </span>
                <button onClick={() => changeMonth(1)} className="btn btn-secondary" title="Next month">
                  ›
                </button>
              </div>
              <button onClick={goToToday} className="btn btn-secondary" style={{ padding: '8px 14px' }}>
                Today
              </button>
            </div>

            <div style={dayNamesRowStyle}>
              {DAY_NAMES.map((d) => (
                <div key={d} style={dayNameStyle}>{d}</div>
              ))}
            </div>

            <div style={calendarGridStyle}>
              {cells.map((day, idx) => {
                if (day === null) {
                  return <div key={`empty-${idx}`} style={emptyCellStyle} />;
                }
                const dayKey = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayEvents = monthEventsMap[dayKey] || [];
                const hasEvents = dayEvents.length > 0;
                const isToday = dayKey === todayKey;

                return (
                  <div key={dayKey} style={{ ...dayCellStyle, ...(isToday ? todayCellStyle : {}) }}>
                    <span
                      style={{
                        ...dayNumberStyle,
                        ...(isToday ? todayNumberStyle : {}),
                        ...(hasEvents ? eventDayNumberStyle : {}),
                      }}
                    >
                      {day}
                    </span>
                    {hasEvents && (
                      <div style={dayEventsStyle}>
                        {dayEvents.slice(0, 2).map((ev) => (
                          <span
                            key={ev.id}
                            style={dayEventDotStyle}
                            title={ev.title}
                          >
                            {ev.title}
                          </span>
                        ))}
                        {dayEvents.length > 2 && (
                          <span style={moreEventsStyle}>+{dayEvents.length - 2} more</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Right panel: Add event + upcoming events */}
          <section style={rightColumnStyle}>
            {/* Add event form */}
            <div className="glass-panel" style={panelStyle}>
              <h2 style={panelTitleStyle}>Add Event</h2>
              <form onSubmit={handleAddEvent} style={formStyle}>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Title</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. Midterm Exam"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    disabled={isPending}
                    required
                  />
                </div>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Description (optional)</label>
                  <textarea
                    className="input-field"
                    placeholder="Add details about this event..."
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    disabled={isPending}
                    rows={3}
                    style={{ resize: 'vertical' }}
                  />
                </div>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Date</label>
                  <input
                    type="date"
                    className="input-field"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    disabled={isPending}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={isPending}>
                  ➕ Add Event
                </button>
              </form>
            </div>

            {/* Upcoming events list */}
            <div className="glass-panel" style={panelStyle}>
              <h2 style={panelTitleStyle}>Upcoming Events ({upcomingEvents.length})</h2>
              {upcomingEvents.length === 0 ? (
                <div style={emptyStateStyle}>
                  <span style={{ fontSize: '1.5rem' }}>📅</span>
                  <p>No upcoming events.</p>
                </div>
              ) : (
                <div style={eventListStyle}>
                  {upcomingEvents.map((ev) => (
                    <div key={ev.id} style={eventItemStyle}>
                      <div style={eventDateStyle}>
                        <span style={eventDateDayStyle}>
                          {new Date(ev.date + 'T00:00:00').toLocaleDateString('en-US', { day: '2-digit' })}
                        </span>
                        <span style={eventDateMonthStyle}>
                          {new Date(ev.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                        </span>
                      </div>
                      <div style={eventInfoStyle}>
                        <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>{ev.title}</span>
                        {ev.description && (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {ev.description}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteEvent(ev)}
                        className="btn btn-icon"
                        disabled={isPending}
                        title="Delete event"
                        style={{ color: 'var(--danger)' }}
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
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

const calendarHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '12px',
};

const monthNavStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

const monthLabelStyle: React.CSSProperties = {
  fontSize: '1.1rem',
  fontWeight: '600',
  minWidth: '160px',
  textAlign: 'center',
};

const dayNamesRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: '6px',
  textAlign: 'center',
  borderBottom: '1px solid var(--border-color)',
  paddingBottom: '10px',
};

const dayNameStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: '600',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const calendarGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: '6px',
};

const emptyCellStyle: React.CSSProperties = {
  minHeight: '72px',
};

const dayCellStyle: React.CSSProperties = {
  minHeight: '72px',
  padding: '8px',
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  overflow: 'hidden',
};

const todayCellStyle: React.CSSProperties = {
  borderColor: 'var(--accent-secondary)',
  background: 'rgba(6, 182, 212, 0.05)',
};

const dayNumberStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  fontWeight: '500',
  color: 'var(--text-secondary)',
  width: '24px',
  height: '24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
};

const todayNumberStyle: React.CSSProperties = {
  background: 'var(--accent-secondary)',
  color: '#fff',
};

const eventDayNumberStyle: React.CSSProperties = {
  color: 'var(--accent-primary)',
};

const dayEventsStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  overflow: 'hidden',
};

const dayEventDotStyle: React.CSSProperties = {
  fontSize: '0.65rem',
  padding: '1px 4px',
  borderRadius: '4px',
  background: 'rgba(139, 92, 246, 0.12)',
  color: '#a78bfa',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const moreEventsStyle: React.CSSProperties = {
  fontSize: '0.6rem',
  color: 'var(--text-muted)',
};

const rightColumnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
};

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
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

const emptyStateStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '40px 20px',
  color: 'var(--text-secondary)',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  alignItems: 'center',
};

const eventListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  maxHeight: '400px',
  overflowY: 'auto',
};

const eventItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px',
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid var(--border-color)',
  borderRadius: '10px',
};

const eventDateStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  width: '48px',
  height: '48px',
  background: 'rgba(139, 92, 246, 0.12)',
  border: '1px solid rgba(139, 92, 246, 0.3)',
  borderRadius: '10px',
  flexShrink: 0,
};

const eventDateDayStyle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: '700',
  color: '#a78bfa',
  lineHeight: '1',
};

const eventDateMonthStyle: React.CSSProperties = {
  fontSize: '0.65rem',
  fontWeight: '600',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
};

const eventInfoStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  flex: 1,
  minWidth: 0,
};
