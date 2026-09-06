-- Up Migration
-- Task 2.3 & 2.4: Core Relational Tables & Schema Invariants
-- Authoritative definitions matching DATABASE-DESIGN.md Sections 6, 7, 8

-- 1. users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  profile_image_reference TEXT NULL,
  timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
  locale VARCHAR(50) NOT NULL DEFAULT 'en',
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL
);

-- Case-insensitive unique active email
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_active ON users (LOWER(email)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users (deleted_at);

-- 2. workspaces table
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  workspace_type VARCHAR(50) NOT NULL DEFAULT 'PERSONAL',
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT chk_workspaces_workspace_type CHECK (workspace_type IN ('PERSONAL', 'TEAM'))
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner_user_id ON workspaces (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_deleted_at ON workspaces (deleted_at);

-- 3. workspace_memberships table
CREATE TABLE IF NOT EXISTS workspace_memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'MEMBER',
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  joined_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_workspace_memberships_workspace_user UNIQUE (workspace_id, user_id),
  CONSTRAINT chk_workspace_memberships_role CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')),
  CONSTRAINT chk_workspace_memberships_status CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED'))
);

CREATE INDEX IF NOT EXISTS idx_workspace_memberships_user_id ON workspace_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_memberships_workspace_status ON workspace_memberships (workspace_id, status);

-- 4. devices table
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  device_name VARCHAR(255) NOT NULL,
  application_version VARCHAR(50) NULL,
  push_token_reference TEXT NULL,
  trust_state VARCHAR(50) NOT NULL DEFAULT 'UNTRUSTED',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_devices_platform CHECK (platform IN ('WEB', 'WINDOWS', 'ANDROID')),
  CONSTRAINT chk_devices_trust_state CHECK (trust_state IN ('TRUSTED', 'UNTRUSTED', 'REVOKED'))
);

CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices (user_id);
CREATE INDEX IF NOT EXISTS idx_devices_trust_state ON devices (user_id, trust_state);

-- 5. sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID NULL REFERENCES devices(id) ON DELETE SET NULL,
  session_token_hash VARCHAR(255) NOT NULL,
  session_type VARCHAR(50) NOT NULL DEFAULT 'WEB',
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_sessions_token_hash UNIQUE (session_token_hash),
  CONSTRAINT chk_sessions_session_type CHECK (session_type IN ('WEB', 'DESKTOP', 'MOBILE', 'API'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_device_id ON sessions (device_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active_lookup ON sessions (session_token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

-- Down Migration
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS devices CASCADE;
DROP TABLE IF EXISTS workspace_memberships CASCADE;
DROP TABLE IF EXISTS workspaces CASCADE;
DROP TABLE IF EXISTS users CASCADE;
