import { LocalScannerService } from '../services/LocalScannerService.js';
import { editDocument, loadScanner, photoCanvas, detectCorners } from '../services/DocumentScannerService.js';
import { createDocumentImageSheet } from '../services/DocumentImageSheet.js';
import { recognizeCedula, isCedulaOcrPilotUser } from '../services/CedulaOcrPilot.js';
import { authService } from '../core/auth/AuthService.js';

export function openScannerDeviceDialog(options = {}) {
  const pilot = isCedulaOcrPilotUser(authService.getCurrentUser()?.userId) && options.pilot === true;
  const inline = Boolean(options.container);
  const bloodOnly = options.bloodOnly === true;
  if (!inline && document.querySelector('dialog[data-local-scanner-dialog]')) return;
  const dialog = document.createElement(inline ? 'section' : 'dialog');
  dialog.dataset.localScannerDialog = '';
  dialog.className = `document-capture${inline ? ' document-capture--inline' : ''}`;
  if (!document.querySelector('[data-capture-style]')) {
    const style = document.createElement('link'); style.rel = 'stylesheet';
    style.href = '/src/assets/css/components/document-capture.css?v=arrastrar-cedula-20261112'; style.dataset.captureStyle = ''; document.head.append(style);
  }
  if (inline && !document.querySelector('[data-capture-inline-style]')) {
    const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/src/assets/css/components/document-capture-inline.css'; style.dataset.captureInlineStyle = ''; document.head.append(style);
  }
  dialog.innerHTML = `<header class="capture-heading"><div><span class="capture-eyebrow">DOCUMENTOS DEL ESTUDIANTE</span><h2>Capturar cédula y carnet</h2>
    <p>${pilot ? 'Captura ambas caras: los datos se llenarán automáticamente.' : 'Captura ambas caras para preparar un documento A4.'}</p></div>
    <button type="button" class="btn btn-secondary" data-close>Cerrar</button></header>
    <section class="capture-connection"><div class="capture-section-title"><h3>1. Elige cómo capturar</h3><span class="capture-badge" data-connection>Sin conectar</span></div>
    <div class="capture-device-row"><label>Escáner disponible<select data-device disabled><option value="">Conecta el escáner</option></select></label>
    <button type="button" class="btn btn-secondary" data-search>Conectar escáner</button></div>
    <details data-pairing><summary>Configurar conexión</summary><div class="capture-settings">
    <p>Solo la primera vez: abre el puente de escaneo en esta computadora y vincula este navegador. Después conectará automáticamente.</p>
    <label>Código del puente<input data-token type="password" autocomplete="off" spellcheck="false"></label>
    <label class="capture-check"><input type="checkbox" data-remember checked> Recordar conexión en esta computadora</label>
    <button type="button" class="btn btn-secondary" data-forget>Olvidar conexión</button>
    <small>Origen autorizado: <code data-origin></code>. Mantén el puente abierto mientras escaneas.</small></div></details></section>
    <section class="capture-section"><h3>2. Captura los documentos</h3>
    <label>¿Qué vas a escanear?<select data-mode><option value="original">Documentos originales: frente y reverso por separado</option><option value="copy">Copia en papel con ambas caras en la misma hoja</option></select></label>
    <p data-mode-hint class="capture-hint">El carnet es opcional. Si la copia solo tiene una cara, utiliza la captura por separado.</p>
    <label class="capture-check" data-original-control><input type="checkbox" data-combined> Incluir el carnet junto al frente en un solo escaneo (opcional)</label>
    <p data-combined-help hidden class="capture-hint">Coloca la cédula en la mitad superior del cristal y el carnet en la mitad inferior, uno debajo del otro, separados y sin cruzar el centro. Después escanea solo el reverso de la cédula.</p>
    <div data-cards class="capture-cards">${[['front','Frente de la cédula','data-scan'],['back','Reverso de la cédula','data-back'],['blood','Carnet de tipo sanguíneo','data-blood']].map(([side,title,attribute], i) => `<section data-card="${side}" class="capture-card"><div class="capture-card-title"><span>${i+1}</span><h4>${title}</h4></div>
      <div data-image="${side}" class="capture-image"><span>Sin captura${side === 'blood' ? ' · opcional' : ''}</span></div>
      <button type="button" class="btn btn-secondary" ${attribute} disabled>Escanear ${side === 'front' ? 'frente' : side === 'back' ? 'reverso' : 'carnet'}</button>
      ${side === 'blood' ? '<button type="button" class="btn btn-secondary" data-remove-blood hidden>Quitar carnet</button>' : ''}</section>`).join('')}</div>
    <div data-copy-panel hidden><p class="capture-hint">Coloca la hoja en el cristal. Se conservará completa, sin separar ni recortar sus documentos.</p>
      <button type="button" class="btn btn-secondary" data-copy-scan disabled>Escanear copia</button>
      <div data-copy-image class="capture-image">Sin captura</div>
      <label class="capture-check"><input type="checkbox" data-copy-complete> La hoja contiene frente y reverso de la cédula</label>
      <label class="capture-check"><input type="checkbox" data-copy-blood> La hoja también incluye el carnet de tipo sanguíneo</label>
    </div></section>
    <div data-ocr-slot></div>
    <div class="capture-section">
    <button type="button" class="btn btn-primary" data-pdf disabled>Generar y guardar</button>
    <div data-result hidden><a data-download download="cedula.pdf" class="btn btn-secondary">Descargar PDF</a><iframe title="Cédula en PDF A4"></iframe></div></div>
    ${options.onCertificate ? `<section class="capture-card" data-certificate-card><div class="capture-card-title"><span>4</span><h4>Título o certificado de estudio · opcional</h4></div><p class="capture-hint">Coloca el documento completo en el cristal. Se guardará en una sola hoja, sin separar sus partes.</p><div data-certificate-preview class="capture-image"><span>Sin captura · opcional</span></div><button type="button" class="btn btn-secondary" data-certificate disabled>Escanear título o certificado</button>${pilot || options.photos ? '<label class="capture-photo">Tomar o elegir foto<input type="file" data-certificate-photo accept="image/jpeg,image/png" capture="environment" aria-label="Foto del título o certificado de estudio"></label>' : ''}<button type="button" class="btn btn-secondary" data-remove-certificate hidden>Quitar captura</button></section>` : ''}
    <footer class="capture-status" hidden><p role="status" aria-live="polite"></p></footer>
    <img data-preview hidden alt="Captura del escáner">`;
  (options.container || document.body).append(dialog);
  const certificateCard = dialog.querySelector('[data-certificate-card]');
  if (certificateCard) {
    dialog.querySelector('[data-copy-panel]').after(certificateCard);
    const consultation = document.createElement('a');
    consultation.href = 'https://servicios.educacion.gob.ec/titulacion25-web/faces/paginas/consulta-titulos-refrendados.xhtml';
    consultation.target = '_blank';
    consultation.rel = 'noopener noreferrer';
    consultation.className = 'capture-certificate-link';
    consultation.textContent = 'Consultar título de bachiller';
    certificateCard.querySelector('.capture-card-title').after(consultation);
  }
  if (inline) dialog.querySelector('.capture-heading').remove();
  if (bloodOnly) {
    dialog.querySelectorAll('[data-card="front"],[data-card="back"],[data-original-control],[data-combined-help]').forEach(element => { element.hidden = true; });
    dialog.querySelector('[data-mode]').closest('label').hidden = true;
    dialog.querySelector('[data-cards]').style.gridTemplateColumns = '1fr';
    dialog.querySelector('[data-pdf]').textContent = 'Preparar PDF con el carnet';
    dialog.querySelectorAll('.capture-section h3').forEach(title => { title.textContent = '2. Captura el carnet pendiente'; });
    const hint = dialog.querySelector('.capture-section .capture-hint');
    if (hint) hint.textContent = 'Escanea solo el carnet o toma una foto. La cedula guardada se conservara en el documento combinado.';
  }
  if (pilot || options.photos) {
    for (const [side,label] of [['front','frente'],['back','reverso'],['blood','carnet']]) {
      const upload = document.createElement('label'); upload.className = 'capture-photo';
      upload.textContent = 'Tomar o elegir foto';
      const input = document.createElement('input'); input.type = 'file'; input.dataset.photo = side;
      input.accept = 'image/jpeg,image/png'; input.setAttribute('capture','environment'); input.setAttribute('aria-label',`Foto del ${label}`);
      upload.append(input); dialog.querySelector(`[data-card="${side}"]`).append(upload);
    }
  }
  // Start loading while the user selects the scanner, rather than after acquisition.
  loadScanner().catch(() => {});
  dialog.querySelector('[data-origin]').textContent = window.location.origin;
  const token = dialog.querySelector('[data-token]'), select = dialog.querySelector('[data-device]');
  const remember = dialog.querySelector('[data-remember]');
  const pairingKey = 'sportmancar.scanner.pairing';
  try { const saved = localStorage.getItem(pairingKey); if (saved) { token.value = saved; remember.checked = true; } } catch {}
  remember.onchange = () => { if (!remember.checked) { try { localStorage.removeItem(pairingKey); } catch {} } };
  dialog.querySelector('[data-forget]').onclick = () => {
    if (busy) return;
    try { localStorage.removeItem(pairingKey); } catch {}
    token.value = ''; remember.checked = false;
    select.replaceChildren(); select.disabled = true;
    scan.disabled = back.disabled = blood.disabled = copyScan.disabled = true;
    dialog.querySelector('[data-connection]').textContent = 'Sin conectar';
    dialog.querySelector('[data-pairing]').open = true;
    status.textContent = 'Vinculación olvidada en este navegador. Introduce el código del puente para volver a conectar.';
  };
  const search = dialog.querySelector('[data-search]'), scan = dialog.querySelector('[data-scan]');
  const status = dialog.querySelector('[role=status]'), preview = dialog.querySelector('[data-preview]');
  const statusObserver = new MutationObserver(() => { status.parentElement.hidden = !status.textContent.trim(); });
  statusObserver.observe(status, { childList: true, characterData: true, subtree: true });
  const certificate = dialog.querySelector('[data-certificate]');
  const removeCertificate = dialog.querySelector('[data-remove-certificate]');
  let busy = false, imageUrl;
  let disposed = false;
  const captures = {};
  let acceptCertificate;
  let lastOcrFront, lastOcrBack;
  const mode = dialog.querySelector('[data-mode]'), copyScan = dialog.querySelector('[data-copy-scan]');
  const copyComplete = dialog.querySelector('[data-copy-complete]'), copyBlood = dialog.querySelector('[data-copy-blood]');
  const copyMode = () => mode.value === 'copy';
  const canGenerate = () => bloodOnly ? Boolean(captures.blood) : copyMode() ? Boolean(captures.copy && copyComplete.checked) : Boolean(captures.front && captures.back);
  const back = dialog.querySelector('[data-back]'), pdf = dialog.querySelector('[data-pdf]');
  const blood = dialog.querySelector('[data-blood]'), removeBlood = dialog.querySelector('[data-remove-blood]');
  const combined = dialog.querySelector('[data-combined]');
  combined.onchange = () => {
    dialog.querySelector('[data-combined-help]').hidden = !combined.checked;
    scan.textContent = combined.checked ? 'Escanear frente + carnet' : captures.front ? 'Repetir frente' : 'Escanear frente';
  };
  const result = dialog.querySelector('[data-result]');
  let uploadedDocumentNotice;
  let removeUploadedDocument;
  let identityDropZone;
  let uploadConfirmation;
  let pdfUrl;
  let pdfRevision = 0;
  const clearPdf = () => {
    pdfRevision++;
    options.onInvalidate?.();
    result.hidden = true;
    result.querySelector('iframe').removeAttribute('src');
    result.querySelector('a').removeAttribute('href');
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    pdfUrl = null;
    if (uploadedDocumentNotice) uploadedDocumentNotice.hidden = true;
    if (removeUploadedDocument) removeUploadedDocument.hidden = true;
    identityDropZone?.classList.remove('has-certificate');
  };
  mode.onchange = () => {
    dialog.querySelector('[data-cards]').hidden = copyMode();
    dialog.querySelector('[data-original-control]').hidden = copyMode();
    dialog.querySelector('[data-combined-help]').hidden = copyMode() || !combined.checked;
    dialog.querySelector('[data-copy-panel]').hidden = !copyMode();
    dialog.querySelector('[data-mode-hint]').textContent = 'El título o certificado de estudio es opcional y se captura completo en una sola hoja.';
    pdf.hidden = false;
    result.hidden = true;
    clearPdf(); pdf.disabled = !canGenerate();
    status.textContent = copyMode() ? 'Escanea la copia completa y confirma qué documentos contiene. También puedes escanear el título en la misma sesión.' : 'Captura frente y reverso. El carnet y el título siguen siendo opcionales.';
  };
  for (const checkbox of [copyComplete, copyBlood]) checkbox.onchange = () => { clearPdf(); pdf.disabled = !canGenerate(); };
  if (pilot || options.photos) {
    const label = document.createElement('label'); label.className = 'capture-photo'; label.textContent = 'Tomar o elegir foto de la copia';
    const input = document.createElement('input'); input.type = 'file'; input.dataset.copyPhoto = ''; input.accept = 'image/jpeg,image/png'; input.setAttribute('capture','environment');
    label.append(input); dialog.querySelector('[data-copy-panel]').prepend(label);
  }
  const close = () => { if (busy) { status.textContent = 'Espera a que termine la operación antes de cerrar.'; return; } dialog.close(); };
  dialog.oncancel = event => { event.preventDefault(); close(); };
  const dispose = () => { disposed = true; statusObserver.disconnect(); clearPdf(); if (imageUrl) URL.revokeObjectURL(imageUrl); token.value = ''; dialog.remove(); };
  dialog.onclose = dispose;
  const closeButton = dialog.querySelector('[data-close]'); if (closeButton) closeButton.onclick = close;
  const run = async action => {
    if (busy || disposed) return;
    busy = true; search.disabled = scan.disabled = back.disabled = blood.disabled = removeBlood.disabled = pdf.disabled = select.disabled = token.disabled = true;
    if (certificate) certificate.disabled = true;
    if (removeCertificate) removeCertificate.disabled = true;
    dialog.querySelectorAll('[data-certificate-photo]').forEach(input => { input.disabled = true; });
    mode.disabled = copyScan.disabled = copyComplete.disabled = copyBlood.disabled = true;
    dialog.querySelectorAll('[data-copy-photo]').forEach(control => { control.disabled = true; });
    combined.disabled = true;
    dialog.querySelectorAll('[data-photo]').forEach(control => { control.disabled = true; });
    dialog.querySelectorAll('[data-crop]').forEach(button => { button.disabled = true; });
    try {
      await action(new LocalScannerService(token.value.trim()));
      const front = copyMode() ? captures.copy?.canvas : captures.front?.canvas;
      const back = copyMode() ? null : captures.back?.canvas;
      if (pilot && !disposed && front && (copyMode() || back)
        && (front !== lastOcrFront || back !== lastOcrBack)) {
        const values = await recognizeCedula(back ? [front, back] : [front], message => { status.textContent = message; });
        if (!disposed) {
          options.onData?.(Object.fromEntries(['identification','firstName','lastName','birthDate'].map(key => [key, values[key] || ''])));
          lastOcrFront = front; lastOcrBack = back;
          status.textContent = 'Lectura terminada: los datos reconocidos se llenaron en el formulario. Los no reconocidos se pueden completar en Datos.';
        }
      }
    }
    catch (error) {
      status.textContent = error.message;
      if (error.status === 401) {
        select.replaceChildren(); dialog.querySelector('[data-pairing]').open = true;
        dialog.querySelector('[data-connection]').textContent = 'Revisar conexión';
        try { localStorage.removeItem(pairingKey); } catch {}
      }
    }
    finally {
      busy = false; search.disabled = token.disabled = false; select.disabled = scan.disabled = !select.value;
      if (certificate) certificate.disabled = !select.value;
      if (removeCertificate) removeCertificate.disabled = false;
      dialog.querySelectorAll('[data-certificate-photo]').forEach(input => { input.disabled = false; });
      mode.disabled = copyComplete.disabled = copyBlood.disabled = false;
      copyScan.disabled = !select.value;
      dialog.querySelectorAll('[data-copy-photo]').forEach(control => { control.disabled = false; });
      combined.disabled = false;
      back.disabled = !select.value || !captures.front;
      blood.disabled = !select.value || (!bloodOnly && (!captures.front || !captures.back));
      removeBlood.disabled = false;
      pdf.disabled = !canGenerate();
      dialog.querySelectorAll('[data-photo]').forEach(control => { control.disabled = false; });
      dialog.querySelectorAll('[data-crop]').forEach(button => { button.disabled = false; });
    }
  };
  if (options.onDocument && !bloodOnly) {
    const frontCard = dialog.querySelector('[data-card="front"]');
    identityDropZone = frontCard.querySelector('[data-image="front"]');
    identityDropZone.classList.add('capture-certificate-drop');
    identityDropZone.setAttribute('role', 'button');
    identityDropZone.setAttribute('tabindex', '0');
    identityDropZone.setAttribute('aria-label', 'Adjuntar PDF de cédula');
    identityDropZone.textContent = 'Arrastra el PDF aquí o haz clic para seleccionarlo';
    const uploadButton = document.createElement('button');
    uploadButton.type = 'button'; uploadButton.className = 'btn btn-secondary';
    uploadButton.textContent = 'Subir PDF de cédula';
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.pdf,application/pdf'; input.hidden = true;
    uploadedDocumentNotice = document.createElement('p');
    uploadedDocumentNotice.className = 'capture-uploaded-document'; uploadedDocumentNotice.hidden = true;
    removeUploadedDocument = document.createElement('button');
    removeUploadedDocument.type = 'button'; removeUploadedDocument.className = 'btn btn-secondary';
    removeUploadedDocument.textContent = 'Quitar PDF'; removeUploadedDocument.hidden = true;
    removeUploadedDocument.onclick = () => { if (!busy) { clearPdf(); status.textContent = 'PDF retirado.'; } };
    frontCard.append(uploadButton, input, uploadedDocumentNotice, removeUploadedDocument);
    uploadButton.onclick = () => { if (!busy && !disposed) input.click(); };
    identityDropZone.onclick = uploadButton.onclick;
    identityDropZone.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); uploadButton.onclick(); }
    };
    identityDropZone.ondragover = event => {
      event.preventDefault();
      if (!busy && !disposed) identityDropZone.classList.add('is-dragging');
    };
    identityDropZone.ondragleave = () => identityDropZone.classList.remove('is-dragging');
    identityDropZone.ondrop = event => {
      event.preventDefault(); identityDropZone.classList.remove('is-dragging');
      if (busy || disposed) return;
      const files = event.dataTransfer?.files;
      if (files?.length !== 1) { status.textContent = 'Selecciona un solo archivo PDF.'; return; }
      openPdfConfirmation(files[0]);
    };
    input.onchange = () => {
      const file = input.files?.[0]; input.value = '';
      if (file) openPdfConfirmation(file);
    };
    const openPdfConfirmation = async file => {
      if (!file || busy || disposed) return;
      try {
        if (file.size > 9 * 1024 * 1024) throw new Error('El PDF no puede superar 9 MB.');
        const signature = new Uint8Array(await file.slice(0, 5).arrayBuffer());
        if (String.fromCharCode(...signature) !== '%PDF-') throw new Error('Selecciona un archivo PDF válido.');
        if (disposed) return;
        uploadConfirmation?.remove();
        uploadConfirmation = document.createElement('dialog');
        uploadConfirmation.className = 'capture-pdf-confirmation';
        uploadConfirmation.innerHTML = `<form method="dialog"><h3>¿Qué incluye el PDF?</h3>
          <p data-filename></p>
          <label class="capture-check"><input type="checkbox" data-front> Frente de la cédula</label>
          <label class="capture-check"><input type="checkbox" data-back> Reverso de la cédula</label>
          <label class="capture-check"><input type="checkbox" data-blood> Carnet de tipo sanguíneo</label>
          <p class="capture-hint">Confirma frente y reverso para adjuntar la cédula.</p>
          <div class="capture-pdf-actions"><button type="button" class="btn btn-secondary" data-cancel>Cancelar</button>
          <button type="button" class="btn btn-primary" data-confirm disabled>Adjuntar PDF</button></div></form>`;
        uploadConfirmation.querySelector('[data-filename]').textContent = file.name;
        const front = uploadConfirmation.querySelector('[data-front]');
        const reverse = uploadConfirmation.querySelector('[data-back]');
        const confirm = uploadConfirmation.querySelector('[data-confirm]');
        const update = () => { confirm.disabled = !(front.checked && reverse.checked); };
        front.onchange = reverse.onchange = update;
        uploadConfirmation.querySelector('[data-cancel]').onclick = () => uploadConfirmation.close();
        uploadConfirmation.onclose = () => { uploadConfirmation?.remove(); uploadConfirmation = null; };
        confirm.onclick = async () => {
          if (!front.checked || !reverse.checked || busy || disposed) return;
          confirm.disabled = true;
          try {
            const fileUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(new Error('No se pudo leer el PDF.'));
              reader.readAsDataURL(new Blob([file], {type:'application/pdf'}));
            });
            if (disposed || !uploadConfirmation?.open) return;
            const includesBloodCard = uploadConfirmation.querySelector('[data-blood]').checked;
            clearPdf();
            await options.onDocument(fileUrl, includesBloodCard);
            uploadedDocumentNotice.textContent = `PDF adjunto: ${file.name}${includesBloodCard ? ' · incluye carnet' : ''}`;
            uploadedDocumentNotice.hidden = false;
            removeUploadedDocument.hidden = false;
            identityDropZone.classList.add('has-certificate');
            status.textContent = 'PDF preparado. Se guardará al confirmar el registro.';
            uploadConfirmation.close();
          } catch (error) { status.textContent = error.message; update(); }
        };
        dialog.append(uploadConfirmation);
        uploadConfirmation.showModal();
      } catch (error) { status.textContent = error.message; }
    };
  }
  search.onclick = () => run(async client => {
    if (!token.value.trim()) {
      dialog.querySelector('[data-pairing]').open = true; token.focus();
      status.textContent = 'Vincula esta computadora una sola vez. Deja marcada «Recordar conexión» para no volver a escribir el código.';
      return;
    }
    status.textContent = 'Buscando escáneres configurados en Windows…';
    select.replaceChildren();
    const devices = await client.devices();
    try {
      if (remember.checked) localStorage.setItem(pairingKey, token.value.trim());
      else localStorage.removeItem(pairingKey);
    } catch { status.textContent = 'El navegador no permite recordar la vinculación.'; }
    for (const device of devices) { const option = document.createElement('option'); option.value = device.id; option.textContent = `${device.name} · ${device.interface}`; select.append(option); }
    let previous; try { previous = localStorage.getItem('sportmancar.scanner.device'); } catch {}
    if (devices.some(device => device.id === previous)) select.value = previous;
    dialog.querySelector('[data-connection]').textContent = devices.length ? 'Conectado' : 'Sin dispositivos';
    search.textContent = 'Actualizar dispositivos';
    if (devices.length) dialog.querySelector('[data-pairing]').open = false;
    status.textContent = devices.length ? 'Coloca el documento en el cristal. El recorte se procesará automáticamente; podrás corregirlo si lo necesitas.' : 'Windows no informa escáneres WIA. Revisa alimentación, conexión y controlador; una impresora instalada no garantiza escaneo WIA.';
  });
  const crop = async (side, file, automatic = true) => {
    status.textContent = automatic ? 'Procesando recorte automático… Si no se detectan los bordes, se abrirá el ajuste manual.' : 'Ajusta el recorte y la orientación del documento.';
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    const canvas = await editDocument(file, { maximumSide: 3600, automatic });
    if (disposed) return;
    if (!canvas) { status.textContent = 'Recorte cancelado. Se conserva la captura anterior, si existía.'; return; }
    clearPdf(); captures[side] = { file, canvas };
    let card = dialog.querySelector(`[data-card="${side}"]`);
    if (!card.querySelector('[data-crop]')) {
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'btn btn-secondary'; edit.dataset.crop = side; edit.textContent = 'Corregir recorte';
      edit.onclick = () => run(() => crop(side, captures[side].file, false));
      card.append(edit);
    }
    card.querySelector('[data-image]').replaceChildren(canvas);
    card.classList.add('has-capture');
    (side === 'front' ? scan : side === 'back' ? back : blood).textContent = side === 'front' ? 'Repetir frente' : side === 'back' ? 'Repetir reverso' : 'Repetir carnet';
    removeBlood.hidden = !captures.blood;
    status.textContent = side === 'front' ? 'Voltea la cédula para escanear el reverso.' : side === 'back' ? 'Puedes escanear el carnet para incluirlo debajo de la cédula, o generar el PDF solo con ambas caras.' : 'Carnet listo. El PDF incluirá frente, reverso y carnet uno debajo del otro.';
    return true;
  };
  const acceptCopy = async file => {
    const canvas = await photoCanvas(file, 3600);
    if (disposed) return;
    clearPdf(); captures.copy = { file, canvas };
    copyComplete.checked = copyBlood.checked = false;
    dialog.querySelector('[data-copy-image]').replaceChildren(canvas);
    copyScan.textContent = 'Repetir copia';
    status.textContent = 'Copia capturada completa. Indica si contiene ambas caras y si incluye el carnet antes de generar el PDF.';
  };
  const capture = side => run(async client => {
    const started = performance.now();
    status.textContent = 'Escaneando… No cierres esta ventana.';
    preview.hidden = true;
    if (imageUrl) { URL.revokeObjectURL(imageUrl); imageUrl = null; }
    preview.removeAttribute('src');
    const data = await client.scan(select.value, pilot ? 300 : undefined);
    if (disposed) return;
    if (pilot && data.dpi !== 300) throw new Error('La captura no confirma 300 ppp. Actualiza el puente a v1.7 para esta prueba, o utiliza fotografías.');
    const acquired = performance.now();
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data.imageUrl)) throw new Error('El servicio devolvió una imagen inválida.');
    const blob = await (await fetch(data.imageUrl)).blob();
    if (side === 'copy') {
      await acceptCopy(new File([blob], 'copia.jpg', { type: 'image/jpeg' }));
    } else if (side === 'front' && combined.checked) {
      status.textContent = 'Separando la cédula y el carnet de la misma captura…';
      const full = await photoCanvas(new File([blob], 'captura.jpg', { type: 'image/jpeg' }), 3600);
      const width = full.width, halfHeight = Math.floor(full.height / 2);
      const files = {};
      for (const [key,y,height] of [['front',0,halfHeight],['blood',halfHeight,full.height-halfHeight]]) {
        const region = document.createElement('canvas'); region.width = width; region.height = height;
        region.getContext('2d').drawImage(full,0,y,width,height,0,0,width,height);
        if (key === 'blood') {
          // A blank lower half must not become a blood-card document.
          let detected = false;
          try {
            const cv = await loadScanner(); const points = detectCorners(cv, region);
            detected = points.some((p,i) => Math.abs(p.x - [0,width-1,width-1,0][i]) > 1 || Math.abs(p.y - [0,0,height-1,height-1][i]) > 1);
          } catch { /* Keep the carnet optional if detection is unavailable. */ }
          if (!detected) continue;
        }
        const part = await new Promise(resolve => region.toBlob(resolve, 'image/jpeg', 0.95));
        if (!part) throw new Error('No se pudo separar la captura. Repite el escaneo.');
        files[key] = new File([part], `${key}.jpg`, { type: 'image/jpeg' });
      }
      const accepted = await crop('front', files.front);
      if (!accepted) return;
      if (disposed) return;
      if (files.blood) await crop('blood', files.blood);
      if (disposed) return;
      status.textContent = files.blood ? 'Captura conjunta procesada. Voltea solo la cédula para escanear el reverso.' : 'No se detectó un carnet en la mitad inferior. Puedes continuar sin carnet o capturarlo por separado; una captura anterior del carnet se conserva.';
      combined.onchange();
    } else {
      await crop(side, new File([blob], `${side}.jpg`, { type: 'image/jpeg' }));
    }
    // The second duration includes review time if automatic detection fell back to the editor.
    status.textContent += ` Captura y transferencia: ${((acquired - started) / 1000).toFixed(1)} s. Procesamiento y revisión: ${((performance.now() - acquired) / 1000).toFixed(1)} s.`;
    try { localStorage.setItem('sportmancar.scanner.device', select.value); } catch {}
  });
  scan.onclick = () => capture('front');
  back.onclick = () => capture('back');
  blood.onclick = () => capture('blood');
  if (certificate) {
    const dropZone = dialog.querySelector('[data-certificate-preview]');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf,application/pdf,image/jpeg,image/png';
    fileInput.hidden = true;
    certificateCard.append(fileInput);
    dropZone.classList.add('capture-certificate-drop');
    dropZone.setAttribute('role', 'button');
    dropZone.setAttribute('tabindex', '0');
    dropZone.setAttribute('aria-label', 'Adjuntar título o certificado de estudio');
    const resetDropZone = () => {
      dropZone.classList.remove('has-certificate');
      dropZone.textContent = 'Arrastra el PDF o una imagen aquí, o haz clic para seleccionar';
    };
    resetDropZone();
    const prepareCertificate = async file => {
      const canvas = await photoCanvas(file, 3600);
      const jpeg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!jpeg) throw new Error('No se pudo preparar el certificado.');
      const blob = createDocumentImageSheet([{ width: canvas.width, height: canvas.height, bytes: new Uint8Array(await jpeg.arrayBuffer()) }], { fullPage: true });
      if (blob.size > 9 * 1024 * 1024) throw new Error('El certificado supera 9 MB.');
      const fileUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('No se pudo leer el certificado.')); reader.readAsDataURL(blob); });
      if (disposed) return;
      await options.onCertificate(fileUrl);
      const host = dialog.querySelector('[data-certificate-preview]');
      host.replaceChildren(canvas); host.hidden = false;
      host.classList.add('has-certificate');
      canvas.style.maxWidth = '100%'; canvas.style.maxHeight = '240px'; canvas.style.objectFit = 'contain';
      removeCertificate.hidden = false;
      certificate.textContent = 'Repetir certificado';
      status.textContent = 'Título o certificado preparado en una sola hoja. Se guardará al confirmar el registro del estudiante.';
    };
    acceptCertificate = prepareCertificate;
    const attachCertificate = async file => {
      if (!file) return;
      if (file.size > 9 * 1024 * 1024) throw new Error('El certificado supera 9 MB.');
      const type = String(file.type || '').toLowerCase();
      if (type === 'application/pdf' || (!type && /\.pdf$/i.test(file.name))) {
        const signature = new Uint8Array(await file.slice(0, 5).arrayBuffer());
        if (String.fromCharCode(...signature) !== '%PDF-') throw new Error('El archivo no es un PDF válido.');
        const pdfFile = new Blob([file], { type: 'application/pdf' });
        const fileUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('No se pudo leer el certificado.'));
          reader.readAsDataURL(pdfFile);
        });
        if (disposed) return;
        await options.onCertificate(fileUrl);
        dropZone.classList.add('has-certificate');
        dropZone.textContent = `Documento adjunto: ${file.name}`;
        removeCertificate.hidden = false;
        certificate.textContent = 'Escanear otro certificado';
        status.textContent = 'Certificado adjunto. Se guardará al confirmar el registro del estudiante.';
      } else if (['image/jpeg', 'image/png'].includes(type)) {
        await prepareCertificate(file);
      } else {
        throw new Error('Selecciona un archivo PDF, JPG o PNG.');
      }
    };
    dropZone.onclick = () => { if (!busy && !disposed) fileInput.click(); };
    dropZone.onkeydown = event => {
      if ((event.key === 'Enter' || event.key === ' ') && !busy && !disposed) {
        event.preventDefault(); fileInput.click();
      }
    };
    dropZone.ondragover = event => { event.preventDefault(); if (!busy) dropZone.classList.add('is-dragging'); };
    dropZone.ondragleave = () => dropZone.classList.remove('is-dragging');
    dropZone.ondrop = event => {
      event.preventDefault(); dropZone.classList.remove('is-dragging');
      if (busy || disposed) return;
      const files = event.dataTransfer?.files;
      if (files?.length !== 1) { status.textContent = 'Selecciona un solo archivo para el certificado.'; return; }
      run(() => attachCertificate(files[0]));
    };
    fileInput.onchange = () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (file) run(() => attachCertificate(file));
    };
    certificate.onclick = () => run(async client => {
      status.textContent = 'Escaneando certificado…';
      const data = await client.scan(select.value, 300);
      if (disposed) return;
      if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data.imageUrl)) throw new Error('El escáner devolvió una imagen inválida.');
      const image = await (await fetch(data.imageUrl)).blob();
      await prepareCertificate(new File([image], 'certificado.jpg', { type: 'image/jpeg' }));
    });
    const photo = dialog.querySelector('[data-certificate-photo]');
    if (photo) photo.onchange = () => { const file = photo.files[0]; if (file) run(() => prepareCertificate(file)); };
    removeCertificate.onclick = () => {
      if (busy) return;
      options.onCertificate('');
      resetDropZone(); dropZone.hidden = false; fileInput.value = '';
      if (photo) photo.value = '';
      removeCertificate.hidden = true; certificate.textContent = 'Escanear certificado';
      status.textContent = '';
    };
  }
  copyScan.onclick = () => capture('copy');
  const copyPhoto = dialog.querySelector('[data-copy-photo]');
  if (copyPhoto) copyPhoto.onchange = () => { const file = copyPhoto.files[0]; if (file) run(() => acceptCopy(file)); };
  removeBlood.onclick = () => {
    if (busy) return;
    delete captures.blood;
    const card = dialog.querySelector('[data-card="blood"]');
    card.querySelector('[data-image]').textContent = 'Sin captura · opcional';
    card.querySelector('[data-crop]')?.remove(); card.classList.remove('has-capture');
    const upload = card.querySelector('input[type=file]'); if (upload) upload.value = '';
    clearPdf(); removeBlood.hidden = true; blood.textContent = 'Escanear carnet (opcional)';
    status.textContent = 'Carnet retirado. Genera nuevamente el PDF con ambas caras de la cédula.';
  };
  pdf.onclick = () => run(async () => {
    if (bloodOnly) {
      if (!captures.blood) throw new Error('Captura el carnet antes de preparar el PDF.');
      const fileUrl = captures.blood.canvas.toDataURL('image/jpeg', 0.92);
      await options.onBloodCard?.(fileUrl);
      status.textContent = 'Vista previa preparada. Comprueba la legibilidad y guarda el documento combinado debajo.';
      return;
    }
    if (!canGenerate()) throw new Error(copyMode() ? 'Escanea la copia y confirma que incluye ambas caras de la cédula.' : 'Escanea ambas caras de la cédula.');
    const images = (copyMode() ? ['copy'] : captures.blood ? ['front', 'back', 'blood'] : ['front', 'back']).map(side => {
      const canvas = captures[side].canvas;
      const raw = atob(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
      return { width: canvas.width, height: canvas.height, bytes: Uint8Array.from(raw, c => c.charCodeAt(0)) };
    });
    const blob = createDocumentImageSheet(images, copyMode() ? { fullPage: true } : { vertical: true });
    if (blob.size > 9 * 1024 * 1024) throw new Error('El PDF supera 9 MB. Revisa el área de los recortes.');
    clearPdf(); pdfUrl = URL.createObjectURL(blob);
    result.querySelector('iframe').src = pdfUrl; result.querySelector('a').href = pdfUrl; result.hidden = false;
    if (options.onDocument) {
      const reader = new FileReader();
      const includesBloodCard = copyMode() ? copyBlood.checked : Boolean(captures.blood);
      const revision = pdfRevision;
      reader.onload = () => { if (dialog.isConnected && revision === pdfRevision) options.onDocument(String(reader.result), includesBloodCard); };
      reader.readAsDataURL(blob);
    }
    status.textContent = copyMode() ? 'PDF A4 generado con la copia completa, sin separar sus documentos.' : captures.blood ? 'PDF A4 de una página: frente, reverso y carnet uno debajo del otro.' : 'PDF A4 de una página: frente arriba y reverso debajo.';
  });
  if (pilot || options.photos) {
    dialog.querySelectorAll('[data-photo]').forEach(input => { input.onchange = () => { const file = input.files[0]; if (file) run(() => crop(input.dataset.photo, file)); }; });
  }
  if (options.onPhoneCapture) {
    dialog.querySelectorAll('[data-photo], [data-copy-photo], [data-certificate-photo]').forEach(input => {
      const label = input.closest('label');
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'capture-photo';
      button.textContent = 'Tomar foto desde el teléfono';
      button.onclick = () => { if (!busy && !disposed) options.onPhoneCapture(); };
      label.replaceWith(button);
    });
  }
  if (!inline) dialog.showModal();
  if (token.value.trim()) search.click();
  return {
    dispose,
    get busy() { return busy; },
    async importPhoneCaptures(images) {
      if (busy || disposed) throw new Error('Espera a que termine la captura actual.');
      await run(async () => {
        delete captures.blood;
        const bloodCard = dialog.querySelector('[data-card="blood"]');
        bloodCard.querySelector('[data-image]').textContent = 'Sin captura · opcional';
        bloodCard.querySelector('[data-crop]')?.remove();
        bloodCard.classList.remove('has-capture'); removeBlood.hidden = true;
        if (removeCertificate) {
          options.onCertificate('');
          const preview = dialog.querySelector('[data-certificate-preview]');
          preview.classList.remove('has-certificate');
          preview.textContent = 'Arrastra el PDF o una imagen aquí, o haz clic para seleccionar';
          removeCertificate.hidden = true;
        }
        mode.value = 'original'; mode.onchange();
        for (const side of ['front', 'back', 'blood', 'certificate']) {
          if (!images[side]) continue;
          const blob = await (await fetch(images[side])).blob();
          const file = new File([blob], `${side}.jpg`, { type: 'image/jpeg' });
          if (side === 'certificate') await acceptCertificate?.(file);
          else await crop(side, file);
        }
        status.textContent = 'Fotos recibidas. Revisa las tarjetas y genera el PDF.';
      });
    },
  };
}
