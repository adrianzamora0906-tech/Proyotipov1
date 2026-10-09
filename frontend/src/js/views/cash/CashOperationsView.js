import Component from "../../components/Component.js";
import SidebarLayout from "../../layouts/SidebarLayout.js";
import ApiService from "../../core/api/apiService.js";
import PaymentService from "../../services/PaymentService.js";
import { authService } from "../../core/auth/AuthService.js";

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (value) =>
  new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(
    Number(value || 0),
  );
const date = (value) =>
  value
    ? new Date(value).toLocaleString("es-EC", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Guayaquil",
      })
    : "—";

class CashOperationsView extends Component {
  async load() {
    const [workspace, pending, receipts, methods] = await Promise.all([
      ApiService.getCashWorkspace(),
      PaymentService.getPendingPayments(),
      authService.can('RECEIPT_VIEW') ? ApiService.getReceipts() : Promise.resolve({data: []}),
      authService.can('PAYMENT_CREATE') ? PaymentService.getAvailableMethods() : Promise.resolve([]),
    ]);
    this.data = workspace.data || {
      alerts: [],
      transfers: [],
      corrections: [],
    };
    this.pending = pending || [];
    this.receipts = receipts.data || [];
    this.methods = methods || [];
  }
  async render() {
    try {
      await this.load();
      this.error = "";
    } catch (error) {
      this.error = error.message;
      this.data = { alerts: [], transfers: [], corrections: [] };
      this.pending = [];
      this.receipts = [];
      this.methods = [];
    }
    const pendingTransfers = this.data.transfers.filter(
      (x) => ["PENDING", "AWAITING_APPROVAL"].includes(x.status) || this.needsLegacyApproval(x),
    ).length;
    const urgent = this.data.alerts.filter(
      (x) => x.alert_type !== "PENDING_BALANCE",
    ).length;
    const content = `<link rel="stylesheet" href="/src/assets/css/pages/cash-operations.css">
      <div class="cash-ops">
        <header class="cash-ops-head"><div><span class="cash-dashboard__eyebrow">CONTROL DE CARTERA</span><h1>Operaciones de Caja</h1></div></header>
        ${this.error ? `<div class="alert alert-error">${esc(this.error)}</div>` : ""}
        <section class="cash-ops-kpis">
          <article class="cash-ops-kpi"><strong id="transfer-pending-total">${pendingTransfers}</strong><span>Transferencias pendientes</span></article>
          <article class="cash-ops-kpi"><strong>${urgent}</strong><span>Alertas prioritarias</span></article>
          <article class="cash-ops-kpi"><strong>${this.data.corrections.length}</strong><span>Correcciones auditadas</span></article>
        </section>
        <nav class="cash-ops-tabs" aria-label="Operaciones">
          <button class="cash-ops-tab active" data-tab="transfers">Transferencias</button>
          <button class="cash-ops-tab" data-tab="alerts">Alertas financieras</button>
          <button class="cash-ops-tab" data-tab="corrections">Correcciones</button>
        </nav>
        <section class="cash-ops-panel active" data-panel="transfers">
          <div class="cash-ops-panel-head"><h2>Transferencias</h2><div class="cash-ops-toolbar-actions"><button class="btn btn-primary" id="new-transfer">Nueva transferencia</button></div></div>
          <div class="cash-ops-filters">
            <label class="cash-ops-search"><span>Buscar</span><input class="form-input" id="transfer-search" type="search" placeholder="Nombre, cédula o comprobante"></label>
            <label><span>Estado</span><select class="form-select" id="transfer-state"><option value="all">Todos los estados</option><option value="approval">Por aprobar</option><option value="confirmation">Por confirmar</option><option value="completed">Aprobadas / aplicadas</option><option value="rejected">Rechazadas</option></select></label>
            <label><span>Desde</span><input class="form-input" type="date" id="transfer-from"></label>
            <label><span>Hasta</span><input class="form-input" type="date" id="transfer-to"></label>
          </div>
          <div class="cash-ops-results"><span id="transfer-result-count"></span><span id="transfer-feedback" role="status" aria-live="polite"></span></div>
          <div class="cash-ops-columns" aria-hidden="true"><span>Estudiante y comprobante</span><span>Valor y fecha</span><span>Estado y revisión</span></div>
          <div class="cash-ops-list" id="transfer-list">${this.transferRows()}</div>
        </section>
        <section class="cash-ops-panel" data-panel="alerts"><div class="cash-ops-panel-head"><h2>Atención requerida</h2></div><div class="cash-ops-list">${this.alertRows()}</div></section>
        <section class="cash-ops-panel" data-panel="corrections"><div class="cash-ops-panel-head"><h2>Corrección de datos del cobro</h2><button class="btn btn-primary" id="new-correction">Corregir cobro</button></div><div class="cash-ops-list">${this.correctionRows()}</div></section>
        <div class="modal-overlay cash-ops-modal" id="cash-ops-modal"></div>
      </div>`;
    const layout = await SidebarLayout.render(content);
    setTimeout(() => SidebarLayout.attachEventListeners(), 0);
    return layout;
  }
  transferRows() {
    return (
      this.data.transfers
        .filter((transfer) => this.matchesTransfer(transfer))
        .slice()
        .sort((a, b) => {
          const pending = (value) => ['PENDING', 'AWAITING_APPROVAL'].includes(value.status)
            || this.needsLegacyApproval(value);
          const aPending = pending(a);
          const bPending = pending(b);
          if (aPending !== bPending) return aPending ? -1 : 1;
          if (!aPending) {
            const completedDate = (value) => Date.parse(value.approved_at || value.reviewed_at || value.created_at) || 0;
            return completedDate(a) - completedDate(b);
          }
          const transferDate = (value) => Date.parse(value.transfer_date || value.created_at) || 0;
          return transferDate(b) - transferDate(a)
            || (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0);
        })
        .map(
          (x) =>
            `<article class="cash-ops-item"><div><strong>${esc(x.student_name)}</strong><small>Cédula: ${esc(x.identification)}</small><small>Comprobante: ${esc(x.reference || 'Sin referencia')} · ${esc(x.bank || 'Sin banco')}</small></div><div><strong class="transfer-amount">${money(x.amount)}</strong><small>${this.transferDateLabel(x)}</small></div><div class="cash-ops-state"><span class="cash-ops-badge ${esc(this.needsLegacyApproval(x) ? 'AWAITING_APPROVAL' : x.status)}">${esc(this.transferStatus(x))}</span><div class="cash-ops-actions">${this.transferActions(x)}</div>${x.approved_at ? `<small>${date(x.approved_at)}</small>` : ''}</div></article>`,
        )
        .join("") ||
      '<div class="cash-ops-empty"><strong>No hay transferencias para mostrar</strong></div>'
    );
  }
  needsLegacyApproval(transfer) {
    return transfer.status === "CONFIRMED" && !transfer.approved_at && !transfer.direct_payment;
  }
  transferDay(transfer) {
    if (transfer.transfer_date) return String(transfer.transfer_date).slice(0, 10);
    if (!transfer.created_at) return '';
    return new Date(transfer.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
  }
  transferDateLabel(transfer) {
    const day = this.transferDay(transfer);
    return day ? new Date(`${day}T12:00:00-05:00`).toLocaleDateString('es-EC', { dateStyle: 'medium', timeZone: 'America/Guayaquil' }) : 'Sin fecha';
  }
  matchesTransfer(transfer) {
    const filters = this.transferFilters || {};
    const search = String(filters.search || '').trim().toLocaleLowerCase('es');
    if (search && ![transfer.student_name, transfer.identification, transfer.reference, transfer.bank].some(value => String(value || '').toLocaleLowerCase('es').includes(search))) return false;
    const approval = transfer.status === 'AWAITING_APPROVAL' || this.needsLegacyApproval(transfer);
    if (filters.state === 'approval' && !approval) return false;
    if (filters.state === 'confirmation' && transfer.status !== 'PENDING') return false;
    if (filters.state === 'completed' && (transfer.status !== 'CONFIRMED' || approval)) return false;
    if (filters.state === 'rejected' && transfer.status !== 'REJECTED') return false;
    const day = this.transferDay(transfer);
    return !(filters.from && day < filters.from) && !(filters.to && day > filters.to);
  }
  updateTransferList(message = '') {
    document.getElementById('transfer-list').innerHTML = this.transferRows();
    const count = this.data.transfers.filter(transfer => this.matchesTransfer(transfer)).length;
    document.getElementById('transfer-result-count').textContent = `${count} de ${this.data.transfers.length} transferencias`;
    document.getElementById('transfer-pending-total').textContent = this.data.transfers.filter(transfer => ['PENDING', 'AWAITING_APPROVAL'].includes(transfer.status) || this.needsLegacyApproval(transfer)).length;
    document.getElementById('transfer-feedback').textContent = message;
  }
  transferStatus(transfer) {
    if (this.needsLegacyApproval(transfer)) return 'Por aprobar (pago aplicado)';
    return { PENDING: 'Por confirmar', AWAITING_APPROVAL: 'Por aprobar', CONFIRMED: transfer.approved_at ? 'Aprobada' : 'Aplicada', REJECTED: 'Rechazada' }[transfer.status] || transfer.status;
  }
  transferActions(transfer) {
    const legacy = this.needsLegacyApproval(transfer);
    const approval = transfer.status === "AWAITING_APPROVAL" || legacy;
    if (transfer.status !== "PENDING" && !approval) return "";
    const permission = approval ? "TRANSFER_APPROVE" : "TRANSFER_VERIFY";
    if (!authService.can(permission)) return "";
    const stage = approval ? "approval" : "confirmation";
    const decision = approval ? "APPROVED" : "CONFIRMED";
    return `<button class="btn btn-primary review-transfer" data-stage="${stage}" data-id="${transfer.id}" data-decision="${decision}" data-applied="${legacy}">${approval ? "Aprobar" : "Confirmar"}</button>${legacy ? '' : `<button class="btn btn-secondary review-transfer" data-stage="${stage}" data-id="${transfer.id}" data-decision="REJECTED">Rechazar</button>`}`;
  }
  alertRows() {
    const labels = {
      STARTING_WITHOUT_HALF: "Inicia pronto sin alcanzar el 50 %",
      IN_CLASS_WITH_DEBT: "Está en clases y mantiene deuda",
      PENDING_BALANCE: "Saldo pendiente",
    };
    return (
      this.data.alerts
        .map(
          (x) =>
            `<article class="cash-ops-item"><div><strong>${esc(x.student_name)}</strong><small>${esc(x.identification)} · ${esc(labels[x.alert_type])}</small></div><div><strong>${money(x.balance)}</strong><small>Saldo pendiente</small></div><a class="btn btn-primary" href="/cash/pending?search=${encodeURIComponent(x.identification || "")}">Ver cuenta</a></article>`,
        )
        .join("") ||
      '<p class="dashboard-empty">No existen alertas financieras.</p>'
    );
  }
  correctionRows() {
    return (
      this.data.corrections
        .map(
          (x) =>
            `<article class="cash-ops-item"><div><strong>${esc(x.student_name)}</strong><small>${esc(x.identification)} · ${esc(x.reason)}</small></div><div><strong>Datos corregidos</strong><small>${date(x.created_at)}</small></div><span class="cash-ops-badge APPLIED">Auditado</span></article>`,
        )
        .join("") ||
      '<p class="dashboard-empty">No hay correcciones registradas.</p>'
    );
  }
  async mount() {
    document.querySelectorAll(".cash-ops-badge.PENDING").forEach((badge) => { badge.textContent = "Por confirmar"; });
    if (!authService.can("PAYMENT_CREATE")) document.getElementById("new-transfer")?.remove();
    document.querySelectorAll(".review-transfer").forEach((button) => {
      if (!authService.can(button.dataset.stage === "approval" ? "TRANSFER_APPROVE" : "TRANSFER_VERIFY")) button.remove();
    });
    if (authService.can("TRANSFER_EXPORT")) {
      const exportButton = document.createElement("button");
      exportButton.type = "button";
      exportButton.className = "btn btn-secondary";
      exportButton.textContent = "Exportar hoy";
      exportButton.addEventListener("click", async () => {
        exportButton.disabled = true;
        try {
          const file = await ApiService.exportTransferVerifications(new Date().toLocaleDateString("en-CA"));
          const url = URL.createObjectURL(file.blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = file.filename;
          link.click();
          URL.revokeObjectURL(url);
        } catch (error) { alert(error.message || "No se pudo exportar."); }
        finally { exportButton.disabled = false; }
      });
      document.querySelector('.cash-ops-toolbar-actions')?.append(exportButton);
    }
    document.querySelectorAll(".cash-ops-tab").forEach(
      (btn) =>
        (btn.onclick = () => {
          document
            .querySelectorAll(".cash-ops-tab")
            .forEach((x) => x.classList.toggle("active", x === btn));
          document
            .querySelectorAll(".cash-ops-panel")
            .forEach((x) =>
              x.classList.toggle("active", x.dataset.panel === btn.dataset.tab),
            );
        }),
    );
    document
      .getElementById("new-transfer")
      ?.addEventListener("click", () => this.openTransfer());
    document
      .getElementById("new-correction")
      ?.addEventListener("click", () => this.openCorrection());
    this.transferFilters = { search: '', state: 'all', from: '', to: '' };
    for (const [id, key] of [['transfer-search', 'search'], ['transfer-state', 'state'], ['transfer-from', 'from'], ['transfer-to', 'to']]) {
      document.getElementById(id).addEventListener(key === 'search' ? 'input' : 'change', (event) => {
        this.transferFilters[key] = event.target.value;
        this.updateTransferList();
      });
    }
    document.getElementById('transfer-list').addEventListener('click', (event) => {
      const button = event.target.closest('.review-transfer');
      if (button) this.openReview(button.dataset.id, button.dataset.decision, button.dataset.stage);
    });
    this.updateTransferList();
  }
  modal(html) {
    const host = document.getElementById("cash-ops-modal");
    const previousFocus = document.activeElement;
    host.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="cash-op-title"><div class="modal-header"><h3 class="modal-title" id="cash-op-title">${html.title}</h3><button class="modal-close" aria-label="Cerrar" data-close>&times;</button></div><div class="modal-body">${html.body}<div id="cash-op-error" class="form-error" role="alert"></div></div><div class="modal-footer"><button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" id="cash-op-save">${html.save}</button></div></div>`;
    host.classList.add("active");
    host.querySelectorAll("[data-close]").forEach(
      (x) =>
        (x.onclick = () => {
          host.classList.remove("active");
          host.innerHTML = "";
          host.onkeydown = null;
          previousFocus?.focus();
        }),
    );
    host.onkeydown = (event) => {
      if (event.key === 'Escape') host.querySelector('[data-close]:not(:disabled)')?.click();
      if (event.key !== 'Tab') return;
      const controls = Array.from(host.querySelectorAll('button:not(:disabled), input, select, textarea, a[href]'));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    host.querySelector('[data-close]')?.focus();
    return host;
  }
  openReview(id, decision, stage) {
    const transfer = this.data.transfers.find(item => String(item.id) === String(id));
    const approval = stage === 'approval';
    if (!transfer || !authService.can(approval ? 'TRANSFER_APPROVE' : 'TRANSFER_VERIFY')) return;
    const rejected = decision === 'REJECTED';
    const label = rejected ? 'Rechazar transferencia' : approval ? 'Aprobar transferencia' : 'Confirmar transferencia';
    const effect = rejected ? 'El saldo no se modificará.' : this.needsLegacyApproval(transfer)
      ? 'Pago ya aplicado. Esta aprobación registra la revisión sin modificar el saldo.'
      : approval ? 'El importe se aplicará al saldo del estudiante.' : 'Quedará pendiente de aprobación. El saldo no se modificará.';
    let proof = '';
    try {
      const url = new URL(transfer.proof_url);
      if (['https:', 'http:'].includes(url.protocol)) proof = `<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">Ver comprobante</a>`;
    } catch (_) {}
    const host = this.modal({
      title: label,
      save: rejected ? 'Rechazar' : approval ? 'Aprobar' : 'Confirmar',
      body: `<p class="transfer-review-value">${money(transfer.amount)}</p><div class="transfer-review-name">${esc(transfer.student_name)}</div><dl class="transfer-review-details"><div><dt>Cédula</dt><dd>${esc(transfer.identification)}</dd></div><div><dt>Comprobante</dt><dd>${esc(transfer.reference || 'Sin referencia')}</dd></div><div><dt>Banco</dt><dd>${esc(transfer.bank || 'No especificado')}</dd></div><div><dt>Fecha de transferencia</dt><dd>${this.transferDateLabel(transfer)}</dd></div><div><dt>Confirmación</dt><dd>${date(transfer.reviewed_at)}</dd></div><div><dt>Estado</dt><dd>${esc(this.transferStatus(transfer))}</dd></div></dl>${proof}<div class="alert alert-info">${effect}</div><form id="transfer-review-form"><label class="transfer-review-note">${rejected ? 'Motivo del rechazo' : 'Observación (opcional)'}<textarea name="note" class="form-input" maxlength="1000" ${rejected ? 'required' : ''}></textarea></label></form>`,
    });
    host.querySelector('#cash-op-save').onclick = async () => {
      const form = host.querySelector('#transfer-review-form');
      if (!form.reportValidity()) return;
      const note = String(new FormData(form).get('note') || '').trim();
      if (rejected && !note) { host.querySelector('#cash-op-error').textContent = 'Escribe el motivo del rechazo.'; return; }
      const button = host.querySelector('#cash-op-save');
      button.disabled = true;
      button.textContent = 'Guardando...';
      host.querySelectorAll('[data-close]').forEach(control => { control.disabled = true; });
      try {
        const review = approval ? ApiService.approveTransferVerification.bind(ApiService) : ApiService.reviewTransferVerification.bind(ApiService);
        const result = await review(id, decision, note);
        Object.assign(transfer, result.data.transfer);
        host.querySelectorAll('[data-close]').forEach(control => { control.disabled = false; });
        host.querySelector('[data-close]').click();
        this.updateTransferList(rejected ? 'Transferencia rechazada.' : approval ? 'Transferencia aprobada.' : 'Transferencia confirmada.');
        document.querySelector('#transfer-list .review-transfer')?.focus({ preventScroll: true });
      } catch (error) {
        button.disabled = false;
        host.querySelectorAll('[data-close]').forEach(control => { control.disabled = false; });
        button.textContent = rejected ? 'Rechazar' : approval ? 'Aprobar' : 'Confirmar';
        host.querySelector('#cash-op-error').textContent = error.message;
      }
    };
  }
  openTransfer() {
    const options = this.pending
      .map(
        (x, i) =>
          `<option value="${i}">${esc(x.studentName || `${x.student?.firstName || ""} ${x.student?.lastName || ""}`)} · ${money(x.balance)}</option>`,
      )
      .join("");
    const host = this.modal({
      title: "Registrar transferencia por verificar",
      save: "Guardar pendiente",
      body: `<form id="cash-op-form" class="cash-ops-form"><label class="wide">Estudiante<select class="form-select" name="pendingIndex" required><option value="">Seleccionar…</option>${options}</select></label><label>Monto<input class="form-input" type="number" name="amount" min="0.01" step="0.01" required></label><label>Banco<input class="form-input" name="bank" required></label><label>Número de transferencia<input class="form-input" name="reference" required></label><label>Fecha de transferencia<input class="form-input" type="date" name="transferDate" value="${new Date().toLocaleDateString("en-CA")}" required></label><label class="wide">Enlace del comprobante (opcional)<input class="form-input" type="url" name="proofUrl"></label></form>`,
    });
    host.querySelector("[name=pendingIndex]").onchange = (e) => {
      const p = this.pending[Number(e.target.value)];
      host.querySelector("[name=amount]").value = p
        ? Number(p.balance).toFixed(2)
        : "";
    };
    host.querySelector("#cash-op-save").onclick = async () => {
      const form = host.querySelector("form");
      if (!form.reportValidity()) return;
      const fd = new FormData(form),
        p = this.pending[Number(fd.get("pendingIndex"))],
        btn = host.querySelector("#cash-op-save");
      btn.disabled = true;
      try {
        await ApiService.createTransferVerification({
          studentId: p.studentId || p.student?.id,
          serviceTransactionId: p.serviceTransactionId || null,
          amount: Number(fd.get("amount")),
          bank: fd.get("bank"),
          reference: fd.get("reference"),
          transferDate: fd.get("transferDate"),
          proofUrl: fd.get("proofUrl"),
        });
        this.refresh();
      } catch (e) {
        btn.disabled = false;
        host.querySelector("#cash-op-error").textContent = e.message;
      }
    };
  }
  openCorrection() {
    const valid = this.receipts.filter(
      (x) =>
        String(x.payment_detail_status || "ACTIVE").toUpperCase() !==
          "VOIDED" && !x.service_receipt,
    );
    const options = valid
      .map(
        (x, i) =>
          `<option value="${i}">${esc(x.studentName)} · ${esc(x.receipt_number)} · ${money(x.amount)}</option>`,
      )
      .join("");
    const methodOptions = this.methods
      .map((x) => `<option value="${esc(x.code)}">${esc(x.name)}</option>`)
      .join("");
    const host = this.modal({
      title: "Corregir datos de un cobro",
      save: "Guardar corrección",
      body: `<div class="alert alert-info">El monto no puede modificarse. Se guardarán los datos anteriores y nuevos en auditoría.</div><form id="cash-op-form" class="cash-ops-form"><label class="wide">Comprobante<select class="form-select" name="receiptIndex" required><option value="">Seleccionar…</option>${options}</select></label><label>Método<select class="form-select" name="method" required>${methodOptions}</select></label><label>Referencia<input class="form-input" name="reference"></label><label class="wide">Comentario<input class="form-input" name="observations"></label><label class="wide">Motivo de corrección<textarea class="form-input" name="reason" minlength="5" required></textarea></label></form>`,
    });
    host.querySelector("[name=receiptIndex]").onchange = (e) => {
      const x = valid[Number(e.target.value)];
      if (x) {
        host.querySelector("[name=method]").value = x.payment_method || "";
        host.querySelector("[name=reference]").value = x.reference || "";
      }
    };
    host.querySelector("#cash-op-save").onclick = async () => {
      const form = host.querySelector("form");
      if (!form.reportValidity()) return;
      const fd = new FormData(form),
        x = valid[Number(fd.get("receiptIndex"))],
        btn = host.querySelector("#cash-op-save");
      btn.disabled = true;
      try {
        await ApiService.correctPaymentDetail(x.payment_detail_id, {
          method: fd.get("method"),
          reference: fd.get("reference"),
          observations: fd.get("observations"),
          reason: fd.get("reason"),
        });
        this.refresh();
      } catch (e) {
        btn.disabled = false;
        host.querySelector("#cash-op-error").textContent = e.message;
      }
    };
  }
  refresh() {
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}
export default CashOperationsView;
