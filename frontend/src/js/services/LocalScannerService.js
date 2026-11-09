const endpoint = 'http://127.0.0.1:17891';
export class LocalScannerService {
  constructor(token) { this.token = token; }
  async request(operation, body = {}) {
    let response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 135000);
    try {
      response = await fetch(endpoint + operation, {
        method: 'POST', credentials: 'omit', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-Scanner-Token': this.token },
        body: JSON.stringify(body), signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo completar el escaneo.');
      return result.data;
    } catch (error) {
      if (response) throw error;
      throw new Error('No se pudo contactar el servicio local. Inícialo, comprueba el origen autorizado y permite el acceso a la red local si el navegador lo solicita.');
    } finally { clearTimeout(timeout); }
  }
  devices() { return this.request('/devices'); }
  scan(deviceId) { return this.request('/scan', { deviceId }); }
}
