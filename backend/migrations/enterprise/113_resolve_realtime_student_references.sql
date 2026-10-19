-- Resolve indexed foreign keys for financial rows that do not carry student_id.
CREATE OR REPLACE FUNCTION realtime_student_reference(table_name text, row_data jsonb) RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE result text;
BEGIN
  IF row_data IS NULL THEN RETURN NULL; END IF;
  IF table_name='students' THEN RETURN row_data->>'id'; END IF;
  IF row_data->>'student_id' IS NOT NULL THEN RETURN row_data->>'student_id'; END IF;
  IF row_data->>'enrollment_id' IS NOT NULL THEN
    SELECT student_id::text INTO result FROM enrollments WHERE id=(row_data->>'enrollment_id')::uuid;
  ELSIF row_data->>'payment_id' IS NOT NULL THEN
    SELECT e.student_id::text INTO result FROM payments p JOIN enrollments e ON e.id=p.enrollment_id WHERE p.id=(row_data->>'payment_id')::uuid;
  ELSIF row_data->>'payment_detail_id' IS NOT NULL THEN
    SELECT e.student_id::text INTO result FROM payment_details d JOIN payments p ON p.id=d.payment_id JOIN enrollments e ON e.id=p.enrollment_id WHERE d.id=(row_data->>'payment_detail_id')::uuid;
  ELSIF table_name='service_receipts' THEN
    SELECT student_id::text INTO result FROM service_transactions WHERE id=(row_data->>'transaction_id')::uuid;
  END IF;
  RETURN result;
END;
$$;
-- No row contents travel over WebSocket. Unknown relations keep topic-level invalidation.
CREATE OR REPLACE FUNCTION notify_erp_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE topic text; current_row jsonb; previous_row jsonb; student_id text; previous_id text;
BEGIN
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['updated_at','last_seen_at'])
    IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','last_seen_at']) THEN RETURN NULL; END IF;
  IF TG_OP <> 'DELETE' THEN current_row := to_jsonb(NEW); END IF;
  IF TG_OP <> 'INSERT' THEN previous_row := to_jsonb(OLD); END IF;
  student_id := realtime_student_reference(TG_TABLE_NAME,COALESCE(current_row,previous_row));
  IF current_row IS NOT NULL AND previous_row IS NOT NULL AND
    (current_row->>'student_id',current_row->>'enrollment_id',current_row->>'payment_id',current_row->>'payment_detail_id',current_row->>'transaction_id')
    IS NOT DISTINCT FROM
    (previous_row->>'student_id',previous_row->>'enrollment_id',previous_row->>'payment_id',previous_row->>'payment_detail_id',previous_row->>'transaction_id') THEN
    previous_id := student_id;
  ELSE previous_id := realtime_student_reference(TG_TABLE_NAME,previous_row); END IF;
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
