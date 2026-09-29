import '../../lib/qrcode.browser.js';
import PracticalSessionService from '../../services/practicalSessionService.js';

function generateQrDataUrl(value) {
  return new Promise((resolve, reject) => {
    if (!window.QRCode) return reject(new Error('El generador QR local no está disponible'));
    window.QRCode.toDataURL(value, { width: 280, margin: 12 }, (error, url) => {
      if (error) return reject(error);
      resolve(url);
    });
  });
}

function isNetworkError(error) {
  return !navigator.onLine || /Failed to fetch|NetworkError|No se pudo conectar|conexi/i.test(String(error?.message || ''));
}

function encodeOfflinePayload(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function openAttendanceQrModal(sessionId, onConfirmed, phase = 'ENTRY') {
  const isExit = phase === 'EXIT';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active attendance-qr-overlay';
  overlay.innerHTML = `
    <div class="modal attendance-qr-modal">
      <div class="modal-header">
        <div><h3 class="modal-title">${isExit ? 'Registrar salida' : 'Registrar entrada'}</h3><p class="card-subtitle">QR y codigo seguro que cambian cada 10 segundos</p></div>
        <button type="button" class="modal-close" data-close-attendance>&times;</button>
      </div>
      <div class="modal-body attendance-qr-body">
        <div class="instructor-empty" data-attendance-loading>Preparando validacion segura...</div>
        <img class="attendance-qr-image" data-attendance-qr hidden alt="Codigo QR temporal para asistencia">
        <strong data-attendance-title hidden>QR de un solo uso</strong>
        <p data-attendance-help hidden>El estudiante debe escanear el codigo vigente desde su propia sesion para registrar ${isExit ? 'su salida' : 'su entrada'}.</p>
        <div class="attendance-countdown" data-attendance-countdown hidden>Cambia en <strong data-attendance-seconds>10</strong> segundos</div>
        <div class="attendance-code-fallback" data-attendance-code hidden>
          <span>Si tu navegador no permite la camara, el estudiante puede escribir este codigo:</span>
          <strong data-attendance-numeric-code>000000</strong>
        </div>
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
  let mileageFormVisible = false;
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

  const showMileageForm = () => {
    if (closed || isExit || mileageFormVisible) return;
    mileageFormVisible = true;
    clearTimers();
    const body = overlay.querySelector('.attendance-qr-body');
    body.innerHTML = `
      <div class="attendance-waiting attendance-success">Entrada confirmada por el estudiante.</div>
      <strong>Registrar kilometraje inicial</strong>
      <p>Ingresa el kilometraje que marca el vehiculo antes de iniciar la practica.</p>
      <form data-start-mileage-form>
        <label for="start-mileage">Kilometraje inicial</label>
        <input id="start-mileage" name="startMileage" type="text" inputmode="numeric"
          pattern="[0-9]+" maxlength="7" autocomplete="off" placeholder="Ej. 45820" required>
        <div class="attendance-error" data-start-mileage-error aria-live="polite"></div>
        <button type="submit" class="btn btn-primary">Guardar e iniciar</button>
      </form>`;
    const form = body.querySelector('[data-start-mileage-form]');
    const input = form.elements.startMileage;
    input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 7); });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const error = body.querySelector('[data-start-mileage-error]');
      const button = form.querySelector('button[type="submit"]');
      if (!/^\d{1,7}$/.test(input.value)) {
        error.textContent = 'Ingresa el kilometraje usando solo numeros.';
        input.focus();
        return;
      }
      try {
        button.disabled = true;
        button.textContent = 'Guardando...';
        error.textContent = '';
        await PracticalSessionService.registerStartMileage(sessionId, input.value);
        body.innerHTML = '<div class="attendance-waiting attendance-success">Kilometraje registrado. La clase ha iniciado.</div>';
        window.setTimeout(() => {
          if (!closed) {
            close();
            onConfirmed?.();
          }
        }, 900);
      } catch (requestError) {
        error.textContent = requestError.message || 'No se pudo registrar el kilometraje.';
        button.disabled = false;
        button.textContent = 'Guardar e iniciar';
        input.focus();
      }
    });
    input.focus();
  };

  const refreshChallenge = async () => {
    if (closed || refreshing) return;
    refreshing = true;
    try {
      const response = await PracticalSessionService.createAttendanceQr(sessionId, phase);
      if (closed) return;
      const challenge = response.data;
      if (challenge.alreadyConfirmed) {
        if (isExit) {
          close();
          onConfirmed?.();
        } else {
          const current = await PracticalSessionService.getAttendanceQrStatus(sessionId, phase);
          if (current.data.requiresStartMileage) showMileageForm();
          else {
            close();
            onConfirmed?.();
          }
        }
        return;
      }
      const localOrigin = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      const attendanceUrl = localOrigin && challenge.localAttendanceUrl
        ? challenge.localAttendanceUrl
        : `${window.location.origin}/attendance.html?token=${encodeURIComponent(challenge.token)}`;
      const codeFallback = overlay.querySelector('[data-attendance-code]');
      const numericCode = overlay.querySelector('[data-attendance-numeric-code]');
      if (numericCode) numericCode.textContent = challenge.numericCode || '------';
      if (codeFallback) codeFallback.hidden = false;
      const image = overlay.querySelector('[data-attendance-qr]');
      image.src = await generateQrDataUrl(attendanceUrl);
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
      if (isNetworkError(error)) {
        clearTimers();
        const issuedAt = new Date();
        const expiresAt = new Date(issuedAt.getTime() + 15 * 60 * 1000);
        const payload = {
          type: 'sportmancar-attendance-offline',
          version: 1,
          sessionId,
          phase,
          issuedAt: issuedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          nonce: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        };
        const attendanceUrl = `${window.location.origin}/attendance.html?offline=${encodeURIComponent(encodeOfflinePayload(payload))}`;
        const codeFallback = overlay.querySelector('[data-attendance-code]');
        if (codeFallback) codeFallback.hidden = true;
        const image = overlay.querySelector('[data-attendance-qr]');
        image.src = await generateQrDataUrl(attendanceUrl);
        image.hidden = false;
        overlay.querySelector('[data-attendance-loading]')?.remove();
        overlay.querySelector('[data-attendance-title]').hidden = false;
        overlay.querySelector('[data-attendance-title]').textContent = 'QR offline pendiente';
        overlay.querySelector('[data-attendance-help]').hidden = false;
        overlay.querySelector('[data-attendance-help]').textContent = 'El estudiante debe escanearlo desde su PWA. La asistencia quedara pendiente y se sincronizara cuando vuelva Internet.';
        overlay.querySelector('[data-attendance-countdown]').hidden = false;
        overlay.querySelector('[data-attendance-countdown]').innerHTML = 'Valido offline por <strong>15</strong> minutos';
        if (status) {
          status.className = 'attendance-waiting';
          status.textContent = 'Modo offline: evidencia pendiente de sincronizacion.';
        }
        return;
      }
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
      if (!isExit && response.data.requiresStartMileage) {
        showMileageForm();
        return;
      }
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
      if (status && !isNetworkError(error)) status.textContent = error.message || 'No se pudo consultar la asistencia.';
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
