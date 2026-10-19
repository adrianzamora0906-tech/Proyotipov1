CREATE TABLE IF NOT EXISTS instructor_change_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id),
  previous_instructor_id uuid NOT NULL REFERENCES instructor_profiles(id),
  new_instructor_id uuid NOT NULL REFERENCES instructor_profiles(id),
  previous_instructor_user_id uuid NOT NULL REFERENCES users(id),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  administrative_reason text NOT NULL,
  changed_classes jsonb NOT NULL,
  student_response text CHECK (length(student_response) BETWEEN 10 AND 3000),
  student_responded_by uuid REFERENCES users(id),
  student_responded_at timestamptz,
  instructor_response text CHECK (length(instructor_response) BETWEEN 10 AND 3000),
  instructor_responded_by uuid REFERENCES users(id),
  instructor_responded_at timestamptz,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  CHECK(previous_instructor_id <> new_instructor_id)
);
CREATE INDEX IF NOT EXISTS idx_instructor_feedback_student_pending ON instructor_change_feedback(student_id,created_at) WHERE student_response IS NULL;
CREATE INDEX IF NOT EXISTS idx_instructor_feedback_teacher_pending ON instructor_change_feedback(previous_instructor_user_id,created_at) WHERE instructor_response IS NULL;
CREATE INDEX IF NOT EXISTS idx_instructor_feedback_branch_created ON instructor_change_feedback(branch_id,created_at DESC);
