# Tareas pendientes - SportmancarERP

Actualizado: 12 de octubre de 2026.

Este archivo registra pendientes acordados. Las tareas declaradas completas no se reabren aqui.

## 1. Cambio de curso con ajuste financiero y aprobacion del gerente

Estado: pendiente de definir detalles e implementar. Continuacion de la tarea 6 (edicion del estudiante).

- Permitir cambiar de curso desde la edicion, conservando el expediente, los pagos y la trazabilidad; no crear una matricula duplicada.
- Calcular el saldo usando el precio del nuevo curso y los pagos confirmados del estudiante.
- Si el nuevo curso es mas caro, cobrar el saldo correspondiente.
- Si el nuevo curso es mas barato y lo pagado no supera su valor, conservar los abonos y cobrar solamente el saldo. No generar una devolucion.
- Si lo pagado supera el nuevo valor, solicitar aprobacion del gerente antes de aplicar el ajuste financiero.
- Para el caso comentado de carro a moto, considerar dos escenarios sujetos a aprobacion: devolver la diferencia o aplicar un nuevo psicometrico.
- Ejemplos conversados: carro $190, moto $125; diferencia $65. Con nuevo psicometrico de $25, el nuevo total seria $150.
- Confirmar que ocurre con los $40 restantes si se pagaron $190 y se aprueba un total de $150. No asumir una devolucion, retencion ni saldo a favor.
- Registrar quien solicito, quien aprobo, fecha, valores antes/despues y motivo. Caja ejecuta el ajuste autorizado.
- Mostrar un resumen de cambios y solicitar confirmacion antes de guardar.

Antes de implementar: confirmar precios vigentes, tratamiento de excedentes con pagos parciales y permisos especificos de aprobacion del gerente. La referencia de $100 abonados y $25 restantes corresponde a un total de $125; confirmar el sentido del cambio de curso mencionado.

## 2. Publicacion y validacion final de WebSocket

Estado: implementado y probado localmente; pendiente de publicacion del frontend y validacion operativa.

- Publicar el frontend actualizado en Netlify.
- Confirmar que las computadoras de las sucursales cargan la nueva version y conectan por WSS.
- Probar cambios reales entre perfiles y sucursales, respetando permisos y sin perder formularios abiertos.
- Medir consultas, memoria y conexiones bajo carga antes de incorporar mas sucursales. Las pruebas actuales no son una prueba de capacidad.
- Al preparar el commit, incluir explicitamente los archivos necesarios del backend ignorados por Git y revisar el alcance de los cambios.

Ya verificado: backend activo con `realtime: true`, conexion WSS por el tunel publico, dos sesiones de navegador, reconexion y proteccion de formularios. No se publico Netlify ni se hizo commit en esa tarea.

Referencia tecnica: [Actualizacion WebSocket](05_SISTEMA_GENERAL/ACTUALIZACION_WEBSOCKET.md).

## 3. Separar curso, psicometrico y libros en matriculas y gerencia

Estado: pendiente de definir e implementar. No modificar cobros existentes por ahora.

- Mantener los totales confirmados: carro $190 y moto $125.
- Desglosar los $25 ya incluidos: $10 de psicometrico y $15 de libros. No cobrarlos nuevamente como adicionales.
- Mostrar los componentes del precio: carro $165 de curso + $10 de psicometrico + $15 de libros; moto $100 de curso + $10 de psicometrico + $15 de libros.
- Distinguir en gerencia los psicometricos incluidos en matriculas de los vendidos como servicio independiente, mostrando cantidades e ingresos por separado.
- Diferenciar un psicometrico incluido o cobrado de uno efectivamente realizado. Definir el registro de realizacion y evitar conteos duplicados.
- Conservar filtros por fecha y sucursal y la trazabilidad de registros y ajustes.
- Definir como distribuir pagos parciales entre componentes y como tratar los registros historicos, sin asumir que todos los matriculados ya realizaron el examen.
- Revisar junto con la tarea 1 la tarifa y los conceptos de un nuevo psicometrico por cambio de curso: el escenario previo de $25 debe confirmarse frente al desglose de $10 de psicometrico y $15 de libros.

Situacion revisada: el contador actual de gerencia consulta servicios independientes; no incluye automaticamente los psicometricos de las matriculas.

## 4. Mejorar el cierre automatico de clases practicas

Estado: pendiente de revisar y mejorar. No cambiar las reglas actuales sin definir el comportamiento esperado.

- Investigar por que algunas clases permanecen EN_CURSO despues del horario previsto.
- Revisar las condiciones actuales: entrada QR registrada, margen de 30 minutos y ausencia de salida QR.
- Definir el tratamiento de clases iniciadas sin entrada QR, reinicios del backend y cierres pendientes mientras el servidor estuvo apagado.
- Conservar trazabilidad y distinguir salida real, cierre automatico y cierre administrativo; no inventar una marcacion QR.
- Validar que no se cierren clases antes de tiempo ni se modifiquen clases futuras, canceladas o eliminadas.

Caso de referencia: el 12 de octubre de 2026 se cerro administrativamente la clase de la estudiante con cedula 2450130154, horario 12:00-13:40, que permanecia EN_CURSO. La causa de la falta de cierre automatico aun no se ha investigado.
