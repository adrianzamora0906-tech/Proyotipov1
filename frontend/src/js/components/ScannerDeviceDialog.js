import { LocalScannerService } from '../services/LocalScannerService.js';
import { editDocument } from '../services/DocumentScannerService.js';
import { createDocumentImageSheet } from '../services/DocumentImageSheet.js';

export function openScannerDeviceDialog() {
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
  dialog.querySelector('[data-origin]').textContent = window.location.origin;
  const token = dialog.querySelector('[data-token]'), select = dialog.querySelector('[data-device]');
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
    if (!token.value.trim()) { status.textContent = 'Introduce el código mostrado por el servicio local.'; return; }
    busy = true; search.disabled = scan.disabled = back.disabled = blood.disabled = removeBlood.disabled = pdf.disabled = select.disabled = token.disabled = true;
    dialog.querySelectorAll('[data-crop]').forEach(button => { button.disabled = true; });
    try { await action(new LocalScannerService(token.value.trim())); }
    catch (error) { status.textContent = error.message; }
    finally {
      busy = false; search.disabled = token.disabled = false; select.disabled = scan.disabled = !select.options.length;
      back.disabled = !select.options.length || !captures.front;
      blood.disabled = !select.options.length || !captures.front || !captures.back;
      removeBlood.disabled = false;
      pdf.disabled = !captures.front || !captures.back;
      dialog.querySelectorAll('[data-crop]').forEach(button => { button.disabled = false; });
    }
  };
  search.onclick = () => run(async client => {
    status.textContent = 'Buscando escáneres configurados en Windows…';
    select.replaceChildren();
    const devices = await client.devices();
    for (const device of devices) { const option = document.createElement('option'); option.value = device.id; option.textContent = `${device.name} · ${device.interface}`; select.append(option); }
    let previous; try { previous = localStorage.getItem('sportmancar.scanner.device'); } catch {}
    if (devices.some(device => device.id === previous)) select.value = previous;
    status.textContent = devices.length ? 'Coloca el documento en el cristal. Escaneo de prueba a 100 ppp; después podrás revisar y corregir el recorte.' : 'Windows no informa escáneres WIA. Revisa alimentación, conexión y controlador; una impresora instalada no garantiza escaneo WIA.';
  });
  const crop = async (side, file) => {
    const canvas = await editDocument(file, { maximumSide: 3600 });
    if (!canvas) { status.textContent = 'Recorte cancelado. Se conserva la captura anterior, si existía.'; return; }
    clearPdf(); captures[side] = { file, canvas };
    let card = dialog.querySelector(`[data-card="${side}"]`);
    if (!card) {
      card = document.createElement('section'); card.dataset.card = side;
      const title = document.createElement('h3'); title.textContent = side === 'front' ? 'Frente' : side === 'back' ? 'Reverso' : 'Carnet de tipo sanguíneo';
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'btn btn-secondary'; edit.dataset.crop = side; edit.textContent = 'Corregir recorte';
      edit.onclick = () => run(() => crop(side, captures[side].file));
      card.append(title, edit); dialog.querySelector('[data-cards]').append(card);
    }
    card.querySelector('canvas')?.remove(); canvas.style.cssText = 'display:block;max-width:100%;max-height:260px;object-fit:contain'; card.append(canvas);
    (side === 'front' ? scan : side === 'back' ? back : blood).textContent = side === 'front' ? 'Repetir frente' : side === 'back' ? 'Repetir reverso' : 'Repetir carnet';
    removeBlood.hidden = !captures.blood;
    status.textContent = side === 'front' ? 'Voltea la cédula para escanear el reverso.' : side === 'back' ? 'Puedes escanear el carnet para incluir tres imágenes en una fila, o generar el PDF solo con la cédula.' : 'Carnet listo. El PDF incluirá frente, reverso y carnet en una fila.';
  };
  const capture = side => run(async client => {
    status.textContent = 'Escaneando… No cierres esta ventana.';
    preview.hidden = true;
    if (imageUrl) { URL.revokeObjectURL(imageUrl); imageUrl = null; }
    preview.removeAttribute('src');
    const data = await client.scan(select.value);
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data.imageUrl)) throw new Error('El servicio devolvió una imagen inválida.');
    const blob = await (await fetch(data.imageUrl)).blob();
    await crop(side, new File([blob], `${side}.jpg`, { type: 'image/jpeg' }));
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
    const blob = createDocumentImageSheet(images, { vertical: !captures.blood, row: Boolean(captures.blood) });
    if (blob.size > 9 * 1024 * 1024) throw new Error('El PDF supera 9 MB. Revisa el área de los recortes.');
    clearPdf(); pdfUrl = URL.createObjectURL(blob);
    result.querySelector('iframe').src = pdfUrl; result.querySelector('a').href = pdfUrl; result.hidden = false;
    status.textContent = captures.blood ? 'PDF A4 de una página: frente, reverso y carnet en una fila. Descárgalo para adjuntarlo al expediente.' : 'PDF A4 de una página: frente arriba y reverso debajo. Descárgalo para adjuntarlo al expediente.';
  });
  dialog.showModal();
}
