// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PublicCalendarModal } from '../src/components/calendar/PublicCalendarModal.jsx';
import { PublicCalendarPage } from '../src/pages/PublicCalendarPage.jsx';
import * as pubCalApi from '../src/services/public-calendar.api.js';

describe('Public Calendar Web Components (Phase 19: TM-PUBLIC-001..008)', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  const mockCalendar = {
    id: 'cal_123',
    name: 'Workaholic Primary',
    color: '#3B82F6',
    timezone: 'UTC',
    isDefault: true,
  };

  // =========================================================================
  // PublicCalendarModal Tests
  // =========================================================================
  describe('PublicCalendarModal Component', () => {
    it('renders nothing when isOpen is false', async () => {
      await act(async () => {
        root.render(
          <PublicCalendarModal
            isOpen={false}
            onClose={vi.fn()}
            calendar={mockCalendar}
            workspaceId="ws_123"
          />,
        );
      });

      expect(container.innerHTML).toBe('');
    });

    it('renders inactive state with enable option when no public link exists', async () => {
      vi.spyOn(pubCalApi, 'getActivePublicLink').mockResolvedValue(null);

      await act(async () => {
        root.render(
          <PublicCalendarModal
            isOpen={true}
            onClose={vi.fn()}
            calendar={mockCalendar}
            workspaceId="ws_123"
          />,
        );
      });

      expect(container.textContent).toContain('Share Calendar & Public Link');
      expect(container.textContent).toContain('Workaholic Primary');
      expect(container.textContent).toContain('Inactive / Not Shared');
      expect(container.textContent).toContain('Enable Public Link');
      expect(container.textContent).toContain('Strict Privacy Protection');
    });

    it('enables public calendar link on submit', async () => {
      vi.spyOn(pubCalApi, 'getActivePublicLink').mockResolvedValue(null);
      const createSpy = vi.spyOn(pubCalApi, 'createPublicLink').mockResolvedValue({
        id: 'link_456',
        calendarId: 'cal_123',
        status: 'ACTIVE',
        token: 'pcal_mocktoken1234567890abcdef',
        url: '/public/calendar/pcal_mocktoken1234567890abcdef',
        createdAt: new Date().toISOString(),
        expiresAt: null,
      });

      await act(async () => {
        root.render(
          <PublicCalendarModal
            isOpen={true}
            onClose={vi.fn()}
            calendar={mockCalendar}
            workspaceId="ws_123"
          />,
        );
      });

      const enableBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent.includes('Enable Public Link'),
      );
      expect(enableBtn).toBeDefined();

      await act(async () => {
        enableBtn.click();
      });

      expect(createSpy).toHaveBeenCalledWith('ws_123', 'cal_123', { expiresAt: null });
      expect(container.textContent).toContain('Active & Public');
      const urlInput = container.querySelector('input[readonly]');
      expect(urlInput).toBeDefined();
      expect(urlInput.value).toContain('/public/calendar/pcal_mocktoken');
    });

    it('renders active state with copy, regenerate, and revoke controls', async () => {
      vi.spyOn(pubCalApi, 'getActivePublicLink').mockResolvedValue({
        id: 'link_active_1',
        calendarId: 'cal_123',
        status: 'ACTIVE',
        token: 'pcal_active_token_123',
        url: '/public/calendar/pcal_active_token_123',
        createdAt: '2026-09-01T10:00:00Z',
        expiresAt: null,
        lastAccessedAt: null,
      });

      await act(async () => {
        root.render(
          <PublicCalendarModal
            isOpen={true}
            onClose={vi.fn()}
            calendar={mockCalendar}
            workspaceId="ws_123"
          />,
        );
      });

      expect(container.textContent).toContain('Active & Public');
      expect(container.textContent).toContain('Copy');
      expect(container.textContent).toContain('Regenerate');
      expect(container.textContent).toContain('Revoke Link');
      expect(container.textContent).toContain('Preview Public View');

      // Test Revoke Confirmation flow
      const revokeBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent.includes('Revoke Link'),
      );
      expect(revokeBtn).toBeDefined();

      await act(async () => {
        revokeBtn.click();
      });

      expect(container.textContent).toContain('Revoke public link?');
      expect(container.textContent).toContain('Confirm Revoke');

      const revokeSpy = vi
        .spyOn(pubCalApi, 'revokePublicLink')
        .mockResolvedValue({ revoked: true });

      const confirmRevokeBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent.includes('Confirm Revoke'),
      );

      await act(async () => {
        confirmRevokeBtn.click();
      });

      expect(revokeSpy).toHaveBeenCalledWith('ws_123', 'cal_123');
      expect(container.textContent).toContain('Inactive / Not Shared');
    });
  });

  // =========================================================================
  // PublicCalendarPage Anonymous Viewer Tests
  // =========================================================================
  describe('PublicCalendarPage Component', () => {
    it('renders calendar feed with privacy-projected events', async () => {
      vi.spyOn(pubCalApi, 'getPublicCalendarFeed').mockResolvedValue({
        calendar: {
          name: 'Executive Schedule',
          timezone: 'America/New_York',
          color: '#10B981',
        },
        events: [
          {
            id: 'evt_1',
            title: 'Busy',
            start: '2026-09-28T14:00:00Z',
            end: '2026-09-28T15:00:00Z',
            isAllDay: false,
            busy: true,
          },
          {
            id: 'evt_2',
            title: 'Open Office Hours',
            start: '2026-09-28T16:00:00Z',
            end: '2026-09-28T17:00:00Z',
            isAllDay: false,
            busy: true,
          },
        ],
      });

      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/public/calendar/pcal_test_token']}>
            <Routes>
              <Route path="/public/calendar/:token" element={<PublicCalendarPage />} />
            </Routes>
          </MemoryRouter>,
        );
      });

      expect(container.textContent).toContain('Executive Schedule');
      expect(container.textContent).toContain('America/New_York');
      expect(container.textContent).toContain('Privacy Protected');
      expect(container.textContent).toContain('Busy');
      expect(container.textContent).toContain('Open Office Hours');

      // Test switching to Agenda view
      const agendaBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent.includes('Agenda'),
      );
      expect(agendaBtn).toBeDefined();

      await act(async () => {
        agendaBtn.click();
      });

      expect(container.textContent).toContain('Busy');
      expect(container.textContent).toContain('Open Office Hours');
      expect(container.textContent).toContain('Public Event');
    });

    it('renders revoked notice when token is revoked', async () => {
      const revokedError = new Error('This public calendar link has been revoked');
      revokedError.status = 410;
      revokedError.code = 'RESOURCE_REVOKED';

      vi.spyOn(pubCalApi, 'getPublicCalendarFeed').mockRejectedValue(revokedError);

      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/public/calendar/pcal_revoked_token']}>
            <Routes>
              <Route path="/public/calendar/:token" element={<PublicCalendarPage />} />
            </Routes>
          </MemoryRouter>,
        );
      });

      expect(container.textContent).toContain('Calendar Link Revoked');
      expect(container.textContent).toContain('has been revoked by the owner');
    });

    it('renders expired notice when token has expired', async () => {
      const expiredError = new Error('This public calendar link has expired');
      expiredError.status = 410;
      expiredError.code = 'LINK_EXPIRED';

      vi.spyOn(pubCalApi, 'getPublicCalendarFeed').mockRejectedValue(expiredError);

      await act(async () => {
        root.render(
          <MemoryRouter initialEntries={['/public/calendar/pcal_expired_token']}>
            <Routes>
              <Route path="/public/calendar/:token" element={<PublicCalendarPage />} />
            </Routes>
          </MemoryRouter>,
        );
      });

      expect(container.textContent).toContain('Calendar Link Expired');
      expect(container.textContent).toContain('configured expiration deadline');
    });
  });
});
