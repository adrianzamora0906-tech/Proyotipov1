import Component from'../../components/Component.js';import SidebarLayout from'../../layouts/SidebarLayout.js';import AdminService from'../../services/AdminService.js';import{authService}from'../../core/auth/AuthService.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
import { permissionService } from '../../core/auth/PermissionService.js';
export default class AdminSecurityView extends Component{
 async load(){const [u,r,p,s,b]=await Promise.all([AdminService.users({limit:100}),AdminService.roles(),AdminService.permissions(),AdminService.sessions(),AdminService.branches()]);this.users=u.data?.data||[];this.roles=r.data||[];this.permissions=p.data||[];this.sessions=s.data||[];this.branches=b.data?.filters?.branches||b.data?.data||[];}
 async render(){try{await this.load();}catch(e){this.error=e.message;this.users=[];this.roles=[];this.permissions=[];this.sessions=[];this.branches=[];}const options=(items,value,label)=>items.map(x=>`<option value="${x[value]}">${x[label]}</option>`).join('');return SidebarLayout.render(`<section class="admin-security"><div class="page-header"><h1>Seguridad y Accesos</h1><p>Usuarios, roles, permisos individuales y sesiones</p></div>${this.error?`<div class="alert alert-error">${this.error}</div>`:''}<div class="security-content"><div class="tabs">${['users','roles','permissions','sessions'].map((x,i)=>`<button class="btn ${i?'':'btn-primary'}" data-tab="${x}">${({users:'Usuarios',roles:'Roles',permissions:'Permisos',sessions:'Sesiones'})[x]}</button>`).join('')}</div>
 <div id="admin-tab-users" class="admin-tab"><form id="security-filters" class="security-filters"><label>Buscar usuario<input class="form-input" name="search" placeholder="Nombre o usuario"></label><label>Rol<select class="form-input" name="role"><option value="">Todos</option>${options(this.roles,'code','name')}</select></label><label>Sucursal<select class="form-input" name="branchId"><option value="">Todas</option>${options(this.branches,'id','name')}</select></label></form><div id="security-user-status" role="status"></div><div class="branch-table-wrap"><table class="security-table"><thead><tr><th>Persona</th><th>Usuario</th><th>Rol</th><th>Alcance / sucursal</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="security-users">${this.userRows()}</tbody></table></div><div class="security-pagination"><button type="button" class="btn" id="security-prev" disabled>Anterior</button><span id="security-page">Pagina 1</span><button type="button" class="btn" id="security-next" ${this.users.length<100?'disabled':''}>Siguiente</button></div><details class="security-create"><summary>Nuevo usuario</summary><form id="new-user-form" class="form-grid"><input class="form-input" name="firstName" placeholder="Nombres" required><input class="form-input" name="lastName" placeholder="Apellidos" required><input class="form-input" name="email" type="email" placeholder="Correo"><select class="form-input" name="branchId" required>${options(this.branches,'id','name')}</select><select class="form-input" name="roleCode" required>${options(this.roles.filter(role=>role.code!=='STUDENT'),'code','name')}</select><small>El usuario y la clave temporal se generan automáticamente.</small><button class="btn btn-primary">Crear usuario</button><div id="new-user-result" class="branch-status" aria-live="polite"></div></form></details></div>
 <div id="admin-tab-roles" class="admin-tab" hidden><h2>Roles y permisos de plantilla</h2>${this.roles.map(r=>`<details><summary><strong>${r.name}</strong> · ${r.scope_type}</summary><p>${r.permissions.map(p=>p.code).join(', ')}</p></details>`).join('')}</div>
 <div id="admin-tab-permissions" class="admin-tab" hidden><h2>Permiso individual sincronizado</h2><p>Para personal de sucursal, el cambio se guarda automáticamente en su sucursal asignada y será el mismo que verá el Administrador de sucursal.</p><form id="permission-form" class="form-grid"><select class="form-input" name="userId">${this.users.map(u=>`<option value="${u.id}">${u.first_name} ${u.last_name}</option>`).join('')}</select><select class="form-input" name="permissionCode">${options(this.permissions,'code','code')}</select><select class="form-input" name="effect"><option value="ALLOW">Permitir</option><option value="DENY">Denegar</option></select><select class="form-input" name="branchId"><option value="">Sucursal asignada / ámbito global</option>${options(this.branches,'id','name')}</select><input class="form-input" name="validUntil" type="datetime-local"><input class="form-input" name="reason" placeholder="Motivo"><button class="btn btn-primary">Guardar permiso</button></form></div>
 <div id="admin-tab-sessions" class="admin-tab" hidden><h2>Sesiones</h2>${this.sessions.map(s=>`<div class="list-item"><strong>${s.username}</strong> · ${new Date(s.last_activity_at).toLocaleString()} · ${s.revoked_at?'Revocada':`Activa <button class="btn btn-small revoke-session" data-id="${s.id}">Revocar</button>`}</div>`).join('')}</div></div></section><div id="instructor-availability-layer"></div>`);}

