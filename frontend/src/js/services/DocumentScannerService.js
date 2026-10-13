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

function refineCorners(cv, points, boundary, canvas) {
  const shortest = Math.min(...points.map((p, i) => Math.hypot(p.x - points[(i + 1) % 4].x, p.y - points[(i + 1) % 4].y)));
  const lines = [];
  for (let i = 0; i < 4; i++) {
    const a = points[i], b = points[(i + 1) % 4];
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    // Exclude rounded corners; fit the straight central section of each side.
    const samples = boundary.filter(p => {
      const projection = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (length * length);
      return projection > 0.15 && projection < 0.85 &&
        Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / length < shortest * 0.06;
    });
    if (samples.length < 8) return points;
    const input = cv.matFromArray(samples.length, 1, cv.CV_32FC2, samples.flatMap(p => [p.x, p.y]));
    const output = new cv.Mat();
    try {
      cv.fitLine(input, output, cv.DIST_HUBER, 0, 0.01, 0.01);
      lines.push(Array.from(output.data32F));
    } finally { input.delete(); output.delete(); }
  }
  const refined = points.map((p, i) => {
    const [ux, uy, ax, ay] = lines[(i + 3) % 4];
    const [vx, vy, bx, by] = lines[i];
    const cross = ux * vy - uy * vx;
    if (Math.abs(cross) < 0.1) return p;
    const t = ((bx - ax) * vy - (by - ay) * vx) / cross;
    return { x: Math.max(0, Math.min(canvas.width - 1, ax + t * ux)),
      y: Math.max(0, Math.min(canvas.height - 1, ay + t * uy)) };
  });
  if (!validCorners(refined) || refined.some((p, i) =>
    !Number.isFinite(p.x + p.y) || Math.hypot(p.x - points[i].x, p.y - points[i].y) > shortest * 0.08)) return points;
  return refined;
}

function documentEvidence(gray, points, scale) {
  const corners = points.map(p => ({ x: p.x * scale, y: p.y * scale }));
  const pixel = (x, y) => gray.data[Math.max(0, Math.min(gray.rows - 1, Math.round(y))) * gray.cols +
    Math.max(0, Math.min(gray.cols - 1, Math.round(x)))];
  let details = 0;
  for (let row = 1; row <= 20; row++) for (let col = 1; col <= 20; col++) {
    const u = col / 21, v = row / 21;
    const x = (1 - v) * ((1 - u) * corners[0].x + u * corners[1].x) + v * ((1 - u) * corners[3].x + u * corners[2].x);
    const y = (1 - v) * ((1 - u) * corners[0].y + u * corners[1].y) + v * ((1 - u) * corners[3].y + u * corners[2].y);
    if (Math.abs(pixel(x + 2, y) - pixel(x - 2, y)) + Math.abs(pixel(x, y + 2) - pixel(x, y - 2)) > 18) details++;
  }
  const contrasts = corners.map((a, i) => {
    const b = corners[(i + 1) % 4], length = Math.hypot(b.x - a.x, b.y - a.y);
    const offset = Math.max(4, Math.min(20, length * 0.06));
    const nx = -(b.y - a.y) / length * offset, ny = (b.x - a.x) / length * offset;
    let sum = 0;
    for (let j = 1; j <= 9; j++) {
      const x = a.x + (b.x - a.x) * j / 10, y = a.y + (b.y - a.y) * j / 10;
      sum += Math.abs(pixel(x + nx, y + ny) - pixel(x - nx, y - ny));
    }
    return sum / 9;
  }).sort((a, b) => b - a);
  return { texture: details / 400, borderContrast: contrasts[2] };
}

