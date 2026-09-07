/**
 * Schedule View
 * Vista de disponibilidad semanal por instructor para Secretaria.
 */

import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import ApiService from '../../core/api/apiService.js';
import InstructorAssignmentService from '../../services/instructorAssignmentService.js';
import { authService } from '../../core/auth/AuthService.js';

const DAYS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes'];
const NORMAL_PRACTICAL_SLOTS = [
  { start: '06:00', end: '07:40' },
  { start: '08:00', end: '09:40' },
  { start: '10:00', end: '11:40' },
  { start: '12:00', end: '13:40' },
  { start: '14:00', end: '15:40' },
  { start: '16:00', end: '17:40' },
  { start: '18:00', end: '19:40' },
  { start: '20:00', end: '21:40' },
];

class ScheduleView extends Component {
  async render() {
    this.canViewPerformance = authService.can('INSTRUCTOR_PERFORMANCE_VIEW');
    this.canGeneratePerformanceReport = authService.can('INSTRUCTOR_PERFORMANCE_REPORT');
    const params = new URLSearchParams(window.location.search);
    const studentId = params.get('student');
    this.scheduleVehicleType = this.scheduleVehicleType || 'carro';

    let instructors = [];
    let loadError = '';

    try {
      const result = await InstructorAssignmentService.getInstructors();
      instructors = result.success ? result.data : [];
    } catch (error) {
      loadError = error.data?.error?.message || error.message || 'No se pudieron cargar los instructores.';
    }
    this.scheduleInstructors = instructors;
    this.initializeScheduleGroupState(instructors);

    const content = `
      <div class="schedule-page">
        <div class="page-header">
          <div>
            <h1>Horarios de instructores</h1>
            <p>Consulta disponibilidad por instructor y horarios practicos normales</p>
          </div>
          <div class="schedule-header-actions">
            <div class="monthly-course-switch schedule-vehicle-switch" role="group" aria-label="Tipo de instructor">
              <button type="button" data-schedule-vehicle="carro" class="${this.scheduleVehicleType === 'carro' ? 'active' : ''}">Automóvil</button>
              <button type="button" data-schedule-vehicle="moto" class="${this.scheduleVehicleType === 'moto' ? 'active' : ''}">Moto</button>
            </div>
            <div id="schedule-group-actions">
              <button type="button" class="btn btn-secondary" id="edit-schedule-groups">Editar grupos</button>
            </div>
            <button type="button" class="btn btn-primary" id="view-monthly-availability">Ver disponibilidad mensual</button>
          </div>
        </div>

        ${loadError ? `<div class="alert alert-error"><div class="alert-content">${loadError}</div></div>` : ''}

        ${instructors.length ? `
          <div class="instructor-group-list" id="schedule-instructor-groups">
            ${this.renderInstructorGroups(instructors, this.scheduleVehicleType)}
          </div>
        ` : `
          <div class="card">
            <div class="card-body">
              <div class="schedule-empty">No hay instructores configurados para esta sucursal.</div>
            </div>
          </div>
        `}

        <div class="modal-overlay" id="instructor-calendar-modal" aria-hidden="true"></div>
      </div>
    `;

    const layout = await SidebarLayout.render(content);
    setTimeout(() => SidebarLayout.attachEventListeners(), 0);
    return layout;
  }

  renderInstructorGroups(instructors, vehicleType = 'carro') {
    const groups = new Map();
    const filteredInstructors = instructors
      .filter(instructor => instructor.practiceArea === vehicleType || instructor.practiceArea === 'mixto');
    const otherBranchPriorityInstructors = this.scheduleEditMode
      ? []
      : filteredInstructors.filter(instructor => instructor.isPriorityInOtherBranch);
    const regularInstructors = this.scheduleEditMode
      ? filteredInstructors
      : filteredInstructors.filter(instructor => !instructor.isPriorityInOtherBranch);

    regularInstructors.forEach(instructor => {
      const originalGroup = Array.isArray(instructor.groups) ? instructor.groups[0] : null;
      const instructorId = String(instructor.id);
      const assignedGroupId = this.scheduleWorkingAssignments.get(instructorId) ?? originalGroup?.id ?? null;
      const group = assignedGroupId ? this.scheduleGroupDefinitions.get(String(assignedGroupId)) || originalGroup : null;
      const key = assignedGroupId || 'unassigned';
      if (!groups.has(key)) {
        groups.set(key, { id: assignedGroupId, name: group?.name || 'Sin grupo', instructors: [] });
      }
      groups.get(key).instructors.push(instructor);
    });

    const getSortParts = name => {
      const match = String(name).match(/(\d+)/);
      return { number: match ? Number(match[1]) : Number.MAX_SAFE_INTEGER, text: String(name) };
    };

    const groupedMarkup = [...groups.values()]
      .sort((first, second) => {
        if (first.name === 'Sin grupo') return 1;
        if (second.name === 'Sin grupo') return -1;
        const firstParts = getSortParts(first.name);
        const secondParts = getSortParts(second.name);
        return firstParts.number - secondParts.number || firstParts.text.localeCompare(secondParts.text, 'es');
      })
      .map(group => `
        <section class="instructor-group" data-group-id="${group.id || ''}">
          <div class="instructor-group-header">
            <h2>${group.name}</h2>
            <span>${group.instructors.length} ${group.instructors.length === 1 ? 'instructor' : 'instructores'}</span>
          </div>
          <div class="instructor-card-grid" data-group-drop-zone>
            ${group.instructors.map(instructor => this.renderInstructorCard(instructor)).join('')}
          </div>
        </section>
        `).join('');

      const priorityMarkup = otherBranchPriorityInstructors.length ? `
        <section class="instructor-group instructor-group-priority" data-group-id="">
          <div class="instructor-group-header">
            <h2>Prioritarios en otra sucursal</h2>
            <span>${otherBranchPriorityInstructors.length} ${otherBranchPriorityInstructors.length === 1 ? 'instructor' : 'instructores'}</span>
          </div>
          <div class="instructor-card-grid" data-group-drop-zone>
            ${otherBranchPriorityInstructors.map(instructor => this.renderInstructorCard(instructor)).join('')}
          </div>
        </section>
      ` : '';

      return groupedMarkup + priorityMarkup
        || '<div class="card"><div class="card-body"><div class="schedule-empty">No hay instructores configurados para este tipo de vehículo.</div></div></div>';
  }

  renderInstructorCard(instructor) {
    const availableHours = Number.isFinite(Number(instructor.availableHours))
      ? `${Number(instructor.availableHours)} ${Number(instructor.availableHours) === 1 ? 'hora' : 'horas'}`
      : '0 horas';
    const specialty = this.normalizeCardText(instructor.specialty || 'Instructor practico');
    return `
      <button type="button" class="instructor-card ${this.scheduleEditMode ? 'instructor-card-editable' : ''}" draggable="${this.scheduleEditMode ? 'true' : 'false'}" data-instructor-id="${instructor.id}">
        <div class="instructor-card-avatar">${this.initials(instructor.name)}</div>
        <div class="instructor-card-body">
          <h3>${instructor.name}</h3>
          <p>${specialty}</p>
          <span class="badge badge-primary">${availableHours} disponibles</span>
          <small class="instructor-performance-hint">Ver horario semanal</small>
        </div>
      </button>
    `;
  }

