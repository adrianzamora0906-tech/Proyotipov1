export function renderQrDataUrl(value, options = {}) {
  return new Promise((resolve, reject) => {
    const QRCode = window.QRCode || globalThis.QRCode;
    if (!QRCode || typeof QRCode.toDataURL !== 'function') {
      reject(new Error('El generador QR local no está disponible'));
      return;
    }
    QRCode.toDataURL(value, { width: options.width || 280, margin: options.margin || 12, type: 'image/png' }, (error, url) => {
      if (error) return reject(error);
      resolve(url);
    });
  });
}
