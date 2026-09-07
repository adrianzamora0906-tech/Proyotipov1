import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import PaymentService from '../../services/PaymentService.js';
import StudentService from '../../services/StudentService.js';
import ReceiptService from '../../services/ReceiptService.js';
import StringHelper from '../../helpers/StringHelper.js';

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

    const renderStudent = (student) => {
      if (!student) {
        studentCard.innerHTML = `<div class="alert">Estudiante no encontrado</div>`;
        return;
      }

      const bal = PaymentService.getStudentBalance(student.id);
      const normalizedCedula = StringHelper.normalizeCedula(student.cedula);

      const renderPaymentForm = async () => {
      const methods = await PaymentService.getAvailableMethods(JSON.parse(sessionStorage.getItem('erp_session') || '{}').branch_id || '');
      studentCard.innerHTML = `
        <div class="card">
          <div class="card-body">
            <h4>${StudentService.getFullName(student)}</h4>
            <div>Cédula: ${normalizedCedula}</div>
            <div>Curso: ${student.course}</div>
            <div>Sucursal: ${student.branch || ''}</div>
            <div>Estado: ${student.status}</div>
            <div>Valor curso: ${bal.total}</div>
            <div>Pagado: ${bal.paid}</div>
            <div>Saldo: ${bal.balance}</div>

            <hr/>
            <form id="payment-form">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Monto a pagar</label>
                  <input type="number" name="amount" class="form-input" value="${bal.balance}" step="0.01" min="0">
                </div>

                <div class="form-group">
                  <label class="form-label required">Método</label>
                  <select name="method" class="form-select" required>
                    ${methods.map(method => `<option value="${method.code}" data-requires-reference="${method.requires_reference ? 'true' : 'false'}">${method.name}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-group"><label class="form-label">Referencia</label><input name="reference" class="form-input" placeholder="Número de comprobante o referencia"></div>

              <div class="form-footer">
                <button type="button" class="btn btn-secondary" id="cancel-payment">Cancelar</button>
                <button type="submit" class="btn btn-primary">Registrar Pago</button>
              </div>
            </form>
          </div>
        </div>
      `;

      const form = document.getElementById('payment-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const amount = fd.get('amount');
        const method = fd.get('method');
        const selectedMethod = form.elements.method.selectedOptions[0];
        if (selectedMethod?.dataset.requiresReference === 'true' && !String(fd.get('reference') || '').trim()) { alert('La referencia es obligatoria para este método de pago.'); return; }
        const cashier = (sessionStorage.getItem('erp_session') && JSON.parse(sessionStorage.getItem('erp_session')).username) || 'cajera';

        const res = await PaymentService.registerPayment({ studentId: student.id, amount, method, reference:fd.get('reference'), cedula:student.cedula, cashier });
        if (!res.success) {
          alert(res.error);
          return;
        }

        studentCard.innerHTML = `<div class="alert alert-success">Pago registrado. Comprobante: ${res.receipt.number}</div>`;
      });

      document.getElementById('cancel-payment').addEventListener('click', () => {
        window.history.pushState(null, null, '/cash');
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      };
      renderPaymentForm();
    };

    const searchError = document.getElementById('search-error');
    const queryParams = new URLSearchParams(window.location.search);
    const prefillCedula = queryParams.get('cedula') || '';
    const prefillStudentId = queryParams.get('studentId') || '';

    const validateInput = () => {
      const cedula = searchInput.value.replace(/\D/g, '');
      searchInput.value = cedula;
      searchError.style.display = 'none';

      if (cedula.length === 10) {
        const student = PaymentService.findStudentByCedula(cedula);
        if (!student) {
          searchError.textContent = 'Cédula no encontrada. Verifica los números.';
          searchError.style.display = 'block';
          studentCard.innerHTML = '';
          return;
        }
        renderStudent(student);
      } else {
        studentCard.innerHTML = '';
      }
    };

    if (prefillStudentId) {
      const student = StudentService.getStudent(prefillStudentId);
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
