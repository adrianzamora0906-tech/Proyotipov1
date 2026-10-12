# Rendimiento de estudiantes: primeros pasos

Fecha: 12 de octubre de 2026.

## Alcance de la medicion

Se consultaron endpoints locales y del tunel publico desde la laptop del backend, con el alcance de una cuenta activa de secretaria. No se registraron estudiantes, pagos ni ajustes financieros. Las consultas normales pueden recalcular estados operativos y generan telemetria, como al abrir las pantallas.

Se reutilizo la telemetria existente en `request_resource_metrics`. No se imprimieron tokens, nombres, cedulas ni contenido de documentos.

## Hallazgos

- La ficha basica del perfil medido devolvio 1.542 bytes; sus documentos devolvieron 15.237.018 bytes, con archivos incluidos en el JSON.
- Antes del cambio, el perfil esperaba documentos, pagos, saldo, horario e historial de forma secuencial antes de mostrar los datos personales.
- El listado descargaba por separado estudiantes de la categoria y estudiantes para los indicadores, aunque el segundo conjunto permitia obtener el primero cuando no habia filtro de estado.
- La muestra de 24 horas del backend tenia 977 consultas de listado, promedio 153,4 ms y percentil 95 de 404,4 ms. Las 37 consultas de ficha basica promediaban 17,2 ms. La muestra incluye pruebas y no equivale a usuarios concurrentes ni a una prueba de carga.
- En una pasada desde esta laptop, el JSON de documentos completo tardo 177 ms localmente y 212 ms por la URL publica. Una computadora remota con menor ancho de banda puede tardar mucho mas en recibir esos mismos 15,2 MB. Esta pasada no reproduce la red de una sucursal.
- El perfil elegido no tenia saldo de matricula disponible (endpoint de saldo 404). La prueba cubrio su comportamiento de respaldo existente; no es prueba completa de un expediente financiero regular.

## Mejoras aplicadas

- Los documentos se consultan solamente al abrir Documentacion. Se conservaron las funciones existentes de carga, vista previa, reemplazo, eliminacion y captura.
- Se evita repetir la descarga al cambiar de pestana; las cargas concurrentes comparten una promesa. Si falla la consulta, aparece Reintentar.
- Una respuesta de documentos que llegue despues de abandonar el perfil no modifica otra pantalla.
- Las consultas pequenas de pagos, saldo, horario, historial y asistencia administrativa se ejecutan en paralelo, despues de cargar la ficha y validar permisos.
- Sin filtro de estado, el listado reutiliza los datos de indicadores para obtener la categoria visible. Con filtro de estado mantiene la consulta al servidor y sus reglas existentes.
- Se actualizo la version de cache del frontend.

## Pruebas

`node scripts/diagnose-student-performance.cjs` mide respuestas y resume telemetria. Se puede seleccionar otra cuenta activa mediante `DIAGNOSTIC_USERNAME`; no modifica permisos.

`node scripts/test-student-profile-performance.cjs` comprobo:

- Perfil inicial sin consultas de documentos ni archivos incrustados.
- 459-460 ms de renderizado y montaje inicial del perfil, en vistas de 1280 y 390 px, con CPU ralentizada 4 veces, red de aproximadamente 3 Mbps y latencia de 100 ms.
- Carga diferida de documentos reales, reutilizacion, agrupacion de solicitudes y reintento tras error simulado.
- Listado con los 110 resultados regulares esperados, sin consulta duplicada y con filtro de estado conservado. Renderizado medido: 270 ms sin limitacion de red.

Estos tiempos excluyen la descarga inicial de los modulos y no utilizan el layout completo: la prueba aisla la vista mediante un layout minimo. No son tiempos garantizados para Netlify ni para computadoras remotas. No se probaron escrituras reales de documentos en esta tarea.

## Siguientes mediciones y mejoras

- Medir una computadora afectada, incluyendo descarga de modulos, layout, red de la sucursal y tiempos de cada solicitud.
- El listado todavia prepara un formulario de registro oculto que consulta opciones de cursos y teoria. Evaluar su carga bajo demanda, verificando registro, edicion y activacion de reservas antes de modificarlo.
- Implementar paginacion de servidor y resumen agregado sin alterar alcance por canton/sucursal, filtros, tipos de registro ni indicadores.
- Separar metadatos de documentos de su contenido, con descarga del archivo solo al visualizarlo y con autorizacion del backend.
- Revisar planes e indices de las consultas mas lentas con muestras representativas. No se cambiaron indices ni reglas de pago en estos primeros pasos.
- Publicar el frontend actualizado en Netlify para llevar estas mejoras a las demas computadoras.