  normalizeCardText(value) {
    return String(value)
      .replace(/Conducci\?n/g, 'Conducción')
      .replace(/Conduccion/g, 'Conducción');
  }

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  renderCalendar(calendar) {
    if (!calendar.course) {
      return `
        <div class="modal instructor-calendar-modal">
          <div class="modal-header">
            <div>
              <h3 class="modal-title">${calendar.instructor.name}</h3>
              <p class="card-subtitle">${calendar.instructor.branch || ''}</p>
            </div>
            <button class="modal-close" data-close-calendar-modal>&times;</button>
          </div>
          <div class="modal-body">
            <div class="schedule-empty">Este instructor no tiene un próximo curso normal asignado en esta sucursal.</div>
          </div>
        </div>
      `;
    }

    const calendarDays = (calendar.days || []).length
      ? calendar.days
      : DAYS.map(day => ({ day, date: null }));
    const slotsByDate = {};
    for (const slot of calendar.slots || []) {
      const key = slot.date || this.normalizeDay(slot.day);
      if (!slotsByDate[key]) slotsByDate[key] = [];
      slotsByDate[key].push(slot);
    }

    const workingDays = calendarDays.filter(day => {
      const key = day.date || this.normalizeDay(day.day);
      return (slotsByDate[key] || []).length;
    });
    const visibleSlots = [...new Map((calendar.slots || [])
      .filter(slot => slot.startTime && slot.endTime)
      .map(slot => [`${slot.startTime}-${slot.endTime}`, { start: slot.startTime, end: slot.endTime }]))]
      .map(([, slot]) => slot)
      .sort((first, second) => first.start.localeCompare(second.start));
    const courseLabel = calendar.course?.code
      ? `Curso ${calendar.course.code}`
      : 'Semana disponible';
    const availableCount = Number(calendar.availability?.availableSlots || 0);
    const availabilityKeys = new Set((calendar.availabilityOverrides || [])
      .filter(item => item.status !== 'reserved')
      .map(item => `${String(item.schedule_date).slice(0, 10)}:${item.start_time}:${item.end_time}`));
    const availabilityDraft = calendar.availabilityDraft || availabilityKeys;

    return `
      <div class="modal instructor-calendar-modal">
        <div class="modal-header">
          <div>
            <h3 class="modal-title">${calendar.instructor.name}</h3>
            <p class="card-subtitle">${calendar.instructor.branch || ''} · ${courseLabel} · ${calendar.week.startDate} a ${calendar.week.endDate}</p>
          </div>
          <div class="calendar-header-controls">
            <div class="calendar-cycle-navigation" aria-label="Navegar entre cursos">
              <button type="button" class="btn btn-secondary btn-small" data-calendar-cycle="${calendar.courseNavigation?.previousCycleId || ''}" ${calendar.courseNavigation?.previousCycleId ? '' : 'disabled'}>Anterior</button>
              <span>Curso ${calendar.courseNavigation?.position || 0} de ${calendar.courseNavigation?.total || 0}</span>
              <button type="button" class="btn btn-secondary btn-small" data-calendar-cycle="${calendar.courseNavigation?.nextCycleId || ''}" ${calendar.courseNavigation?.nextCycleId ? '' : 'disabled'}>Próximo</button>
            </div>
            <button class="modal-close" data-close-calendar-modal>&times;</button>
          </div>
        </div>
        <div class="modal-body">
          <div class="flex justify-between items-center mb-4">
            <div class="calendar-summary-actions">
              <div class="weekly-availability-legend">
                <span class="free">${availableCount} horas disponibles</span>
                <span class="occupied">${calendar.availability?.occupiedSlots || 0} ocupadas</span>
                <span class="reserved">Reservado</span>
              </div>
              <button type="button" class="btn btn-secondary btn-small" id="view-instructor-students">Ver estudiante</button>
            </div>
            <div class="calendar-course-actions">
              <span class="badge badge-primary">Prácticas normales · lunes a viernes</span>
              ${calendar.availabilityEditMode ? '' : '<button type="button" class="btn btn-secondary" id="configure-instructor-availability">Configurar disponibilidad</button>'}
            </div>
          </div>
          ${calendar.availabilityEditMode ? '<div class="schedule-availability-actions"><span class="schedule-edit-indicator">Editando disponibilidad del curso</span><button type="button" class="btn btn-primary" id="save-instructor-availability">Guardar</button><button type="button" class="btn btn-secondary" id="cancel-instructor-availability">Cancelar</button></div>' : ''}
          ${visibleSlots.length && workingDays.length ? `<div class="weekly-calendar" style="--calendar-day-count:${Math.max(workingDays.length, 1)}">
            <div class="calendar-time-column">
              <div class="calendar-heading">Hora</div>
              ${visibleSlots.map(slot => `<div class="calendar-time-cell">${slot.start} - ${slot.end}</div>`).join('')}
            </div>
            ${workingDays.map(day => {
              const key = day.date || this.normalizeDay(day.day);
              const dateLabel = day.date ? day.date.split('-').reverse().slice(0, 2).join('/') : '';
              return `
              <div class="calendar-day-column">
                <div class="calendar-heading">
                  <span>${this.normalizeDay(day.day)}</span>
                  ${dateLabel ? `<small class="calendar-heading-date">${dateLabel}</small>` : ''}
                </div>
                ${visibleSlots.map(({ start, end }) => (
                    this.renderSlot(
                    (slotsByDate[key] || []).find(slot => slot.startTime === start && slot.endTime === end),
                    day.day,
                    start,
                    end,
                    calendar,
                    availabilityDraft
                  )
                )).join('')}
              </div>
            `}).join('')}
          </div>` : '<div class="schedule-empty">El instructor está asignado al próximo curso, pero no tiene horas disponibles.</div>'}
        </div>
      </div>
    `;
  }

