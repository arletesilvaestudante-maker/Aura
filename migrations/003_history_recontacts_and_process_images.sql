CREATE TABLE IF NOT EXISTS aura_app_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES aura_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aura_attendances_cpf_created
  ON aura_attendances(customer_cpf, created_at DESC);
