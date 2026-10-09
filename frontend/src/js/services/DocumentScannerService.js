let runtime;

export function loadScanner() {
  if (!runtime) runtime = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => reject(new Error('El escaner no pudo iniciar. Puedes conservar la foto completa.')), 30000);
    script.src = '/vendor/opencv/opencv.js';
    script.onerror = () => { clearTimeout(timer); reject(new Error('No se pudo cargar el escaner.')); };
    script.onload = () => {
      try {
        const cv = window.cv;
        const ready = () => {
          // This pinned Emscripten build exposes a self-resolving thenable.
          delete cv.then;
          clearTimeout(timer);
          resolve(cv);
        };
        if (cv.Mat) ready();
        else cv.onRuntimeInitialized = ready;
      } catch (error) { clearTimeout(timer); reject(error); }
    };
    document.head.append(script);
  });
  return runtime;
}

export async function photoCanvas(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally { URL.revokeObjectURL(url); }
}

export function validCorners(points) {
  return points.every((a, i) => {
    const b = points[(i + 1) % 4], c = points[(i + 2) % 4];
    return Math.hypot(b.x - a.x, b.y - a.y) > 20 &&
      (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) > 10;
  });
}

function fullCorners(canvas) {
  return [{ x: 0, y: 0 }, { x: canvas.width - 1, y: 0 },
    { x: canvas.width - 1, y: canvas.height - 1 }, { x: 0, y: canvas.height - 1 }];
}

export function detectCorners(cv, canvas) {
  const thumbnail = document.createElement('canvas');
  const scale = Math.min(1, 800 / Math.max(canvas.width, canvas.height));
  thumbnail.width = Math.round(canvas.width * scale);
  thumbnail.height = Math.round(canvas.height * scale);
  thumbnail.getContext('2d').drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);
  const source = cv.imread(thumbnail), gray = new cv.Mat(), edges = new cv.Mat();
  const contours = new cv.MatVector(), hierarchy = new cv.Mat();
  const kernel = cv.Mat.ones(5, 5, cv.CV_8U);
  let best = null, bestArea = thumbnail.width * thumbnail.height * 0.08;
  try {
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    // Try stronger edges first, then faint card boundaries on pale surfaces.
    for (const [low, high] of [[40, 120], [12, 36], [4, 12]]) {
      cv.Canny(gray, edges, low, high);
      cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);
      cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i), polygon = new cv.Mat();
        try {
          const perimeter = cv.arcLength(contour, true);
          for (const tolerance of [0.02, 0.035, 0.05]) {
            cv.approxPolyDP(contour, polygon, perimeter * tolerance, true);
            const area = Math.abs(cv.contourArea(polygon));
            if (polygon.rows !== 4 || area <= bestArea || !cv.isContourConvex(polygon)) continue;
            const points = Array.from({ length: 4 }, (_, j) => ({ x: polygon.data32S[j * 2] / scale, y: polygon.data32S[j * 2 + 1] / scale }));
            const center = points.reduce((c, p) => ({ x: c.x + p.x / 4, y: c.y + p.y / 4 }), { x: 0, y: 0 });
            points.sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
            const start = points.reduce((index, p, j) => p.x + p.y < points[index].x + points[index].y ? j : index, 0);
            const ordered = points.slice(start).concat(points.slice(0, start));
            if (validCorners(ordered)) { best = ordered; bestArea = area; }
          }
        } finally { contour.delete(); polygon.delete(); }
      }
      if (best) break;
    }
    return best || fullCorners(canvas);
  } finally { [source, gray, edges, contours, hierarchy, kernel].forEach(mat => mat.delete()); }
}

export function correctPerspective(cv, canvas, points) {
  if (!validCorners(points)) throw new Error('El recorte no es valido.');
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const width = Math.round(Math.max(distance(points[0], points[1]), distance(points[3], points[2])));
  const height = Math.round(Math.max(distance(points[0], points[3]), distance(points[1], points[2])));
  const source = cv.imread(canvas), output = new cv.Mat();
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, points.flatMap(p => [p.x, p.y]));
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width - 1, 0, width - 1, height - 1, 0, height - 1]);
  let transform;
  try {
    transform = cv.getPerspectiveTransform(from, to);
    cv.warpPerspective(source, output, transform, new cv.Size(width, height), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
    const result = document.createElement('canvas');
    cv.imshow(result, output);
    return result;
  } finally { [source, output, from, to, transform].filter(Boolean).forEach(mat => mat.delete()); }
}

