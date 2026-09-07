import Component from '../../components/Component.js';
import ApiService from '../../core/api/apiService.js';

class MobileDocumentUploadView extends Component {
  async render() {
    const token = this.props.token;
    let upload = null;
    let error = '';

    try {
      const response = await ApiService.getMobileDocumentUploadToken(token);
      upload = response.success ? response.data : null;
      if (!upload) error = 'No se pudo abrir este enlace.';
    } catch (requestError) {
      error = /Failed to fetch|NetworkError|conexi[oó]n/i.test(requestError.message || '')
        ? 'No se pudo conectar con el servidor. Verifica que el teléfono esté en la misma red Wi-Fi e inténtalo nuevamente.'
        : (requestError.message || 'Este enlace no está disponible.');
    }

    this.upload = upload;

    const isPackage = upload?.type === 'registro_documentos';
    const isBloodCardCompletion = upload?.type === 'completar_carnet';
    const isPracticeExternal = upload?.type === 'practica_adicional_externo';
    const isPracticeFormer = upload?.type === 'practica_adicional_exestudiante';
    return `
      <main class="mobile-upload-page">
        <section class="mobile-upload-panel">
          <div class="mobile-upload-brand">
            <div class="mobile-upload-logo">SM</div>
            <div>
              <h1>Captura de documento</h1>
              <p>SportmancarERP</p>
            </div>
          </div>
          ${error ? `
            <div class="mobile-upload-error">${error}</div>
          ` : `
            <div class="mobile-upload-summary">
              <strong>${upload.studentName}</strong>
              <span>${upload.documentName || 'Documento'}</span>
              <small>Este enlace es temporal y se cerrara al guardar.</small>
            </div>
            <form id="mobile-upload-form" class="mobile-upload-form"
              data-package="${isPackage ? 'true' : 'false'}"
              data-blood-card="${isBloodCardCompletion ? 'true' : 'false'}"
              data-practice-external="${isPracticeExternal ? 'true' : 'false'}"
              data-practice-former="${isPracticeFormer ? 'true' : 'false'}">
              ${isBloodCardCompletion ? `
                <label>
                  <span>Carnet de tipo sanguineo</span>
                  <input type="file" id="mobile-blood-card-only-file" accept="image/jpeg,image/png" capture="environment" required>
                  <div class="mobile-file-preview" data-preview-for="mobile-blood-card-only-file" hidden></div>
                </label>
              ` : isPracticeExternal ? `
                ${[['practice-cedula-front','Cédula frontal'],['practice-cedula-back','Cédula reverso'],['practice-license-front','Licencia frontal'],['practice-license-back','Licencia reverso']].map(([id,label]) => `<label><span>${label}</span><input type="file" id="mobile-${id}-file" accept="image/*" capture="environment" required><div class="mobile-file-preview" data-preview-for="mobile-${id}-file" hidden></div></label>`).join('')}
              ` : isPackage ? `
                <label>
                  <span>Cedula frontal</span>
                  <input type="file" id="mobile-cedula-front-file" accept="image/*" capture="environment" required>
                  <div class="mobile-file-preview" data-preview-for="mobile-cedula-front-file" hidden></div>
                </label>
                <label>
                  <span>Cedula reverso</span>
                  <input type="file" id="mobile-cedula-back-file" accept="image/*" capture="environment" required>
                  <div class="mobile-file-preview" data-preview-for="mobile-cedula-back-file" hidden></div>
                </label>
                <label>
                  <span>Carnet de la Cruz Roja</span>
                  <input type="file" id="mobile-blood-card-front-file" accept="image/*" capture="environment" required>
                  <div class="mobile-file-preview" data-preview-for="mobile-blood-card-front-file" hidden></div>
                </label>
                <label>
                  <span>Certificado de estudio <small>(opcional)</small></span>
                  <input type="file" id="mobile-study-certificate-file" accept=".pdf,application/pdf,image/jpeg,image/png,image/webp">
                  <small>Selecciona el PDF descargado o toma una fotograf&iacute;a del certificado.</small>
                  <div class="mobile-file-preview" data-preview-for="mobile-study-certificate-file" hidden></div>
                </label>
              ` : `
                <label>
                  <span>${isPracticeFormer ? 'Licencia frontal' : 'Anverso'}</span>
                  <input type="file" id="mobile-front-file" accept="image/*" capture="environment" required>
                  <div class="mobile-file-preview" data-preview-for="mobile-front-file" hidden></div>
                </label>
                <label>
                  <span>${isPracticeFormer ? 'Licencia reverso' : 'Reverso'}</span>
                  <input type="file" id="mobile-back-file" accept="image/*" capture="environment" required>
                  <div class="mobile-file-preview" data-preview-for="mobile-back-file" hidden></div>
                </label>
              `}
              <button type="submit" class="btn btn-primary btn-block" id="mobile-upload-submit">Guardar PDF</button>
              <p id="mobile-upload-status" class="mobile-upload-status"></p>
            </form>
          `}
        </section>
      </main>
    `;
  }