  renderSlot(slot, day, start, end, calendar = null, availabilityDraft = new Set()) {
    if (!slot) {
      return `
        <div class="calendar-slot unavailable">
          <span class="slot-status">No configurado</span>
        </div>
      `;
    }

    const availabilityKey = `${slot.date}|${slot.startTime}|${slot.endTime}`;
    const status = String(slot.status || '').toLowerCase();
    if (calendar?.availabilityEditMode) {
      if (status === 'reservado' || status === 'reserved') {
        return `<div class="calendar-slot reserved" aria-label="Reservado"><span class="slot-status">Reservado</span></div>`;
      }
      const blocked = availabilityDraft.has(availabilityKey);
      return `<button type="button" class="calendar-slot calendar-slot-editor ${blocked ? 'occupied' : 'free'}" data-inline-availability="${availabilityKey}" aria-pressed="${blocked}"><span class="slot-status">${blocked ? 'No disponible' : 'Disponible'}</span></button>`;
    }

    if (status === 'ocupado' || status === 'occupied') {
      return `
        <div class="calendar-slot occupied" aria-label="Ocupado">
          <span class="slot-status">Ocupado</span>
        </div>
      `;
    }

    if (status === 'reservado' || status === 'reserved') {
      return `
        <div class="calendar-slot reserved" aria-label="Reservado">
          <span class="slot-status">Reservado</span>
        </div>
      `;
    }

    return `
      <div class="calendar-slot free">
        <span class="slot-status">Disponible</span>
      </div>
    `;
  }