export function detectCorners(cv, canvas) {
  const thumbnail = document.createElement('canvas');
  const scale = Math.min(1, 800 / Math.max(canvas.width, canvas.height));
  thumbnail.width = Math.round(canvas.width * scale);
  thumbnail.height = Math.round(canvas.height * scale);
  thumbnail.getContext('2d').drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);
  const source = cv.imread(thumbnail), gray = new cv.Mat(), edges = new cv.Mat(), enhanced = new cv.Mat();
  const contours = new cv.MatVector(), hierarchy = new cv.Mat();
  const kernel = cv.Mat.ones(5, 5, cv.CV_8U);
  const imageArea = thumbnail.width * thumbnail.height;
  let best = null, bestBoundary = null, bestScore = 0;
  try {
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    cv.equalizeHist(gray, enhanced);
    // Filled regions can recover a card whose contour ends at the image boundary.
    const passes = [
      () => cv.Canny(gray, edges, 40, 120),
      () => cv.Canny(gray, edges, 12, 36),
      () => cv.Canny(gray, edges, 4, 12),
      () => cv.Canny(enhanced, edges, 40, 120),
      () => cv.threshold(enhanced, edges, 128, 255, cv.THRESH_BINARY_INV),
      () => cv.threshold(enhanced, edges, 128, 255, cv.THRESH_BINARY)
    ];
    for (const prepare of passes) {
      prepare();
      cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);
      cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_NONE);
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i), polygon = new cv.Mat();
        try {
          const perimeter = cv.arcLength(contour, true);
          for (const tolerance of [0.02, 0.035, 0.05]) {
            cv.approxPolyDP(contour, polygon, perimeter * tolerance, true);
            const area = Math.abs(cv.contourArea(polygon));
            if (polygon.rows !== 4 || area < imageArea * 0.025 || !cv.isContourConvex(polygon)) continue;
            const points = Array.from({ length: 4 }, (_, j) => ({ x: polygon.data32S[j * 2] / scale, y: polygon.data32S[j * 2 + 1] / scale }));
            const center = points.reduce((c, p) => ({ x: c.x + p.x / 4, y: c.y + p.y / 4 }), { x: 0, y: 0 });
            points.sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
            const start = points.reduce((index, p, j) => p.x + p.y < points[index].x + points[index].y ? j : index, 0);
            const ordered = points.slice(start).concat(points.slice(0, start));
            if (!validCorners(ordered)) continue;
            const lengths = ordered.map((p, j) => Math.hypot(p.x - ordered[(j + 1) % 4].x, p.y - ordered[(j + 1) % 4].y));
            const width = (lengths[0] + lengths[2]) / 2, height = (lengths[1] + lengths[3]) / 2;
            const ratio = Math.max(width, height) / Math.min(width, height);
            if (ratio > 3.5) continue;
            // A frame around the photo is not a document boundary.
            const margin = 6 / scale;
            const framePoints = ordered.filter(p => p.x < margin || p.y < margin ||
              p.x > canvas.width - margin || p.y > canvas.height - margin).length;
            if (framePoints >= 3) continue;
            const rectangularity = Math.min(1, area / (width * height * scale * scale));
            if (rectangularity < 0.7) continue;
            const evidence = documentEvidence(gray, ordered, scale);
            // Weak, empty regions produced by shadows are not document evidence.
            if (evidence.texture < 0.015 && evidence.borderContrast < 8) continue;
            const score = area * rectangularity * (framePoints ? 0.75 : 1) *
              (0.2 + Math.min(1, evidence.texture * 10));
            if (score > bestScore) {
              best = ordered; bestScore = score;
              bestBoundary = Array.from({ length: contour.rows }, (_, j) => ({
                x: contour.data32S[j * 2] / scale, y: contour.data32S[j * 2 + 1] / scale
              }));
            }
          }
        } finally { contour.delete(); polygon.delete(); }
      }
    }
    return best ? refineCorners(cv, best, bestBoundary, canvas) : fullCorners(canvas);
  } finally { [source, gray, edges, enhanced, contours, hierarchy, kernel].forEach(mat => mat.delete()); }
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
    failure = 'No se detecto el borde del documento. Ajusta el recorte.';
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
      <div class="scanner-images"><canvas aria-label="Bordes y esquinas del documento"></canvas><div class="scanner-result"><span>Vista previa</span></div></div>
      <footer><button type="button" data-original>Foto completa</button><button type="button" data-rotate title="Girar 90 grados" aria-label="Girar 90 grados">&#8635;</button><button type="button" data-cancel>Cancelar</button><button type="button" data-accept>Usar recorte</button></footer>`;
    document.body.append(dialog);
    const editor = dialog.querySelector('canvas'), context = editor.getContext('2d');
    const resultHost = dialog.querySelector('.scanner-result');
    const status = dialog.querySelector('[role="status"]');
    status.textContent = failure || '';
    editor.width = original.width; editor.height = original.height;
    let result = original, rotation = 0, active = null;
    const displayScale = () => original.width / (editor.getBoundingClientRect().width || 320);
    const handles = () => points.map((p, i) => ({ kind: 'corner', index: i, ...p })).concat(
      points.map((p, i) => ({ kind: 'edge', index: i,
        x: (p.x + points[(i + 1) % 4].x) / 2, y: (p.y + points[(i + 1) % 4].y) / 2 })));
    const draw = () => {
      context.drawImage(original, 0, 0);
      context.strokeStyle = '#00b89c'; context.lineWidth = Math.max(3, original.width / 200);
      context.beginPath(); points.forEach((p, i) => i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y));
      context.closePath(); context.stroke();
      points.forEach(p => { context.beginPath(); context.arc(p.x, p.y, original.width / 45, 0, Math.PI * 2); context.fillStyle = '#fff'; context.fill(); context.stroke(); });
      handles().filter(handle => handle.kind === 'edge').forEach(handle => {
        const a = points[handle.index], b = points[(handle.index + 1) % 4];
        const unit = displayScale(), inset = 16 * unit;
        context.save(); context.translate(Math.max(inset, Math.min(editor.width - inset, handle.x)),
          Math.max(inset, Math.min(editor.height - inset, handle.y)));
        context.rotate(Math.atan2(b.y - a.y, b.x - a.x));
        context.fillStyle = '#00b89c';
        context.beginPath(); context.roundRect(-32 * unit, -7 * unit, 64 * unit, 14 * unit, 4 * unit);
        context.fill(); context.strokeStyle = '#fff'; context.lineWidth = 2 * unit; context.stroke();
        context.fillStyle = '#fff';
        for (const x of [-7, 0, 7]) context.fillRect((x - 1) * unit, -3 * unit, 2 * unit, 6 * unit);
        context.restore();
      });
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
      const corners = handles().filter(handle => handle.kind === 'corner');
      const corner = corners.reduce((best, item) => Math.hypot(item.x - p.x, item.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? item : best);
      const edges = handles().filter(handle => handle.kind === 'edge');
      const edgeDistance = handle => {
        const a = points[handle.index], b = points[(handle.index + 1) % 4];
        const dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
        return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
      };
      // The whole side is draggable; corners have a separate touch target.
      const handle = Math.hypot(corner.x - p.x, corner.y - p.y) <= 18 * displayScale() ? corner :
        edges.reduce((best, item) => edgeDistance(item) < edgeDistance(best) ? item : best);
      active = { ...handle, origin: p, points: points.map(point => ({ ...point })), pointerId: event.pointerId };
      editor.setPointerCapture(event.pointerId);
    };
    editor.onpointermove = event => {
      if (!active || event.pointerId !== active.pointerId) return;
      const target = position(event);
      let candidate;
      if (active.kind === 'corner') candidate = points.map((p, i) => i === active.index ? target : p);
      else {
        const a = active.points[active.index], next = (active.index + 1) % 4, b = active.points[next];
        const length = Math.hypot(b.x - a.x, b.y - a.y), nx = -(b.y - a.y) / length, ny = (b.x - a.x) / length;
        let shift = (target.x - active.origin.x) * nx + (target.y - active.origin.y) * ny;
        let min = -Infinity, max = Infinity;
        for (const p of [a, b]) for (const [value, normal, bound] of [[p.x, nx, editor.width - 1], [p.y, ny, editor.height - 1]]) {
          if (Math.abs(normal) < 1e-6) continue;
          const limits = [-value / normal, (bound - value) / normal];
          min = Math.max(min, Math.min(...limits)); max = Math.min(max, Math.max(...limits));
        }
        shift = Math.max(min, Math.min(max, shift));
        candidate = active.points.map((p, i) => i === active.index || i === next ? { x: p.x + nx * shift, y: p.y + ny * shift } : p);
      }
      if (validCorners(candidate)) { points = candidate; draw(); }
    };
    editor.onpointerup = editor.onpointercancel = event => {
      if (!active || event.pointerId !== active.pointerId) return;
      active = null; update();
    };
    const finish = value => { dialog.close(); dialog.remove(); resolve(value); };
    dialog.oncancel = event => { event.preventDefault(); finish(null); };
    dialog.querySelector('[data-cancel]').onclick = () => finish(null);
    dialog.querySelector('[data-original]').onclick = () => { points = fullCorners(original); draw(); update(); };
    dialog.querySelector('[data-rotate]').onclick = () => { rotation = (rotation + 1) % 4; update(); };
    dialog.querySelector('[data-accept]').onclick = () => finish(result);
    dialog.showModal(); draw(); update();
  });
}
