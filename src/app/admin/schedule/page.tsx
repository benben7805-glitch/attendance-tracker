'use client';

import { useState, useEffect, useTransition } from 'react';
import { getSubjects, getWeeklySchedule, addWeeklySchedule, deleteWeeklySchedule } from '@/app/actions';

interface Subject {
  id: string;
  name: string;
}

interface ScheduleItem {
  id: string;
  subject_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  subjects: {
    id: string;
    name: string;
  };
}

const DAYS_OF_WEEK = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

export default function WeeklySchedulePage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  
  // Form states
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedDay, setSelectedDay] = useState(1); // Default Monday
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');

  // Status states
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load schedule and subjects
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [subjectsData, scheduleData] = await Promise.all([
        getSubjects(),
        getWeeklySchedule(),
      ]);
      setSubjects(subjectsData);
      setSchedule(scheduleData as unknown as ScheduleItem[]);
      if (subjectsData.length > 0) {
        setSelectedSubjectId(subjectsData[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load schedule data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Handle schedule creation
  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!selectedSubjectId) {
      setError('Please select a subject.');
      return;
    }

    startTransition(async () => {
      try {
        await addWeeklySchedule(
          selectedSubjectId,
          Number(selectedDay),
          startTime,
          endTime
        );
        setSuccess('Class schedule template added successfully.');
        // Reload schedule list
        const updatedSchedule = await getWeeklySchedule();
        setSchedule(updatedSchedule as unknown as ScheduleItem[]);
      } catch (err: any) {
        setError(err.message || 'Failed to add schedule item.');
      }
    });
  };

  // Handle schedule item deletion
  const handleDeleteSchedule = async (id: string, subjectName: string, dayName: string) => {
    if (!confirm(`Are you sure you want to remove "${subjectName}" from the ${dayName} template? This will not delete already initialized classes in the calendar, but will affect future weekly copies.`)) {
      return;
    }
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        await deleteWeeklySchedule(id);
        setSuccess('Schedule item removed successfully.');
        setSchedule(schedule.filter((item) => item.id !== id));
      } catch (err: any) {
        setError(err.message || 'Failed to remove schedule item.');
      }
    });
  };

  // Group schedule items by day of week
  const getScheduleForDay = (dayValue: number) => {
    return schedule
      .filter((item) => item.day_of_week === dayValue)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  };

  return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <div>
          <h1 className="text-gradient" style={titleStyle}>Weekly Schedule Setup</h1>
          <p style={subtitleStyle}>Configure the recurring template of weekly classes</p>
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
        {/* Creation Form Card */}
        <section className="glass-panel" style={formCardStyle}>
          <h2 style={panelTitleStyle}>Add Weekly Slot</h2>
          <form onSubmit={handleAddSchedule} style={formStyle}>
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
                  disabled={isPending}
                >
                  {subjects.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div style={formGroupStyle}>
              <label style={labelStyle}>Day of Week</label>
              <select
                className="input-field"
                value={selectedDay}
                onChange={(e) => setSelectedDay(Number(e.target.value))}
                style={selectStyle}
                disabled={isPending}
              >
                {DAYS_OF_WEEK.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={formRowStyle}>
              <div style={formGroupStyle}>
                <label style={labelStyle}>Start Time</label>
                <input
                  type="time"
                  className="input-field"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={isPending}
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
                  disabled={isPending}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isPending || subjects.length === 0}
              style={{ marginTop: '8px' }}
            >
              {isPending ? 'Saving...' : 'Add Slot'}
            </button>
          </form>
        </section>

        {/* Schedule Display Card */}
        <section style={listSectionStyle}>
          {loading ? (
            <div className="flex-center" style={{ minHeight: '200px', width: '100%' }}>
              <div className="loader" />
            </div>
          ) : (
            <div style={daysGridStyle}>
              {DAYS_OF_WEEK.map((day) => {
                const dayClasses = getScheduleForDay(day.value);
                return (
                  <div key={day.value} className="glass-panel" style={dayCardStyle}>
                    <h3 style={dayTitleStyle}>{day.label}</h3>
                    {dayClasses.length === 0 ? (
                      <p style={noClassesStyle}>No classes scheduled</p>
                    ) : (
                      <div style={slotsListStyle}>
                        {dayClasses.map((item) => (
                          <div key={item.id} style={slotItemStyle}>
                            <div style={slotInfoStyle}>
                              <span style={slotSubjectStyle}>{item.subjects?.name}</span>
                              <span style={slotTimeStyle}>
                                🕒 {item.start_time.substring(0, 5)} - {item.end_time.substring(0, 5)}
                              </span>
                            </div>
                            <button
                              onClick={() => handleDeleteSchedule(item.id, item.subjects?.name, day.label)}
                              className="btn btn-icon"
                              style={{ padding: '4px', borderRadius: '6px' }}
                              disabled={isPending}
                              title="Delete template class"
                            >
                              🗑️
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

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

const listSectionStyle: React.CSSProperties = {
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

const daysGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
  gap: '16px',
};

const dayCardStyle: React.CSSProperties = {
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  minHeight: '200px',
};

const dayTitleStyle: React.CSSProperties = {
  fontSize: '1.1rem',
  fontWeight: '600',
  color: 'var(--text-primary)',
  borderBottom: '1px solid var(--border-color)',
  paddingBottom: '8px',
};

const noClassesStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '0.85rem',
  textAlign: 'center',
  padding: '30px 0',
  fontStyle: 'italic',
};

const slotsListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
};

const slotItemStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px',
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  gap: '8px',
};

const slotInfoStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  flex: 1,
};

const slotSubjectStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  fontWeight: '600',
};

const slotTimeStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
};
