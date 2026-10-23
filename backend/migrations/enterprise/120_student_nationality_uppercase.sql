ALTER TABLE students ADD COLUMN IF NOT EXISTS nationality VARCHAR(100);
CREATE OR REPLACE FUNCTION normalize_student_identity_text() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.first_name:=UPPER(NEW.first_name);NEW.last_name:=UPPER(NEW.last_name);
  NEW.address:=UPPER(NEW.address);NEW.notes:=UPPER(NEW.notes);
  NEW.nationality:=NULLIF(UPPER(TRIM(NEW.nationality)),'');
 ELSE
  IF NEW.first_name IS DISTINCT FROM OLD.first_name THEN NEW.first_name:=UPPER(NEW.first_name);END IF;
  IF NEW.last_name IS DISTINCT FROM OLD.last_name THEN NEW.last_name:=UPPER(NEW.last_name);END IF;
  IF NEW.address IS DISTINCT FROM OLD.address THEN NEW.address:=UPPER(NEW.address);END IF;
  IF NEW.notes IS DISTINCT FROM OLD.notes THEN NEW.notes:=UPPER(NEW.notes);END IF;
  IF NEW.nationality IS DISTINCT FROM OLD.nationality THEN NEW.nationality:=NULLIF(UPPER(TRIM(NEW.nationality)),'');END IF;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS student_identity_uppercase ON students;
CREATE TRIGGER student_identity_uppercase BEFORE INSERT OR UPDATE ON students
FOR EACH ROW EXECUTE FUNCTION normalize_student_identity_text();
