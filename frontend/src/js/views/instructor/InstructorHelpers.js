export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatDateTime(value) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' });
}

export function formatTime(value) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
}

export function badgeClass(status) {
  const map = {
    PROGRAMADA: 'badge-info',
    PROXIMA: 'badge-warning',
    EN_CURSO: 'badge-primary',
    COMPLETADA: 'badge-success',
    AUSENTE: 'badge-danger',
    CANCELADA: 'badge-danger',
    REPROGRAMADA: 'badge-warning',
    ABIERTA: 'badge-warning',
    EN_REVISION: 'badge-info',
    RESUELTA: 'badge-success',
    CERRADA: 'badge-primary',
    DESCARTADA: 'badge-danger',
    APROBADO: 'badge-success',
    REPROBADO: 'badge-danger',
    RECUPERACION: 'badge-warning',
  };
  return map[status] || 'badge-primary';
}

export function stateMessage(error) {
  if (!error) return '';
  if (error.status === 401) return 'Tu sesion expiro. Inicia sesion nuevamente.';
  if (error.status === 403) return 'No tienes permiso para ver esta informacion.';
  if (error.status === 404) return 'Registro no encontrado.';
  if (error.status === 409) return error.data?.error?.message || error.message || 'Existe un conflicto con el estado actual.';
  return 'No se pudo cargar la informacion. Intenta nuevamente.';
}
