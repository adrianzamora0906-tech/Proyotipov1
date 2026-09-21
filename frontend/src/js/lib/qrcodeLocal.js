(function () {
  const QRCodeLibrary = window.QRCode || (typeof globalThis !== 'undefined' ? globalThis.QRCode : null);

  if (QRCodeLibrary && typeof QRCodeLibrary.toDataURL === 'function') {
    return;
  }

  const fallback = {
    toDataURL(value, options = {}, callback) {
      const width = Number(options.width) || 280;
      const margin = Number(options.margin) || 12;
      const svg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}" viewBox="0 0 ${width} ${width}">
          <rect width="100%" height="100%" fill="#ffffff"/>
          <rect x="${margin}" y="${margin}" width="${width - margin * 2}" height="${width - margin * 2}" fill="none" stroke="#111827" stroke-width="2"/>
          <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#111827">QR local</text>
        </svg>
      `)}`;
      if (typeof callback === 'function') callback(null, svg);
      return svg;
    },
  };

  window.QRCode = fallback;
})();
