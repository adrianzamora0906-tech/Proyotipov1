import ApiService from '../core/api/apiService.js';
import { authService } from '../core/auth/AuthService.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const currentUserId = () => { const user = authService.getCurrentUser(); return user?.userId || user?.id; };
class PaymentVoidInbox {
  mount() {
    if (!this.started) {
      this.started = true;
      window.addEventListener('erp:payment-void-changed', () => this.refresh());
      window.addEventListener('erp:realtime', event => { if (event.detail?.topics?.includes('resync')) this.refresh(); });
      window.addEventListener('erp:sessionChanged', () => { this.pending = []; this.reviewed = []; this.error = ''; document.getElementById('payment-void-button')?.remove(); document.getElementById('payment-void-inbox')?.remove(); this.refresh(); });
      window.addEventListener('online', () => this.refresh());
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refresh(); });
    }
    this.refresh();
  }

  async refresh() {
    if (this.busy) { this.again = true; return; }
    const userId = currentUserId();
    if (!userId) { document.getElementById('payment-void-button')?.remove(); return; }
    this.busy = true;
    try {
      const [pending, reviewed] = await Promise.all([ApiService.getPendingPaymentVoidRequests(), ApiService.getMyReviewedPaymentVoidRequests()]);
      if (userId !== currentUserId()) return;
      if (!pending.success || !reviewed.success) throw new Error('No se pudieron consultar las anulaciones.');
      this.pending = pending.data || []; this.reviewed = reviewed.data || []; this.error = '';
    } catch (error) { this.error = error.message || 'No se pudieron consultar las anulaciones.'; }
    finally {
      this.busy = false;
      if (userId === currentUserId()) {
        this.renderButton();
        window.dispatchEvent(new CustomEvent('erp:payment-void-inbox'));
        if (document.getElementById('payment-void-inbox') && !document.querySelector('#payment-void-inbox textarea:focus')) this.renderInbox();
      }
      if (this.again) { this.again = false; this.refresh(); }
    }
  }

  renderButton() {
    let button = document.getElementById('payment-void-button');
    const count = (this.pending?.length || 0) + (this.reviewed?.length || 0);
    if (!count && !this.error) { button?.remove(); return; }
    if (!button) {
      const bell = document.getElementById('notifications-btn');
      if (!bell) return;
      button = document.createElement('button'); button.id = 'payment-void-button'; button.className = 'topbar-item notifications-btn';
      button.type = 'button'; button.onclick = () => this.renderInbox(); bell.after(button);
    }
    button.innerHTML = `<i data-lucide="receipt-text" aria-hidden="true"></i><span class="notification-badge">${this.error ? '!' : count}</span>`;
    button.title = this.error ? 'No se pudieron cargar las anulaciones. Reintentar' : `Anulaciones: ${count} pendientes o respuestas`;
    button.setAttribute('aria-label',button.title);
    window.lucide?.createIcons();
    button.setAttribute('aria-live','polite');
  }

  renderInbox() {
    let overlay = document.getElementById('payment-void-inbox');
    if (!overlay) { overlay = document.createElement('div'); overlay.id = 'payment-void-inbox'; overlay.className = 'modal-overlay modal-overlay-secondary active'; document.body.append(overlay); }
    overlay.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-labelledby="payment-void-title" style="width:min(760px,100%);max-height:90dvh;display:flex;flex-direction:column"><header class="modal-header"><h3 class="modal-title" id="payment-void-title">Anulaciones de pagos (${this.pending?.length || 0} pendientes)</h3><button class="modal-close" aria-label="Cerrar" data-close>&times;</button></header><div class="modal-body" style="overflow:auto;min-height:0">
      ${this.error ? `<p role="alert">${escape(this.error)}</p><button class="btn btn-secondary" data-retry>Reintentar</button>` : ''}
      ${(this.pending || []).map(row => `<article style="padding:1rem 0;border-bottom:1px solid #ddd"><strong>${escape(row.student_name)}</strong><p>${escape(row.identification)} · $${Number(row.amount).toFixed(2)} · ${escape(row.payment_method)}</p><p>${escape(row.branch_name)} · Solicitado por ${escape(row.requested_by_name)}</p><p>${escape(row.reason)}</p><label class="form-label">Observacion<textarea class="form-textarea" data-note="${escape(row.id)}"></textarea></label><div class="modal-footer"><button class="btn btn-secondary" data-review="${escape(row.id)}" data-decision="REJECTED">Rechazar</button><button class="btn btn-danger" data-review="${escape(row.id)}" data-decision="APPROVED">Aprobar anulacion</button></div></article>`).join('')}
      ${(this.reviewed || []).map(row => `<article style="padding:1rem 0"><strong>${escape(row.student_name)}</strong><p>$${Number(row.amount).toFixed(2)} · ${row.status === 'APPROVED' ? 'Anulacion aprobada' : 'Anulacion rechazada'}</p><p>${escape(row.reviewed_by_name)} · ${escape(row.review_note || '')}</p><button class="btn btn-secondary" data-ack="${escape(row.id)}">Aceptar respuesta</button></article>`).join('')}
      ${!this.error && !this.pending?.length && !this.reviewed?.length ? '<p>No hay anulaciones pendientes ni respuestas por leer.</p>' : ''}<p role="alert" data-error></p></div></section>`;
    overlay.querySelector('[data-close]').onclick = () => overlay.remove();
    overlay.querySelector('[data-retry]')?.addEventListener('click', () => this.refresh());
    overlay.querySelectorAll('[data-review], [data-ack]').forEach(button => button.onclick = async () => {
      const note = overlay.querySelector(`[data-note="${button.dataset.review}"]`)?.value?.trim() || '';
      const error = overlay.querySelector('[data-error]');
      if (button.dataset.decision === 'REJECTED' && !note) { error.textContent = 'Indica el motivo del rechazo.'; return; }
      overlay.querySelectorAll('[data-review], [data-ack]').forEach(item => { item.disabled = true; });
      try {
        const result = button.dataset.ack ? await ApiService.acknowledgePaymentVoidRequest(button.dataset.ack) : await ApiService.reviewPaymentVoidRequest(button.dataset.review, button.dataset.decision, note);
        if (!result.success) throw new Error('No se pudo guardar la decision.');
        await this.refresh();
        if (overlay.isConnected) this.renderInbox();
      } catch (failure) { error.textContent = failure.message; overlay.querySelectorAll('[data-review], [data-ack]').forEach(item => { item.disabled = false; }); }
    });
  }
}
export const paymentVoidInbox = new PaymentVoidInbox();
