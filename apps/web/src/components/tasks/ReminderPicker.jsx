import React from 'react';
import { Bell } from 'lucide-react';

export function ReminderPicker({
  value, // { enabled: boolean, triggerType: string, relativeOffset: string, priority: string }
  onChange,
}) {
  const isEnabled = value?.enabled || false;

  const handleToggle = e => {
    onChange({
      ...value,
      enabled: e.target.checked,
      triggerType: value?.triggerType || 'BEFORE_DEADLINE',
      relativeOffset: value?.relativeOffset || '15 minutes',
      priority: value?.priority || 'NORMAL',
    });
  };

  const handleOffsetChange = e => {
    onChange({
      ...value,
      relativeOffset: e.target.value,
    });
  };

  const handlePriorityChange = e => {
    onChange({
      ...value,
      priority: e.target.value,
    });
  };

  return (
    <div
      style={{
        marginTop: '12px',
        padding: '12px',
        backgroundColor: 'var(--bg-tertiary)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          fontSize: '0.875rem',
          fontWeight: 500,
        }}
      >
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={handleToggle}
          style={{ cursor: 'pointer' }}
        />
        <Bell
          size={16}
          style={{ color: isEnabled ? 'var(--color-primary)' : 'var(--text-muted)' }}
        />
        <span>Set Reminder</span>
      </label>

      {isEnabled && (
        <div style={{ marginTop: '10px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                marginBottom: '4px',
              }}
            >
              When
            </label>
            <select
              value={value?.relativeOffset || '15 minutes'}
              onChange={handleOffsetChange}
              style={{
                padding: '6px 8px',
                fontSize: '0.8125rem',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <option value="0 minutes">At deadline</option>
              <option value="5 minutes">5 minutes before</option>
              <option value="15 minutes">15 minutes before</option>
              <option value="30 minutes">30 minutes before</option>
              <option value="1 hour">1 hour before</option>
              <option value="1 day">1 day before</option>
            </select>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                marginBottom: '4px',
              }}
            >
              Priority
            </label>
            <select
              value={value?.priority || 'NORMAL'}
              onChange={handlePriorityChange}
              style={{
                padding: '6px 8px',
                fontSize: '0.8125rem',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical (Alarm)</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
