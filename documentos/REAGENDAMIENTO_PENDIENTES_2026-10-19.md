# Reagendamiento de clases pendientes

- El modal muestra solo las proximas clases pendientes, en una cuadricula de fechas; no muestra fechas pasadas ni clases iniciadas o realizadas.
- El calendario del instructor destino conserva los horarios disponibles, ocupados y bloqueados.
- Se selecciona un cupo por dia y exactamente la cantidad de clases que faltan. El contador impide agregar clases adicionales y el guardado rechaza selecciones incompletas.
- Todas las clases pendientes se envian juntas, identificadas por su asignacion original. Se prioriza conservar la correspondencia de fechas al construir el traslado.
- El servidor vuelve a consultar las pendientes dentro de la transaccion y rechaza el cambio si la lista ya no coincide. Conserva las validaciones de disponibilidad, clases realizadas, permisos, auditoria y comentarios.
- Las clases que mantienen fecha, hora e instructor se conservan sin crear una nueva asignacion.
- No se modificaron pagos, cobros ni reglas de remuneracion del instructor. Su tratamiento queda para una etapa posterior.
- El calendario destino sigue limitado a las fechas del ciclo actual.

Validacion: sintaxis de frontend/backend; prueba de navegador con API simulada para seleccion incompleta, limite de cantidad y traslado de dos pendientes; prueba de servicio con base simulada para proteger cambios concurrentes e impedir trasladar clases realizadas. No se modificaron datos reales.

Activacion: reinicio manual del backend por el responsable y recarga del frontend. El agente no reinicio servicios.
