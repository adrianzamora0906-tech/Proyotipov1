ALTER TABLE transfer_payment_verifications
  ADD COLUMN IF NOT EXISTS enrollment_id UUID REFERENCES enrollments(id);

-- Solo vincular transferencias antiguas cuando la matricula sea inequivoca.
WITH unique_enrollment AS (
  SELECT student_id,(array_agg(id))[1] id FROM enrollments WHERE status='activo'
  GROUP BY student_id HAVING COUNT(*)=1
)
UPDATE transfer_payment_verifications tv SET enrollment_id=e.id
FROM unique_enrollment e WHERE tv.student_id=e.student_id
  AND tv.service_transaction_id IS NULL AND tv.enrollment_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_transfer_enrollment_pending ON transfer_payment_verifications(enrollment_id)
  WHERE status IN ('PENDING','AWAITING_APPROVAL');
