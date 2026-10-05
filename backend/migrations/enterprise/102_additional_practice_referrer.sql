ALTER TABLE additional_driving_practices
  ADD COLUMN IF NOT EXISTS referred_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_additional_practices_referrer
  ON additional_driving_practices(referred_by_user_id, created_at DESC)
  WHERE referred_by_user_id IS NOT NULL;

COMMENT ON COLUMN additional_driving_practices.referred_by_user_id IS
  'Personal que refirio esta contratacion especifica de horas practicas.';
