/**
 * Profile View
 */

import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import { authService } from '../../core/auth/AuthService.js';
import { apiClient } from '../../core/api/ApiClient.js';

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
    const administrative = ['admin','secretaria','secretaria_sucursal','caja','instructor','ADMIN_SYSTEM','GENERAL_MANAGER','BRANCH_ADMIN','SECRETARY','CASHIER','INSTRUCTOR'].includes(authService.getCurrentUser()?.role);
    const emailRequired = administrative && !['instructor','INSTRUCTOR'].includes(authService.getCurrentUser()?.role);
    let emailChallenge = null, passwordChallenge = null;
    let emailVerified = false;
    const validChallenge = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    const requireSuccess = response => {
      if (!response?.success) throw new Error(response?.error?.message || response?.error || 'No se pudo completar la verificacion');
      return response.data;
    };
    const passwordFields = [
      ['currentPassword', 'Contrase\u00f1a actual', 'current-password'],
      ['newPassword', 'Nueva contrase\u00f1a', 'new-password'],
      ['confirmPassword', 'Confirmar nueva contrase\u00f1a', 'new-password'],
    ].map(([name, label, autocomplete]) => `<div class="form-group" style="margin:0;display:grid;gap:.35rem">
      <label class="form-label" for="profile-${name}">${label}</label>
      <div class="login-password-field">
        <input class="form-input" id="profile-${name}" type="password" name="${name}" autocomplete="${autocomplete}" ${name === 'currentPassword' ? '' : 'minlength="8"'} required>
        <button type="button" class="login-password-toggle" data-password-toggle aria-label="Mostrar ${label.toLowerCase()}" title="Mostrar ${label.toLowerCase()}" aria-controls="profile-${name}" aria-pressed="false" data-password-label="${label.toLowerCase()}">
          <span class="password-face" aria-hidden="true"><span class="password-face-eyes"><span></span><span></span></span><span class="password-face-smile"></span><span class="password-hand password-hand-left"><i data-lucide="hand"></i></span><span class="password-hand password-hand-right"><i data-lucide="hand"></i></span></span>
        </button>
      </div>
    </div>`);
    layer.innerHTML = `<div class="branch-modal-backdrop"><section class="branch-modal" style="max-height:calc(100dvh - 2rem);overflow:auto;min-width:0;box-sizing:border-box" role="dialog" aria-modal="true" aria-labelledby="password-change-title">
      <h2 id="password-change-title">${forced ? 'Actualiza tu contraseña' : 'Cambiar contraseña'}</h2>
      <p>${forced ? 'Por seguridad debes definir una nueva contraseña antes de continuar usando el sistema.' : 'Confirma tu contraseña actual y escribe una nueva.'}</p>
      <form id="profile-password-form" class="form" style="display:grid;gap:.8rem;">
        <div data-security-step="current">${passwordFields[0]}<button type="button" class="btn btn-primary" id="security-current-next">Continuar</button></div>
        ${emailRequired ? `<div data-security-step="email" hidden>
          <button type="button" class="btn btn-secondary" id="security-use-email" hidden>Usar este correo</button>
          <button type="button" class="btn btn-secondary" id="security-change-email" hidden>Actualizar correo</button>
          <div id="security-email-editor">
          <label for="security-email">Correo</label><input class="form-input" id="security-email" type="email" autocomplete="email">
          <button type="button" class="btn btn-secondary" id="verify-email-send">Enviar verificacion de correo</button>
          </div>
          <div id="security-email-codes" hidden>
          <label for="security-email-code">Codigo del correo nuevo</label><input class="form-input" id="security-email-code" maxlength="6" autocomplete="one-time-code">
          <div id="security-old-code-group" hidden>
          <label for="security-old-code">Codigo del correo anterior, si se reemplaza</label><input class="form-input" id="security-old-code" maxlength="6" autocomplete="off">
          </div>
          <button type="button" class="btn btn-secondary" id="verify-email-confirm">Verificar correo</button>
          </div>
          <div id="security-email-state" role="status"></div>
        </div>
        <div data-security-step="code" hidden>
        <button type="button" class="btn btn-secondary" id="verify-password-send">Enviar codigo para cambiar clave</button>
        <label for="security-password-code">Codigo para cambiar la clave</label>
        <input class="form-input" id="security-password-code" maxlength="6" autocomplete="one-time-code" required>
        <button type="button" class="btn btn-primary" id="security-check-code">Validar codigo</button></div>` : ''}
        <div data-security-step="new" hidden>${passwordFields.slice(1).join('')}</div>
        <div id="profile-password-status" class="form-error" aria-live="polite"></div>
        <div class="branch-modal-actions">${forced ? '' : '<button type="button" class="btn btn-secondary" id="cancel-password-change">Cancelar</button>'}<button type="submit" class="btn btn-primary" hidden>Actualizar contraseña</button></div>
      </form>
    </section></div>`;
    document.body.style.overflow = 'hidden';
    const showStep=step=>{
      layer.querySelectorAll('[data-security-step]').forEach(node=>{node.hidden=node.dataset.securityStep!==step;});
      layer.querySelector('[type="submit"]').hidden=step!=='new';
      layer.querySelector('#profile-password-status').textContent='';
      layer.querySelector('[role="dialog"]').scrollTop=0;
      layer.querySelector('#password-change-title').textContent=({current:'Confirma tu clave actual',email:'Correo de seguridad',code:'Verifica el codigo',new:'Define tu nueva clave'})[step];
    };
    const currentPassword=()=>layer.querySelector('[name="currentPassword"]').value;
    const run=async(button,operation)=>{
      const status=layer.querySelector('#profile-password-status');status.textContent='';button.disabled=true;
      try {await operation();} catch(error){status.textContent=error.message || 'No se pudo completar la verificacion';}
      finally {button.disabled=false;}
    };
    layer.querySelector('#security-current-next').addEventListener('click',event=>run(event.currentTarget,async()=>{
      requireSuccess(await apiClient.post('/auth/verification/current-password',{currentPassword:currentPassword()}));
      showStep(emailRequired?'email':'new');
    }));
    if(emailRequired) {
      const saveButton=layer.querySelector('[type="submit"]');
      saveButton.disabled=true;
      layer.querySelector('#security-email').value=authService.getCurrentUser()?.email || '';
      layer.querySelector('#security-use-email').addEventListener('click',()=>{
        if(emailVerified)showStep('code');else layer.querySelector('#verify-email-send').click();
      });
      layer.querySelector('#security-change-email').addEventListener('click',()=>{layer.querySelector('#security-email-editor').hidden=false;});
      layer.querySelector('#security-check-code').addEventListener('click',event=>run(event.currentTarget,async()=>{
        requireSuccess(await apiClient.post('/auth/verification/password-code',{challengeId:passwordChallenge,code:layer.querySelector('#security-password-code').value,currentPassword:currentPassword()}));
        showStep('new');saveButton.disabled=false;
      }));
      layer.querySelector('#verify-email-send').addEventListener('click',event=>run(event.currentTarget,async()=>{
        emailChallenge=null;
        const response=await apiClient.post('/auth/verification/request',{purpose:'email',email:layer.querySelector('#security-email').value,currentPassword:currentPassword()});
        const data=requireSuccess(response);
        if(!validChallenge(data?.challengeId))throw new Error('No se recibio una solicitud valida. Actualiza la pagina e intenta nuevamente.');
        emailChallenge=data.challengeId;
        layer.querySelector('#security-use-email').hidden=true;
        layer.querySelector('#security-change-email').hidden=true;
        layer.querySelector('#security-email-codes').hidden=false;
        layer.querySelector('#security-old-code-group').hidden=!data.requiresPreviousCode;
        layer.querySelector('#security-email-state').textContent=data.requiresPreviousCode?'Codigos enviados a ambos correos. Vencen en 5 minutos.':'Codigo enviado. Vence en 5 minutos.';
      }));
      layer.querySelector('#verify-email-confirm').addEventListener('click',event=>run(event.currentTarget,async()=>{
        if(!validChallenge(emailChallenge))throw new Error('Primero solicita el codigo de verificacion del correo.');
        requireSuccess(await apiClient.post('/auth/verification/email',{challengeId:emailChallenge,code:layer.querySelector('#security-email-code').value,previousCode:layer.querySelector('#security-old-code').value,currentPassword:currentPassword()}));
        emailChallenge=null;passwordChallenge=null;emailVerified=true;saveButton.disabled=true;
        layer.querySelector('#security-email-codes').hidden=true;
        layer.querySelector('#security-email-state').textContent='Correo verificado';
        showStep('code');
      }));
      layer.querySelector('#verify-password-send').addEventListener('click',event=>run(event.currentTarget,async()=>{
        passwordChallenge=null;saveButton.disabled=true;
        if(!emailVerified)throw new Error('Primero verifica tu correo de seguridad.');
        const response=await apiClient.post('/auth/verification/request',{purpose:'password',currentPassword:currentPassword()});
        const data=requireSuccess(response);
        if(!validChallenge(data?.challengeId))throw new Error('No se recibio una solicitud valida. Actualiza la pagina e intenta nuevamente.');
        passwordChallenge=data.challengeId;
        layer.querySelector('#profile-password-status').textContent='Codigo enviado a tu correo verificado. Vence en 5 minutos.';
      }));
      apiClient.get('/auth/verification').then(response=>{
        const data=requireSuccess(response);
        layer.querySelector('#security-email').value=data.email || '';
        emailVerified=Boolean(data.verified);
        layer.querySelector('#security-use-email').hidden=!data.email;
        layer.querySelector('#security-use-email').textContent=data.email?`Usar ${data.email}`:'Usar este correo';
        layer.querySelector('#security-change-email').hidden=!data.email;
        layer.querySelector('#security-email-editor').hidden=Boolean(data.email);
        layer.querySelector('#security-email-state').textContent=emailVerified?'Correo verificado':'Debes verificar tu correo';
      }).catch(error=>{layer.querySelector('#profile-password-status').textContent=error.message;});
    }
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
      if(emailRequired && (!emailVerified || !validChallenge(passwordChallenge))){status.textContent='Verifica tu correo y solicita el codigo para cambiar la clave antes de guardar.';return;}
      if(administrative && (newPassword.length<8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9\s]/.test(newPassword) || new TextEncoder().encode(newPassword).length>72)){status.textContent='Usa al menos 8 caracteres con mayuscula, minuscula, numero y simbolo (maximo 72 bytes).';return;}
      if(newPassword!==confirmPassword){status.textContent='La confirmación no coincide con la nueva contraseña.';return;}
      if(currentPassword===newPassword){status.textContent='La contraseña nueva debe ser diferente de la actual.';return;}
      button.disabled=true;button.textContent='Actualizando...';
      try{const result=await authService.updatePassword(currentPassword,newPassword,emailRequired?{challengeId:passwordChallenge,code:layer.querySelector('#security-password-code').value}:{});if(!result.success)throw new Error(result.error||'No se pudo actualizar la contraseña.');layer.innerHTML='';document.body.style.overflow='';window.history.replaceState(null,'','/profile');window.dispatchEvent(new PopStateEvent('popstate'));}
      catch(error){status.textContent=error.message||'No se pudo actualizar la contraseña.';button.disabled=false;button.textContent='Actualizar contraseña';}
    });
  }
}

export default ProfileView;
