const CONFIGURED_API_BASE = window.__SPORTMANCAR_CONFIG__?.API_BASE_URL || 'http://localhost:5000/api';
const REQUEST_TIMEOUT_MS = 30000;

const resolveApiBase = value => {
  try {
    const url = new URL(value, window.location.origin);
    const pageHost = window.location.hostname;
    if (['localhost', '127.0.0.1'].includes(url.hostname) && !['localhost', '127.0.0.1'].includes(pageHost)) url.hostname = pageHost;
    return url.href.replace(/\/$/, '');
  } catch { return value.replace(/\/$/, ''); }
};
const DEFAULT_API_BASE = resolveApiBase(CONFIGURED_API_BASE);

class ApiClient {
  constructor() { this.tokenKey = 'erp_api_token'; this.lastBaseUrl = null; this.refreshPromise = null; }

  getBaseUrls() {
    const urls = new Set();
    if (this.lastBaseUrl) urls.add(this.lastBaseUrl);
    urls.add(DEFAULT_API_BASE);
    const configured = CONFIGURED_API_BASE.replace(/\/$/, '');
    let configuredIsLocal = false;
    try { configuredIsLocal = ['localhost', '127.0.0.1'].includes(new URL(configured, window.location.origin).hostname); } catch {}
    if (!configuredIsLocal || ['localhost', '127.0.0.1'].includes(window.location.hostname)) urls.add(configured);
    return [...urls];
  }

  async fetchWithFallback(endpoint, options = {}) {
    let lastError;
    const method = String(options.method || 'GET').toUpperCase();
    const canRetrySafely = ['GET', 'HEAD', 'OPTIONS'].includes(method);
    for (const base of this.getBaseUrls()) {
      const controller = new AbortController();
      const externalSignal = options.signal;
      const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);
      if (externalSignal) {
        if (externalSignal.aborted) abortFromExternalSignal();
        else externalSignal.addEventListener('abort', abortFromExternalSignal, { once: true });
      }
      const timeoutId = window.setTimeout(() => controller.abort('request-timeout'), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(`${base}${endpoint}`, { ...options, signal: controller.signal });
        this.lastBaseUrl = base;
        return response;
      } catch (error) {
        if (controller.signal.aborted) {
          const timeoutError = new Error('El servidor tardó demasiado en responder. El proceso fue detenido para que la pantalla no quede bloqueada.');
          timeoutError.code = 'REQUEST_TIMEOUT';
          throw timeoutError;
        }
        lastError = error;
        // Una escritura nunca se repite automáticamente en otra URL porque
        // podría haberse procesado aunque el navegador perdiera la respuesta.
        if (!canRetrySafely) throw error;
      } finally {
        window.clearTimeout(timeoutId);
        externalSignal?.removeEventListener?.('abort', abortFromExternalSignal);
      }
    }
    throw lastError || new Error('No se pudo conectar con el servidor');
  }

  getToken() {
    try {
      const session = JSON.parse(sessionStorage.getItem('erp_session') || 'null');
      if (session?.apiToken) {
        if (sessionStorage.getItem(this.tokenKey) !== session.apiToken) this.setToken(session.apiToken);
        return session.apiToken;
      }
    } catch {}
    return sessionStorage.getItem(this.tokenKey) || null;
  }
  setToken(token) { if (token) sessionStorage.setItem(this.tokenKey, token); else sessionStorage.removeItem(this.tokenKey); }
  getHeaders() { const headers = { 'Content-Type': 'application/json' }; const token = this.getToken(); if (token) headers.Authorization = `Bearer ${token}`; return headers; }

  async handleResponse(response) {
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) {
      // Para 403 (Forbidden) y 401 (Unauthorized), devolver objeto con success: false
      // en lugar de lanzar error. Así el navegador no logea como unhandled rejection.
      if (response.status === 403 || response.status === 401) {
        return { success: false, error: data.error?.message || data.error || data.message || 'No tienes permiso para esta acción', status: response.status };
      }
      const error = new Error(data.error?.message || data.error || data.message || 'Error en la solicitud');
      error.status = response.status; error.data = data; throw error;
    }
    return data;
  }

  async performRefresh() {
    let session;
    try { session = JSON.parse(sessionStorage.getItem('erp_session') || 'null'); } catch { return false; }
    if (!session?.refreshToken) return false;
    const response = await this.fetchWithFallback('/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: session.refreshToken }) });
    if (!response.ok) return false;
    const data = (await response.json()).data;
    if (!data?.token || !data?.refreshToken) return false;
    this.setToken(data.token);
    sessionStorage.setItem('erp_session', JSON.stringify({ ...session, apiToken: data.token, refreshToken: data.refreshToken, sessionId: data.sessionId, roles: data.roles, permissions: data.permissions, scope: data.scope }));
    return true;
  }
  async tryRefresh() { if (this.refreshPromise) return this.refreshPromise; this.refreshPromise = this.performRefresh().finally(() => { this.refreshPromise = null; }); return this.refreshPromise; }
  expireSession() { this.setToken(null); sessionStorage.removeItem('erp_session'); if (window.location.pathname !== '/login') { window.history.replaceState(null, '', '/login'); window.dispatchEvent(new PopStateEvent('popstate')); } }

  async request(method, endpoint, body, retry = true) {
    const response = await this.fetchWithFallback(endpoint, { method, headers: this.getHeaders(), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (response.status === 401 && retry && endpoint !== '/auth/refresh') {
      if (await this.tryRefresh()) return this.request(method, endpoint, body, false);
      this.expireSession(); const error = new Error('Tu sesión expiró. Inicia sesión nuevamente.'); error.status = 401; throw error;
    }
    return this.handleResponse(response);
  }

  async download(endpoint, body, retry = true) {
    const response = await this.fetchWithFallback(endpoint, { method: 'POST', headers: this.getHeaders(), body: JSON.stringify(body) });
    if (response.status === 401 && retry) { if (await this.tryRefresh()) return this.download(endpoint, body, false); this.expireSession(); throw new Error('Tu sesión expiró. Inicia sesión nuevamente.'); }
    if (!response.ok) return this.handleResponse(response);
    const filename = (response.headers.get('Content-Disposition') || '').match(/filename="?([^";]+)"?/i)?.[1] || 'documento.docx';
    return { blob: await response.blob(), filename };
  }
  async downloadGet(endpoint, retry = true) {
    const response = await this.fetchWithFallback(endpoint, { method: 'GET', headers: this.getHeaders() });
    if (response.status === 401 && retry) { if (await this.tryRefresh()) return this.downloadGet(endpoint, false); this.expireSession(); throw new Error('Tu sesión expiró. Inicia sesión nuevamente.'); }
    if (!response.ok) return this.handleResponse(response);
    const filename = (response.headers.get('Content-Disposition') || '').match(/filename="?([^";]+)"?/i)?.[1] || 'archivo';
    return { blob: await response.blob(), filename };
  }

  async get(endpoint) { return this.request('GET', endpoint); }
  async post(endpoint, body = {}) { return this.request('POST', endpoint, body); }
  async put(endpoint, body = {}) { return this.request('PUT', endpoint, body); }
  async patch(endpoint, body = {}) { return this.request('PATCH', endpoint, body); }
  async delete(endpoint) { return this.request('DELETE', endpoint); }
  async login(username, password) { const result = await this.post('/auth/login', { username, password }); if (result.success && result.user?.token) this.setToken(result.user.token); return result; }
  logout() { this.setToken(null); }
  isAuthenticated() { return Boolean(this.getToken()); }
}

export const apiClient = new ApiClient();
export default ApiClient;