  normalizeDay(day) {
    const value = String(day || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  }

  initials(name) {
    return String(name || 'IN')
      .split(' ')
      .map(part => part.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  async mount() {
    document.getElementById('view-monthly-availability')?.addEventListener('click', () => this.openMonthlyAvailability());
    document.querySelectorAll('[data-schedule-vehicle]').forEach(button => {
      button.addEventListener('click', () => this.setScheduleVehicleType(button.dataset.scheduleVehicle));
    });
    this.bindScheduleInteractions();
    this.updateScheduleGroupActions();
  }

  initializeScheduleGroupState(instructors) {
    this.scheduleGroupDefinitions = new Map();
    this.scheduleOriginalAssignments = new Map();
    this.scheduleWorkingAssignments = new Map();
    instructors.forEach(instructor => {
      (instructor.groups || []).forEach(group => {
        if (group?.id) this.scheduleGroupDefinitions.set(String(group.id), group);
      });
      const group = instructor.groups?.[0];
      this.scheduleOriginalAssignments.set(String(instructor.id), group?.id || null);
      this.scheduleWorkingAssignments.set(String(instructor.id), group?.id || null);
    });
  }

  updateScheduleGroupActions(status = '', isError = false) {
    const actions = document.getElementById('schedule-group-actions');
    if (!actions) return;
    actions.innerHTML = this.scheduleEditMode ? `
      <span class="schedule-edit-indicator">Modo edición de grupos</span>
      <button type="button" class="btn btn-primary" id="save-schedule-groups">Guardar cambios</button>
      <button type="button" class="btn btn-secondary" id="cancel-schedule-groups">Cancelar</button>
    ` : `
      ${status ? `<span class="schedule-group-status ${isError ? 'error' : ''}">${status}</span>` : ''}
      <button type="button" class="btn btn-secondary" id="edit-schedule-groups">Editar grupos</button>
    `;
    actions.querySelector('#edit-schedule-groups')?.addEventListener('click', () => this.enterScheduleEditMode());
    actions.querySelector('#save-schedule-groups')?.addEventListener('click', () => this.saveScheduleGroupChanges());
    actions.querySelector('#cancel-schedule-groups')?.addEventListener('click', () => this.cancelScheduleEditMode());
  }

  enterScheduleEditMode() {
    this.scheduleEditMode = true;
    this.updateScheduleGroupActions();
    this.refreshScheduleGroups();
  }

  cancelScheduleEditMode() {
    this.scheduleWorkingAssignments = new Map(this.scheduleOriginalAssignments);
    this.scheduleEditMode = false;
    this.updateScheduleGroupActions('Cambios cancelados');
    this.refreshScheduleGroups();
  }

  getScheduleChanges() {
    return [...this.scheduleWorkingAssignments.entries()]
      .filter(([instructorId, groupId]) => groupId !== this.scheduleOriginalAssignments.get(instructorId))
      .map(([instructorId, groupId]) => ({ instructorId, groupId }));
  }

  async saveScheduleGroupChanges() {
    const changes = this.getScheduleChanges();
    if (!changes.length) {
      this.updateScheduleGroupActions('No existen cambios para guardar');
      return;
    }
    const button = document.getElementById('save-schedule-groups');
    if (button) button.disabled = true;
    try {
      await ApiService.updateInstructorGroupAssignments(changes);
      this.scheduleWorkingAssignments = new Map(this.scheduleOriginalAssignments);
      this.scheduleEditMode = false;
      this.updateScheduleGroupActions('Cambios programados para el siguiente curso');
      this.refreshScheduleGroups();
    } catch (error) {
      this.updateScheduleGroupActions(error.data?.error?.message || error.message || 'No se pudieron guardar los cambios. Inténtalo nuevamente.', true);
    }
  }

  refreshScheduleGroups() {
    const groups = document.getElementById('schedule-instructor-groups');
    if (!groups) return;
    groups.innerHTML = this.renderInstructorGroups(this.scheduleInstructors, this.scheduleVehicleType);
    this.bindScheduleInteractions();
  }

  bindScheduleInteractions() {
    document.querySelectorAll('.instructor-card').forEach(card => {
      card.addEventListener('click', () => {
        if (this.scheduleEditMode || this.scheduleDraggingInstructorId || this.scheduleSuppressCardClick) return;
        this.openInstructorCalendar(card.dataset.instructorId);
      });
      if (!this.scheduleEditMode) return;
      card.addEventListener('dragstart', event => {
        this.scheduleDraggingInstructorId = String(card.dataset.instructorId);
        this.scheduleSuppressCardClick = true;
        card.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', this.scheduleDraggingInstructorId);
      });
      card.addEventListener('dragend', () => {
        this.scheduleDraggingInstructorId = null;
        card.classList.remove('is-dragging');
        document.querySelectorAll('[data-group-drop-zone]').forEach(zone => zone.classList.remove('is-drop-target'));
        window.setTimeout(() => { this.scheduleSuppressCardClick = false; }, 0);
      });
    });
    if (!this.scheduleEditMode) return;
    document.querySelectorAll('[data-group-drop-zone]').forEach(zone => {
      zone.addEventListener('dragover', event => {
        event.preventDefault();
        zone.classList.add('is-drop-target');
        event.dataTransfer.dropEffect = 'move';
      });
      zone.addEventListener('dragleave', event => {
        if (!zone.contains(event.relatedTarget)) zone.classList.remove('is-drop-target');
      });
      zone.addEventListener('drop', event => {
        event.preventDefault();
        const instructorId = event.dataTransfer.getData('text/plain') || this.scheduleDraggingInstructorId;
        const groupId = zone.closest('[data-group-id]')?.dataset.groupId || null;
        if (instructorId) this.moveInstructorToGroup(instructorId, groupId);
      });
    });
  }

  moveInstructorToGroup(instructorId, groupId) {
    this.scheduleWorkingAssignments.set(String(instructorId), groupId || null);
    this.refreshScheduleGroups();
  }

  setScheduleVehicleType(vehicleType) {
    if (!['carro', 'moto'].includes(vehicleType) || vehicleType === this.scheduleVehicleType) return;
    this.scheduleVehicleType = vehicleType;
    document.querySelectorAll('[data-schedule-vehicle]').forEach(button => {
      button.classList.toggle('active', button.dataset.scheduleVehicle === vehicleType);
    });
    this.refreshScheduleGroups();
  }

  renderMonthlyAvailability(calendar) {
    const first=new Date(`${calendar.month}-01T00:00:00`),leading=(first.getDay()+6)%7;
    const cells=Array(leading).fill(null).concat(calendar.days||[]);while(cells.length%7)cells.push(null);
    const title=first.toLocaleDateString('es-EC',{month:'long',year:'numeric'}),today=new Date().toISOString().slice(0,10);
    return `<div class="modal monthly-availability-modal"><div class="modal-header"><div><h3 class="modal-title">Disponibilidad mensual</h3><p class="card-subtitle">${calendar.branch} · Agenda disponible con 3 días de anticipación</p></div><button class="modal-close" data-close-calendar-modal>&times;</button></div><div class="modal-body"><div class="monthly-availability-toolbar"><button class="btn btn-secondary" data-month-step="-1">← Anterior</button><strong>${title}</strong><button class="btn btn-secondary" data-month-step="1">Siguiente →</button></div><div class="monthly-availability-legend"><span class="available">Disponible</span><span class="partial">Pocos bloques</span><span class="full">Completo</span><span class="blocked">No agendable</span></div><div class="monthly-calendar">${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(day=>`<div class="monthly-weekday">${day}</div>`).join('')}${cells.map(day=>{if(!day)return'<div class="monthly-day empty"></div>';const locked=day.date<calendar.minimumBookingDate,ratio=day.total?day.available/day.total:0,state=locked||!day.total?'blocked':day.available===0?'full':ratio<=.25?'partial':'available';const label=locked?(day.date<today?'Fecha pasada':'Espera de 3 días'):!day.total?'Sin atención':day.available===0?'Completo':`${day.available} bloques libres`;return`<div class="monthly-day ${state}"><time>${Number(day.date.slice(-2))}</time><strong>${label}</strong>${day.total?`<small>${day.busy}/${day.total} ocupados</small>`:''}</div>`;}).join('')}</div></div></div>`;
  }

  renderMonthlyAvailability(calendar) {
    const vehicleType=this.monthlyVehicleType||'carro';
    const modality=this.monthlyModality||'normal';
    const filteredDays=(calendar.days||[]).map(day=>this.filterMonthlyDay(day,vehicleType));
    const allowedDay=date=>modality==='intensivo'?[0,6].includes(date.getDay()):![0,6].includes(date.getDay());
    const start=new Date(`${this.monthlySelectedDate||calendar.minimumBookingDate}T00:00:00`);while(!allowedDay(start))start.setDate(start.getDate()+1);const startDate=start.toISOString().slice(0,10);this.monthlySelectedDate=startDate;
    const visibleDays=[],cursor=new Date(start);while(visibleDays.length<5){if(allowedDay(cursor)){const key=cursor.toISOString().slice(0,10);visibleDays.push(filteredDays.find(item=>item.date===key)||{date:key,groups:[],total:0,busy:0,available:0});}cursor.setDate(cursor.getDate()+1);}
    const dayLabel=day=>new Date(`${day.date}T00:00:00`).toLocaleDateString('es-EC',{weekday:'short',day:'numeric',month:'short'});
    const lastVisibleDay=visibleDays[visibleDays.length-1];
    const rangeTitle=`${new Date(`${visibleDays[0].date}T00:00:00`).toLocaleDateString('es-EC',{day:'numeric',month:'long'})} – ${new Date(`${lastVisibleDay.date}T00:00:00`).toLocaleDateString('es-EC',{day:'numeric',month:'long',year:'numeric'})}`;
    const statusCell=(day,start,end)=>{const configured=(day.groups||[]).map(instructor=>{const slot=(instructor.slots||[]).find(item=>item.startTime===start&&item.endTime===end);return slot?{instructor,slot}:null;}).filter(Boolean),reserved=configured.filter(item=>item.slot.status==='reserved'||item.slot.status==='reservado').length,available=configured.filter(item=>item.slot.status==='available'||!item.slot.busy).length,total=configured.length,details=configured.map(({instructor,slot})=>({name:instructor.name,status:slot.status==='available'||!slot.busy?'Disponible':slot.student||((slot.status==='reserved'||slot.status==='reservado')?'Reservado':'Ocupado')}));if(!total)return{state:'unavailable',label:'Sin atención',details};if(available)return{state:'free',label:`${available}/${total} disponible${available===1?'':'s'}`,details};if(reserved)return{state:'reserved',label:'Reservado',details};return{state:'occupied',label:'Ocupado',details};};
    const displayedSlots=modality==='normal'?NORMAL_PRACTICAL_SLOTS:[...new Map(visibleDays.flatMap(day=>(day.groups||[]).flatMap(instructor=>(instructor.slots||[]).map(slot=>[`${slot.startTime}-${slot.endTime}`,{start:slot.startTime,end:slot.endTime}])))).values()].sort((a,b)=>a.start.localeCompare(b.start));
    const table=`<div class="rolling-week-table"><div class="day-table-heading">Hora</div>${visibleDays.map(day=>`<div class="day-table-heading">${dayLabel(day)}</div>`).join('')}${displayedSlots.map(({start,end})=>`<div class="day-table-time">${start} – ${end}</div>${visibleDays.map(day=>{const status=statusCell(day,start,end);return`<div class="day-table-cell ${status.state}"><span class="slot-status rolling-slot-capacity">${status.label}</span>${status.details.length?`<small class="rolling-slot-instructors">${status.details.map(item=>`<span><strong>${this.escapeHtml(item.name)}</strong>: ${this.escapeHtml(item.status)}</span>`).join('')}</small>`:''}</div>`;}).join('')}`).join('')}</div>`;
    const canGoBack=startDate>calendar.minimumBookingDate;
    return `<div class="modal monthly-availability-modal rolling-week-modal"><div class="modal-header"><div><h3 class="modal-title">Disponibilidad de horarios</h3><p class="card-subtitle">${calendar.branch} · ${modality==='intensivo'?'Sábados y domingos':'Lunes a viernes'}</p></div><button class="modal-close" data-close-calendar-modal>&times;</button></div><div class="modal-body"><div class="monthly-availability-toolbar"><button class="btn btn-secondary" data-day-step="-1" ${canGoBack?'':'disabled'}>← Anterior</button><strong>${rangeTitle}</strong><div class="monthly-toolbar-next"><button class="btn btn-secondary" data-day-step="1">Siguiente →</button></div></div><div class="monthly-filter-row schedule-filter-row"><div class="weekly-availability-legend"><span class="free">Disponible</span><span class="occupied">Ocupado</span><span class="reserved">Reservado</span></div><div class="schedule-switches"><div class="monthly-course-switch" role="group" aria-label="Modalidad"><button type="button" data-monthly-modality="normal" class="${modality==='normal'?'active':''}">Normal</button><button type="button" data-monthly-modality="intensivo" class="${modality==='intensivo'?'active':''}">Intensivo</button></div><div class="monthly-course-switch" role="group" aria-label="Tipo de curso"><button type="button" data-monthly-vehicle="carro" class="${vehicleType==='carro'?'active':''}">Automóvil</button><button type="button" data-monthly-vehicle="moto" class="${vehicleType==='moto'?'active':''}">Moto</button></div></div></div>${table}</div></div>`;
  }

  filterMonthlyDay(day,vehicleType) {
    const groups=(day.groups||[]).filter(item=>item.vehicleType===vehicleType||item.vehicleType==='mixto');
    return {...day,groups,total:groups.length,busy:groups.filter(item=>item.busy).length,available:groups.filter(item=>!item.busy).length};
  }

  async openMonthlyAvailability(month=new Date().toISOString().slice(0,7),selectedDate=null) {
    const modal=document.getElementById('instructor-calendar-modal');if(!modal)return;
    if(selectedDate)this.monthlySelectedDate=selectedDate;
    modal.innerHTML='<div class="modal monthly-availability-modal"><div class="modal-body"><div class="schedule-empty">Calculando disponibilidad del mes...</div></div></div>';modal.classList.add('active');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
    try{const modality=this.monthlyModality||'normal',vehicleType=this.monthlyVehicleType||'carro',result=await ApiService.getMonthlyInstructorAvailability(month,modality,vehicleType);if(!result.success)throw new Error(result.error||'No se pudo consultar la disponibilidad.');const start=this.monthlySelectedDate||result.data.minimumBookingDate,end=new Date(`${start}T00:00:00`);end.setDate(end.getDate()+(modality==='intensivo'?20:8));const endMonth=end.toISOString().slice(0,7);if(endMonth!==month){const extra=await ApiService.getMonthlyInstructorAvailability(endMonth,modality,vehicleType);if(extra.success)result.data.days=[...(result.data.days||[]),...(extra.data.days||[])];}modal.innerHTML=this.renderMonthlyAvailability(result.data);this.bindModalClose(modal);modal.querySelectorAll('[data-day-step]').forEach(button=>button.onclick=()=>{const date=new Date(`${this.monthlySelectedDate}T00:00:00`),step=Number(button.dataset.dayStep),allowed=day=>modality==='intensivo'?[0,6].includes(day.getDay()):![0,6].includes(day.getDay());do date.setDate(date.getDate()+step);while(!allowed(date));const target=date.toISOString().slice(0,10);if(step<0&&target<result.data.minimumBookingDate)return;this.openMonthlyAvailability(target.slice(0,7),target);});modal.querySelectorAll('[data-monthly-vehicle]').forEach(button=>button.onclick=()=>{this.monthlyVehicleType=button.dataset.monthlyVehicle;this.openMonthlyAvailability(this.monthlySelectedDate.slice(0,7),this.monthlySelectedDate);});modal.querySelectorAll('[data-monthly-modality]').forEach(button=>button.onclick=()=>{this.monthlyModality=button.dataset.monthlyModality;this.monthlySelectedDate=result.data.minimumBookingDate;this.openMonthlyAvailability(this.monthlySelectedDate.slice(0,7),this.monthlySelectedDate);});}catch(error){modal.innerHTML=`<div class="modal monthly-availability-modal"><div class="modal-header"><h3 class="modal-title">Disponibilidad de horarios</h3><button class="modal-close" data-close-calendar-modal>&times;</button></div><div class="modal-body"><div class="alert alert-error"><div class="alert-content">${error.data?.error?.message||error.message}</div></div></div></div>`;this.bindModalClose(modal);}
  }

  renderDayAvailability(calendar, day) {
    const dateLabel=new Date(`${day.date}T00:00:00`).toLocaleDateString('es-EC',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    const instructors=day.groups||[],courseLabel=(this.monthlyVehicleType||'carro')==='moto'?'Moto':'Automóvil';
    const ranges=[...new Set(instructors.flatMap(instructor=>(instructor.slots||[]).map(slot=>`${slot.startTime}|${slot.endTime}`)))].sort();
    const table=instructors.length&&ranges.length?`<div class="day-availability-table"><div class="day-table-heading">Hora</div><div class="day-table-heading">${dateLabel}</div>${ranges.map(range=>{const[startTime,endTime]=range.split('|'),configured=instructors.map(instructor=>(instructor.slots||[]).find(item=>item.startTime===startTime&&item.endTime===endTime)).filter(Boolean),reserved=configured.filter(slot=>slot.status==='reserved'||slot.status==='reservado').length,available=configured.filter(slot=>slot.status==='available'||!slot.busy).length,total=configured.length,state=!total?'unavailable':available?'free':reserved?'reserved':'occupied',label=!total?'No configurado':available?`${available} de ${total} cupo${total===1?'':'s'} disponible${available===1?'':'s'}`:reserved?'Reservado':'Ocupado';return`<div class="day-table-time">${startTime} – ${endTime}</div><div class="day-table-cell ${state}"><span class="slot-status day-slot-capacity">${label}</span></div>`;}).join('')}</div>`:'<div class="schedule-empty">No hay horas configuradas para este día.</div>';
    return `<div class="modal day-availability-modal"><div class="modal-header"><div><h3 class="modal-title">Disponibilidad por hora</h3><p class="card-subtitle">${dateLabel} · ${calendar.branch}</p></div><button class="modal-close" data-close-calendar-modal>&times;</button></div><div class="modal-body"><div class="day-availability-toolbar"><div class="weekly-availability-legend"><span class="free">Disponible</span><span class="busy">Reservado</span></div><span class="badge badge-primary">${courseLabel}</span></div>${table}</div><div class="modal-footer"><button class="btn btn-secondary" data-back-month>Volver al mes</button></div></div>`;
  }

  openDayAvailability(calendar, day) {
    const modal=document.getElementById('instructor-calendar-modal');modal.innerHTML=this.renderDayAvailability(calendar,day);this.bindModalClose(modal);modal.querySelector('[data-back-month]')?.addEventListener('click',()=>this.openMonthlyAvailability(calendar.month));
  }

  renderPerformance(report) {
    const totals = report.totals || {};
    return `
      <div class="modal instructor-performance-modal">
        <div class="modal-header">
          <div>
            <h3 class="modal-title">Rendimiento de ${report.instructor.name}</h3>
            <p class="card-subtitle">${report.instructor.branch || ''} · Reporte mensual por curso</p>
          </div>
          <button class="modal-close" data-close-calendar-modal>&times;</button>
        </div>
        <div class="modal-body">
          <div class="performance-toolbar">
            <label>Mes<input class="form-input" type="month" id="instructor-performance-month" value="${report.month}"></label>
            ${this.canGeneratePerformanceReport ? '<button class="btn btn-primary" type="button" id="generate-instructor-report">Generar reporte mensual</button>' : ''}
            <button class="btn btn-secondary" type="button" id="view-instructor-calendar">Ver horario semanal</button>
          </div>
          <div class="performance-summary">
            <div><strong>${totals.courses || 0}</strong><span>Cursos impartidos</span></div>
            <div><strong>${totals.assignedStudents || 0}</strong><span>Estudiantes asignados</span></div>
            <div><strong>${totals.attendedStudents || 0}</strong><span>Estudiantes que asistieron</span></div>
            <div><strong>${totals.attendanceCount || 0}</strong><span>Asistencias registradas</span></div>
          </div>
          <div class="performance-cycle-list">
            ${report.cycles?.length ? report.cycles.map(cycle => `
              <article class="performance-cycle-card">
                <div class="performance-cycle-heading">
                  <div><h4>${cycle.course_name}</h4><p>Curso iniciado el ${cycle.start_date ? new Date(cycle.start_date).toLocaleDateString('es-EC') : '—'} · ${cycle.modality || 'normal'}</p></div>
                  <span class="badge badge-primary">${cycle.start_date ? new Date(cycle.start_date).toLocaleDateString('es-EC') : '—'} al ${cycle.end_date ? new Date(cycle.end_date).toLocaleDateString('es-EC') : '—'}</span>
                </div>
                <div class="performance-cycle-metrics">
                  <div><strong>${cycle.assigned_students || 0}</strong><span>Asignados</span></div>
                  <div><strong>${cycle.attended_students || 0}</strong><span>Asistieron</span></div>
                  <div><strong>${cycle.attendance_count || 0}</strong><span>Asistencias</span></div>
                  <div><strong>${cycle.scheduled_sessions || 0}</strong><span>Clases registradas</span></div>
                </div>
              </article>
            `).join('') : '<div class="schedule-empty">Este instructor no tiene actividad registrada en el mes seleccionado.</div>'}
          </div>
        </div>
      </div>
    `;
  }

  async openInstructorPerformance(instructorId, month = new Date().toISOString().slice(0, 7)) {
    const modal = document.getElementById('instructor-calendar-modal');
    if (!modal || !instructorId) return;
    modal.innerHTML = '<div class="modal instructor-performance-modal"><div class="modal-body"><div class="schedule-empty">Calculando rendimiento mensual...</div></div></div>';
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    try {
      const result = await ApiService.getInstructorPerformance(instructorId, month);
      if (!result.success) throw new Error(result.error || 'No se pudo cargar el rendimiento.');
      modal.innerHTML = this.renderPerformance(result.data);
      this.bindModalClose(modal);
      modal.querySelector('#instructor-performance-month')?.addEventListener('change', event => {
        this.openInstructorPerformance(instructorId, event.target.value);
      });
      modal.querySelector('#view-instructor-calendar')?.addEventListener('click', () => this.openInstructorCalendar(instructorId));
      modal.querySelector('#generate-instructor-report')?.addEventListener('click', () => this.openPerformanceReport(instructorId, result.data.month));
    } catch (error) {
      modal.innerHTML = `<div class="modal instructor-performance-modal"><div class="modal-header"><h3 class="modal-title">Rendimiento mensual</h3><button class="modal-close" data-close-calendar-modal>&times;</button></div><div class="modal-body"><div class="alert alert-error"><div class="alert-content">${error.data?.error?.message || error.message || 'No se pudo cargar el reporte.'}</div></div></div></div>`;
      this.bindModalClose(modal);
    }
  }

  renderPerformanceReport(report) {
    const totals = report.reportTotals || {};
    const formatDate = value => new Date(value).toLocaleDateString('es-EC');
    const formatTime = value => new Date(value).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="modal instructor-performance-modal performance-report-modal">
        <div class="modal-header"><div><h3 class="modal-title">Reporte mensual de ${report.instructor.name}</h3><p class="card-subtitle">${report.instructor.branch || ''} · ${report.month}</p></div><button class="modal-close" data-close-calendar-modal>&times;</button></div>
        <div class="modal-body">
          <div class="performance-toolbar">
            <button class="btn btn-secondary" id="back-to-performance">Volver al rendimiento</button>
            <div class="performance-report-actions"><button class="btn btn-secondary" id="print-instructor-report">Imprimir</button><button class="btn btn-primary" id="export-instructor-report">Exportar Excel</button></div>
          </div>
          <div class="performance-summary">
            <div><strong>${totals.attendedStudents || 0}</strong><span>Estudiantes atendidos</span></div>
            <div><strong>${totals.completedClasses || 0}</strong><span>Clases finalizadas</span></div>
            <div><strong>${totals.autoHours || 0}</strong><span>Horas automóvil</span></div>
            <div><strong>${totals.motoHours || 0}</strong><span>Horas motocicleta</span></div>
          </div>
          <div class="performance-course-report-list">
            ${report.courseGroups?.length ? report.courseGroups.map(cycle => `
              <section class="performance-course-report">
                <div class="performance-cycle-heading"><div><h4>${cycle.courseName}</h4><p>${cycle.courseType} · Pertenece al mes en que inició</p></div><span class="performance-course-period">Inició ${cycle.startDate ? formatDate(cycle.startDate) : '—'} · finalizó ${cycle.endDate ? formatDate(cycle.endDate) : '—'}</span></div>
                <div class="performance-report-table-wrap"><table class="performance-report-table"><thead><tr><th>Día</th><th>Fecha</th><th>Estudiante</th><th>Inicio</th><th>Fin</th><th>Horas impartidas</th></tr></thead><tbody>
                  ${cycle.sessions.map(session => { const date = new Date(session.actual_start); return `<tr><td>${date.toLocaleDateString('es-EC', { weekday: 'long' })}</td><td>${formatDate(session.actual_start)}</td><td>${session.student_name}</td><td>${formatTime(session.actual_start)}</td><td>${formatTime(session.actual_end)}</td><td>${session.taught_hours}</td></tr>`; }).join('')}
                </tbody></table></div>
              </section>`).join('') : '<div class="schedule-empty">No existen clases iniciadas y finalizadas en este mes.</div>'}
          </div>
          <div class="performance-report-grand-total"><strong>Total mensual</strong><span>${totals.taughtHours || 0} horas impartidas</span></div>
        </div>
      </div>`;
  }

  async openPerformanceReport(instructorId, month) {
    const modal = document.getElementById('instructor-calendar-modal');
    modal.innerHTML = '<div class="modal instructor-performance-modal"><div class="modal-body"><div class="schedule-empty">Generando reporte mensual...</div></div></div>';
    try {
      const result = await ApiService.getInstructorPerformanceReport(instructorId, month);
      modal.innerHTML = this.renderPerformanceReport(result.data);
      this.bindModalClose(modal);
      modal.querySelector('#back-to-performance')?.addEventListener('click', () => this.openInstructorPerformance(instructorId, month));
      modal.querySelector('#print-instructor-report')?.addEventListener('click', () => this.printPerformanceReport(modal.querySelector('.performance-report-modal')));
      modal.querySelector('#export-instructor-report')?.addEventListener('click', async event => {
        event.currentTarget.disabled = true;
        try {
          const file = await ApiService.exportInstructorPerformanceReport(instructorId, month);
          const url = URL.createObjectURL(file.blob); const link = document.createElement('a');
          link.href = url; link.download = file.filename; document.body.appendChild(link); link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
          window.alert(error.data?.error?.message || error.message || 'No se pudo exportar el archivo Excel.');
        } finally { event.currentTarget.disabled = false; }
      });
    } catch (error) {
      modal.innerHTML = `<div class="modal instructor-performance-modal"><div class="modal-header"><h3 class="modal-title">Reporte mensual</h3><button class="modal-close" data-close-calendar-modal>&times;</button></div><div class="modal-body"><div class="alert alert-error"><div class="alert-content">${error.data?.error?.message || error.message}</div></div></div></div>`;
      this.bindModalClose(modal);
    }
  }

  printPerformanceReport(element) {
    const popup = window.open('', '_blank', 'width=1100,height=800');
    if (!popup) return;
    popup.document.write(`<!doctype html><html><head><title>Reporte mensual</title><style>body{font-family:Arial;padding:24px;color:#111}button,.modal-close,.performance-toolbar{display:none}.performance-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}.performance-summary div{border:1px solid #ddd;padding:12px}.performance-summary strong,.performance-summary span{display:block}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #bbb;padding:7px;text-align:left}th{background:#eee}</style></head><body>${element.innerHTML}</body></html>`);
    popup.document.close(); popup.focus(); popup.print();
  }

  async openInstructorCalendar(instructorId, cycleId = null) {
    const modal = document.getElementById('instructor-calendar-modal');
    if (!modal || !instructorId) return;

    modal.innerHTML = `
      <div class="modal instructor-calendar-modal">
        <div class="modal-body">
          <div class="schedule-empty">Cargando calendario del instructor...</div>
        </div>
      </div>
    `;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    try {
      const result = await ApiService.getInstructorCalendar(instructorId, cycleId);
      if (!result.success) throw new Error(result.error || 'No se pudo cargar el calendario.');
      const calendar = result.data;
      const startDate = calendar.week?.startDate || calendar.slots?.[0]?.date;
      const endDate = calendar.week?.endDate || calendar.slots?.at(-1)?.date;
      const overridesResult = startDate && endDate
        ? await ApiService.getInstructorAvailabilityOverrides(instructorId, startDate, endDate)
        : { success: true, data: [] };
      calendar.availabilityOverrides = overridesResult.success ? overridesResult.data : [];
      modal.innerHTML = this.renderCalendar(calendar);
      this.bindModalClose(modal);
      this.bindCalendarAvailabilityEditor(modal, calendar);
    } catch (error) {
      modal.innerHTML = `
        <div class="modal instructor-calendar-modal">
          <div class="modal-header">
            <h3 class="modal-title">Calendario del instructor</h3>
            <button class="modal-close" data-close-calendar-modal>&times;</button>
          </div>
          <div class="modal-body">
            <div class="alert alert-error"><div class="alert-content">${error.data?.error?.message || error.message || 'No se pudo cargar el calendario.'}</div></div>
          </div>
        </div>
      `;
      this.bindModalClose(modal);
    }
  }

  bindCalendarAvailabilityEditor(modal, calendar) {
    modal.querySelectorAll('[data-calendar-cycle]').forEach(button => button.addEventListener('click', () => {
      const cycleId = button.dataset.calendarCycle;
      if (cycleId) this.openInstructorCalendar(calendar.instructor.id, cycleId);
    }));
    modal.querySelector('#view-instructor-students')?.addEventListener('click', () => {
      this.openInstructorStudentsModal(calendar);
    });
    modal.querySelector('#configure-instructor-availability')?.addEventListener('click', () => {
      calendar.availabilityEditMode = true;
      calendar.availabilityDraft = new Set((calendar.availabilityOverrides || [])
        .filter(item => item.status !== 'reserved')
        .map(item => `${String(item.schedule_date).slice(0, 10)}|${item.start_time}|${item.end_time}`));
      modal.innerHTML = this.renderCalendar(calendar);
      this.bindModalClose(modal);
      this.bindCalendarAvailabilityEditor(modal, calendar);
    });
    modal.querySelectorAll('[data-inline-availability]').forEach(slot => slot.addEventListener('click', () => {
      const key = slot.dataset.inlineAvailability;
      if (calendar.availabilityDraft.has(key)) calendar.availabilityDraft.delete(key);
      else calendar.availabilityDraft.add(key);
      slot.classList.toggle('occupied', calendar.availabilityDraft.has(key));
      slot.classList.toggle('free', !calendar.availabilityDraft.has(key));
      slot.querySelector('.slot-status').textContent = calendar.availabilityDraft.has(key) ? 'No disponible' : 'Disponible';
      slot.setAttribute('aria-pressed', calendar.availabilityDraft.has(key));
    }));
    modal.querySelector('#cancel-instructor-availability')?.addEventListener('click', () => {
      calendar.availabilityEditMode = false;
      delete calendar.availabilityDraft;
      modal.innerHTML = this.renderCalendar(calendar);
      this.bindModalClose(modal);
      this.bindCalendarAvailabilityEditor(modal, calendar);
    });
    modal.querySelector('#save-instructor-availability')?.addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      const overrides = [...calendar.availabilityDraft].map(key => {
        const [date, startTime, endTime] = key.split('|');
        return { date, startTime, endTime, status: 'blocked' };
      });
      try {
        await ApiService.saveInstructorAvailabilityOverrides(calendar.instructor.id, overrides, calendar.week.startDate, calendar.week.endDate);
        this.openInstructorCalendar(calendar.instructor.id, calendar.course?.id);
      } catch (error) {
        event.currentTarget.disabled = false;
        window.alert(error.data?.error?.message || error.message || 'No se pudo actualizar la disponibilidad.');
      }
    });
  }

  renderInstructorStudentsModal(calendar) {
    const students = calendar.students || [];
    const matriculated = students.filter(student => student.status === 'matriculado').length;
    const reserved = students.filter(student => student.status === 'reservado').length;
    return `
      <div class="modal instructor-students-modal" role="dialog" aria-modal="true" aria-label="Estudiantes de ${this.escapeHtml(calendar.instructor.name)}">
        <div class="modal-header">
          <div>
            <h3 class="modal-title">Estudiantes de ${this.escapeHtml(calendar.instructor.name)}</h3>
            <p class="card-subtitle">${this.escapeHtml(calendar.course?.code || '')} · ${students.length} registro${students.length === 1 ? '' : 's'}</p>
          </div>
          <button type="button" class="modal-close" data-close-instructor-students>&times;</button>
        </div>
        <div class="modal-body">
          <div class="instructor-students-summary">
            <span class="matriculated">${matriculated} matriculado${matriculated === 1 ? '' : 's'}</span>
            <span class="reserved">${reserved} reservado${reserved === 1 ? '' : 's'}</span>
          </div>
          ${students.length ? `
            <div class="instructor-students-list">
              ${students.map(student => `
                <article class="instructor-student-row">
                  <div class="instructor-student-avatar">${this.escapeHtml(this.initials(student.name))}</div>
                  <div class="instructor-student-person">
                    <strong>${this.escapeHtml(student.name)}</strong>
                    <span>${student.identification ? `Cédula: ${this.escapeHtml(student.identification)}` : 'Cédula pendiente'}${student.phone ? ` · ${this.escapeHtml(student.phone)}` : ''}</span>
                    <small>${student.start_time ? `${this.escapeHtml(student.start_time)}–${this.escapeHtml(student.end_time)}` : 'Horario pendiente'}</small>
                  </div>
                  <span class="instructor-student-status ${student.status}">${student.status === 'reservado' ? 'Reservado' : 'Matriculado'}</span>
                </article>
              `).join('')}
            </div>
          ` : '<div class="schedule-empty">Este instructor todavía no tiene estudiantes ni reservas en el curso.</div>'}
        </div>
      </div>
    `;
  }

  openInstructorStudentsModal(calendar) {
    document.getElementById('instructor-students-modal')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'instructor-students-modal';
    overlay.className = 'modal-overlay modal-overlay-secondary active instructor-students-overlay';
    overlay.innerHTML = this.renderInstructorStudentsModal(calendar);
    const close = () => {
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
    };
    const onKeyDown = event => {
      if (event.key === 'Escape') close();
    };
    overlay.querySelectorAll('[data-close-instructor-students]').forEach(button => button.addEventListener('click', close));
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
    });
    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);
  }

