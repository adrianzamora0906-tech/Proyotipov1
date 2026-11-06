import { LocalScannerService } from '../services/LocalScannerService.js';

export function openScannerDeviceDialog() {
  if (document.querySelector('[data-local-scanner-dialog]')) return;
  const dialog = document.createElement('dialog');
  dialog.dataset.localScannerDialog = '';
  dialog.style.cssText = 'width:min(640px,92vw);max-height:90vh;border:0;border-radius:12px;padding:24px;overflow:auto';
  dialog.innerHTML = `<h2>Escanear cédula · prueba de conexión</h2>
    <p>Fase 1: captura de prueba. Esta imagen no se guardará en el expediente. Utiliza una hoja sin datos personales.</p>
    <p>Inicia tools/scanner-agent/start-scanner.cmd en esta computadora. Autoriza este origen:</p>
    <code data-origin></code>
    <label style="display:block;margin:16px 0">Código de vinculación de la consola
      <input data-token type="password" autocomplete="off" spellcheck="false" style="width:100%"></label>
    <button type="button" class="btn btn-secondary" data-search>Buscar escáneres</button>
    <label style="display:block;margin:16px 0">Escáner <select data-device style="width:100%" disabled></select></label>
    <button type="button" class="btn btn-primary" data-scan disabled>Escanear prueba</button>
    <p role="status" aria-live="polite"></p>
    <img data-preview hidden alt="Captura de prueba del escáner" style="max-width:100%;max-height:45vh;object-fit:contain">
    <p><button type="button" class="btn btn-secondary" data-close>Cerrar</button></p>`;
  document.body.append(dialog);
  dialog.querySelector('[data-origin]').textContent = window.location.origin;
  const token = dialog.querySelector('[data-token]'), select = dialog.querySelector('[data-device]');
  const search = dialog.querySelector('[data-search]'), scan = dialog.querySelector('[data-scan]');
  const status = dialog.querySelector('[role=status]'), preview = dialog.querySelector('[data-preview]');
  let busy = false, imageUrl;
  const close = () => { if (busy) { status.textContent = 'Espera a que termine la operación antes de cerrar.'; return; } dialog.close(); };
  dialog.oncancel = event => { event.preventDefault(); close(); };
  dialog.onclose = () => { if (imageUrl) URL.revokeObjectURL(imageUrl); token.value = ''; dialog.remove(); };
  dialog.querySelector('[data-close]').onclick = close;
  const run = async action => {
    if (busy) return;
    if (!token.value.trim()) { status.textContent = 'Introduce el código mostrado por el servicio local.'; return; }
    busy = true; search.disabled = scan.disabled = select.disabled = token.disabled = true;
    try { await action(new LocalScannerService(token.value.trim())); }
    catch (error) { status.textContent = error.message; }
    finally { busy = false; search.disabled = token.disabled = false; select.disabled = scan.disabled = !select.options.length; }
  };
  search.onclick = () => run(async client => {
    status.textContent = 'Buscando escáneres configurados en Windows…';
    select.replaceChildren();
    const devices = await client.devices();
    for (const device of devices) { const option = document.createElement('option'); option.value = device.id; option.textContent = `${device.name} · ${device.interface}`; select.append(option); }
    let previous; try { previous = localStorage.getItem('sportmancar.scanner.device'); } catch {}
    if (devices.some(device => device.id === previous)) select.value = previous;
    status.textContent = devices.length ? 'Coloca una hoja de prueba en el cristal. Captura A4 a 300 ppp.' : 'Windows no informa escáneres WIA. Revisa alimentación, conexión y controlador; una impresora instalada no garantiza escaneo WIA.';
  });
  scan.onclick = () => run(async client => {
    status.textContent = 'Escaneando… No cierres esta ventana.';
    preview.hidden = true;
    if (imageUrl) { URL.revokeObjectURL(imageUrl); imageUrl = null; }
    preview.removeAttribute('src');
    const data = await client.scan(select.value);
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data.imageUrl)) throw new Error('El servicio devolvió una imagen inválida.');
    const blob = await (await fetch(data.imageUrl)).blob();
    imageUrl = URL.createObjectURL(blob); preview.src = imageUrl;
    await preview.decode(); preview.hidden = false;
    try { localStorage.setItem('sportmancar.scanner.device', select.value); } catch {}
    status.textContent = `Captura recibida: ${data.width} × ${data.height} píxeles. No se ha guardado en el expediente.`;
  });
  dialog.showModal();
}
