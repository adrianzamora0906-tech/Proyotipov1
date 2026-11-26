import Component from '../../components/Component.js';
import {apiClient} from '../../core/api/ApiClient.js';
import {authService} from '../../core/auth/AuthService.js';
import Validator from '../../helpers/Validator.js';
const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const endpoint='/quick-registration';
const go=path=>{window.history.pushState(null,'',path);window.dispatchEvent(new PopStateEvent('popstate'));};

export default class QuickRegistrationView extends Component {
  async render() {
    this.options=[];this.instructorId='';this.version=0;this.busy=false;
    const user=authService.getCurrentUser();
    const header=`<header class="qr-header"><div><h1>Inscripción rápida</h1><p>${escape(user.branch)} · ${escape(user.name)}</p></div><button type="button" class="btn btn-secondary" id="qr-logout">Cerrar sesión</button></header><p id="qr-message" role="status" aria-live="polite"></p>`;
    if(user.mustChangePassword)return `<main class="quick-registration">${header}<section class="card"><h2>Cambia tu contraseña temporal</h2><form id="qr-password"><label>Contraseña actual<input class="form-input" type="password" name="currentPassword" autocomplete="current-password" required></label><label>Nueva contraseña<input class="form-input" type="password" name="newPassword" autocomplete="new-password" minlength="8" required></label><p>Usa mayúsculas, minúsculas, números y símbolos.</p><button class="btn btn-primary">Guardar contraseña</button></form></section></main>`;
    if(this.props.studentId) {
      const {data:student}=await apiClient.get(`${endpoint}/students/${encodeURIComponent(this.props.studentId)}`);
      return `<main class="quick-registration">${header}<a href="/quick-registration" data-qr-link>Volver a inscripciones</a><section class="card student-profile"><h2>${escape(student.firstName)} ${escape(student.lastName)}</h2><p>Perfil de consulta</p><div class="info-grid"><p>Cédula: ${escape(student.identification)}</p><p>Teléfono: ${escape(student.phone)}</p><p>Correo: ${escape(student.email)}</p><p>Estado: ${escape(student.status)}</p></div><h3>Cursos matriculados</h3>${student.enrollments.map(item=>`<p>${escape(item.course)} · ${escape(item.status)}</p>`).join('')}<h3>Clases e instructor</h3><div class="qr-table"><table><thead><tr><th>Fecha</th><th>Hora</th><th>Instructor</th></tr></thead><tbody>${student.schedule.map(item=>`<tr><td>${escape(String(item.schedule_date).slice(0,10))}</td><td>${escape(item.start_time)} – ${escape(item.end_time)}</td><td>${escape(item.instructor)}</td></tr>`).join('')}</tbody></table></div></section></main>`;
    }
    this.catalog=(await apiClient.get(`${endpoint}/catalog`)).data;
    return `<main class="quick-registration">${header}
      <section class="card"><h2>Consultar estudiante</h2><label>Nombre o cédula<input id="qr-search" class="form-input" autocomplete="off" placeholder="Escribe al menos 3 caracteres"></label><div id="qr-search-results"></div></section>
      <section class="card"><h2>Nueva inscripción</h2><p>${this.catalog.promotionActive?'Black Friday vigente. El pago se registra después en Caja.':'Black Friday disponible del 27 al 29 de noviembre. Aún no se pueden confirmar inscripciones.'}</p>
      <form id="qr-form"><div class="qr-grid">
      ${[['identification','Cédula','text'],['firstName','Nombres','text'],['lastName','Apellidos','text'],['phone','Teléfono','tel'],['email','Correo del estudiante','email']].map(([name,label,type])=>`<label>${label}<input class="form-input" name="${name}" type="${type}" ${['identification','firstName','lastName'].includes(name)?'required':''} ${name==='identification'?'inputmode="numeric" pattern="[0-9]{10}" maxlength="10"':''}></label>`).join('')}
      <label>Fecha de nacimiento<input class="form-input" name="birthDate" type="date"></label>
      <label>Curso<select class="form-select" name="courseId" required><option value="">Selecciona</option>${this.catalog.courses.map(course=>`<option value="${escape(course.id)}">${escape(course.name)} · $${Number(course.amount).toFixed(2)}</option>`).join('')}</select></label>
      <label>Modalidad<select class="form-select" name="modality"><option value="normal">Normal</option><option value="intensivo">Intensivo</option></select></label>
      <label class="qr-autocomplete">Instructor<input class="form-input" id="qr-instructor" autocomplete="off" placeholder="Buscar por nombres o apellidos" required aria-controls="qr-instructors"><span id="qr-instructors"></span></label>
      <label>Fecha de inicio acordada<input class="form-input" name="startDate" type="date" required></label>
      <label>Ciclo y horario<select class="form-select" name="optionKey" required><option value="">Completa curso, instructor y fecha</option></select></label>
      <label>Teoría<select class="form-select" name="theorySchedule"><option value="pendiente">Pendiente de confirmar</option><option value="virtual">Virtual</option></select></label>
      </div><p id="qr-existing" role="status"></p><p id="qr-dates"></p><button class="btn btn-primary" type="submit" ${this.catalog.promotionActive?'':'disabled'}>Revisar inscripción</button>
      <section id="qr-summary" class="qr-summary" hidden><h3>Confirmar inscripción</h3><div id="qr-summary-content"></div><button class="btn btn-primary" type="button" id="qr-confirm">Confirmar inscripción</button><button class="btn btn-secondary" type="button" id="qr-cancel">Volver al formulario</button></section></form>
      <section id="qr-result" hidden></section></section></main>`;
  }
  message(text) {const node=document.getElementById('qr-message');if(node)node.textContent=text;}
  values(){return Object.fromEntries(new FormData(this.form));}
  resetOptions(){this.options=[];this.form.elements.optionKey.innerHTML='<option value="">Consulta las opciones disponibles</option>';document.getElementById('qr-dates').textContent='';}
  async loadOptions(){
    this.resetOptions();const values=this.values();const version=++this.version;
    if(!values.courseId||!this.instructorId||!values.startDate)return;
    const query=new URLSearchParams({courseId:values.courseId,startDate:values.startDate,modality:values.modality,instructorId:this.instructorId});
    const result=await apiClient.get(`${endpoint}/options?${query}`);if(version!==this.version)return;
    this.options=result.data;
    this.form.elements.optionKey.innerHTML='<option value="">Selecciona un horario</option>'+this.options.map(item=>`<option value="${escape(item.key)}">${escape(item.code)} · ${escape(item.time)}–${escape(item.endTime)} · ${item.dates.length} clases</option>`).join('');
    this.message(this.options.length?'Selecciona el horario acordado.':'No hay un horario completo disponible para esa fecha. Verifica el acuerdo con Secretaría.');
  }
  async lookup(){
    const identification=this.form.elements.identification.value;
    if(!Validator.isValidCedula(identification)){this.message('Revisa la cédula y su dígito verificador.');return false;}
    const result=await apiClient.get(`${endpoint}/students?search=${encodeURIComponent(identification)}`);
    if(this.form.elements.identification.value!==identification)return false;
    const found=result.data.find(item=>item.identification===identification);
    for(const key of ['firstName','lastName','phone','email']) {const field=this.form.elements[key];field.readOnly=Boolean(found);if(found)field.value=found[key]||'';}
    document.getElementById('qr-existing').textContent=found?'Estudiante existente. Se conserva su identidad; solo se agregará el curso autorizado.':'';
    this.checkedIdentity=identification;return true;
  }
  async mount(){
    const root=document.querySelector('.quick-registration');
    root.querySelector('#qr-logout')?.addEventListener('click',async()=>{await authService.logout();go('/login');});
    root.querySelectorAll('[data-qr-link]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();go(link.getAttribute('href'));}));
    const password=root.querySelector('#qr-password');
    if(password){password.addEventListener('submit',async event=>{event.preventDefault();const button=password.querySelector('button');button.disabled=true;try{const values=Object.fromEntries(new FormData(password));await authService.updatePassword(values.currentPassword,values.newPassword);go('/quick-registration');}catch(error){this.message(error.message);}finally{button.disabled=false;}});return;}
    this.form=root.querySelector('#qr-form');if(!this.form)return;
    const safe=fn=>async event=>{try{await fn(event);}catch(error){this.message(error.message);}};
    this.form.addEventListener('input',()=>{root.querySelector('#qr-summary').hidden=true;});
    this.form.elements.identification.addEventListener('input',()=>{this.checkedIdentity=null;for(const key of ['firstName','lastName','phone','email']){const field=this.form.elements[key];if(field.readOnly)field.value='';field.readOnly=false;}});
    this.form.elements.identification.addEventListener('blur',safe(()=>this.lookup()));
    this.form.elements.courseId.addEventListener('change',()=>{this.instructorId='';root.querySelector('#qr-instructor').value='';this.resetOptions();++this.version;});
    for(const key of ['modality','startDate'])this.form.elements[key].addEventListener('change',safe(()=>this.loadOptions()));
    let instructorVersion=0;let timer;
    root.querySelector('#qr-instructor').addEventListener('input',event=>{
      this.instructorId='';this.resetOptions();++this.version;clearTimeout(timer);const version=++instructorVersion;
      root.querySelector('#qr-instructors').innerHTML='';const search=event.target.value.trim();
      if(search.length<2)return;
      timer=setTimeout(safe(async()=>{const result=await apiClient.get(`${endpoint}/instructors?${new URLSearchParams({search,courseId:this.form.elements.courseId.value})}`);if(version!==instructorVersion)return;
        const list=root.querySelector('#qr-instructors');list.innerHTML=result.data.map(item=>`<button type="button" class="btn btn-secondary" data-instructor="${escape(item.id)}">${escape(item.name)}</button>`).join('')||'Sin coincidencias';
        list.querySelectorAll('button').forEach(button=>button.addEventListener('click',safe(async()=>{++instructorVersion;this.instructorId=button.dataset.instructor;root.querySelector('#qr-instructor').value=button.textContent;list.innerHTML='';await this.loadOptions();})));}),180);
    });
    this.form.elements.optionKey.addEventListener('change',()=>{const option=this.options.find(item=>item.key===this.form.elements.optionKey.value);root.querySelector('#qr-dates').textContent=option?`Clases: ${option.dates.join(', ')}`:'';});
    let searchVersion=0;let searchTimer;
    root.querySelector('#qr-search').addEventListener('input',event=>{clearTimeout(searchTimer);const version=++searchVersion;const search=event.target.value;root.querySelector('#qr-search-results').innerHTML='';if(search.trim().length<3)return;
      searchTimer=setTimeout(safe(async()=>{const {data}=await apiClient.get(`${endpoint}/students?search=${encodeURIComponent(search)}`);if(version!==searchVersion)return;const results=root.querySelector('#qr-search-results');results.innerHTML=data.map(item=>`<p><a href="/student-profile/${escape(item.id)}">${escape(item.firstName)} ${escape(item.lastName)} · ${escape(item.identification)}</a></p>`).join('')||'Sin resultados en tu sucursal';results.querySelectorAll('a').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();go(link.getAttribute('href'));}));}),180);
    });
    this.form.addEventListener('submit',safe(async event=>{event.preventDefault();if(this.busy)return;if(!await this.lookup())return;
      const values=this.values();const option=this.options.find(item=>item.key===values.optionKey);if(!option||!this.instructorId)return this.message('Selecciona un instructor y horario disponible.');
      const course=this.catalog.courses.find(item=>item.id===values.courseId);
      this.draft={...values,instructorId:this.instructorId,requestId:crypto.randomUUID()};
      root.querySelector('#qr-summary-content').innerHTML=`<p>${escape(values.firstName)} ${escape(values.lastName)} · ${escape(values.identification)}</p><p>${escape(course.name)} · $${Number(course.amount).toFixed(2)} pendiente de pago</p><p>${escape(root.querySelector('#qr-instructor').value)} · ${escape(values.startDate)} · ${escape(option.time)}–${escape(option.endTime)} · ${option.dates.length} clases</p>`;
      root.querySelector('#qr-summary').hidden=false;
    }));
    root.querySelector('#qr-cancel').addEventListener('click',()=>{root.querySelector('#qr-summary').hidden=true;});
    root.querySelector('#qr-confirm').addEventListener('click',safe(async()=>{
      if(this.busy||!this.draft)return;this.busy=true;const button=root.querySelector('#qr-confirm');button.disabled=true;
      sessionStorage.setItem('qr-pending-operation',this.draft.requestId);
      try {
        const {data}=await apiClient.post(`${endpoint}/enrollments`,this.draft);
        if(data.status==='completed'){sessionStorage.removeItem('qr-pending-operation');this.message('Inscripción registrada. Pago pendiente en Caja.');root.querySelector('#qr-summary').hidden=true;this.form.hidden=true;
          const result=root.querySelector('#qr-result');result.hidden=false;result.innerHTML=`<a class="btn btn-secondary" href="/student-profile/${escape(data.studentId)}" data-result-profile>Consultar perfil</a> <button class="btn btn-primary" type="button" id="qr-next">Nueva inscripción</button>`;
          result.querySelector('a').addEventListener('click',event=>{event.preventDefault();go(event.currentTarget.getAttribute('href'));});result.querySelector('#qr-next').addEventListener('click',()=>go('/quick-registration'));
        }else {this.message(data.message||`Resultado: ${data.status}. Solicita revisión a Secretaría. Referencia: ${this.draft.requestId}`);}
      }catch(error){this.message(`No se pudo confirmar el resultado. No repitas la inscripción. Solicita revisión con referencia ${this.draft.requestId}. ${error.message}`);}
      finally{this.busy=false;}
    }));
    const pending=sessionStorage.getItem('qr-pending-operation');
    if(pending){this.form.hidden=true;const result=await apiClient.get(`${endpoint}/enrollments/${encodeURIComponent(pending)}`);this.message(result.data?.status==='completed'?'La inscripción anterior fue completada. Consulta el perfil desde la búsqueda.':`Hay una inscripción pendiente de revisión. No la repitas. Referencia: ${pending}`);if(result.data?.status==='completed'){sessionStorage.removeItem('qr-pending-operation');this.form.hidden=false;}}
  }
}
