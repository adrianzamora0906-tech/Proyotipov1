import { LocalScannerService } from '../services/LocalScannerService.js';
import { editDocument, loadScanner } from '../services/DocumentScannerService.js';
import { createDocumentImageSheet } from '../services/DocumentImageSheet.js';
import { recognizeCedula, PILOT_USER_ID } from '../services/CedulaOcrPilot.js';
import { authService } from '../core/auth/AuthService.js';

export function openScannerDeviceDialog(options = {}) {
  const pilot = authService.getCurrentUser()?.userId === PILOT_USER_ID && options.pilot === true;
  if (document.querySelector('[data-local-scanner-dialog]')) return;
  const dialog = document.createElement('dialog');
  dialog.dataset.localScannerDialog = '';
  dialog.style.cssText = 'width:min(640px,92vw);max-height:90vh;border:0;border-radius:12px;padding:24px;overflow:auto';
  dialog.innerHTML = `<h2>Escanear cédula</h2>
    <p>Escanea y revisa ambas caras para descargar un PDF A4. No se guardará automáticamente en el expediente.</p>
    <p>En Windows 7, abre SportmancarScanner-x86.exe en esta computadora (también funciona en Windows de 64 bits). Mantén su ventana abierta y copia el código de vinculación. El puente debe autorizar este origen:</p>
    <code data-origin></code>
    <label style="display:block;margin:16px 0">Código de vinculación de la consola
      <input data-token type="password" autocomplete="off" spellcheck="false" style="width:100%"></label>
    <label><input type="checkbox" data-remember> Recordar en este navegador de la sucursal</label>
    <button type="button" class="btn btn-secondary" data-forget>Olvidar vinculación</button>
    <button type="button" class="btn btn-secondary" data-search>Buscar escáneres</button>
    <label style="display:block;margin:16px 0">Escáner <select data-device style="width:100%" disabled></select></label>
    <button type="button" class="btn btn-primary" data-scan disabled>Escanear frente</button>
    <button type="button" class="btn btn-primary" data-back disabled>Escanear reverso</button>
    <button type="button" class="btn btn-secondary" data-blood disabled>Escanear carnet (opcional)</button>
    <button type="button" class="btn btn-secondary" data-remove-blood hidden>Quitar carnet</button>
    <div data-cards></div>
    <button type="button" class="btn btn-primary" data-pdf disabled>Generar PDF</button>
    <div data-result hidden><a data-download download="cedula.pdf" class="btn btn-secondary">Descargar PDF</a><iframe title="Cédula en PDF A4" style="width:100%;height:420px;border:0"></iframe></div>
    <p role="status" aria-live="polite"></p>
    <img data-preview hidden alt="Captura de prueba del escáner" style="max-width:100%;max-height:45vh;object-fit:contain">
    <p><button type="button" class="btn btn-secondary" data-close>Cerrar</button></p>`;
  document.body.append(dialog);
  if (pilot) {
    const controls = document.createElement('section');
    controls.innerHTML = `<p>Prueba privada · requiere puente v1.7 para impresora a 300 ppp. También puedes cargar fotos sin puente local.</p>
      <label>Foto del frente<input type="file" data-photo="front" accept="image/jpeg,image/png" capture="environment"></label>
      <label>Foto del reverso<input type="file" data-photo="back" accept="image/jpeg,image/png" capture="environment"></label>
      <p data-ocr-help>Captura o carga frente y reverso para habilitar el autollenado.</p>
      <button type="button" class="btn btn-primary" data-read disabled aria-describedby="scanner-ocr-help">Revisar y autollenar datos</button>
      <div data-review hidden><p>Revisa las sugerencias antes de aplicarlas. Los campos vacíos no se modificarán.</p>
      ${[['identification','Cédula'],['firstName','Nombres'],['lastName','Apellidos'],['birthDate','Nacimiento']].map(([key,label]) => `<label>${label}<input data-suggestion="${key}" type="${key === 'birthDate' ? 'date' : 'text'}"></label>`).join('')}
      <button type="button" data-apply class="btn btn-primary">Autollenar formulario con estos datos</button></div>`;
    controls.querySelector('[data-ocr-help]').id = 'scanner-ocr-help';
    dialog.querySelector('[data-cards]').before(controls);
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
    status.textContent = 'Vinculación olvidada en este navegador. Introduce el código del puente para volver a conectar.';
  };
  const search = dialog.querySelector('[data-search]'), scan = dialog.querySelector('[data-scan]');
  const status = dialog.querySelector('[role=status]'), preview = dialog.querySelector('[data-preview]');
  let busy = false, imageUrl;
  const captures = {};
  const back = dialog.querySelector('[data-back]'), pdf = dialog.querySelector('[data-pdf]');
  const blood = dialog.querySelector('[data-blood]'), removeBlood = dialog.querySelector('[data-remove-blood]');
  const result = dialog.querySelector('[data-result]');
  let pdfUrl;
  const clearPdf = () => {
    result.hidden = true;
    result.querySelector('iframe').removeAttribute('src');
    result.querySelector('a').removeAttribute('href');
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    pdfUrl = null;
  };
  const close = () => { if (busy) { status.textContent = 'Espera a que termine la operación antes de cerrar.'; return; } dialog.close(); };
  dialog.oncancel = event => { event.preventDefault(); close(); };
  dialog.onclose = () => { clearPdf(); if (imageUrl) URL.revokeObjectURL(imageUrl); token.value = ''; dialog.remove(); };
  dialog.querySelector('[data-close]').onclick = close;
  const run = async action => {
    if (busy) return;
    if (!pilot && !token.value.trim()) { status.textContent = 'Introduce el código mostrado por el servicio local.'; return; }
    busy = true; search.disabled = scan.disabled = back.disabled = blood.disabled = removeBlood.disabled = pdf.disabled = select.disabled = token.disabled = true;
    dialog.querySelectorAll('[data-photo],[data-read],[data-apply]').forEach(control => { control.disabled = true; });
    dialog.querySelectorAll('[data-crop]').forEach(button => { button.disabled = true; });
    try { await action(new LocalScannerService(token.value.trim())); }
    catch (error) { status.textContent = error.message; }
    finally {
      busy = false; search.disabled = token.disabled = false; select.disabled = scan.disabled = !select.options.length;
      back.disabled = !select.options.length || !captures.front;
      blood.disabled = !select.options.length || !captures.front || !captures.back;
      removeBlood.disabled = false;
      pdf.disabled = !captures.front || !captures.back;
      const read = dialog.querySelector('[data-read]'); if (read) read.disabled = !captures.front || !captures.back;
      if (read) dialog.querySelector('[data-ocr-help]').textContent = captures.front && captures.back
        ? 'Ambas caras listas. Pulsa «Revisar y autollenar datos» y comprueba las sugerencias.'
        : 'Captura o carga frente y reverso para habilitar el autollenado.';
      dialog.querySelectorAll('[data-photo],[data-apply]').forEach(control => { control.disabled = false; });
      dialog.querySelectorAll('[data-crop]').forEach(button => { button.disabled = false; });
    }
  };
  search.onclick = () => run(async client => {
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
    status.textContent = devices.length ? 'Coloca el documento en el cristal. El recorte se procesará automáticamente; podrás corregirlo si lo necesitas.' : 'Windows no informa escáneres WIA. Revisa alimentación, conexión y controlador; una impresora instalada no garantiza escaneo WIA.';
  });
  const crop = async (side, file, automatic = true) => {
    status.textContent = automatic ? 'Procesando recorte automático… Si no se detectan los bordes, se abrirá el ajuste manual.' : 'Ajusta el recorte y la orientación del documento.';
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    const canvas = await editDocument(file, { maximumSide: 3600, automatic });
    if (!canvas) { status.textContent = 'Recorte cancelado. Se conserva la captura anterior, si existía.'; return; }
    clearPdf(); captures[side] = { file, canvas };
    if (pilot) dialog.querySelector('[data-review]').hidden = true;
    let card = dialog.querySelector(`[data-card="${side}"]`);
    if (!card) {
      card = document.createElement('section'); card.dataset.card = side;
      const title = document.createElement('h3'); title.textContent = side === 'front' ? 'Frente' : side === 'back' ? 'Reverso' : 'Carnet de tipo sanguíneo';
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'btn btn-secondary'; edit.dataset.crop = side; edit.textContent = 'Corregir recorte';
      edit.onclick = () => run(() => crop(side, captures[side].file, false));
      card.append(title, edit); dialog.querySelector('[data-cards]').append(card);
    }
    card.querySelector('canvas')?.remove(); canvas.style.cssText = 'display:block;max-width:100%;max-height:260px;object-fit:contain'; card.append(canvas);
    (side === 'front' ? scan : side === 'back' ? back : blood).textContent = side === 'front' ? 'Repetir frente' : side === 'back' ? 'Repetir reverso' : 'Repetir carnet';
    removeBlood.hidden = !captures.blood;
    status.textContent = side === 'front' ? 'Voltea la cédula para escanear el reverso.' : side === 'back' ? 'Puedes escanear el carnet para incluirlo debajo de la cédula, o generar el PDF solo con ambas caras.' : 'Carnet listo. El PDF incluirá frente, reverso y carnet uno debajo del otro.';
  };
  const capture = side => run(async client => {
    const started = performance.now();
    status.textContent = 'Escaneando… No cierres esta ventana.';
    preview.hidden = true;
    if (imageUrl) { URL.revokeObjectURL(imageUrl); imageUrl = null; }
    preview.removeAttribute('src');
    const data = await client.scan(select.value, pilot ? 300 : undefined);
    if (pilot && data.dpi !== 300) throw new Error('La captura no confirma 300 ppp. Actualiza el puente a v1.7 para esta prueba, o utiliza fotografías.');
    const acquired = performance.now();
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data.imageUrl)) throw new Error('El servicio devolvió una imagen inválida.');
    const blob = await (await fetch(data.imageUrl)).blob();
    await crop(side, new File([blob], `${side}.jpg`, { type: 'image/jpeg' }));
    // The second duration includes review time if automatic detection fell back to the editor.
    status.textContent += ` Captura y transferencia: ${((acquired - started) / 1000).toFixed(1)} s. Procesamiento y revisión: ${((performance.now() - acquired) / 1000).toFixed(1)} s.`;
    try { localStorage.setItem('sportmancar.scanner.device', select.value); } catch {}
  });
  scan.onclick = () => capture('front');
  back.onclick = () => capture('back');
  blood.onclick = () => capture('blood');
  removeBlood.onclick = () => {
    if (busy) return;
    delete captures.blood; dialog.querySelector('[data-card="blood"]')?.remove();
    clearPdf(); removeBlood.hidden = true; blood.textContent = 'Escanear carnet (opcional)';
    status.textContent = 'Carnet retirado. Genera nuevamente el PDF con ambas caras de la cédula.';
  };
  pdf.onclick = () => run(async () => {
    if (!captures.front || !captures.back) throw new Error('Escanea y acepta ambas caras.');
    const images = (captures.blood ? ['front', 'back', 'blood'] : ['front', 'back']).map(side => {
      const canvas = captures[side].canvas;
      const raw = atob(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
      return { width: canvas.width, height: canvas.height, bytes: Uint8Array.from(raw, c => c.charCodeAt(0)) };
    });
    const blob = createDocumentImageSheet(images, { vertical: true });
    if (blob.size > 9 * 1024 * 1024) throw new Error('El PDF supera 9 MB. Revisa el área de los recortes.');
    clearPdf(); pdfUrl = URL.createObjectURL(blob);
    result.querySelector('iframe').src = pdfUrl; result.querySelector('a').href = pdfUrl; result.hidden = false;
    if (pilot && options.onDocument) {
      const reader = new FileReader();
      reader.onload = () => { if (dialog.isConnected) options.onDocument(String(reader.result), Boolean(captures.blood)); };
      reader.readAsDataURL(blob);
    }
    status.textContent = captures.blood ? 'PDF A4 de una página: frente, reverso y carnet uno debajo del otro. Descárgalo para adjuntarlo al expediente.' : 'PDF A4 de una página: frente arriba y reverso debajo. Descárgalo para adjuntarlo al expediente.';
  });
  if (pilot) {
    dialog.querySelectorAll('[data-photo]').forEach(input => { input.onchange = () => { const file = input.files[0]; if (file) run(() => crop(input.dataset.photo, file)); }; });
    dialog.querySelector('[data-read]').onclick = () => run(async () => {
      const values = await recognizeCedula([captures.front.canvas, captures.back.canvas], message => { status.textContent = message; });
      dialog.querySelectorAll('[data-suggestion]').forEach(input => { input.value = values[input.dataset.suggestion] || ''; });
      dialog.querySelector('[data-review]').hidden = false;
      dialog.querySelector('[data-review]').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      status.textContent = 'Lectura terminada. Verifica los datos contra la cédula; los campos no reconocidos quedan vacíos.';
    });
    dialog.querySelector('[data-apply]').onclick = () => {
      if (busy) return;
      const values = Object.fromEntries([...dialog.querySelectorAll('[data-suggestion]')].map(input => [input.dataset.suggestion, input.value.trim()]));
      options.onData?.(values);
    };
  }
  dialog.showModal();
}
