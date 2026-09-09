import Component from '../../components/Component.js';
import StudentPortalService from '../../services/StudentPortalService.js';
import ProfileService from '../../services/profileService.js';
import {authService} from '../../core/auth/AuthService.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
const date=value=>value?new Intl.DateTimeFormat('es-EC',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value)):'Pendiente';
const dateTime=value=>value?new Intl.DateTimeFormat('es-EC',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value)):'—';
const money=value=>new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD'}).format(Number(value||0));

export default class StudentPortalView extends Component{
  ensureStyles(){
    const styles=[
      ['student-portal-styles','/src/assets/css/pages/student-portal.css?v=proxima-clase-moodle-20260820'],
      ['student-portal-brand-styles','/src/assets/css/pages/student-portal-brand.css?v=azul-institucional-20260819'],
    ];
    styles.forEach(([id,href])=>{
      if(document.getElementById(id))return;
      const link=document.createElement('link');
      link.id=id;
      link.rel='stylesheet';
      link.href=href;
      document.head.appendChild(link);
    });
  }
  async render(){
    this.ensureStyles();
    try{this.data=(await StudentPortalService.summary()).data;}catch(error){return `<main class="student-portal student-portal--error"><h1>No pudimos abrir tu portal</h1><p>${esc(error.message)}</p></main>`;}
    const {student,enrollment,payment,documents,classes,metrics}=this.data,user=authService.getCurrentUser();
    const progress=metrics.totalClasses?Math.round((metrics.attended/metrics.totalClasses)*100):0;
    const pendingTransfer=Number(payment?.pending_transfer_amount||0);
    const paymentMessage=pendingTransfer>0
      ? `<div class="student-payment confirming" style="display:grid;gap:3px;background:#eaf2ff;color:#1759a8"><strong>Pago por confirmar</strong><span style="font-size:.78rem;font-weight:500;color:#41698f">Transferencia registrada: ${money(pendingTransfer)}. Se reflejará como pagada cuando sea confirmada.</span></div>`
      : `<div class="student-payment ${Number(payment?.balance)>0?'pending':'paid'}">${Number(payment?.balance)>0?'Tienes un saldo pendiente':'Curso pagado completamente'}</div>`;
    const now=Date.now();
    const nextClass=classes.find(item=>{
      const scheduled=new Date(item.scheduled_start).getTime();
      return Number.isFinite(scheduled)&&scheduled>=now&&!['CANCELADA','COMPLETADA'].includes(String(item.status||'').toUpperCase());
    })||null;
    const moodleUrl=String(window.__SPORTMANCAR_CONFIG__?.MOODLE_URL||'').trim();
    const theoryModality=String(enrollment?.theory_modality||'').trim().toLowerCase();
    const hasVirtualTheory=theoryModality==='virtual'||theoryModality.includes('virtual');
    return `<div class="student-portal">
      <header class="student-portal__header"><img src="/src/assets/branding/sportmancar-logo.png" alt="Sportmancar"><div><small>Portal del estudiante</small><strong>${esc(student.name)}</strong></div><button id="student-logout" aria-label="Cerrar sesión">Salir</button></header>
      <nav class="student-portal__nav"><button class="active" data-student-tab="summary">Inicio</button><button data-student-tab="classes">Mis clases</button><button data-student-tab="documents">Documentos</button><button data-student-tab="account">Mi cuenta</button></nav>
      <main class="student-portal__main">
        <section data-student-panel="summary">
          <div class="student-welcome"><div><span>${esc(student.branch)}</span><h1>Hola, ${esc(student.name.split(' ')[0])}</h1><p>${enrollment?`Estás cursando ${esc(enrollment.course_name)}.`:'Aún no tienes una matrícula activa.'}</p></div><button class="student-scan" data-open-scanner>▣ Registrar asistencia</button></div>
          <article class="student-next-class">
            <div><small>Próxima clase</small><strong>${nextClass?dateTime(nextClass.scheduled_start):'Sin clases próximas'}</strong>${nextClass?`<span>${esc(nextClass.instructor_name||'Instructor por asignar')}</span>`:''}</div>
            ${hasVirtualTheory&&moodleUrl?`<a class="student-virtual-classroom" href="${esc(moodleUrl)}" target="_blank" rel="noopener noreferrer">Ir al aula virtual</a>`:''}
          </article>
          <div class="student-metrics"><article><span>✓</span><strong>${metrics.attended}</strong><small>Clases asistidas</small></article><article><span>◷</span><strong>${metrics.pending}</strong><small>Clases pendientes</small></article><article><span>↗</span><strong>${metrics.performance??'—'}${metrics.performance!==null?'%':''}</strong><small>Rendimiento</small></article><article><span>▤</span><strong>${metrics.documentsComplete}/${metrics.documentsTotal}</strong><small>Documentos</small></article></div>
          <div class="student-portal__grid"><article class="student-card"><div class="student-card__title"><h2>Mi curso</h2><span class="student-status">${esc(enrollment?.cycle_status||student.status)}</span></div><h3>${esc(enrollment?.course_name||'Sin curso asignado')}</h3><dl><div><dt>Instructor</dt><dd>${esc(enrollment?.instructor_name||'Por asignar')}</dd></div><div><dt>Inicio</dt><dd>${date(enrollment?.start_date)}</dd></div><div><dt>Finalización</dt><dd>${date(enrollment?.end_date)}</dd></div><div><dt>Modalidad teórica</dt><dd>${esc((enrollment?.theory_modality||'presencial_regular').replaceAll('_',' '))}</dd></div></dl><div class="student-progress"><span style="width:${progress}%"></span></div><small>${progress}% de clases registradas como asistidas</small></article>
          <article class="student-card"><div class="student-card__title"><h2>Estado de pago</h2><strong>${pendingTransfer>0?'Por confirmar':`${money(payment?.balance)} pendiente`}</strong></div><dl><div><dt>Valor del curso</dt><dd>${money(payment?.final_amount)}</dd></div><div><dt>Pagado y confirmado</dt><dd>${money(payment?.paid)}</dd></div>${pendingTransfer>0?`<div><dt>Transferencia por confirmar</dt><dd>${money(pendingTransfer)}</dd></div>`:''}</dl>${paymentMessage}</article></div>
        </section>
        <section data-student-panel="classes" hidden><div class="student-section-head"><div><h1>Mis clases</h1><p>Consulta tu asistencia, horario y rendimiento.</p></div><button class="student-scan" data-open-scanner>▣ Escanear QR</button></div><div class="student-class-list">${classes.map((item,index)=>`<article><div class="student-class-number">${item.session_number||index+1}</div><div><strong>${dateTime(item.scheduled_start)}</strong><span>${esc(item.instructor_name||'Instructor por asignar')}</span>${item.topics?.length?`<small>Temas: ${item.topics.map(topic=>esc(topic.name)).join(' · ')}</small>`:''}${item.observations?`<small>Observación: ${esc(item.observations)}</small>`:''}</div><div><b>${esc(item.attendance_status||item.status||'Programada')}</b><small>${esc(String(item.performance_level||'Sin evaluación').replaceAll('_',' '))}</small></div></article>`).join('')||'<div class="student-empty">Aún no hay clases programadas.</div>'}</div></section>
        <section data-student-panel="documents" hidden><div class="student-section-head"><div><h1>Mi documentación</h1><p>Revisa qué documentos ya entregaste y cuáles faltan.</p></div></div><div class="student-document-list">${documents.map(doc=>`<article class="${doc.uploaded?'complete':'missing'}"><span>${doc.uploaded?'✓':'!'}</span><div><strong>${esc(doc.name)}</strong><small>${doc.uploaded?`Entregado ${date(doc.uploaded_at)}`:'Documento pendiente'}</small></div><b>${doc.uploaded?'Completo':'Falta entregar'}</b></article>`).join('')}</div></section>
        <section data-student-panel="account" hidden><div class="student-section-head"><div><h1>Mi cuenta</h1><p>Datos personales y seguridad del acceso.</p></div></div><div class="student-portal__grid"><article class="student-card"><h2>Datos del estudiante</h2><dl><div><dt>Cédula</dt><dd>${esc(student.identification)}</dd></div><div><dt>Usuario</dt><dd>${esc(user.username)}</dd></div><div><dt>Correo</dt><dd>${esc(student.email)}</dd></div><div><dt>Teléfono</dt><dd>${esc(student.phone)}</dd></div><div><dt>Sucursal</dt><dd>${esc(student.branch)}</dd></div></dl></article><article class="student-card"><h2>Seguridad</h2><p>Usa una contraseña que solo tú conozcas.</p><button class="student-primary" id="student-change-password">Cambiar contraseña</button></article></div></section>
      </main><div id="student-portal-modal"></div>
      <footer class="student-portal__mobile-nav"><button class="active" data-student-tab="summary">Inicio</button><button data-student-tab="classes">Clases</button><button data-open-scanner>▣ QR</button><button data-student-tab="documents">Documentos</button><button data-student-tab="account">Cuenta</button></footer>
    </div>`;
  }
  async mount(){
    document.querySelectorAll('[data-student-tab]').forEach(button=>button.onclick=()=>this.selectTab(button.dataset.studentTab));
    document.querySelectorAll('[data-open-scanner]').forEach(button=>button.onclick=()=>this.openScanner());
    document.getElementById('student-change-password')?.addEventListener('click',()=>this.openPassword());
    document.getElementById('student-logout')?.addEventListener('click',async()=>{await authService.logout();window.history.pushState(null,null,'/login');window.dispatchEvent(new PopStateEvent('popstate'));});
    if(authService.getCurrentUser()?.mustChangePassword)this.openPassword(true);
  }
  selectTab(tab){document.querySelectorAll('[data-student-panel]').forEach(panel=>panel.hidden=panel.dataset.studentPanel!==tab);document.querySelectorAll('[data-student-tab]').forEach(button=>button.classList.toggle('active',button.dataset.studentTab===tab));window.scrollTo(0,0);}
  modal(content,closable=true){const host=document.getElementById('student-portal-modal');host.innerHTML=`<div class="student-modal-backdrop"><div class="student-modal">${content}</div></div>`;if(closable)host.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>{this.stopCamera();host.innerHTML='';});return host;}
  openPassword(required=false){
    const closeButton=required?'':'<button class="student-modal__close" data-close aria-label="Cerrar">×</button>';
    const title=required?'Crea tu nueva contraseña':'Cambiar contraseña';
    const message=required
      ? 'Por seguridad, debes reemplazar la contraseña temporal antes de continuar. Usa al menos 8 caracteres.'
      : 'La nueva contraseña debe tener al menos 8 caracteres.';
    const currentPasswordLabel=required?'Contraseña temporal actual':'Contraseña actual';
    const host=this.modal(`${closeButton}<h2>${title}</h2><p>${message}</p><form id="student-password-form"><label>${currentPasswordLabel}<input type="password" name="currentPassword" autocomplete="current-password" required autofocus></label><label>Nueva contraseña<input type="password" name="newPassword" minlength="8" autocomplete="new-password" required></label><label>Confirmar nueva contraseña<input type="password" name="confirmation" minlength="8" autocomplete="new-password" required></label><div id="student-password-status" aria-live="polite"></div><button class="student-primary">Guardar nueva contraseña</button></form>`,!required);
    host.querySelector('form').onsubmit=async event=>{
      event.preventDefault();
      const form=event.currentTarget,fd=new FormData(form),status=host.querySelector('#student-password-status'),button=form.querySelector('button');
      status.className='';
      if(fd.get('newPassword')!==fd.get('confirmation')){status.className='error';status.textContent='Las contraseñas no coinciden.';return;}
      try{
        button.disabled=true;
        button.textContent='Guardando...';
        await ProfileService.updatePassword({currentPassword:fd.get('currentPassword'),newPassword:fd.get('newPassword')});
        const session=authService.getCurrentUser();
        if(session)sessionStorage.setItem(authService.sessionKey,JSON.stringify({...session,mustChangePassword:false}));
        status.className='success';
        status.textContent='Contraseña actualizada correctamente.';
        window.setTimeout(()=>{host.innerHTML='';},700);
      }catch(error){
        status.className='error';
        status.textContent=error.message||'No se pudo actualizar la contraseña.';
        button.disabled=false;
        button.textContent='Guardar nueva contraseña';
      }
    };
  }
  openScanner(){const supported='BarcodeDetector' in window;const host=this.modal(`<button class="student-modal__close" data-close>×</button><h2>Registrar asistencia</h2><p>Escanea el QR generado por tu instructor.</p>${supported?'<video id="student-qr-video" autoplay playsinline></video><div id="student-qr-status">Activando cámara…</div>':'<div class="student-qr-help">Tu navegador no permite lectura directa. Puedes pegar aquí el enlace del QR.</div>'}<form id="student-qr-manual"><label>Enlace o código QR<input name="qrValue" placeholder="Pega el enlace aquí"></label><button class="student-primary">Continuar</button></form>`);host.querySelector('form').onsubmit=event=>{event.preventDefault();this.openAttendance(new FormData(event.currentTarget).get('qrValue'));};if(supported)this.startCamera();}
  async startCamera(){const video=document.getElementById('student-qr-video'),status=document.getElementById('student-qr-status');try{this.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});video.srcObject=this.stream;const detector=new BarcodeDetector({formats:['qr_code']});const scan=async()=>{if(!this.stream)return;const codes=await detector.detect(video).catch(()=>[]);if(codes[0]?.rawValue){this.openAttendance(codes[0].rawValue);return;}this.scanFrame=requestAnimationFrame(scan);};scan();}catch(error){status.textContent='No se pudo abrir la cámara. Pega el enlace del QR manualmente.';}}
  stopCamera(){if(this.scanFrame)cancelAnimationFrame(this.scanFrame);this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;}
  openAttendance(value){const raw=String(value||'').trim();let token='';try{token=new URL(raw,window.location.origin).searchParams.get('token')||'';}catch{}if(!token&&!raw.includes('/'))token=raw;if(!token){document.getElementById('student-qr-status')?.replaceChildren(document.createTextNode('El código QR no es válido.'));return;}this.stopCamera();window.location.href=`/attendance.html?token=${encodeURIComponent(token)}`;}
  unmount(){
    this.stopCamera();
    document.getElementById('student-portal-styles')?.remove();
    document.getElementById('student-portal-brand-styles')?.remove();
    super.unmount();
  }
}
