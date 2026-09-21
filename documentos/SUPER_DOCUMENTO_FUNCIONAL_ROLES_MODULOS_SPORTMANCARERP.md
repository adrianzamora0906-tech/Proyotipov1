# SportmancarERP - Super documento funcional por roles y modulos

> Estado funcional actualizado: 14 de septiembre de 2026.

## 1. Proposito general del sistema

SportmancarERP es un ERP para una escuela de conduccion con varias sucursales. El sistema centraliza la operacion diaria de estudiantes, cursos, ciclos, horarios, instructores, pagos, documentacion, reportes, auditoria, autorizaciones ATM y configuracion administrativa.

La idea principal es que una sola informacion registrada al inicio pueda reutilizarse en todo el proceso:

- Secretaria registra o actualiza al estudiante.
- El sistema lo vincula a una sucursal, curso, ciclo, horario e instructor.
- Caja consulta saldos y registra cobros.
- Documentacion controla los documentos faltantes o entregados.
- Instructores ven agenda, estudiantes y clases.
- Administradores configuran sucursales, cursos, permisos y usuarios.
- Gerencia consulta indicadores consolidados, reportes y auditoria.

El sistema no debe mostrar lo mismo a todos. Cada rol debe ver solo lo que necesita para trabajar.

## 2. Archivos principales que unen el sistema

Estos son los archivos que conectan las pantallas, rutas, permisos, menus y API.

| Area | Archivo principal | Funcion |
| --- | --- | --- |
| Entrada del frontend | `frontend/src/js/app.js` | Registra las rutas principales de la aplicacion, aplica guards de autenticacion, revisa permisos y decide a que pantalla entra cada rol. |
| Menu por rol | `frontend/src/js/layouts/SidebarLayout.js` | Construye el menu lateral segun el rol y permisos del usuario activo. Aqui se decide que modulos se ven en pantalla. |
| Sesion y permisos frontend | `frontend/src/js/core/auth/AuthService.js` | Guarda la sesion, refresca autorizacion, revisa roles y permisos con `authService.can(...)`. |
| Permisos frontend | `frontend/src/js/core/auth/PermissionService.js` | Ayuda a consultar permisos disponibles del usuario actual. |
| Cliente API frontend | `frontend/src/js/core/api/ApiClient.js` | Ejecuta peticiones HTTP hacia el backend y maneja errores de API. |
| Fachada API frontend | `frontend/src/js/core/api/apiService.js` | Centraliza metodos del frontend para consumir endpoints del backend. |
| Entrada del backend | `backend/server.js` | Levanta Express, CORS, seguridad, parsing, logs, rutas `/api/*`, health check y manejo global de errores. |
| Login backend | `backend/routes/auth.js` + `backend/controllers/authController.js` + `backend/services/AuthService.js` | Maneja login, perfil, autorizacion efectiva y actualizacion de sesion. |
| Control de permisos backend | `backend/middleware/requirePermission.js` | Protege endpoints por permisos como `STUDENT_VIEW`, `PAYMENT_VIEW`, `REPORT_VIEW`, etc. |
| Base inicial | `backend/migrations/001_create_tables.sql` | Define tablas iniciales principales del sistema. |

## 3. Flujo general de navegacion

1. El usuario entra por `frontend/src/js/app.js`.
2. Si no tiene sesion, se envia a `/login`.
3. Al iniciar sesion, `AuthService` guarda el usuario y sus permisos.
4. Antes de abrir una ruta, `app.js` refresca autorizacion con `/api/auth/authorization`.
5. Segun rol y permisos, `app.js` permite o bloquea la ruta.
6. `SidebarLayout.js` arma el menu visible.
7. Cada vista llama a sus servicios frontend.
8. Los servicios frontend llaman a `apiService.js`.
9. El backend recibe por `backend/server.js`, pasa por rutas, permisos, controladores y servicios.
10. Las acciones importantes deben quedar con trazabilidad: quien registro, cobro, modifico, anulo, aprobo y cuando.

## 4. Roles del sistema

## 4.1 Estudiante

### Que hace

El estudiante no administra el sistema. Su participacion es consultar su informacion, completar acciones puntuales y confirmar procesos vinculados a su formacion.

Acciones principales:

- Ingresar a su portal.
- Consultar resumen de su proceso.
- Ver informacion de curso, horario o avance cuando aplique.
- Confirmar asistencia mediante QR cuando el instructor inicia una clase.
- Completar validaciones de asistencia con ubicacion si el flujo lo requiere.
- Mantener relacion con documentos o informacion personal segun los modulos habilitados.

### Archivos principales del rol

| Funcion | Frontend | Backend |
| --- | --- | --- |
| Portal del estudiante | `frontend/src/js/views/student-portal/StudentPortalView.js` | `backend/routes/studentPortal.js`, `backend/controllers/studentPortalController.js`, `backend/services/StudentPortalService.js` |
| Asistencia por QR | Se abre desde flujo movil/sesion | `backend/routes/attendance.js`, `backend/controllers/attendanceController.js`, `backend/services/AttendanceQrService.js` |
| Login y sesion | `frontend/src/js/views/auth/LoginView.js` | `backend/routes/auth.js`, `backend/services/AuthService.js` |

### Modulos que reutiliza

- Autenticacion.
- Portal del estudiante.
- Asistencia QR.
- Datos del estudiante.
- Documentos, cuando se habilite consulta o carga.

### Alcance recomendado

El estudiante solo debe ver su propia informacion. No debe ver reportes, caja, estudiantes de otros usuarios, configuracion, auditoria ni datos financieros globales.

## 4.2 Secretaria

### Que hace

Secretaria es el rol operativo que registra estudiantes y mueve el proceso inicial. Es quien normalmente recibe al estudiante, toma datos, asigna curso, adjunta documentos y prepara el expediente para que Caja cobre y los instructores trabajen.

Acciones principales:

- Registrar estudiante normal para curso.
- Registrar persona para practicas adicionales.
- Registrar persona que ya sabe conducir, segun flujo operativo.
- Registrar renovacion de licencia.
- Registrar estudiantes para otra sucursal cuando el caso lo requiere.
- Ver y editar datos del estudiante dentro de su alcance.
- Adjuntar o revisar documentos.
- Seleccionar horarios practicos y teoricos.
- Ver cupos, cursos, ciclos e instructores disponibles.
- Crear reservas de cupo cuando todavia no se completa la matricula.
- Activar una reserva y convertirla en estudiante/matricula cuando se completan los datos.
- Eliminar una reserva activa dentro de su alcance cuando el proceso ya no continuara.
- Consultar reportes operativos si tiene permiso.

### Archivos principales del rol

| Funcion | Frontend | Backend |
| --- | --- | --- |
| Dashboard operativo | `frontend/src/js/views/dashboard/DashboardView.js` | `backend/routes/admin.js` para algunos resumenes, mas servicios de estudiantes/documentos |
| Registro y listado de estudiantes | `frontend/src/js/views/students/StudentsView.js` | `backend/routes/students.js`, `backend/controllers/studentController.js`, `backend/services/StudentService.js` |
| Modal/formulario de registro | `frontend/src/js/views/student-form/StudentFormView.js` | `backend/controllers/studentController.js`, `backend/services/StudentService.js` |
| Practicas adicionales | `frontend/src/js/views/student-form/StudentFormView.js` | `backend/services/AdditionalPracticeService.js`, rutas en `backend/routes/students.js` |
| Renovacion de licencia | `frontend/src/js/views/student-form/StudentFormView.js` | `backend/services/LicenseRenewalService.js`, `backend/routes/students.js` |
| Documentacion | `frontend/src/js/views/documents/DocumentsView.js` | `backend/routes/documents.js`, `backend/controllers/documentController.js`, `backend/services/DocumentService.js` |
| Horarios | `frontend/src/js/views/schedule/ScheduleView.js` | `backend/routes/schedules.js`, `backend/routes/courseCycles.js`, `backend/services/ScheduleService.js`, `backend/services/CourseCycleService.js` |
| Perfil del estudiante | `frontend/src/js/views/student-profile/StudentProfileView.js` | `backend/routes/students.js`, `backend/services/StudentService.js` |

### Modulos que reutiliza

- Estudiantes.
- Formulario de estudiante.
- Cursos y ciclos.
- Horarios.
- Instructores.
- Documentacion.
- Reservas.
- Notificaciones.
- Historial.
- Reportes, si tiene permiso.

### Permisos comunes

