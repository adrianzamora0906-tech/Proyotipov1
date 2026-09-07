import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import PaymentService from '../../services/PaymentService.js?v=voucher-pago-20260824';
import StudentService from '../../services/StudentService.js';
import ApiService from '../../core/api/apiService.js';
import StringHelper from '../../helpers/StringHelper.js';
import { authService } from '../../core/auth/AuthService.js';

class PendingPaymentsView extends Component {
  money(value) {
    return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
  }

  escape(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    })[character]);
  }

  async render() {
    const initialSearch = new URLSearchParams(window.location.search).get('search') || '';
    this.initialSearch = initialSearch;
    try { await authService.refreshAuthorization(); } catch (error) { console.warn('No se actualizaron los permisos de Caja:', error.message); }
    const canVoidPayments = authService.can('PAYMENT_VOID');
    this.canVoidPayments = canVoidPayments;
    const [pending, receiptsResult, branchOptionsResult] = await Promise.all([
      PaymentService.getPendingPayments(),
      ApiService.getReceipts().catch(error => {
        console.warn('No se pudieron cargar los comprobantes de la API:', error.message);
        return { success: false, data: [] };
      }),
      ApiService.getBranches().catch(() => ({ success: false, data: [] })),
    ]);
    this.pendingSnapshot = this.createSnapshot(pending);
    const receipts = receiptsResult.success ? receiptsResult.data : [];

    // store lists for client-side filtering and pagination
    this.pendingAll = pending || [];
    this.receiptsAll = receipts || [];
    this.pendingPage = 1;
    this.pendingPageSize = 5;
    this.receiptsPage = 1;
    this.receiptsPageSize = 5;

    const branches = branchOptionsResult && branchOptionsResult.success ? branchOptionsResult.data : [];
    const branchSelectHtml = `<select id="filter-branch"><option value="">Todas las sucursales</option>${(branches||[]).map(b=>`<option value="${b.id}">${b.name}</option>`).join('')}</select>`;

    this.filteredPending = pending || [];
    this.filteredReceipts = receipts || [];
    const pendingBalance = this.pendingAll.reduce((total, payment) => total + Number(payment.balance || 0), 0);
    const collectedTotal = this.receiptsAll
      .filter(receipt => String(receipt.payment_detail_status || 'ACTIVE').toUpperCase() !== 'VOIDED')
      .reduce((total, receipt) => total + Number(receipt.amount || 0), 0);
    const pendingRows = (this.pendingAll || []).slice(0, this.pendingPageSize).map(p => {
      const cedula = StringHelper.normalizeCedula(p.student.cedula);
      const branchId = p.branchId || p.student.branchId || p.student.branch_id || '';
      return `
      <tr data-student-id="${p.student.id}" data-branch-id="${branchId}">
        <td>${cedula}</td>
        <td>${p.student.firstName} ${p.student.lastName}</td>
        <td>${p.student.course}</td>
        <td>${p.balance}</td>
        <td><button class="btn btn-primary charge-btn" data-student-id="${p.student.id}" data-branch-id="${branchId}">Cobrar</button></td>
      </tr>
    `;
    }).join('');

    const receiptRows = receipts.map(r => {
      return `
      <tr>
        <td>${StringHelper.normalizeCedula(r.cedula || '')}</td>
        <td>${r.studentName || ''}</td>
        <td>${r.course || ''}</td>
        <td>${r.amount}</td>
        <td>${r.receipt_number || r.number || ''}</td>
        <td><div style="display:flex; gap:.5rem; align-items:center"><button class="btn btn-secondary view-receipt" data-id="${r.id}">Ver</button>${String(r.payment_detail_status || 'ACTIVE').toUpperCase() === 'VOIDED' ? '<span class="badge badge-danger">Anulado</span>' : canVoidPayments ? `<button class="btn btn-danger void-cash-payment" data-detail-id="${r.payment_detail_id}" data-amount="${Number(r.amount || 0).toFixed(2)}">Anular</button>` : ''}</div></td>
      </tr>
    `;
    }).join('');

    const content = `
      <div class="cash-payments cash-payments-page">
        <style>
          .cash-payments-page{display:grid;gap:18px}.cash-payments-header{display:flex;align-items:center;justify-content:space-between;gap:16px}.cash-payments-header h1{margin:0;color:#101828;font-size:30px}.cash-payments-header p{margin:5px 0 0;color:#667085}.cash-refresh{white-space:nowrap}
          .cash-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.cash-kpi{position:relative;overflow:hidden;padding:18px 20px;border:1px solid #e4e7ec;border-radius:14px;background:#fff}.cash-kpi:after{content:'';position:absolute;width:90px;height:90px;border-radius:50%;right:-28px;bottom:-45px;background:var(--kpi-soft)}.cash-kpi strong{display:block;font-size:25px;color:#101828}.cash-kpi span{color:#667085;font-size:13px}.cash-kpi.pending{border-top:3px solid #f59e0b;--kpi-soft:#fff4db}.cash-kpi.balance{border-top:3px solid #ef4444;--kpi-soft:#feecec}.cash-kpi.collected{border-top:3px solid #10b981;--kpi-soft:#e2f8ef}
          .report-filters{display:grid;grid-template-columns:1.35fr 1fr 1fr 1fr auto;gap:12px;align-items:end;padding:16px 18px;background:#fff;border:1px solid #e4e7ec;border-radius:14px}.report-filters label{display:grid;gap:6px;font-size:12px;font-weight:600;color:#475467}.report-filters select,.report-filters input{height:44px;border:1px solid #d0d5dd;border-radius:9px;padding:0 12px;background:#fff}.report-filters input:focus,.report-filters select:focus{outline:0;border-color:#4f46e5;box-shadow:0 0 0 3px #4f46e51a}
          .payment-workspace{border:1px solid #e4e7ec;border-radius:15px;background:#fff;overflow:hidden}.payment-tabs{display:flex;gap:6px;padding:12px 16px;border-bottom:1px solid #eaecf0;background:#f8fafc}.payment-tab{border:0;border-radius:9px;padding:10px 16px;background:transparent;color:#667085;font-weight:700;cursor:pointer}.payment-tab.active{background:#fff;color:#4338ca;box-shadow:0 1px 4px #1018281a}.payment-tab b{margin-left:6px;padding:2px 7px;border-radius:999px;background:#eef2ff;font-size:11px}.payment-panel{display:none;padding:18px}.payment-panel.active{display:block}.payment-panel-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.payment-panel-title h2{margin:0;font-size:19px}.payment-panel-title span{color:#667085;font-size:13px}
          .cash-table-wrap{overflow:auto;border:1px solid #eaecf0;border-radius:12px}.cash-table{width:100%;border-collapse:collapse}.cash-table th{padding:13px 15px;background:#f8fafc;text-align:left;color:#475467;font-size:12px}.cash-table td{padding:14px 15px;border-top:1px solid #eaecf0;color:#344054}.cash-table tbody tr:hover{background:#fafbff}.student-cell strong{display:block;color:#101828}.student-cell small{display:block;margin-top:3px;color:#98a2b3}.course-pill{display:inline-flex;padding:5px 9px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:12px;font-weight:700}.balance-value{color:#b42318;font-weight:800}.charge-btn{min-width:94px}.payment-actions{display:flex;gap:7px;align-items:center}.cash-pagination{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px}.cash-pagination button{border:1px solid #d0d5dd;border-radius:8px;padding:8px 13px;background:#fff;font-weight:600;cursor:pointer}.cash-pagination button:disabled{opacity:.4;cursor:not-allowed}.cash-pagination span{color:#667085;font-size:13px}
          @media(max-width:900px){.cash-kpis{grid-template-columns:1fr}.report-filters{grid-template-columns:1fr 1fr}.report-filters .filter-actions{grid-column:1/-1}.report-filters .filter-actions button{width:100%}}
          @media(max-width:600px){.cash-payments-header{align-items:flex-start}.cash-payments-header h1{font-size:24px}.report-filters{grid-template-columns:1fr}.payment-panel{padding:10px}.cash-table{min-width:720px}.payment-tabs{overflow:auto}.cash-kpis{grid-template-columns:repeat(3,minmax(145px,1fr));overflow:auto}.cash-kpi{padding:14px}.cash-kpi strong{font-size:20px}}
        </style>
        <header class="cash-payments-header"><div><h1>Gestión de pagos</h1><p>Consulta saldos, registra cobros y abre comprobantes.</p></div><button class="btn btn-secondary cash-refresh" id="payments-refresh">↻ Actualizar</button></header>
        <section class="cash-kpis" aria-label="Resumen de pagos">
          <article class="cash-kpi pending"><strong>${this.pendingAll.length}</strong><span>Estudiantes con saldo pendiente</span></article>
          <article class="cash-kpi balance"><strong>${this.money(pendingBalance)}</strong><span>Saldo total por cobrar</span></article>
          <article class="cash-kpi collected"><strong>${this.money(collectedTotal)}</strong><span>Pagos registrados</span></article>
        </section>
        <form class="report-filters" id="payments-filters">
          <label>Buscar estudiante<input id="filter-cedula" value="${this.escape(initialSearch)}" placeholder="Nombre o cédula" class="form-input" autocomplete="off"></label>
          <label>Sucursal${branchSelectHtml}</label>
          <label>Desde<input type="date" id="filter-from" class="form-input"></label>
          <label>Hasta<input type="date" id="filter-to" class="form-input"></label>
          <div class="filter-actions"><button type="button" class="btn btn-secondary" id="filter-clear">Limpiar filtros</button></div>
        </form>
        <section class="payment-workspace">
          <nav class="payment-tabs" aria-label="Tipos de pagos"><button class="payment-tab active" type="button" data-payment-tab="pending">Pendientes <b>${this.pendingAll.length}</b></button><button class="payment-tab" type="button" data-payment-tab="receipts">Realizados <b>${this.receiptsAll.length}</b></button></nav>
          <div class="payment-panel active" data-payment-panel="pending"><div class="payment-panel-title"><h2>Pagos pendientes</h2><span id="pending-result-count">${this.pendingAll.length} resultados</span></div><div class="cash-table-wrap"><table class="cash-table"><thead><tr><th>Estudiante</th><th>Cédula</th><th>Curso</th><th>Saldo</th><th>Acción</th></tr></thead><tbody id="pending-payments-body">${pendingRows}</tbody></table></div><div id="pending-payments-pagination" class="cash-pagination"></div></div>
          <div class="payment-panel" data-payment-panel="receipts"><div class="payment-panel-title"><h2>Pagos realizados</h2><span id="receipts-result-count">${this.receiptsAll.length} resultados</span></div><div class="cash-table-wrap"><table class="cash-table"><thead><tr><th>Estudiante</th><th>Cédula</th><th>Curso</th><th>Abonó</th><th>Comprobante</th><th>Acción</th></tr></thead><tbody id="receipts-body">${receiptRows}</tbody></table></div><div id="receipts-pagination" class="cash-pagination"></div></div>
        </section>
      </div>
      <div id="payment-modal" class="modal-overlay"></div>
      <div id="receipt-modal" class="modal-overlay"></div>
    `;

    const layout = await SidebarLayout.render(content);
    setTimeout(() => SidebarLayout.attachEventListeners(), 0);
    return layout;
  }

  async mount() {
    const openModal = async (studentId, branchIdFromRow = '', serviceTransactionId = '') => {
      const student = await StudentService.getStudent(studentId);
      if (!student) return;

      const pendingRow = (this.pendingAll || []).find(item => serviceTransactionId
        ? String(item.serviceTransactionId || '') === String(serviceTransactionId)
        : !item.serviceTransactionId && String(item.student?.id || item.studentId) === String(studentId));
      const isServicePayment = Boolean(serviceTransactionId);
      const balance = isServicePayment ? Number(pendingRow?.balance || 0) : (await PaymentService.getStudentBalance(student.id)).balance;
      const concept = pendingRow?.student?.course || pendingRow?.course || student.course || 'Curso';
      const collectionBranchId = authService.getCurrentUser()?.branch_id || '';
      const methods = await PaymentService.getAvailableMethods(collectionBranchId);
      const modal = document.getElementById('payment-modal');
      const methodsOptionsHtml = (methods && methods.length > 0) ? methods.map(method => `<option value="${method.code}" data-requires-reference="${method.requires_reference ? 'true' : 'false'}">${method.name}</option>`).join('') : '<option value="">No hay métodos disponibles</option>';
      const methodsDisabledAttr = (methods && methods.length > 0) ? '' : 'disabled';
      modal.innerHTML = `
        <div class="modal cash-payment-modal">
          <div class="modal-header">
            <h3 class="modal-title">Cobrar a ${StudentService.getFullName(student)}</h3>
            <button class="modal-close" id="modal-close">×</button>
          </div>
          <div class="modal-body">
            <div class="modal-field"><strong>Cédula:</strong> ${StringHelper.normalizeCedula(student.cedula)}</div>
            <div class="modal-field"><strong>${isServicePayment ? 'Servicio' : 'Curso'}:</strong> ${this.escape(concept)}</div>
            <div class="modal-field"><strong>Saldo pendiente:</strong> ${balance}</div>
            ${methods && methods.length === 0 ? '<div class="alert alert-warning">No hay métodos de pago configurados para esta sucursal.</div>' : ''}
            <form id="payment-modal-form">
              <div class="form-row">
                <div class="form-group" style="flex:1;">
                  <label class="form-label required">Monto a pagar</label>
                  <input type="number" name="amount" class="form-input" value="${balance}" step="0.01" min="0" required ${isServicePayment ? 'readonly' : ''}>
                </div>
                <div class="form-group" style="flex:1;">
                  <label class="form-label required">Método</label>
                  <select name="method" class="form-select" required ${methodsDisabledAttr}>
                    ${methodsOptionsHtml}
                  </select>
                </div>
              </div>
              <div class="form-group"><label class="form-label">Referencia</label><input name="reference" class="form-input" placeholder="Número de comprobante o referencia"></div>
              <div class="form-group">
                <label class="form-label">Comentario</label>
                <textarea name="note" class="form-input" rows="3" placeholder="Opcional"></textarea>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
            <button class="btn btn-primary" id="modal-pay" ${methodsDisabledAttr}>Registrar Pago</button>
          </div>
        </div>
      `;
      modal.classList.add('active');

      const closeModal = () => {
        modal.classList.remove('active');
        modal.innerHTML = '';
      };

      modal.querySelector('#modal-close')?.addEventListener('click', closeModal);
      modal.querySelector('#modal-cancel')?.addEventListener('click', closeModal);
      modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal();
      });

      modal.querySelector('#modal-pay')?.addEventListener('click', async () => {
        const form = modal.querySelector('#payment-modal-form');
        const fd = new FormData(form);
        const amount = fd.get('amount');
        const method = fd.get('method');
        const cashier = (sessionStorage.getItem('erp_session') && JSON.parse(sessionStorage.getItem('erp_session')).username) || 'cajera';
        // validate method exists
        if (!method) { alert('Selecciona un método de pago.'); return; }
        const selectedMethod = form.elements && form.elements.method && form.elements.method.selectedOptions ? form.elements.method.selectedOptions[0] : null;
        if (selectedMethod?.dataset.requiresReference === 'true' && !String(fd.get('reference') || '').trim()) { alert('La referencia es obligatoria para este método de pago.'); return; }

        const result = await PaymentService.registerPayment({
          studentId: student.id,
          serviceTransactionId: serviceTransactionId || null,
          cedula: student.cedula,
          amount,
          method: method.toLowerCase(),
          reference: fd.get('reference'),
          cashier,
          notify: false,
        });
        if (!result.success) {
          alert(result.error);
          return;
        }

        closeModal();
        await this.openReceiptModal(result.receipt.id, true);
      });
    };

    // delegate charge button clicks from the pending table body
    document.getElementById('pending-payments-body')?.addEventListener('click', (event) => {
      const btn = event.target.closest('.charge-btn');
      if (btn) openModal(btn.getAttribute('data-student-id'), btn.getAttribute('data-branch-id'), btn.getAttribute('data-service-transaction-id'));
    });

    document.getElementById('receipts-body')?.addEventListener('click', (event) => {
      const btn = event.target.closest('.view-receipt');
      if (btn) this.openReceiptModal(btn.getAttribute('data-id'));
    });

    // delegate void buttons
    document.getElementById('receipts-body')?.addEventListener('click', (event) => {
      const btn = event.target.closest('.void-cash-payment');
      if (btn) this.openDirectVoidModal(btn.dataset.detailId, Number(btn.dataset.amount || 0));
    });

    // Filters: form submit + quick keys
    document.getElementById('payments-filters')?.addEventListener('submit', (e) => { e.preventDefault(); this.applyPendingFilters(); });
    const cedulaInput = document.getElementById('filter-cedula');
    if (cedulaInput) {
      let debounceTimer;
      cedulaInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => this.applyPendingFilters(), 200);
      });
      cedulaInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') { clearTimeout(debounceTimer); this.applyPendingFilters(); } });
    }
    // Apply on branch change for faster UX
    document.getElementById('filter-branch')?.addEventListener('change', () => this.applyPendingFilters());
    ['filter-from', 'filter-to'].forEach(id => document.getElementById(id)?.addEventListener('change', () => this.applyPendingFilters()));
    document.getElementById('filter-clear')?.addEventListener('click', () => {
      document.getElementById('payments-filters')?.reset();
      this.applyPendingFilters();
    });

    document.querySelectorAll('[data-payment-tab]').forEach(button => button.addEventListener('click', () => {
      const tab = button.dataset.paymentTab;
      document.querySelectorAll('[data-payment-tab]').forEach(item => item.classList.toggle('active', item === button));
      document.querySelectorAll('[data-payment-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.paymentPanel === tab));
    }));
    document.getElementById('payments-refresh')?.addEventListener('click', () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    // Pagination delegates
    document.getElementById('pending-payments-pagination')?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-page]');
      if (!btn) return;
      this.pendingPage = Number(btn.dataset.page);
      this.renderPendingTable();
    });
    document.getElementById('receipts-pagination')?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-page]');
      if (!btn) return;
      this.receiptsPage = Number(btn.dataset.page);
      this.renderReceiptsTable();
    });

    // initialize tables/pagination render
    this.renderPendingTable();
    this.renderReceiptsTable();

    this.startAutomaticRefresh();
  }

  applyPendingFilters() {
    const search = (document.getElementById('filter-cedula')?.value || '').trim().toLowerCase();
    const branch = document.getElementById('filter-branch')?.value || '';
    const from = document.getElementById('filter-from')?.value || '';
    const to = document.getElementById('filter-to')?.value || '';
    this.pendingPage = 1;
    this.filteredPending = (this.pendingAll || []).filter(p => {
      if (search) {
        const c = StringHelper.normalizeCedula(p.student.cedula || '');
        const name = `${p.student.firstName || ''} ${p.student.lastName || ''}`.toLowerCase();
        if (!c.includes(search) && !name.includes(search)) return false;
      }
      if (branch) {
        if (String(p.branchId || p.branch_id || p.student.branchId || p.student.branch_id || '') !== String(branch)) return false;
      }
      if (from || to) {
        const dateValue = p.createdAt || p.created_at || p.date || p.payment_date || '';
        if (dateValue) {
          const d = new Date(String(dateValue).slice(0,10));
          if (from && d < new Date(from)) return false;
          if (to && d > new Date(to)) return false;
        }
      }
      return true;
    });
    this.receiptsPage = 1;
    this.filteredReceipts = (this.receiptsAll || []).filter(receipt => {
      if (search) {
        const identification = StringHelper.normalizeCedula(receipt.cedula || '');
        if (!identification.includes(search) && !String(receipt.studentName || '').toLowerCase().includes(search)) return false;
      }
      if (branch && String(receipt.branch_id || receipt.branchId || '') !== String(branch)) return false;
      const dateValue = receipt.created_at || receipt.date || receipt.payment_date || '';
      if ((from || to) && dateValue) {
        const date = new Date(String(dateValue).slice(0, 10));
        if (from && date < new Date(from)) return false;
        if (to && date > new Date(to)) return false;
      }
      return true;
    });
    if (this.initialSearch) this.applyPendingFilters();
    else {
      this.renderPendingTable();
      this.renderReceiptsTable();
    }
  }

  renderPendingTable() {
    const rows = this.filteredPending || this.pendingAll || [];
    const total = rows.length;
    const pages = Math.max(Math.ceil(total / this.pendingPageSize), 1);
    if (this.pendingPage > pages) this.pendingPage = pages;
    const start = (this.pendingPage - 1) * this.pendingPageSize;
    const visible = rows.slice(start, start + this.pendingPageSize);
    const html = visible
      .map(p => {
        const cedula = StringHelper.normalizeCedula(p.student.cedula);
        const branchId = p.branchId || p.student.branchId || p.branch_id || p.student.branch_id || '';
        const fullName = `${p.student.firstName || ''} ${p.student.lastName || ''}`.trim();
        return `<tr data-student-id="${this.escape(p.student.id)}" data-branch-id="${this.escape(branchId)}"><td class="student-cell"><strong>${this.escape(fullName)}</strong><small>${this.escape(p.branchName || '')}</small></td><td>${this.escape(cedula)}</td><td><span class="course-pill">${this.escape(p.student.course)}</span></td><td><span class="balance-value">${this.money(p.balance)}</span></td><td><button class="btn btn-primary charge-btn" data-student-id="${this.escape(p.student.id)}" data-branch-id="${this.escape(branchId)}" data-service-transaction-id="${this.escape(p.serviceTransactionId || '')}">Cobrar</button></td></tr>`;
      })
      .join('') || '<tr><td colspan="5" class="dashboard-empty">No hay pagos pendientes.</td></tr>';
    const body = document.getElementById('pending-payments-body');
    if (body) body.innerHTML = html;
    const resultCount = document.getElementById('pending-result-count');
    if (resultCount) resultCount.textContent = `${total} ${total === 1 ? 'resultado' : 'resultados'}`;
    // pagination
    const pagination = document.getElementById('pending-payments-pagination');
    if (pagination) {
      pagination.innerHTML = `<button data-page="${Math.max(this.pendingPage-1,1)}" ${this.pendingPage<=1? 'disabled' : ''}>Anterior</button><span style="margin:0 8px">Página ${this.pendingPage} de ${pages}</span><button data-page="${Math.min(this.pendingPage+1,pages)}" ${this.pendingPage>=pages? 'disabled' : ''}>Siguiente</button>`;
    }
  }

  renderReceiptsTable() {
    const rows = this.filteredReceipts || this.receiptsAll || [];
    const total = rows.length;
    const pages = Math.max(Math.ceil(total / this.receiptsPageSize), 1);
    if (this.receiptsPage > pages) this.receiptsPage = pages;
    const start = (this.receiptsPage -1) * this.receiptsPageSize;
    const visible = rows.slice(start, start + this.receiptsPageSize);
    const body = document.getElementById('receipts-body');
    if (body) body.innerHTML = visible.map(r => `<tr><td class="student-cell"><strong>${this.escape(r.studentName || '')}</strong></td><td>${this.escape(StringHelper.normalizeCedula(r.cedula||''))}</td><td><span class="course-pill">${this.escape(r.course || '')}</span></td><td><strong>${this.money(r.amount)}</strong></td><td>${this.escape(r.receipt_number || r.number || '')}</td><td><div class="payment-actions"><button class="btn btn-secondary view-receipt" data-id="${this.escape(r.id)}">Ver</button>${String(r.payment_detail_status || 'ACTIVE').toUpperCase() === 'VOIDED' ? '<span class="badge badge-danger">Anulado</span>' : this.canVoidPayments && !r.service_receipt ? `<button class="btn btn-danger void-cash-payment" data-detail-id="${this.escape(r.payment_detail_id)}" data-amount="${Number(r.amount || 0).toFixed(2)}">Anular</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="6" class="dashboard-empty">No hay pagos registrados.</td></tr>';
    const resultCount = document.getElementById('receipts-result-count');
    if (resultCount) resultCount.textContent = `${total} ${total === 1 ? 'resultado' : 'resultados'}`;
    const pagination = document.getElementById('receipts-pagination');
    if (pagination) {
      pagination.innerHTML = `<button data-page="${Math.max(this.receiptsPage-1,1)}" ${this.receiptsPage<=1? 'disabled' : ''}>Anterior</button><span style="margin:0 8px">Página ${this.receiptsPage} de ${pages}</span><button data-page="${Math.min(this.receiptsPage+1,pages)}" ${this.receiptsPage>=pages? 'disabled' : ''}>Siguiente</button>`;
    }
  }

  startAutomaticRefresh() {
    this.refreshTimer = window.setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      if (this.receiptOpen || document.getElementById('receipt-modal')?.classList.contains('active')) return;

      try {
        const pending = await PaymentService.getPendingPayments();
        if (this.createSnapshot(pending) !== this.pendingSnapshot) {
          window.dispatchEvent(new CustomEvent('erp:dataChanged', {
            detail: { collection: 'payments', action: 'pending-payments-updated' },
          }));
        }
      } catch (error) {
        console.warn('No se pudo actualizar automáticamente los pagos pendientes:', error.message);
      }
    }, 2000);
  }

  createSnapshot(payments) {
    return payments
      .map(payment => `${payment.studentId}:${payment.balance}:${payment.status}`)
      .sort()
      .join('|');
  }

  unmount() {
    if (this.refreshTimer) window.clearInterval(this.refreshTimer);
    super.unmount();
  }

  async openReceiptModal(receiptId, refreshOnClose = false) {
    this.receiptOpen = true;
    let html;
    try {
      const result = await ApiService.getReceiptPrintHTML(receiptId);
      if (!result.success || !result.html) throw new Error('Comprobante no disponible');
      html = result.html;
    } catch (error) {
      this.receiptOpen = false;
      alert('No se pudo cargar el comprobante. Intenta nuevamente.');
      console.error('Error al cargar comprobante:', error);
      return;
    }

    const modal = document.getElementById('receipt-modal');
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <div><h3 class="modal-title">Pago registrado correctamente</h3><p style="margin:4px 0 0;color:#667085">Voucher listo para imprimir</p></div>
          <button class="modal-close" id="receipt-close">×</button>
        </div>
        <div class="modal-body">${html}</div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="receipt-close-btn">Cerrar</button>
          <button class="btn btn-primary" id="receipt-print">Imprimir voucher</button>
        </div>
      </div>
    `;
    modal.classList.add('active');

    const close = () => {
      this.receiptOpen = false;
      modal.classList.remove('active');
      modal.innerHTML = '';
      if (refreshOnClose) PaymentService.notifyPaymentChanged();
    };

    modal.querySelector('#receipt-close')?.addEventListener('click', close);
    modal.querySelector('#receipt-close-btn')?.addEventListener('click', close);
    modal.querySelector('#receipt-print')?.addEventListener('click', () => this.printReceipt(html));
    modal.addEventListener('click', (event) => {
      if (event.target === modal) close();
    });
  }

  printReceipt(html) {
    const printWindow = window.open('', '_blank', 'width=460,height=720');
    if (!printWindow) {
      alert('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes e intenta nuevamente.');
      return;
    }
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Voucher de pago</title><style>body{margin:0;padding:18px;background:#fff}.receipt{max-width:340px!important}@page{size:80mm auto;margin:5mm}@media print{body{padding:0}}</style></head><body>${html}<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}<\/script></body></html>`);
    printWindow.document.close();
  }

  openDirectVoidModal(detailId, amount) {
    const modal = document.getElementById('payment-modal');
    if (!modal || !detailId) return;
    modal.innerHTML = `<div class="modal" style="max-width:520px"><div class="modal-header"><h3 class="modal-title">Anular pago</h3><button class="modal-close" data-close>&times;</button></div><div class="modal-body"><div class="alert alert-warning" style="display:block">Esta anulación es directa y restaurará <strong>$${amount.toFixed(2)}</strong> al saldo pendiente. La operación quedará auditada.</div><form id="cash-void-form"><label class="form-label required">Motivo</label><textarea class="form-textarea" name="reason" minlength="5" required placeholder="Indique por qué se anula el pago"></textarea></form></div><div class="modal-footer"><button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-danger" id="cash-void-submit">Confirmar anulación</button></div></div>`;
    modal.classList.add('active');
    const close = () => { modal.classList.remove('active'); modal.innerHTML = ''; };
    modal.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', close));
    modal.querySelector('#cash-void-submit')?.addEventListener('click', async () => {
      const form = modal.querySelector('#cash-void-form');
      if (!form.reportValidity()) return;
      const submit = modal.querySelector('#cash-void-submit');
      submit.disabled = true; submit.textContent = 'Anulando…';
      try { await ApiService.voidPaymentDirectly(detailId, String(new FormData(form).get('reason') || '').trim()); close(); window.dispatchEvent(new PopStateEvent('popstate')); }
      catch (error) { submit.disabled = false; submit.textContent = 'Confirmar anulación'; alert(error.message || 'No se pudo anular el pago.'); }
    });
  }
}

export default PendingPaymentsView;
