# Cambios visuales y logicos: registro y horarios

## Ajuste visual del cambio de practicas: origen y destino

19/10/2026: el modal muestra primero una tabla de horario e instructor actuales. Las clases pendientes pueden seleccionarse como origen; iniciadas, realizadas o de fechas anteriores no se ofrecen como origen. Debajo aparece el selector del instructor destino y su calendario con todas las franjas devueltas por el servidor, incluso filas completamente ocupadas. Los estados Ocupado / bloqueado y No configurado permanecen visibles y no seleccionables. Se conserva la observacion al consultar otro instructor. No se habilitan bloqueos de disponibilidad ni se cambian las validaciones del guardado. Prueba scripts/test-pending-class-edit.cjs ampliada para secciones, cupos ocupados, seleccion de origen y preservacion de observacion. Cache v74-pending-class-two-sections; requiere recargar frontend.

## Implementacion aprobada: comentarios del cambio de instructor

19/10/2026: se implementa el seguimiento bilateral antes pendiente. La migracion 115_instructor_change_feedback.sql crea el registro privado y fue aplicada de forma dirigida en la base local; no modifica estudiantes, matriculas ni pagos existentes. No se reinicio el backend.

Cada nuevo cambio de instructor crea, dentro de la misma transaccion de reasignacion, un seguimiento por estudiante/matricula/instructor anterior/nuevo. Varias clases del mismo cambio se agrupan; un cambio solo de horario no genera encuesta. Se integra tanto en cambio de practicas pendientes como en la edicion completa de expediente. No se generan solicitudes retroactivas.

El estudiante recibe el modal Cambio de instructor y el instructor anterior Seguimiento de cambio de instructor. Ambos incluyen comentario de 10 a 3000 caracteres, Responder despues y Enviar comentario. Se mantiene recordatorio accesible si se pospone; el aviso automatico se aplaza una hora en esa sesion y se reevalua al volver al perfil/pestana o reconectar. Ninguna respuesta condiciona asistencia o clases. Si falla el envio, se conserva el texto para reintentar. Una respuesta enviada no puede reemplazarse.

Privacidad: cada participante solo consulta su solicitud pendiente y envia su propia respuesta. El endpoint no devuelve comentarios de ninguna parte a participantes. Solo ADMIN_SYSTEM, BRANCH_ADMIN (su sucursal operativa) y GENERAL_MANAGER con permiso de lectura acceden al seguimiento administrativo. El nuevo instructor no recibe estas opiniones. Los textos no se copian a notificaciones publicas, WebSocket ni auditoria general; la auditoria registra autor, accion y referencia.

Administracion consulta las versiones y fechas en Perfil del estudiante, pestana Historial. Si ambas respondieron, quien ademas tenga STUDENT_UPDATE puede marcar Revisado. Se conservan estados pendiente, respondido y revisado mediante las marcas de tiempo y autor. La consulta administrativa se carga al abrir Historial; requiere recargar esa seccion para ver nuevas respuestas.

WebSocket: canal PostgreSQL erp_instructor_feedback, con entrega tras COMMIT solo a estudiante e instructor anterior. El frontend consulta pendientes al iniciar perfil, volver a pestana y reconectar; no agrega recargas globales. Usa la conexion WebSocket existente. El aviso contiene solo el tipo de evento, no nombres ni comentarios.

Pruebas: backend/tests/instructor-change-feedback.test.cjs (autoria, respuesta unica, privacidad de auditoria y agrupacion), backend/tests/pending-class-instructor-change.test.cjs, scripts/test-instructor-feedback-modal.cjs (ambos textos, aplazar, error/reintento y 390/1280 px), scripts/test-payment-void-realtime.cjs y scripts/test-pending-class-edit.cjs. Son escenarios simulados; no se solicitaron comentarios a estudiantes reales durante las pruebas. Activacion: reinicio manual del backend y recarga de frontend; cache v73-instructor-change-feedback.

## Ampliacion: edicion de clases pendientes y tiempos del servidor

19/10/2026: desde Editar en el perfil se puede elegir Datos del estudiante o Horario e instructor de clases pendientes. La edicion completa tambien incorpora un acceso a esta operacion cuando el usuario tiene SCHEDULE_CHANGE. Reutiliza el calendario de cambio de practicas, con seleccion de otro instructor habilitado para el curso y canton; permite conservar la hora cambiando solo el instructor. Las fechas destino permanecen dentro del ciclo vigente. No habilita traslado a otro ciclo ni recuperacion de clases de fechas pasadas.