- `STUDENT_VIEW`
- `STUDENT_CREATE`
- `STUDENT_UPDATE`
- `DOCUMENT_VIEW`
- `DOCUMENT_CREATE`
- `DOCUMENT_UPDATE`
- `SCHEDULE_VIEW`
- `SCHEDULE_ASSIGN`
- `SCHEDULE_CHANGE`
- `ENROLLMENT_VIEW`
- `ENROLLMENT_CREATE`
- `REPORT_VIEW`, si aplica
- `ATM_DOCUMENT_GENERATE`, si aplica

### Reglas importantes

- Secretaria no debe ver valores financieros si no tiene permisos de pagos.
- Secretaria puede crear estudiantes para otra sucursal si el proceso lo permite.
- El estudiante debe conservar trazabilidad del usuario que lo registro.
- Las renovaciones de licencia, practicas adicionales y curso normal son flujos distintos aunque compartan datos personales.
- Una reserva temporal protege el horario durante dos dias, pero no crea todavia una matricula definitiva.
- Al activar la reserva se reutilizan sus datos y se completa el flujo normal de inscripcion.
- Al vencer o eliminar la reserva se libera el horario protegido sin borrar estudiantes ni pagos ajenos al proceso.

## 4.3 Caja

### Que hace

Caja se encarga del proceso financiero. No deberia modificar la operacion academica salvo lo necesario para cobrar, generar comprobantes y consultar saldos.

Acciones principales:

- Buscar estudiantes por nombre o cedula.
- Ver pagos pendientes.
- Cobrar abonos o saldos.
- Registrar pagos por efectivo, transferencia, tarjeta u otro metodo habilitado.
- Consultar historial de cobros.
- Generar comprobantes/recibos.
- Ver pagos realizados.
- Solicitar o ejecutar anulaciones segun permisos.
- Cobrar a estudiantes inscritos en otra sucursal si el alcance de provincia/sucursal lo permite y la regla de negocio lo autoriza.
- Cobrar estudiantes de curso normal, practicas adicionales y renovacion de licencia si el backend los expone como cuenta pendiente.

### Archivos principales del rol

| Funcion | Frontend | Backend |
| --- | --- | --- |
| Inicio de caja | `frontend/src/js/views/cash/CashDashboardView.js` | `backend/routes/payments.js`, `backend/controllers/paymentController.js`, `backend/services/PaymentService.js` |
| Registro de pago | `frontend/src/js/views/cash/RegisterPaymentView.js` | `backend/routes/payments.js`, `backend/services/PaymentService.js` |
| Pagos pendientes | `frontend/src/js/views/cash/PendingPaymentsView.js` | `backend/routes/payments.js`, `backend/controllers/paymentController.js` |
| Historial de caja | `frontend/src/js/views/cash/CashHistoryView.js` y `frontend/src/js/views/history/HistoryView.js` | `backend/routes/payments.js`, `backend/routes/receipts.js` |
| Recibos | `frontend/src/js/views/cash/ReceiptsView.js` | `backend/routes/receipts.js`, `backend/controllers/receiptController.js`, `backend/services/ReceiptService.js` |

### Modulos que reutiliza

- Estudiantes, solo para consulta.
- Pagos.
- Recibos.
- Historial.
- Sucursales y metodos de pago.
- Auditoria financiera.

### Permisos comunes

- `PAYMENT_VIEW`
- `PAYMENT_CREATE`
- `PAYMENT_VOID`, si puede anular o solicitar anulacion.
- `RECEIPT_VIEW`
- `RECEIPT_GENERATE`
- `STUDENT_VIEW`, para buscar estudiantes.

### Reglas importantes

- Caja debe ver valores pendientes; secretaria normal no.
- Los metodos de pago dependen de la sucursal.
- Todo cobro debe guardar usuario, fecha, monto, metodo, referencia y sucursal.
- Las anulaciones deben quedar auditadas.
- Si una persona fue inscrita en otra sucursal pero pertenece al alcance permitido, Caja debe poder cobrarla segun regla de negocio.

## 4.4 Administrador de sucursal

### Que hace

El Administrador de Sucursal supervisa la operacion local o las sucursales dentro de su alcance. No administra todo el sistema global, pero si controla personal, procesos y resultados de su sede.

Acciones principales:

- Ver estudiantes de su sucursal o alcance autorizado.
- Revisar pagos, documentos, horarios y reportes locales.
- Supervisar instructores.
- Revisar disponibilidad.
- Configurar aspectos operativos de la sucursal cuando tiene permiso.
- Ver reportes del periodo.
- Revisar anulaciones o solicitudes criticas.
- Aprobar o rechazar anulaciones de pagos si el flujo lo requiere.
- Consultar auditoria local.
- Gestionar accesos del personal de su sucursal si tiene `GESTION_PERSONAL`.

### Archivos principales del rol

| Funcion | Frontend | Backend |
| --- | --- | --- |
| Dashboard operativo | `frontend/src/js/views/dashboard/DashboardView.js` | Servicios varios segun permiso |
| Sucursales / personal / accesos | `frontend/src/js/views/admin/AdminBranchesView.js` | `backend/routes/admin.js`, `backend/controllers/adminController.js`, `backend/services/BranchAdminService.js`, `backend/services/UserAdminService.js` |
| Reportes de sucursal | `frontend/src/js/views/manager/ManagerReportsView.js` usado tambien como reportes administrativos | `backend/routes/admin.js`, `backend/services/ReportService.js` |
| Horarios e instructores | `frontend/src/js/views/schedule/ScheduleView.js` | `backend/routes/courseCycles.js`, `backend/routes/instructors.js` |
| Auditoria local | `frontend/src/js/views/history/HistoryView.js` y partes admin | `backend/services/AuditService.js`, `backend/services/AuditQueryService.js` |

### Modulos que reutiliza

- Dashboard.
- Estudiantes.
- Documentacion.
- Horarios.
- Pagos, si tiene permiso.
- Reportes.
- Personal y accesos.
- Auditoria.
- Sucursales.
- Instructores.

### Permisos comunes

- `STUDENT_VIEW`
- `DOCUMENT_VIEW`
- `SCHEDULE_VIEW`
- `PAYMENT_VIEW`, si supervisa caja.
- `REPORT_VIEW`
- `REPORT_EXPORT`
- `BRANCH_VIEW`
- `BRANCH_UPDATE`, segun alcance.
- `USER_VIEW`, `USER_UPDATE`, si administra personal.
- `GESTION_PERSONAL`
- `AUDIT_VIEW`

### Reglas importantes

- Su alcance debe estar limitado a la sucursal o provincia autorizada.
- Puede supervisar, pero no debe tener permisos globales si no corresponde.
- Las aprobaciones importantes deben quedar auditadas.

## 4.5 Administrador del sistema

### Que hace

El Administrador del Sistema configura y gobierna la plataforma completa. Es el rol tecnico-administrativo con mayor capacidad de configuracion.

Acciones principales:

- Administrar sucursales.
- Crear, editar, bloquear y desbloquear usuarios.
- Administrar roles y permisos.
- Revisar sesiones activas y revocarlas.
- Configurar cursos, ciclos, metodos de pago y flujos por sucursal.
- Configurar disponibilidad, instructores, grupos y prioridades.
- Revisar reportes administrativos.
- Revisar auditoria.
- Monitorear en tiempo real el consumo tecnico de todas las operaciones del sistema desde el inicio de sesion.
- Exportar a Excel el resumen y detalle del monitoreo de recursos.
- Configurar parametros del sistema.
- Crear o habilitar servicios como renovacion de licencia, practicas adicionales, cursos o servicios independientes.
- Controlar permisos especiales por sucursal.

### Archivos principales del rol

| Funcion | Frontend | Backend |
| --- | --- | --- |
| Inicio admin sistema | `frontend/src/js/views/admin/AdminDashboardView.js` | `backend/routes/admin.js`, `backend/services/AdminDashboardService.js` |
| Sucursales | `frontend/src/js/views/admin/AdminBranchesView.js` | `backend/services/BranchAdminService.js` |
| Seguridad | `frontend/src/js/views/admin/AdminSecurityView.js` | `backend/services/UserAdminService.js`, `backend/services/PermissionService.js`, `backend/services/SessionService.js` |
| Espacio administrativo | `frontend/src/js/views/admin/AdminWorkspaceView.js` | `backend/routes/admin.js` |
| Configuracion | `frontend/src/js/views/admin/AdminSettingsView.js` | `backend/services/SettingsService.js`, `backend/services/WorkflowService.js` |
| Reportes admin | `frontend/src/js/views/manager/ManagerReportsView.js` | `backend/services/ReportService.js` |
| Monitor de recursos | `frontend/src/js/views/admin/AdminResourceMonitorView.js` | `backend/services/ResourceTelemetryService.js`, `backend/routes/admin.js` |
| ATM | `frontend/src/js/views/admin/AtmAuthorizationView.js` | `backend/services/AtmAuthorizationService.js`, `backend/routes/admin.js` |

