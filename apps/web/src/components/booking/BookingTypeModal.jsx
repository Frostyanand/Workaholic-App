import React, { useState, useEffect } from 'react';
import { X, Clock, CheckSquare, MapPin, Link2, AlertCircle } from 'lucide-react';
import * as bookingApi from '../../services/booking.api.js';

export function BookingTypeModal({
  isOpen,
  onClose,
  workspaceId,
  pageId,
  bookingType = null,
  onSaved,
}) {
  const isEditing = Boolean(bookingType?.id);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [bufferBeforeMinutes, setBufferBeforeMinutes] = useState(0);
  const [bufferAfterMinutes, setBufferAfterMinutes] = useState(0);
  const [minNoticeMinutes, setMinNoticeMinutes] = useState(60);
  const [maxNoticeDays, setMaxNoticeDays] = useState(60);
  const [cancellationNoticeHours, setCancellationNoticeHours] = useState(24);
  const [rescheduleNoticeHours, setRescheduleNoticeHours] = useState(24);
  const [location, setLocation] = useState('Google Meet');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [createTask, setCreateTask] = useState(false);
  const [taskPriority, setTaskPriority] = useState('MEDIUM');
  const [isActive, setIsActive] = useState(true);
  const [color, setColor] = useState('#6366f1');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    if (bookingType) {
      setName(bookingType.name || '');
      setSlug(bookingType.slug || '');
      setDescription(bookingType.description || '');
      setDurationMinutes(bookingType.durationMinutes || 30);
      setBufferBeforeMinutes(bookingType.bufferBeforeMinutes || 0);
      setBufferAfterMinutes(bookingType.bufferAfterMinutes || 0);
      setMinNoticeMinutes(bookingType.minNoticeMinutes || 60);
      setMaxNoticeDays(bookingType.maxNoticeDays || 60);
      setCancellationNoticeHours(bookingType.cancellationNoticeHours ?? 24);
      setRescheduleNoticeHours(bookingType.rescheduleNoticeHours ?? 24);
      setLocation(bookingType.location || 'Google Meet');
      setMeetingUrl(bookingType.meetingUrl || '');
      setCreateTask(Boolean(bookingType.createTask));
      setTaskPriority(bookingType.taskPriority || 'MEDIUM');
      setIsActive(bookingType.isActive !== false);
      setColor(bookingType.color || '#6366f1');
    } else {
      setName('');
      setSlug('');
      setDescription('');
      setDurationMinutes(30);
      setBufferBeforeMinutes(0);
      setBufferAfterMinutes(0);
      setMinNoticeMinutes(60);
      setMaxNoticeDays(60);
      setCancellationNoticeHours(24);
      setRescheduleNoticeHours(24);
      setLocation('Google Meet');
      setMeetingUrl('');
      setCreateTask(false);
      setTaskPriority('MEDIUM');
      setIsActive(true);
      setColor('#6366f1');
    }
    setError(null);
  }, [isOpen, bookingType]);

  function handleNameChange(e) {
    const val = e.target.value;
    setName(val);
    if (
      !isEditing &&
      (!slug ||
        slug ===
          name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, ''))
    ) {
      const generated = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      setSlug(generated);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a name for this booking type');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload = {
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || null,
        durationMinutes: Number(durationMinutes),
        bufferBeforeMinutes: Number(bufferBeforeMinutes),
        bufferAfterMinutes: Number(bufferAfterMinutes),
        minNoticeMinutes: Number(minNoticeMinutes),
        maxNoticeDays: Number(maxNoticeDays),
        cancellationNoticeHours: Number(cancellationNoticeHours),
        rescheduleNoticeHours: Number(rescheduleNoticeHours),
        location: location.trim() || null,
        meetingUrl: meetingUrl.trim() || null,
        createTask: Boolean(createTask),
        taskPriority,
        isActive: Boolean(isActive),
        color,
      };

      let result;
      if (isEditing) {
        result = await bookingApi.updateBookingType(workspaceId, bookingType.id, payload);
      } else {
        result = await bookingApi.createBookingType(workspaceId, pageId, payload);
      }

      onSaved(result);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save booking type');
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      data-testid="booking-type-modal"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
    >
      <div
        className="modal-card"
        style={{
          background: 'var(--bg-secondary, #131722)',
          border: '1px solid var(--border-color, #2d3748)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '600px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          color: 'var(--text-primary, #f1f5f9)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-color, #2d3748)',
          }}
        >
          <h2
            style={{
              fontSize: '18px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Clock size={20} color="var(--accent-primary, #6366f1)" />
            {isEditing ? 'Edit Appointment Type' : 'New Appointment Type'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary, #94a3b8)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        <form
          id="booking-type-form"
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
        >
          {/* Modal Body */}
          <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
            {error && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid var(--accent-danger, #ef4444)',
                  color: '#fca5a5',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: '6px',
                  }}
                >
                  Appointment Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={handleNameChange}
                  placeholder="e.g. 30 Min Quick Sync"
                  required
                  data-testid="type-name-input"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #2d3748)',
                    background: 'var(--bg-primary, #0a0d14)',
                    color: '#fff',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      marginBottom: '6px',
                    }}
                  >
                    Duration (Minutes) *
                  </label>
                  <select
                    value={durationMinutes}
                    onChange={e => setDurationMinutes(Number(e.target.value))}
                    data-testid="type-duration-select"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color, #2d3748)',
                      background: 'var(--bg-primary, #0a0d14)',
                      color: '#fff',
                      fontSize: '14px',
                    }}
                  >
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={45}>45 minutes</option>
                    <option value={60}>60 minutes (1 hour)</option>
                    <option value={90}>90 minutes (1.5 hours)</option>
                    <option value={120}>120 minutes (2 hours)</option>
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      marginBottom: '6px',
                    }}
                  >
                    Highlight Color
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="color"
                      value={color}
                      onChange={e => setColor(e.target.value)}
                      style={{
                        width: '42px',
                        height: '42px',
                        padding: 0,
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, #2d3748)',
                        background: 'none',
                        cursor: 'pointer',
                      }}
                    />
                    <input
                      type="text"
                      value={color}
                      onChange={e => setColor(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, #2d3748)',
                        background: 'var(--bg-primary, #0a0d14)',
                        color: '#fff',
                        fontSize: '13px',
                      }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 500,
                    marginBottom: '6px',
                  }}
                >
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Give guests context on what will be discussed during this session..."
                  rows={2}
                  data-testid="type-description-input"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #2d3748)',
                    background: 'var(--bg-primary, #0a0d14)',
                    color: '#fff',
                    fontSize: '14px',
                    resize: 'vertical',
                  }}
                />
              </div>

              {/* Buffers & Horizon */}
              <div
                style={{
                  border: '1px solid var(--border-color, #2d3748)',
                  borderRadius: '8px',
                  padding: '14px',
                  background: 'rgba(255, 255, 255, 0.02)',
                }}
              >
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--accent-primary, #6366f1)',
                    display: 'block',
                    marginBottom: '10px',
                  }}
                >
                  Buffers & Notice Rules (Authoritative BR-BOOK-003/004)
                </span>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px',
                    marginBottom: '10px',
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        color: 'var(--text-secondary, #94a3b8)',
                        marginBottom: '4px',
                      }}
                    >
                      Buffer Before (minutes)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      step={5}
                      value={bufferBeforeMinutes}
                      onChange={e => setBufferBeforeMinutes(e.target.value)}
                      data-testid="type-buffer-before-input"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color, #2d3748)',
                        background: 'var(--bg-primary, #0a0d14)',
                        color: '#fff',
                        fontSize: '13px',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        color: 'var(--text-secondary, #94a3b8)',
                        marginBottom: '4px',
                      }}
                    >
                      Buffer After (minutes)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      step={5}
                      value={bufferAfterMinutes}
                      onChange={e => setBufferAfterMinutes(e.target.value)}
                      data-testid="type-buffer-after-input"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color, #2d3748)',
                        background: 'var(--bg-primary, #0a0d14)',
                        color: '#fff',
                        fontSize: '13px',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        color: 'var(--text-secondary, #94a3b8)',
                        marginBottom: '4px',
                      }}
                    >
                      Minimum Notice (minutes)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10080}
                      step={15}
                      value={minNoticeMinutes}
                      onChange={e => setMinNoticeMinutes(e.target.value)}
                      data-testid="type-min-notice-input"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color, #2d3748)',
                        background: 'var(--bg-primary, #0a0d14)',
                        color: '#fff',
                        fontSize: '13px',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        color: 'var(--text-secondary, #94a3b8)',
                        marginBottom: '4px',
                      }}
                    >
                      Max Booking Horizon (days)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={maxNoticeDays}
                      onChange={e => setMaxNoticeDays(e.target.value)}
                      data-testid="type-max-horizon-input"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color, #2d3748)',
                        background: 'var(--bg-primary, #0a0d14)',
                        color: '#fff',
                        fontSize: '13px',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Cancellation & Rescheduling Notice Policy */}
              <div
                style={{
                  border: '1px solid var(--border-color, #2d3748)',
                  borderRadius: '8px',
                  padding: '14px',
                  background: 'rgba(255, 255, 255, 0.02)',
                }}
              >
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--accent-primary, #6366f1)',
                    display: 'block',
                    marginBottom: '10px',
                  }}
                >
                  Cancellation & Rescheduling Policies
                </span>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        color: 'var(--text-secondary, #94a3b8)',
                        marginBottom: '4px',
                      }}
                    >
                      Cancel Notice Deadline (hours)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={720}
                      value={cancellationNoticeHours}
                      onChange={e => setCancellationNoticeHours(e.target.value)}
                      data-testid="type-cancel-notice-input"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color, #2d3748)',
                        background: 'var(--bg-primary, #0a0d14)',
                        color: '#fff',
                        fontSize: '13px',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        color: 'var(--text-secondary, #94a3b8)',
                        marginBottom: '4px',
                      }}
                    >
                      Reschedule Deadline (hours)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={720}
                      value={rescheduleNoticeHours}
                      onChange={e => setRescheduleNoticeHours(e.target.value)}
                      data-testid="type-reschedule-notice-input"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color, #2d3748)',
                        background: 'var(--bg-primary, #0a0d14)',
                        color: '#fff',
                        fontSize: '13px',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Location & Meeting Link */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      marginBottom: '6px',
                    }}
                  >
                    Location / Mode
                  </label>
                  <div style={{ position: 'relative' }}>
                    <MapPin
                      size={16}
                      style={{ position: 'absolute', left: '10px', top: '12px', color: '#94a3b8' }}
                    />
                    <input
                      type="text"
                      value={location}
                      onChange={e => setLocation(e.target.value)}
                      placeholder="e.g. Google Meet, Zoom, Office"
                      data-testid="type-location-input"
                      style={{
                        width: '100%',
                        padding: '10px 12px 10px 34px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, #2d3748)',
                        background: 'var(--bg-primary, #0a0d14)',
                        color: '#fff',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 500,
                      marginBottom: '6px',
                    }}
                  >
                    Meeting URL
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Link2
                      size={16}
                      style={{ position: 'absolute', left: '10px', top: '12px', color: '#94a3b8' }}
                    />
                    <input
                      type="url"
                      value={meetingUrl}
                      onChange={e => setMeetingUrl(e.target.value)}
                      placeholder="https://meet.google.com/..."
                      data-testid="type-meeting-url-input"
                      style={{
                        width: '100%',
                        padding: '10px 12px 10px 34px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color, #2d3748)',
                        background: 'var(--bg-primary, #0a0d14)',
                        color: '#fff',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Optional Task Creation (REQ-BOOK-014) */}
              <div
                style={{
                  border: '1px solid var(--border-color, #2d3748)',
                  borderRadius: '8px',
                  padding: '14px',
                  background: 'rgba(99, 102, 241, 0.05)',
                }}
              >
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={createTask}
                    onChange={e => setCreateTask(e.target.checked)}
                    data-testid="type-create-task-toggle"
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <CheckSquare size={16} color="var(--accent-primary, #6366f1)" />
                    Auto-create Task on Booking Confirmation (REQ-BOOK-014)
                  </span>
                </label>

                {createTask && (
                  <div style={{ marginTop: '12px', paddingLeft: '28px' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        color: 'var(--text-secondary, #94a3b8)',
                        marginBottom: '4px',
                      }}
                    >
                      Generated Task Priority
                    </label>
                    <select
                      value={taskPriority}
                      onChange={e => setTaskPriority(e.target.value)}
                      data-testid="type-task-priority-select"
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color, #2d3748)',
                        background: 'var(--bg-primary, #0a0d14)',
                        color: '#fff',
                        fontSize: '13px',
                      }}
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Active Toggle */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                  marginTop: '4px',
                }}
              >
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={e => setIsActive(e.target.checked)}
                  data-testid="type-is-active-toggle"
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '13px' }}>Active and bookable on public page</span>
              </label>
            </div>
          </div>

          {/* Modal Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              padding: '16px 24px',
              borderTop: '1px solid var(--border-color, #2d3748)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #2d3748)',
                background: 'transparent',
                color: 'var(--text-secondary, #94a3b8)',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              data-testid="save-booking-type-btn"
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--accent-primary, #6366f1)',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Type'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