 userRows(){
  return this.users.map(u=>{
   const roles=u.roles||[],own=String(u.id)===String(authService.getCurrentUser()?.userId),system=roles.some(r=>r.code==='ADMIN_SYSTEM');
   return `<tr><td><strong>${esc(u.first_name)} ${esc(u.last_name)}</strong><small>${esc(u.email||'')}</small></td><td>${esc(u.username)}</td><td>${roles.map(r=>esc(r.name||r.code)).join(', ')||'Sin rol'}</td><td>${roles.some(r=>r.scope==='GLOBAL')?'Global':esc(u.branch_name||'Sin sucursal')}</td><td><span class="branch-pill ${u.active?'active':'inactive'}">${u.active?'Activo':'Bloqueado'}</span></td><td><div class="security-actions">
   ${roles.some(r=>r.code==='INSTRUCTOR')?`<button class="btn btn-small instructor-availability-btn" data-id="${esc(u.id)}">Disponibilidad</button>`:''}
   ${own?'<span class="branch-pill active">Tu usuario</span>':permissionService.can('USER_DISABLE')?`<button class="btn btn-small toggle-user" data-id="${esc(u.id)}" data-active="${!u.active}">${u.active?'Bloquear':'Desbloquear'}</button>`:''}
   ${!system&&permissionService.can('USER_RESET_ACCESS')?`<button class="btn btn-small security-reset" data-id="${esc(u.id)}">Generar clave temporal</button>`:''}</div></td></tr>`;
  }).join('')||'<tr><td colspan="6">No se encontraron usuarios.</td></tr>';
 }
 async filterUsers(){
  const request=this.searchRequest=(this.searchRequest||0)+1;
  const form=document.getElementById('security-filters'),status=document.getElementById('security-user-status');
  status.textContent='Buscando...';
  try{
   const result=await AdminService.users({...Object.fromEntries(new FormData(form)),page:this.page||1,limit:100});
   if(request!==this.searchRequest)return;
   this.users=result.data?.data||[];
   document.getElementById('security-users').innerHTML=this.userRows();
   document.getElementById('security-page').textContent=`Pagina ${this.page||1}`;
   document.getElementById('security-prev').disabled=(this.page||1)===1;
   document.getElementById('security-next').disabled=this.users.length<100;
   status.textContent='';
  }catch(error){if(request===this.searchRequest)status.textContent=error.message||'No se pudo buscar usuarios.';}
 }
 async resetAccess(button){
  const user=this.users.find(u=>String(u.id)===button.dataset.id);
  if(!user||!window.confirm(`Se cerraran las sesiones de ${user.username} y debera cambiar su clave al ingresar. ¿Continuar?`))return;
  button.disabled=true;
  try{
   const response=await AdminService.resetUserAccess(user.id,'Clave temporal generada desde Seguridad y Accesos');
   const layer=document.getElementById('instructor-availability-layer');
   layer.innerHTML=`<div class="branch-modal-backdrop"><section class="branch-modal" role="dialog" aria-modal="true" aria-labelledby="security-password-title"><h2 id="security-password-title">Clave temporal generada</h2><p>${esc(user.username)}</p><label>Clave temporal<input class="form-input" value="${esc(response.data.temporaryPassword)}" readonly></label><div class="branch-modal-actions"><button type="button" class="btn btn-primary">Entendido</button></div></section></div>`;
   layer.querySelector('button').onclick=()=>{layer.innerHTML='';button.disabled=false;};
   layer.querySelector('button').focus();
  }catch(error){button.disabled=false;window.alert(error.message||'No se pudo generar la clave temporal.');}
 }
 bindUserTable(){
  const form=document.getElementById('security-filters');
  form.onsubmit=e=>e.preventDefault();
  form.oninput=()=>{clearTimeout(this.searchTimer);this.page=1;this.searchTimer=setTimeout(()=>this.filterUsers(),250);};
  document.getElementById('security-prev').onclick=()=>{this.page=Math.max(1,(this.page||1)-1);this.filterUsers();};
  document.getElementById('security-next').onclick=()=>{this.page=(this.page||1)+1;this.filterUsers();};
  document.getElementById('security-users').onclick=async e=>{
   const button=e.target.closest('button');if(!button)return;
   if(button.classList.contains('security-reset'))return this.resetAccess(button);
   if(button.classList.contains('instructor-availability-btn'))return this.openInstructorAvailability(button.dataset.id);
   if(button.classList.contains('toggle-user')){
    button.disabled=true;
    try{await AdminService.setActive(button.dataset.id,button.dataset.active==='true','Cambio desde Seguridad y Accesos');await this.filterUsers();}
    catch(error){button.disabled=false;window.alert(error.message);}
   }
  };
 }
 unmount(){clearTimeout(this.searchTimer);this.searchRequest=(this.searchRequest||0)+1;super.unmount();}