### Modulos que reutiliza

- Sucursales.
- Usuarios.
- Roles y permisos.
- Configuracion.
- Cursos y ciclos.
- Reportes.
- Auditoria.
- ATM.
- Pagos, segun permisos.
- Instructores.
- Flujos de trabajo.
- Monitoreo tecnico y dimensionamiento del servidor.

### Permisos comunes

- `BRANCH_VIEW`
- `BRANCH_CREATE`
- `BRANCH_UPDATE`
- `USER_VIEW`
- `USER_CREATE`
- `USER_UPDATE`
- `USER_DISABLE`
- `ROLE_VIEW`
- `ROLE_MANAGE`
- `PERMISSION_VIEW`
- `PERMISSION_MANAGE`
- `SESSION_VIEW`
- `SESSION_REVOKE`
- `SETTING_VIEW`
- `SETTING_UPDATE`
- `WORKFLOW_VIEW`
- `WORKFLOW_MANAGE`
- `REPORT_VIEW`
- `REPORT_EXPORT`
- `AUDIT_VIEW`
- `ATM_DOCUMENT_GENERATE`

### Reglas importantes

- Este rol no depende de una sola sucursal.
- Debe poder configurar sin romper la operacion diaria.
- Los cambios de permisos, usuarios y configuracion deben quedar auditados.
- No debe confundirse con Gerente General: Admin configura; Gerente analiza.

## 4.6 Gerente general

### Que hace

Gerente General consulta la situacion global de la empresa. Su rol es analitico y de control, no de registro operativo diario.

Acciones principales:

- Ver resumen ejecutivo.
- Ver ingresos cobrados.
- Ver saldo pendiente.
- Revisar matriculas y estudiantes.
- Comparar sucursales.
- Comparar provincias y cantones.
- Revisar operacion academica.
- Revisar rendimiento financiero.
- Revisar actividad de instructores.
- Consultar auditoria gerencial.
- Ver monitoreo de inscripciones.
- Exportar reportes.

### Archivos principales del rol

| Funcion | Frontend | Backend |
| --- | --- | --- |
| Resumen ejecutivo | `frontend/src/js/views/manager/ManagerDashboardView.js` | `backend/services/ManagerDashboardService.js`, `backend/routes/admin.js` |
| Financiero | `frontend/src/js/views/manager/ManagerFinanceView.js` | `backend/services/ManagerDashboardService.js`, `backend/services/ReportService.js` |
| Academico | `frontend/src/js/views/manager/ManagerAcademicView.js` | `backend/services/ReportService.js`, `backend/services/InstructorService.js` |
| Sucursales | `frontend/src/js/views/manager/ManagerBranchesView.js` | `backend/services/BranchAdminService.js` |
| Reportes | `frontend/src/js/views/manager/ManagerReportsView.js` | `backend/services/ReportService.js` |
| Auditoria gerencial | `frontend/src/js/views/manager/ManagerAuditView.js` | `backend/services/AuditQueryService.js` |
| Monitor de inscripciones | `frontend/src/js/views/manager/ManagerEnrollmentMonitorView.js` | `backend/services/EnrollmentMonitorService.js` |

### Modulos que reutiliza

- Reportes.
- Finanzas.
- Auditoria.
- Sucursales.
- Estudiantes, como indicadores y detalle.
- Cursos y ciclos.
- Instructores.
- Exportaciones.

### Permisos comunes

- `REPORT_VIEW`
- `REPORT_EXPORT`
- `AUDIT_VIEW`
- `BRANCH_VIEW`
- `PAYMENT_VIEW`, si consulta indicadores financieros.
- `INSTRUCTOR_PERFORMANCE_VIEW`
- `INSTRUCTOR_PERFORMANCE_REPORT`

### Reglas importantes

- Gerente puede ver globalmente, pero no necesariamente debe registrar estudiantes ni cobrar.
- La informacion debe ser clara, filtrable y exportable.
- Los indicadores deben respetar fecha, sucursal, provincia, canton y tipo de curso.

## 5. Modulos principales del sistema

## 5.1 Autenticacion y autorizacion

Controla login, sesion, roles, permisos y autorizacion efectiva.

Archivos:

- `frontend/src/js/views/auth/LoginView.js`
- `frontend/src/js/core/auth/AuthService.js`
- `frontend/src/js/core/auth/PermissionService.js`
- `backend/routes/auth.js`
- `backend/controllers/authController.js`
- `backend/services/AuthService.js`
- `backend/middleware/requirePermission.js`

Reutilizable por todos los roles.

## 5.2 Dashboard

Muestra resumen inicial segun rol. Debe evitar consultar informacion que el usuario no tiene permiso de ver.

Archivos:

- `frontend/src/js/views/dashboard/DashboardView.js`
- `frontend/src/js/services/DashboardService.js`
- `frontend/src/js/views/admin/AdminDashboardView.js`
- `frontend/src/js/services/AdminDashboardService.js`
- `frontend/src/js/views/manager/ManagerDashboardView.js`
- `backend/services/AdminDashboardService.js`
- `backend/services/ManagerDashboardService.js`

Reutilizable por secretaria, caja parcial, administrador de sucursal, administrador del sistema y gerente general, segun permisos.

## 5.3 Estudiantes

Gestiona registro, consulta, actualizacion, estados, reservas y expediente.

### Flujo de reserva temporal de cupo

1. Secretaria abre el mismo flujo de nuevo estudiante y selecciona sucursal, curso, ciclo, instructor, horario practico y horario teorico.
2. Despues de escoger el personal y el horario puede usar `Reservar este cupo por 2 dias`.
3. El formulario conserva cedula, nombres, telefono, direccion y demas datos del borrador, pero no crea todavia la matricula definitiva.
4. La reserva bloquea todos los dias y horas elegidos para el instructor durante un maximo de dos dias.
5. La cedula no puede mantener dos reservas temporales activas.
6. Una inscripcion definitiva y una reserva usan bloqueos transaccionales sobre el mismo instructor, ciclo, fecha y hora. Si dos personas intentan ocupar simultaneamente el ultimo cupo, solo una operacion puede confirmarse.
7. Desde `Cupos reservados` se puede activar la reserva para continuar la matricula o eliminarla para liberar inmediatamente el horario.
8. Al eliminar se cambia el estado a `cancelado`, se registra `cancelled_by`, se desactivan los bloqueos de disponibilidad relacionados y se crea el evento de auditoria `TEMPORARY_ENROLLMENT_CANCELLED`.
9. Las reservas vencidas dejan de contar como cupo ocupado mediante el proceso de expiracion del sistema.

Archivos:

- `frontend/src/js/views/students/StudentsView.js`
- `frontend/src/js/views/student-form/StudentFormView.js`
- `frontend/src/js/views/student-profile/StudentProfileView.js`
- `frontend/src/js/services/StudentService.js`
- `backend/routes/students.js`
- `backend/controllers/studentController.js`
- `backend/services/StudentService.js`
- `backend/services/StudentAccountService.js`

Reutilizable por secretaria, caja, administrador de sucursal, administrador del sistema, gerente general e instructor en modo consulta.

## 5.4 Formularios de registro

Agrupa las formas de registrar personas:

- Curso normal.
- Practicas adicionales.
- Persona que ya sabe conducir.
- Renovacion de licencia.
- Reservas que luego se activan como estudiante.

Archivos:

- `frontend/src/js/views/student-form/StudentFormView.js`
- `backend/services/AdditionalPracticeService.js`
- `backend/services/LicenseRenewalService.js`
- `backend/services/StudentService.js`

Reutilizable principalmente por secretaria y perfiles con `STUDENT_CREATE`.

## 5.5 Documentacion

Controla documentos faltantes, subidos y completados por estudiante.

Archivos:

- `frontend/src/js/views/documents/DocumentsView.js`
- `frontend/src/js/views/mobile-upload/MobileDocumentUploadView.js`
- `frontend/src/js/services/DocumentService.js`
- `backend/routes/documents.js`
- `backend/controllers/documentController.js`
- `backend/services/DocumentService.js`

