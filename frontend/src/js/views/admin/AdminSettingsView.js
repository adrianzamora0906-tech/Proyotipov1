import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import AdminService from '../../services/AdminService.js';
import { permissionService } from '../../core/auth/PermissionService.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sections={
  institution:{label:'Institución',description:'Identidad y datos generales utilizados en documentos y comunicaciones.',fields:[
    ['institution.name','Nombre comercial','text'],['institution.legal_name','Razón social','text'],['institution.tax_id','RUC','text'],
    ['institution.email','Correo institucional','email'],['institution.phone','Teléfono','text'],['institution.address','Dirección principal','text'],
    ['institution.timezone','Zona horaria','select',['America/Guayaquil']],['institution.currency','Moneda','select',['USD']],
  ]},
  security:{label:'Seguridad',description:'Políticas generales de autenticación. Las cuentas concretas se administran desde Sucursales.',fields:[
    ['security.max_failed_attempts','Intentos fallidos permitidos','number'],['security.lock_minutes','Minutos de bloqueo','number'],
    ['security.session_days','Días de vigencia de sesión','number'],['security.password_min_length','Longitud mínima de contraseña','number'],
  ]},
  documents:{label:'Documentos y numeración',description:'Convenciones institucionales para comprobantes, autorizaciones y cargas documentales.',fields:[
    ['documents.receipt_prefix','Prefijo de comprobantes','text'],['documents.mobile_upload_minutes','Vigencia de enlaces móviles (minutos)','number'],
  ]},
  system:{label:'Sistema e integraciones',description:'Activa únicamente servicios que estén instalados y configurados en el servidor.',fields:[
    ['system.notifications_enabled','Notificaciones internas','checkbox'],['system.maps_enabled','Mapas de sucursales','checkbox'],
    ['system.email_enabled','Correo institucional','checkbox'],['system.backups_enabled','Respaldos automáticos','checkbox'],
  ]},
};

export default class AdminSettingsView extends Component{
  constructor(props={}){super(props);this.active=new URLSearchParams(location.search).get('tab')||'institution';this.values={};}
  async render(){try{const rows=(await AdminService.settings({scopeType:'GLOBAL'})).data||[];rows.forEach(row=>{this.values[row.key]=row.value;});}catch(error){this.error=error.message;}
    const section=sections[this.active]||sections.institution,canEdit=permissionService.can('SETTING_UPDATE');
    const fields=section.fields.map(([key,label,type,options])=>`<label class="global-setting-field"><span>${esc(label)}</span>${type==='checkbox'?`<input type="checkbox" name="${esc(key)}" ${this.values[key]===true?'checked':''} ${canEdit?'':'disabled'}>`:type==='select'?`<select name="${esc(key)}" ${canEdit?'':'disabled'}>${options.map(option=>`<option ${this.values[key]===option?'selected':''}>${esc(option)}</option>`).join('')}</select>`:`<input type="${type}" name="${esc(key)}" value="${esc(this.values[key]??'')}" ${type==='number'?'min="1" step="1"':''} ${canEdit?'':'disabled'}>`}</label>`).join('');
    return SidebarLayout.render(`<style>.global-settings{padding:2rem;max-width:1450px;margin:auto}.global-settings-layout{display:grid;grid-template-columns:250px 1fr;gap:1rem}.global-settings-nav,.global-settings-panel{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:1rem}.global-settings-nav{display:grid;align-content:start;gap:.4rem}.global-settings-nav button{text-align:left;border:0;background:transparent;padding:.8rem;border-radius:9px;cursor:pointer;color:#475467}.global-settings-nav button.active{background:#eef2ff;color:#3730a3;font-weight:700}.global-settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.global-setting-field{display:grid;gap:.4rem;color:#475467;font-size:.82rem}.global-setting-field input:not([type=checkbox]),.global-setting-field select{height:42px;border:1px solid #d0d5dd;border-radius:9px;padding:0 .75rem;background:#fff}.global-setting-field:has(input[type=checkbox]){display:flex;align-items:center;justify-content:space-between;padding:1rem;background:#f8fafc;border-radius:10px}.global-setting-field input[type=checkbox]{width:20px;height:20px}.global-settings-actions{display:flex;align-items:center;justify-content:flex-end;gap:1rem;margin-top:1.2rem}@media(max-width:800px){.global-settings{padding:1rem}.global-settings-layout{grid-template-columns:1fr}.global-settings-nav{display:flex;overflow:auto}.global-settings-grid{grid-template-columns:1fr}}</style><section class="global-settings"><div class="page-header"><div><h1>Configuración global</h1><p>Parámetros transversales de SportmancarERP</p></div></div>${this.error?`<div class="alert alert-error">${esc(this.error)}</div>`:''}<div class="global-settings-layout"><nav class="global-settings-nav" aria-label="Secciones de configuración">${Object.entries(sections).map(([key,item])=>`<button data-settings-tab="${key}" class="${this.active===key?'active':''}" ${this.active===key?'aria-current="page"':''}>${esc(item.label)}</button>`).join('')}</nav><form class="global-settings-panel" id="global-settings-form"><h2>${esc(section.label)}</h2><p>${esc(section.description)}</p><div class="global-settings-grid">${fields}</div><div class="global-settings-actions"><span id="settings-status" aria-live="polite"></span>${canEdit?'<button class="btn btn-primary">Guardar configuración</button>':''}</div></form></div></section>`);}
  async mount(){document.querySelectorAll('[data-settings-tab]').forEach(button=>button.onclick=()=>{history.pushState(null,null,`/admin-system/settings?tab=${button.dataset.settingsTab}`);window.dispatchEvent(new PopStateEvent('popstate'));});document.getElementById('global-settings-form')?.addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,section=sections[this.active]||sections.institution,status=document.getElementById('settings-status');const items=section.fields.map(([key,label,type])=>{const input=form.elements[key];let value=type==='checkbox'?input.checked:type==='number'?Number(input.value):input.value.trim();return{key,value,dataType:type==='checkbox'?'boolean':type==='number'?'number':'string',description:label};});try{status.textContent='Guardando...';await AdminService.saveSettings(items);status.textContent='Configuración guardada y auditada.';}catch(error){status.textContent=error.message;}});}
}
