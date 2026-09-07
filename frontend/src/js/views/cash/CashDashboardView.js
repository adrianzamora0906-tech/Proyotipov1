import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import PaymentService from '../../services/PaymentService.js';
import { storageService } from '../../core/storage/StorageService.js';
import { authService } from '../../core/auth/AuthService.js';

class CashDashboardView extends Component {
  async render() {
    const pending = await PaymentService.getPendingPayments();
    const statistics = await PaymentService.getStatistics();
    const receiptsCount = storageService.count('receipts');
    const recentReceipts = storageService.findAll('receipts').slice(-4).reverse();
    const moneyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });
    const money = moneyFormatter.format(Number(statistics.totalAmount || 0));
    const today = new Intl.DateTimeFormat('es-EC', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

    const content = `
      <div class="dashboard cash-dashboard">
        <div class="dashboard-header cash-dashboard__header">
          <div><span class="cash-dashboard__eyebrow">Gestión financiera</span><h1>Panel de Caja</h1><p>Control de cobros y comprobantes del día.</p></div>
          <div class="cash-dashboard__date"><span>Hoy</span><strong>${today}</strong></div>
        </div>

        <div class="stats-grid cash-stats-grid">
          <button class="stat-card cash-stat cash-stat--pending cash-open-charge" type="button"><div class="stat-icon cash-stat__icon">$</div><div><div class="stat-number">${pending.length}</div><div class="stat-label">Estudiantes esperando pago</div><small>Buscar estudiante →</small></div></button>
          <div class="stat-card cash-stat cash-stat--collected"><div class="stat-icon cash-stat__icon">↑</div><div><div class="stat-number">${money}</div><div class="stat-label">Valor recaudado hoy</div><small>Ingresos confirmados</small></div></div>
          <a class="stat-card cash-stat cash-stat--receipts" href="/cash/pending"><div class="stat-icon cash-stat__icon">✓</div><div><div class="stat-number">${receiptsCount}</div><div class="stat-label">Comprobantes generados</div><small>Consultar movimientos →</small></div></a>
        </div>

        <div class="dashboard-grid cash-dashboard__grid">
          <section class="card cash-panel">
            <div class="card-header cash-panel__header"><div><h3>Acciones rápidas</h3><p>Operaciones frecuentes de caja</p></div></div>
            <div class="card-body cash-quick-actions">
              <button type="button" class="quick-action cash-quick-action cash-quick-action--primary cash-open-charge"><span class="cash-quick-action__icon">$</span><div class="quick-action-content"><div class="quick-action-title">Registrar un pago</div><small>Busca al estudiante por nombre o cédula.</small></div><b>→</b></button>
              <a href="/cash/pending" class="quick-action cash-quick-action"><span class="cash-quick-action__icon">≡</span><div class="quick-action-content"><div class="quick-action-title">Consultar pagos</div><small>Revisa saldos pendientes y pagos realizados.</small></div><b>→</b></a>
            </div>
          </section>

          <section class="card cash-panel">
            <div class="card-header cash-panel__header"><div><h3>Actividad reciente</h3><p>Últimos comprobantes de este dispositivo</p></div><a href="/cash/pending">Ver todos</a></div>
            <div class="card-body cash-activity-list">
              ${recentReceipts.length ? recentReceipts.map(receipt => `<article class="cash-activity-item"><span class="cash-activity-item__mark">✓</span><div><strong>Pago registrado</strong><small>${receipt.number || 'Comprobante'} · ${receipt.method || 'Método no registrado'}</small></div><div><strong>${moneyFormatter.format(Number(receipt.amount || 0))}</strong><time>${new Date(receipt.date || receipt.createdAt).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}</time></div></article>`).join('') : `<div class="cash-empty-state"><span>✓</span><strong>Sin movimientos recientes</strong><p>Los pagos que registres aparecerán en este espacio.</p></div>`}
            </div>
          </section>
        </div>
        <div class="modal-overlay cash-search-overlay" id="cash-search-overlay" aria-hidden="true">
          <div class="modal cash-search-modal" role="dialog" aria-modal="true" aria-labelledby="cash-search-title">
            <div class="modal-header"><div><h2 class="modal-title" id="cash-search-title">Buscar estudiante para cobrar</h2><p>Consulta estudiantes con saldo pendiente.</p></div><button type="button" class="modal-close" id="cash-search-close" aria-label="Cerrar">×</button></div>
            <div class="modal-body"><label class="cash-search-field">Nombre o cédula<input class="form-input" id="cash-student-search" autocomplete="off" placeholder="Ej. 0942291731"></label><div class="cash-search-results" id="cash-search-results"></div></div>
            <div class="modal-footer"><button type="button" class="btn btn-secondary" id="cash-search-cancel">Cancelar</button></div>
          </div>
        </div>
        <div class="modal-overlay cash-charge-overlay" id="cash-charge-overlay" aria-hidden="true"></div>
      </div>`;

    this.pendingPayments = pending;

    const layout = await SidebarLayout.render(content);
    setTimeout(() => SidebarLayout.attachEventListeners(), 0);
    return layout;
  }

  async mount() {
    const overlay = document.getElementById('cash-search-overlay');
    const input = document.getElementById('cash-student-search');
    const results = document.getElementById('cash-search-results');
    const normalize = value => String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
    const money = value => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
    const renderResults = () => {
      const query = normalize(input?.value).trim();
      const matches = query.length >= 2 ? (this.pendingPayments || []).filter(payment => {
        const student = payment.student || {};
        return normalize(student.cedula).includes(query) || normalize(`${student.firstName || ''} ${student.lastName || ''}`).includes(query);
      }).slice(0, 6) : [];
      if (!results) return;
      if (query.length < 2) { results.innerHTML = '<div class="cash-search-hint">Escribe al menos dos caracteres para buscar.</div>'; return; }
      results.innerHTML = matches.length ? `<div class="cash-search-table-wrap"><table class="cash-search-table"><thead><tr><th>Estudiante</th><th>Curso</th><th>Saldo</th><th></th></tr></thead><tbody>${matches.map(payment => {
        const student = payment.student || {};
        const cedula = String(student.cedula || '').replace(/\D/g, '');
        const paymentIndex = (this.pendingPayments || []).indexOf(payment);
        return `<tr><td><strong>${escape(`${student.firstName || ''} ${student.lastName || ''}`.trim())}</strong><small>${escape(cedula)}</small></td><td>${escape(student.course || 'Sin curso')}</td><td><b>${money(payment.balance)}</b></td><td><button type="button" class="btn btn-primary cash-charge-student" data-payment-index="${paymentIndex}">Cobrar</button></td></tr>`;
      }).join('')}</tbody></table></div>` : '<div class="cash-search-empty"><strong>No encontramos coincidencias</strong><span>Verifica la cédula o consulta el listado completo de Pagos.</span></div>';
    };
    const open = () => { overlay?.classList.add('active'); overlay?.setAttribute('aria-hidden', 'false'); if (input) input.value = ''; renderResults(); setTimeout(() => input?.focus(), 50); };
    const close = () => { overlay?.classList.remove('active'); overlay?.setAttribute('aria-hidden', 'true'); };
    document.querySelectorAll('.cash-open-charge').forEach(button => button.addEventListener('click', open));
    input?.addEventListener('input', renderResults);
    results?.addEventListener('click', event => {
      const button = event.target.closest('.cash-charge-student');
      if (!button) return;
      const payment = (this.pendingPayments || [])[Number(button.dataset.paymentIndex)];
      if (payment) this.openChargeModal(payment, close);
    });
    document.getElementById('cash-search-close')?.addEventListener('click', close);
    document.getElementById('cash-search-cancel')?.addEventListener('click', close);
  }

  async openChargeModal(payment, closeSearch) {
    const overlay = document.getElementById('cash-charge-overlay');
    const student = payment.student || {};
    const branchId = payment.branchId || payment.branch_id || student.branchId || student.branch_id || authService.getCurrentUser()?.branch_id || '';
    const methods = await PaymentService.getAvailableMethods(branchId);
    const money = value => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
    const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
    const methodOptions = (methods || []).map(method => `<option value="${escape(method.code)}" data-requires-reference="${method.requires_reference ? 'true' : 'false'}">${escape(method.name)}</option>`).join('');
    closeSearch?.();
    overlay.innerHTML = `
      <div class="modal cash-charge-modal" role="dialog" aria-modal="true" aria-labelledby="cash-charge-title">
        <div class="modal-header"><div><h2 class="modal-title" id="cash-charge-title">Cobrar a ${escape(`${student.firstName || ''} ${student.lastName || ''}`.trim())}</h2><p>Confirma la información antes de registrar el pago.</p></div><button type="button" class="modal-close" data-close-charge aria-label="Cerrar">×</button></div>
        <div class="modal-body">
          <div class="cash-charge-summary"><div><span>Cédula</span><strong>${escape(String(student.cedula || '').replace(/\D/g, ''))}</strong></div><div><span>Curso</span><strong>${escape(student.course || 'Sin curso')}</strong></div><div><span>Saldo pendiente</span><strong>${money(payment.balance)}</strong></div></div>
          <form id="cash-charge-form" class="cash-charge-form">
            <label>Monto a pagar <span>*</span><input class="form-input" type="number" name="amount" value="${Number(payment.balance || 0).toFixed(2)}" min="0.01" max="${Number(payment.balance || 0).toFixed(2)}" step="0.01" required></label>
            <label>Método <span>*</span><select class="form-select" name="method" required>${methodOptions || '<option value="">No hay métodos configurados</option>'}</select></label>
            <label class="cash-charge-form__wide">Referencia<input class="form-input" name="reference" placeholder="Número de comprobante o referencia"></label>
            <label class="cash-charge-form__wide">Comentario<textarea class="form-textarea" name="note" rows="3" placeholder="Opcional"></textarea></label>
          </form>
          <div class="cash-charge-message" id="cash-charge-message" role="alert"></div>
        </div>
        <div class="modal-footer"><button type="button" class="btn btn-secondary" data-close-charge>Cancelar</button><button type="button" class="btn btn-primary" id="cash-register-payment" ${methodOptions ? '' : 'disabled'}>Registrar pago</button></div>
      </div>`;
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    const close = () => { overlay.classList.remove('active'); overlay.setAttribute('aria-hidden', 'true'); overlay.innerHTML = ''; };
    overlay.querySelectorAll('[data-close-charge]').forEach(button => button.addEventListener('click', close));
    overlay.querySelector('#cash-register-payment')?.addEventListener('click', async event => {
      const submit = event.currentTarget;
      const form = overlay.querySelector('#cash-charge-form');
      const message = overlay.querySelector('#cash-charge-message');
      const data = new FormData(form);
      const amount = Number(data.get('amount'));
      const methodSelect = form.elements.method;
      const selectedMethod = methodSelect.selectedOptions[0];
      const reference = String(data.get('reference') || '').trim();
      if (!form.reportValidity()) return;
      if (!amount || amount > Number(payment.balance || 0)) { message.textContent = 'El monto debe ser mayor a cero y no superar el saldo pendiente.'; message.className = 'cash-charge-message error'; return; }
      if (selectedMethod?.dataset.requiresReference === 'true' && !reference) { message.textContent = 'La referencia es obligatoria para este método de pago.'; message.className = 'cash-charge-message error'; return; }
      submit.disabled = true;
      submit.textContent = 'Registrando...';
      let result;
      try {
        result = await PaymentService.registerPayment({
          studentId: student.id,
          cedula: student.cedula,
          amount,
          method: String(data.get('method') || '').toLowerCase(),
          reference,
          note: data.get('note'),
          cashier: authService.getCurrentUser()?.username || 'cajera',
          notify: false,
        });
      } catch (error) {
        result = { success: false, error: error.message };
      }
      if (!result.success) { message.textContent = result.error || 'No se pudo registrar el pago.'; message.className = 'cash-charge-message error'; submit.disabled = false; submit.textContent = 'Registrar pago'; return; }
      overlay.querySelector('.cash-charge-modal').innerHTML = `<div class="cash-charge-success"><span>✓</span><h2>Pago registrado</h2><p>El cobro de <strong>${money(amount)}</strong> fue guardado correctamente.</p><div><a class="btn btn-secondary" href="/cash/pending?search=${encodeURIComponent(String(student.cedula || '').replace(/\D/g, ''))}">Ver movimientos</a><button type="button" class="btn btn-primary" id="cash-finish-payment">Finalizar</button></div></div>`;
      overlay.querySelector('#cash-finish-payment')?.addEventListener('click', () => window.dispatchEvent(new PopStateEvent('popstate')));
    });
  }
}

export default CashDashboardView;
