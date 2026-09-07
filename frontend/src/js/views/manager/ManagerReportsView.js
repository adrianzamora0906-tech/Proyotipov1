import Component from "../../components/Component.js";
import SidebarLayout from "../../layouts/SidebarLayout.js";
import AdminService from "../../services/AdminService.js";
import ManagerService from "../../services/ManagerService.js";
import { authService } from "../../core/auth/AuthService.js";

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ],
  );
const number = (value) =>
  new Intl.NumberFormat("es-EC").format(Number(value) || 0);
const money = (value) =>
  new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(
    Number(value) || 0,
  );
const date = (value) =>
  value
    ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(
        "es-EC",
      )
    : "—";
const types = {
  today_enrollments: {
    label: "Matriculados hoy",
    description: "Personas registradas durante el día de hoy",
  },
  active_students: {
    label: "Estudiantes activos",
    description: "Personas que están cursando hoy",
  },
  enrollments: {
    label: "Matrículas",
    description: "Inscripciones registradas en el periodo",
  },
  cycles: {
    label: "Cursos y ciclos",
    description: "Ciclos que coinciden con las fechas",
  },
  instructors: {
    label: "Instructores",
    description: "Carga, estudiantes, clases y horas",
  },
  payments: {
    label: "Pagos e ingresos",
    description: "Cobros y saldos del periodo",
  },
  services: {
    label: "Servicios independientes",
    description: "Psicosensométricos y prácticas",
  },
};
const columns = {
  today_enrollments: [
    ["identification", "Cédula"],
    ["name", "Estudiante"],
    ["course", "Curso"],
    ["branch", "Sucursal"],
    ["registered_by", "Registrado por"],
    ["enrollment_date", "Fecha de registro", "date"],
    ["status", "Estado"],
    ["amount", "Valor", "money"],
    ["balance", "Pendiente", "money"],
  ],
  active_students: [
    ["identification", "Cédula"],
    ["name", "Estudiante"],
    ["course", "Curso"],
    ["branch", "Sucursal"],
    ["registered_by", "Registrado por"],
    ["instructor", "Instructor"],
    ["start_date", "Inicio", "date"],
    ["end_date", "Fin", "date"],
  ],
  enrollments: [
    ["identification", "Cédula"],
    ["name", "Estudiante"],
    ["course", "Curso"],
    ["branch", "Sucursal"],
    ["registered_by", "Registrado por"],
    ["enrollment_date", "Matrícula", "date"],
    ["status", "Estado"],
    ["amount", "Valor", "money"],
    ["balance", "Pendiente", "money"],
  ],
  cycles: [
    ["code", "Ciclo"],
    ["course", "Curso"],
    ["branch", "Sucursal"],
    ["start_date", "Inicio", "date"],
    ["end_date", "Fin", "date"],
    ["students", "Estudiantes"],
    ["capacity", "Capacidad"],
    ["status", "Estado"],
  ],
  instructors: [
    ["name", "Instructor"],
    ["branch", "Sucursal"],
    ["practice_area", "Área"],
    ["students", "Estudiantes"],
    ["scheduled_classes", "Clases programadas"],
    ["hours", "Horas"],
  ],
  payments: [
    ["payment_date", "Fecha", "date"],
    ["identification", "Cédula"],
    ["name", "Estudiante"],
    ["branch", "Sucursal"],
    ["course", "Curso"],
    ["payment_method", "Método"],
    ["amount", "Cobrado", "money"],
    ["balance", "Pendiente", "money"],
  ],
  services: [
    ["service_date", "Fecha", "date"],
    ["identification", "Identificación"],
    ["name", "Persona"],
    ["service", "Servicio"],
    ["branch", "Sucursal"],
    ["payment_method", "Método"],
    ["amount", "Valor", "money"],
    ["status", "Estado"],
  ],
};

