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
      })
    : "—";

class CashOperationsView extends Component {
  async load() {
    const [workspace, pending, receipts, methods] = await Promise.all([
      ApiService.getCashWorkspace(),
      PaymentService.getPendingPayments(),
      ApiService.getReceipts(),
      PaymentService.getAvailableMethods(),
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
      (x) => x.status === "PENDING",
    ).length;
    const urgent = this.data.alerts.filter(
      (x) => x.alert_type !== "PENDING_BALANCE",
    ).length;
    const content = `<div class="cash-ops"><style>.cash-ops{display:grid;gap:18px}.cash-ops-head{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:22px;border:1px solid #dbe4f0;border-radius:16px;background:linear-gradient(135deg,#f8fbff,#eef2ff)}.cash-ops-head h1{margin:0;color:#17233e}.cash-ops-head p{margin:5px 0 0;color:#667085}.cash-ops-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.cash-ops-kpi{padding:16px;border:1px solid #e4e7ec;border-radius:13px;background:#fff}.cash-ops-kpi strong{display:block;font-size:24px}.cash-ops-kpi span{font-size:13px;color:#667085}.cash-ops-tabs{display:flex;gap:7px;padding:8px;border:1px solid #e4e7ec;border-radius:13px;background:#f8fafc}.cash-ops-tab{flex:1;border:0;border-radius:9px;padding:11px;background:transparent;font-weight:700;color:#667085;cursor:pointer}.cash-ops-tab.active{background:#5146e5;color:#fff}.cash-ops-panel{display:none;border:1px solid #e4e7ec;border-radius:14px;background:#fff;overflow:hidden}.cash-ops-panel.active{display:block}.cash-ops-panel-head{display:flex;justify-content:space-between;align-items:center;padding:17px 19px;border-bottom:1px solid #eaecf0}.cash-ops-panel-head h2{margin:0;font-size:19px}.cash-ops-list{display:grid;gap:10px;padding:16px}.cash-ops-item{display:grid;grid-template-columns:1.5fr 1fr auto;align-items:center;gap:14px;padding:14px;border:1px solid #e4e7ec;border-radius:11px}.cash-ops-item strong,.cash-ops-item small{display:block}.cash-ops-item small{margin-top:3px;color:#667085}.cash-ops-actions{display:flex;gap:7px}.cash-ops-badge{display:inline-flex;padding:5px 9px;border-radius:999px;background:#fff1cc;color:#995b00;font-size:11px;font-weight:800}.cash-ops-badge.CONFIRMED,.cash-ops-badge.APPLIED{background:#dcfce7;color:#067647}.cash-ops-badge.REJECTED{background:#fee2e2;color:#b42318}.cash-ops-modal .modal{max-width:620px}.cash-ops-form{display:grid;grid-template-columns:1fr 1fr;gap:13px}.cash-ops-form label{display:grid;gap:6px;font-size:13px;font-weight:700}.cash-ops-form .wide{grid-column:1/-1}@media(max-width:700px){.cash-ops-head{align-items:flex-start}.cash-ops-kpis{display:flex;overflow:auto}.cash-ops-kpi{min-width:155px}.cash-ops-tabs{overflow:auto}.cash-ops-tab{min-width:145px}.cash-ops-item{grid-template-columns:1fr}.cash-ops-actions{flex-wrap:wrap}.cash-ops-form{grid-template-columns:1fr}.cash-ops-form .wide{grid-column:auto}}</style><header class="cash-ops-head"><div><span class="cash-dashboard__eyebrow">CONTROL DE CARTERA</span><h1>Operaciones de Caja</h1><p>Verifica transferencias, atiende alertas y corrige datos sin alterar valores.</p></div></header>${this.error ? `<div class="alert alert-error">${esc(this.error)}</div>` : ""}<section class="cash-ops-kpis"><article class="cash-ops-kpi"><strong>${pendingTransfers}</strong><span>Transferencias por verificar</span></article><article class="cash-ops-kpi"><strong>${urgent}</strong><span>Alertas prioritarias</span></article><article class="cash-ops-kpi"><strong>${this.data.corrections.length}</strong><span>Correcciones auditadas</span></article></section><nav class="cash-ops-tabs"><button class="cash-ops-tab active" data-tab="transfers">Transferencias</button><button class="cash-ops-tab" data-tab="alerts">Alertas financieras</button><button class="cash-ops-tab" data-tab="corrections">Correcciones</button></nav><section class="cash-ops-panel active" data-panel="transfers"><div class="cash-ops-panel-head"><h2>Transferencias registradas</h2><button class="btn btn-primary" id="new-transfer">Nueva transferencia</button></div><div class="cash-ops-list">${this.transferRows()}</div></section><section class="cash-ops-panel" data-panel="alerts"><div class="cash-ops-panel-head"><h2>Atención requerida</h2></div><div class="cash-ops-list">${this.alertRows()}</div></section><section class="cash-ops-panel" data-panel="corrections"><div class="cash-ops-panel-head"><h2>Corrección de datos del cobro</h2><button class="btn btn-primary" id="new-correction">Corregir cobro</button></div><div class="cash-ops-list">${this.correctionRows()}</div></section><div class="modal-overlay cash-ops-modal" id="cash-ops-modal"></div></div>`;
    const layout = await SidebarLayout.render(content);
    setTimeout(() => SidebarLayout.attachEventListeners(), 0);
    return layout;
  }
  transferRows() {
    return (
      this.data.transfers
        .map(
          (x) =>
            `<article class="cash-ops-item"><div><strong>${esc(x.student_name)}</strong><small>${esc(x.identification)} · ${esc(x.bank)} · Ref. ${esc(x.reference)}</small></div><div><strong>${money(x.amount)}</strong><small>${date(x.created_at)}</small></div><div class="cash-ops-actions"><span class="cash-ops-badge ${esc(x.status)}">${{ PENDING: "Pendiente", CONFIRMED: "Confirmada", REJECTED: "Rechazada" }[x.status] || x.status}</span>${x.status === "PENDING" ? `<button class="btn btn-primary review-transfer" data-id="${x.id}" data-decision="CONFIRMED">Confirmar</button><button class="btn btn-secondary review-transfer" data-id="${x.id}" data-decision="REJECTED">Rechazar</button>` : ""}</div></article>`,
        )
        .join("") ||
      '<p class="dashboard-empty">No hay transferencias registradas.</p>'
    );
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
    if (!authService.can("TRANSFER_VERIFY")) document.querySelectorAll(".review-transfer").forEach((button) => button.remove());
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
      document.querySelector('[data-panel="transfers"] .cash-ops-panel-head')?.append(exportButton);
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
    document.querySelectorAll(".review-transfer").forEach(
      (btn) =>
        (btn.onclick = async () => {
          const action =
            btn.dataset.decision === "CONFIRMED"
              ? "confirmar y aplicar al saldo"
              : "rechazar";
          if (!confirm(`¿Deseas ${action} esta transferencia?`)) return;
          btn.disabled = true;
          try {
            await ApiService.reviewTransferVerification(
              btn.dataset.id,
              btn.dataset.decision,
            );
            this.refresh();
          } catch (e) {
            btn.disabled = false;
            alert(e.message);
          }
        }),
    );
  }
  modal(html) {
    const host = document.getElementById("cash-ops-modal");
    host.innerHTML = `<div class="modal"><div class="modal-header"><h3 class="modal-title">${html.title}</h3><button class="modal-close" data-close>&times;</button></div><div class="modal-body">${html.body}<div id="cash-op-error" class="form-error"></div></div><div class="modal-footer"><button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" id="cash-op-save">${html.save}</button></div></div>`;
    host.classList.add("active");
    host.querySelectorAll("[data-close]").forEach(
      (x) =>
        (x.onclick = () => {
          host.classList.remove("active");
          host.innerHTML = "";
        }),
    );
    return host;
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
