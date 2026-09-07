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
              <input type="password" class="form-input" id="password" name="password" placeholder="Ingrese su contraseña" required>
              <div class="form-error" id="password-error"></div>
            </div>

            <div id="general-error" class="alert alert-error" style="display: none;">
              <div class="alert-icon">⚠️</div>
              <div class="alert-content" id="error-message"></div>
            </div>

            <button type="submit" class="btn btn-primary btn-large btn-block">
              Iniciar Sesión
            </button>

          </form>
        </div>
      </div>
    `;
  }

  async mount() {
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
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Iniciando sesión...';

    try {
      // Intentar login (ahora async por API)
      const result = await authService.login(username, password);

      if (!result.success) {
        document.getElementById('general-error').style.display = 'flex';
        document.getElementById('error-message').textContent = result.message;
        btn.disabled = false;
        btn.textContent = 'Iniciar Sesión';
        return;
      }

      // Login exitoso: navegar usando history API para evitar recargar la página
      const role = String(result.user.role || '').trim().toLowerCase();
      const target = role === 'caja'
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
      btn.disabled = false;
      btn.textContent = 'Iniciar Sesión';
    }
  }
}

export default LoginView;
