ALTER TABLE students
  ADD COLUMN IF NOT EXISTS disability_percentage SMALLINT;

ALTER TABLE students
  DROP CONSTRAINT IF EXISTS students_disability_percentage_check;

ALTER TABLE students
  ADD CONSTRAINT students_disability_percentage_check
  CHECK (disability_percentage IS NULL OR disability_percentage BETWEEN 1 AND 100);

COMMENT ON COLUMN students.disability_percentage IS
  'Porcentaje de discapacidad respaldado por certificado para matriculas Tipo F.';
