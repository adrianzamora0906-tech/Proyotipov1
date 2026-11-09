import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import PaymentService from '../../services/PaymentService.js';
import StudentService from '../../services/StudentService.js';
import ReceiptService from '../../services/ReceiptService.js';
import StringHelper from '../../helpers/StringHelper.js';
import { authService } from '../../core/auth/AuthService.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

class RegisterPaymentView extends Component {
  async render() {
    const content = `
      <div class="card">
        <div class="card-header"><h3>Registrar Pago</h3></div>
        <div class="card-body">
          <div class="form-row">
            <div class="form-group" style="flex:1;">
              <label class="form-label required">Número de cédula</label>
              <input type="text" id="search-cedula" class="form-input" placeholder="Ingrese cédula..." maxlength="10" inputmode="numeric" pattern="\d*">
              <div id="search-error" class="form-error" style="display:none; margin-top:0.5rem;"></div>
            </div>
          </div>

          <div id="student-card" style="margin-top:1.5rem;"></div>
        </div>
      </div>
    `;

    const layout = await SidebarLayout.render(content);
    setTimeout(() => SidebarLayout.attachEventListeners(), 0);
    return layout;
  }

  async mount() {
    const searchInput = document.getElementById('search-cedula');
    const studentCard = document.getElementById('student-card');

    let renderRequest = 0;
    const renderStudent = async (student, selectedEnrollmentId = null) => {
      const request = ++renderRequest;
      if (!student) {
        studentCard.innerHTML = `<div class="alert">Estudiante no encontrado</div>`;
        return;
      }

      const account = await PaymentService.getStudentBalance(student.id);
      if (request !== renderRequest) return;
      const enrollments = account.enrollments || [];
      const enrollment = enrollments.find(item => item.id === selectedEnrollmentId) || enrollments[0];
      const enrollmentId = enrollment?.id || null;
      const bal = enrollment || account;
      const availableToCollect = Math.max(0, Number(bal.balance) - Number(bal.pendingVerification || 0));
      const normalizedCedula = StringHelper.normalizeCedula(student.cedula);

      const renderPaymentForm = async () => {
      const methods = await PaymentService.getAvailableMethods(authService.getEffectiveBranchId());
      if (request !== renderRequest) return;
      studentCard.innerHTML = `
        <div class="card">
          <div class="card-body">
            <h4>${StudentService.getFullName(student)}</h4>
            <div>Cédula: ${normalizedCedula}</div>
            ${enrollments.length ? `<div class="form-group"><label class="form-label" for="payment-enrollment">Curso a cobrar</label><select id="payment-enrollment" class="form-select">${enrollments.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === enrollmentId ? 'selected' : ''}>${escapeHtml(item.course)} · Saldo: $${Number(item.balance).toFixed(2)}</option>`).join('')}</select></div>` : `<div>Curso: ${escapeHtml(student.course)}</div>`}
            <div>Sucursal: ${student.branch || ''}</div>
            <div>Estado: ${student.status}</div>
            <div>Valor curso: ${bal.total}</div>
            <div>Pagado: ${bal.paid}</div>
            <div>Saldo: ${bal.balance}</div>
            ${Number(bal.pendingVerification) > 0 ? `<div class="alert alert-warning">Transferencias por confirmar: $${Number(bal.pendingVerification).toFixed(2)}. Disponible para cobrar: $${availableToCollect.toFixed(2)}.</div>` : ''}

            <hr/>
            <form id="payment-form">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Monto a pagar</label>
                  <input type="number" name="amount" class="form-input" value="${availableToCollect}" step="0.01" min="0.01" max="${availableToCollect}" required>
                </div>

                <div class="form-group">
                  <label class="form-label required">Método</label>
                  <select name="method" class="form-select" required>
                    ${methods.map(method => `<option value="${method.code}" data-requires-reference="${method.requires_reference ? 'true' : 'false'}">${method.name}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-group"><label class="form-label">Número de transferencia / referencia</label><input name="reference" class="form-input" placeholder="Número del comprobante o transferencia"></div>
              <div class="form-group" id="register-card-batch-group" hidden><label class="form-label required">Lote de tarjeta</label><input name="cardBatch" class="form-input" placeholder="Ej. 000123" maxlength="80"></div>

              <div class="form-footer">
                <button type="button" class="btn btn-secondary" id="cancel-payment">Cancelar</button>
                <button type="submit" class="btn btn-primary" ${availableToCollect <= 0 ? 'disabled' : ''}>Registrar Pago</button>
              </div>
            </form>
          </div>
        </div>
      `;

      const form = document.getElementById('payment-form');
      document.getElementById('payment-enrollment')?.addEventListener('change', event => renderStudent(student, event.target.value));
      const methodSelect = form.elements.method;
      const cardBatchGroup = document.getElementById('register-card-batch-group');
      const cardBatchInput = form.elements.cardBatch;
      const toggleCardBatch = () => {
        const isCard = String(methodSelect?.value || '').toLowerCase() === 'tarjeta';
        if (cardBatchGroup) cardBatchGroup.hidden = !isCard;
        if (cardBatchInput) cardBatchInput.required = isCard;
        if (!isCard && cardBatchInput) cardBatchInput.value = '';
      };
      methodSelect?.addEventListener('change', toggleCardBatch);
      toggleCardBatch();
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const amount = fd.get('amount');
        const method = fd.get('method');
        const selectedMethod = form.elements.method.selectedOptions[0];
        if (selectedMethod?.dataset.requiresReference === 'true' && !String(fd.get('reference') || '').trim()) { alert('La referencia es obligatoria para este método de pago.'); return; }
        if (String(method || '').toLowerCase() === 'tarjeta' && !String(fd.get('cardBatch') || '').trim()) { alert('Ingresa el lote de la tarjeta.'); return; }
        const cashier = (sessionStorage.getItem('erp_session') && JSON.parse(sessionStorage.getItem('erp_session')).username) || 'cajera';

        const res = await PaymentService.registerPayment({ studentId: student.id, enrollmentId, amount, method, reference:fd.get('reference'), cardBatch:fd.get('cardBatch'), cedula:student.cedula, cashier });
        if (!res.success) {
          alert(res.error);
          return;
        }

        if (res.pendingTransfer) {
          studentCard.innerHTML = `<div class="alert alert-warning">Transferencia registrada y pendiente de confirmación. El saldo todavía no fue modificado.</div>`;
          return;
        }

        studentCard.innerHTML = `<div class="alert alert-success">Pago registrado. Comprobante: ${res.receipt.number}</div>`;
      });

      document.getElementById('cancel-payment').addEventListener('click', () => {
        window.history.pushState(null, null, '/cash');
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      };
      await renderPaymentForm();
    };

    const searchError = document.getElementById('search-error');
    const queryParams = new URLSearchParams(window.location.search);
    const prefillCedula = queryParams.get('cedula') || '';
    const prefillStudentId = queryParams.get('studentId') || '';

    let searchRequest = 0;
    const validateInput = async () => {
      const request = ++searchRequest;
      ++renderRequest;
      const cedula = searchInput.value.replace(/\D/g, '');
      searchInput.value = cedula;
      searchError.style.display = 'none';

      if (cedula.length === 10) {
        const found = await PaymentService.findStudentByCedula(cedula);
        const student = found ? await StudentService.getStudent(found.id) : null;
        if (request !== searchRequest) return;
        if (!student) {
          searchError.textContent = 'Cédula no encontrada. Verifica los números.';
          searchError.style.display = 'block';
          studentCard.innerHTML = '';
          return;
        }
        await renderStudent(student);
      } else {
        studentCard.innerHTML = '';
      }
    };

    if (prefillStudentId) {
      const student = await StudentService.getStudent(prefillStudentId);
      if (student) {
        searchInput.value = StringHelper.normalizeCedula(student.cedula);
        renderStudent(student);
      } else {
        searchError.textContent = 'Estudiante no encontrado.';
        searchError.style.display = 'block';
      }
    } else if (prefillCedula) {
      searchInput.value = prefillCedula.replace(/\D/g, '');
      validateInput();
    }

    searchInput.addEventListener('input', validateInput);

    searchInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter' && searchInput.value.length === 10) {
        validateInput();
      }
    });
  }
}

export default RegisterPaymentView;