  renderAvailabilityConfiguration(calendar, overrides = []) {
    const overrideKeys = new Set(overrides.map(item => `${String(item.schedule_date).slice(0, 10)}:${item.start_time}:${item.end_time}`));
    const slotsByDate = {};
    (calendar.slots || []).forEach(slot => {
      const key = `${slot.date}:${slot.startTime}:${slot.endTime}`;
      if (!slotsByDate[slot.date]) slotsByDate[slot.date] = [];
      slotsByDate[slot.date].push({ ...slot, overrideKey: key });
    });
    const dates = Object.keys(slotsByDate).sort();
    return `<div class="modal availability-config-modal"><div class="modal-header"><div><h3 class="modal-title">Configurar disponibilidad</h3><p class="card-subtitle">${calendar.instructor.name} · Marca los bloques que no deben recibir estudiantes</p></div><button class="modal-close" data-close-availability-config>&times;</button></div><div class="modal-body"><div class="availability-config-help">Los bloques ocupados por estudiantes se mantienen intactos. Esta configuración sólo bloquea nuevos cupos.</div><form id="availability-config-form"><div class="availability-config-toolbar"><button type="button" class="btn btn-secondary" data-availability-select-all>Marcar todos</button><button type="button" class="btn btn-secondary" data-availability-clear>Limpiar</button></div><div class="availability-config-grid">${dates.map(date => `<section class="availability-config-day"><h4>${new Date(`${date}T12:00:00`).toLocaleDateString('es-EC',{weekday:'long',day:'numeric',month:'short'})}</h4>${slotsByDate[date].map(slot => {const checked=overrideKeys.has(`${date}:${slot.startTime}:${slot.endTime}`);return `<label class="availability-config-slot ${slot.status==='ocupado'?'is-occupied':''}"><input type="checkbox" name="availability" value="${date}|${slot.startTime}|${slot.endTime}" ${checked?'checked':''}><span>${slot.startTime} - ${slot.endTime}</span>${slot.status==='ocupado'?'<small>Ocupado</small>':''}</label>`;}).join('')}</section>`).join('')}</div><div class="availability-config-actions"><button type="button" class="btn btn-secondary" data-close-availability-config>Cancelar</button><button type="submit" class="btn btn-primary">Guardar disponibilidad</button></div></form></div></div>`;
  }