El guardado conserva la observacion administrativa obligatoria, valida nuevamente instructor, cupos, cruces con clases/practicas adicionales/teoria y bloquea clases iniciadas o realizadas. Conserva las sesiones historicas mediante la reconciliacion existente, que solo actualiza sesiones PROGRAMADA/PROXIMA. Cada asignacion cambiada tiene auditoria con instructor anterior/nuevo, fecha y hora. Se avisa a ambos instructores mediante las notificaciones existentes. No se escriben pagos ni se reinicia el curso. Si todas las clases pendientes quedan con un instructor, se actualiza la asignacion resumen de la matricula, conservando los registros anteriores como inactivos.

Rendimiento: snapshot de edicion deja de transportar PDF/base64; utiliza presencia y huella MD5 del contenido para la revision optimista, ademas de los metadatos. El guardado consulta el archivo real por separado cuando necesita confirmar bachiller. La disponibilidad y teoria se reutilizan por instructor dentro de cada peticion de opciones, sin cache persistente ni sustituir la validacion final. Las respuestas incluyen Server-Timing para edit_context, edit_options y schedule_options.

Medicion local posterior, no comparativa de produccion: una muestra con 5.483.144 caracteres almacenados de documentos dio contexto 82,9 ms, respuesta 18.882 bytes y opciones 235,2 ms para 12 ciclos. El tiempo no es garantia para otros equipos, red o concurrencia. Script local: `.tmp/measure-edit-queries.cjs`.

Validacion: backend/tests/student-edit-loading.test.cjs, backend/tests/pending-class-instructor-change.test.cjs y scripts/test-pending-class-edit.cjs. Pruebas de escritura y navegador con dependencias simuladas; no se reasignaron estudiantes reales durante la validacion. El seguimiento bilateral de motivos se registra por separado en TAREAS_PENDIENTES.md y no se implementa aqui. Activacion: reinicio manual del backend y recarga; cache v72-pending-class-instructor.

## Ampliacion: horas practicas en cursos del instructor

19/10/2026: el Dashboard del instructor incorpora las practicas adicionales en su listado `scheduleCourses`, que antes se construia solo con ciclos normales, examenes y ocupaciones. Aparecen separadas como Horas practicas, con estudiante, cedula, telefono, fechas, hora de inicio/fin y dias contratados; no se presentan como matricula regular ni se presume tipo de vehiculo. Se consultan exclusivamente para el instructor autenticado, en estado SCHEDULED/IN_PROGRESS, con fecha de fin actual o futura y estudiante no inhabilitado. No se crean matriculas ni se modifica la asistencia, los pagos o los horarios existentes. Prueba de regresion: `node --test backend/tests/instructor-practice-courses.test.cjs`, incluyendo instructor sin ciclos normales. Sintaxis validada y consulta SQL ejecutada sobre la base local; la muestra consultada no tenia practicas actuales/futuras visibles, por lo que la inclusion efectiva se comprobo con datos simulados. Requiere reinicio manual del backend y recarga del frontend. Cache: `sportmancar-offline-v68-instructor-practice-courses`.

Fecha: 19 de octubre de 2026.
Sistema: SportmancarERP.
Contexto: `DOCUMENTO_GENERAL_ESTADO_ACTUAL_SISTEMA.md`.

## 1. Alcance

Este documento describe los cambios recientes del registro de horas practicas adicionales y de la adaptacion visual de horarios y modales. No incluye las modificaciones anteriores de pagos, matriculas, concurrencia o movimientos de estudiantes.

Los cambios son del frontend. No requieren migraciones de base de datos ni reinicio del backend. No cambian permisos, precios, cobros o asignaciones existentes.

## 2. Fecha de nacimiento en horas practicas

### Cambio visual

- En Nuevo estudiante, modalidad Horas practicas, se oculta la fecha de nacimiento.
- Al regresar a Curso de conduccion se vuelve a mostrar el campo, conservando su valor si ya habia sido ingresado.

### Cambio logico

- En el formulario legacy se deshabilita el campo para que no participe en FormData ni bloquee por obligatoriedad.
- La validacion de fecha de nacimiento no se exige para practicas adicionales.
- En los componentes React tambien se oculta el campo para el modo `practice` y se conserva la validacion de nacimiento/edad para el modo `regular`.
- No se borran fechas de nacimiento almacenadas de estudiantes existentes.

Archivos:

- `frontend/src/js/views/students/StudentsView.js`
- `frontend-react/src/features/students/components/StudentPersonalDataForm.tsx`
- `frontend-react/src/features/students/schemas.ts`

## 3. Licencia opcional en horas practicas