  async mount() {
    const form = document.getElementById('mobile-upload-form');
    if (!form) return;

    const previewUrls = new Map();
    form.querySelectorAll('input[type="file"]').forEach(input => {
      input.addEventListener('change', () => {
        const preview = form.querySelector(`[data-preview-for="${input.id}"]`);
        if (!preview) return;
        const previousUrl = previewUrls.get(input.id);
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        const file = input.files?.[0];
        if (!file) {
          preview.hidden = true;
          preview.innerHTML = '';
          previewUrls.delete(input.id);
          return;
        }
        const fileUrl = URL.createObjectURL(file);
        previewUrls.set(input.id, fileUrl);
        preview.hidden = false;
        preview.innerHTML = file.type === 'application/pdf'
          ? `<span><strong>PDF seleccionado:</strong> ${file.name}</span>`
          : `<img src="${fileUrl}" alt="Vista previa de ${input.previousElementSibling?.textContent || 'documento'}"><span>Vista previa</span>`;
      });
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = document.getElementById('mobile-upload-submit');
      const status = document.getElementById('mobile-upload-status');
      const isPackage = form.dataset.package === 'true';
      const isBloodCardCompletion = form.dataset.bloodCard === 'true';
      const isPracticeExternal = form.dataset.practiceExternal === 'true';
      const files = isBloodCardCompletion
        ? [{ file: document.getElementById('mobile-blood-card-only-file')?.files?.[0], label: 'Carnet de tipo sanguineo' }]
        : isPracticeExternal
        ? [
            { file: document.getElementById('mobile-practice-cedula-front-file')?.files?.[0], label: 'Cédula frontal' },
            { file: document.getElementById('mobile-practice-cedula-back-file')?.files?.[0], label: 'Cédula reverso' },
            { file: document.getElementById('mobile-practice-license-front-file')?.files?.[0], label: 'Licencia frontal' },
            { file: document.getElementById('mobile-practice-license-back-file')?.files?.[0], label: 'Licencia reverso' },
          ]
        : isPackage
        ? [
            { file: document.getElementById('mobile-cedula-front-file')?.files?.[0], label: 'Cedula frontal' },
            { file: document.getElementById('mobile-cedula-back-file')?.files?.[0], label: 'Cedula reverso' },
            { file: document.getElementById('mobile-blood-card-front-file')?.files?.[0], label: 'Carnet de la Cruz Roja' },
            { file: document.getElementById('mobile-study-certificate-file')?.files?.[0], label: 'Certificado de estudio', optional: true },
          ]
        : [
            { file: document.getElementById('mobile-front-file')?.files?.[0], label: 'Anverso' },
            { file: document.getElementById('mobile-back-file')?.files?.[0], label: 'Reverso' },
          ];

      if (files.some(item => !item.optional && !item.file)) {
        status.textContent = isBloodCardCompletion
          ? 'Toma la foto del carnet de tipo sanguineo.'
          : (isPackage ? 'Toma las fotos de la cedula y del carnet de la Cruz Roja.' : 'Toma la foto del anverso y reverso.');
        return;
      }

      try {
        button.disabled = true;
        button.textContent = 'Guardando...';
        status.textContent = 'Generando PDF desde el telefono.';
        let ocrData = null;
        if (false && isPackage) {
          status.textContent = 'Leyendo datos de la cedula (puedes corregirlos después)...';
          try { const { rawText, ...extracted } = await CedulaOcrHelper.recognize([files[0].file, files[1].file]);const found=Object.values(extracted).filter(Boolean).length;ocrData=found?extracted:null;if(!found)console.warn('OCR sin datos. Texto detectado:',rawText); } catch (ocrError) { console.warn('OCR piloto no disponible:', ocrError.message); }
        }
        status.textContent = 'Generando PDF desde el telefono.';
        const certificateIncluded = isPackage && Boolean(files.find(item => item.optional)?.file);
        const certificateFile = files.find(item => item.optional)?.file || null;
        const capturedFiles = files.filter(item => item.file && !item.optional);
        const fileUrl = isBloodCardCompletion
          ? await this.readFileAsDataUrl(new Blob(
            [(await this.prepareImageForPdf(files[0].file)).bytes],
            { type: 'image/jpeg' }
          ))
          : await this.readFileAsDataUrl(await this.createMultiScanPdf(capturedFiles));
        status.textContent = certificateFile
          ? 'Generando y adjuntando el PDF del certificado de estudio.'
          : 'Generando PDF desde el telefono.';
        const certificateFileUrl = certificateFile
          ? await this.readFileAsDataUrl(
              certificateFile.type === 'application/pdf'
                ? certificateFile
                : await this.createSingleScanPdf(certificateFile)
            )
          : null;
        const response = await ApiService.completeMobileDocumentUpload(this.props.token, {
          fileUrl,
          certificateFileUrl,
          observations: ocrData ? `OCR_DATA:${JSON.stringify(ocrData)}` : isBloodCardCompletion
            ? 'Carnet de tipo sanguineo capturado desde telefono'
            : (isPackage
              ? `Cedula y carnet de la Cruz Roja capturados desde telefono; CERTIFICATE_INCLUDED:${certificateIncluded}`
              : `${this.upload?.documentName || 'Documento'} capturado desde telefono`),
        });
        if (!response.success) throw new Error(response.error || 'No se pudo guardar el documento.');

        previewUrls.forEach(url => URL.revokeObjectURL(url));
        previewUrls.clear();

        form.innerHTML = `
          <div class="mobile-upload-success">
            <strong>${certificateIncluded ? 'Documentos y certificado guardados' : 'Documento guardado'}</strong>
            <span>${certificateIncluded ? 'El certificado de estudio se gener&oacute; como un PDF separado. ' : ''}Confirma los archivos en la computadora. Este tel&eacute;fono permanece vinculado para el siguiente estudiante.</span>
            ${isPackage ? '<button type="button" class="btn btn-primary btn-block" data-capture-next>Capturar siguiente estudiante</button>' : ''}
          </div>
        `;
        form.querySelector('[data-capture-next]')?.addEventListener('click', () => window.location.reload());
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Guardar PDF';
        status.textContent = error.message || 'No se pudo guardar el documento.';
      }
    });
  }