export async function editDocument(file) {
  const original = await photoCanvas(file);
  let cv, failure;
  try { cv = await loadScanner(); } catch (error) { failure = error.message; }
  let points = fullCorners(original);
  try { if (cv) points = detectCorners(cv, original); }
  catch { failure = 'No se detectaron los bordes. Ajusta el recorte o conserva la foto completa.'; }
  if (!failure && points.every((p, i) => p.x === fullCorners(original)[i].x && p.y === fullCorners(original)[i].y)) {
    failure = 'No se detecto el borde del documento. Ajusta las cuatro esquinas.';
  }
  if (!document.querySelector('[data-scanner-style]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = '/src/assets/css/components/document-scanner.css';
    link.dataset.scannerStyle = ''; document.head.append(link);
  }
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'document-scanner';
    dialog.innerHTML = `<header><h2>Recorte del documento</h2></header><p role="status"></p>
      <div class="scanner-images"><canvas aria-label="Esquinas del documento"></canvas><div class="scanner-result"><span>Vista previa</span></div></div>
      <footer><button type="button" data-original>Foto completa</button><button type="button" data-rotate title="Girar 90 grados" aria-label="Girar 90 grados">&#8635;</button><button type="button" data-cancel>Cancelar</button><button type="button" data-accept>Usar recorte</button></footer>`;
    document.body.append(dialog);
    const editor = dialog.querySelector('canvas'), context = editor.getContext('2d');
    const resultHost = dialog.querySelector('.scanner-result');
    const status = dialog.querySelector('[role="status"]');
    status.textContent = failure || '';
    editor.width = original.width; editor.height = original.height;
    let result = original, rotation = 0, active = -1;
    const draw = () => {
      context.drawImage(original, 0, 0);
      context.strokeStyle = '#00b89c'; context.lineWidth = Math.max(3, original.width / 200);
      context.beginPath(); points.forEach((p, i) => i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y));
      context.closePath(); context.stroke();
      points.forEach(p => { context.beginPath(); context.arc(p.x, p.y, original.width / 45, 0, Math.PI * 2); context.fillStyle = '#fff'; context.fill(); context.stroke(); });
    };
    const update = () => {
      try {
        const crop = cv ? correctPerspective(cv, original, points) : original;
        result = document.createElement('canvas');
        result.width = rotation % 2 ? crop.height : crop.width;
        result.height = rotation % 2 ? crop.width : crop.height;
        const ctx = result.getContext('2d');
        ctx.translate(result.width / 2, result.height / 2); ctx.rotate(rotation * Math.PI / 2);
        ctx.drawImage(crop, -crop.width / 2, -crop.height / 2);
        resultHost.querySelector('canvas')?.remove(); resultHost.append(result);
      } catch (error) { status.textContent = error.message; }
    };
    const position = event => {
      const rect = editor.getBoundingClientRect();
      return { x: Math.max(0, Math.min(editor.width - 1, (event.clientX - rect.left) * editor.width / rect.width)),
        y: Math.max(0, Math.min(editor.height - 1, (event.clientY - rect.top) * editor.height / rect.height)) };
    };
    editor.onpointerdown = event => {
      if (!cv) return;
      const p = position(event);
      active = points.reduce((best, point, i) => Math.hypot(point.x - p.x, point.y - p.y) < Math.hypot(points[best].x - p.x, points[best].y - p.y) ? i : best, 0);
      editor.setPointerCapture(event.pointerId);
    };
    editor.onpointermove = event => {
      if (active < 0) return;
      const candidate = points.map((p, i) => i === active ? position(event) : p);
      if (validCorners(candidate)) { points = candidate; draw(); }
    };
    editor.onpointerup = editor.onpointercancel = () => { active = -1; update(); };
    const finish = value => { dialog.close(); dialog.remove(); resolve(value); };
    dialog.oncancel = event => { event.preventDefault(); finish(null); };
    dialog.querySelector('[data-cancel]').onclick = () => finish(null);
    dialog.querySelector('[data-original]').onclick = () => { points = fullCorners(original); draw(); update(); };
    dialog.querySelector('[data-rotate]').onclick = () => { rotation = (rotation + 1) % 4; update(); };
    dialog.querySelector('[data-accept]').onclick = () => finish(result);
    draw(); update(); dialog.showModal();
  });
}
