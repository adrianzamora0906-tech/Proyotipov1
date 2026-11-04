const loopback = host => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host);

export function secureApiUrl(value, page = window.location) {
  const localPage = page.protocol === 'http:' && loopback(page.hostname);
  if (page.protocol !== 'https:' && !localPage) throw new Error('Abre el sistema mediante HTTPS para proteger tus datos.');
  const url = new URL(value, page.origin);
  if (url.username || url.password || url.hash || !['https:', 'http:'].includes(url.protocol)) {
    throw new Error('La direccion de la API no es segura.');
  }
  if (url.protocol !== 'https:' && !(localPage && loopback(url.hostname))) {
    throw new Error('La API y sus rutas de respaldo deben utilizar HTTPS.');
  }
  return url.href.replace(/\/$/, '');
}

export function secureRealtimeUrl(base, page = window.location) {
  const url = new URL(secureApiUrl(base, page));
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/realtime`;
  url.search = '';
  return url;
}