export default class ManagerReportsView extends Component {
  constructor(props = {}) {
    super(props);
    const today = new Date(),
      first = new Date(today.getFullYear(), today.getMonth(), 1),
      local = (value) =>
        `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    this.user = authService.getCurrentUser();
    this.isBranchAdmin = (this.user?.roles || []).includes("BRANCH_ADMIN");
    this.isAdminSystemReport = (this.user?.roles || []).includes("ADMIN_SYSTEM");
    this.isGeneralManagerReport = (this.user?.roles || []).includes("GENERAL_MANAGER");
    this.isBranchScopedReport =
      !this.isAdminSystemReport &&
      !this.isGeneralManagerReport &&
      this.user?.scope !== "GLOBAL";
    const branchId = "";
    this.filters = {
      type: "today_enrollments",
      branchId,
      province: "",
      city: this.isBranchScopedReport ? this.user?.city || "" : "",
      courseType: "",
      dateFrom: local(first),
      dateTo: local(today),
    };
    this.defaultFilters = { ...this.filters };
    this.filterTimer = null;
    this.loadSequence = 0;
    this.branchInstructorReport = null;
    this.result = { rows: [], summary: {}, filters: { branches: [] } };
    this.page = 1;
    this.pageSize = 10;
    this.canExport = Boolean(this.user?.permissions?.includes("REPORT_EXPORT"));
  }
  async render() {
    const reportTitle = this.isBranchScopedReport ? "Reportes de sucursal" : "Centro de reportes";
    const reportIntro = this.isBranchScopedReport
      ? "Consulta los resultados de las sucursales pertenecientes a tu cantón."
      : "Consulta información académica, operativa y financiera de todas las sucursales.";
    return SidebarLayout.render(`<main class="universal-reports"><style>
      .universal-reports{padding:28px;max-width:1500px;margin:auto}.report-head{display:flex;justify-content:space-between;gap:20px;align-items:center}.report-head h1{margin:0 0 5px}.report-head p{margin:0;color:#667085}.report-assistant{margin:24px 0;padding:20px;border-radius:16px;background:linear-gradient(135deg,#eef2ff,#fafaff);border:1px solid #c7d2fe}.report-assistant h2{font-size:16px;margin:0 0 5px}.report-assistant p{font-size:13px;color:#667085}.assistant-input{display:flex;gap:10px;margin-top:14px}.assistant-input input{flex:1;height:46px;border:1px solid #b9c3f8;border-radius:10px;padding:0 14px;background:#fff}.assistant-answer{display:none;margin-top:12px;padding:12px;border-radius:9px;background:#fff;color:#344054}.assistant-answer.show{display:block}.report-filters{display:grid;grid-template-columns:minmax(135px,1.05fr) minmax(135px,.85fr) minmax(165px,1.05fr) minmax(145px,.9fr) minmax(145px,.85fr) minmax(145px,.85fr) minmax(135px,.7fr);gap:12px;align-items:end;padding:18px;background:#fff;border:1px solid #e4e7ec;border-radius:14px}.report-filters label{display:grid;gap:6px;min-width:0;font-size:12px;color:#475467}.report-filters select,.report-filters input{width:100%;min-width:0;height:42px;border:1px solid #d0d5dd;border-radius:9px;padding:0 10px;background:#fff}.report-filters>.btn{width:100%;height:42px;white-space:nowrap}.report-kpis{display:grid;grid-template-columns:repeat(6,minmax(150px,1fr));gap:12px;margin:18px 0}.report-kpi{padding:16px;border:1px solid #e4e7ec;border-radius:12px;background:#fff;cursor:pointer;text-align:left}.report-kpi:hover,.report-kpi.active{border-color:#5b4df5;background:#f7f5ff}.report-kpi strong{display:block;font-size:23px}.report-kpi span{font-weight:700;font-size:13px}.report-kpi small{display:block;color:#667085;margin-top:4px}.report-panel{background:#fff;border:1px solid #e4e7ec;border-radius:14px;overflow:hidden}.report-panel-head{display:flex;justify-content:space-between;align-items:center;padding:18px}.report-table-wrap{overflow:auto}.report-table{width:100%;border-collapse:collapse}.report-table th,.report-table td{padding:13px 16px;border-top:1px solid #eaecf0;text-align:left;white-space:nowrap}.report-table th{background:#f9fafb;color:#475467;font-size:12px}.report-table td{font-size:13px}.report-empty{text-align:center!important;padding:50px!important;color:#667085}.report-pagination{display:flex;justify-content:flex-end;align-items:center;gap:12px;padding:15px;border-top:1px solid #eaecf0}.export-mode-modal{width:min(580px,calc(100vw - 32px));border-radius:18px;overflow:hidden}.export-mode-modal .modal-header{padding:24px 26px 20px}.export-mode-modal .modal-title{font-size:20px}.export-mode-body{display:grid;gap:12px;padding:20px 26px 24px!important;background:#fafbff}.export-mode-option{display:grid!important;grid-template-columns:48px 1fr 22px;align-items:center;gap:14px;width:100%;padding:17px!important;border:1px solid #e2e6ef!important;border-radius:13px!important;background:#fff!important;text-align:left!important;box-shadow:0 1px 2px rgba(16,24,40,.04);transition:.18s ease;cursor:pointer}.export-mode-option:hover{border-color:#675af5!important;background:#f8f7ff!important;box-shadow:0 7px 18px rgba(79,70,229,.1);transform:translateY(-1px)}.export-mode-icon{display:grid;place-items:center;width:48px;height:48px;border-radius:12px;background:#eeecff;color:#5145e5;font-size:23px}.export-mode-copy strong{display:block;margin-bottom:4px;font-size:14px;color:#101828}.export-mode-copy span{display:block;color:#667085;font-size:12px;line-height:1.45;font-weight:400}.export-mode-arrow{color:#98a2b3;font-size:22px}.export-mode-option:hover .export-mode-arrow{color:#5145e5;transform:translateX(2px)}.export-mode-footer{display:flex;justify-content:flex-end;padding:0 26px 22px;background:#fafbff}.export-mode-footer .btn{min-width:100px}@media(max-width:1250px){.report-filters{grid-template-columns:repeat(4,minmax(0,1fr))}.report-kpis{grid-template-columns:repeat(3,1fr)}}@media(max-width:800px){.report-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:650px){.universal-reports{padding:16px}.report-filters,.report-kpis{grid-template-columns:1fr}.assistant-input{flex-direction:column}.export-mode-option{grid-template-columns:42px 1fr 18px}.export-mode-icon{width:42px;height:42px}}
    </style><style>.report-table td small{display:block;color:#8892a6;margin-top:6px;font-size:12px}.report-table tr.cycle-row{cursor:pointer}.report-table tr.cycle-row:hover td{background:#f7f5ff}.cycle-link{color:#4f46e5;font-weight:700}.cycle-students-modal{width:min(960px,calc(100vw - 32px));max-height:88vh}.cycle-modal-meta{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}.cycle-modal-meta span{padding:7px 11px;border-radius:999px;background:#f2f4f7;color:#475467;font-size:12px}.cycle-modal-table{width:100%;border-collapse:collapse}.cycle-modal-table th,.cycle-modal-table td{padding:12px;border-bottom:1px solid #eaecf0;text-align:left}.cycle-modal-table th{font-size:12px;color:#667085;background:#f9fafb}.cycle-modal-table td{font-size:13px}</style><header class="report-head"><div><h1>${reportTitle}</h1><p>${reportIntro}</p></div><button class="btn" id="report-refresh">↻ Actualizar</button></header>
    <section class="report-assistant"><h2>Consulta rápida</h2><p>Escribe una pregunta sencilla. Ejemplo: “¿Cuántos estudiantes activos hay en Manta 2000?”</p><form class="assistant-input" id="report-question"><input id="report-question-input" placeholder="Escribe tu consulta…" autocomplete="off"><button class="btn btn-primary">Consultar</button></form><div class="assistant-answer" id="assistant-answer"></div></section>
    <form class="report-filters" id="universal-report-filters">${this.isBranchScopedReport ? `<select name="province" hidden disabled></select><label>Cantón / ciudad<select name="city" disabled><option value="${esc(this.filters.city)}">${esc(this.filters.city || "Cantón asignado")}</option></select></label><label>Sucursal<select name="branchId"><option value="">Todas las sucursales</option></select></label>` : `<label>Provincia<select name="province"><option value="">Todas</option></select></label><label>Cantón / ciudad<select name="city"><option value="">Todos</option></select></label><label>Sucursal<select name="branchId"><option value="">Todas las sucursales</option></select></label>`}<label>Tipo de curso<select name="courseType"><option value="">Todos</option><option value="moto">Moto</option><option value="carro">Automóvil</option></select></label><label>Desde<input type="date" name="dateFrom" value="${this.filters.dateFrom}"></label><label>Hasta<input type="date" name="dateTo" value="${this.filters.dateTo}"></label><button type="button" class="btn btn-secondary" id="report-clear-filters">Limpiar filtros</button></form>
    <section class="report-kpis" id="report-kpis"></section>
    <section class="report-panel"><div class="report-panel-head"><div><h2 id="report-title">Matriculados hoy</h2><small id="report-description">Personas registradas durante el día de hoy y usuario responsable del registro.</small></div><button class="btn" id="report-export" ${this.canExport ? "" : "hidden"}>Exportar Excel</button></div><div class="report-table-wrap"><table class="report-table"><thead id="report-table-head"></thead><tbody id="report-table-body"></tbody></table></div><div class="report-pagination" id="report-pagination"></div></section>
    </main>`);
  }
  async mount() {
    document
      .getElementById("universal-report-filters")
      .addEventListener("submit", (event) => {
        event.preventDefault();
      });
    document
      .getElementById("report-refresh")
      .addEventListener("click", () => this.load());
    document.querySelector(".universal-reports").insertAdjacentHTML(
      "beforeend",
      `<div class="modal-overlay" id="report-cycle-students-modal" aria-hidden="true"><div class="modal cycle-students-modal" role="dialog" aria-modal="true"><div class="modal-header"><div><h2 class="modal-title" id="report-cycle-students-title">Estudiantes matriculados</h2><p class="manager-modal-subtitle" id="report-cycle-students-summary"></p></div><button type="button" class="modal-close" id="report-cycle-students-close">&times;</button></div><div class="modal-body"><div class="cycle-modal-meta" id="report-cycle-students-meta"></div><div class="dashboard-table-wrap" id="report-cycle-students-table"></div><div class="manager-people-pagination" id="report-cycle-students-pagination"></div></div><div class="modal-footer"><button type="button" class="btn btn-primary" id="report-cycle-students-export">Exportar reporte completo</button><button type="button" class="btn btn-secondary" id="report-cycle-students-done">Cerrar</button></div></div></div>`,
    );
    const cycleModalPanel = document.querySelector("#report-cycle-students-modal .cycle-students-modal");
    cycleModalPanel.style.width = "min(1400px, calc(100vw - 24px))";
    cycleModalPanel.style.maxWidth = "none";
    cycleModalPanel.style.maxHeight = "82vh";
    // Insert instructor students modal (same structure as ManagerAcademicView)
    document
      .querySelector(".universal-reports")
      .insertAdjacentHTML(
        "beforeend",
        `<div class="modal-overlay" id="report-instructor-students-modal" aria-hidden="true"><div class="modal manager-people-modal" role="dialog" aria-modal="true"><div class="modal-header"><div><h2 class="modal-title" id="report-instructor-students-title">Estudiantes del instructor</h2><p class="manager-modal-subtitle" id="report-instructor-students-summary"></p></div><button type="button" class="modal-close" id="report-instructor-students-close">&times;</button></div><div class="modal-body"><div class="instructor-course-filters" id="report-instructor-course-filters"></div><div id="report-instructor-students-table" class="dashboard-table-wrap"></div><div id="report-instructor-students-pagination" class="manager-people-pagination"></div></div><div class="modal-footer"><button type="button" class="btn btn-primary" id="report-instructor-students-export">Exportar Excel</button><button type="button" class="btn btn-secondary" id="report-instructor-students-done">Cerrar</button></div></div></div>
        <div class="modal-overlay" id="report-export-mode-modal" aria-hidden="true"><div class="modal export-mode-modal" role="dialog" aria-modal="true"><div class="modal-header"><div><h2 class="modal-title">Exportar reporte de instructores</h2><p class="manager-modal-subtitle">Elige el nivel de detalle que tendrá el archivo Excel.</p></div><button type="button" class="modal-close" id="report-export-mode-close" aria-label="Cerrar">&times;</button></div><div class="modal-body export-mode-body"><button type="button" class="export-mode-option" id="report-export-complete"><span class="export-mode-icon">▦</span><span class="export-mode-copy"><strong>Reporte completo</strong><span>Resumen general y una hoja por instructor con todos sus cursos y estudiantes.</span></span><span class="export-mode-arrow">›</span></button><button type="button" class="export-mode-option" id="report-export-summary"><span class="export-mode-icon">≡</span><span class="export-mode-copy"><strong>Solo instructores</strong><span>Una tabla resumida con cursos, estudiantes, clases y horas de cada instructor.</span></span><span class="export-mode-arrow">›</span></button></div><div class="export-mode-footer"><button type="button" class="btn btn-secondary" id="report-export-mode-cancel">Cancelar</button></div></div></div>`,
      );
    document
      .getElementById("report-kpis")
      .addEventListener("click", (event) => {
        const card = event.target.closest("[data-report-type]");
        if (!card) return;
        this.filters.type = card.dataset.reportType;
        this.scheduleFilterLoad();
      });
    document
      .getElementById("report-export")
      .addEventListener("click", () => this.requestExcelExport());
    document.getElementById("report-export-mode-close").addEventListener("click", () => this.closeExportMode());
    document.getElementById("report-export-mode-cancel").addEventListener("click", () => this.closeExportMode());
    document.getElementById("report-export-summary").addEventListener("click", () => this.exportExcel("summary"));
    document.getElementById("report-export-complete").addEventListener("click", () => this.exportExcel("complete"));
    document.getElementById("report-export-mode-modal").addEventListener("click", (event) => {
      if (event.target.id === "report-export-mode-modal") this.closeExportMode();
    });
    document
      .getElementById("report-question")
      .addEventListener("submit", (event) => {
        event.preventDefault();
        this.quickQuestion();
      });
    const branchField = document.querySelector('[name="branchId"]');
    const branchSelect = branchField?.tagName === "SELECT" ? branchField : null;
    document
      .querySelector('[name="province"]')
      .addEventListener("change", () => {
        document.querySelector('[name="city"]').value = "";
        if (branchSelect) branchSelect.value = "";
        this.syncLocations();
        this.scheduleFilterLoad();
      });
    document.querySelector('[name="city"]').addEventListener("change", () => {
      if (branchSelect) branchSelect.value = "";
      this.syncLocations();
      this.scheduleFilterLoad();
    });
    branchSelect?.addEventListener("change", () => this.scheduleFilterLoad());
    document.querySelector('[name="courseType"]')?.addEventListener("change", () => this.scheduleFilterLoad());
    ["dateFrom", "dateTo"].forEach((name) =>
      document.querySelector(`[name="${name}"]`).addEventListener("change", () => this.scheduleFilterLoad()),
    );
    document.getElementById("report-clear-filters").addEventListener("click", () => this.clearFilters());
    document
      .getElementById("report-pagination")
      .addEventListener("click", (event) => {
        const button = event.target.closest("[data-page]");
        if (button && !button.disabled) {
          this.page = Number(button.dataset.page);
          this.paintTable();
        }
      });
    document
      .getElementById("report-table-body")
      .addEventListener("click", (event) => {
        if (this.filters.type === "cycles") {
          const row = event.target.closest("[data-cycle-id]");
          if (row) this.openCycleStudents(row.dataset.cycleId);
          return;
        }
        if (this.filters.type !== "instructors") return;
        const row = event.target.closest("tbody tr");
        if (!row) return;
        const index = [...row.parentElement.children].indexOf(row);
        const instructor = (this.result.rows || [])[index];
        if (instructor) this.openInstructorStudents(instructor);
      });
    ["report-cycle-students-close", "report-cycle-students-done"].forEach((id) =>
      document.getElementById(id).addEventListener("click", () => this.closeCycleStudents()),
    );
    document.getElementById("report-cycle-students-modal").addEventListener("click", (event) => {
      if (event.target.id === "report-cycle-students-modal") this.closeCycleStudents();
    });
    document.getElementById("report-cycle-students-pagination").addEventListener("click", (event) => {
      const button = event.target.closest("[data-cycle-page]");
      if (button && !button.disabled) {
        this.cycleStudentsPage = Number(button.dataset.cyclePage);
        this.paintCycleStudents();
      }
    });
    document.getElementById("report-cycle-students-export").addEventListener("click", () => this.exportCycleStudents());
    ["report-instructor-students-close", "report-instructor-students-done"].forEach(
      (id) =>
        document
          .getElementById(id)
          .addEventListener("click", () => this.closeInstructorStudents()),
    );
    document
      .getElementById("report-instructor-students-modal")
      .addEventListener("click", (event) => {
        if (event.target.id === "report-instructor-students-modal")
          this.closeInstructorStudents();
      });
    document
      .getElementById("report-instructor-students-pagination")
      .addEventListener("click", (event) => {
        const button = event.target.closest("[data-page]");
        if (button) this.loadInstructorStudents(Number(button.dataset.page));
      });
    document
      .getElementById("report-instructor-students-export")
      .addEventListener("click", () => this.exportInstructorStudents());
    document
      .getElementById("report-instructor-course-filters")
      .addEventListener("click", (event) => {
        const button = event.target.closest("[data-instructor-course]");
        if (!button) return;
        this.instructorCourseId = button.dataset.instructorCourse || "";
        this.loadInstructorStudents(1);
      });
    await this.load();
  }
  readFilters() {
    const form = new FormData(
      document.getElementById("universal-report-filters"),
    );
    ["branchId", "province", "city", "courseType", "dateFrom", "dateTo"].forEach((key) => {
      if (form.has(key)) this.filters[key] = form.get(key) || "";
    });
    this.page = 1;
  }
  scheduleFilterLoad() {
    clearTimeout(this.filterTimer);
    this.filterTimer = setTimeout(() => {
      this.readFilters();
      this.load();
    }, 180);
  }
  clearFilters() {
    clearTimeout(this.filterTimer);
    this.filters = { ...this.defaultFilters };
    const form = document.getElementById("universal-report-filters");
    form.querySelector('[name="province"]').value = this.filters.province;
    this.syncLocations();
    form.querySelector('[name="city"]').value = this.filters.city;
    const branch = form.querySelector('[name="branchId"]');
    if (branch) branch.value = this.filters.branchId;
    form.querySelector('[name="courseType"]').value = this.filters.courseType;
    form.querySelector('[name="dateFrom"]').value = this.filters.dateFrom;
    form.querySelector('[name="dateTo"]').value = this.filters.dateTo;
    this.page = 1;
    this.load();
  }
  async load() {
    const loadSequence = ++this.loadSequence;
    const body = document.getElementById("report-table-body");
    body.innerHTML =
      '<tr><td class="report-empty">Consultando información…</td></tr>';
    try {
      if (this.filters.type === "instructors") {
        const [generalResponse, academicResponse] = await Promise.all([
          AdminService.universalReport(this.filters),
          ManagerService.academic(this.filters),
        ]);
        if (loadSequence !== this.loadSequence) return;
        const general = generalResponse.data || {},
          data = academicResponse.data || {};
        const instructors = (data.instructors || []).filter((item) =>
          !this.filters.courseType || String(item.practice_area || "").toLowerCase() === this.filters.courseType
        );
        this.result = {
          rows: instructors,
          summary: general.summary || {},
          filters: general.filters || { branches: [] },
        };
        this.branchInstructorReport = data;
      } else {
        const response = await AdminService.universalReport(this.filters);
        if (loadSequence !== this.loadSequence) return;
        this.result = response.data;
        this.branchInstructorReport = null;
      }
      this.options = this.result.filters?.branches || [];
      this.fillLocations();
      this.paint();
    } catch (error) {
      body.innerHTML = `<tr><td class="report-empty">${esc(error.message || "No se pudo generar el reporte.")}</td></tr>`;
    }
  }
  fillLocations() {
    const province = document.querySelector('[name="province"]'),
      city = document.querySelector('[name="city"]'),
      branch = document.querySelector('[name="branchId"]'),
      selected = {
        province: this.filters.province,
        city: this.filters.city,
        branch: this.filters.branchId,
      };
    const provinces = [
      ...new Set(this.options.map((x) => x.province).filter(Boolean)),
    ];
    province.innerHTML = `<option value="">Todas</option>${provinces.map((x) => `<option ${x === selected.province ? "selected" : ""}>${esc(x)}</option>`).join("")}`;
    this.syncLocations();
    city.value = selected.city;
    if (branch) branch.value = selected.branch;
  }
  syncLocations() {
    const province = document.querySelector('[name="province"]').value,
      citySelect = document.querySelector('[name="city"]'),
      branchSelect = document.querySelector('[name="branchId"]'),
      currentCity = citySelect.value,
      currentBranch = branchSelect?.value || "",
      byProvince = this.options.filter(
        (x) => !province || x.province === province,
      ),
      cities = [...new Set(byProvince.map((x) => x.city).filter(Boolean))];
    citySelect.innerHTML = `<option value="">Todos</option>${cities.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("")}`;
    if (cities.includes(currentCity)) citySelect.value = currentCity;
    const city = citySelect.value,
      branches = byProvince.filter((x) => !city || x.city === city);
    if (branchSelect && branchSelect.tagName === "SELECT") {
      branchSelect.innerHTML = `<option value="">Todas las sucursales</option>${branches.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}`;
      if (branches.some((x) => String(x.id) === String(currentBranch)))
        branchSelect.value = currentBranch;
    }
  }
  paint() {
    this.page = 1;
    this.paintKpis();
    if (this.filters.type === "instructors") {
      this.paintBranchInstructorTable();
      document.getElementById("report-title").textContent = "Actividad de instructores";
      document.getElementById("report-description").textContent =
        "Datos detallados de desempeño e impacto académico de los instructores de tu sucursal.";
      return;
    }
    this.paintTable();
    const item = types[this.filters.type];
    document.getElementById("report-title").textContent = item.label;
    document.getElementById("report-description").textContent =
      item.description;
  }
  paintKpis() {
    const s = this.result.summary || {};
    const rows = this.result.rows || [];
    const computed = {};
    if (this.filters.type === "instructors" && this.branchInstructorReport) {
      computed.active_students = s.active_students ?? rows.reduce((sum, r) => sum + Number(r.students || 0), 0);
      computed.enrollments = s.enrollments ?? this.branchInstructorReport.enrollments ?? 0;
      computed.cycles = s.cycles ?? this.branchInstructorReport.cycles ?? 0;
      computed.instructors = s.instructors ?? (rows.length || 0);
      computed.collected = s.collected ?? this.branchInstructorReport.collected ?? 0;
      computed.services = s.services ?? this.branchInstructorReport.services ?? 0;
    }
    const cards = [
      ["today_enrollments", s.today_enrollments, "Matriculados hoy"],
      ["enrollments", computed.enrollments ?? s.enrollments, "Matrículas"],
      ["cycles", computed.cycles ?? s.cycles, "Ciclos"],
      ["instructors", computed.instructors ?? s.instructors, "Instructores"],
      ["payments", money(computed.collected ?? s.collected), "Ingresos cobrados"],
      ["services", computed.services ?? s.services, "Servicios"],
    ];
    document.getElementById("report-kpis").innerHTML = cards
      .map(([type, value, label]) => {
        const raw = value;
        const display = raw == null || raw === "" ? "—" : (typeof raw === "number" || /^\d+$/.test(String(raw)) ? number(raw) : raw);
        return `<button class="report-kpi ${type === this.filters.type ? "active" : ""}" data-report-type="${type}"><strong>${display}</strong><span>${label}</span><small>${types[type].description}</small></button>`;
      })
      .join("");
  }
  paintBranchInstructorTable() {
    const rows = this.result.rows || [];
    document.getElementById("report-table-head").innerHTML =
      `<tr><th>Instructor</th><th>Sucursal</th><th>Cursos</th><th>Estudiantes</th><th>Clases programadas</th><th>Horas impartidas</th><th>Área</th></tr>`;
    document.getElementById("report-table-body").innerHTML =
      rows.length
        ? rows
            .map(
              (row) =>
                `<tr><td><strong>${esc(row.name)}</strong><small>${esc(row.email || "")}</small></td><td>${esc(row.branch_name)}</td><td>${number(row.courses)}</td><td>${number(row.students)}</td><td>${number(row.scheduled_classes)}</td><td>${number(row.taught_hours)} h</td><td>${esc(row.practice_area || "")}</td></tr>`,
            )
            .join("")
        : `<tr><td colspan="7" class="report-empty">No existen instructores para esta consulta.</td></tr>`;
    document.getElementById("report-pagination").innerHTML = "";
  }
  async openCycleStudents(cycleId) {
    this.selectedCycleId = cycleId;
    this.cycleStudentsPage = 1;
    this.cycleStudents = [];
    const modal = document.getElementById("report-cycle-students-modal");
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    document.getElementById("report-cycle-students-table").innerHTML =
      '<p class="dashboard-empty">Cargando estudiantes…</p>';
    try {
      const response = await AdminService.courseReportStudents(cycleId);
      const report = response.data || {};
      this.selectedCycle = report.cycle || {};
      this.cycleStudents = report.students || [];
      document.getElementById("report-cycle-students-title").textContent =
        this.selectedCycle.code || "Estudiantes matriculados";
      document.getElementById("report-cycle-students-summary").textContent =
        `${number(this.cycleStudents.length)} estudiantes matriculados en este ciclo`;
      document.getElementById("report-cycle-students-meta").innerHTML =
        `<span>${esc(this.selectedCycle.course_name)}</span><span>${esc(this.selectedCycle.branch_name)}</span><span>${date(this.selectedCycle.start_date)} – ${date(this.selectedCycle.end_date)}</span>`;
      this.paintCycleStudents();
    } catch (error) {
      document.getElementById("report-cycle-students-table").innerHTML =
        `<p class="dashboard-empty">${esc(error.message || "No se pudieron cargar los estudiantes.")}</p>`;
    }
  }
  paintCycleStudents() {
    const pageSize = 7;
    const pages = Math.max(Math.ceil(this.cycleStudents.length / pageSize), 1);
    this.cycleStudentsPage = Math.min(Math.max(this.cycleStudentsPage, 1), pages);
    const visible = this.cycleStudents.slice(
      (this.cycleStudentsPage - 1) * pageSize,
      this.cycleStudentsPage * pageSize,
    );
    document.getElementById("report-cycle-students-table").innerHTML = visible.length
      ? `<table class="cycle-modal-table"><thead><tr><th>Cédula</th><th>Nombre</th><th>Correo</th><th>Sucursal</th><th>Fecha de registro</th></tr></thead><tbody>${visible.map((student) => `<tr><td>${esc(student.identification)}</td><td><strong>${esc(student.name)}</strong></td><td>${esc(student.email || "—")}</td><td>${esc(this.selectedCycle.branch_name)}</td><td>${date(student.registration_date || student.enrollment_date)}</td></tr>`).join("")}</tbody></table>`
      : '<p class="dashboard-empty">Este ciclo no tiene estudiantes matriculados.</p>';
    document.getElementById("report-cycle-students-pagination").innerHTML =
      `<button type="button" data-cycle-page="${this.cycleStudentsPage - 1}" ${this.cycleStudentsPage <= 1 ? "disabled" : ""}>Anterior</button><span>Página ${this.cycleStudentsPage} de ${pages}</span><button type="button" data-cycle-page="${this.cycleStudentsPage + 1}" ${this.cycleStudentsPage >= pages ? "disabled" : ""}>Siguiente</button>`;
  }
  async exportCycleStudents() {
    const button = document.getElementById("report-cycle-students-export");
    button.disabled = true;
    button.textContent = "Generando…";
    try {
      const file = await AdminService.exportCourseReportStudents(this.selectedCycleId);
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement("a");
      link.href = url; link.download = file.filename;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch (error) {
      alert(error.message || "No se pudo exportar el reporte del ciclo.");
    } finally {
      button.disabled = false;
      button.textContent = "Exportar reporte completo";
    }
  }
  closeCycleStudents() {
    const modal = document.getElementById("report-cycle-students-modal");
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
  }
  async openInstructorStudents(instructor) {
    this.selectedInstructor = instructor;
    this.instructorCourseId = "";
    document.getElementById("report-instructor-students-title").textContent = instructor.name;
    const modal = document.getElementById("report-instructor-students-modal");
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    await this.loadInstructorStudents(1);
  }
  async loadInstructorStudents(page = 1) {
    const table = document.getElementById("report-instructor-students-table");
    table.innerHTML = '<p class="dashboard-empty">Cargando estudiantes…</p>';
    try {
      const response = await ManagerService.instructorStudents({
          ...this.filters,
          instructorId: this.selectedInstructor.id,
          cycleId: this.instructorCourseId,
          page,
        }),
        report = response.data || {},
        pagination = report.pagination || {};
      document.getElementById("report-instructor-students-summary").textContent =
        `${number(pagination.total)} estudiantes en el periodo`;
      document.getElementById("report-instructor-course-filters").innerHTML =
        `<button class="${!this.instructorCourseId ? "is-active" : ""}" data-instructor-course="">Todos</button>${(report.courses || [])
          .map(
            (course) =>
              `<button class="${String(course.id) === String(this.instructorCourseId) ? "is-active" : ""}" data-instructor-course="${esc(course.id)}">${esc(course.name)}</button>`,
          )
          .join("")}`;
      table.innerHTML = report.data?.length
        ? `<table><thead><tr><th>Identificación</th><th>Estudiante</th><th>Curso</th><th>Fechas de clase</th><th>Clases</th><th>Asistencias</th><th>Horas</th></tr></thead><tbody>${report.data
            .map(
              (item) =>
                `<tr><td>${esc(item.identification)}</td><td><strong>${esc(item.name)}</strong><small>${esc(item.email || item.phone || "")}</small></td><td>${esc(item.course_name)}</td><td>${esc(item.class_dates || "Sin fecha")}</td><td>${number(item.classes)}</td><td>${number(item.attended)}</td><td>${number(item.hours)} h</td></tr>`,
            )
            .join("")}</tbody></table>`
        : '<p class="dashboard-empty">No hay estudiantes para esta selección.</p>';
      // Convert class dates column to a "Periodo del curso" like ManagerAcademicView
      const courseDate = (value) =>
          new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(
            "es-EC",
            { day: "numeric", month: "long", year: "numeric" },
          ),
        coursePeriod = (item) =>
          item.start_date && item.end_date
            ? `Del ${courseDate(item.start_date)} al ${courseDate(item.end_date)}`
            : "Sin fecha";
      const dateHeader = table.querySelector("thead th:nth-child(4)");
      if (dateHeader) dateHeader.textContent = "Periodo del curso";
      table.querySelectorAll("tbody tr").forEach((row, index) => {
        const cell = row.children[3];
        if (cell) cell.textContent = coursePeriod(report.data[index]);
      });
      document.getElementById("report-instructor-students-pagination").innerHTML =
        `<button type="button" data-page="${pagination.page - 1}" ${pagination.page <= 1 ? "disabled" : ""}>Anterior</button><span>Página ${number(pagination.page)} de ${number(pagination.totalPages)}</span><button type="button" data-page="${pagination.page + 1}" ${pagination.page >= pagination.totalPages ? "disabled" : ""}>Siguiente</button>`;
    } catch (error) {
      table.innerHTML = `<p class="dashboard-empty">${esc(error.message || "No se pudo cargar la información.")}</p>`;
    }
  }
  async exportInstructorStudents() {
    const button = document.getElementById("report-instructor-students-export");
    button.disabled = true;
    button.textContent = "Generando…";
    try {
      const file = await ManagerService.exportInstructorStudents({
          ...this.filters,
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
    const modal = document.getElementById("report-instructor-students-modal");
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
  }
  display(value, kind) {
    if (kind === "date") return date(value);
    if (kind === "money") return money(value);
    return esc(value ?? "—");
  }
  paintTable() {
    const definition = columns[this.filters.type],
      rows = this.result.rows || [],
      pages = Math.max(Math.ceil(rows.length / this.pageSize), 1);
    this.page = Math.min(this.page, pages);
    const visible = rows.slice(
      (this.page - 1) * this.pageSize,
      this.page * this.pageSize,
    );
    document.getElementById("report-table-head").innerHTML =
      `<tr>${definition.map(([, label]) => `<th>${label}</th>`).join("")}</tr>`;
    document.getElementById("report-table-body").innerHTML = visible.length
      ? visible
          .map(
            (row) => {
              const isCycle = this.filters.type === "cycles";
              return `<tr ${isCycle ? `class="cycle-row" data-cycle-id="${esc(row.id)}" title="Ver estudiantes matriculados"` : ""}>${definition.map(([key, , kind]) => `<td class="${isCycle && key === "code" ? "cycle-link" : ""}">${this.display(row[key], kind)}</td>`).join("")}</tr>`;
            },
          )
          .join("")
      : `<tr><td colspan="${definition.length}" class="report-empty">No existen datos para esta consulta.</td></tr>`;
    document.getElementById("report-pagination").innerHTML =
      `<button class="btn" data-page="${this.page - 1}" ${this.page <= 1 ? "disabled" : ""}>Anterior</button><span>Página ${this.page} de ${pages} · ${number(rows.length)} resultados</span><button class="btn" data-page="${this.page + 1}" ${this.page >= pages ? "disabled" : ""}>Siguiente</button>`;
  }
  async quickQuestion() {
    const question = document.getElementById("report-question-input").value.trim();
    if (!question) return;
    const answer = document.getElementById("assistant-answer");
    answer.textContent = "Consultando información…";
    answer.classList.add("show");
    try {
      const response = await AdminService.reportAssistant({ question, dateFrom: this.filters.dateFrom, dateTo: this.filters.dateTo });
      const result = response.data || {};
      answer.textContent = result.answer || "No se encontró una respuesta.";
      if (result.intent !== "unsupported") {
        this.filters = { ...this.filters, ...(result.filters || {}), type: result.reportType || this.filters.type };
        await this.load();
      }
    } catch (error) {
      answer.textContent = error.message || "No se pudo procesar la consulta.";
    }
  }
  requestExcelExport() {
    if (this.filters.type !== "instructors") return this.exportExcel("summary");
    const modal = document.getElementById("report-export-mode-modal");
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
  }
  closeExportMode() {
    const modal = document.getElementById("report-export-mode-modal");
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
  }
  async exportExcel(exportMode = "summary") {
    this.closeExportMode();
    const button = document.getElementById("report-export");
    button.disabled = true;
    button.textContent = "Generando…";
    try {
      const file = await AdminService.exportUniversalReport({ ...this.filters, exportMode }),
        url = URL.createObjectURL(file.blob),
        link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error.message || "No se pudo generar el archivo Excel.");
    } finally {
      button.disabled = false;
      button.textContent = "Exportar Excel";
    }
  }
}
