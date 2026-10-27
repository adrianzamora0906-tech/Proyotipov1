export function renderFormationCounts(counts={}) {
  return `<section data-monthly-students aria-label="Alumnos de este mes"><h3>Alumnos de este mes</h3><div class="instructor-students-summary">${[['normal','Formación normal'],['intensive','Formación intensiva'],['additional','Horas prácticas adicionales']].map(([key,label])=>`<span class="matriculated">${label}: <strong>${Number(counts[key])||0}</strong></span>`).join('')}</div><p class="text-sm text-gray-500">Solo examen se incluye en formación intensiva.</p></section>`;
}

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
  return new Date(value).toLocaleString('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Guayaquil',
  });
}

export function formatTime(value) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleTimeString('es-EC', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Guayaquil',
  });
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
  if ([400, 409, 422].includes(error.status)) {
    return error.data?.error?.message || error.message || 'Revisa los datos ingresados e intenta nuevamente.';
  }
  if (error.code === 'REQUEST_TIMEOUT') return error.message || 'El servidor tardo demasiado en responder. Intenta nuevamente.';
  return 'No se pudo cargar la informacion. Intenta nuevamente.';
}
