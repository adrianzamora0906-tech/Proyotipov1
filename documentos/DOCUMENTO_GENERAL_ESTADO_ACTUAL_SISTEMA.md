# SportmancarERP — Documento general del sistema actual

## 1. Propósito del sistema

SportmancarERP es un sistema de gestión para una escuela de conducción con varias sucursales. Su objetivo principal es centralizar la operación diaria, la administración, el control académico, el seguimiento financiero, la generación de reportes y la documentación oficial enviada a entidades externas como la ATM.

El sistema está pensado para que cada usuario vea únicamente lo que necesita según su responsabilidad. No todos administran, no todos cobran y no todos consultan información global.

## 2. Cómo funciona en términos generales

El sistema trabaja alrededor de estos elementos principales:

- Sucursales.
- Usuarios internos.
- Estudiantes.
- Cursos y ciclos.
- Horarios.
- Instructores.
- Pagos.
- Documentos del estudiante.
- Reportes.
- Auditoría.
- Oficios ATM.

Cuando una persona se registra como estudiante, esa información puede usarse después en documentación, pagos, asignación de horarios, reportes, control de instructores y generación de permisos. La idea es evitar registrar lo mismo varias veces.

## 3. Roles principales

### Gerente General

Consulta la situación global de la empresa. Puede revisar ingresos, matrículas, saldos pendientes, rendimiento por sucursal, actividad académica, reportes y auditoría.

No está pensado para registrar estudiantes ni modificar la operación diaria. Su objetivo es analizar y tomar decisiones.

### Administrador del Sistema

Configura el sistema a nivel general. Administra sucursales, usuarios, accesos, permisos, cursos disponibles, métodos de pago, reportes, auditoría y documentos institucionales.

También puede bloquear o desbloquear usuarios, revisar sesiones y controlar permisos especiales.

### Administrador de Sucursal

Supervisa la operación de una sede o de las sucursales permitidas dentro de su alcance. Puede revisar estudiantes, personal, accesos, reportes, pagos, horarios y actividad local.

Tiene menos permisos que el Administrador del Sistema, pero más control operativo que Secretaría o Caja.

### Secretaría

Registra estudiantes, actualiza datos, adjunta documentos, asigna horarios y puede iniciar procesos de matrícula. También puede registrar personas para prácticas adicionales cuando ya tienen licencia.

### Caja

Gestiona pagos, comprobantes, saldos pendientes y confirmaciones de pago. Sus movimientos quedan ligados al usuario que los realiza.

### Instructor

Consulta su agenda, estudiantes asignados, clases programadas, asistencias, seguimiento académico y actividad del mes.

## 4. Módulos actuales del sistema

## 4.1 Inicio de sesión y control de acceso

Permite ingresar al sistema con usuario y contraseña. Según el rol, se muestra un menú diferente.

Actualmente contempla:

- Sesión por usuario.
- Menú personalizado.
- Bloqueo y desbloqueo de cuentas.
- Revocación de sesiones.
- Control de permisos por usuario.
- Ocultamiento de información sensible para usuarios que no sean Administrador del Sistema.

## 4.2 Sucursales

Permite administrar y consultar la información de cada sede.

Incluye:

- Datos generales de la sucursal.
- Estado activa/inactiva.
- Personal asignado.
- Administrador de sucursal.
- Configuración de cursos.
- Configuración operativa.
- Métodos de pago permitidos por sucursal.
- Comparación entre sucursales para Gerencia.

En el perfil gerencial, este módulo permite comparar resultados por sucursal, cantón o provincia.

## 4.3 Personal y accesos

Permite gestionar usuarios internos.

Incluye:

- Nombre.
- Correo.
- Usuario.
- Rol.
- Estado.
- Último acceso.
- Permisos.
- Sesiones activas.
- Bloqueo o desbloqueo.
- Restablecimiento de acceso.
- Edición de datos del perfil.

Los permisos pueden afectar el menú visible del usuario. Por ejemplo, si una persona no tiene permisos de pagos, no debe ver opciones relacionadas con cobros.