  async createScanPdf(frontFile, backFile, title) {
    const [front, back] = await Promise.all([
      this.prepareImageForPdf(frontFile),
      this.prepareImageForPdf(backFile),
    ]);

    const pageWidth = 595;
    const pageHeight = 842;
    const margin = 48;
    const maxImageWidth = pageWidth - (margin * 2);
    const maxImageHeight = 290;
    const frontBox = this.fitImageInBox(front.width, front.height, maxImageWidth, maxImageHeight);
    const backBox = this.fitImageInBox(back.width, back.height, maxImageWidth, maxImageHeight);
    const frontX = (pageWidth - frontBox.width) / 2;
    const backX = (pageWidth - backBox.width) / 2;
    const content = [
      `BT /F1 18 Tf 48 805 Td (${this.escapePdfText(title)}) Tj ET`,
      'BT /F1 10 Tf 48 785 Td (Documento generado desde fotografias del anverso y reverso.) Tj ET',
      'BT /F1 12 Tf 48 755 Td (Anverso) Tj ET',
      `q ${frontBox.width.toFixed(2)} 0 0 ${frontBox.height.toFixed(2)} ${frontX.toFixed(2)} 455 cm /Im1 Do Q`,
      'BT /F1 12 Tf 48 420 Td (Reverso) Tj ET',
      `q ${backBox.width.toFixed(2)} 0 0 ${backBox.height.toFixed(2)} ${backX.toFixed(2)} 95 cm /Im2 Do Q`,
    ].join('\n');

    const encoder = new TextEncoder();
    const objects = [
      encoder.encode('<< /Type /Catalog /Pages 2 0 R >>'),
      encoder.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
      encoder.encode('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 4 0 R /Im2 5 0 R >> /Font << /F1 6 0 R >> >> /Contents 7 0 R >>'),
      this.buildPdfImageObject(front),
      this.buildPdfImageObject(back),
      encoder.encode('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
      this.buildPdfStreamObject(encoder.encode(content)),
    ];

    const chunks = [encoder.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
    const offsets = [0];
    let position = chunks[0].length;
    objects.forEach((object, index) => {
      offsets.push(position);
      const header = encoder.encode(`${index + 1} 0 obj\n`);
      const footer = encoder.encode('\nendobj\n');
      chunks.push(header, object, footer);
      position += header.length + object.length + footer.length;
    });
    const xrefPosition = position;
    const xref = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f ']
      .concat(offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n `))
      .concat(['trailer', `<< /Size ${objects.length + 1} /Root 1 0 R >>`, 'startxref', String(xrefPosition), '%%EOF', ''])
      .join('\n');
    chunks.push(encoder.encode(xref));
    return new Blob(chunks, { type: 'application/pdf' });
  }

  async createMultiScanPdf(items) {
    const images = await Promise.all(items.map(async item => ({
      ...item,
      image: await this.prepareImageForPdf(item.file),
    })));
    const encoder = new TextEncoder();
    const pageWidth = 595;
    const cardWidth = 235;
    const cardHeight = 175;
    const cedulaFront = this.fitImageInBox(images[0].image.width, images[0].image.height, cardWidth, cardHeight);
    const cedulaBack = this.fitImageInBox(images[1].image.width, images[1].image.height, cardWidth, cardHeight);
    const leftX = 48;
    const rightX = pageWidth - 48 - cardWidth;
    const topY = 560;
    const bottomY = 275;
    const content = [
      `q ${cedulaFront.width.toFixed(2)} 0 0 ${cedulaFront.height.toFixed(2)} ${(leftX + ((cardWidth - cedulaFront.width) / 2)).toFixed(2)} ${(topY + ((cardHeight - cedulaFront.height) / 2)).toFixed(2)} cm /Im1 Do Q`,
      `q ${cedulaBack.width.toFixed(2)} 0 0 ${cedulaBack.height.toFixed(2)} ${(rightX + ((cardWidth - cedulaBack.width) / 2)).toFixed(2)} ${(topY + ((cardHeight - cedulaBack.height) / 2)).toFixed(2)} cm /Im2 Do Q`,
    ];
    if (images[2]) {
      const bloodCard = this.fitImageInBox(images[2].image.width, images[2].image.height, cardWidth, cardHeight);
      content.push(`q ${bloodCard.width.toFixed(2)} 0 0 ${bloodCard.height.toFixed(2)} ${(leftX + ((cardWidth - bloodCard.width) / 2)).toFixed(2)} ${(bottomY + ((cardHeight - bloodCard.height) / 2)).toFixed(2)} cm /Im3 Do Q`);
    }
    if (images[3]) {
      const fourth = this.fitImageInBox(images[3].image.width, images[3].image.height, cardWidth, cardHeight);
      content.push(`q ${fourth.width.toFixed(2)} 0 0 ${fourth.height.toFixed(2)} ${(rightX + ((cardWidth - fourth.width) / 2)).toFixed(2)} ${(bottomY + ((cardHeight - fourth.height) / 2)).toFixed(2)} cm /Im4 Do Q`);
    }

    const imageResources = images.map((_, index) => `/Im${index + 1} ${index + 4} 0 R`).join(' ');
    const contentObjectId = images.length + 4;

    const objects = [
      encoder.encode('<< /Type /Catalog /Pages 2 0 R >>'),
      encoder.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
      encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << ${imageResources} >> >> /Contents ${contentObjectId} 0 R >>`),
      ...images.map(item => this.buildPdfImageObject(item.image)),
      this.buildPdfStreamObject(encoder.encode(content.join('\n'))),
    ];

    const chunks = [encoder.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
    const offsets = [0];
    let position = chunks[0].length;
    objects.forEach((object, index) => {
      offsets.push(position);
      const header = encoder.encode(`${index + 1} 0 obj\n`);
      const footer = encoder.encode('\nendobj\n');
      chunks.push(header, object, footer);
      position += header.length + object.length + footer.length;
    });
    const xrefPosition = position;
    const xref = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f ']
      .concat(offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n `))
      .concat(['trailer', `<< /Size ${objects.length + 1} /Root 1 0 R >>`, 'startxref', String(xrefPosition), '%%EOF', ''])
      .join('\n');
    chunks.push(encoder.encode(xref));
    return new Blob(chunks, { type: 'application/pdf' });
  }

  async createSingleScanPdf(file) {
    // Los certificados pueden ser hojas verticales o fotografias apaisadas.
    // Se conserva la orientacion entregada por el telefono; la rotacion
    // automatica solo se usa para documentos tipo tarjeta (cedula/carnet).
    const image = await this.prepareImageForPdf(file, { autoRotate: false });
    const encoder = new TextEncoder();
    const pageWidth = 595;
    const pageHeight = 842;
    const fitted = this.fitImageInBox(image.width, image.height, pageWidth - 96, pageHeight - 96);
    const x = (pageWidth - fitted.width) / 2;
    const y = (pageHeight - fitted.height) / 2;
    const content = `q ${fitted.width.toFixed(2)} 0 0 ${fitted.height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im1 Do Q`;
    const objects = [
      encoder.encode('<< /Type /Catalog /Pages 2 0 R >>'),
      encoder.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
      encoder.encode('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>'),
      this.buildPdfImageObject(image),
      this.buildPdfStreamObject(encoder.encode(content)),
    ];
    const chunks = [encoder.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
    const offsets = [0];
    let position = chunks[0].length;
    objects.forEach((object, index) => {
      offsets.push(position);
      const header = encoder.encode(`${index + 1} 0 obj\n`);
      const footer = encoder.encode('\nendobj\n');
      chunks.push(header, object, footer);
      position += header.length + object.length + footer.length;
    });
    const xref = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f ']
      .concat(offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n `))
      .concat(['trailer', `<< /Size ${objects.length + 1} /Root 1 0 R >>`, 'startxref', String(position), '%%EOF', ''])
      .join('\n');
    chunks.push(encoder.encode(xref));
    return new Blob(chunks, { type: 'application/pdf' });
  }

  async prepareImageForPdf(file, options = {}) {
    const imageUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('Una foto no es valida.'));
        element.src = imageUrl;
      });
      const maximumSide = 1600;
      const scale = Math.min(1, maximumSide / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      const bounds = this.detectDocumentBounds(context.getImageData(0, 0, width, height), width, height);
      const rotateDocument = options.autoRotate !== false && bounds.height > bounds.width;
      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = rotateDocument ? bounds.height : bounds.width;
      croppedCanvas.height = rotateDocument ? bounds.width : bounds.height;
      const croppedContext = croppedCanvas.getContext('2d');
      croppedContext.fillStyle = '#FFFFFF';
      croppedContext.fillRect(0, 0, croppedCanvas.width, croppedCanvas.height);
      if (rotateDocument) {
        croppedContext.translate(croppedCanvas.width, 0);
        croppedContext.rotate(Math.PI / 2);
      }
      croppedContext.drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
      return {
        width: croppedCanvas.width,
        height: croppedCanvas.height,
        bytes: this.base64ToBytes(croppedCanvas.toDataURL('image/jpeg', 0.9).split(',')[1]),
      };
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  detectDocumentBounds(imageData, width, height) {
    const pixels = imageData.data;
    const tileSize = Math.max(20, Math.round(Math.min(width, height) / 28));
    const columns = Math.ceil(width / tileSize);
    const rows = Math.ceil(height / tileSize);
    const edgeCounts = new Uint32Array(columns * rows);
    const luminanceAt = (x, y) => {
      const offset = ((y * width) + x) * 4;
      return (pixels[offset] * 0.299) + (pixels[offset + 1] * 0.587) + (pixels[offset + 2] * 0.114);
    };

    for (let y = 2; y < height - 2; y += 2) {
      for (let x = 2; x < width - 2; x += 2) {
        const horizontal = Math.abs(luminanceAt(x + 2, y) - luminanceAt(x - 2, y));
        const vertical = Math.abs(luminanceAt(x, y + 2) - luminanceAt(x, y - 2));
        if (horizontal + vertical < 58) continue;
        const column = Math.floor(x / tileSize);
        const row = Math.floor(y / tileSize);
        edgeCounts[(row * columns) + column] += 1;
      }
    }

    const active = new Uint8Array(columns * rows);
    const minimumEdges = Math.max(5, Math.round((tileSize * tileSize) / 150));
    edgeCounts.forEach((count, index) => {
      if (count >= minimumEdges) active[index] = 1;
    });

    const visited = new Uint8Array(columns * rows);
    let bestCluster = null;
    for (let start = 0; start < active.length; start += 1) {
      if (!active[start] || visited[start]) continue;
      const queue = [start];
      visited[start] = 1;
      let minColumn = columns;
      let maxColumn = 0;
      let minRow = rows;
      let maxRow = 0;
      let score = 0;
      while (queue.length) {
        const index = queue.pop();
        const row = Math.floor(index / columns);
        const column = index % columns;
        minColumn = Math.min(minColumn, column);
        maxColumn = Math.max(maxColumn, column);
        minRow = Math.min(minRow, row);
        maxRow = Math.max(maxRow, row);
        score += edgeCounts[index];
        [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]].forEach(([dx, dy]) => {
          const nextColumn = column + dx;
          const nextRow = row + dy;
          if (nextColumn < 0 || nextColumn >= columns || nextRow < 0 || nextRow >= rows) return;
          const next = (nextRow * columns) + nextColumn;
          if (!active[next] || visited[next]) return;
          visited[next] = 1;
          queue.push(next);
        });
      }
      const clusterWidth = (maxColumn - minColumn + 1) * tileSize;
      const clusterHeight = (maxRow - minRow + 1) * tileSize;
      const centerX = ((minColumn + maxColumn + 1) * tileSize) / 2;
      const centerY = ((minRow + maxRow + 1) * tileSize) / 2;
      const centerDistance = Math.hypot((centerX - width / 2) / width, (centerY - height / 2) / height);
      const weightedScore = score * Math.max(0.45, 1 - centerDistance);
      if (clusterWidth < width * 0.12 || clusterHeight < height * 0.06) continue;
      if (!bestCluster || weightedScore > bestCluster.score) {
        bestCluster = { minColumn, maxColumn, minRow, maxRow, score: weightedScore };
      }
    }

    if (!bestCluster) {
      return { x: 0, y: 0, width, height };
    }

    let cropWidth = (bestCluster.maxColumn - bestCluster.minColumn + 1) * tileSize;
    let cropHeight = (bestCluster.maxRow - bestCluster.minRow + 1) * tileSize;
    const centerX = ((bestCluster.minColumn + bestCluster.maxColumn + 1) * tileSize) / 2;
    const centerY = ((bestCluster.minRow + bestCluster.maxRow + 1) * tileSize) / 2;
    const landscape = cropWidth >= cropHeight;
    const expectedRatio = landscape ? 1.58 : (1 / 1.58);
    const currentRatio = cropWidth / cropHeight;
    if (currentRatio < expectedRatio) cropWidth = cropHeight * expectedRatio;
    else cropHeight = cropWidth / expectedRatio;
    cropWidth *= 1.12;
    cropHeight *= 1.12;
    cropWidth = Math.min(width, Math.round(cropWidth));
    cropHeight = Math.min(height, Math.round(cropHeight));
    const x = Math.max(0, Math.min(width - cropWidth, Math.round(centerX - (cropWidth / 2))));
    const y = Math.max(0, Math.min(height - cropHeight, Math.round(centerY - (cropHeight / 2))));
    return {
      x,
      y,
      width: cropWidth,
      height: cropHeight,
    };
  }

  fitImageInBox(width, height, maxWidth, maxHeight) {
    const scale = Math.min(maxWidth / width, maxHeight / height);
    return { width: width * scale, height: height * scale };
  }

  buildPdfImageObject(image) {
    const encoder = new TextEncoder();
    const header = encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`);
    return this.concatBytes([header, image.bytes, encoder.encode('\nendstream')]);
  }

  buildPdfStreamObject(bytes) {
    const encoder = new TextEncoder();
    return this.concatBytes([encoder.encode(`<< /Length ${bytes.length} >>\nstream\n`), bytes, encoder.encode('\nendstream')]);
  }

  escapePdfText(text) {
    return String(text).replace(/[\\()]/g, '\\$&');
  }

  base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  concatBytes(chunks) {
    const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    chunks.forEach(chunk => {
      result.set(chunk, offset);
      offset += chunk.length;
    });
    return result;
  }

  readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      reader.readAsDataURL(file);
    });
  }
}

export default MobileDocumentUploadView;
