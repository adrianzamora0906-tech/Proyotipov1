/**
 * Profile View
 */

import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import { authService } from '../../core/auth/AuthService.js';

class ProfileView extends Component {
  async render() {
    const user = authService.getCurrentUser();

    const profileContent = `
      <div class="profile-page">
        <div class="page-header">
          <h1>Mi Perfil</h1>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Información Personal</h3>
          </div>
          <div class="card-body">
            <div class="profile-info">
              <div class="profile-avatar-large">${user.avatar}</div>
              <div class="profile-details">
                <div class="info-item">
                  <span class="info-label">Nombre</span>
                  <span class="info-value">${user.name}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Usuario</span>
                  <span class="info-value">${user.username}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Email</span>
                  <span class="info-value">${user.email}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Rol</span>
                  <span class="badge badge-primary">${user.role}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Sucursal</span>
                  <span class="info-value">${user.branch}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Teléfono</span>
                  <span class="info-value">${user.phone}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Seguridad</h3>
          </div>
          <div class="card-body">
            <button class="btn btn-secondary" id="change-password-btn">Cambiar Contraseña</button>
          </div>
        </div>
        <div id="password-change-layer"></div>
      </div>
    `;

    const layout = await SidebarLayout.render(profileContent);
    setTimeout(() => SidebarLayout.attachEventListeners(), 0);
    return layout;
  }

  async mount() {
    const forced = Boolean(authService.getCurrentUser()?.mustChangePassword);
    document.getElementById('change-password-btn')?.addEventListener('click', () => this.openPasswordModal(false));
    if (forced) this.openPasswordModal(true);
  }

  openPasswordModal(forced = false) {
    const layer = document.getElementById('password-change-layer');
    if (!layer) return;
    const passwordFields = [
      ['currentPassword', 'Contrase\u00f1a actual', 'current-password'],
      ['newPassword', 'Nueva contrase\u00f1a', 'new-password'],
      ['confirmPassword', 'Confirmar nueva contrase\u00f1a', 'new-password'],
    ].map(([name, label, autocomplete]) => `<div class="form-group">
      <label class="form-label" for="profile-${name}">${label}</label>
      <div class="login-password-field">
        <input class="form-input" id="profile-${name}" type="password" name="${name}" autocomplete="${autocomplete}" ${name === 'currentPassword' ? '' : 'minlength="8"'} required>
        <button type="button" class="login-password-toggle" data-password-toggle aria-label="Mostrar ${label.toLowerCase()}" title="Mostrar ${label.toLowerCase()}" aria-controls="profile-${name}" aria-pressed="false" data-password-label="${label.toLowerCase()}">
          <span class="password-face" aria-hidden="true"><span class="password-face-eyes"><span></span><span></span></span><span class="password-face-smile"></span><span class="password-hand password-hand-left"><i data-lucide="hand"></i></span><span class="password-hand password-hand-right"><i data-lucide="hand"></i></span></span>
        </button>
      </div>
    </div>`).join('');
    layer.innerHTML = `<div class="branch-modal-backdrop"><section class="branch-modal" role="dialog" aria-modal="true" aria-labelledby="password-change-title">
      <h2 id="password-change-title">${forced ? 'Actualiza tu contraseña' : 'Cambiar contraseña'}</h2>
      <p>${forced ? 'Por seguridad debes definir una nueva contraseña antes de continuar usando el sistema.' : 'Confirma tu contraseña actual y escribe una nueva.'}</p>
      <form id="profile-password-form" class="form" style="display:grid;gap:.8rem;">
        ${passwordFields}
        <div id="profile-password-status" class="form-error" aria-live="polite"></div>
        <div class="branch-modal-actions">${forced ? '' : '<button type="button" class="btn btn-secondary" id="cancel-password-change">Cancelar</button>'}<button type="submit" class="btn btn-primary">Actualizar contraseña</button></div>
      </form>
    </section></div>`;
    document.body.style.overflow = 'hidden';
    window.lucide?.createIcons();
    layer.querySelectorAll('[data-password-toggle]').forEach(button => button.addEventListener('click', () => {
      const input = document.getElementById(button.getAttribute('aria-controls'));
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      const label = `${visible ? 'Ocultar' : 'Mostrar'} ${button.dataset.passwordLabel}`;
      button.setAttribute('aria-label', label);
      button.title = label;
      button.setAttribute('aria-pressed', String(visible));
      button.classList.toggle('is-password-visible', visible);
    }));
    layer.querySelector('#cancel-password-change')?.addEventListener('click', () => { layer.innerHTML='';document.body.style.overflow=''; });
    layer.querySelector('#profile-password-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form=event.currentTarget,status=form.querySelector('#profile-password-status'),button=form.querySelector('[type="submit"]');
      const data=new FormData(form),currentPassword=String(data.get('currentPassword')||''),newPassword=String(data.get('newPassword')||''),confirmPassword=String(data.get('confirmPassword')||'');
      status.textContent='';
      if(newPassword!==confirmPassword){status.textContent='La confirmación no coincide con la nueva contraseña.';return;}
      if(currentPassword===newPassword){status.textContent='La contraseña nueva debe ser diferente de la actual.';return;}
      button.disabled=true;button.textContent='Actualizando...';
      try{const result=await authService.updatePassword(currentPassword,newPassword);if(!result.success)throw new Error(result.error||'No se pudo actualizar la contraseña.');layer.innerHTML='';document.body.style.overflow='';window.history.replaceState(null,'','/profile');window.dispatchEvent(new PopStateEvent('popstate'));}
      catch(error){status.textContent=error.message||'No se pudo actualizar la contraseña.';button.disabled=false;button.textContent='Actualizar contraseña';}
    });
  }
}

export default ProfileView;