## 4.4 Estudiantes

Permite registrar y consultar estudiantes.

Incluye:

- Datos personales.
- Cédula.
- Teléfono.
- Correo.
- Dirección.
- Tipo de sangre.
- Curso.
- Sucursal.
- Instructor.
- Estado del estudiante.
- Persona que lo registró.
- Filtros por sucursal, estado, provincia, cantón y tipo de curso.

El estado del estudiante no debe ser un texto manual, sino un resultado del proceso. Por ejemplo:

- Pendiente de documentación.
- Pendiente de pago.
- Pago parcial.
- Pago confirmado.
- Matriculado.
- En curso.
- Finalizado.

También se contempla que una secretaria pueda crear un estudiante para otra sucursal y luego seguir viendo el detalle si fue creado por ella.

## 4.5 Documentación

Controla los documentos entregados por estudiante.

Actualmente se maneja por estudiante, no por cantidad individual de documentos, para evitar inflar los conteos.

Incluye:

- Estudiantes con documentos completos.
- Estudiantes con documentos pendientes.
- Filtros por documento, curso y sucursal.
- Paginación.
- Botón para ver documentos cuando ya están subidos.
- Botón para subir documento cuando falta.
- Captura desde teléfono mediante QR.
- Conversión de fotos a PDF.

Documentos considerados:

- Cédula.
- Carnet o documento requerido según el proceso.
- Certificado de estudio.
- Licencia, cuando se trata de prácticas adicionales.

## 4.6 Horarios

Permite asignar horarios prácticos y teóricos.

Incluye:

- Horarios normales.
- Horarios intensivos.
- Horario rotativo.
- Posibilidad de escoger hasta dos bloques seguidos por día en ciertos casos.
- Control para no alternar días de forma incoherente.
- Horarios teóricos presenciales o virtuales.
- Validación de disponibilidad del instructor.

En prácticas adicionales, el horario funciona diferente: se elige un instructor, una hora diaria específica, fecha de inicio y duración.

## 4.7 Cursos y ciclos

Administra la oferta académica.

Cursos principales:

- Clase A — Moto.
- Clase B — Automóvil.

También se contemplan:

- Prácticas adicionales para personas con licencia.
- Servicios independientes.
- Exámenes psicosensométricos.
- Recuperaciones.

Los ciclos tienen código, fecha de inicio, fecha de fin, capacidad, instructores y estudiantes. El sistema permite consultar ciclos vigentes, próximos y finalizados.

También se configuró una lógica de nombres de ciclo basada en el patrón institucional, por ejemplo:

- SP_IC para automóvil.
- SP_IM para moto.
- Sufijo según sucursal.
- Secuencia del curso.
- Año.

## 4.8 Pagos y financiero

Gestiona cobros y saldos.

Incluye:

- Pagos completos.
- Pagos parciales.
- Saldos pendientes.
- Métodos de pago: efectivo, tarjeta y transferencia.
- Métodos habilitados por sucursal.
- Anulación de pagos.
- Registro del usuario que cobró.
- Reportes financieros por fecha, sucursal, provincia, cantón y curso.

El flujo de transferencias tiene dos revisiones desde el 9 de octubre de 2026:

- Gema (`spic2_gema.obregon`) confirma con `TRANSFER_VERIFY`: pasa de `PENDING` a `AWAITING_APPROVAL`, sin aplicar el abono.
- Yuny (`spic_yuny.garcia`) aprueba con `TRANSFER_APPROVE`: aplica el pago y pasa a `CONFIRMED`. Este permiso permite revisar transferencias de todas las sucursales y se administra desde el catalogo de permisos.
- Ambas etapas pueden rechazar. La misma persona no puede confirmar y aprobar una transferencia.
- Se conservan responsables, fechas, notas y auditoria de cada etapa. Las transferencias verificadas y aplicadas antes de este cambio muestran la aprobacion pendiente de Yuny: aprobarlas registra su revision sin repetir el abono. Su rechazo financiero requiere el flujo de anulacion existente.
- Los importes por confirmar o por aprobar se muestran como pendientes y se descuentan del importe disponible para cobrar, pero no del saldo real hasta la aprobacion.