### Cambio visual

- El apartado indica Documento (opcional), sin marca de campo requerido.
- La ayuda permite continuar sin documento y conserva la opcion de adjuntar PDF o imagen.

### Cambio logico

- El envio del registro no se bloquea cuando no hay archivo ni captura movil.
- Si no hay documento, se omite la subida y se continua con el registro de practicas.
- Si se proporciona un archivo, se mantiene la validacion de PDF o imagen.
- Una captura movil no vacia con formato no admitido tampoco permite continuar como si no se hubiera adjuntado nada.
- Se conserva la conversion de imagen a PDF y la subida del documento cuando corresponde.
- No se alteran las comprobaciones de instructor, fecha, horario, cantidad de dias o disponibilidad.

Detalle de alcance: el flujo actual utiliza un unico adjunto para licencia o cedula/licencia. Al volverlo opcional, una persona externa tambien puede continuar sin ese adjunto combinado. La identificacion digitada y su busqueda siguen siendo parte del registro; no se exige un archivo separado de cedula en este flujo.

Archivo: `frontend/src/js/views/students/StudentsView.js`.

## 4. Adaptacion de horarios y modales

### Problema observado

En pantallas intermedias, el menu lateral reducia el espacio util, pero las acciones del encabezado continuaban en una sola fila. Algunos botones quedaban fuera del area visible. Los controles de los calendarios presentaban restricciones similares.

### Cambios visuales

- Los encabezados de pagina y de modal permiten reorganizar su contenido en varias filas.
- Las acciones de Horarios de instructores se ajustan al ancho disponible, incluso con el menu lateral abierto.
- Los botones del encabezado de horarios permiten que su texto ocupe varias lineas.
- La cuadricula de instructores admite contenedores menores a 260 px sin imponer ese ancho minimo.
- Los nombres largos de instructores pueden partirse y los avatares conservan su tamano.
- Los controles de navegacion de cursos y calendarios permiten salto de linea.
- El modal de horario limita su alto al espacio visible y desplaza su cuerpo cuando hace falta, manteniendo encabezado y pie sin encogerse.
- Las tablas de calendario conservan desplazamiento horizontal cuando sus columnas no caben; no se comprimen las horas para forzar su ajuste.

### Alcance compartido

Los cambios en `.page-header`, `.modal-header`, `.modal-close` y `.modal-footer` son compartidos por otras pantallas que utilizan esas clases. Los ajustes de tarjetas, acciones y calendario estan acotados a los selectores de horarios.

Esto no equivale a una revision visual completa de todos los modulos ni de todos los modales del sistema.

Archivo principal: `frontend/src/assets/css/base/responsive.css`.

## 5. Actualizacion de recursos en cache

- `frontend/src/js/app.js`: version del import de StudentsView `practicas-licencia-opcional-20261019`.
- `frontend/index.html`: version del CSS responsive `horarios-modales-responsive-20261019`.
- `frontend/sw.js`: cache `sportmancar-offline-v63-responsive-schedules`.

Estas versiones permiten renovar los recursos del frontend. No agregan cache de consultas, datos financieros ni disponibilidad de cupos. Es necesario recargar la aplicacion y permitir que el service worker actualizado se active; la publicacion en otro entorno no fue verificada.

## 6. Validaciones realizadas

| Validacion | Resultado y alcance |
| --- | --- |
| `node --check frontend/src/js/views/students/StudentsView.js` | Sintaxis correcta tras el ajuste de documento opcional. |
| `npm.cmd run typecheck` en `frontend-react` | Correcto durante el cambio de fecha de nacimiento. |
| `node scripts/test-practice-no-birthdate.cjs` | Verifica ocultar/deshabilitar nacimiento en practicas, restaurarlo en curso normal, continuar hasta comprobar disponibilidad sin documento y bloquear un archivo de texto no admitido. |
| `node scripts/test-schedule-responsive.cjs` | Correcto en anchos de 360, 390, 768, 955, 1280 y 1920 px. Comprueba controles y tarjetas dentro del ancho visible y encabezado del calendario sin desbordamiento. |
| Capturas Playwright | Generadas para pagina y calendario en los seis anchos; inspeccion visual de la pagina a 955 px y del calendario a 390 px. |
| `git diff --check` | Sin errores de espacios; Git informa advertencias de conversion LF/CRLF. |

Las pruebas de navegador utilizan archivos locales, datos sinteticos y servicios simulados. No crean estudiantes, no suben documentos reales y no confirman pagos ni cupos en produccion. La prueba de documento opcional se detiene en la comprobacion simulada de disponibilidad: no es una prueba de guardado completo contra el backend.

