const content = document.getElementById('attendance-content');
const token = new URLSearchParams(window.location.search).get('token');
const apiBases = [window.__SPORTMANCAR_CONFIG__?.API_BASE_URL || 'http://localhost:5000/api'];
let authorizedLocation = null;
let attendancePhase = 'ENTRY';

function isExitPhase() {
  return attendancePhase === 'EXIT';
}

function renderCompleted() {
  content.innerHTML = `<div class="attendance-icon attendance-icon-success">✓</div><h1>${isExitPhase() ? 'Salida registrada' : 'Entrada registrada'}</h1><p>${isExitPhase() ? 'La salida de la clase fue confirmada correctamente.' : 'La clase fue iniciada correctamente.'}</p>`;
}

function getAuthToken() {
  try {
    const session = JSON.parse(sessionStorage.getItem('erp_session') || 'null');
    return session?.apiToken || sessionStorage.getItem('erp_api_token') || '';
  } catch {
    return sessionStorage.getItem('erp_api_token') || '';
  }
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[character]));
}

function renderError(message) {
  content.innerHTML = `<div class="attendance-icon attendance-icon-error">!</div><h1>No se pudo registrar</h1><p>${escapeHtml(message)}</p><small>Solicita al instructor que genere un nuevo código.</small>`;
}

async function request(path, options = {}) {
  let lastError;
  for (const base of [...new Set(apiBases)]) {
    try {
      const authToken = getAuthToken();
      const response = await fetch(`${base}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}), ...(options.headers || {}) },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || data.error || data.message || 'No se pudo completar la solicitud');
      return data;
    } catch (error) {
      lastError = error;
      if (!/Failed to fetch|NetworkError|conexión/i.test(error.message)) throw error;
    }
  }
  throw lastError || new Error('No hay conexión con el sistema');
}

async function loadChallenge() {
  if (!token) return renderError('El enlace no contiene un código válido.');
  try {
    if (!getAuthToken()) {
      content.innerHTML = `<div class="attendance-icon attendance-icon-error">!</div><h1>Inicia sesion</h1><p>Debes abrir este QR desde la sesion del estudiante matriculado.</p><a class="attendance-login" href="/?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}">Ir a iniciar sesion</a><small>Luego vuelve a escanear el codigo vigente.</small>`;
      return;
    }
    const response = await request(`/attendance/${encodeURIComponent(token)}/claim`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    attendancePhase = response.data.phase || 'ENTRY';
    if (response.data.completed) {
      renderCompleted();
      return;
    }
    if (!getAuthToken()) {
      content.innerHTML = `<div class="attendance-icon attendance-icon-error">!</div><h1>Inicia sesión</h1><p>Debes abrir este QR desde la sesión del estudiante matriculado.</p><a class="attendance-login" href="/?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}">Ir a iniciar sesión</a><small>Después ingresa al portal del estudiante y vuelve a escanear el código.</small>`;
      return;
    }
    await validateLocationBeforeIdentification();
  } catch (error) {
    renderError(error.message);
  }
}

async function validateLocationBeforeIdentification() {
  content.innerHTML = `<div class="attendance-location-step"><div class="attendance-location-spinner"></div><h1>Validando ubicación</h1><p>Comprobaremos que estés dentro de una zona autorizada antes de solicitar tu cédula.</p></div>`;
  try {
    const location = await getCurrentLocation();
    const response = await request(`/attendance/${encodeURIComponent(token)}/location`, {
      method: 'POST',
      body: JSON.stringify({ latitude: location.coords.latitude, longitude: location.coords.longitude, accuracy: location.coords.accuracy }),
    });
    attendancePhase = response.data.phase || attendancePhase;
    if (response.data.completed) {
      renderCompleted();
      return;
    }
    authorizedLocation = location;
    renderIdentificationForm(response.data);
  } catch (error) {
    authorizedLocation = null;
    const outsideGeofence = /fuera de una zona|no corresponde/i.test(error.message);
    const title = outsideGeofence ? 'Ubicación no autorizada' : 'No pudimos validar tu ubicación';
    content.innerHTML = `<div class="attendance-icon attendance-icon-error">!</div><h1>${title}</h1><p>${escapeHtml(error.message)}</p><button type="button" class="attendance-retry" id="retry-location">Reintentar ubicación</button><small>Activa el GPS y la ubicación precisa. El campo de cédula aparecerá después de validar tu posición.</small>`;
    document.getElementById('retry-location')?.addEventListener('click', validateLocationBeforeIdentification);
  }
}

function renderIdentificationForm(locationData = {}) {
  content.innerHTML = `
    <div class="attendance-location-ok">✓ Ubicación autorizada${locationData.geofence ? ` · ${escapeHtml(locationData.geofence)}` : ''}</div>
    <h1>${isExitPhase() ? 'Registrar salida' : 'Registrar entrada'}</h1>
    <p>Ingresa los últimos 4 dígitos de tu cédula para ${isExitPhase() ? 'confirmar la salida' : 'iniciar la clase'}.</p>
    <form id="attendance-form">
      <label for="last-four">Últimos 4 dígitos</label>
      <input id="last-four" name="lastFour" type="text" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" placeholder="0000" required>
      <div class="attendance-error" id="attendance-error" aria-live="polite"></div>
      <button type="submit">${isExitPhase() ? 'Confirmar salida' : 'Confirmar entrada'}</button>
    </form>
    <small>Este código es temporal y funciona una sola vez.</small>`;
  const form = document.getElementById('attendance-form');
  const input = document.getElementById('last-four');
  input.focus();
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 4); });
  form.addEventListener('submit', confirmAttendance);
}

async function confirmAttendance(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.elements.lastFour;
  const errorElement = document.getElementById('attendance-error');
  const button = form.querySelector('button');
  if (!/^\d{4}$/.test(input.value)) {
    errorElement.textContent = 'Debes ingresar exactamente 4 números.';
    return;
  }
  try {
    button.disabled = true;
    button.textContent = 'Confirmando…';
    errorElement.textContent = '';
    const location = authorizedLocation || await getCurrentLocation();
    await request(`/attendance/${encodeURIComponent(token)}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ lastFour: input.value, latitude: location.coords.latitude, longitude: location.coords.longitude, accuracy: location.coords.accuracy }),
    });
    renderCompleted();
  } catch (error) {
    errorElement.textContent = error.message;
    button.disabled = false;
    button.textContent = isExitPhase() ? 'Confirmar salida' : 'Confirmar entrada';
    input.select();
  }
}

function getCurrentLocation() {
  if (!navigator.geolocation) return Promise.reject(new Error('Este navegador no permite obtener la ubicación. Abre el enlace mediante HTTPS.'));
  return new Promise((resolve, reject) => {
    let bestPosition = null;
    let finished = false;
    let watchId = null;
    let overallTimer = null;
    const finish = (callback, value) => {
      if (finished) return;
      finished = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (overallTimer !== null) window.clearTimeout(overallTimer);
      callback(value);
    };
    watchId = navigator.geolocation.watchPosition(
      position => {
        if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) bestPosition = position;
        if (position.coords.accuracy > 0 && position.coords.accuracy <= 150) finish(resolve, position);
      },
      error => {
        if (error.code === 1) finish(reject, new Error('Debes permitir la ubicación precisa para registrar tu asistencia.'));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 },
    );
    overallTimer = window.setTimeout(() => {
      if (bestPosition) finish(resolve, bestPosition);
      else finish(reject, new Error('El teléfono no entregó una ubicación. Activa el GPS y la ubicación precisa, espera unos segundos y vuelve a intentarlo.'));
    }, 40000);
  });
}

loadChallenge();