Los precios configurados en el prototipo incluyen:

- Curso de automóvil: $190.
- Curso de moto: $125.
- Psicosensométrico: $16.
- Prácticas adicionales: valores según duración y condición del estudiante.

## 4.9 Reportes

Permite consultar información operativa, académica y financiera.

Incluye:

- Reportes por fecha.
- Reportes por sucursal.
- Reportes por provincia y cantón.
- Reportes por tipo de curso.
- Matriculados hoy.
- Matrículas del periodo.
- Ciclos.
- Instructores.
- Ingresos cobrados.
- Servicios.
- Exportación a Excel con plantilla institucional.
- Consulta rápida tipo asistente para preguntas frecuentes del negocio.

Los reportes se actualizan con filtros dinámicos, sin depender siempre de un botón de generar.

## 4.10 Gerencia General

El gerente tiene una vista consolidada.

Incluye:

- Resumen ejecutivo.
- Ingresos cobrados.
- Saldo pendiente.
- Participantes confirmados.
- Matrículas.
- Servicios.
- Distribución de ingresos.
- Comparación por sucursal.
- Comparación por provincia.
- Rendimiento financiero.
- Operación académica.
- Actividad de instructores.
- Auditoría gerencial.

También se empezó a adaptar la experiencia para que pueda visualizarse mejor desde teléfono, como una aplicación móvil.

## 4.11 Instructores

El instructor puede revisar su propia operación.

Incluye:

- Agenda del día.
- Clases programadas.
- Asistencias pendientes.
- Evaluaciones pendientes.
- Estudiantes asignados.
- Estudiantes atendidos en el mes.
- Próximos estudiantes.
- Estudiantes en clase.
- Estudiantes que ya recibieron clase.
- Historial.

La información busca responder rápidamente qué debe hacer el instructor durante el día.

## 4.12 Auditoría

Permite saber qué ocurrió dentro del sistema.

Incluye:

- Actividad general.
- Acciones importantes.
- Movimientos financieros.
- Anulaciones.
- Correcciones.
- Usuario que solicitó.
- Usuario que aprobó.
- Fecha y hora.
- Resultado.
- Sucursal.
- Nivel de importancia.

Ejemplo: si Secretaría solicita anular un pago y el Administrador de Sucursal lo aprueba, el gerente debe ver ambas personas en auditoría.

## 4.13 Autorizaciones ATM

Permite generar documentos oficiales para la ATM usando plantillas Word institucionales.

Actualmente contempla dos tipos:

### Oficio de autorización

Documento usado para comunicar autorización de matrícula e inicio de clases. Puede incluir varios cursos en el mismo oficio.

Incluye:

- Tipo de curso.
- Inicio y fin de inscripción.
- Inicio y fin del curso.
- Comprobante de depósito.
- Varias tablas, una por curso.
- Generación de Word desde plantilla.

### Oficio de permiso de conducción

Documento usado para solicitar permisos de conducción. Se basa en ciclos próximos y estudiantes con pago completo.

Incluye:

- Selección de sucursal.
- Tipo de curso.
- Selección de uno o varios ciclos.
- Fecha de inicio y fin automática según los ciclos.
- Cantidad total de estudiantes pagados.
- Número de autorización ANT.
- Comprobante.
- Banco.
- Generación de Word.
- Generación de nómina Excel consolidada.

Si varios cursos inician en fechas cercanas, el sistema permite agruparlos en una sola solicitud.

## 5. Funcionamiento por alcance

El sistema diferencia los accesos según el rol:

