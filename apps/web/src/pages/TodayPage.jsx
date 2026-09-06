import React from 'react';
import { Sparkles, Calendar, Clock, CheckCircle2 } from 'lucide-react';

export function TodayPage() {
  const todayDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date());

  return (
    <div style={{ padding: '32px', maxWidth: '1100px', width: '100%', margin: '0 auto' }}>
      {/* Header Bar */}
      <header style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: 'var(--text-muted)',
                fontSize: '0.85rem',
              }}
            >
              <Calendar size={15} />
              <span>{todayDate}</span>
            </div>
            <h2
              style={{
                fontSize: '1.75rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.025em',
                margin: '6px 0',
              }}
            >
              Today Cockpit
            </h2>
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '9999px',
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              color: 'var(--accent-primary)',
              fontSize: '0.8125rem',
              fontWeight: 600,
              border: '1px solid rgba(56, 189, 248, 0.25)',
            }}
          >
            <Sparkles size={14} />
            <span>Phase 1 Shell Active</span>
          </div>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem', margin: '4px 0 0 0' }}>
          Daily command center consolidating your scheduled tasks, academic Day Order, and focus
          priorities.
        </p>
      </header>

      {/* Grid of Cockpit Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '20px',
        }}
      >
        {/* Focus Task Card */}
        <section
          aria-labelledby="focus-task-heading"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <CheckCircle2 size={18} color="var(--accent-success)" />
            <h3 id="focus-task-heading" style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
              Focus Task
            </h3>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.5 }}>
            No high-priority task scheduled yet. Task creation and execution engine will activate in
            Phase 5.
          </p>
        </section>

        {/* Schedule & Time Blocks */}
        <section
          aria-labelledby="schedule-heading"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <Clock size={18} color="var(--accent-primary)" />
            <h3 id="schedule-heading" style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
              Work Blocks & Day Order
            </h3>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.5 }}>
            Unified schedule view combining local calendar events, Google Sync, and academic Day
            Order.
          </p>
        </section>
      </div>
    </div>
  );
}
