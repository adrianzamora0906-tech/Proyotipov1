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
    let passwordCode = '';
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
    layer.innerHTML = `<style>
      .security-modal{width:min(500px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;min-width:0;box-sizing:border-box;padding:28px!important;border-radius:8px!important;background:#fff;color:#182230;box-shadow:0 24px 80px #10182838}
      .security-modal *{box-sizing:border-box;min-width:0;letter-spacing:0}
      .security-modal [hidden]{display:none!important}
      .security-modal .security-heading{display:flex;align-items:center;gap:12px;margin-bottom:20px}
      .security-modal .security-emblem{display:grid;place-items:center;width:44px;height:44px;flex:none;background:#eeebff;color:#5144d8;border-radius:8px}
      .security-modal h2{font-size:21px;line-height:1.3;margin:0!important}
      .security-modal>p{font-size:14px;line-height:1.6;color:#667085;margin:0 0 24px}
      .security-modal .security-progress{display:flex;gap:8px;padding:0 0 22px;margin:0;list-style:none}
      .security-modal .security-progress li{flex:1;border-top:3px solid #e4e7ec;padding-top:8px;color:#667085;font-size:12px;font-weight:600}
      .security-modal .security-progress li.is-current{border-color:#5847eb;color:#5144d8}
      .security-modal .security-progress li.is-done{border-color:#169c7b;color:#087c60}
      .security-modal [data-security-step],.security-modal #security-email-editor,.security-modal #security-email-codes,.security-modal #security-old-code-group{display:grid;gap:14px}
      .security-modal .form-input{width:100%;height:46px;border:1px solid #ccd3df;border-radius:6px;background:#fff;color:#182230;padding:10px 12px;font-size:14px}
      .security-modal .form-input:focus{outline:2px solid #d9d3ff;outline-offset:2px;border-color:#6754ed}
      .security-modal .login-password-field{position:relative}.security-modal .login-password-field input{padding-right:52px}
      .security-modal label{font-size:13px;font-weight:600;color:#344054}
      .security-modal .btn{min-height:44px;border-radius:6px;padding:10px 16px;font-size:14px;font-weight:600;white-space:normal;overflow-wrap:anywhere;cursor:pointer}
      .security-modal .btn-primary{background:#5746e9;border:1px solid #5746e9;color:white}
      .security-modal .btn-secondary{background:#f8f9fc;border:1px solid #d0d5dd;color:#344054}
      .security-modal .btn:disabled{opacity:.55;cursor:wait}
      .security-modal #security-email-state{font-size:13px;line-height:1.5;color:#087c60;overflow-wrap:anywhere}
      .security-modal .security-code{font-size:23px;font-weight:600;text-align:center;text-transform:uppercase;font-family:monospace}
      .security-modal #profile-password-status{font-size:13px;line-height:1.5;color:#b42318}
      .security-modal #profile-password-status:empty{display:none}
      .security-modal .branch-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:12px;padding-top:18px;border-top:1px solid #eaecf0}
      .security-modal .security-note{margin:0;font-size:12px;line-height:1.6;color:#667085}
      @media(max-width:480px){.security-modal{padding:22px!important}.security-modal h2{font-size:19px}.security-modal .branch-modal-actions .btn{flex:1}}
    </style><div class="branch-modal-backdrop"><section class="branch-modal security-modal" role="dialog" aria-modal="true" aria-labelledby="password-change-title">
      <div class="security-heading"><span class="security-emblem"><i data-lucide="shield-check" aria-hidden="true"></i></span><div>
      <h2 id="password-change-title">${forced ? 'Actualiza tu contraseña' : 'Cambiar contraseña'}</h2>
      </div></div>
      <p id="security-description">Confirma tu clave actual para proteger tu cuenta.</p>
      <ol class="security-progress" aria-label="Progreso"><li data-progress="current" class="is-current" aria-current="step">1. Identidad</li>${emailRequired?'<li data-progress="email">2. Correo</li>':''}<li data-progress="new">${emailRequired?'3':'2'}. Nueva clave</li></ol>
      <form id="profile-password-form" class="form" novalidate style="display:grid;gap:.8rem;">
        <div data-security-step="current">${passwordFields[0]}<button type="button" class="btn btn-primary" id="security-current-next">Continuar</button></div>
        ${emailRequired ? `<div data-security-step="email" hidden>
          <button type="button" class="btn btn-secondary" id="security-use-email" hidden>Usar este correo</button>
          <button type="button" class="btn btn-secondary" id="security-change-email" hidden>Actualizar correo</button>
          <div id="security-email-editor">
          <label for="security-email">Correo</label><input class="form-input" id="security-email" type="email" autocomplete="email">
          <button type="button" class="btn btn-secondary" id="verify-email-send">Enviar verificacion de correo</button>
          </div>
          <div id="security-email-codes" hidden>
          <label for="security-email-code">Codigo de verificacion</label><input class="form-input security-code" id="security-email-code" maxlength="6" autocomplete="one-time-code">
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
        <input class="form-input security-code" id="security-password-code" maxlength="6" autocomplete="one-time-code" required>
        <button type="button" class="btn btn-primary" id="security-check-code">Validar codigo</button></div>` : ''}
        <div data-security-step="new" hidden>${passwordFields.slice(1).join('')}<p class="security-note">Usa al menos 8 caracteres, con mayuscula, minuscula, numero y simbolo.</p></div>
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
      layer.querySelector('#security-description').textContent=({current:'Confirma tu clave actual para proteger tu cuenta.',email:'Elige el correo donde recibiras tu codigo de seguridad.',code:'Escribe el codigo que recibiste en tu correo.',new:'Tu identidad esta confirmada. Elige una clave segura.'})[step];
      const progressStep=step==='code'?'email':step;
      const progress=[...layer.querySelectorAll('[data-progress]')];const index=progress.findIndex(node=>node.dataset.progress===progressStep);
      progress.forEach((node,i)=>{node.classList.toggle('is-current',i===index);node.classList.toggle('is-done',i<index);if(i===index)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current');});
      layer.querySelector(`[data-security-step="${step}"] input:not([hidden])`)?.focus();
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
        if(emailVerified){showStep('code');layer.querySelector('#verify-password-send').click();}else layer.querySelector('#verify-email-send').click();
      });
      layer.querySelector('#security-change-email').addEventListener('click',()=>{layer.querySelector('#security-email-editor').hidden=false;});
      layer.querySelector('#security-check-code').addEventListener('click',event=>run(event.currentTarget,async()=>{
        requireSuccess(await apiClient.post('/auth/verification/password-code',{challengeId:passwordChallenge,code:layer.querySelector('#security-password-code').value,currentPassword:currentPassword()}));
        passwordCode=layer.querySelector('#security-password-code').value;
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
        const code=layer.querySelector('#security-email-code').value;
        const result=requireSuccess(await apiClient.post('/auth/verification/email',{challengeId:emailChallenge,code,previousCode:layer.querySelector('#security-old-code').value,currentPassword:currentPassword(),continueToPassword:true}));
        if(!validChallenge(result?.passwordChallengeId))throw new Error('No se pudo autorizar el cambio. Solicita un nuevo codigo.');
        emailChallenge=null;passwordChallenge=result.passwordChallengeId;passwordCode=code;emailVerified=true;saveButton.disabled=false;
        layer.querySelector('#security-email-codes').hidden=true;
        layer.querySelector('#security-email-state').textContent='Correo verificado';
        showStep('new');
      }));
      layer.querySelector('#verify-password-send').addEventListener('click',event=>run(event.currentTarget,async()=>{
        passwordChallenge=null;passwordCode='';saveButton.disabled=true;
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
      try{
        const result=await authService.updatePassword(currentPassword,newPassword,emailRequired?{challengeId:passwordChallenge,code:passwordCode}:{});
        if(!result.success)throw new Error(result.error?.message||result.error||'No se pudo actualizar la contraseña.');
        this.showPasswordSuccess(layer,result.requiresLogin);
      }
      catch(error){status.textContent=error.message||'No se pudo actualizar la contraseña.';button.disabled=false;button.textContent='Actualizar contraseña';}
    });
  }

  showPasswordSuccess(layer,requiresLogin=false) {
    const dialog=layer.querySelector('[role="dialog"]');
    dialog.setAttribute('aria-describedby','password-success-message');
    dialog.innerHTML=`<div class="security-heading">
      <span class="security-emblem" style="background:#e1f6ee;color:#087c60" aria-hidden="true"><i data-lucide="circle-check"></i></span>
      <h2 id="password-change-title">Contraseña actualizada</h2>
    </div>
    <p id="password-success-message">Tu contraseña se cambió correctamente.</p>
    <div class="branch-modal-actions"><button type="button" class="btn btn-primary" id="password-success-close">Aceptar</button></div>`;
    dialog.scrollTop=0;
    window.lucide?.createIcons();
    const close=async()=>{
      if(requiresLogin)await authService.logout();
      layer.innerHTML='';document.body.style.overflow='';
      window.history.replaceState(null,'',requiresLogin?'/login':'/profile');
      window.dispatchEvent(new PopStateEvent('popstate'));
    };
    const button=layer.querySelector('#password-success-close');
    button.addEventListener('click',close,{once:true});
    button.focus();
  }
}

export default ProfileView;