Reutilizable por secretaria, administrador de sucursal, administrador del sistema y estudiante en flujos de carga movil.

## 5.6 Horarios, cursos y ciclos

Controla cursos activos, proximos inicios, horarios normales/intensivos/rotativos, disponibilidad de instructores y asignacion de cupos.

### Catalogo de cursos

El catalogo actual debe tratar como nombres operativos principales:

- `Clase A - Moto`: curso activo para formacion en motocicleta.
- `Clase B - Automovil`: curso activo para formacion en automovil.

Tambien pueden existir nombres historicos o aliases inactivos en la base, como `Motocicleta` y `Automovil`. Estos se conservan para compatibilidad o registros antiguos, pero las pantallas nuevas de registro, horarios y ciclos deben priorizar los cursos activos anteriores.

### Regla institucional para codigos de ciclos

Todos los ciclos, sin importar si son normales, intensivos, automaticos o referidos, usan un unico formato:

- Automovil: `SP_IC{sufijoSucursal}_{secuencia}_{aa}`.
- Moto: `SP_IM{sufijoSucursal}_{secuencia}_{aa}`.

La secuencia es consecutiva por sucursal, tipo de vehiculo y anio, ordenada por fecha de inicio. El sufijo se deriva del codigo de la sucursal: Manta 2000 no usa sufijo (`SP_IC_1_26`), Flavio Reyes usa `1` (`SP_IC1_1_26`) y Jipijapa usa `J` (`SP_IMJ_1_26`). El codigo no debe incluir instructor, grupo, modalidad ni fecha; esos datos permanecen en sus campos propios.

### Reglas de disponibilidad mostrada

- La disponibilidad se presenta separada por curso, modalidad (`Normal` o `Intensivo`) y tipo de vehiculo (`Automovil` o `Moto`).
- No se muestran nombres dentro de cada celda del resumen general; la celda indica solamente los cupos disponibles.
- Las horas ocupadas o reservadas no se ofrecen como seleccionables. Si una celda no tiene cupo, queda vacia.
- Un curso que ya no tiene ninguna fila disponible no debe aparecer entre las opciones de inscripcion ni en la consulta general de disponibilidad.
- La tabla de cada curso conserva su instructor, fecha inicial, fecha final, dias efectivos y horarios disponibles.
- Al cerrar y volver a abrir el modal se reconstruye su estado interactivo para que los filtros y la navegacion entre instructores sigan funcionando.

### Cursos intensivos de fin de semana

- Automovil intensivo cumple cuatro jornadas: primer sabado, primer domingo, segundo sabado y examen el segundo domingo.
- Moto intensiva cumple tres jornadas: primer sabado, primer domingo y examen el segundo sabado.
- Los instructores rotan alfabeticamente dentro del area del vehiculo para cada sucursal.
- En Flavio Reyes, Moto usa exclusivamente a Francisco Giler, Antonio Salgado y Dario Plaza, respetando la rotacion configurada y la disponibilidad real.
- El control `Anterior / Proximo` permite recorrer todos los ciclos intensivos publicados con cupos.
- Si `Proximo` llega al ultimo ciclo publicado, el backend puede publicar el siguiente fin de semana y continuar con el siguiente instructor de la rotacion; no debe volver a entregar indefinidamente el primer ciclo.
- La lista se vuelve a consultar antes de crear un ciclo, evitando duplicar uno que ya exista en el servidor.
- Si trabajan dos instructores en un mismo fin de semana, ambos consumen su turno y la rotacion posterior continua con quien corresponda.
- La capacidad depende de instructores habilitados y cupos reales, no de la cantidad de celdas visibles en la tabla.

Archivos:

- `frontend/src/js/views/schedule/ScheduleView.js`
- `frontend/src/js/services/ScheduleService.js`
- `frontend/src/js/services/instructorAssignmentService.js`
- `backend/routes/schedules.js`
- `backend/routes/courseCycles.js`
- `backend/services/ScheduleService.js`
- `backend/services/CourseCycleService.js`
- `backend/services/AutomaticCycleService.js`
- `backend/services/CycleInstructorAssignmentService.js`

Reutilizable por secretaria, administrador de sucursal, administrador del sistema, gerente general e instructores.

## 5.7 Instructores

Controla agenda, clases, estudiantes, referidos, evaluaciones, incidencias y disponibilidad.

Archivos:

- `frontend/src/js/views/instructor/InstructorDashboardView.js`
- `frontend/src/js/views/instructor/InstructorAgendaView.js`
- `frontend/src/js/views/instructor/InstructorStudentsView.js`
- `frontend/src/js/views/instructor/InstructorReferralsView.js`
- `frontend/src/js/views/instructor/InstructorEvaluationsView.js`
- `frontend/src/js/views/instructor/InstructorIncidentsView.js`
- `frontend/src/js/views/instructor/InstructorProfileView.js`
- `frontend/src/js/services/instructorDashboardService.js`
- `frontend/src/js/services/instructorAgendaService.js`
- `frontend/src/js/services/instructorStudentService.js`
- `frontend/src/js/services/instructorReferralService.js`
- `backend/routes/instructor.js`
- `backend/routes/instructors.js`
- `backend/controllers/instructorController.js`
- `backend/controllers/instructorAdminController.js`
- `backend/services/InstructorService.js`
- `backend/services/InstructorAdminService.js`

Reutilizable por instructores y por administracion para configurar disponibilidad y revisar desempeno.

## 5.8 Pagos, caja y recibos

Controla saldos, pagos pendientes, cobros, recibos, historial y anulaciones.

Archivos:

- `frontend/src/js/views/cash/CashDashboardView.js`
- `frontend/src/js/views/cash/RegisterPaymentView.js`
- `frontend/src/js/views/cash/PendingPaymentsView.js`
- `frontend/src/js/views/cash/CashHistoryView.js`
- `frontend/src/js/views/cash/ReceiptsView.js`
- `frontend/src/js/services/PaymentService.js`
- `frontend/src/js/services/ReceiptService.js`
- `backend/routes/payments.js`
- `backend/routes/receipts.js`
- `backend/controllers/paymentController.js`
- `backend/controllers/receiptController.js`
- `backend/services/PaymentService.js`
- `backend/services/ReceiptService.js`

Reutilizable por caja, administrador de sucursal, administrador del sistema y gerente general, siempre respetando `PAYMENT_VIEW`, `PAYMENT_CREATE`, `PAYMENT_VOID`, `RECEIPT_VIEW` y `RECEIPT_GENERATE`.

## 5.9 Reportes

Consulta informacion operativa, academica y financiera con filtros.

Archivos:

- `frontend/src/js/views/manager/ManagerReportsView.js`
- `frontend/src/js/views/admin/AdminCourseReportsView.js`
- `frontend/src/js/services/ManagerService.js`
- `backend/routes/admin.js`
- `backend/services/ReportService.js`

Reutilizable por administrador de sucursal, administrador del sistema y gerente general. Puede estar disponible para secretaria si tiene permiso.

## 5.10 Gerencia

Agrupa vistas globales de direccion.

Archivos:

- `frontend/src/js/views/manager/ManagerWorkspaceView.js`
- `frontend/src/js/views/manager/ManagerDashboardView.js`
- `frontend/src/js/views/manager/ManagerFinanceView.js`
- `frontend/src/js/views/manager/ManagerAcademicView.js`
- `frontend/src/js/views/manager/ManagerBranchesView.js`
- `frontend/src/js/views/manager/ManagerAuditView.js`
- `frontend/src/js/views/manager/ManagerEnrollmentMonitorView.js`
- `backend/services/ManagerDashboardService.js`
- `backend/services/EnrollmentMonitorService.js`
- `backend/services/AuditQueryService.js`

Reutilizable solo por Gerente General y administradores autorizados para reporteria.

## 5.11 Administracion del sistema

Gestiona configuracion global, sucursales, permisos, usuarios, sesiones y flujos.

Archivos:

- `frontend/src/js/views/admin/AdminDashboardView.js`
- `frontend/src/js/views/admin/AdminSecurityView.js`
- `frontend/src/js/views/admin/AdminBranchesView.js`
- `frontend/src/js/views/admin/AdminSettingsView.js`
- `frontend/src/js/views/admin/AdminWorkspaceView.js`
- `frontend/src/js/services/AdminService.js`
- `frontend/src/js/services/AdminDashboardService.js`
- `backend/routes/admin.js`
- `backend/controllers/adminController.js`
- `backend/services/UserAdminService.js`
- `backend/services/PermissionService.js`
- `backend/services/SessionService.js`
- `backend/services/SettingsService.js`
- `backend/services/WorkflowService.js`
- `backend/services/BranchAdminService.js`

