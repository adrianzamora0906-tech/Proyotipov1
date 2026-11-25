-- Black Friday: curso de Auto $156 y Moto $100, solo 27 y 28 de noviembre de 2026.
-- La vigencia y los importes se validan en Backend. Conserva los convenios existentes.
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_discount_benefit_check;
ALTER TABLE students ADD CONSTRAINT students_discount_benefit_check
 CHECK (discount_benefit IS NULL OR discount_benefit IN ('UNIVERSITY_STUDENT','POLICE','COMBO','HALLOWEEN','SPONSORSHIP_PRIZE','BLACK_FRIDAY'));
