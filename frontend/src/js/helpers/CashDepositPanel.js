import { apiClient } from '../core/api/ApiClient.js';
import { authService } from '../core/auth/AuthService.js';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const money = value => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
const bankName = value => ({ PICHINCHA: 'Banco Pichincha', GUAYAQUIL: 'Banco Guayaquil' })[value] || 'Sin banco registrado';

export function cashDepositPanel() {
  return `<section class="card cash-panel cash-deposits" aria-labelledby="cash-deposits-title">
    <div class="card-body cash-deposit-workspace">
      <section class="cash-deposit-entry"><div class="cash-deposit-block-heading"><span class="cash-deposit-step">1</span><div><h3 id="cash-deposits-title">Nuevo envío</h3><p>Completa los datos del dinero entregado al banco.</p></div></div>
      ${authService.can('PAYMENT_CREATE') ? `<form id="cash-deposit-form" class="cash-deposit-form">
        <label>Fecha del envío<input class="form-input" type="date" name="date" value="${today()}" max="${today()}" required></label>
        <label>Monto enviado ($)<input class="form-input" type="number" name="amount" min="0.01" max="9999999999.99" step="0.01" placeholder="0.00" required></label>
        <label>Banco de destino<select class="form-select" name="bank" required><option value="">Selecciona un banco</option><option value="PICHINCHA">Banco Pichincha</option><option value="GUAYAQUIL">Banco Guayaquil</option></select></label>
        <label class="cash-deposit-note">Observación (opcional)<input class="form-input" name="note" maxlength="500" placeholder="Ej. Entregado al mensajero"></label>
        <div class="cash-deposit-actions"><button type="submit" class="btn btn-primary">Registrar envío</button></div>
      </form>` : ''}
      <p id="cash-deposit-message" role="status" aria-live="polite"></p>
      </section>
      <section class="cash-deposit-records"><div class="cash-deposit-block-heading"><span class="cash-deposit-step">2</span><div><h3>Historial de envíos</h3><p>Consulta los movimientos de tu sucursal.</p></div></div>
      <div class="cash-deposit-filters"><label>Consultar día<input class="form-input" type="date" id="cash-deposit-filter" value="${today()}" required></label><strong id="cash-deposit-total"></strong></div>
      <div id="cash-deposit-history" aria-live="polite">Cargando envíos…</div>
      </section>
    </div>
  </section>`;
}

export function mountCashDepositPanel() {
  if (!document.getElementById('cash-deposit-styles')) {
    const stylesheet = document.createElement('link');
    stylesheet.id = 'cash-deposit-styles';
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/src/assets/css/pages/cash-deposits.css?v=2';
    document.head.appendChild(stylesheet);
  }
  const form = document.getElementById('cash-deposit-form');
  const filter = document.getElementById('cash-deposit-filter');
  const history = document.getElementById('cash-deposit-history');
  const total = document.getElementById('cash-deposit-total');
  const message = document.getElementById('cash-deposit-message');
  if (!filter || !history) return;
  let request = 0;
  let operationKey = null;
  let operationPayload = null;
  const load = async () => {
    const current = ++request;
    total.textContent = '';
    history.textContent = 'Cargando envíos…';
    try {
      const result = await apiClient.get(`/payments/deposit-dispatches?${new URLSearchParams({ date: filter.value })}`);
      if (current !== request || !history.isConnected) return;
      if (!result.success) throw new Error(result.error || 'No se pudo consultar el historial');
      total.textContent = `Total enviado: ${money(result.data.total)} · Pichincha: ${money(result.data.bankTotals?.PICHINCHA)} · Guayaquil: ${money(result.data.bankTotals?.GUAYAQUIL)}`;
      history.innerHTML = result.data.rows.length ? `<div class="cash-search-table-wrap"><table class="cash-search-table"><thead><tr><th>Registrado por</th><th>Sucursal</th><th>Banco</th><th>Monto enviado</th><th>Observación</th><th>Fecha de registro</th></tr></thead><tbody>${result.data.rows.map(row => `<tr><td>${escape(row.registered_by_name)}</td><td>${escape(row.branch_name)}</td><td>${escape(bankName(row.bank))}</td><td>${money(row.amount)}</td><td>${escape(row.note || '—')}</td><td>${escape(new Date(row.created_at).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' }))}</td></tr>`).join('')}</tbody></table></div>` : '<p>No hay envíos registrados para este día.</p>';
    } catch (error) { if (current === request && history.isConnected) history.textContent = error.message; }
  };
  filter.addEventListener('change', () => { if (filter.reportValidity()) void load(); });
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector('button[type="submit"]');
    if (button.disabled) return;
    const data = Object.fromEntries(new FormData(form));
    const payload = JSON.stringify(data);
    if (payload !== operationPayload) { operationKey = crypto.randomUUID(); operationPayload = payload; }
    button.disabled = true;
    message.textContent = 'Registrando envío…';
    try {
      const result = await apiClient.post('/payments/deposit-dispatches', { ...data, operationKey });
      if (!result.success) throw new Error(result.error || 'No se pudo registrar el envío');
      operationKey = null;
      operationPayload = null;
      form.elements.amount.value = '';
      form.elements.note.value = '';
      form.elements.bank.value = '';
      filter.value = data.date;
      message.textContent = 'Envío registrado correctamente.';
      await load();
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
  });
  void load();
}