Reutilizable por Administrador del Sistema y, en partes limitadas, por Administrador de Sucursal.

## 5.12 Auditoria e historial

Permite revisar trazabilidad de acciones.

Archivos:

- `frontend/src/js/views/history/HistoryView.js`
- `frontend/src/js/views/manager/ManagerAuditView.js`
- `backend/services/AuditService.js`
- `backend/services/AuditQueryService.js`
- `backend/routes/admin.js`

Reutilizable por administrador de sucursal, administrador del sistema, gerente general y usuarios que consultan su propio historial.

## 5.13 Autorizaciones ATM

Genera documentos oficiales para ATM y permisos de conduccion.

Archivos:

- `frontend/src/js/views/admin/AtmAuthorizationView.js`
- `backend/services/AtmAuthorizationService.js`
- `backend/routes/admin.js`
- Plantillas institucionales en `documentos/`

Reutilizable por administracion y perfiles con `ATM_DOCUMENT_GENERATE`.

## 5.14 Notificaciones

Muestra avisos internos del sistema.

Archivos:

- `frontend/src/js/views/notifications/NotificationsView.js`
- `frontend/src/js/services/NotificationService.js`
- `backend/routes/notifications.js`
- `backend/controllers/notificationController.js`
- `backend/services/NotificationService.js`

Reutilizable por usuarios internos, excepto cuando una vista oculta notificaciones por decision de rol.

## 5.15 Monitoreo integral de recursos

Este modulo pertenece al Administrador del Sistema y sirve para medir el consumo real de la plataforma antes de ampliar o comprar un servidor.

Alcance actual:

- Mide todas las peticiones de la API desde el inicio de sesion, no solamente las inscripciones.
- Clasifica accesos, consultas y operaciones de estudiantes, pagos, documentos, horarios, instructores, reportes, administracion y notificaciones.
- Registra responsable, sucursal, accion realizada, ruta, resultado y fecha/hora.
- Cuando la operacion se relaciona con un estudiante o matricula, conserva esos identificadores para mostrar el contexto.
- Mide duracion total, CPU, variacion observada de memoria, bytes de entrada/salida, cantidad de consultas PostgreSQL y tiempo empleado por la base de datos.
- Se actualiza por HTTP cada cinco segundos. MQTT no es necesario para este ERP web porque la informacion ya se produce en las peticiones HTTP del sistema.
- Permite pausar, reanudar, actualizar manualmente y filtrar por sucursal y periodo entre una hora y treinta dias.
- Exporta un Excel con hoja `Resumen` y hoja `Operaciones`.
- El Excel incluye accion, responsable, sucursal, estudiante, resultado, tiempos, CPU, consultas, memoria, red e identificador de solicitud.
- No guarda contrasenas ni el contenido completo de los formularios.
- La memoria por operacion es una variacion del proceso Node.js compartido; no representa memoria reservada exclusivamente para un estudiante.

Dimensionamiento:

- Con menos de 100 operaciones reales la muestra se considera insuficiente para decidir una compra.
- Se deben medir jornadas normales y horas pico antes de elegir infraestructura.
- Con una muestra saludable, la referencia inicial es 2 vCPU, 4 GB de RAM y PostgreSQL sobre SSD.
- Si el percentil 95 presenta alta latencia o consumo de CPU, se recomienda revisar consultas y evaluar 4 vCPU y 8 GB de RAM antes de comprar.

Archivos:

- `frontend/src/js/views/admin/AdminResourceMonitorView.js`
- `frontend/src/js/services/AdminService.js`
- `backend/services/ResourceTelemetryService.js`
- `backend/config/database.js`
- `backend/routes/admin.js`
- `backend/controllers/adminController.js`

## 6. Modulos reutilizables

Estos modulos no pertenecen a un solo rol; se comparten segun permiso.

| Modulo reutilizable | Quienes lo usan | Observacion |
| --- | --- | --- |
| `StudentService` | Secretaria, Caja, Admin Sucursal, Admin Sistema, Gerencia, Instructor | Origen comun para estudiantes y expedientes. |
| `StudentFormView` | Secretaria y perfiles con creacion | Centraliza registros normales, practicas adicionales y renovaciones. |
| `DocumentService` | Secretaria, Admin Sucursal, Estudiante movil | Evita duplicar logica de documentos. |
| `ScheduleService` | Secretaria, Admin Sucursal, Instructores | Maneja disponibilidad y asignacion de horarios. |
| `CourseCycleService` | Secretaria, Admin, Gerencia | Base de ciclos, proximos inicios y cupos. |
| `PaymentService` | Caja, Admin Sucursal, Gerencia | Solo debe usarse con permisos financieros. |
| `ReceiptService` | Caja y perfiles autorizados | Genera/consulta comprobantes. |
| `ManagerService` | Gerencia y reportes admin | Reutiliza endpoints consolidados. |
| `AdminService` | Admin Sistema y Admin Sucursal | Gestion administrativa y configuracion. |
| `InstructorService` | Instructores y administracion | Agenda, estudiantes, desempeno y disponibilidad. |
| `AuditService` | Admin y Gerencia | Trazabilidad. |
| `ResourceTelemetryService` | Admin Sistema | Telemetria integral, lectura de capacidad y exportacion Excel. |
| `AuthService` | Todos | Login, sesion, permisos. |
| `SidebarLayout` | Todos los usuarios internos | Menu por rol y permiso. |
| `ApiService` | Todo el frontend | Fachada unica para backend. |

## 7. Relacion entre roles y rutas frontend

| Rol | Ruta inicial comun | Rutas principales |
| --- | --- | --- |
| Estudiante | `/student` | `/student`, flujos QR de asistencia |
| Secretaria | `/dashboard` | `/students`, `/documents`, `/schedule`, `/reports`, `/history`, `/atm-authorizations` si tiene permiso |
| Caja | `/cash` | `/cash`, `/cash/pending`, `/cash/register`, `/cash/history`, `/students` si tiene permiso |
| Administrador de sucursal | `/dashboard` o modulo asignado | `/students`, `/documents`, `/schedule`, `/reports`, `/branch-access`, `/history`, `/cash/pending` si tiene permiso |
| Administrador del sistema | `/admin-system` | `/admin-system`, `/admin-system/branches`, `/admin-system/reports`, `/admin-system/resources`, `/admin-system/audit`, `/admin-system/settings` |
| Gerente general | `/manager` | `/manager`, `/manager/finance`, `/manager/academic`, `/manager/monitor`, `/manager/branches`, `/manager/reports`, `/manager/audit` |
| Instructor | `/instructor` | `/instructor`, `/instructor/agenda`, `/instructor/students`, `/instructor/referrals`, `/instructor/evaluations`, `/instructor/incidents`, `/instructor/profile` |

## 8. Relacion entre rutas backend y modulos

| Endpoint base | Ruta backend | Controlador / servicio principal |
| --- | --- | --- |
| `/api/auth` | `backend/routes/auth.js` | `AuthController`, `AuthService` |
| `/api/students` | `backend/routes/students.js` | `StudentController`, `StudentService`, `AdditionalPracticeService`, `LicenseRenewalService` |
| `/api/payments` | `backend/routes/payments.js` | `PaymentController`, `PaymentService` |
| `/api/receipts` | `backend/routes/receipts.js` | `ReceiptController`, `ReceiptService` |
| `/api/documents` | `backend/routes/documents.js` | `DocumentController`, `DocumentService` |
| `/api/schedules` | `backend/routes/schedules.js` | `ScheduleController`, `ScheduleService` |
| `/api/course-cycles` | `backend/routes/courseCycles.js` | `CourseCycleController`, `CourseCycleService` |
| `/api/instructor` | `backend/routes/instructor.js` | `InstructorController`, `InstructorService` |
| `/api/instructors` | `backend/routes/instructors.js` | `InstructorAdminController`, `InstructorAdminService` |
| `/api/admin` | `backend/routes/admin.js` | `AdminController`, servicios admin/reportes/ATM/auditoria |
| `/api/admin/resource-monitor` | `backend/routes/admin.js` | `AdminController`, `ResourceTelemetryService`; consulta con `AUDIT_VIEW` y exportacion con `REPORT_EXPORT` |
| `/api/attendance` | `backend/routes/attendance.js` | `AttendanceController`, `AttendanceQrService` |
| `/api/student-portal` | `backend/routes/studentPortal.js` | `StudentPortalController`, `StudentPortalService` |
| `/api/notifications` | `backend/routes/notifications.js` | `NotificationController`, `NotificationService` |
| `/api/me` | `backend/routes/me.js` | Perfil del usuario autenticado |

