CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS aura_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL,
  login VARCHAR(80) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('operador', 'admin', 'master')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aura_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES aura_users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aura_catalog_reasons (
  id TEXT PRIMARY KEY,
  product VARCHAR(30) NOT NULL,
  reason_group VARCHAR(160) NOT NULL,
  motivo VARCHAR(220) NOT NULL,
  name VARCHAR(220) NOT NULL,
  justification TEXT NOT NULL DEFAULT '',
  pid_level VARCHAR(10) NOT NULL CHECK (pid_level IN ('LIGHT', 'SOFT', 'HARD')),
  nuvidio BOOLEAN NOT NULL DEFAULT FALSE,
  article TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aura_attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol VARCHAR(80) NOT NULL UNIQUE,
  operator_id UUID NOT NULL REFERENCES aura_users(id),
  product VARCHAR(30) NOT NULL,
  reason_id TEXT,
  customer_name VARCHAR(180),
  customer_cpf VARCHAR(11),
  customer_phone VARCHAR(11),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aura_operational_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'informativo'
    CHECK (severity IN ('informativo', 'atencao', 'critico')),
  image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NOT NULL REFERENCES aura_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aura_alert_acknowledgements (
  alert_id UUID NOT NULL REFERENCES aura_operational_alerts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES aura_users(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (alert_id, user_id)
);

CREATE TABLE IF NOT EXISTS aura_audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES aura_users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80),
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aura_sessions_expiry ON aura_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_aura_attendances_created ON aura_attendances(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aura_attendances_operator ON aura_attendances(operator_id);
CREATE INDEX IF NOT EXISTS idx_aura_alerts_active ON aura_operational_alerts(active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aura_audit_created ON aura_audit_log(created_at DESC);
