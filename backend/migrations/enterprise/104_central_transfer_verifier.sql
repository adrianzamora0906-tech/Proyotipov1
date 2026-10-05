DO $$
DECLARE
  gema_id UUID;
  target_permission_id UUID;
BEGIN
  SELECT id INTO gema_id
  FROM users
  WHERE username = 'spic2_gema.obregon' AND active = TRUE;

  IF gema_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró la cuenta activa spic2_gema.obregon';
  END IF;

  SELECT id INTO target_permission_id
  FROM permissions
  WHERE code = 'TRANSFER_VERIFY' AND active = TRUE;

  IF target_permission_id IS NULL THEN
    RAISE EXCEPTION 'No existe el permiso TRANSFER_VERIFY';
  END IF;

  DELETE FROM role_permissions
  WHERE permission_id = target_permission_id;

  UPDATE user_permissions
  SET revoked_at = NOW(), revoked_by = gema_id
  WHERE user_id <> gema_id
    AND permission_id = target_permission_id
    AND effect = 'ALLOW'
    AND revoked_at IS NULL;

  INSERT INTO user_permissions
    (user_id, permission_id, effect, branch_id, reason, granted_by)
  SELECT gema_id, target_permission_id, 'ALLOW', u.branch_id,
    'Responsable central única de confirmación de transferencias', gema_id
  FROM users u
  WHERE u.id = gema_id
    AND NOT EXISTS (
      SELECT 1 FROM user_permissions up
      WHERE up.user_id = gema_id
        AND up.permission_id = target_permission_id
        AND up.effect = 'ALLOW'
        AND up.revoked_at IS NULL
    );

  INSERT INTO settings
    (scope_type, branch_id, key, value, data_type, description, updated_by)
  VALUES
    ('GLOBAL', NULL, 'payments.central_transfer_verifier_user_id',
     TO_JSONB(gema_id::text), 'string',
     'Usuario único autorizado para confirmar o rechazar transferencias de todas las sucursales.', gema_id)
  ON CONFLICT (scope_type, (COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)), key)
  DO UPDATE SET value = EXCLUDED.value, data_type = EXCLUDED.data_type,
    description = EXCLUDED.description, updated_by = EXCLUDED.updated_by, updated_at = NOW();
END $$;