## 9. Reglas de permisos que deben respetarse

El sistema debe revisar permisos en dos capas:

- Frontend: para ocultar botones, menus, tarjetas y acciones que no corresponden.
- Backend: para bloquear endpoints aunque alguien intente llamarlos manualmente.

Ejemplos:

- Ver estudiantes: `STUDENT_VIEW`.
- Crear estudiante: `STUDENT_CREATE`.
- Editar estudiante: `STUDENT_UPDATE`.
- Ver documentos: `DOCUMENT_VIEW`.
- Crear documentos: `DOCUMENT_CREATE`.
- Ver horarios: `SCHEDULE_VIEW`.
- Asignar horarios: `SCHEDULE_ASSIGN`.
- Cambiar horarios: `SCHEDULE_CHANGE`.
- Ver pagos: `PAYMENT_VIEW`.
- Cobrar: `PAYMENT_CREATE`.
- Anular pago: `PAYMENT_VOID`.
- Ver recibos: `RECEIPT_VIEW`.
- Generar recibos: `RECEIPT_GENERATE`.
- Ver reportes: `REPORT_VIEW`.
- Exportar reportes: `REPORT_EXPORT`.
- Gestionar usuarios: `USER_VIEW`, `USER_CREATE`, `USER_UPDATE`, `USER_DISABLE`.
- Gestionar roles/permisos: `ROLE_MANAGE`, `PERMISSION_MANAGE`.
- Ver auditoria: `AUDIT_VIEW`.
- Generar ATM: `ATM_DOCUMENT_GENERATE`.

## 10. Acciones criticas que siempre deben tener trazabilidad

Estas acciones deben guardar usuario responsable, fecha, hora, sucursal y resultado:

- Login y cierre de sesion.
- Creacion de estudiantes.
- Edicion de datos personales.
- Creacion de matriculas.
- Seleccion o cambio de horario.
- Asignacion de instructor.
- Registro de practicas adicionales.
- Registro de renovacion de licencia.
- Creacion, activacion, vencimiento y eliminacion de reservas.
- Subida, cambio o eliminacion de documentos.
- Registro de pagos.
- Anulacion o solicitud de anulacion de pagos.
- Aprobacion o rechazo de anulaciones.
- Generacion de recibos.
- Cambios de permisos.
- Bloqueo/desbloqueo de usuarios.
- Cambios de configuracion por sucursal.
- Generacion de documentos ATM.
- Exportacion de reportes importantes.

## 11. Reglas de diseno funcional por rol

### Secretaria

Debe ver pantallas sencillas para registrar rapido. No debe cargar con informacion financiera si no cobra. Los registros deben estar separados por tipo: curso normal, practicas adicionales, persona que ya sabe conducir y renovacion de licencia.

### Caja

Debe encontrar rapido al estudiante, ver saldo y cobrar. No debe perder tiempo con documentos u horarios salvo que necesite confirmar identidad o curso.

### Administrador de sucursal

Debe tener control operativo local. Sus pantallas deben mezclar resumen, filtros y detalle, pero siempre limitadas a su alcance.

### Administrador del sistema

Debe configurar sin confundirse con operacion diaria. Sus pantallas deben mostrar permisos, sucursales, roles y flujos de manera ordenada.

### Gerente general

Debe ver indicadores consolidados, comparacion y tendencia. La pantalla debe ser clara, exportable y filtrable.

### Instructor

Debe ver que hace hoy, que estudiantes tiene, que clase sigue y que debe marcar. No debe administrar pagos ni configuraciones.

### Estudiante

Debe ver solo su informacion, su avance y las acciones que le corresponden.

## 12. Recomendaciones para futuros cambios

Antes de modificar cualquier modulo:

1. Revisar si ya existe una vista, servicio o endpoint parecido.
2. Revisar permisos del rol afectado.
3. Revisar si el cambio debe hacerse en frontend, backend o ambos.
4. Mantener modulos reutilizables en servicios, no duplicar logica en cada vista.
5. Si se muestra un indicador, confirmar si el rol tiene permiso para verlo.
6. Si se agrega un registro nuevo, confirmar que aparece en estudiantes, pagos, documentos, reportes y auditoria si corresponde.
7. Si se agrega un nuevo tipo de servicio, confirmar que Caja tambien pueda cobrarlo si genera saldo.
8. Si se agrega algo por sucursal, confirmar configuracion y alcance.
9. Si se toca un formulario, no romper los otros tipos de registro que reutilizan el mismo componente.
10. Si se modifica disponibilidad de instructores, validar curso, ciclo, fecha oficial, fecha real disponible y reservas.

## 13. Base de datos: tablas principales y como se conectan

Esta seccion explica la base de datos desde lo mas importante hacia las tablas que dependen de cada proceso. La idea es poder responder preguntas operativas como:

- Cuantos estudiantes registro una secretaria.
- En que sucursal fue inscrito un estudiante.
- En que curso/ciclo esta.
- Que instructor tiene asignado.
- Si debe dinero.
- Que documentos tiene pendientes.
- Que usuario cobro, anulo, aprobo o modifico.

## 13.1 Tablas principales del negocio

Estas tablas son el centro del sistema. La mayoria de modulos termina conectandose con una o varias de ellas.

| Tabla | Que representa | Campos clave | Se conecta con |
| --- | --- | --- | --- |
| `users` | Usuarios internos y tambien cuentas de estudiantes cuando tienen portal | `id`, `username`, `role`, `branch_id`, `student_id`, `active` | Roles, permisos, sucursales, estudiantes, auditoria, instructores |
| `branches` | Sucursales de la escuela | `id`, `name`, `code`, `city_id`, `province`, `active` | Usuarios, estudiantes, cursos, pagos, servicios, instructores |
| `students` | Personas registradas como estudiantes o servicios vinculados | `id`, `identification`, `first_name`, `last_name`, `branch_id`, `city_id`, `created_by`, `updated_by`, `registration_type`, `status` | Matriculas, pagos, documentos, horarios, reservas, servicios |
| `courses` | Catalogo de cursos | `id`, `name`, `price`, `active` | Matriculas, ciclos, sucursal-cursos, instructores |
| `enrollments` | Matricula de un estudiante en un curso | `id`, `student_id`, `branch_id`, `course_id`, `status`, `created_by` | Pagos, instructores, sesiones practicas, ciclos |
| `course_cycles` | Inicio/fin de cursos por sucursal, tipo y grupo | `id`, `branch_id`, `course_id`, `group_id`, `code`, `vehicle_type`, `start_date`, `end_date` | Instructores del ciclo, asignaciones de horario, reservas |
| `instructor_profiles` | Perfil academico del instructor | `id`, `user_id`, `practice_area`, `status` | Usuarios, cursos, asignaciones, sesiones, disponibilidad |
| `payments` | Cuenta financiera de una matricula | `id`, `enrollment_id`, `total`, `final_amount`, `balance`, `status` | Matriculas, abonos, recibos, anulaciones |
| `service_transactions` | Cobros/servicios independientes como psicosensometrico, recuperacion, renovacion o practicas segun flujo | `id`, `service_id`, `branch_id`, `student_id`, `enrollment_id`, `customer_identification`, `amount`, `status`, `created_by`, `received_by` | Servicios, estudiantes, sucursales, recibos de servicios |
| `audit_logs` | Trazabilidad general del sistema | `id`, `user_id`, `branch_id`, `action`, `module`, `entity_type`, `entity_id`, `created_at` | Usuarios, sucursales y cualquier entidad auditada |

## 13.2 Tablas de soporte administrativo

Estas tablas no siempre son visibles para el usuario final, pero sostienen permisos, catalogos y configuraciones.

