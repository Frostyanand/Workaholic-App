-- Up Migration
-- Workaholic Phase 11: Notifications & Reminders Foundation
-- Conforms to docs/7.DATABASE-DESIGN.md Sections 24, 25, 32 and docs/10.NOTIFICATION-SPECIFICATION.md

-- 1. reminders table (Workspace-scoped master reminder definitions)
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id UUID NULL REFERENCES tasks(id) ON DELETE CASCADE,
  event_id UUID NULL REFERENCES events(id) ON DELETE CASCADE,
  booking_id UUID NULL,
  trigger_type VARCHAR(50) NOT NULL,
  trigger_at TIMESTAMPTZ NULL,
  relative_offset INTERVAL NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_reminder_trigger_type CHECK (
    trigger_type IN ('ABSOLUTE_TIME', 'BEFORE_EVENT', 'BEFORE_DEADLINE', 'RECURRING_TIME', 'EXACT_TIME', 'RELATIVE_EVENT_START', 'RELATIVE_TASK_DUE', 'RECURRING')
  ),
  CONSTRAINT chk_reminder_priority CHECK (
    priority IN ('LOW', 'NORMAL', 'HIGH', 'CRITICAL', 'MEDIUM')
  ),
  CONSTRAINT chk_reminder_status CHECK (
    status IN ('PENDING', 'ACTIVE', 'TRIGGERED', 'CANCELLED', 'COMPLETED')
  ),
  CONSTRAINT chk_reminder_single_target CHECK (
    (task_id IS NULL AND event_id IS NULL AND booking_id IS NULL) OR
    (task_id IS NOT NULL AND event_id IS NULL AND booking_id IS NULL) OR
    (task_id IS NULL AND event_id IS NOT NULL AND booking_id IS NULL) OR
    (task_id IS NULL AND event_id IS NULL AND booking_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_reminders_workspace_id ON reminders (workspace_id);
CREATE INDEX IF NOT EXISTS idx_reminders_task_id ON reminders (task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reminders_event_id ON reminders (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reminders_created_by ON reminders (created_by);

-- 2. reminder_recipients table (User-scoped recipient scheduling & snooze/dismiss state)
CREATE TABLE IF NOT EXISTS reminder_recipients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reminder_id UUID NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  next_trigger_at TIMESTAMPTZ NOT NULL,
  dismissed_at TIMESTAMPTZ NULL,
  snoozed_until TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_recipient_status CHECK (
    recipient_status IN ('PENDING', 'SENT', 'DISMISSED', 'SNOOZED', 'FAILED', 'CANCELLED')
  ),
  CONSTRAINT uq_reminder_recipient UNIQUE (reminder_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_reminder_recipients_user_id ON reminder_recipients (user_id);
CREATE INDEX IF NOT EXISTS idx_reminder_recipients_reminder_id ON reminder_recipients (reminder_id);
CREATE INDEX IF NOT EXISTS idx_reminder_recipients_due ON reminder_recipients (next_trigger_at, recipient_status)
  WHERE recipient_status = 'PENDING' AND dismissed_at IS NULL;

-- 3. notifications table (Recipient-user-scoped Notification Center entries)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reminder_recipient_id UUID NULL REFERENCES reminder_recipients(id) ON DELETE SET NULL,
  notification_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  target_reference JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMPTZ NULL,
  dismissed_at TIMESTAMPTZ NULL,
  CONSTRAINT chk_notification_type CHECK (
    notification_type IN ('REMINDER', 'TASK_ASSIGNED', 'CALENDAR_EVENT', 'BOOKING', 'COLLABORATION', 'SYSTEM', 'SHARED_ALERT')
  )
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created ON notifications (recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (recipient_user_id)
  WHERE read_at IS NULL AND dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_reminder_recipient ON notifications (reminder_recipient_id)
  WHERE reminder_recipient_id IS NOT NULL;

-- 4. notification_deliveries table (Device/channel transport attempt records)
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  device_id UUID NULL REFERENCES devices(id) ON DELETE SET NULL,
  channel VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  attempt_count INT NOT NULL DEFAULT 1,
  attempted_at TIMESTAMPTZ NULL,
  delivered_at TIMESTAMPTZ NULL,
  failure_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_delivery_channel CHECK (
    channel IN ('IN_APP', 'PUSH', 'WINDOWS_DESKTOP', 'ANDROID_LOCAL')
  ),
  CONSTRAINT chk_delivery_status CHECK (
    status IN ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'RETRYING', 'CANCELLED')
  )
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification ON notification_deliveries (notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status ON notification_deliveries (status, attempted_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_delivery ON notification_deliveries (
  notification_id,
  COALESCE(device_id, '00000000-0000-0000-0000-000000000000'::uuid),
  channel
);

-- 5. trusted_relationships table (Authoritative user-to-user trusted sharing per docs/7.DATABASE-DESIGN.md Section 32)
CREATE TABLE IF NOT EXISTS trusted_relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trusted_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_no_self_trust CHECK (owner_user_id <> trusted_user_id),
  CONSTRAINT chk_trusted_rel_status CHECK (status IN ('PENDING', 'ACTIVE', 'REVOKED', 'BLOCKED')),
  CONSTRAINT uq_trusted_relationship UNIQUE (owner_user_id, trusted_user_id)
);

CREATE INDEX IF NOT EXISTS idx_trusted_relationships_owner ON trusted_relationships (owner_user_id, status);
CREATE INDEX IF NOT EXISTS idx_trusted_relationships_trusted ON trusted_relationships (trusted_user_id, status);

-- 6. trusted_relationship_permissions table (Granular capabilities including trusted.reminders.receive)
CREATE TABLE IF NOT EXISTS trusted_relationship_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  relationship_id UUID NOT NULL REFERENCES trusted_relationships(id) ON DELETE CASCADE,
  permission_id VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_trusted_rel_permission UNIQUE (relationship_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_trusted_rel_permissions ON trusted_relationship_permissions (relationship_id, permission_id);

-- Down Migration
DROP TABLE IF EXISTS trusted_relationship_permissions CASCADE;
DROP TABLE IF EXISTS trusted_relationships CASCADE;
DROP TABLE IF EXISTS notification_deliveries CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS reminder_recipients CASCADE;
DROP TABLE IF EXISTS reminders CASCADE;
