# Medicion de recursos por estudiante

Implementacion: 12 de octubre de 2026.

## Acceso y alcance

Administrador del Sistema > Recursos. El monitor y su Excel siguen siendo exclusivos del rol ADMIN_SYSTEM, con sus permisos existentes de auditoria y exportacion.

Se incorporo busqueda de estudiante por nombre o cedula, con filtros de sucursal y periodo. La seleccion muestra el almacenamiento logico actual del expediente y sus operaciones medidas. Sin seleccion se muestran las etapas de todas las operaciones de estudiantes del periodo.

## Medicion de cada operacion

Se aprovecha `request_resource_metrics`; no se agregaron tablas ni se modificaron matriculas, precios o pagos.

- Etapas: registro, buscar, listado, abrir perfil, revisar edicion, actualizar, eliminar, documentos, pagos/saldo, horario/clases, historial y reservas.
- Por etapa: operaciones, errores, tiempo promedio y P95, CPU observada, cantidad y tiempo de consultas de base de datos, cambio de heap promedio/minimo/maximo y bytes acumulados de entrada/salida.
- La duracion y la memoria se capturan al finalizar la respuesta, antes de enriquecer y guardar la telemetria.
- El middleware se ejecuta antes de los parsers JSON/formulario para incluir recepcion y procesamiento del cuerpo. Cuenta sus bytes recibidos sin guardar el contenido.
- Las consultas de negocio se cuentan por solicitud mediante AsyncLocalStorage. La consulta de vinculacion y el guardado de telemetria posteriores no inflan esos contadores.
- Se corrige la identidad: un ID de pago, documento o cuenta no se interpreta como ID del estudiante. Se valida el estudiante y se usa su sucursal de registro para la vinculacion.
- Las busquedas con un solo resultado se vinculan a ese estudiante. Si hay varios resultados o ninguno, no se asigna el consumo a una persona arbitraria.
- Tambien se distingue la busqueda del filtro del listado (`/students?search=...`) del listado sin busqueda.
- Los tokens de captura movil se ocultan en las rutas nuevas almacenadas en telemetria.
- Al guardarse una medicion se emite un aviso WebSocket de recursos. Solo la ruta del monitor reacciona a avisos exclusivamente de recursos, evitando refrescos de estudiantes o ciclos de consultas del propio monitor.

## Almacenamiento

La estimacion suma bytes de representacion JSON de registros/metadatos y el contenido data-URL guardado en los documentos, sin descargar archivos al navegador.

Incluye ficha, matriculas, cuenta, asignaciones, historial, telemetria vinculada, sesiones de la cuenta, auditoria asociada al estudiante, practicas adicionales, servicios, asignaciones de instructor, clases, pagos, abonos y documentos.

El contenido repetido en varias filas se cuenta en cada fila. Las URL o rutas externas se cuentan como metadatos; su archivo no se considera medido. El panel informa cuantos archivos externos quedan sin medir.

Esta cifra es una **estimacion logica de las tablas incluidas**, no espacio fisico exacto del disco. No reparte indices, TOAST/compresion, paginas compartidas, WAL, archivos externos ni copias de seguridad por estudiante. No es una fotografia del incremento de almacenamiento causado por cada operacion pasada.

## Interpretacion correcta

- CPU y heap son observaciones del proceso Node compartido durante la solicitud, no consumo exclusivo de ese estudiante. Un cambio de heap negativo puede deberse al recolector de basura.
- Los bytes de red representan cuerpos de solicitudes/respuestas, no cabeceras, TLS ni todos los recursos descargados por el navegador.
- El costo se mide por peticion al backend; un registro completo puede incluir varias peticiones de documentos, horarios o pagos. Las consultas previas a crear una identidad de estudiante no se atribuyen retroactivamente a ese estudiante.
- Las filas anteriores conservan su metodologia original. No se inventan vinculos, tamanos ni mediciones historicas. Las etapas sin muestras muestran Sin medicion.
- Las solicitudes que no terminan con una respuesta finalizada no estan cubiertas por este registrador. Los errores HTTP finalizados si se registran.
- Una busqueda compartida no aparece en el detalle de una persona; se consulta en la vista global.
- El almacenamiento es actual y separado del filtro temporal de operaciones. La recomendacion de compra se oculta al seleccionar un estudiante para no extrapolar capacidad global desde una sola persona.

## Excel

Se conservan las hojas existentes y se agregan `Etapas del estudiante` y `Almacenamiento logico`. La exportacion respeta sucursal, periodo y estudiante seleccionados.

## Validacion realizada

- `node scripts/test-student-resource-telemetry.cjs`: 13 formas de operacion simuladas, vinculacion correcta, privacidad y ocultacion de tokens, contadores de consultas, bytes recibidos y limites de tiempo.
- `node scripts/test-student-resource-monitor.cjs`: acceso real por API, rechazo de secretaria, filtros, almacenamiento, Excel y WebSocket; lecturas reales de perfil, historial, horario y busqueda; UI a 1280 y 390 px con capturas y sin desbordamiento horizontal.
- La prueba de recepcion envia un cuerpo de unos 64 KB sin campos de matricula y comprueba su rechazo 422 y sus bytes medidos; no crea estudiantes.
- Se observaron datos historicos reales de una inscripcion: 458 ms y 52 consultas. Es una sola muestra, no una garantia de rendimiento ni una prueba de carga.
- No se ejecutaron nuevos registros, actualizaciones ni eliminaciones de expedientes reales para probarlos. Su instrumentacion se verifico con escenarios simulados y recogera las proximas operaciones normales.

El backend local fue reiniciado para activar la medicion. Falta publicar el frontend actualizado en Netlify para utilizar el panel nuevo desde otras computadoras. Los archivos modificados y nuevos bajo `backend/` pueden estar ignorados por Git y deben incluirse expresamente al preparar el commit.