Las capturas de apoyo estan en `.tmp/schedule-responsive-*.png` y `.tmp/calendar-responsive-*.png`. Son archivos locales de verificacion, no documentos institucionales ni archivos para incluir en un commit.

## 7. Estado y seguimiento

- Implementacion local realizada y validaciones indicadas completadas.
- Backend sin reiniciar.
- No se realizo commit ni push por esta solicitud de documentacion.
- Pendiente: comprobar en uso real los demas modulos que comparten los encabezados, dispositivos fisicos y el guardado completo de practicas sin documento.

## 8. Bandeja de anulaciones por WebSocket

Correccion posterior: la sesion legacy identifica al usuario con `userId`, no `id`. La bandeja ahora admite ambos formatos y su prueba utiliza el formato real de sesion. Mientras no se complete la primera consulta se muestra Cargando, no cero pendientes. Se verifico ademas que la configuracion apuntaba a la cuenta antigua `admin`; se cambio transaccionalmente, con auditoria, a `sp_dayanna.moreira` (Dayanna Liseth Moreira, cuenta activa de la captura). La consulta autorizada de esta cuenta devuelve las dos solicitudes pendientes, sin aprobar ni rechazar ninguna. Cache: `sportmancar-offline-v67-payment-void-session`.

Ampliacion en Gestion de pagos: se agrega la pestana Anulaciones pendientes junto a Pendientes y Realizados. Presenta contador, estudiante, sucursal, importe/metodo, solicitante, fecha/hora de Ecuador, motivo y acceso a revision en la bandeja compartida. Respeta busqueda, sucursal y rango de fechas del formulario existente. Utiliza el estado de la bandeja y su evento local, sin una consulta adicional por cada actualizacion de la tabla. La lectura y decision siguen controladas por el servidor: otros usuarios no obtienen las solicitudes de Dayana. Cache actualizado a `sportmancar-offline-v66-payment-void-tab`.

Implementacion adicional del 19 de octubre de 2026:

- La barra superior incorpora un icono de comprobante con contador cuando hay solicitudes pendientes o respuestas por leer. Permite abrir la bandeja desde las pantallas con SidebarLayout, no solamente desde Dashboard.
- La bandeja muestra todas las solicitudes devueltas por el servidor, con estudiante, importe, metodo, sucursal, solicitante y motivo. Permite aprobar o rechazar; el rechazo requiere observacion en la interfaz.
- Solo la responsable central configurada (actualmente Dayana) obtiene pendientes y puede decidir. Se conserva la prohibicion de decidir la solicitud propia.
- El solicitante puede consultar y aceptar la respuesta. No se le habilita aprobar anulaciones.
- Se elimina la carga del antiguo aviso de una sola solicitud en Dashboard para evitar duplicar la bandeja.
- Al crear una solicitud se emite `pg_notify` en la misma sentencia SQL; al decidir, se emite dentro de la transaccion, de modo que solo se entrega tras confirmar el cambio.
- RealtimeService escucha `erp_payment_void` y envia `payment-void-changed` exclusivamente a conexiones autenticadas de la responsable y del solicitante. El mensaje WebSocket no contiene datos personales ni importes.
- El frontend consulta los detalles mediante los endpoints autenticados existentes. Recupera pendientes al montar la barra, reconectar WebSocket, recuperar red o volver a una pestana visible. No usa recarga completa ni sondeo periodico.
- Los errores de consulta se indican en el icono y en la bandeja con opcion de reintento.
- No se modificaron las decisiones de las solicitudes reales pendientes ni se agregaron migraciones.

Archivos principales: `backend/services/PaymentService.js`, `backend/services/RealtimeService.js`, `frontend/src/js/core/realtime/RealtimeClient.js`, `frontend/src/js/services/PaymentVoidInbox.js`, `frontend/src/js/layouts/SidebarLayout.js` y `frontend/src/js/views/dashboard/DashboardView.js`.

Validacion: `scripts/test-payment-void-realtime.cjs` verifica destinatarios y ausencia de datos financieros en el aviso; `scripts/test-payment-void-inbox.cjs` verifica contador, bandeja, motivo de rechazo, evento en vivo y resincronizacion con servicios simulados. Sintaxis correcta de los archivos modificados. La sentencia SQL se comprobo con un identificador inexistente, sin crear solicitudes.

Activacion: esta ampliacion SI requiere reinicio manual del backend y recarga del frontend. El cache pasa a `sportmancar-offline-v65-payment-void-inbox`. No se reinicio el servidor ni se verifico una entrega entre dispositivos reales con el backend reiniciado.

