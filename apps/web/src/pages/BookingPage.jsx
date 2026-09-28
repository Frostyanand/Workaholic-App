import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarClock,
  Plus,
  Clock,
  Copy,
  ExternalLink,
  Edit2,
  Trash2,
  Calendar,
  AlertCircle,
  CheckSquare,
  MapPin,
  CalendarX,
  RefreshCw,
} from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader.jsx';
import { LoadingSpinner } from '../components/common/LoadingSpinner.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { Badge } from '../components/common/Badge.jsx';
import { Button } from '../components/common/Button.jsx';
import { ConfirmDialog } from '../components/common/ConfirmDialog.jsx';
import { useToast } from '../components/common/ToastContext.jsx';
import * as bookingApi from '../services/booking.api.js';

import { BookingPageModal } from '../components/booking/BookingPageModal.jsx';
import { BookingTypeModal } from '../components/booking/BookingTypeModal.jsx';
import { AvailabilityRulesModal } from '../components/booking/AvailabilityRulesModal.jsx';
import { DateExceptionModal } from '../components/booking/DateExceptionModal.jsx';
import { OwnerBookingActionModal } from '../components/booking/OwnerBookingActionModal.jsx';

export function BookingPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('PAGES'); // 'PAGES' | 'BOOKINGS'

  // Data state
  const [pages, setPages] = useState([]);
  const [selectedPage, setSelectedPage] = useState(null);
  const [typesByPage, setTypesByPage] = useState({});
  const [bookings, setBookings] = useState([]);
  const [bookingStatusFilter, setBookingStatusFilter] = useState('ALL');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals state
  const [pageModalOpen, setPageModalOpen] = useState(false);
  const [editingPage, setEditingPage] = useState(null);

  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [targetPageForType, setTargetPageForType] = useState(null);

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleTargetPage, setScheduleTargetPage] = useState(null);

  const [exceptionModalOpen, setExceptionModalOpen] = useState(false);
  const [exceptionTargetPage, setExceptionTargetPage] = useState(null);

  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [targetBooking, setTargetBooking] = useState(null);
  const [actionModalMode, setActionModalMode] = useState('cancel');

  const [deleteDialog, setDeleteDialog] = useState({ isOpen: false, item: null, type: null });

  // Load Pages & Types
  const loadPagesAndTypes = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const pageList = await bookingApi.listBookingPages(null);
      setPages(pageList || []);

      // Load types for all pages in parallel
      const typeMap = {};
      await Promise.all(
        (pageList || []).map(async p => {
          try {
            const types = await bookingApi.listBookingTypes(null, p.id);
            typeMap[p.id] = types || [];
          } catch {
            typeMap[p.id] = [];
          }
        }),
      );
      setTypesByPage(typeMap);

      if (pageList && pageList.length > 0 && !selectedPage) {
        setSelectedPage(pageList[0]);
      }
    } catch (err) {
      setError(err.message || 'Failed to load booking pages');
    } finally {
      setIsLoading(false);
    }
  }, [selectedPage]);

  // Load Bookings
  const loadBookings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const filters = {};
      if (bookingStatusFilter !== 'ALL') {
        filters.status = bookingStatusFilter;
      }
      const data = await bookingApi.listOwnerBookings(null, filters);
      setBookings(data || []);
    } catch (err) {
      setError(err.message || 'Failed to load bookings');
    } finally {
      setIsLoading(false);
    }
  }, [bookingStatusFilter]);

  useEffect(() => {
    if (activeTab === 'PAGES') {
      loadPagesAndTypes();
    } else {
      loadBookings();
    }
  }, [activeTab, loadPagesAndTypes, loadBookings]);

  // Copy Public Link
  const handleCopyLink = slug => {
    const url = `${window.location.origin}/book/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success('Public booking link copied to clipboard');
  };

  // Open Preview Link
  const handleOpenPreview = slug => {
    window.open(`/book/${slug}`, '_blank', 'noopener,noreferrer');
  };

  // Delete Handlers
  const confirmDelete = async () => {
    const { item, type } = deleteDialog;
    if (!item) return;

    try {
      if (type === 'PAGE') {
        await bookingApi.deleteBookingPage(null, item.id);
        toast.success(`Booking page "${item.name}" deleted`);
        loadPagesAndTypes();
      } else if (type === 'TYPE') {
        await bookingApi.deleteBookingType(null, item.id);
        toast.success(`Appointment type "${item.name}" deleted`);
        loadPagesAndTypes();
      }
    } catch (err) {
      toast.error(err.message || 'Failed to delete item');
    } finally {
      setDeleteDialog({ isOpen: false, item: null, type: null });
    }
  };

  return (
    <div
      className="page-container"
      data-testid="booking-management-page"
      style={{
        padding: '24px',
        maxWidth: '1280px',
        margin: '0 auto',
        color: 'var(--text-primary, #f1f5f9)',
      }}
    >
      <PageHeader
        title="Booking & Availability"
        subtitle="Manage public booking pages, custom appointment types, buffers, and calendar availability"
        actions={
          <div style={{ display: 'flex', gap: '12px' }}>
            {activeTab === 'PAGES' && (
              <Button
                variant="primary"
                onClick={() => {
                  setEditingPage(null);
                  setPageModalOpen(true);
                }}
                data-testid="create-booking-page-btn"
              >
                <Plus size={16} />
                New Booking Page
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => (activeTab === 'PAGES' ? loadPagesAndTypes() : loadBookings())}
              data-testid="refresh-booking-btn"
            >
              <RefreshCw size={16} />
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid var(--border-color, #2d3748)',
          marginBottom: '24px',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('PAGES')}
          data-testid="tab-pages-types"
          style={{
            padding: '10px 18px',
            background: 'none',
            border: 'none',
            borderBottom:
              activeTab === 'PAGES'
                ? '2px solid var(--accent-primary, #6366f1)'
                : '2px solid transparent',
            color:
              activeTab === 'PAGES'
                ? 'var(--accent-primary, #6366f1)'
                : 'var(--text-secondary, #94a3b8)',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CalendarClock size={16} />
          Booking Pages & Types
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('BOOKINGS')}
          data-testid="tab-scheduled-bookings"
          style={{
            padding: '10px 18px',
            background: 'none',
            border: 'none',
            borderBottom:
              activeTab === 'BOOKINGS'
                ? '2px solid var(--accent-primary, #6366f1)'
                : '2px solid transparent',
            color:
              activeTab === 'BOOKINGS'
                ? 'var(--accent-primary, #6366f1)'
                : 'var(--text-secondary, #94a3b8)',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Clock size={16} />
          Scheduled Appointments
        </button>
      </div>

      {isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <LoadingSpinner size="lg" />
        </div>
      )}

      {error && !isLoading && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--accent-danger, #ef4444)',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <AlertCircle size={20} color="var(--accent-danger, #ef4444)" />
          <span>{error}</span>
        </div>
      )}

      {/* TAB 1: Pages & Types */}
      {!isLoading && !error && activeTab === 'PAGES' && (
        <div>
          {pages.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No booking pages created yet"
              description="Create your first public booking page to start sharing calendar availability with external guests."
              action={
                <Button
                  variant="primary"
                  onClick={() => {
                    setEditingPage(null);
                    setPageModalOpen(true);
                  }}
                  data-testid="empty-create-page-btn"
                >
                  <Plus size={16} />
                  Create Booking Page
                </Button>
              }
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {pages.map(page => {
                const types = typesByPage[page.id] || [];
                const isActive = page.status === 'ACTIVE';

                return (
                  <div
                    key={page.id}
                    data-testid={`booking-page-card-${page.id}`}
                    style={{
                      background: 'var(--bg-secondary, #131722)',
                      border: '1px solid var(--border-color, #2d3748)',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    }}
                  >
                    {/* Page Header Bar */}
                    <div
                      style={{
                        padding: '18px 24px',
                        borderBottom: '1px solid var(--border-color, #2d3748)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        background: 'rgba(255, 255, 255, 0.015)',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            marginBottom: '4px',
                          }}
                        >
                          <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>
                            {page.name}
                          </h3>
                          <Badge variant={isActive ? 'success' : 'muted'}>{page.status}</Badge>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            fontSize: '13px',
                            color: 'var(--text-secondary, #94a3b8)',
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={14} /> {page.timezone || 'UTC'}
                          </span>
                          <span>•</span>
                          <span>Slug: /book/{page.slug}</span>
                        </div>
                      </div>

                      {/* Page Actions */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleCopyLink(page.slug)}
                          data-testid={`copy-link-btn-${page.id}`}
                          title="Copy public booking link"
                        >
                          <Copy size={14} /> Copy Link
                        </Button>

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenPreview(page.slug)}
                          data-testid={`preview-link-btn-${page.id}`}
                          title="Open public booking page in new tab"
                        >
                          <ExternalLink size={14} /> View
                        </Button>

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setScheduleTargetPage(page);
                            setScheduleModalOpen(true);
                          }}
                          data-testid={`schedule-btn-${page.id}`}
                          title="Configure weekly hours"
                        >
                          <Clock size={14} /> Hours
                        </Button>

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setExceptionTargetPage(page);
                            setExceptionModalOpen(true);
                          }}
                          data-testid={`exception-btn-${page.id}`}
                          title="Add date override/holiday"
                        >
                          <CalendarX size={14} /> Override
                        </Button>

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setEditingPage(page);
                            setPageModalOpen(true);
                          }}
                          data-testid={`edit-page-btn-${page.id}`}
                          title="Edit page details"
                        >
                          <Edit2 size={14} />
                        </Button>

                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() =>
                            setDeleteDialog({ isOpen: true, item: page, type: 'PAGE' })
                          }
                          data-testid={`delete-page-btn-${page.id}`}
                          title="Delete booking page"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>

                    {/* Appointment Types List */}
                    <div style={{ padding: '20px 24px' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '14px',
                        }}
                      >
                        <h4
                          style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            color: 'var(--text-secondary, #94a3b8)',
                            margin: 0,
                          }}
                        >
                          Appointment Types ({types.length})
                        </h4>

                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setTargetPageForType(page);
                            setEditingType(null);
                            setTypeModalOpen(true);
                          }}
                          data-testid={`add-type-btn-${page.id}`}
                        >
                          <Plus size={14} /> Add Appointment Type
                        </Button>
                      </div>

                      {types.length === 0 ? (
                        <div
                          style={{
                            padding: '24px',
                            textAlign: 'center',
                            background: 'rgba(0, 0, 0, 0.2)',
                            borderRadius: '8px',
                            border: '1px dashed var(--border-color, #2d3748)',
                            color: 'var(--text-secondary, #94a3b8)',
                            fontSize: '13px',
                          }}
                        >
                          No appointment types configured yet. Add at least one type (e.g. "30 Min
                          Chat") so guests can book.
                        </div>
                      ) : (
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                            gap: '16px',
                          }}
                        >
                          {types.map(t => (
                            <div
                              key={t.id}
                              data-testid={`booking-type-card-${t.id}`}
                              style={{
                                background: 'rgba(0, 0, 0, 0.25)',
                                border: '1px solid var(--border-color, #2d3748)',
                                borderLeft: `4px solid ${t.color || '#6366f1'}`,
                                borderRadius: '8px',
                                padding: '16px',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                              }}
                            >
                              <div>
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    marginBottom: '8px',
                                  }}
                                >
                                  <h5 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>
                                    {t.name}
                                  </h5>
                                  <Badge variant={t.isActive ? 'primary' : 'muted'}>
                                    {t.isActive ? `${t.durationMinutes}m` : 'Inactive'}
                                  </Badge>
                                </div>

                                {t.description && (
                                  <p
                                    style={{
                                      fontSize: '12px',
                                      color: 'var(--text-secondary, #94a3b8)',
                                      marginBottom: '12px',
                                      lineHeight: 1.4,
                                    }}
                                  >
                                    {t.description}
                                  </p>
                                )}

                                <div
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px',
                                    fontSize: '12px',
                                    color: 'var(--text-secondary, #94a3b8)',
                                    marginBottom: '14px',
                                  }}
                                >
                                  {t.location && (
                                    <div
                                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                    >
                                      <MapPin size={13} /> {t.location}
                                    </div>
                                  )}

                                  {(t.bufferBeforeMinutes > 0 || t.bufferAfterMinutes > 0) && (
                                    <div>
                                      Buffers: +{t.bufferBeforeMinutes}m pre / +
                                      {t.bufferAfterMinutes}m post
                                    </div>
                                  )}

                                  {t.createTask && (
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        color: 'var(--accent-primary, #6366f1)',
                                      }}
                                    >
                                      <CheckSquare size={13} /> Auto-create Task (
                                      {t.taskPriority || 'MEDIUM'})
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Type Actions */}
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'flex-end',
                                  gap: '8px',
                                  borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                                  paddingTop: '10px',
                                }}
                              >
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    setTargetPageForType(page);
                                    setEditingType(t);
                                    setTypeModalOpen(true);
                                  }}
                                  data-testid={`edit-type-btn-${t.id}`}
                                >
                                  <Edit2 size={13} /> Edit
                                </Button>

                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={() =>
                                    setDeleteDialog({ isOpen: true, item: t, type: 'TYPE' })
                                  }
                                  data-testid={`delete-type-btn-${t.id}`}
                                >
                                  <Trash2 size={13} />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Bookings / Appointments */}
      {!isLoading && !error && activeTab === 'BOOKINGS' && (
        <div>
          {/* Status Filter */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            {['ALL', 'CONFIRMED', 'CANCELLED', 'RESCHEDULED'].map(status => (
              <button
                key={status}
                type="button"
                onClick={() => setBookingStatusFilter(status)}
                data-testid={`filter-${status.toLowerCase()}`}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  border: '1px solid var(--border-color, #2d3748)',
                  background:
                    bookingStatusFilter === status
                      ? 'var(--accent-primary, #6366f1)'
                      : 'rgba(0, 0, 0, 0.2)',
                  color: bookingStatusFilter === status ? '#fff' : 'var(--text-secondary, #94a3b8)',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                {status.charAt(0) + status.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {bookings.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No appointments found"
              description="When external guests book slots from your public booking page, they will appear here."
            />
          ) : (
            <div
              style={{
                background: 'var(--bg-secondary, #131722)',
                border: '1px solid var(--border-color, #2d3748)',
                borderRadius: '12px',
                overflow: 'hidden',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: '14px',
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--border-color, #2d3748)',
                      background: 'rgba(255, 255, 255, 0.02)',
                      color: 'var(--text-secondary, #94a3b8)',
                      fontSize: '12px',
                      textTransform: 'uppercase',
                    }}
                  >
                    <th style={{ padding: '14px 16px' }}>Guest</th>
                    <th style={{ padding: '14px 16px' }}>Appointment Type</th>
                    <th style={{ padding: '14px 16px' }}>Date & Time</th>
                    <th style={{ padding: '14px 16px' }}>Status</th>
                    <th style={{ padding: '14px 16px' }}>Provenance</th>
                    <th style={{ padding: '14px 16px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map(b => {
                    const startDate = new Date(b.startAt);
                    const endDate = new Date(b.endAt);
                    const isConfirmed = b.status === 'CONFIRMED';

                    let statusVariant = 'muted';
                    if (b.status === 'CONFIRMED') statusVariant = 'success';
                    if (b.status === 'CANCELLED') statusVariant = 'danger';
                    if (b.status === 'RESCHEDULED') statusVariant = 'warning';

                    return (
                      <tr
                        key={b.id}
                        data-testid={`booking-row-${b.id}`}
                        style={{ borderBottom: '1px solid var(--border-color, #2d3748)' }}
                      >
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 600 }}>{b.guestName}</div>
                          <div
                            style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}
                          >
                            {b.guestEmail}
                          </div>
                        </td>

                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 500 }}>
                            {b.bookingTypeName || 'Standard Appointment'}
                          </div>
                          {b.location && (
                            <div
                              style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}
                            >
                              {b.location}
                            </div>
                          )}
                        </td>

                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 500 }}>
                            {startDate.toLocaleDateString(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </div>
                          <div
                            style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}
                          >
                            {startDate.toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}{' '}
                            -{' '}
                            {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                            ({b.timezone})
                          </div>
                        </td>

                        <td style={{ padding: '14px 16px' }}>
                          <Badge variant={statusVariant}>{b.status}</Badge>
                        </td>

                        <td style={{ padding: '14px 16px' }}>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                              fontSize: '12px',
                            }}
                          >
                            {b.calendarEventId && (
                              <span
                                style={{
                                  color: 'var(--accent-primary, #6366f1)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <Calendar size={12} /> Synced Event
                              </span>
                            )}
                            {b.taskId && (
                              <span
                                style={{
                                  color: '#10b981',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <CheckSquare size={12} /> Auto Task
                              </span>
                            )}
                          </div>
                        </td>

                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          {isConfirmed ? (
                            <div
                              style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}
                            >
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setTargetBooking(b);
                                  setActionModalMode('reschedule');
                                  setActionModalOpen(true);
                                }}
                                data-testid={`reschedule-booking-btn-${b.id}`}
                              >
                                Reschedule
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => {
                                  setTargetBooking(b);
                                  setActionModalMode('cancel');
                                  setActionModalOpen(true);
                                }}
                                data-testid={`cancel-booking-btn-${b.id}`}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <span
                              style={{
                                fontSize: '12px',
                                color: 'var(--text-secondary, #64748b)',
                                fontStyle: 'italic',
                              }}
                            >
                              {b.cancellationReason || 'Closed'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <BookingPageModal
        isOpen={pageModalOpen}
        onClose={() => setPageModalOpen(false)}
        workspaceId={null}
        page={editingPage}
        onSaved={loadPagesAndTypes}
      />

      <BookingTypeModal
        isOpen={typeModalOpen}
        onClose={() => setTypeModalOpen(false)}
        workspaceId={null}
        pageId={targetPageForType?.id}
        bookingType={editingType}
        onSaved={loadPagesAndTypes}
      />

      <AvailabilityRulesModal
        isOpen={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        workspaceId={null}
        pageId={scheduleTargetPage?.id}
        pageName={scheduleTargetPage?.name}
        onSaved={loadPagesAndTypes}
      />

      <DateExceptionModal
        isOpen={exceptionModalOpen}
        onClose={() => setExceptionModalOpen(false)}
        workspaceId={null}
        pageId={exceptionTargetPage?.id}
        onSaved={loadPagesAndTypes}
      />

      <OwnerBookingActionModal
        isOpen={actionModalOpen}
        onClose={() => setActionModalOpen(false)}
        workspaceId={null}
        booking={targetBooking}
        mode={actionModalMode}
        onSuccess={() => {
          toast.success(actionModalMode === 'cancel' ? 'Booking cancelled' : 'Booking rescheduled');
          loadBookings();
        }}
      />

      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        title={`Delete ${deleteDialog.type === 'PAGE' ? 'Booking Page' : 'Appointment Type'}`}
        message={`Are you sure you want to delete "${deleteDialog.item?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteDialog({ isOpen: false, item: null, type: null })}
      />
    </div>
  );
}
