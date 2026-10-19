-- Match bounded reads; existing student/payment foreign-key indexes remain in use.
CREATE INDEX IF NOT EXISTS idx_history_student_timestamp_id ON history(student_id,timestamp DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_payment_details_payment_created_id ON payment_details(payment_id,created_at DESC,id DESC);
