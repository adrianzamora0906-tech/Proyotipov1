CREATE TABLE IF NOT EXISTS student_suspensions (
  student_id UUID PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL,
  disabled_by UUID REFERENCES users(id),
  disabled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION preserve_disabled_student_status() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM student_suspensions WHERE student_id=NEW.id) THEN
    NEW.status := 'inhabilitado';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS preserve_disabled_student_status ON students;
CREATE TRIGGER preserve_disabled_student_status BEFORE UPDATE OF status ON students
FOR EACH ROW EXECUTE FUNCTION preserve_disabled_student_status();
