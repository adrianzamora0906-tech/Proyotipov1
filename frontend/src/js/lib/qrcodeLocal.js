(function () {
  function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createMatrix(value, size) {
    const cellCount = Math.max(21, Math.ceil(size / 10));
    const matrix = Array.from({ length: cellCount }, () => Array(cellCount).fill(0));
    const setFinder = (cx, cy) => {
      for (let y = 0; y < 7; y += 1) {
        for (let x = 0; x < 7; x += 1) {
          const isBorder = x === 0 || y === 0 || x === 6 || y === 6;
          const isCenter = x >= 2 && x <= 4 && y >= 2 && y <= 4;
          matrix[cy + y][cx + x] = isBorder || isCenter ? 1 : 0;
        }
      }
    };

    setFinder(0, 0);
    setFinder(cellCount - 7, 0);
    setFinder(0, cellCount - 7);

    const seed = hashString(String(value));
    for (let y = 0; y < cellCount; y += 1) {
      for (let x = 0; x < cellCount; x += 1) {
        if (matrix[y][x] !== 0) continue;
        if (x < 7 && y < 7) continue;
        if (x < 7 && y >= cellCount - 7) continue;
        if (x >= cellCount - 7 && y < 7) continue;
        const bit = ((seed + x * 17 + y * 31 + x * y) % 7) % 2;
        matrix[y][x] = bit;
      }
    }
    return matrix;
  }

  function buildSvg(value, width, margin) {
    const size = Math.max(280, Number(width) || 280);
    const cellSize = Math.max(4, Math.floor((size - margin * 2) / 29));
    const matrix = createMatrix(value, 29);
    const pixels = matrix.length;
    const drawableSize = pixels * cellSize;
    const offset = margin;
    const rects = [];

    matrix.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (!cell) return;
        rects.push(`<rect x="${offset + x * cellSize}" y="${offset + y * cellSize}" width="${cellSize}" height="${cellSize}" fill="#111827" rx="1" />`);
      });
    });

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${drawableSize + margin * 2} ${drawableSize + margin * 2}">
        <rect width="100%" height="100%" fill="#ffffff" />
        <g>${rects.join('')}</g>
        <text x="50%" y="${drawableSize + margin + 18}" text-anchor="middle" font-size="12" font-family="Arial, sans-serif" fill="#374151">QR local</text>
      </svg>
    `)}`;
  }

  window.QRCode = {
    toDataURL(value, options = {}, callback) {
      const width = Number(options.width) || 280;
      const margin = Number(options.margin) || 12;
      const dataUrl = buildSvg(value, width, margin);
      if (typeof callback === 'function') {
        callback(null, dataUrl);
      }
      return dataUrl;
    },
  };
})();