## 8. Migracion a frontend-react (19/10/2026)

Los cambios de practicas adicionales tambien tienen una implementacion nativa en React. No se activa el modulo completo en el menu; se conserva la decision de activar al terminar la migracion.

### Flujo conectado

- `StudentsPage.tsx` incorpora Registrar horas practicas y abre `StudentRegistrationWizard.tsx`.
- Cuatro pasos: sucursal/instructor/programacion, busqueda y datos personales, documento opcional, revision y confirmacion.
- Se consulta la cedula antes de registrar y se reutiliza el estudiante existente, sin modificar su nacimiento. Para una persona nueva de practicas se omite `birthDate` en el envio.
- `StudentPersonalDataForm.tsx` oculta nacimiento en practice y conserva el valor al alternar modos sin desmontar el formulario. La validacion de edad sigue aplicada a regular.
- `PracticeDocumentUpload.tsx` permite continuar sin documento, adjuntar PDF/JPG/PNG o recibir una captura mediante enlace al flujo movil existente. La captura se comprueba al recibirla, se confirma con Usar captura y no se almacena en la cache de consultas. Esta entrega usa enlace movil; no incorpora un generador QR nativo.
- `preparePracticeDocument` valida formato, contenido PDF y limite de 9 MB, convierte imagen a PDF y rechaza capturas no vacias invalidas.
- `InstructorSelector.tsx` ya es un componente funcional con seleccion, filtrado por sucursal/curso compatible, prioridad y mensaje de error con Reintentar.
- `ScheduleCalendar.tsx` ya implementa programacion de practicas de 3 a 8 dias, turnos de 100 minutos y desplazamiento horizontal. Muestra conflictos y permite aceptar instructor alternativo o cambiar la fecha. No representa el calendario de ciclos de cursos regulares.
- Disponibilidad e identidad se consultan nuevamente al confirmar. El backend conserva su comprobacion definitiva. El cliente no interpreta una comprobacion previa como reserva de cupo.
- Se mantienen los precios del backend: 17 por dia para exestudiante, 20 para externo y paquete de 8 dias por 136. En este flujo nativo el pago queda pendiente para Caja; no se marca PAID desde el registro ni se sustituye el modulo financiero.
- Si la persona fue creada y la asignacion falla con rechazo confirmado, el formulario se cierra y muestra: El estudiante se registro, pero no se le asigno un instructor. Las respuestas perdidas se muestran como resultado no confirmado, sin afirmar que no se guardo. Incluye Abrir expediente. No se reenvia automaticamente una escritura.
- Las credenciales temporales se muestran solo en el resultado y se descartan al cerrar o cambiar de sesion/permisos. No se almacenan en React Query.

### Presentacion y arquitectura

- `RegistrationDialog.tsx` conserva encabezado y pie visibles y desplaza el cuerpo. Las tarjetas ajustan su ancho y los nombres largos se parten.
- `frontend-react/src/styles.css` importa la capa responsive compartida, que antes no estaba incluida en React. Las reglas propias del flujo estan en `features/students/students.css`.
- Tipos en `registrationTypes.ts`, reglas en `practiceRules.ts`, consultas en `practiceRegistration.service.ts` y secuencia de guardado/recuperacion en `submitPracticeRegistration.ts`.
- No se modificaron backend, base de datos ni dependencias por esta migracion.

### Validacion de React

- `node scripts/test-react-practice-registration.cjs`: 13 escenarios con API simulada, incluidos ausencia de documento/nacimiento, persona existente, captura, imagen a PDF, formatos invalidos, precios, permisos y revocacion, disponibilidad fresca, doble envio, guardados parciales y seis anchos.
- `node scripts/test-react-registration-components.cjs`: conserva validaciones por modalidad y comprueba retorno de practice a regular sin perder nacimiento.
- Pruebas de listado y expediente React, TypeScript y build correctos. Sigue la advertencia anterior del watermark no resuelto en build.
- Fixture aislada: `frontend-react/tests/fixtures/practice-registration.html`; solo se usa para comprobaciones y no se registra como ruta de produccion.
- Capturas locales: `.tmp/react-practice-registration-390.png` y `.tmp/react-practice-registration-1920.png`; inspeccion visual del modal a 390 px.

Permanece pendiente el flujo React completo de matricula regular, con ciclos, teoria, cupos WebSocket y sus demas reglas. Tambien permanece pendiente el guardado integral contra el backend real; las pruebas no crearon estudiantes ni pagos reales.
