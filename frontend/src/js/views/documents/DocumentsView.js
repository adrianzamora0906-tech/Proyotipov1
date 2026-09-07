import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import ApiService from '../../core/api/apiService.js';
import StringHelper from '../../helpers/StringHelper.js';
import StudentService from '../../services/StudentService.js';
import { authService } from '../../core/auth/AuthService.js';

class DocumentsView extends Component {
  async render() {
    let students = [];
    try {
      const result = await ApiService.getDocumentStudentSummaries();
      students = result.success ? result.data : [];
    } catch (error) {
      console.warn('No se pudo cargar la documentacion:', error.message);
    }
    if (students.length === 0) students = await this.getFallbackSummaries();
    const currentUser = authService.getCurrentUser();
    const roles = currentUser?.roles || [];
    const hasGlobalScope = roles.includes('SYSTEM_ADMIN') || roles.includes('GENERAL_MANAGER');
    if (!hasGlobalScope && currentUser?.city) {
      students = students.filter(student => String(student.city || '').toLowerCase() === String(currentUser.city).toLowerCase());
    }
    this.students = students;
    this.activeType = 'uploaded';
    this.currentPage = 1;
    this.pageSize = 7;
    const counts = this.getCounts();
    const courses = [...new Set(students.map(item => item.course).filter(Boolean))].sort();
    const branches = [...new Set(students.map(item => item.branch).filter(Boolean))].sort();
    const documentTypes = [...new Set(students.flatMap(item => [
      ...(item.missingDocuments || []).map(type => this.getDocumentLabel(type)),
      ...(item.documents || []).map(document => this.getDocumentLabel(document.type)),
    ]).filter(Boolean))].sort();
    const content = `
      <div class="documents-page">
        <div class="page-header">
          <h1>Documentacion</h1>
          <p>Consulta los documentos subidos y los que aun faltan por estudiante.</p>
        </div>
        <div class="stats-grid">
          ${this.renderFilter('uploaded', 'Estudiantes con expediente completo', counts.uploaded, 'var(--success)', true)}
          ${this.renderFilter('missing', 'Estudiantes con documentos pendientes', counts.missing, 'var(--warning)')}
        </div>
        <form class="student-filter-bar document-filter-bar" id="document-filter-form">
          <label>Buscar<input class="form-input" name="search" placeholder="Cédula o nombre del estudiante..."></label>
          <label>Documento<select class="form-select" name="document"><option value="">Todos los documentos</option>${documentTypes.map(value => `<option value="${value}">${value}</option>`).join('')}</select></label>
          <label>Curso<select class="form-select" name="course"><option value="">Todos los cursos</option>${courses.map(value => `<option value="${value}">${value}</option>`).join('')}</select></label>
          <label>Sucursal<select class="form-select" name="branch"><option value="">Todas las sucursales</option>${branches.map(value => `<option value="${value}">${value}</option>`).join('')}</select></label>
          <button class="btn btn-secondary" type="button" id="clear-document-filters">Limpiar filtros</button>
        </form>
        <div class="card">
          <div class="card-header">
            <h3 class="card-title" id="document-table-title">Estudiantes con expediente completo</h3>
            <span class="badge badge-success" id="document-table-count">${counts.uploaded}</span>
          </div>
          <div class="card-body" style="overflow-x:auto;">
            <table class="table">
              <thead>
                <tr><th>Cedula</th><th>Estudiante</th><th>Curso</th><th>Sucursal</th><th>Documentos</th><th>Accion</th></tr>
              </thead>
              <tbody id="document-students-body">${this.renderRows('uploaded', 1)}</tbody>
            </table>
            <div id="document-pagination"></div>
          </div>
        </div>
      </div>`;
    const layout = await SidebarLayout.render(content);
    setTimeout(() => SidebarLayout.attachEventListeners(), 0);
    return layout;
  }

  getCounts() {
    return {
      uploaded: this.students.filter(student => Number(student.uploadedCount || 0) === 3).length,
      missing: this.students.filter(student => Number(student.missingCount || 0) > 0).length,
    };
  }

  getDocumentLabel(type) {
    return ({
      cedula: 'Cédula',
      certificado_bachiller: 'Certificado de estudio',
      carnet_tipo_sangre: 'Carnet de tipo sanguíneo',
      Cedula: 'Cédula',
      'Carnet de tipo sanguineo': 'Carnet de tipo sanguíneo',
    })[type] || type;
  }

  async getFallbackSummaries() {
    const students = await StudentService.getAllStudents({ scope: 'all' });
    return students.map(student => ({
      studentId: student.id,
      cedula: student.cedula,
      studentName: `${student.firstName} ${student.lastName}`,
      city: student.city || student.city_name || 'N/A',
      branch: student.branch || student.branch_name || 'N/A',
      course: student.course || 'Sin curso',
      uploadedCount: 0,
      missingCount: 3,
      missingDocuments: ['Cedula', 'Certificado de estudio', 'Carnet de tipo sanguineo'],
    }));
  }

  renderFilter(type, label, count, color, active = false) {
    const icon = type === 'uploaded' ? '✓' : '!';
    return `
      <button class="stat-card document-filter ${active ? 'active' : ''}" data-type="${type}"
        style="border:none;cursor:pointer;text-align:left">
        <div class="stat-icon" style="color:${color}">${icon}</div>
        <div><div class="stat-number">${count}</div><div class="stat-label">${label}</div></div>
      </button>`;
  }

