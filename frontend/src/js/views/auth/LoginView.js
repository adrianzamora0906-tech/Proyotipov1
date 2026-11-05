/**
 * Login View
 * Pantalla de autenticación
 */

import Component from '../../components/Component.js';
import { authService } from '../../core/auth/AuthService.js';
import Validator from '../../helpers/Validator.js';

class LoginView extends Component {
  async render() {
    return `
      <div class="login-container">
        <div class="login-card">
          <div class="login-header">
            <img
              class="login-brand-logo"
              src="/src/assets/branding/sportmancar-logo.png"
              alt="Escuela de Conducción Sportmancar"
            >
          </div>

          <form class="login-form" id="login-form">
            <div class="form-group">
              <label class="form-label required">Usuario</label>
              <input type="text" class="form-input" id="username" name="username" placeholder="Ingrese su usuario" required>
              <div class="form-error" id="username-error"></div>
            </div>

            <div class="form-group">
              <label class="form-label required">Contraseña</label>
              <div class="login-password-field">
                <input type="password" class="form-input" id="password" name="password" placeholder="Ingrese su contraseña" autocomplete="current-password" required>
                <button type="button" class="login-password-toggle" id="toggle-password" aria-label="Mostrar contraseña" title="Mostrar contraseña" aria-controls="password" aria-pressed="false">
                  <span class="password-face" aria-hidden="true"><span class="password-face-eyes"><span></span><span></span></span><span class="password-face-smile"></span><span class="password-hand password-hand-left"><i data-lucide="hand"></i></span><span class="password-hand password-hand-right"><i data-lucide="hand"></i></span></span>
                </button>
              </div>
              <div class="form-error" id="password-error"></div>
            </div>

            <dialog id="login-code-group" class="login-mfa-modal" aria-labelledby="login-mfa-title" hidden>
              <h2 id="login-mfa-title">Verifica tu acceso</h2>
              <label class="form-label" for="login-code">Codigo de acceso</label>
              <input id="login-code" class="form-input" maxlength="6" autocomplete="one-time-code">
              <div role="status">Codigo enviado a tu correo. Valido por 5 minutos.</div>
              <p id="login-code-error" class="form-error" role="alert"></p>
              <button type="submit" class="btn btn-primary btn-block" id="login-code-submit">Verificar e ingresar</button>
              <button type="button" class="btn btn-secondary" id="login-code-restart">Volver a iniciar / reenviar</button>
            </dialog>
            <div id="general-error" class="alert alert-error" style="display: none;">
              <div class="alert-icon">⚠️</div>
              <div class="alert-content" id="error-message"></div>
            </div>

            <button type="submit" id="login-submit" class="btn btn-primary btn-large btn-block">
              Iniciar Sesión
            </button>

          </form>
        </div>
      </div>
    `;
  }

  async mount() {
    this.loginChallenge=null;
    const resetCode=()=>{
      this.loginChallenge=null;document.getElementById('login-code-group').close();document.getElementById('login-code-group').hidden=true;
      document.getElementById('username').readOnly=false;document.getElementById('password').readOnly=false;
      document.getElementById('login-code').value='';
      document.getElementById('login-submit').textContent='Iniciar sesion';
    };
    document.getElementById('login-code-restart')?.addEventListener('click',resetCode);
    document.getElementById('login-code-group')?.addEventListener('cancel',event=>{event.preventDefault();resetCode();});
    window.lucide?.createIcons();
    document.getElementById('toggle-password')?.addEventListener('click', event => {
      const input = document.getElementById('password');
      const button = event.currentTarget;
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      const label = visible ? 'Ocultar contrase\u00f1a' : 'Mostrar contrase\u00f1a';
      button.setAttribute('aria-label', label);
      button.title = label;
      button.setAttribute('aria-pressed', String(visible));
      button.classList.toggle('is-password-visible', visible);
    });
    const form = document.getElementById('login-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleLogin(e));
    }
  }

  async handleLogin(e) {
    e.preventDefault();
    const form = e.currentTarget;

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    // Limpiar errores previos
    document.getElementById('username-error').textContent = '';
    document.getElementById('password-error').textContent = '';
    document.getElementById('general-error').style.display = 'none';

    // Validaciones
    if (!username) {
      document.getElementById('username-error').textContent = 'El usuario es requerido';
      return;
    }

    if (!password) {
      document.getElementById('password-error').textContent = 'La contraseña es requerida';
      return;
    }

    // Deshabilitar botón mientras se procesa
    const btn = e.submitter || document.getElementById('login-submit');
    btn.disabled = true;
    btn.textContent = 'Iniciando sesión...';

    try {
      // Intentar login (ahora async por API)
      const result = await authService.login(username, password,this.loginChallenge?{challengeId:this.loginChallenge,code:document.getElementById('login-code').value}:{});
      if(result.mfaRequired){
        this.loginChallenge=result.challengeId;document.getElementById('login-code-group').hidden=false;
        if(!document.getElementById('login-code-group').open)document.getElementById('login-code-group').showModal();
        document.getElementById('username').readOnly=true;document.getElementById('password').readOnly=true;
        btn.disabled=false;btn.textContent='Verificar e ingresar';document.getElementById('login-code').focus();return;
      }

      if (!result.success) {
        document.getElementById('general-error').style.display = 'flex';
        document.getElementById('error-message').textContent = result.message;
        document.getElementById('login-code-error').textContent=result.message;
        btn.disabled = false;
        btn.textContent = 'Iniciar Sesión';
        return;
      }

      document.getElementById('login-code-group').close();document.getElementById('login-code-group').hidden=true;
      // Login exitoso: navegar usando history API para evitar recargar la página
      const role = String(result.user.role || '').trim().toLowerCase();
      const target = result.user.mustChangePassword
        ? '/profile'
        : role === 'caja'
        ? '/cash'
        : role === 'instructor'
          ? (result.user.practiceArea === 'teoria' ? '/instructor/theory' : '/instructor')
          : role === 'estudiante' || result.user.roles?.includes('STUDENT')
            ? '/student'
          : result.user.roles?.includes('ADMIN_SYSTEM')
            ? '/admin-system'
            : result.user.roles?.includes('GENERAL_MANAGER')
              ? '/manager'
              : '/dashboard';
      window.history.pushState(null, null, target);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (error) {
      document.getElementById('general-error').style.display = 'flex';
      document.getElementById('error-message').textContent = error.message || 'Error al conectar con el servidor';
      document.getElementById('login-code-error').textContent=error.message || 'No se pudo verificar el acceso';
      btn.disabled = false;
      btn.textContent = 'Iniciar Sesión';
    }
  }
}

export default LoginView;
