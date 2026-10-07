DO $$
DECLARE approver_id UUID;
BEGIN
  SELECT id INTO approver_id FROM users WHERE username='admin' AND active=TRUE;
  IF approver_id IS NULL THEN
    RAISE EXCEPTION 'No existe la cuenta activa admin de Dayana';
  END IF;
  INSERT INTO settings(scope_type,branch_id,key,value,data_type,description,updated_by)
  VALUES('GLOBAL',NULL,'payments.central_void_approver_user_id',TO_JSONB(approver_id::text),
    'string','Responsable central de anulaciones de pagos de todas las sucursales',approver_id)
  ON CONFLICT (scope_type,(COALESCE(branch_id,'00000000-0000-0000-0000-000000000000'::uuid)),key)
  DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=NOW();
END $$;