  getFilteredStudents(type) {
    const form = document.getElementById('document-filter-form');
    const filters = form ? Object.fromEntries(new FormData(form)) : {};
    const search = String(filters.search || '').trim().toLowerCase();
    return this.students.filter(student => {
      const isComplete = Number(student.uploadedCount || 0) === 3 && Number(student.missingCount || 0) === 0;
      const hasPendingDocuments = Number(student.missingCount || 0) > 0;
      if (type === 'uploaded' ? !isComplete : !hasPendingDocuments) return false;
      if (search && !`${student.cedula || ''} ${student.studentName || ''}`.toLowerCase().includes(search)) return false;
      if (filters.course && student.course !== filters.course) return false;
      if (filters.branch && student.branch !== filters.branch) return false;
      if (filters.document) {
        const available = type === 'uploaded'
          ? (student.documents || []).map(document => this.getDocumentLabel(document.type))
          : (student.missingDocuments || []).map(document => this.getDocumentLabel(document));
        if (!available.includes(filters.document)) return false;
      }
      return true;
    });
  }

  renderRows(type, page = this.currentPage) {
    const filtered = this.getFilteredStudents(type);
    const start = (page - 1) * this.pageSize;
    const rows = filtered.slice(start, start + this.pageSize);
    if (!rows.length) {
      return `<tr><td colspan="6" style="text-align:center;color:var(--gray-500);padding:2rem">
        No hay estudiantes con documentación ${type === 'uploaded' ? 'completa' : 'pendiente'}.
      </td></tr>`;
    }
    return rows.map(student => {
      const detail = type === 'uploaded'
        ? '3 de 3 entregados'
        : (student.missingDocuments || []).join(', ');
      return `
        <tr>
          <td>${StringHelper.normalizeCedula(student.cedula || '')}</td>
          <td>${student.studentName}</td>
          <td>${student.course || 'N/A'}</td>
          <td>${student.branch || 'N/A'}</td>
          <td>${detail}</td>
          <td><button class="btn btn-small btn-primary open-student-documents" data-student-id="${student.studentId}">
            ${type === 'uploaded' ? 'Ver documentos' : 'Subir documento'}
          </button></td>
        </tr>`;
    }).join('');
  }

  async mount() {
    document.querySelectorAll('.document-filter').forEach(button => {
      button.addEventListener('click', () => this.selectType(button.dataset.type));
    });
    const filterForm = document.getElementById('document-filter-form');
    const applyFilters = () => { this.currentPage = 1; this.updateTable(); };
    filterForm?.addEventListener('submit', event => event.preventDefault());
    filterForm?.querySelectorAll('select').forEach(select => select.addEventListener('change', applyFilters));
    let searchTimer;
    filterForm?.elements.search?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(applyFilters, 250);
    });
    document.getElementById('clear-document-filters')?.addEventListener('click', () => {
      filterForm.reset();
      applyFilters();
    });
    this.updateTable();
  }

  selectType(type) {
    this.activeType = type;
    this.currentPage = 1;
    document.querySelectorAll('.document-filter').forEach(button => {
      button.classList.toggle('active', button.dataset.type === type);
    });
    const uploaded = type === 'uploaded';
    document.getElementById('document-table-title').textContent = uploaded
      ? 'Estudiantes con expediente completo'
      : 'Estudiantes con documentos pendientes';
    this.updateTable();
  }

  updateTable() {
    const type = this.activeType;
    const filtered = this.getFilteredStudents(type);
    const totalPages = Math.max(Math.ceil(filtered.length / this.pageSize), 1);
    this.currentPage = Math.min(this.currentPage, totalPages);
    document.getElementById('document-students-body').innerHTML = this.renderRows(type, this.currentPage);
    const badge = document.getElementById('document-table-count');
    badge.textContent = filtered.length;
    badge.className = `badge ${type === 'uploaded' ? 'badge-success' : 'badge-warning'}`;
    document.getElementById('document-pagination').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:1rem 0 0;">
        <span>${filtered.length} estudiantes · Página ${this.currentPage} de ${totalPages}</span>
        <div><button type="button" class="btn btn-secondary document-page" data-page="${this.currentPage - 1}" ${this.currentPage <= 1 ? 'disabled' : ''}>Anterior</button>
        <button type="button" class="btn btn-primary document-page" data-page="${this.currentPage + 1}" ${this.currentPage >= totalPages ? 'disabled' : ''}>Siguiente</button></div>
      </div>`;
    document.querySelectorAll('.document-page').forEach(button => button.addEventListener('click', () => {
      this.currentPage = Number(button.dataset.page) || 1;
      this.updateTable();
    }));
    this.bindOpenButtons();
  }

  bindOpenButtons() {
    document.querySelectorAll('.open-student-documents').forEach(button => {
      button.addEventListener('click', () => {
        window.history.pushState(null, null, `/student-profile/${button.dataset.studentId}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
        setTimeout(() => document.querySelector('.tab-button[data-tab="documents"]')?.click(), 150);
      });
    });
  }
}

export default DocumentsView;