  async openAvailabilityConfiguration(calendar) {
    const modal = document.getElementById('instructor-calendar-modal');
    if (!modal) return;
    try {
      const startDate = calendar.week?.startDate || calendar.slots?.[0]?.date;
      const endDate = calendar.week?.endDate || calendar.slots?.at(-1)?.date;
      const result = await ApiService.getInstructorAvailabilityOverrides(calendar.instructor.id, startDate, endDate);
      modal.innerHTML = this.renderAvailabilityConfiguration(calendar, result.success ? result.data : []);
      modal.querySelectorAll('[data-close-availability-config]').forEach(button => button.addEventListener('click', () => {
        modal.innerHTML = this.renderCalendar(calendar);
        this.bindModalClose(modal);
        modal.querySelector('#configure-instructor-availability')?.addEventListener('click', () => this.openAvailabilityConfiguration(calendar));
      }));
      modal.querySelector('[data-availability-select-all]')?.addEventListener('click', () => modal.querySelectorAll('input[name="availability"]').forEach(input => { input.checked = true; }));
      modal.querySelector('[data-availability-clear]')?.addEventListener('click', () => modal.querySelectorAll('input[name="availability"]').forEach(input => { input.checked = false; }));
      modal.querySelector('#availability-config-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const submit = event.currentTarget.querySelector('[type="submit"]');
        submit.disabled = true;
        const overrides = [...event.currentTarget.querySelectorAll('input[name="availability"]:checked')].map(input => {
          const [date, startTime, endTime] = input.value.split('|');
          return { date, startTime, endTime, status: 'blocked' };
        });
        try {
          await ApiService.saveInstructorAvailabilityOverrides(calendar.instructor.id, overrides);
          modal.innerHTML = this.renderCalendar(calendar);
          this.bindModalClose(modal);
          modal.querySelector('#configure-instructor-availability')?.addEventListener('click', () => this.openAvailabilityConfiguration(calendar));
        } catch (error) {
          window.alert(error.data?.error?.message || error.message || 'No se pudo guardar la disponibilidad.');
          submit.disabled = false;
        }
      });
    } catch (error) {
      window.alert(error.data?.error?.message || error.message || 'No se pudo cargar la disponibilidad.');
    }
  }

  bindModalClose(modal) {
    modal.querySelectorAll('[data-close-calendar-modal]').forEach(button => {
      button.addEventListener('click', () => this.closeCalendarModal());
    });
    modal.addEventListener('click', event => {
      if (event.target === modal) this.closeCalendarModal();
    }, { once: true });
  }

  closeCalendarModal() {
    document.getElementById('instructor-students-modal')?.remove();
    const modal = document.getElementById('instructor-calendar-modal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = '';
    document.body.style.overflow = '';
  }
}

export default ScheduleView;
