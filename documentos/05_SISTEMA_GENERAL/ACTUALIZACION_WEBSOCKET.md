# Actualizacion automatica por WebSocket

Implementacion del 12 de octubre de 2026.

## Funcionamiento

- PostgreSQL notifica cambios confirmados mediante LISTEN/NOTIFY. Una transaccion revertida no genera actualizaciones.
- El backend mantiene una conexion dedicada a estos avisos y agrupa eventos durante 150 ms.
- Cada navegador autenticado conecta a `/api/realtime`, usando el mismo puerto del backend y el mismo tunel. En HTTPS se utiliza WSS.
- Los avisos contienen solo categorias, nunca expedientes, cedulas, pagos o identificadores de sucursal. Las consultas posteriores mantienen los permisos HTTP existentes.
- Estudiantes, pagos, horarios, documentos, notificaciones y pantallas administrativas actualizan sus datos cuando reciben cambios relevantes.
- Se retiraron las consultas periodicas de estudiantes, pagos pendientes, notificaciones del instructor, monitores y capturas de documentos/QR. Los relojes y contadores locales siguen funcionando.
- La reconexion es automatica; al recuperar la conexion se consultan los datos actuales.
- Los formularios con cambios sin guardar y los modales abiertos posponen la actualizacion de la pantalla. Las capturas de documentos y QR tienen sus propias suscripciones.

## Activacion

1. Instalar dependencias del backend con `npm install` en `backend`.
2. Aplicar la migracion `backend/migrations/enterprise/108_realtime_notifications.sql` mediante el ejecutor institucional de migraciones. Ya fue aplicada en la base local.
3. Reiniciar el backend con `npm run start` y mantener `tailscale funnel 5000`.
4. Publicar el frontend actualizado en Netlify. Los navegadores deben cargar esa version para utilizar WebSocket.
5. Comprobar que `/api/health` indique `realtime: true` y que el navegador establezca la conexion WSS.

## Validacion y limites

- `node scripts/test-realtime.cjs`: autenticacion, dos conexiones, COMMIT/ROLLBACK, cambios sin efecto, reconexion, origen y revocacion.
- `node scripts/test-realtime-browser.cjs`: dos sesiones aisladas, agrupacion de avisos, proteccion de modales/formularios y reconexion. El navegador de prueba desactiva la comprobacion de red local para su pagina sintetica; no cambia la configuracion de produccion.
- Estas pruebas usan autenticacion simulada en un servidor aislado y no constituyen una prueba de carga ni una validacion de todas las pantallas.
- Tambien se verificaron el backend activo en el puerto 5000, `realtime: true` y la autenticacion JWT real por WebSocket local y WSS en `sport-adrian.tailf77b78.ts.net`. No se publico Netlify en esta tarea.
- WebSocket no reemplaza las consultas HTTP ni garantiza capacidad ilimitada. Se deben medir carga de PostgreSQL, consultas, memoria y conexiones al incorporar sucursales.
- Los avisos son generales por categoria, no filtrados por sucursal. No contienen datos personales; la API controla el acceso a los datos.
- Los archivos nuevos de `backend` estan ignorados por Git: al preparar un commit deben incluirse explicitamente el servicio, la migracion, `server.js`, `package.json` y `package-lock.json`.