| Tabla | Que hace | Relacion principal |
| --- | --- | --- |
| `roles` | Define roles del sistema como Admin Sistema, Gerente, Caja, Secretaria, Instructor | Se asigna a usuarios mediante `user_roles` |
| `permissions` | Define acciones permitidas como `STUDENT_VIEW`, `PAYMENT_VIEW`, `REPORT_VIEW` | Se une a roles por `role_permissions` |
| `role_permissions` | Permisos que trae un rol por defecto | `roles.id` + `permissions.id` |
| `user_roles` | Roles asignados a cada usuario, globales o por sucursal | `users.id`, `roles.id`, `branches.id` |
| `user_permissions` | Permisos directos permitidos o denegados a un usuario | `users.id`, `permissions.id`, `branches.id` |
| `branch_courses` | Cursos habilitados por sucursal | `branches.id`, `courses.id` |
| `branch_services` | Servicios habilitados por sucursal | `branches.id`, `service_catalog.id` |
| `service_catalog` | Catalogo de servicios independientes | Se usa por `service_transactions` |
| `settings` | Configuracion global o por sucursal | Puede apuntar a `branches.id` |
| `workflows` | Flujos disponibles del sistema | Se asignan con `branch_workflows` |
| `branch_workflows` | Flujos activos por sucursal | `branches.id`, `workflows.id` |
| `provinces` | Catalogo de provincias | Referencia logica para ciudades/sucursales |
| `cities` | Catalogo de cantones/ciudades | Lo usan `branches.city_id` y `students.city_id` |

## 13.3 Tablas academicas y de horario

Estas tablas responden preguntas de clases, instructores, disponibilidad y horarios.

| Tabla | Que hace | Relacion principal |
| --- | --- | --- |
| `instructor_course_capabilities` | Cursos que puede dictar un instructor | `instructor_profiles.id`, `courses.id` |
| `instructor_groups` | Grupos de instructores por sucursal y tipo de vehiculo | `branches.id` |
| `instructor_group_members` | Instructores dentro de cada grupo | `instructor_groups.id`, `instructor_profiles.id` |
| `course_cycle_instructors` | Instructores asignados a un ciclo | `course_cycles.id`, `instructor_profiles.id` |
| `intensive_instructor_rotation_assignments` | Orden de instructores y ciclo publicado para cada fin de semana intensivo | `branches.id`, `course_cycles.id`, `instructor_profiles.id`, `vehicle_type`, `start_date`, `position_order` |
| `enrollment_instructor_assignments` | Instructor asignado a una matricula | `enrollments.id`, `instructor_profiles.id`, `users.id` en `assigned_by` |
| `course_cycle_schedule_assignments` | Horario por dia de un estudiante dentro de un ciclo | `course_cycles.id`, `enrollments.id`, `students.id`, `instructor_profiles.id` |
| `practical_sessions` | Sesiones practicas programadas o realizadas | `enrollments.id`, `instructor_profiles.id`, `branches.id`, `vehicles.id` |
| `instructor_availability` | Disponibilidad base del instructor por dia/hora | `instructor_profiles.id` |
| `instructor_availability_overrides` | Excepciones: reservado, bloqueado o ajuste puntual | `instructor_profiles.id` |
| `theory_class_schedules` | Horarios teoricos | `branches.id`, `courses.id`, `instructor_profiles.id` |
| `training_routes` | Rutas practicas por ciudad/sucursal/curso | `branches.id`, `courses.id`, `cities.id` |

## 13.4 Tablas financieras

Estas tablas explican saldos, cobros, comprobantes y anulaciones.

| Tabla | Que hace | Relacion principal |
| --- | --- | --- |
| `payments` | Cuenta principal de una matricula: total, descuento, saldo, estado | `enrollments.id` |
| `payment_details` | Abonos o movimientos realizados sobre un pago | `payments.id`, usuario que cobra/anula segun columnas del movimiento |
| `receipts` | Recibos/comprobantes de pagos de matriculas | `students.id`, `payments.id` |
| `payment_history` | Historial simple de movimientos de pago | `students.id`, `payments.id` |
| `payment_void_requests` | Solicitudes de anulacion de pagos | Pago, usuario solicitante, usuario revisor |
| `service_transactions` | Cobros de servicios independientes o especiales | `service_catalog.id`, `branches.id`, opcional `students.id` o `enrollments.id` |
| `service_receipts` | Recibos de servicios independientes | `service_transactions.id` |

## 13.5 Tablas de documentos

Estas tablas explican el expediente documental.

| Tabla | Que hace | Relacion principal |
| --- | --- | --- |
| `document_types` | Catalogo de documentos requeridos | Se usa para validar requisitos |
| `student_documents` | Documento cargado por estudiante | `students.id`, `document_types.id` |
| `documents` | Tabla legacy/simple de documentos | `students.id` |
| `mobile_document_upload_tokens` | Tokens para que el estudiante suba documentos desde celular | `students.id`, `users.id` en `created_by` |

## 13.6 Tablas de reservas y registros especiales

| Tabla | Que hace | Relacion principal |
| --- | --- | --- |
| `course_cycle_seat_reservations` | Cupos protegidos para proximos cursos | `course_cycles.id`, `branches.id`, `courses.id`, `instructor_profiles.id`, opcional `students.id` y `enrollments.id` |
| `referred_instructor_schedule_blocks` | Bloques reservados/asociados por referido de instructor | `enrollments.id`, `course_cycles.id`, `students.id`, `instructor_profiles.id` |
| `additional_driving_practices` | Practicas adicionales para personas con licencia | `service_transactions.id`, `students.id`, `branches.id`, `instructor_profiles.id`, `created_by` |
| `service_transactions` | Base financiera de servicios especiales | `service_catalog.id`, `branches.id`, `students.id`, `created_by`, `received_by` |

Campos operativos importantes de `course_cycle_seat_reservations`:

- `expires_at`: fecha y hora maxima de proteccion del cupo.
- `reservation_kind`: identifica la reserva temporal de inscripcion.
- `draft_data`: conserva los datos necesarios para continuar el formulario.
- `status`: diferencia una reserva activa, activada, vencida o cancelada.
- `created_by` y `cancelled_by`: permiten saber quien creo o libero el cupo.

## 13.7 Tabla de telemetria tecnica

| Tabla | Que hace | Relacion principal |
| --- | --- | --- |
| `request_resource_metrics` | Registra consumo y resultado de cada peticion relevante de la API | `users.id`, `branches.id`, opcional `students.id` y `enrollments.id`; incluye `request_id`, operacion, ruta, duracion, CPU, memoria, red y consultas BD |

## 13.8 Mapa simple de conexiones

Este es el recorrido normal de un estudiante de curso:

```text
users
  |
  | students.created_by
  v
students
  |
  | enrollments.student_id
  v
enrollments
  |              |                         |
  |              |                         |
  v              v                         v
payments     enrollment_instructor_assignments     course_cycle_schedule_assignments
  |              |                         |
  v              v                         v
payment_details instructor_profiles        course_cycles
  |
  v
receipts
```

El estudiante queda en `students`. Si tiene curso normal, se crea una matricula en `enrollments`. Desde ahi nacen los pagos, instructor asignado y horarios dentro de un ciclo.

## 13.9 Ejemplo: saber cuantos estudiantes ingreso Joselyn Vera

Para saber cuantos estudiantes fueron creados por Joselyn Vera, se consulta `students.created_by` contra `users.id`.

Consulta general:

```sql
SELECT
  u.id AS user_id,
  TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS usuario,
  COUNT(s.id) AS estudiantes_ingresados
FROM users u
LEFT JOIN students s ON s.created_by = u.id
WHERE LOWER(TRIM(CONCAT(u.first_name, ' ', u.last_name))) = LOWER('Joselyn Vera')
GROUP BY u.id, usuario;
```

Si se quiere ver el detalle de esos estudiantes:

```sql
SELECT
  s.id,
  s.identification AS cedula,
  TRIM(CONCAT(s.first_name, ' ', s.last_name)) AS estudiante,
  b.name AS sucursal,
  s.registration_type,
  s.status,
  s.created_at
FROM students s
JOIN users u ON u.id = s.created_by
LEFT JOIN branches b ON b.id = s.branch_id
WHERE LOWER(TRIM(CONCAT(u.first_name, ' ', u.last_name))) = LOWER('Joselyn Vera')
ORDER BY s.created_at DESC;
```

Si se quiere contar solo los estudiantes ingresados por Joselyn Vera en un rango de fechas:

```sql
SELECT
  COUNT(*) AS estudiantes_ingresados
FROM students s
JOIN users u ON u.id = s.created_by
WHERE LOWER(TRIM(CONCAT(u.first_name, ' ', u.last_name))) = LOWER('Joselyn Vera')
  AND s.created_at >= DATE '2026-08-24'
  AND s.created_at <  DATE '2026-09-03';
```

