import { apiClient } from '../core/api/ApiClient.js';
import { authService } from '../core/auth/AuthService.js';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const money = value => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
const bankName = value => ({ PICHINCHA: 'Banco Pichincha', GUAYAQUIL: 'Banco Guayaquil' })[value] || 'Sin banco registrado';
const movementRow = row => {
  const transfer = row.movement_type === 'STUDENT_TRANSFER';
  const person = transfer
    ? `<strong>${escape(row.student_name)}</strong><small>Cédula ${escape(row.identification)}</small><small>Registró: ${escape(row.registered_by_name)}</small>`
    : escape(row.registered_by_name);
  const movementDate = new Date(`${row.movement_date}T12:00:00Z`).toLocaleDateString('es-EC', { timeZone: 'America/Guayaquil' });
  return `<tr><td><span class="cash-movement-badge ${transfer ? 'is-transfer' : 'is-cash'}">${transfer ? 'Transferencia confirmada' : 'Depósito de efectivo'}</span></td><td>${person}</td><td>${escape(row.branch_name)}</td><td>${escape(row.bank_name || bankName(row.bank_code))}</td><td>${money(row.amount)}</td><td>${escape(row.note || '—')}</td><td>${escape(movementDate)}</td></tr>`;
};

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
      <section class="cash-deposit-records"><div class="cash-deposit-block-heading"><span class="cash-deposit-step">2</span><div><h3>Movimientos en banco</h3><p>Consulta depósitos de efectivo y transferencias confirmadas de estudiantes.</p></div></div>
      <div class="cash-deposit-filters"><label>Desde<input class="form-input" type="date" id="cash-deposit-from" value="${today()}" required></label><label>Hasta<input class="form-input" type="date" id="cash-deposit-to" value="${today()}" required></label><label>Banco<select class="form-select" id="cash-deposit-bank"><option value="">Todos los bancos</option><option value="PICHINCHA">Banco Pichincha</option><option value="GUAYAQUIL">Banco Guayaquil</option></select></label><label class="cash-deposit-person-filter">Persona<input class="form-input" type="search" id="cash-deposit-person" maxlength="100" placeholder="Nombre o usuario"></label><strong id="cash-deposit-total"></strong></div>
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
    stylesheet.href = '/src/assets/css/pages/cash-deposits.css?v=4';
    document.head.appendChild(stylesheet);
  }
  const form = document.getElementById('cash-deposit-form');
  const fromFilter = document.getElementById('cash-deposit-from');
  const toFilter = document.getElementById('cash-deposit-to');
  const bankFilter = document.getElementById('cash-deposit-bank');
  const personFilter = document.getElementById('cash-deposit-person');
  const history = document.getElementById('cash-deposit-history');
  const total = document.getElementById('cash-deposit-total');
  const message = document.getElementById('cash-deposit-message');
  if (!fromFilter || !toFilter || !bankFilter || !personFilter || !history) return;
  let request = 0;
  let searchTimer;
  let operationKey = null;
  let operationPayload = null;
  const load = async () => {
    const current = ++request;
    total.textContent = '';
    history.textContent = 'Cargando envíos…';
    try {
      const params = new URLSearchParams({ from: fromFilter.value, to: toFilter.value });
      if (bankFilter.value) params.set('bank', bankFilter.value);
      if (personFilter.value.trim()) params.set('person', personFilter.value.trim());
      const result = await apiClient.get(`/payments/deposit-dispatches?${params}`);
      if (current !== request || !history.isConnected) return;
      if (!result.success) throw new Error(result.error || 'No se pudo consultar el historial');
      total.textContent = `Total movimientos: ${money(result.data.total)} · Efectivo depositado: ${money(result.data.cashTotal)} · Transferencias de estudiantes: ${money(result.data.studentTransferTotal)} · Pichincha: ${money(result.data.bankTotals?.PICHINCHA)} · Guayaquil: ${money(result.data.bankTotals?.GUAYAQUIL)} · Banco no identificado: ${money(result.data.bankTotals?.OTHER)}`;
      history.innerHTML = result.data.rows.length ? `<div class="cash-search-table-wrap"><table class="cash-search-table"><thead><tr><th>Tipo</th><th>Persona / registrado por</th><th>Sucursal</th><th>Banco destino</th><th>Monto</th><th>Referencia / observación</th><th>Fecha del movimiento</th></tr></thead><tbody>${result.data.rows.map(movementRow).join('')}</tbody></table></div>` : '<p>No hay movimientos registrados en este rango.</p>';
    } catch (error) { if (current === request && history.isConnected) history.textContent = error.message; }
  };
  const applyFilters = () => {
    if (!fromFilter.reportValidity() || !toFilter.reportValidity()) return;
    if (fromFilter.value > toFilter.value) {
      toFilter.setCustomValidity('La fecha Hasta debe ser igual o posterior a Desde.');
      toFilter.reportValidity();
      toFilter.setCustomValidity('');
      return;
    }
    void load();
  };
  fromFilter.addEventListener('change', applyFilters);
  toFilter.addEventListener('change', applyFilters);
  bankFilter.addEventListener('change', applyFilters);
  personFilter.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilters, 300);
  });
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
      fromFilter.value = data.date;
      toFilter.value = data.date;
      bankFilter.value = '';
      personFilter.value = '';
      message.textContent = 'Envío registrado correctamente.';
      await load();
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
  });
  void load();
}
