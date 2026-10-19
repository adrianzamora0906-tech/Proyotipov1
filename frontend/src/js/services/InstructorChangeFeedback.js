import {apiClient} from '../core/api/ApiClient.js';
import {authService} from '../core/auth/AuthService.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const userId=()=>{const u=authService.getCurrentUser();return u?.userId||u?.id;};
const date=value=>value?new Intl.DateTimeFormat('es-EC',{timeZone:'America/Guayaquil',dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'Pendiente';
class InstructorChangeFeedback {
  start(){
    if(!this.started){
      this.started=true;
      window.addEventListener('erp:instructor-feedback-changed',()=>this.refresh());
      window.addEventListener('erp:realtime',e=>{if(e.detail?.topics?.includes('resync'))this.refresh();});
      window.addEventListener('erp:sessionChanged',()=>{this.rows=[];document.getElementById('instructor-feedback-modal')?.remove();document.getElementById('instructor-feedback-reminder')?.remove();this.refresh();});
      document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.refresh();});
    }
    this.refresh();
  }
  async refresh(){
    const user=authService.getCurrentUser(),id=userId();
    if(!id||!(['instructor','estudiante'].includes(user.role)||user.roles?.some(r=>['STUDENT','INSTRUCTOR'].includes(r))))return;
    if(this.busy){this.again=true;return;}
    this.busy=true;
    try{
      const result=await apiClient.get('/notifications/instructor-feedback/pending');
      if(id!==userId())return;
      if(!result.success)throw new Error('No se pudieron consultar los comentarios pendientes');
      this.rows=result.data||[];this.error='';this.reminder();
      if(!document.querySelector('.modal-overlay.active')){
        const pending=this.rows.find(row=>Number(sessionStorage.getItem(`instructor-feedback-later:${id}:${row.id}`)||0)<Date.now());
        if(pending)this.show(pending);
      }
    }catch(error){if(id===userId()){this.error=error.message;this.reminder();}}
    finally{this.busy=false;if(this.again){this.again=false;this.refresh();}}
  }
  reminder(){
    let button=document.getElementById('instructor-feedback-reminder');
    if(!this.rows?.length&&!this.error){button?.remove();return;}
    if(!button){button=document.createElement('button');button.id='instructor-feedback-reminder';button.type='button';button.className='btn btn-secondary';button.style.cssText='position:fixed;bottom:16px;right:16px;z-index:1050;max-width:calc(100vw - 32px);white-space:normal';document.body.append(button);}
    button.textContent=this.error?'Comentarios: reintentar':`Comentarios pendientes (${this.rows.length})`;
    button.onclick=()=>this.rows?.length?this.show(this.rows[0]):this.refresh();
  }
  show(row){
    if(document.getElementById('instructor-feedback-modal'))return;
    const id=userId(),student=row.participant==='student';
    const overlay=document.createElement('div');overlay.id='instructor-feedback-modal';overlay.className='modal-overlay modal-overlay-secondary active';
    overlay.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="feedback-modal-title" style="width:min(580px,100%);max-height:90dvh;overflow:auto"><header class="modal-header"><h3 class="modal-title" id="feedback-modal-title">${student?'Cambio de instructor':'Seguimiento de cambio de instructor'}</h3></header><form><div class="modal-body"><p>${student?'Tus clases pendientes fueron reasignadas a otro instructor. Cuentanos por que solicitaste este cambio.':`Las clases pendientes de <strong>${esc(row.student_name)}</strong> fueron reasignadas. Comparte tu punto de vista sobre el motivo del cambio.`}</p><label class="form-label" for="feedback-comment">Tu comentario</label><textarea class="form-textarea" id="feedback-comment" name="comment" rows="5" minlength="10" maxlength="3000" required></textarea><p>Tu respuesta sera visible unicamente para administracion.</p><p role="alert" data-error></p></div><footer class="modal-footer"><button type="button" class="btn btn-secondary" data-later>Responder despues</button><button type="submit" class="btn btn-primary">Enviar comentario</button></footer></form></section>`;
    const later=()=>{sessionStorage.setItem(`instructor-feedback-later:${id}:${row.id}`,String(Date.now()+3600000));overlay.remove();};
    overlay.querySelector('[data-later]').onclick=later;
    overlay.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();later();}};
    overlay.querySelector('form').onsubmit=async e=>{
      e.preventDefault();const text=overlay.querySelector('textarea').value.trim();
      if(text.length<10){overlay.querySelector('[data-error]').textContent='Escribe al menos 10 caracteres.';return;}
      const button=overlay.querySelector('[type="submit"]');button.disabled=true;
      try{
        if(id!==userId())throw new Error('La sesion cambio. Vuelve a ingresar.');
        const result=await apiClient.post(`/notifications/instructor-feedback/${encodeURIComponent(row.id)}/respond`,{comment:text});
        if(!result.success)throw new Error('No se pudo enviar el comentario.');
        overlay.remove();await this.refresh();
      }catch(error){button.disabled=false;overlay.querySelector('[data-error]').textContent=error.message;}
    };
    const textarea=overlay.querySelector('textarea');
    textarea.style.cssText='display:block;width:100%;box-sizing:border-box;min-height:140px;padding:12px;resize:vertical';
    overlay.querySelector('label').style.display='block';
    document.body.append(overlay);textarea.focus();
  }
}
export const instructorChangeFeedback=new InstructorChangeFeedback();

export async function renderAdminInstructorFeedback(studentId,parent){
  const user=authService.getCurrentUser();
  if(!user?.roles?.some(r=>['ADMIN_SYSTEM','BRANCH_ADMIN','GENERAL_MANAGER'].includes(r)))return;
  const identity=userId();
  const section=document.createElement('section');section.dataset.instructorFeedback='true';section.textContent='Cargando seguimiento de cambios de instructor...';parent.prepend(section);
  const load=async()=>{
    try{
      const result=await apiClient.get(`/notifications/instructor-feedback/student/${encodeURIComponent(studentId)}`);
      if(!section.isConnected||identity!==userId())return;
      if(!result.success)throw new Error('No se pudo consultar el seguimiento');
      section.innerHTML=`<h3>Seguimiento de cambios de instructor</h3>${result.data.length?result.data.map(row=>`<article style="padding:16px 0;border-bottom:1px solid #ddd"><strong>${esc(row.previous_instructor_name)} → ${esc(row.new_instructor_name)}</strong><p>${date(row.created_at)} · ${row.reviewed_at?'Revisado':row.student_responded_at&&row.instructor_responded_at?'Respondido':'Pendiente de respuestas'}</p><p>Motivo registrado: ${esc(row.administrative_reason)}</p><h4>Estudiante · ${date(row.student_responded_at)}</h4><p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(row.student_response||'Pendiente')}</p><h4>Instructor anterior · ${date(row.instructor_responded_at)}</h4><p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(row.instructor_response||'Pendiente')}</p>${row.student_responded_at&&row.instructor_responded_at&&!row.reviewed_at&&authService.can('STUDENT_UPDATE')?`<button type="button" class="btn btn-secondary" data-review-feedback="${esc(row.id)}">Marcar revisado</button>`:''}</article>`).join(''):'<p>Sin cambios de instructor con seguimiento.</p>'}`;
      section.querySelectorAll('[data-review-feedback]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await apiClient.post(`/notifications/instructor-feedback/${button.dataset.reviewFeedback}/review`,{});await load();}catch(e){button.disabled=false;section.querySelector('[data-admin-error]')?.remove();const error=document.createElement('p');error.dataset.adminError='true';error.setAttribute('role','alert');error.textContent=e.message;section.append(error);}});
    }catch(e){section.textContent=e.message+' ';const retry=document.createElement('button');retry.type='button';retry.className='btn btn-secondary';retry.textContent='Reintentar';retry.onclick=load;section.append(retry);}
  };
  await load();
}
