import { apiClient } from '../core/api/ApiClient.js';

export async function showTransferReceipt(id) {
  if (!id) return;
  document.getElementById('transfer-constancy-overlay')?.remove();
  const layer = document.createElement('div');
  layer.id = 'transfer-constancy-overlay';
  layer.className = 'modal-overlay active';
  layer.style.zIndex = '12000';
  layer.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-label="Constancia de transferencia pendiente" style="width:min(95vw,460px);max-height:90vh;overflow:auto"><div class="modal-header"><h3>Transferencia pendiente</h3></div><div class="modal-body" data-constancy-body role="status">Cargando constancia...</div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-close>Cerrar</button><button type="button" class="btn btn-primary" data-print disabled>Imprimir</button></div></section>`;
  document.body.appendChild(layer);
  layer.querySelector('[data-close]').onclick = () => layer.remove();
  const load = async () => {
    const body = layer.querySelector('[data-constancy-body]');
    body.textContent = 'Cargando constancia...';
    try {
      const result = await apiClient.get(`/payments/transfer-verifications/${encodeURIComponent(id)}/receipt`);
      if (!layer.isConnected) return;
      if (!result.success || !result.html) throw new Error('Constancia pendiente no disponible.');
      body.innerHTML = result.html;
      const print = layer.querySelector('[data-print]');
      print.disabled = false;
      print.onclick = () => {
        const popup = window.open('', '_blank', 'width=460,height=720');
        if (!popup) return;
        popup.opener = null;
        popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Constancia de transferencia pendiente</title><style>@page{size:80mm auto;margin:5mm}body{margin:0;background:white}</style></head><body>${result.html}</body></html>`);
        popup.document.close(); popup.focus(); popup.print();
      };
    } catch (error) {
      if (!layer.isConnected) return;
      body.textContent = `${error.message || 'No se pudo abrir la constancia.'} La transferencia registrada no se modifica. `;
      const retry = document.createElement('button'); retry.type='button'; retry.textContent='Reintentar';
      retry.className='btn btn-secondary'; retry.onclick=load; body.appendChild(retry);
    }
  };
  await load();
}
