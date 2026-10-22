ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS sales_branch_id UUID REFERENCES branches(id);
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS sales_branch_source TEXT;

CREATE OR REPLACE FUNCTION trigger_refresh_student_from_enrollment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-ARRAY['sales_branch_id','sales_branch_source'])
    IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['sales_branch_id','sales_branch_source']) THEN
   RETURN NULL;
  END IF;
 END IF;
 IF TG_OP <> 'DELETE' THEN PERFORM refresh_student_operational_status(NEW.student_id); END IF;
 IF TG_OP <> 'INSERT' AND (TG_OP='DELETE' OR OLD.student_id IS DISTINCT FROM NEW.student_id) THEN
  PERFORM refresh_student_operational_status(OLD.student_id);
 END IF;
 RETURN NULL;
END;
$$;

-- Legacy attribution is a snapshot, not a reconstruction of employee history.
WITH ranked AS (
 SELECT e.id,s.branch_id,ROW_NUMBER() OVER(PARTITION BY e.student_id ORDER BY e.created_at,e.id) ordinal
 FROM enrollments e JOIN students s ON s.id=e.student_id
)
UPDATE enrollments e SET sales_branch_id=CASE WHEN ranked.ordinal=1 THEN COALESCE(ranked.branch_id,e.branch_id) ELSE e.branch_id END,
 sales_branch_source=CASE WHEN ranked.ordinal=1 THEN 'legacy_profile_snapshot' ELSE 'legacy_enrollment_snapshot' END
FROM ranked WHERE ranked.id=e.id AND e.sales_branch_id IS NULL;

CREATE OR REPLACE FUNCTION capture_enrollment_sales_branch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.sales_branch_id IS NULL THEN
  NEW.sales_branch_id := NEW.branch_id;
  NEW.sales_branch_source := 'registration_branch';
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enrollment_capture_sales_branch ON enrollments;
CREATE TRIGGER enrollment_capture_sales_branch BEFORE INSERT ON enrollments
FOR EACH ROW EXECUTE FUNCTION capture_enrollment_sales_branch();
CREATE INDEX IF NOT EXISTS enrollments_sales_branch_date_idx ON enrollments(sales_branch_id,enrollment_date);
