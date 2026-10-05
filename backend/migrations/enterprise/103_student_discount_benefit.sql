ALTER TABLE students
  ADD COLUMN IF NOT EXISTS discount_benefit VARCHAR(30);

ALTER TABLE students
  DROP CONSTRAINT IF EXISTS students_discount_benefit_check;

ALTER TABLE students
  ADD CONSTRAINT students_discount_benefit_check
  CHECK (discount_benefit IS NULL OR discount_benefit IN ('UNIVERSITY_STUDENT', 'POLICE'));

COMMENT ON COLUMN students.discount_benefit IS
  'Convenio aplicado al matricular: UNIVERSITY_STUDENT o POLICE.';
