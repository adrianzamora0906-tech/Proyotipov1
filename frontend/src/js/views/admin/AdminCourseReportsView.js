import Component from "../../components/Component.js";
import SidebarLayout from "../../layouts/SidebarLayout.js";
import AdminService from "../../services/AdminService.js";

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const date = (value) =>
  value
    ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(
        "es-EC",
      )
    : "—";

export default class AdminCourseReportsView extends Component {
  constructor(props = {}) {
    super(props);
    this.filters = {};
    this.result = { data: [], filters: { branches: [], courses: [] } };
  }
  async render() {
    try {
      this.result = (await AdminService.courseReports(this.filters)).data;
    } catch (error) {
      this.error = error.message;
    }
    return SidebarLayout.render(
      `<main class="admin-course-reports" style="padding:28px;max-width:1450px;margin:auto"><style>.admin-report-filter{display:grid;grid-template-columns:1.2fr 1fr 1fr 1fr auto;gap:12px;align-items:end;padding:18px;border:1px solid #e4e7ec;border-radius:14px;background:#fff}.admin-report-filter label{display:grid;gap:6px;font-size:12px}.admin-report-filter select,.admin-report-filter input{height:42px;border:1px solid #d0d5dd;border-radius:9px;padding:0 10px}.admin-report-table{width:100%;border-collapse:collapse}.admin-report-table th,.admin-report-table td{padding:13px;border-bottom:1px solid #eaecf0;text-align:left}.admin-report-table th{background:#f9fafb;font-size:12px}.admin-report-card{margin-top:18px;border:1px solid #e4e7ec;border-radius:14px;background:#fff;overflow:auto}@media(max-width:850px){.admin-report-filter{grid-template-columns:1fr 1fr}}</style><header class="page-header"><div><h1>Reportes de cursos</h1><p>Consulta operativa de ciclos y estudiantes por sucursal.</p></div></header>${this.error ? `<div class="alert alert-error">${esc(this.error)}</div>` : ""}<form class="admin-report-filter" id="admin-report-filter"><label>Curso<select name="courseId"><option value="">Todos</option>${this.result.filters.courses.map((item) => `<option value="${item.id}">${esc(item.name)}</option>`).join("")}</select></label><label>Estado<select name="status"><option value="">Todos</option><option value="vigente">Vigentes</option><option value="finalizado">Finalizados</option><option value="proximo">Próximos</option></select></label><label>Desde<input type="date" name="dateFrom"></label><label>Hasta<input type="date" name="dateTo"></label><button type="button" class="btn btn-secondary" id="admin-report-clear">Limpiar filtros</button></form><section class="admin-report-card"><table class="admin-report-table"><thead><tr><th>Curso</th><th>Sucursal</th><th>Inicio</th><th>Fin</th><th>Estudiantes</th><th>Estado</th></tr></thead><tbody id="admin-report-body">${this.rows()}</tbody></table></section></main>`,
    );
  }
  rows() {
    return this.result.data.length
      ? this.result.data
          .map(
            (row) =>
              `<tr><td><strong>${esc(row.course_name)}</strong><small>${esc(row.code)}</small></td><td>${esc(row.branch_name)}</td><td>${date(row.start_date)}</td><td>${date(row.end_date)}</td><td>${Number(row.student_count) || 0}</td><td>${esc(row.report_status)}</td></tr>`,
          )
          .join("")
      : '<tr><td colspan="6" style="text-align:center;padding:45px">No existen ciclos para esta consulta.</td></tr>';
  }
  async mount() {
    const form = document.getElementById("admin-report-filter");
    const update = async () => {
        const data = new FormData(form);
        this.filters = Object.fromEntries(data.entries());
        try {
          this.result = (await AdminService.courseReports(this.filters)).data;
          document.getElementById("admin-report-body").innerHTML = this.rows();
        } catch (error) {
          document.getElementById("admin-report-body").innerHTML =
            `<tr><td colspan="6">${esc(error.message)}</td></tr>`;
        }
    };
    form.addEventListener("submit", (event) => event.preventDefault());
    form.querySelectorAll("select,input").forEach((field) => field.addEventListener("change", update));
    document.getElementById("admin-report-clear").addEventListener("click", () => { form.reset(); update(); });
  }
}
