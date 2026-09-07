import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import ProfileService from '../../services/profileService.js';
import { authService } from '../../core/auth/AuthService.js';
import { escapeHtml, stateMessage } from './InstructorHelpers.js';

class InstructorProfileView extends Component {
  async render() {
    try {
      const result = await ProfileService.getInstructorProfile();
      const profile = result.data;
      const user = authService.getCurrentUser();
      const content = `
        <div class="profile-page">
          <div class="page-header"><h1>Mi perfil</h1></div>
          <div class="card">
            <div class="card-header"><h3 class="card-title">Informacion profesional</h3></div>
            <div class="card-body">
              <div class="profile-info">
                <div class="profile-avatar-large">${escapeHtml(user.avatar || 'IN')}</div>
                <div class="profile-details">
                  <div class="info-item"><span class="info-label">Nombre</span><span class="info-value">${escapeHtml(profile.name)}</span></div>
                  <div class="info-item"><span class="info-label">Correo</span><span class="info-value">${escapeHtml(profile.email)}</span></div>
                  <div class="info-item"><span class="info-label">Sucursal</span><span class="info-value">${escapeHtml(profile.branch)}</span></div>
                  <div class="info-item"><span class="info-label">Tipo</span><span class="info-value">${escapeHtml(profile.instructorType)}</span></div>
                  <div class="info-item"><span class="info-label">Estado</span><span class="badge badge-success">${escapeHtml(profile.status)}</span></div>
                  <div class="info-item"><span class="info-label">Especialidad</span><span class="info-value">${escapeHtml(profile.specialty || 'N/A')}</span></div>
                  <div class="info-item"><span class="info-label">Cursos</span><span class="info-value">${profile.courses.map(item => escapeHtml(item.name)).join(', ') || 'N/A'}</span></div>
                </div>
              </div>
            </div>
          </div>
          <div class="dashboard-grid">
            <div class="card">
              <div class="card-header"><h3 class="card-title">Actualizar contacto</h3></div>
              <div class="card-body">
                <form id="profile-form">
                  <div class="form-group"><label class="form-label">Correo</label><input class="form-input" type="email" name="email" value="${escapeHtml(user.email || profile.email || '')}"></div>
                  <div class="form-group"><label class="form-label">Telefono</label><input class="form-input" name="phone" value="${escapeHtml(user.phone || '')}"></div>
                  <button class="btn btn-primary" type="submit">Guardar cambios</button>
                </form>
              </div>
            </div>
            <div class="card">
              <div class="card-header"><h3 class="card-title">Cambiar contrasena</h3></div>
              <div class="card-body">
                <form id="password-form">
                  <div class="form-group"><label class="form-label">Contrasena actual</label><input class="form-input" type="password" name="currentPassword" required></div>
                  <div class="form-group"><label class="form-label">Nueva contrasena</label><input class="form-input" type="password" name="newPassword" minlength="6" required></div>
                  <button class="btn btn-secondary" type="submit">Actualizar contrasena</button>
                </form>
              </div>
            </div>
          </div>
        </div>
      `;
      const layout = await SidebarLayout.render(content);
      setTimeout(() => SidebarLayout.attachEventListeners(), 0);
      return layout;
    } catch (error) {
      const layout = await SidebarLayout.render(`<div class="alert alert-error">${stateMessage(error)}</div>`);
      setTimeout(() => SidebarLayout.attachEventListeners(), 0);
      return layout;
    }
  }

  async mount() {
    document.getElementById('profile-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const values = new FormData(event.target);
      try {
        await ProfileService.updateProfile({ email: values.get('email'), phone: values.get('phone') });
        const user = authService.getCurrentUser();
        sessionStorage.setItem(authService.sessionKey, JSON.stringify({ ...user, email: values.get('email'), phone: values.get('phone') }));
        window.alert('Perfil actualizado correctamente');
      } catch (error) {
        window.alert(stateMessage(error));
      }
    });

    document.getElementById('password-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const values = new FormData(event.target);
      try {
        await ProfileService.updatePassword({ currentPassword: values.get('currentPassword'), newPassword: values.get('newPassword') });
        event.target.reset();
        window.alert('Contrasena actualizada correctamente');
      } catch (error) {
        window.alert(stateMessage(error));
      }
    });
  }
}

export default InstructorProfileView;
