-- Lectura de horarios para Caja; la escritura conserva permisos independientes.
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.code='CASHIER' AND r.active=TRUE AND p.code='SCHEDULE_VIEW' AND p.active=TRUE
ON CONFLICT DO NOTHING;
