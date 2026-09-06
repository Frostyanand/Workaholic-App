-- Up Migration
-- Task 4.0: Auth & Identity Tables (Phase 4 Foundation)
-- Authoritative definitions matching DATABASE-DESIGN.md Sections 6.2, 28.1, 28.2, 62 & PRIVACY-SECURITY.md Section 48

-- 1. external_identities table
CREATE TABLE IF NOT EXISTS external_identities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  provider_subject VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_external_identities_provider_subject UNIQUE (provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS idx_external_identities_user_id ON external_identities (user_id);
CREATE INDEX IF NOT EXISTS idx_external_identities_provider_lookup ON external_identities (provider, provider_subject);

-- 2. security_events table (Append-oriented audit logging)
CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(100) NOT NULL,
  ip_address VARCHAR(100) NULL,
  user_agent TEXT NULL,
  device_id UUID NULL REFERENCES devices(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON security_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON security_events (event_type, created_at DESC);

-- 3. integrations table
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'DISCONNECTED',
  connected_at TIMESTAMPTZ NULL,
  disconnected_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_integrations_user_provider UNIQUE (user_id, provider),
  CONSTRAINT chk_integrations_status CHECK (status IN ('DISCONNECTED', 'AUTHORIZING', 'CONNECTED', 'ERROR', 'REAUTH_REQUIRED'))
);

CREATE INDEX IF NOT EXISTS idx_integrations_user_id ON integrations (user_id);

-- 4. external_accounts table
CREATE TABLE IF NOT EXISTS external_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  external_account_id VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NULL,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  encrypted_credentials JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_external_accounts_provider_account UNIQUE (provider, external_account_id)
);

CREATE INDEX IF NOT EXISTS idx_external_accounts_integration_id ON external_accounts (integration_id);

-- Down Migration
DROP TABLE IF EXISTS external_accounts CASCADE;
DROP TABLE IF EXISTS integrations CASCADE;
DROP TABLE IF EXISTS security_events CASCADE;
DROP TABLE IF EXISTS external_identities CASCADE;
