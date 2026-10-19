-- No row contents travel over WebSocket. Unknown relations keep topic-level invalidation.
CREATE OR REPLACE FUNCTION notify_erp_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE topic text; current_row jsonb; previous_row jsonb; student_id text; previous_id text;
BEGIN
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['updated_at','last_seen_at'])
    IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','last_seen_at']) THEN RETURN NULL; END IF;
  IF TG_OP <> 'DELETE' THEN current_row := to_jsonb(NEW); END IF;
  IF TG_OP <> 'INSERT' THEN previous_row := to_jsonb(OLD); END IF;
  student_id := CASE WHEN TG_TABLE_NAME='students' THEN COALESCE(current_row->>'id',previous_row->>'id')
    ELSE COALESCE(current_row->>'student_id',previous_row->>'student_id') END;
  previous_id := CASE WHEN TG_TABLE_NAME='students' THEN previous_row->>'id' ELSE previous_row->>'student_id' END;
  FOREACH topic IN ARRAY TG_ARGV LOOP
    -- Keep the current backend operational until it is restarted with the new listener.
    PERFORM pg_notify('erp_changes',topic);
    PERFORM pg_notify('erp_student_changes',jsonb_build_object('topic',topic,'studentKey',
      CASE WHEN student_id IS NOT NULL THEN encode(sha256(convert_to(student_id,'UTF8')),'hex') END)::text);
    IF previous_id IS NOT NULL AND previous_id IS DISTINCT FROM student_id THEN
      PERFORM pg_notify('erp_student_changes',jsonb_build_object('topic',topic,'studentKey',encode(sha256(convert_to(previous_id,'UTF8')),'hex'))::text);
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