Nota importante: este ejemplo cuenta por fecha de registro (`students.created_at`). Si la pregunta es "cuantos empiezan clases en un rango", no se debe usar `students.created_at`; se debe mirar el ciclo o la asignacion de horario.

## 13.10 Ejemplo: estudiantes que inician clases en una fecha o rango

Para saber cuantos estudiantes pertenecen a un ciclo que inicia el 3 de septiembre de 2026:

```sql
SELECT
  cc.code AS ciclo,
  cc.start_date,
  b.name AS sucursal,
  c.name AS curso,
  COUNT(DISTINCT e.student_id) AS estudiantes
FROM enrollments e
JOIN course_cycle_schedule_assignments a ON a.enrollment_id = e.id AND a.status = 'activo'
JOIN course_cycles cc ON cc.id = a.cycle_id
JOIN branches b ON b.id = cc.branch_id
JOIN courses c ON c.id = cc.course_id
WHERE cc.start_date = DATE '2026-09-03'
GROUP BY cc.code, cc.start_date, b.name, c.name
ORDER BY b.name, c.name, cc.code;
```

Para ver los nombres:

```sql
SELECT DISTINCT
  s.identification AS cedula,
  TRIM(CONCAT(s.first_name, ' ', s.last_name)) AS estudiante,
  b.name AS sucursal,
  c.name AS curso,
  cc.code AS ciclo,
  cc.start_date,
  cc.end_date
FROM enrollments e
JOIN students s ON s.id = e.student_id
JOIN course_cycle_schedule_assignments a ON a.enrollment_id = e.id AND a.status = 'activo'
JOIN course_cycles cc ON cc.id = a.cycle_id
JOIN branches b ON b.id = cc.branch_id
JOIN courses c ON c.id = cc.course_id
WHERE cc.start_date = DATE '2026-09-03'
ORDER BY estudiante;
```

## 13.11 Ejemplo: estudiantes asignados a un instructor

Para saber cuantos estudiantes tiene Freddy Cruz asignados:

```sql
SELECT
  TRIM(CONCAT(iu.first_name, ' ', iu.last_name)) AS instructor,
  COUNT(DISTINCT e.student_id) AS estudiantes_asignados
FROM enrollment_instructor_assignments eia
JOIN instructor_profiles ip ON ip.id = eia.instructor_id
JOIN users iu ON iu.id = ip.user_id
JOIN enrollments e ON e.id = eia.enrollment_id
WHERE eia.active = TRUE
  AND LOWER(TRIM(CONCAT(iu.first_name, ' ', iu.last_name))) = LOWER('Freddy Cruz')
GROUP BY instructor;
```

Para verlo por ciclo:

```sql
SELECT
  TRIM(CONCAT(iu.first_name, ' ', iu.last_name)) AS instructor,
  cc.code AS ciclo,
  cc.start_date,
  COUNT(DISTINCT a.student_id) AS estudiantes
FROM course_cycle_schedule_assignments a
JOIN course_cycles cc ON cc.id = a.cycle_id
JOIN instructor_profiles ip ON ip.id = a.instructor_id
JOIN users iu ON iu.id = ip.user_id
WHERE a.status = 'activo'
  AND LOWER(TRIM(CONCAT(iu.first_name, ' ', iu.last_name))) = LOWER('Freddy Cruz')
GROUP BY instructor, cc.code, cc.start_date
ORDER BY cc.start_date, cc.code;
```

## 13.12 Ejemplo: pagos pendientes por estudiante

Para consultar estudiantes con saldo pendiente:

```sql
SELECT
  s.identification AS cedula,
  TRIM(CONCAT(s.first_name, ' ', s.last_name)) AS estudiante,
  b.name AS sucursal,
  c.name AS curso,
  p.final_amount,
  p.balance,
  p.status
FROM payments p
JOIN enrollments e ON e.id = p.enrollment_id
JOIN students s ON s.id = e.student_id
JOIN branches b ON b.id = e.branch_id
JOIN courses c ON c.id = e.course_id
WHERE p.status <> 'anulado'
  AND p.balance > 0
ORDER BY b.name, estudiante;
```

## 13.13 Ejemplo: renovaciones de licencia registradas

Las renovaciones y servicios especiales se apoyan en `service_transactions`. Cuando el flujo tambien crea estudiante, puede relacionarse con `students`.

```sql
SELECT
  st.customer_identification AS cedula,
  st.customer_name AS persona,
  b.name AS sucursal,
  sc.name AS servicio,
  st.amount,
  st.status,
  TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS registrado_por,
  st.created_at
FROM service_transactions st
JOIN service_catalog sc ON sc.id = st.service_id
JOIN branches b ON b.id = st.branch_id
LEFT JOIN users u ON u.id = st.created_by
WHERE sc.code ILIKE '%RENOV%'
   OR sc.name ILIKE '%renovacion%'
ORDER BY st.created_at DESC;
```

## 13.14 Ejemplo: practicas adicionales

```sql
SELECT
  s.identification AS cedula,
  TRIM(CONCAT(s.first_name, ' ', s.last_name)) AS estudiante,
  b.name AS sucursal,
  TRIM(CONCAT(iu.first_name, ' ', iu.last_name)) AS instructor,
  ap.start_date,
  ap.daily_start_time,
  ap.number_of_days,
  ap.total_amount,
  ap.status,
  TRIM(CONCAT(creator.first_name, ' ', creator.last_name)) AS registrado_por
FROM additional_driving_practices ap
JOIN students s ON s.id = ap.student_id
JOIN branches b ON b.id = ap.branch_id
JOIN instructor_profiles ip ON ip.id = ap.instructor_id
JOIN users iu ON iu.id = ip.user_id
LEFT JOIN users creator ON creator.id = ap.created_by
ORDER BY ap.start_date DESC, estudiante;
```

## 13.15 Como elegir la tabla correcta segun la pregunta

| Pregunta | Tabla principal | Campo clave |
| --- | --- | --- |
| Quien registro al estudiante | `students` | `created_by` |
| Quien modifico al estudiante | `students` | `updated_by` |
| En que sucursal esta el estudiante | `students` o `enrollments` | `branch_id` |
| Que curso tiene | `enrollments` + `courses` | `course_id` |
| Cuando inicia clases | `course_cycles` | `start_date` |
| Que horario tiene | `course_cycle_schedule_assignments` | `schedule_date`, `start_time`, `end_time` |
| Que instructor tiene | `enrollment_instructor_assignments` o `course_cycle_schedule_assignments` | `instructor_id` |
| Cuanto debe | `payments` | `balance` |
| Quien cobro | `payment_details` o `service_transactions` | usuario cajero/`received_by` |
| Que documentos faltan | `student_documents` + `document_types` | `student_id`, `document_type_id` |
| Quien hizo una accion critica | `audit_logs` | `user_id`, `action`, `entity_id` |
| Quien reservo un cupo | `course_cycle_seat_reservations` | `created_by` |
| Quien elimino una reserva | `course_cycle_seat_reservations` + `audit_logs` | `cancelled_by`, accion `TEMPORARY_ENROLLMENT_CANCELLED` |
| Que consumio una operacion | `request_resource_metrics` | `duration_ms`, `cpu_ms`, `heap_delta_bytes`, `db_query_count`, `db_duration_ms`, `request_bytes`, `response_bytes` |
| Quien registro una practica adicional | `additional_driving_practices` | `created_by` |
| Quien registro una renovacion | `service_transactions` | `created_by` |

## 14. Resumen ejecutivo

SportmancarERP esta organizado alrededor de roles, permisos y modulos reutilizables.

El archivo que une el frontend es `frontend/src/js/app.js`.

El archivo que une los menus por rol es `frontend/src/js/layouts/SidebarLayout.js`.

El archivo que une el backend es `backend/server.js`.

El archivo que protege las acciones del backend es `backend/middleware/requirePermission.js`.

Los modulos mas reutilizados son estudiantes, documentacion, horarios, cursos/ciclos, pagos, reportes, instructores, auditoria y configuracion. El Administrador del Sistema dispone adicionalmente de telemetria integral para observar el trabajo real, exportarlo y reunir evidencia antes de dimensionar el servidor.

La regla mas importante: cada rol debe ver solo lo que necesita, pero todo debe quedar conectado para que la informacion registrada una vez pueda alimentar cobros, horarios, documentos, instructores, reportes, gerencia y auditoria.