- El Administrador del Sistema puede ver y configurar globalmente.
- El Gerente General puede consultar globalmente.
- El Administrador de Sucursal puede ver su alcance autorizado.
- Secretaría y Caja trabajan principalmente sobre su sucursal, aunque pueden registrar para otra sucursal si el proceso lo requiere.
- El Instructor ve su propia agenda y estudiantes asignados.

## 6. Elementos importantes ya definidos

### Filtros dinámicos

Los filtros se han ido estandarizando para que las tablas cambien automáticamente al seleccionar provincia, cantón, sucursal, tipo de curso, estado o fecha.

### Reportes exportables

Los reportes no solo muestran información en pantalla. También pueden exportarse en Excel con encabezado institucional.

### Trazabilidad

Las acciones importantes deben quedar asociadas a un usuario. Esto permite responder preguntas como:

- ¿Quién registró este estudiante?
- ¿Quién cobró?
- ¿Quién anuló?
- ¿Quién aprobó?
- ¿Qué instructor atendió?
- ¿Qué sucursal generó el ingreso?

### Configuración por sucursal

Cada sucursal puede tener diferencias operativas, por ejemplo métodos de pago permitidos, cursos habilitados o personal asignado.

## 7. Estado actual del prototipo

El sistema ya cuenta con una estructura amplia de módulos y flujos principales. Está funcionando como prototipo avanzado, con datos de prueba, reglas de negocio simuladas y pantallas funcionales para validar cómo trabajaría la empresa.

Todavía pueden existir ajustes visuales, validaciones específicas y mejoras de rendimiento, pero la lógica principal del negocio ya está representada.

## 8. Mejoras futuras recomendadas

- Convertir la vista de Gerencia en una aplicación móvil formal o una interfaz PWA.
- Mejorar el asistente de reportes para responder preguntas más abiertas.
- Completar reglas automáticas de estados del estudiante.
- Fortalecer el flujo de aprobaciones para anulaciones y correcciones.
- Agregar notificaciones internas.
- Mejorar control de disponibilidad de instructores.
- Crear panel específico de prácticas adicionales.
- Integrar firma digital o control de documentos oficiales.
- Implementar auditoría más detallada para cambios de permisos.
- Optimizar carga de páginas con muchos datos.
- Crear perfil del estudiante en una siguiente etapa.

## 9. Conclusión

Recursos por estudiante, 12 de octubre de 2026: el Administrador del Sistema puede filtrar el monitor por estudiante y ver etapas de registro, busqueda, perfil, actualizacion, documentos, pagos, horarios e historial, junto con almacenamiento logico del expediente y exportacion Excel. CPU/memoria son observaciones del proceso compartido, no recursos exclusivos. Alcance y validaciones: [Medicion de recursos por estudiante](05_SISTEMA_GENERAL/MEDICION_RECURSOS_POR_ESTUDIANTE.md).

Primeros pasos de rendimiento del 12 de octubre de 2026: el perfil carga documentos al abrir su pestana y consulta sus datos pequenos en paralelo; el listado evita una consulta duplicada cuando no hay filtro de estado. Medicion, pruebas y limites: [Diagnostico de rendimiento de estudiantes](05_SISTEMA_GENERAL/DIAGNOSTICO_RENDIMIENTO_ESTUDIANTES.md).

Actualizacion del 12 de octubre de 2026: se incorporo WebSocket para avisar cambios confirmados y actualizar las pantallas sin consultas periodicas. Conserva los permisos de la API y pospone los refrescos si hay formularios sin guardar. La activacion en todas las computadoras requiere publicar el frontend actualizado. Detalles y pruebas: [Actualizacion WebSocket](05_SISTEMA_GENERAL/ACTUALIZACION_WEBSOCKET.md).

SportmancarERP, en su estado actual, ya no es solo una pantalla de registro. Es un sistema integral que conecta operación, administración, finanzas, academia, documentación y gerencia.

La base funcional está orientada a que la empresa pueda saber qué se hizo, quién lo hizo, cuánto se cobró, qué estudiante está en proceso, qué instructor trabajó, qué sucursal rinde mejor y qué documentos oficiales deben generarse.
