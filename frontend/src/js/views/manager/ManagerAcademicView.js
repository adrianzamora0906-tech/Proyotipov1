import Component from "../../components/Component.js";
import SidebarLayout from "../../layouts/SidebarLayout.js";
import ManagerService from "../../services/ManagerService.js";

const money = (value) =>
  new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(
    Number(value) || 0,
  );
const number = (value) =>
  new Intl.NumberFormat("es-EC").format(Number(value) || 0);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ],
  );

export default class ManagerAcademicView extends Component {
  constructor(props = {}) {
    super(props);
    this.tab = "courses";
    this.selectedIndependentService = "PSICOSENSOMETRICO";
    this.activeStudentsPage = 1;
  }
  async render() {
    return SidebarLayout.render(`<main class="admin-dashboard manager-academic"><header class="admin-dashboard__header"><div><h1>Operación académica</h1><p>Cursos, servicios académicos e instructores en una sola vista</p></div><button class="btn btn-secondary" id="academic-refresh" type="button">↻ Actualizar</button></header>
  <section class="dashboard-filters manager-filter-bar"><label>Sucursal<select id="academic-branch"><option value="">Todas las sucursales</option></select></label><label>Provincia<select id="academic-province"><option value="">Todas</option></select></label><label>Cantón / ciudad<select id="academic-city"><option value="">Todos</option></select></label><label>Desde<input id="academic-from" type="date"></label><label>Hasta<input id="academic-to" type="date"></label><button class="btn btn-secondary" id="academic-clear-filters" type="button">Limpiar filtros</button></section>
  <div id="academic-status" class="dashboard-status"></div><nav class="manager-academic-tabs" id="academic-tabs"><button data-tab="courses" class="is-active">Cursos</button><button data-tab="evaluations">Evaluaciones</button><button data-tab="recoveries">Recuperaciones</button><button data-tab="instructors">Instructores</button></nav><section id="academic-content" class="dashboard-panel dashboard-skeleton"></section><div class="modal-overlay" id="academic-course-modal" aria-hidden="true"><div class="modal manager-people-modal" role="dialog" aria-modal="true"><div class="modal-header"><div><h2 class="modal-title" id="academic-course-title">Ciclos del curso</h2><p class="manager-modal-subtitle" id="academic-course-summary"></p></div><button type="button" class="modal-close" id="academic-course-close">&times;</button></div><div class="modal-body" id="academic-course-detail"></div><div class="modal-footer"><button type="button" class="btn btn-secondary" id="academic-course-done">Cerrar</button></div></div></div></main>`);
  }
  async mount() {
    document
      .querySelector(".manager-academic")
      .insertAdjacentHTML(
        "beforeend",
        `<div class="modal-overlay" id="instructor-students-modal" aria-hidden="true"><div class="modal manager-people-modal instructor-students-modal" role="dialog" aria-modal="true"><div class="modal-header"><div><h2 class="modal-title" id="instructor-students-title">Estudiantes del instructor</h2><p class="manager-modal-subtitle" id="instructor-students-summary"></p></div><button type="button" class="modal-close" id="instructor-students-close">&times;</button></div><div class="modal-body"><div class="instructor-course-filters" id="instructor-course-filters"></div><div id="instructor-students-table" class="dashboard-table-wrap"></div><div id="instructor-students-pagination" class="manager-people-pagination"></div></div><div class="modal-footer"><button type="button" class="btn btn-primary" id="instructor-students-export">Exportar Excel</button><button type="button" class="btn btn-secondary" id="instructor-students-done">Cerrar</button></div></div></div>`,
      );
    document
      .querySelector(".manager-academic")
      .insertAdjacentHTML(
        "beforeend",
        `<div class="modal-overlay" id="active-students-modal" aria-hidden="true"><div class="modal manager-people-modal" role="dialog" aria-modal="true"><div class="modal-header"><div><h2 class="modal-title">Estudiantes cursando hoy</h2><p class="manager-modal-subtitle" id="active-students-summary"></p></div><button type="button" class="modal-close" id="active-students-close">&times;</button></div><div class="modal-body"><div id="active-students-table" class="dashboard-table-wrap"></div><div id="active-students-pagination" class="manager-people-pagination"></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" id="active-students-done">Cerrar</button></div></div></div>`,
      );
    const today = new Date(),
      from = new Date(today);
    from.setDate(today.getDate() - 14);
    const local = (date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    document.getElementById("academic-from").value = local(from);
    document.getElementById("academic-to").value = local(today);
    this.defaultDates = { from: local(from), to: local(today) };
    document
      .getElementById("academic-refresh")
      .addEventListener("click", () => this.load());
    document.querySelector('[data-tab="evaluations"]').textContent =
      "Servicios independientes";
    document.querySelector('[data-tab="recoveries"]')?.remove();
    document
      .getElementById("academic-tabs")
      .addEventListener("click", (event) => {
        const button = event.target.closest("[data-tab]");
        if (!button) return;
        this.tab = button.dataset.tab;
        document
          .querySelectorAll("[data-tab]")
          .forEach((item) =>
            item.classList.toggle("is-active", item === button),
          );
        this.paintContent();
      });
    document
      .getElementById("academic-province")
      .addEventListener("change", () => {
        document.getElementById("academic-city").value = "";
        document.getElementById("academic-branch").value = "";
        this.syncLocations();
        this.load();
      });
    document.getElementById("academic-city").addEventListener("change", () => {
      document.getElementById("academic-branch").value = "";
      this.syncLocations();
      this.load();
    });
    document
      .getElementById("academic-branch")
      .addEventListener("change", () => this.load());
    ["academic-from", "academic-to"].forEach((id) =>
      document.getElementById(id).addEventListener("change", () => this.load()),
    );
    document.getElementById("academic-clear-filters").addEventListener("click", () => { document.getElementById("academic-province").value="";document.getElementById("academic-city").value="";document.getElementById("academic-branch").value="";document.getElementById("academic-from").value=this.defaultDates.from;document.getElementById("academic-to").value=this.defaultDates.to;this.syncLocations();this.load(); });
    document
      .getElementById("academic-content")
      .addEventListener("click", (event) => {
        const row = event.target.closest("[data-course-id]");
        if (row)
          this.openCourseModalStyled(
            row.dataset.courseId,
            row.dataset.courseName,
          );
      });
    document
      .getElementById("academic-content")
      .addEventListener("click", (event) => {
        const card = event.target.closest("[data-service-code]");
        if (!card) return;
        this.selectedIndependentService = card.dataset.serviceCode;
        this.paintIndependentServicesInteractiveFinal2();
      });
    document
      .getElementById("academic-content")
      .addEventListener("click", (event) => {
        if (this.tab !== "instructors") return;
        const row = event.target.closest("tbody tr");
        if (!row) return;
        const index = [...row.parentElement.children].indexOf(row),
          instructor = (this.data?.instructors || [])[index];
        if (instructor) this.openInstructorStudents(instructor);
      });
    document
      .getElementById("academic-content")
      .addEventListener("click", (event) => {
        if (event.target.closest("[data-active-students]"))
          this.openActiveStudents();
      });
    document
      .getElementById("instructor-course-filters")
      .addEventListener("click", (event) => {
        const button = event.target.closest("[data-instructor-course]");
        if (!button) return;
        this.instructorCourseId = button.dataset.instructorCourse || "";
        this.loadInstructorStudents(1);
      });
    document
      .getElementById("instructor-students-pagination")
      .addEventListener("click", (event) => {
        const button = event.target.closest("[data-page]");
        if (button) this.loadInstructorStudents(Number(button.dataset.page));
      });
    document
      .getElementById("instructor-students-export")
      .addEventListener("click", () => this.exportInstructorStudents());
    ["instructor-students-close", "instructor-students-done"].forEach((id) =>
      document
        .getElementById(id)
        .addEventListener("click", () => this.closeInstructorStudents()),
    );
    document
      .getElementById("instructor-students-modal")
      .addEventListener("click", (event) => {
        if (event.target.id === "instructor-students-modal")
          this.closeInstructorStudents();
      });
    document
      .getElementById("active-students-pagination")
      .addEventListener("click", (event) => {
        const button = event.target.closest("[data-active-page]");
        if (button && !button.disabled)
          this.paintActiveStudents(Number(button.dataset.activePage));
      });
    ["active-students-close", "active-students-done"].forEach((id) =>
      document
        .getElementById(id)
        .addEventListener("click", () => this.closeActiveStudents()),
    );
    document
      .getElementById("active-students-modal")
      .addEventListener("click", (event) => {
        if (event.target.id === "active-students-modal")
          this.closeActiveStudents();
      });
    ["academic-course-close", "academic-course-done"].forEach((id) =>
      document
        .getElementById(id)
        .addEventListener("click", () => this.closeCourseModal()),
    );
    document
      .getElementById("academic-course-modal")
      .addEventListener("click", (event) => {
        if (event.target.id === "academic-course-modal")
          this.closeCourseModal();
      });
    await this.load();
  }
  filters() {
    return {
      period: "custom",
      branchId: document.getElementById("academic-branch").value,
      province: document.getElementById("academic-province").value,
      city: document.getElementById("academic-city").value,
      dateFrom: document.getElementById("academic-from").value,
      dateTo: document.getElementById("academic-to").value,
    };
  }
  fillLocations(options = []) {
    this.options = options;
    const province = document.getElementById("academic-province"),
      selected = province.value,
      values = [
        ...new Set(options.map((item) => item.province).filter(Boolean)),
      ].sort();
    province.innerHTML =
      '<option value="">Todas</option>' +
      values
        .map((value) => `<option value="${esc(value)}">${esc(value)}</option>`)
        .join("");
    province.value = values.includes(selected) ? selected : "";
    this.syncLocations(true);
  }
  syncLocations(preserve = false) {
    const province = document.getElementById("academic-province"),
      city = document.getElementById("academic-city"),
      branch = document.getElementById("academic-branch"),
      oldCity = city.value,
      oldBranch = branch.value,
      cities = [
        ...new Set(
          (this.options || [])
            .filter(
              (item) => !province.value || item.province === province.value,
            )
            .map((item) => item.city)
            .filter(Boolean),
        ),
      ].sort();
    city.innerHTML =
      '<option value="">Todos</option>' +
      cities
        .map((value) => `<option value="${esc(value)}">${esc(value)}</option>`)
        .join("");
    city.value = cities.includes(oldCity) ? oldCity : "";
    const branches = (this.options || []).filter(
      (item) =>
        (!province.value || item.province === province.value) &&
        (!city.value || item.city === city.value),
    );
    branch.innerHTML =
      '<option value="">Todas las sucursales</option>' +
      branches
        .map(
          (item) =>
            `<option value="${esc(item.id)}">${esc(item.name)}</option>`,
        )
        .join("");
    if (preserve && branches.some((item) => String(item.id) === oldBranch))
      branch.value = oldBranch;
  }
  async load() {
    const status = document.getElementById("academic-status");
    status.textContent = "Actualizando operación académica…";
    try {
      const response = await ManagerService.academic(this.filters());
      this.data = response.data || {};
      this.fillLocations(this.data.branchOptions || []);
      this.paintContent();
      status.textContent = `Actualizado ${new Date().toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })}`;
    } catch (error) {
      status.textContent = error.message || "No se pudo cargar la información";
      status.classList.add("dashboard-error");
    }
  }
  paintContent() {
    const data = this.data || {},
      content = document.getElementById("academic-content"),
      k = data.kpis || {};
    if (this.tab === "courses") {
      this.paintCourses();
      return;
      const rows = data.courses || [];
      content.innerHTML = `<div class="panel-title"><div><h2>Rendimiento de cursos</h2><small>Matrículas, participantes, ingresos y cartera del periodo</small></div></div>${rows.length ? `<div class="dashboard-table-wrap"><table><thead><tr><th>Curso</th><th>Precio actual</th><th>Matrículas</th><th>Participantes</th><th>Cobrado</th><th>Pendiente</th></tr></thead><tbody>${rows.map((item) => `<tr><td><strong>${esc(item.name)}</strong></td><td>${money(item.price)}</td><td>${number(item.enrollments)}</td><td>${number(item.people)}</td><td>${money(item.collected)}</td><td>${money(item.pending)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="dashboard-empty">No hay cursos para mostrar.</p>'}`;
      return;
    }
    if (this.tab === "evaluations") {
      this.paintIndependentServicesInteractiveFinal2();
      return;
    }
    if (this.tab === "evaluations") {
      this.paintService(
        "Evaluaciones psicosensométricas",
        k.evaluations,
        k.evaluation_collected,
        "Personas evaluadas independientemente para obtención o renovación de licencia.",
      );
      return;
    }
    if (this.tab === "recoveries") {
      this.paintService(
        "Recuperaciones",
        k.recoveries,
        k.recovery_collected,
        "Estudiantes que rindieron una recuperación asociada a su curso.",
      );
      return;
    }
    const rows = data.instructors || [];
    content.innerHTML = `<div class="panel-title"><div><h2>Actividad de instructores</h2><small>Asignaciones prácticas y clases impartidas en el período seleccionado</small></div></div>${rows.length ? `<div class="dashboard-table-wrap"><table><thead><tr><th>Instructor</th><th>Sucursal</th><th>Cursos</th><th>Estudiantes</th><th>Clases programadas</th><th>Horas impartidas</th><th>Honorario</th></tr></thead><tbody>${rows.map((item) => `<tr><td><strong>${esc(item.name)}</strong><small>${esc(item.email || "")}</small></td><td>${esc(item.branch_name)}</td><td>${number(item.courses)}</td><td>${number(item.students)}</td><td>${number(item.scheduled_classes)}</td><td>${number(item.taught_hours)} h</td><td><span class="status-badge status-pending">Sin tarifa</span></td></tr>`).join("")}</tbody></table></div>` : '<p class="dashboard-empty">No hay actividad de instructores en el período seleccionado.</p>'}<p class="academic-note">Para calcular honorarios se deberá configurar una tarifa por hora o por clase, conservando el resultado únicamente como valor estimado hasta su aprobación.</p>`;
    const instructorHeaders = content.querySelectorAll("thead th");
    if (instructorHeaders[2])
      instructorHeaders[2].textContent = "Ciclos impartidos";
  }
  paintCourses() {
    const data = this.data || {},
      k = data.kpis || {},
      performance = data.coursePerformance || [],
      financial = new Map((data.courses || []).map((item) => [item.id, item])),
      cycles = data.cycleSummary || [];
    const totals = performance.reduce(
      (r, item) => {
        r.enrollments += Number(item.enrollments);
        r.confirmed += Number(item.confirmed);
        r.completed += Number(item.completed);
        r.classes += Number(item.scheduled_classes);
        r.completedClasses += Number(item.completed_classes);
        return r;
      },
      {
        enrollments: 0,
        confirmed: 0,
        completed: 0,
        classes: 0,
        completedClasses: 0,
      },
    );
    const pct = (value, base) =>
        base ? `${((Number(value) / Number(base)) * 100).toFixed(1)}%` : "0.0%",
      activeCycles = cycles
        .filter((item) => ["activo", "por_terminar"].includes(item.status))
        .reduce((sum, item) => sum + Number(item.total), 0),
      cycleLabels = {
        proximo: "Próximos",
        activo: "Activos",
        por_terminar: "Por terminar",
        finalizado: "Finalizados",
        cancelado: "Cancelados",
      },
      rows = performance.map((item) => ({
        ...item,
        ...(financial.get(item.id) || {}),
      }));
    document.getElementById("academic-content").innerHTML =
      `<div class="panel-title"><div><h2>Cursos</h2><small>Seguimiento académico, operativo y financiero del periodo seleccionado</small></div></div>
    <div class="dashboard-kpis academic-course-kpis"><article class="dashboard-kpi manager-kpi"><strong>${number(totals.enrollments)}</strong><span>Matrículas registradas</span><small>Solicitudes de ingreso</small></article><article class="dashboard-kpi manager-kpi"><strong>${number(totals.confirmed)}</strong><span>Participantes confirmados</span><small>${pct(totals.confirmed, totals.enrollments)} realizó al menos un pago</small></article><article class="dashboard-kpi manager-kpi" data-active-students role="button" tabindex="0"><strong>${number((data.activeStudents || []).length)}</strong><span>Estudiantes cursando hoy</span><small>Haz clic para ver quiénes están activos</small></article><article class="dashboard-kpi manager-kpi"><strong>${number(totals.completed)}</strong><span>Finalizaron el curso</span><small>${pct(totals.completed, totals.confirmed)} de confirmados</small></article><article class="dashboard-kpi manager-kpi"><strong>${money(k.course_collected)}</strong><span>Ingresos por cursos</span><small>${money(k.pending)} pendiente</small></article><article class="dashboard-kpi manager-kpi"><strong>${number(activeCycles)}</strong><span>Ciclos en ejecución</span><small>Activos o por terminar</small></article><article class="dashboard-kpi manager-kpi"><strong>${pct(totals.completedClasses, totals.classes)}</strong><span>Avance de clases</span><small>${number(totals.completedClasses)} de ${number(totals.classes)} sesiones</small></article></div>
    <div class="dashboard-columns academic-course-panels"><section class="academic-subpanel"><h3>Embudo de participantes</h3>${[
      ["Matrículas", totals.enrollments],
      ["Confirmados", totals.confirmed],
      ["Finalizaron", totals.completed],
    ]
      .map(
        ([label, value]) =>
          `<div class="academic-funnel"><div><strong>${label}</strong><span>${number(value)} · ${pct(value, totals.enrollments)}</span></div><div><i style="width:${Math.max(Number.parseFloat(pct(value, totals.enrollments)), 2)}%"></i></div></div>`,
      )
      .join(
        "",
      )}<p class="academic-insight">${number(Math.max(totals.enrollments - totals.confirmed, 0))} matrículas aún no cuentan como participantes confirmados.</p></section><section class="academic-subpanel"><h3>Estado de ciclos</h3><div class="academic-cycle-grid">${cycles.length ? cycles.map((item) => `<div><strong>${number(item.total)}</strong><span>${cycleLabels[item.status] || esc(item.status)}</span><small>Capacidad ${number(item.capacity)}</small></div>`).join("") : '<p class="dashboard-empty">No hay ciclos en el rango.</p>'}</div></section></div>
    <section class="academic-subpanel academic-table-panel"><div class="panel-title"><div><h3>Desempeño por curso</h3><small>El precio es el vigente; lo cobrado conserva el valor histórico.</small></div></div>${rows.length ? `<div class="dashboard-table-wrap"><table><thead><tr><th>Curso</th><th>Precio</th><th>Matriculados</th><th>Confirmados</th><th>Finalizaron</th><th>Conversión</th><th>Clases</th><th>Asistencia</th><th>Instructores</th><th>Cobrado</th><th>Pendiente</th></tr></thead><tbody>${rows.map((item) => `<tr><td><strong>${esc(item.name)}</strong></td><td>${money(item.price)}</td><td>${number(item.enrollments)}</td><td>${number(item.confirmed)}</td><td>${number(item.completed)}</td><td>${pct(item.confirmed, item.enrollments)}</td><td>${number(item.completed_classes)}/${number(item.scheduled_classes)}</td><td>${number(item.attendance_rate)}%</td><td>${number(item.instructors)}</td><td>${money(item.collected)}</td><td>${money(item.pending)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="dashboard-empty">No existen matrículas en este periodo.</p>'}</section>
    <section class="academic-subpanel"><div class="panel-title"><div><h3>Resultados por sucursal</h3><small>Volumen, conversión e ingresos de cursos</small></div></div><div class="dashboard-table-wrap"><table><thead><tr><th>Sucursal</th><th>Matrículas</th><th>Participantes</th><th>Conversión</th><th>Ingresos</th><th>Pendiente</th></tr></thead><tbody>${(data.branches || []).map((item) => `<tr><td><strong>${esc(item.name)}</strong><small>${esc(item.city || "")}</small></td><td>${number(item.enrollments)}</td><td>${number(item.people)}</td><td>${pct(item.people, item.enrollments)}</td><td>${money(item.course_collected)}</td><td>${money(item.pending)}</td></tr>`).join("")}</tbody></table></div></section><p class="academic-note"><strong>Lectura gerencial:</strong> aprobaciones, reprobaciones y utilidad neta se incorporarán cuando se definan formalmente el resultado final y los costos u honorarios.</p>`;
    document
      .getElementById("academic-content")
      .insertAdjacentHTML(
        "beforeend",
        `<section class="academic-subpanel academic-recovery-panel"><div class="panel-title"><div><h3>Recuperaciones del curso</h3><small>Forman parte del seguimiento del curso.</small></div><strong>${number(k.recoveries)} realizadas · ${money(k.recovery_collected)}</strong></div><div class="dashboard-table-wrap"><table><thead><tr><th>Curso</th><th>Recuperaciones</th><th>Ingreso adicional</th></tr></thead><tbody>${rows.map((item) => `<tr><td>${esc(item.name)}</td><td>${number(item.recoveries)}</td><td>${money(item.recovery_income)}</td></tr>`).join("")}</tbody></table></div></section>`,
      );
    document
      .querySelectorAll(".academic-table-panel tbody tr")
      .forEach((row, index) => {
        const course = rows[index];
        if (!course) return;
        row.classList.add("academic-course-row");
        row.dataset.courseId = course.id;
        row.dataset.courseName = course.name;
        row.tabIndex = 0;
        const cell = row.querySelector("td");
        if (cell)
          cell.insertAdjacentHTML(
            "beforeend",
            "<small>Ver fechas y ciclos</small>",
          );
      });
  }
  openCourseModal(courseId, courseName) {
    const rows = (this.data?.courseCycles || []).filter(
        (item) => String(item.course_id) === String(courseId),
      ),
      modal = document.getElementById("academic-course-modal"),
      labels = {
        proximo: "Próximo",
        activo: "En ejecución",
        por_terminar: "Por terminar",
        finalizado: "Finalizado",
        cancelado: "Cancelado",
      },
      date = (value) =>
        new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(
          "es-EC",
          { day: "2-digit", month: "long", year: "numeric" },
        );
    document.getElementById("academic-course-title").textContent = courseName;
    document.getElementById("academic-course-summary").textContent =
      "Ciclos actuales y próximos dentro de los siguientes 60 días";
    document.getElementById("academic-course-detail").innerHTML = rows.length
      ? `<div class="academic-cycle-list">${rows.map((item) => `<article><div class="academic-cycle-head"><div><strong>${esc(item.code)}</strong><span>${esc(item.branch_name)}</span></div><span class="status-badge">${labels[item.status] || esc(item.status)}</span></div><dl><div><dt>Fecha de inicio</dt><dd>${date(item.start_date)}</dd></div><div><dt>Fecha de finalización</dt><dd>${date(item.end_date)}</dd></div><div><dt>Modalidad</dt><dd>${esc(item.modality)}</dd></div><div><dt>Duración</dt><dd>${number(item.duration_business_days)} días hábiles</dd></div><div><dt>Matriculados</dt><dd>${number(item.enrolled)} de ${number(item.capacity)}</dd></div><div><dt>Cupos disponibles</dt><dd>${number(Math.max(Number(item.capacity) - Number(item.enrolled), 0))}</dd></div></dl><p><strong>Instructor:</strong> ${esc(item.instructors || "Aún no asignado")}</p></article>`).join("")}</div>`
      : '<p class="dashboard-empty">Este curso no tiene ciclos activos o próximos en el periodo consultado.</p>';
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    document.getElementById("academic-course-close").focus();
  }
  openCourseModalStyled(courseId, courseName) {
    const rows = (this.data?.courseCycles || []).filter(
        (item) => String(item.course_id) === String(courseId),
      ),
      modal = document.getElementById("academic-course-modal"),
      labels = {
        proximo: "Próximo",
        activo: "En ejecución",
        por_terminar: "Por terminar",
        finalizado: "Finalizado",
        cancelado: "Cancelado",
      },
      date = (value) =>
        new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(
          "es-EC",
          { day: "2-digit", month: "long", year: "numeric" },
        );
    document.getElementById("academic-course-title").textContent = courseName;
    document.getElementById("academic-course-summary").textContent =
      `${rows.length} ciclo${rows.length === 1 ? "" : "s"} en las sucursales consultadas`;
    document.getElementById("academic-course-detail").innerHTML = rows.length
      ? `<div class="academic-cycle-list">${rows.map((item) => `<article><div class="academic-cycle-head"><div><small>${esc(item.branch_name)} · ${esc(item.group_name || "Grupo pendiente de asignar")}</small><strong>Inicia el ${date(item.start_date)}</strong></div><span class="academic-cycle-status is-${esc(item.status)}">${labels[item.status] || esc(item.status)}</span></div><div class="academic-cycle-dates"><span>Desde <strong>${date(item.start_date)}</strong></span><i>→</i><span>Hasta <strong>${date(item.end_date)}</strong></span></div><dl><div><dt>Modalidad</dt><dd>${esc(item.modality)}</dd></div><div><dt>Duración</dt><dd>${number(item.duration_business_days)} días hábiles</dd></div><div><dt>Matriculados</dt><dd>${number(item.enrolled)} de ${number(item.capacity)}</dd></div><div><dt>Cupos disponibles</dt><dd>${number(Math.max(Number(item.capacity) - Number(item.enrolled), 0))}</dd></div></dl><p class="academic-cycle-instructor"><strong>Instructor${String(item.instructors || "").includes(",") ? "es" : ""}:</strong> ${esc(item.instructors || "Aún no asignado")}</p><small class="academic-cycle-reference">Referencia interna: ${esc(item.code)}</small></article>`).join("")}</div>`
      : '<p class="dashboard-empty">Este curso no tiene ciclos activos o próximos en el periodo consultado.</p>';
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    document.getElementById("academic-course-close").focus();
  }
  closeCourseModal() {
    const modal = document.getElementById("academic-course-modal");
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
  }
  paintPsychometric() {
    const data = this.data || {},
      k = data.kpis || {},
      p = data.psychometric || {},
      daily = p.daily || [],
      branches = p.branches || [],
      methods = p.methods || [],
      recent = p.recent || [],
      max = Math.max(...daily.map((item) => Number(item.total)), 1);
    document.getElementById("academic-content").innerHTML =
      `<div class="panel-title"><div><h2>Exámenes psicosensométricos</h2><small>Servicio independiente para obtención o renovación de licencia; no es una evaluación académica del curso.</small></div></div><div class="dashboard-kpis academic-course-kpis"><article class="dashboard-kpi manager-kpi"><strong>${number(k.evaluations)}</strong><span>Exámenes realizados</span><small>En el periodo seleccionado</small></article><article class="dashboard-kpi manager-kpi"><strong>${money(k.evaluation_collected)}</strong><span>Ingresos cobrados</span><small>Valor por examen: ${money(16)}</small></article><article class="dashboard-kpi manager-kpi"><strong>${number(recent.filter((item) => item.customer_type === "Externo").length)}</strong><span>Personas externas recientes</span><small>En los últimos cinco registros</small></article></div><div class="dashboard-columns"><section class="academic-subpanel"><h3>Actividad por fecha</h3><div class="psychometric-daily">${daily.length ? daily.map((item) => `<div><span>${new Date(`${String(item.movement_date).slice(0, 10)}T00:00:00`).toLocaleDateString("es-EC", { day: "2-digit", month: "short" })}</span><div><i style="width:${(Number(item.total) / max) * 100}%"></i></div><strong>${number(item.total)}</strong><small>${money(item.income)}</small></div>`).join("") : '<p class="dashboard-empty">No hay exámenes en el rango.</p>'}</div></section><section class="academic-subpanel"><h3>Métodos de pago</h3>${methods.length ? methods.map((item) => `<div class="psychometric-method"><div><strong>${esc(item.method)}</strong><small>${number(item.total)} transacciones</small></div><strong>${money(item.income)}</strong></div>`).join("") : '<p class="dashboard-empty">No hay cobros registrados.</p>'}</section></div><section class="academic-subpanel academic-table-panel"><div class="panel-title"><div><h3>Resultados por sucursal</h3><small>Volumen e ingresos del servicio</small></div></div><div class="dashboard-table-wrap"><table><thead><tr><th>Sucursal</th><th>Exámenes</th><th>Ingresos</th></tr></thead><tbody>${branches.map((item) => `<tr><td><strong>${esc(item.branch_name)}</strong></td><td>${number(item.total)}</td><td>${money(item.income)}</td></tr>`).join("")}</tbody></table></div></section><section class="academic-subpanel"><div class="panel-title"><div><h3>Últimos registros</h3><small>Muestra de cinco personas</small></div></div><div class="dashboard-table-wrap"><table><thead><tr><th>Identificación</th><th>Persona</th><th>Tipo</th><th>Sucursal</th><th>Fecha</th><th>Valor</th></tr></thead><tbody>${recent.map((item) => `<tr><td>${esc(item.identification)}</td><td><strong>${esc(item.name)}</strong><small>${esc(item.email || "")}</small></td><td>${esc(item.customer_type)}</td><td>${esc(item.branch_name)}</td><td>${new Date(item.performed_at).toLocaleDateString("es-EC")}</td><td>${money(item.amount)}</td></tr>`).join("")}</tbody></table></div></section>`;
  }
  paintIndependentServices() {
    this.paintPsychometric();
    const services = this.data?.independentServices || [],
      content = document.getElementById("academic-content"),
      title = content.querySelector(".panel-title");
    title.querySelector("h2").textContent = "Servicios independientes";
    title.querySelector("small").textContent =
      "Atenciones para personas externas o con licencia que no requieren un curso regular.";
    title.insertAdjacentHTML(
      "afterend",
      `<div class="independent-service-grid">${services.map((item) => `<article><div><span>${item.category === "DRIVING_PRACTICE" ? "Práctica de conducción" : "Evaluación para licencia"}</span><h3>${esc(item.name)}</h3></div><div class="independent-service-stats"><p><strong>${number(item.total)}</strong><small>Atenciones</small></p><p><strong>${money(item.income)}</strong><small>Ingresos</small></p><p><strong>${Number(item.base_price) > 0 ? money(item.base_price) : "Por configurar"}</strong><small>Tarifa</small></p></div><small>Disponible en ${number(item.enabled_branches)} sucursales</small></article>`).join("")}</div><div class="independent-section-title"><h3>Detalle de exámenes psicosensométricos</h3><p>Las clases prácticas se completarán al registrar atenciones y definir su tarifa.</p></div>`,
    );
  }
  paintIndependentServicesDetailed() {
    this.paintIndependentServices();
    const services = this.data?.independentServices || [];
    document
      .querySelectorAll(".independent-service-grid>article")
      .forEach((card, index) => {
        const item = services[index];
        if (!item || item.category !== "DRIVING_PRACTICE") return;
        card.innerHTML = `<div><span>Práctica de conducción</span><h3>${esc(item.name)}</h3><small>Paquete de ${number(item.duration_hours)} horas para personas que ya poseen licencia.</small></div><div class="independent-service-stats"><p><strong>${number(item.total)}</strong><small>Atenciones</small></p><p><strong>${money(item.income)}</strong><small>Ingresos</small></p><p><strong>${number(item.enabled_branches)}</strong><small>Sucursales</small></p></div><div class="licensed-pricing"><div><span>Antiguos estudiantes</span><strong>${money(item.alumni_price)}</strong><small>${number(item.alumni_total)} atenciones</small></div><div><span>Personas externas</span><strong>${money(item.base_price)}</strong><small>${number(item.external_total)} atenciones</small></div></div>`;
      });
  }
  paintIndependentServicesInteractive() {
    const original = this.data || {},
      code = this.selectedIndependentService || "PSICOSENSOMETRICO",
      source = original.psychometric || {};
    this.data = {
      ...original,
      psychometric: {
        daily: (source.daily || []).filter((item) => item.code === code),
        branches: (source.branches || []).filter((item) => item.code === code),
        methods: (source.methods || []).filter((item) => item.code === code),
        recent: (source.recent || [])
          .filter((item) => item.code === code)
          .slice(0, 5),
      },
    };
    this.paintIndependentServicesDetailed();
    this.data = original;
    const services = original.independentServices || [],
      selected = services.find((item) => item.code === code);
    document
      .querySelectorAll(".independent-service-grid>article")
      .forEach((card, index) => {
        const item = services[index];
        card.dataset.serviceCode = item.code;
        card.classList.toggle("is-selected", item.code === code);
        card.tabIndex = 0;
      });
    const heading = document.querySelector("#academic-content>.panel-title");
    if (heading)
      heading.querySelector("small").textContent =
        "Selecciona un servicio para ver sus datos.";
    const section = document.querySelector(".independent-section-title");
    if (section) {
      section.querySelector("h3").textContent = selected?.name || "Detalle";
      section.querySelector("p")?.remove();
    }
  }
  paintIndependentServicesInteractiveFinal() {
    this.paintIndependentServicesInteractive();
    const selected = (this.data?.independentServices || []).find(
      (item) => item.code === this.selectedIndependentService,
    );
    if (!selected || selected.category !== "DRIVING_PRACTICE") return;
    const cards = document.querySelectorAll(
      "#academic-content>.dashboard-kpis .dashboard-kpi",
    );
    if (cards[0]) {
      cards[0].querySelector("strong").textContent = number(selected.total);
      cards[0].querySelector("span").textContent = "Clases realizadas";
      cards[0].querySelector("small").textContent =
        "En el periodo seleccionado";
    }
    if (cards[1]) {
      cards[1].querySelector("strong").textContent = money(selected.income);
      cards[1].querySelector("span").textContent = "Ingresos cobrados";
      cards[1].querySelector("small").textContent =
        `Paquetes de ${number(selected.duration_hours)} horas`;
    }
    if (cards[2]) {
      cards[2].querySelector("strong").textContent = number(
        selected.external_total,
      );
      cards[2].querySelector("span").textContent = "Personas externas";
      cards[2].querySelector("small").textContent =
        `${number(selected.alumni_total)} antiguos estudiantes`;
    }
    document.querySelectorAll("#academic-content th").forEach((th) => {
      if (th.textContent === "Exámenes") th.textContent = "Atenciones";
    });
  }
  paintIndependentServicesInteractiveFinal2() {
    this.paintIndependentServicesInteractiveFinal();
    document
      .querySelectorAll(".licensed-pricing")
      .forEach((element) => element.remove());
    if (this.selectedIndependentService !== "PRACTICA_LICENCIADOS") return;
    const item = (this.data?.independentServices || []).find(
        (service) => service.code === "PRACTICA_LICENCIADOS",
      ),
      anchor = document.querySelector(".independent-section-title");
    if (!item || !anchor) return;
    anchor.insertAdjacentHTML(
      "afterend",
      `<div class="licensed-detail-pricing"><article><span>Antiguos estudiantes · 08:00</span><strong>${money(item.alumni_price)}</strong><small>${number(item.alumni_total)} personas</small></article><article><span>Personas externas · 08:00</span><strong>${money(item.base_price)}</strong><small>${number(item.external_total)} personas</small></article><article><span>Horario 16:00 · tarifa fija</span><strong>${money(item.afternoon_price)}</strong><small>${number(item.afternoon_total)} personas</small></article></div>`,
    );
  }
  async openInstructorStudents(instructor) {
    this.selectedInstructor = instructor;
    this.instructorCourseId = "";
    document.getElementById("instructor-students-title").textContent =
      instructor.name;
    const modal = document.getElementById("instructor-students-modal");
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    await this.loadInstructorStudents(1);
  }
  async loadInstructorStudents(page = 1) {
    const table = document.getElementById("instructor-students-table");
    table.innerHTML = '<p class="dashboard-empty">Cargando estudiantes…</p>';
    try {
      const response = await ManagerService.instructorStudents({
          ...this.filters(),
          instructorId: this.selectedInstructor.id,
          cycleId: this.instructorCourseId,
          page,
        }),
        report = response.data || {},
        pagination = report.pagination || {};
      const courseDate = (value) =>
          new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(
            "es-EC",
            { day: "numeric", month: "long", year: "numeric" },
          ),
        coursePeriod = (item) =>
          item.start_date && item.end_date
            ? `Del ${courseDate(item.start_date)} al ${courseDate(item.end_date)}`
            : "Sin fecha";
      document.getElementById("instructor-students-summary").textContent =
        `${number(pagination.total)} estudiantes en el periodo`;
      document.getElementById("instructor-course-filters").innerHTML =
        `<button class="${!this.instructorCourseId ? "is-active" : ""}" data-instructor-course="">Todos</button>${(report.courses || []).map((course) => `<button class="${String(course.id) === String(this.instructorCourseId) ? "is-active" : ""}" data-instructor-course="${esc(course.id)}">${esc(course.name)}</button>`).join("")}`;
      table.innerHTML = report.data?.length
        ? `<table><thead><tr><th>Identificación</th><th>Estudiante</th><th>Curso</th><th>Fechas de clase</th><th>Clases</th><th>Asistencias</th><th>Horas</th></tr></thead><tbody>${report.data.map((item) => `<tr><td>${esc(item.identification)}</td><td><strong>${esc(item.name)}</strong><small>${esc(item.email || item.phone || "")}</small></td><td>${esc(item.course_name)}</td><td>${esc(item.class_dates || "Sin fecha")}</td><td>${number(item.classes)}</td><td>${number(item.attended)}</td><td>${number(item.hours)} h</td></tr>`).join("")}</tbody></table>`
        : '<p class="dashboard-empty">No hay estudiantes para esta selección.</p>';
      const dateHeader = table.querySelector("thead th:nth-child(4)");
      if (dateHeader) dateHeader.textContent = "Periodo del curso";
      table.querySelectorAll("tbody tr").forEach((row, index) => {
        const cell = row.children[3];
        if (cell) cell.textContent = coursePeriod(report.data[index]);
      });
      document.getElementById("instructor-students-pagination").innerHTML =
        `<button type="button" data-page="${pagination.page - 1}" ${pagination.page <= 1 ? "disabled" : ""}>Anterior</button><span>Página ${number(pagination.page)} de ${number(pagination.totalPages)}</span><button type="button" data-page="${pagination.page + 1}" ${pagination.page >= pagination.totalPages ? "disabled" : ""}>Siguiente</button>`;
    } catch (error) {
      table.innerHTML = `<p class="dashboard-empty">${esc(error.message || "No se pudo cargar la información.")}</p>`;
    }
  }
  async exportInstructorStudents() {
    const button = document.getElementById("instructor-students-export");
    button.disabled = true;
    button.textContent = "Generando…";
    try {
      const file = await ManagerService.exportInstructorStudents({
          ...this.filters(),
          instructorId: this.selectedInstructor.id,
          cycleId: this.instructorCourseId,
        }),
        url = URL.createObjectURL(file.blob),
        link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error.message || "No se pudo exportar.");
    } finally {
      button.disabled = false;
      button.textContent = "Exportar Excel";
    }
  }
  closeInstructorStudents() {
    const modal = document.getElementById("instructor-students-modal");
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
  }
  openActiveStudents() {
    this.paintActiveStudents(1);
    const modal = document.getElementById("active-students-modal");
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    document.getElementById("active-students-close").focus();
  }
  paintActiveStudents(page = 1) {
    const all = this.data?.activeStudents || [],
      pageSize = 5,
      totalPages = Math.max(Math.ceil(all.length / pageSize), 1),
      current = Math.min(Math.max(page, 1), totalPages),
      rows = all.slice((current - 1) * pageSize, current * pageSize),
      formatDate = (value) =>
        new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(
          "es-EC",
        ),
      today = new Date().toLocaleDateString("es-EC", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    this.activeStudentsPage = current;
    document.getElementById("active-students-summary").textContent =
      `${number(all.length)} estudiantes con curso vigente al ${today}`;
    document.getElementById("active-students-table").innerHTML = rows.length
      ? `<table><thead><tr><th>Identificación</th><th>Estudiante</th><th>Curso</th><th>Sucursal</th><th>Instructor</th><th>Periodo del curso</th></tr></thead><tbody>${rows.map((item) => `<tr><td>${esc(item.identification)}</td><td><strong>${esc(item.name)}</strong><small>${esc(item.email || item.phone || "")}</small></td><td>${esc(item.course_name)}</td><td>${esc(item.branch_name)}</td><td>${esc(item.instructor_name || "Por asignar")}</td><td>${formatDate(item.start_date)} – ${formatDate(item.end_date)}</td></tr>`).join("")}</tbody></table>`
      : '<p class="dashboard-empty">Hoy no existen estudiantes cursando.</p>';
    document.getElementById("active-students-pagination").innerHTML =
      `<button type="button" data-active-page="${current - 1}" ${current <= 1 ? "disabled" : ""}>Anterior</button><span>Página ${number(current)} de ${number(totalPages)}</span><button type="button" data-active-page="${current + 1}" ${current >= totalPages ? "disabled" : ""}>Siguiente</button>`;
  }
  closeActiveStudents() {
    const modal = document.getElementById("active-students-modal");
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
  }
  paintService(title, count, income, description) {
    document.getElementById("academic-content").innerHTML =
      `<div class="panel-title"><div><h2>${title}</h2><small>${description}</small></div></div><div class="dashboard-kpis"><article class="dashboard-kpi manager-kpi"><strong>${number(count)}</strong><span>Atenciones realizadas</span><small>Dentro del rango seleccionado</small></article><article class="dashboard-kpi manager-kpi"><strong>${money(income)}</strong><span>Ingresos cobrados</span><small>Servicio independiente confirmado</small></article></div>`;
  }
}