 async openInstructorAvailability(userId){
  const layer=document.getElementById('instructor-availability-layer');if(!layer)return;
  layer.innerHTML='<div class="branch-modal-backdrop"><section class="branch-modal instructor-availability-modal"><p>Consultando disponibilidad...</p></section></div>';
  try{
   const response=await AdminService.instructorAvailability(userId),data=response.data||{},current=new Set((data.slots||[]).map(slot=>`${slot.weekday}:${slot.start_time}-${slot.end_time}`));
   const days=[[1,'Lunes'],[2,'Martes'],[3,'Miércoles'],[4,'Jueves'],[5,'Viernes']];
   const blocks=[['06:00','07:40'],['08:00','09:40'],['10:00','11:40'],['12:00','13:40'],['14:00','15:40'],['16:00','17:40'],['18:00','19:40'],['20:00','21:40']];
   layer.innerHTML=`<div class="branch-modal-backdrop"><form class="branch-modal instructor-availability-modal" id="instructor-availability-form"><div class="permission-modal__header"><div><h2>Disponibilidad del instructor</h2><p>${esc(data.instructor?.first_name)} ${esc(data.instructor?.last_name)} · ${esc(data.instructor?.branch_name||'Sin sucursal')}</p></div><button type="button" class="permission-modal__close" data-close-availability>&times;</button></div><div class="instructor-availability-help">Selecciona los bloques en los que el instructor puede recibir asignaciones. Una clase ya ocupada seguirá bloqueada automáticamente.</div><label class="instructor-practice-area"><span>Tipo de instructor</span><select class="form-input" name="practiceArea" required><option value="carro" ${data.instructor?.practice_area==='carro'?'selected':''}>Solo automóvil</option><option value="moto" ${data.instructor?.practice_area==='moto'?'selected':''}>Solo moto</option><option value="mixto" ${data.instructor?.practice_area==='mixto'?'selected':''}>Automóvil y moto</option></select><small>Esta selección determina en qué cursos puede ser asignado.</small></label><div class="instructor-availability-actions"><button type="button" class="btn btn-primary" data-all-availability>Seleccionar todo</button><button type="button" class="btn btn-light" data-clear-availability>Limpiar selección</button></div><div class="instructor-availability-grid"><div class="availability-heading">Hora</div>${days.map(day=>`<button type="button" class="availability-heading availability-day-toggle" data-day="${day[0]}">${day[1]}</button>`).join('')}${blocks.map(([start,end])=>`<div class="availability-time">${start}<small>${end}</small></div>${days.map(day=>{const key=`${day[0]}:${start}-${end}`;return `<label class="availability-cell"><input type="checkbox" data-weekday="${day[0]}" data-start="${start}" data-end="${end}" ${current.has(key)?'checked':''}><span></span></label>`;}).join('')}`).join('')}</div><div id="availability-status" class="branch-status"></div><div class="branch-modal-actions"><button type="button" class="btn" data-close-availability>Cancelar</button><button type="submit" class="btn btn-primary">Guardar configuración</button></div></form></div>`;
   const form=layer.querySelector('form'),close=()=>{layer.innerHTML='';};layer.querySelectorAll('[data-close-availability]').forEach(button=>button.onclick=close);
   layer.querySelector('[data-all-availability]').onclick=()=>form.querySelectorAll('.availability-cell input').forEach(input=>{input.checked=true;});
   layer.querySelector('[data-clear-availability]').onclick=()=>form.querySelectorAll('.availability-cell input').forEach(input=>{input.checked=false;});
   layer.querySelectorAll('.availability-day-toggle').forEach(button=>button.onclick=()=>{const inputs=[...form.querySelectorAll(`[data-weekday="${button.dataset.day}"]`)];const next=inputs.some(input=>!input.checked);inputs.forEach(input=>{input.checked=next;});});
   form.onsubmit=async event=>{event.preventDefault();const submit=form.querySelector('[type="submit"]'),status=form.querySelector('#availability-status');submit.disabled=true;status.textContent='Guardando...';try{const slots=[...form.querySelectorAll('.availability-cell input:checked')].map(input=>({weekday:Number(input.dataset.weekday),startTime:input.dataset.start,endTime:input.dataset.end}));await AdminService.saveInstructorAvailability(userId,slots,form.elements.practiceArea.value);status.textContent='Configuración guardada correctamente.';setTimeout(close,700);}catch(error){status.textContent=error.message||'No se pudo guardar la configuración.';}finally{submit.disabled=false;}};
  }catch(error){layer.innerHTML=`<div class="branch-modal-backdrop"><section class="branch-modal instructor-availability-modal"><h2>No se pudo abrir</h2><p>${esc(error.message)}</p><div class="branch-modal-actions"><button class="btn btn-primary" data-close-availability>Aceptar</button></div></section></div>`;layer.querySelector('[data-close-availability]').onclick=()=>{layer.innerHTML='';};}
 }
 async mount(){this.bindUserTable();const refreshView=()=>window.dispatchEvent(new PopStateEvent('popstate'));document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.admin-tab').forEach(x=>x.hidden=true);document.getElementById(`admin-tab-${b.dataset.tab}`).hidden=false;}));document.getElementById('new-user-form')?.addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,status=form.querySelector('#new-user-result'),button=form.querySelector('.btn-primary');button.disabled=true;try{const result=await AdminService.createUser(Object.fromEntries(new FormData(form)));if(result?.success===false)throw new Error(result.error||'No se pudo crear el usuario.');const user=result.data;window.alert(`Usuario creado: ${user.username}\nClave temporal: ${user.temporaryPassword}\n\nEsta clave se muestra una sola vez.`);refreshView();}catch(error){button.disabled=false;status.textContent=error.message||'No se pudo crear el usuario.';status.style.color='#b42318';}});document.getElementById('permission-form')?.addEventListener('submit',async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));const id=data.userId;delete data.userId;if(!data.branchId)delete data.branchId;if(!data.validUntil)delete data.validUntil;await AdminService.grantPermission(id,data);refreshView();});document.querySelectorAll('.legacy-toggle-user').forEach(b=>b.addEventListener('click',async()=>{await AdminService.setActive(b.dataset.id,b.dataset.active==='true','Cambio desde Seguridad y Accesos');refreshView();}));document.querySelectorAll('.legacy-instructor-availability-btn').forEach(button=>button.addEventListener('click',()=>this.openInstructorAvailability(button.dataset.id)));document.querySelectorAll('.revoke-session').forEach(b=>b.addEventListener('click',async()=>{await AdminService.revokeSession(b.dataset.id,'Revocada desde Seguridad y Accesos');refreshView();}));}
}
