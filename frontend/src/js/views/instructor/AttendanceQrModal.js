import PracticalSessionService from '../../services/practicalSessionService.js';

export async function openAttendanceQrModal(sessionId, onConfirmed, phase = 'ENTRY') {
  const isExit = phase === 'EXIT';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active attendance-qr-overlay';
  overlay.innerHTML = `
    <div class="modal attendance-qr-modal">
      <div class="modal-header">
        <div><h3 class="modal-title">${isExit ? 'Registrar salida' : 'Registrar entrada'}</h3><p class="card-subtitle">QR seguro que cambia cada 10 segundos</p></div>
        <button type="button" class="modal-close" data-close-attendance>&times;</button>
      </div>
      <div class="modal-body attendance-qr-body">
        <div class="instructor-empty" data-attendance-loading>Preparando validacion segura...</div>
        <img class="attendance-qr-image" data-attendance-qr hidden alt="Codigo QR temporal para asistencia">
        <strong data-attendance-title hidden>QR de un solo uso</strong>
        <p data-attendance-help hidden>El estudiante debe escanear el codigo vigente desde su propia sesion para registrar ${isExit ? 'su salida' : 'su entrada'}.</p>
        <div class="attendance-countdown" data-attendance-countdown hidden>Cambia en <strong data-attendance-seconds>10</strong> segundos</div>
        <div class="attendance-waiting" data-attendance-status>Generando codigo...</div>
      </div>
      <div class="modal-footer"><button type="button" class="btn btn-secondary" data-close-attendance>Cancelar</button></div>
    </div>`;
  document.body.appendChild(overlay);

  let pollTimer = null;
  let countdownTimer = null;
  let rotationTimer = null;
  let closed = false;
  let refreshing = false;
  const clearTimers = () => {
    if (pollTimer) window.clearInterval(pollTimer);
    if (countdownTimer) window.clearInterval(countdownTimer);
    if (rotationTimer) window.clearTimeout(rotationTimer);
    pollTimer = countdownTimer = rotationTimer = null;
  };
  const close = () => {
    closed = true;
    clearTimers();
    overlay.remove();
  };
  overlay.querySelectorAll('[data-close-attendance]').forEach(button => button.addEventListener('click', close));

  const refreshChallenge = async () => {
    if (closed || refreshing) return;
    refreshing = true;
    try {
      const response = await PracticalSessionService.createAttendanceQr(sessionId, phase);
      if (closed) return;
      const challenge = response.data;
      if (challenge.alreadyConfirmed) {
        close();
        onConfirmed?.();
        return;
      }
      const localOrigin = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      const attendanceUrl = localOrigin && challenge.localAttendanceUrl
        ? challenge.localAttendanceUrl
        : `${window.location.origin}/attendance.html?token=${encodeURIComponent(challenge.token)}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=12&data=${encodeURIComponent(attendanceUrl)}`;
      const image = overlay.querySelector('[data-attendance-qr]');
      image.src = qrUrl;
      image.hidden = false;
      overlay.querySelector('[data-attendance-loading]')?.remove();
      overlay.querySelector('[data-attendance-title]').hidden = false;
      overlay.querySelector('[data-attendance-help]').hidden = false;
      overlay.querySelector('[data-attendance-countdown]').hidden = false;
      const status = overlay.querySelector('[data-attendance-status]');
      status.className = 'attendance-waiting';
      status.textContent = 'Esperando al estudiante...';
      let seconds = Number(challenge.expiresInSeconds) || 10;
      overlay.querySelector('[data-attendance-seconds]').textContent = seconds;
      if (countdownTimer) window.clearInterval(countdownTimer);
      countdownTimer = window.setInterval(() => {
        seconds = Math.max(seconds - 1, 0);
        const target = overlay.querySelector('[data-attendance-seconds]');
        if (target) target.textContent = seconds;
      }, 1000);
      if (rotationTimer) window.clearTimeout(rotationTimer);
      rotationTimer = window.setTimeout(refreshChallenge, (Number(challenge.expiresInSeconds) || 10) * 1000);
    } catch (error) {
      const status = overlay.querySelector('[data-attendance-status]');
      if (status) {
        status.className = 'attendance-waiting attendance-expired';
        status.textContent = error.message || 'No se pudo renovar el QR. Reintentando...';
      }
      rotationTimer = window.setTimeout(refreshChallenge, 2000);
    } finally {
      refreshing = false;
    }
  };

  pollTimer = window.setInterval(async () => {
    if (closed) return;
    try {
      const response = await PracticalSessionService.getAttendanceQrStatus(sessionId, phase);
      const confirmed = isExit ? response.data.exitConfirmed : response.data.started;
      if (!confirmed) return;
      clearTimers();
      const status = overlay.querySelector('[data-attendance-status]');
      if (status) {
        status.className = 'attendance-waiting attendance-success';
        status.textContent = isExit
          ? 'Salida registrada correctamente.'
          : 'Entrada registrada. La clase ha iniciado.';
      }
      window.setTimeout(() => {
        if (!closed) {
          close();
          onConfirmed?.();
        }
      }, 1200);
    } catch (error) {
      const status = overlay.querySelector('[data-attendance-status]');
      if (status) status.textContent = error.message || 'No se pudo consultar la asistencia.';
    }
  }, 1500);

  if (isExit) {
    try {
      const current = await PracticalSessionService.getAttendanceQrStatus(sessionId, phase);
      if (current.data.exitConfirmed) {
        close();
        onConfirmed?.();
        return;
      }
    } catch (_) {
      // El generador mostrará el error operativo correspondiente.
    }
  }
  await refreshChallenge();
}
