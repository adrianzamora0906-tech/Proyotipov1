/**
 * Student Form View
 * Formulario para registrar/editar estudiante
 */

import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import StudentService from '../../services/StudentService.js';
import Validator from '../../helpers/Validator.js';
import NotificationService from '../../services/NotificationService.js';
import StringHelper from '../../helpers/StringHelper.js';
import PaymentService from '../../services/PaymentService.js';
import { authService } from '../../core/auth/AuthService.js';
import ApiService from '../../core/api/apiService.js';

class StudentFormView extends Component {
  async render() {
    const canCollectPayment = ['secretaria_sucursal', 'secretaria_caja'].includes(authService.getCurrentUser()?.role);
    const formContent = `
      <div class="student-form">
        <div class="page-header">
          <div>
            <h1>Registrar Estudiante</h1>
            <p>Completa todos los campos requeridos</p>
          </div>
        </div>

        <div class="card">
          <form id="student-form" class="form">
            <!-- Nombre -->
            <div class="form-row">
              <div class="form-group">
                <label class="form-label required">Nombre</label>
                <input type="text" class="form-input" name="firstName" placeholder="Juan" required>
                <div class="form-error"></div>
              </div>

              <div class="form-group">
                <label class="form-label required">Apellido</label>
                <input type="text" class="form-input" name="lastName" placeholder="Pérez" required>
                <div class="form-error"></div>
              </div>
            </div>

            <!-- Cédula y Fecha de Nacimiento -->
            <div class="form-row">
              <div class="form-group">
                <label class="form-label required">Cédula</label>
                <input type="text" class="form-input" name="cedula" placeholder="1234567890" required>
                <div class="form-error"></div>
              </div>

              <div class="form-group">
                <label class="form-label required">Fecha de Nacimiento</label>
                <input type="date" class="form-input" name="birthDate" required>
                <div class="form-error"></div>
              </div>
            </div>

            <!-- Email y Teléfono -->
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Email</label>
                <input type="email" class="form-input" name="email" placeholder="juan@example.com">
                <div class="form-error"></div>
              </div>

              <div class="form-group">
                <label class="form-label">Teléfono</label>
                <input type="tel" class="form-input" name="phone" placeholder="+1234567890">
                <div class="form-error"></div>
              </div>
            </div>

            <!-- Dirección -->
            <div class="form-group">
              <label class="form-label">Dirección</label>
              <textarea class="form-textarea" name="address" placeholder="Calle, número, ciudad..."></textarea>
              <div class="form-error"></div>
            </div>

            <!-- Provincia y Sucursal -->
            <div class="form-row">
              <div class="form-group">
                <label class="form-label required">Ciudad</label>
                <select class="form-select" name="city_id" id="city-select" required>
                  <option value="">Cargando ciudades...</option>
                  <option value="Azuay">Azuay</option>
                  <option value="Bolívar">Bolívar</option>
                  <option value="Cañar">Cañar</option>
                  <option value="Carchi">Carchi</option>
                  <option value="Chimborazo">Chimborazo</option>
                  <option value="Cotopaxi">Cotopaxi</option>
                  <option value="El Oro">El Oro</option>
                  <option value="Esmeraldas">Esmeraldas</option>
                  <option value="Galápagos">Galápagos</option>
                  <option value="Guayas">Guayas</option>
                  <option value="Imbabura">Imbabura</option>
                  <option value="Loja">Loja</option>
                  <option value="Los Ríos">Los Ríos</option>
                  <option value="Manabí">Manabí</option>
                  <option value="Morona Santiago">Morona Santiago</option>
                  <option value="Napo">Napo</option>
                  <option value="Orellana">Orellana</option>
                  <option value="Pastaza">Pastaza</option>
                  <option value="Pichincha">Pichincha</option>
                  <option value="Santa Elena">Santa Elena</option>
                  <option value="Santo Domingo de los Tsáchilas">Santo Domingo de los Tsáchilas</option>
                  <option value="Sucumbíos">Sucumbíos</option>
                  <option value="Tungurahua">Tungurahua</option>
                  <option value="Zamora Chinchipe">Zamora Chinchipe</option>
                </select>
                <div class="form-error"></div>
              </div>

              <div class="form-group">
                <label class="form-label required">Sucursal</label>
                <select class="form-select" name="branch" id="branch-select" required disabled>
                  <option value="">Seleccionar sucursal...</option>
                  <option value="Sucursal Centro">Sucursal Centro</option>
                  <option value="Sucursal Norte">Sucursal Norte</option>
                  <option value="Sucursal Sur">Sucursal Sur</option>
                  <option value="Sucursal Oriente">Sucursal Oriente</option>
                  <option value="Sucursal Occidente">Sucursal Occidente</option>
                </select>
                <div class="form-error"></div>
              </div>
            </div>

            <!-- Tipo de Sangre y Vehículo -->
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Tipo de Sangre</label>
                <select class="form-select" name="bloodType">
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label required">Tipo de Vehículo</label>
                <select class="form-select" name="vehicle" required>
                  <option value="">Seleccionar...</option>
                  <option value="automovil">Automóvil</option>
                  <option value="moto">Moto</option>
                </select>
                <div class="form-error"></div>
              </div>
            </div>

            <!-- Curso -->
            <div class="form-group">
              <label class="form-label required">Curso</label>
              <select class="form-select" name="course" required>
                <option value="">Seleccionar...</option>
                <option value="clase-b">Clase B - Automóvil</option>
                <option value="clase-a">Clase A - Moto</option>
              </select>
              <div class="form-error"></div>
            </div>

            ${canCollectPayment ? `
              <div class="card" style="margin: 1.5rem 0; padding: 1rem;">
                <label class="form-label">
                  <input type="checkbox" id="collect-payment" name="collectPayment">
                  Registrar cobro ahora
                </label>
                <div id="payment-fields" style="display: none; margin-top: 1rem;">
                  <div class="form-row">
                    <div class="form-group">
                      <label class="form-label required">Monto</label>
                      <input type="number" class="form-input" name="paymentAmount" min="0.01" step="0.01">
                    </div>
                    <div class="form-group">
                      <label class="form-label required">MÃ©todo de pago</label>
                      <select class="form-select" name="paymentMethod">
                        <option value="efectivo">Efectivo</option>
                        <option value="transferencia">Transferencia</option>
                        <option value="tarjeta">Tarjeta</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            ` : ''}

            <div class="form-group">
              <label class="form-label">Observaciones <small>(opcional)</small></label>
              <textarea class="form-textarea" name="notes" rows="3" maxlength="500" placeholder="Detalle especial, referencia interna o novedad del registro."></textarea>
              <div class="form-error"></div>
            </div>

            <!-- Alert General -->
            <div id="form-alert" class="alert" style="display: none;"></div>

            <!-- Botones -->
            <div class="form-footer">
              <button type="button" class="btn btn-secondary" id="cancel-btn">Cancelar</button>
              <button type="submit" class="btn btn-primary">Registrar Estudiante</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const layout = await SidebarLayout.render(formContent);
    setTimeout(() => SidebarLayout.attachEventListeners(), 0);
    return layout;
  }

  async mount() {
    const form = document.getElementById('student-form');
    const cancelBtn = document.getElementById('cancel-btn');
    const currentUser = authService.getCurrentUser();
    const branchSelect = form.querySelector('[name="branch"]');
    const citySelect = form.querySelector('[name="city_id"]');
    await this.loadLocations(citySelect, branchSelect, currentUser);

    form.addEventListener('submit', (e) => this.handleSubmit(e));
    cancelBtn.addEventListener('click', () => {
      window.history.pushState(null, null, '/students');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    const collectPayment = document.getElementById('collect-payment');
    const paymentFields = document.getElementById('payment-fields');
    const courseInput = form.querySelector('[name="course"]');
    const paymentAmount = form.querySelector('[name="paymentAmount"]');
    const setCourseAmount = () => {
      if (paymentAmount && !paymentAmount.value) {
        paymentAmount.value = courseInput?.value === 'clase-a' ? '200' : '300';
      }
    };
    collectPayment?.addEventListener('change', () => {
      paymentFields.style.display = collectPayment.checked ? 'block' : 'none';
      if (collectPayment.checked) setCourseAmount();
    });
    courseInput?.addEventListener('change', () => {
      if (collectPayment?.checked && paymentAmount) paymentAmount.value = courseInput.value === 'clase-a' ? '200' : '300';
    });

    this.updateNotificationBadge();
  }

  async loadLocations(citySelect, branchSelect, currentUser) {
    if (!citySelect || !branchSelect) return;
    try {
      const [citiesResult, branchesResult] = await Promise.all([
        ApiService.getCities(),
        ApiService.getBranches(),
      ]);
      const cities = citiesResult.success ? citiesResult.data : [];
      const branches = branchesResult.success ? branchesResult.data : [];
      citySelect.innerHTML = '<option value="">Seleccionar ciudad...</option>' + cities
        .map(city => `<option value="${city.id}">${city.name}${city.province ? ` (${city.province})` : ''}</option>`)
        .join('');

      const renderBranches = () => {
        const selectedCityId = citySelect.value;
        const available = branches.filter(branch => !selectedCityId || branch.city_id === selectedCityId);
        branchSelect.innerHTML = '<option value="">Seleccionar sucursal...</option>' + available
          .map(branch => `<option value="${branch.name}">${branch.name}</option>`)
          .join('');
        branchSelect.disabled = !selectedCityId;
      };

      citySelect.addEventListener('change', renderBranches);
      renderBranches();

    } catch (error) {
      citySelect.innerHTML = '<option value="">No se pudieron cargar las ciudades</option>';
      branchSelect.innerHTML = '<option value="">No se pudieron cargar las sucursales</option>';
      console.error('Error al cargar ubicaciones:', error);
    }
  }

  async handleSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const formData = new FormData(form);

    // Limpiar errores previos
    document.querySelectorAll('.form-error').forEach(el => el.textContent = '');
    const alert = document.getElementById('form-alert');
    alert.style.display = 'none';

    // Validaciones
    const validations = {
      firstName: [
        { type: 'required', message: 'El nombre es requerido' },
      ],
      lastName: [
        { type: 'required', message: 'El apellido es requerido' },
      ],
      cedula: [
        { type: 'required', message: 'La cédula es requerida' },
        { type: 'cedula', message: 'Formato de cédula inválido' },
      ],
      birthDate: [
        { type: 'birthDate', message: 'Debes ser mayor de 16 años' },
      ],
      email: formData.get('email') ? [
        { type: 'email', message: 'Email inválido' },
      ] : [],
      phone: formData.get('phone') ? [
        { type: 'phone', message: 'Teléfono inválido' },
      ] : [],
      vehicle: [
        { type: 'required', message: 'Debes seleccionar un tipo de vehículo' },
      ],
      course: [
        { type: 'required', message: 'Debes seleccionar un curso' },
      ],
      city_id: [
        { type: 'required', message: 'Debes seleccionar una ciudad' },
      ],
      branch: [
        { type: 'required', message: 'Debes seleccionar una sucursal' },
      ],
    };

    // Validar campos
    let hasErrors = false;
    for (const [fieldName, rules] of Object.entries(validations)) {
      const input = form.querySelector(`[name="${fieldName}"]`);
      if (!input) continue;

      const value = input.value.trim();
      const result = Validator.validate(value, rules);

      if (!result.isValid) {
        const errorElement = input.nextElementSibling;
        if (errorElement) {
          errorElement.textContent = result.errors[0];
        }
        hasErrors = true;
      }
    }

    if (hasErrors) return;

    // Crear estudiante
    const studentData = {
      firstName: formData.get('firstName'),
      lastName: formData.get('lastName'),
      cedula: formData.get('cedula'),
      birthDate: formData.get('birthDate'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      address: formData.get('address'),
      bloodType: formData.get('bloodType'),
      vehicle: formData.get('vehicle'),
      course: formData.get('course'),
      city_id: formData.get('city_id'),
      branch: formData.get('branch'),
      notes: String(formData.get('notes') || '').trim(),
    };

    const result = await StudentService.createStudent(studentData);

    if (!result.success) {
      alert.className = 'alert alert-error';
      alert.innerHTML = `<div class="alert-icon">❌</div><div class="alert-content">${result.error}</div>`;
      alert.style.display = 'flex';
      return;
    }

    const student = result.data;
    if (formData.get('collectPayment') === 'on') {
      const paymentResult = await PaymentService.registerPayment({
        studentId: student.id,
        cedula: student.cedula || student.identification || studentData.cedula,
        amount: formData.get('paymentAmount'),
        method: formData.get('paymentMethod'),
        cashier: authService.getCurrentUser()?.name || 'Secretaria de sucursal',
      });
      if (!paymentResult.success) {
        alert.className = 'alert alert-error';
        alert.innerHTML = `<div class="alert-content">Estudiante registrado, pero el cobro no se pudo completar: ${paymentResult.error}</div>`;
        alert.style.display = 'flex';
        return;
      }
    }
    // Notificación
    NotificationService.createNotification(
      student.id,
      'Registro Completado',
      'Tu registro ha sido iniciado. Por favor, carga los documentos requeridos.',
      'info'
    );

    // Mostrar éxito
    alert.className = 'alert alert-success';
    alert.innerHTML = `<div class="alert-icon">✅</div><div class="alert-content">Estudiante registrado exitosamente</div>`;
    alert.style.display = 'flex';

    // Redireccionar
    setTimeout(() => {
      // Limpiar modales y overlays antes de navegar
      document.getElementById('student-modal-overlay')?.classList.remove('active');
      document.getElementById('student-registration-result-modal')?.remove();
      document.querySelectorAll('.modal-overlay.active').forEach(m => m.remove());
      document.body.style.overflow = '';
      
      const url = `/student-profile/${student.id}`;
      window.history.pushState(null, null, url);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, 1500);
  }

  updateNotificationBadge() {
    const badge = document.getElementById('notification-badge');
    if (badge) {
      const unreadCount = NotificationService.getAllNotifications().filter(n => !n.read).length;
      if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.style.display = 'flex';
      }
    }
  }
}

export default StudentFormView;
