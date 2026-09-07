import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import AdminService from '../../services/AdminService.js';
import { authService } from '../../core/auth/AuthService.js';

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));

const date = (value) =>
  value
    ? /^\d{4}-\d{2}-\d{2}$/.test(String(value))
      ? String(value).split('-').reverse().join('/')
      : new Date(value).toLocaleDateString('es-EC')
    : '—';

const dateTime = (value) =>
  value
    ? new Date(value).toLocaleString('es-EC', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—';

const inputDateToday = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const download = ({ blob, filename }) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  setTimeout(() => URL.revokeObjectURL(url), 500);
};

export default class AtmAuthorizationView extends Component {
  constructor(props = {}) {
    super(props);

    this.user = authService.getCurrentUser();
    this.global = Boolean(
      this.user?.roles?.includes('ADMIN_SYSTEM')
    );

    this.branches = [];
    this.documents = [];
    this.permitCourses = [];
    this.selectedType = 'AUTHORIZATION';
  }

  async render() {
    try {
      this.user = await authService.refreshAuthorization();
      this.global = Boolean(
        this.user?.roles?.includes('ADMIN_SYSTEM')
      );
    } catch {}

    try {
      const response = await AdminService.atmAuthorizationBranches();
      const payload = response.data || [];
      this.branches = Array.isArray(payload) ? payload : payload.data || [];
    } catch {
      this.branches = [];
    }

    return SidebarLayout.render(`
      <main class="atm-office-page">

        <header class="atm-office-header">
          <div>
            <span>DOCUMENTACION ATM</span>

            <h1>
              Oficios y permisos de conduccion
            </h1>

            <p>
              Genera documentos oficiales usando las plantillas
              institucionales y consulta su historial.
            </p>
          </div>

          <button
            class="btn btn-primary"
            id="atm-new-office"
          >
            + Crear nuevo
          </button>
        </header>

        <section
          class="atm-type-cards"
          aria-label="Tipos de oficio"
        >

          <button
            class="atm-type-card is-active"
            data-type="AUTHORIZATION"
          >
            <i>AU</i>

            <div>
              <strong>
                Oficios de autorizacion
              </strong>

              <span>
                Autorizacion de matricula e inicio de clases
                para uno o varios cursos.
              </span>
            </div>

            <b id="atm-auth-count">
              0
            </b>
          </button>

          <button
            class="atm-type-card"
            data-type="PERMIT"
          >
            <i>PC</i>

            <div>
              <strong>
                Oficios de permiso de conduccion
              </strong>

              <span>
                Solicitud de permisos para un curso con su
                nomina de estudiantes en Excel.
              </span>
            </div>

            <b id="atm-permit-count">
              0
            </b>
          </button>

        </section>

        <section class="atm-history-panel">

          <div class="atm-history-head">

            <div>
              <h2 id="atm-list-title">
                Oficios de autorizacion generados
              </h2>

              <p>
                Documentos creados desde el sistema.
              </p>
            </div>

            <button
              class="btn btn-secondary"
              id="atm-refresh"
            >
              Actualizar
            </button>

          </div>

          <div
            id="atm-history"
            class="atm-history-body"
          >
            <div class="branch-empty">
              Cargando oficios...
            </div>
          </div>

        </section>

        <div id="atm-modal"></div>

      </main>
    `);
  }

  async mount() {
    await super.mount();

    document
      .querySelectorAll('.atm-type-card')
      .forEach((card) => {
        card.addEventListener('click', () => {
          this.selectedType = card.dataset.type;

          document
            .querySelectorAll('.atm-type-card')
            .forEach((item) => {
              item.classList.toggle(
                'is-active',
                item === card
              );
            });

          this.renderHistory();
        });
      });

    document
      .getElementById('atm-new-office')
      ?.addEventListener(
        'click',
        () => this.openTypePicker()
      );

    document
      .getElementById('atm-refresh')
      ?.addEventListener(
        'click',
        () => this.loadDocuments()
      );

    await this.loadDocuments();
  }

  async loadDocuments() {
    const host =
      document.getElementById('atm-history');

    if (host) {
      host.innerHTML = `
        <div class="branch-empty">
          Actualizando...
        </div>
      `;
    }

    try {
      this.documents = (
        await AdminService.atmAuthorizations()
      ).data || [];

      this.renderHistory();
    } catch (error) {
      if (host) {
        host.innerHTML = `
          <div class="alert alert-error">
            ${esc(error.message)}
          </div>
        `;
      }
    }
  }

  renderHistory() {
    const rows =
      this.documents.filter(
        (item) =>
          item.document_type === this.selectedType
      );

    document.getElementById(
      'atm-auth-count'
    ).textContent =
      this.documents.filter(
        (item) =>
          item.document_type === 'AUTHORIZATION'
      ).length;

    document.getElementById(
      'atm-permit-count'
    ).textContent =
      this.documents.filter(
        (item) =>
          item.document_type === 'PERMIT'
      ).length;

    document.getElementById(
      'atm-list-title'
    ).textContent =
      this.selectedType === 'PERMIT'
        ? 'Permisos de conduccion generados'
        : 'Oficios de autorizacion generados';

    const host =
      document.getElementById('atm-history');

    if (!host) {
      return;
    }

    if (!rows.length) {
      host.innerHTML = `
        <div class="atm-empty">
          <strong>
            Aun no existen documentos de este tipo
          </strong>

          <span>
            Selecciona "Crear nuevo" para generar el primero.
          </span>
        </div>
      `;

      return;
    }

    host.innerHTML = `
      <div class="atm-table-wrap">

        <table>

          <thead>
            <tr>
              <th>Oficio</th>
              <th>Sucursal</th>
              <th>Curso(s)</th>
              <th>Periodo</th>
              <th>Generado</th>
              <th>Responsable</th>
              <th class="atm-actions-column">Acciones</th>
            </tr>
          </thead>

          <tbody>

            ${rows.map((item) => {
              const courses =
                Array.isArray(item.courses) &&
                item.courses.length
                  ? item.courses
                  : [
                      {
                        courseCode:
                          item.course_code,

                        courseStart:
                          item.course_start,

                        courseEnd:
                          item.course_end,
                      },
                    ];

              return `
                <tr>

                  <td>
                    <strong>
                      ${esc(item.office_number)}
                    </strong>

                    <small>
                      ${
                        item.document_type === 'PERMIT'
                          ? 'Permiso de conduccion'
                          : 'Autorizacion'
                      }
                    </small>
                  </td>

                  <td>
                    ${esc(item.branch_name)}

                    <small>
                      ${esc(item.city || '')}
                    </small>
                  </td>

                  <td>
                    <span class="atm-count-pill">
                      ${courses.length}
                    </span>

                    ${
                      courses.length === 1
                        ? esc(
                            courses[0].courseCode ||
                            item.course_code
                          )
                        : 'cursos incluidos'
                    }
                  </td>

                  <td>
                    ${date(
                      courses[0].courseStart ||
                      item.course_start
                    )}

                    <small>
                      hasta
                      ${date(
                        courses[
                          courses.length - 1
                        ].courseEnd ||
                        item.course_end
                      )}
                    </small>
                  </td>

                  <td>
                    ${dateTime(item.generated_at)}
                  </td>

                  <td>
                    ${esc(item.generated_by)}
                  </td>

                  <td class="atm-actions-cell">

                    <div class="atm-file-actions">

                    ${
                      item.has_document
                        ? `
                          <button
                            class="btn btn-small atm-download"
                            data-id="${item.id}"
                          >
                            Word
                          </button>
                        `
                        : `
                          <small>
                            Registro anterior
                          </small>
                        `
                    }

                    ${
                      item.attachment_name
                        ? `
                          <button
                            class="btn btn-small atm-download-excel"
                            data-id="${item.id}"
                          >
                            Excel
                          </button>
                        `
                        : ''
                    }

                    <button
                      type="button"
                      class="atm-delete-document"
                      data-id="${item.id}"
                      data-office="${esc(item.office_number)}"
                      aria-label="Eliminar oficio"
                      title="Eliminar oficio"
                    >
                      &times;
                    </button>

                    </div>

                  </td>

                </tr>
              `;
            }).join('')}

          </tbody>

        </table>

      </div>
    `;

    host
      .querySelectorAll('.atm-download')
      .forEach((button) => {
        button.addEventListener(
          'click',
          async () => {
            download(
              await AdminService.downloadAtmAuthorization(
                button.dataset.id
              )
            );
          }
        );
      });

    host
      .querySelectorAll('.atm-download-excel')
      .forEach((button) => {
        button.addEventListener(
          'click',
          async () => {
            download(
              await AdminService.downloadAtmAuthorization(
                button.dataset.id,
                'excel'
              )
            );
          }
        );
      });

    host
      .querySelectorAll('.atm-delete-document')
      .forEach((button) => {
        button.addEventListener(
          'click',
          () => {
            this.openDeleteConfirmation(
              button.dataset.id,
              button.dataset.office
            );
          }
        );
      });
  }

  openTypePicker() {
    document.getElementById(
      'atm-modal'
    ).innerHTML = `
      <div class="branch-modal-backdrop">

        <section
          class="atm-modal atm-type-picker"
          role="dialog"
          aria-modal="true"
        >

          <header>

            <div>
              <h2>
                Crear nuevo oficio
              </h2>

              <p>
                Que documento deseas generar?
              </p>
            </div>

            <button
              class="atm-close"
              aria-label="Cerrar"
            >
              X
            </button>

          </header>

          <div class="atm-picker-options">

            <button data-office="AUTHORIZATION">
              <i>AU</i>

              <strong>
                Oficio de autorizacion
              </strong>

              <span>
                Puede incluir varios cursos del mes.
              </span>
            </button>

            <button data-office="PERMIT">
              <i>PC</i>

              <strong>
                Permiso de conduccion
              </strong>

              <span>
                Un curso con su nomina de estudiantes.
              </span>
            </button>

          </div>

        </section>

      </div>
    `;

    this.bindModalClose();

    document
      .querySelectorAll('[data-office]')
      .forEach((button) => {
        button.addEventListener(
          'click',
          () =>
            this.openOfficeForm(
              button.dataset.office
            )
        );
      });
  }

  branchField() {
    const fallbackBranchId = this.branches[0]?.id || this.user?.branch_id || '';

    return this.branches.length > 1
      ? `
        <label>
          Sucursal

          <select
            name="branchId"
            required
          >

            <option value="">
              Seleccionar sucursal...
            </option>

            ${this.branches.map(
              (branch) => `
                <option value="${branch.id}">
                  ${esc(branch.name)}
                  ·
                  ${esc(branch.city || '')}
                </option>
              `
            ).join('')}

          </select>
        </label>
      `
      : `
        <input
          type="hidden"
          name="branchId"
          value="${esc(
            fallbackBranchId
          )}"
        >
      `;
  }

  openOfficeForm(type) {
    const authorization =
      type === 'AUTHORIZATION';

    document.getElementById(
      'atm-modal'
    ).innerHTML = `
      <div class="branch-modal-backdrop">

        <section
          class="atm-modal atm-office-form-modal"
          role="dialog"
          aria-modal="true"
        >

          <header>

            <div>

              <span>
                ${
                  authorization
                    ? 'AUTORIZACION ATM'
                    : 'PERMISO DE CONDUCCION'
                }
              </span>

              <h2>
                ${
                  authorization
                    ? 'Nuevo oficio de autorizacion'
                    : 'Nuevo oficio de permiso'
                }
              </h2>

              <p>
                ${
                  authorization
                    ? 'Incluye todos los cursos que deban enviarse en este oficio.'
                    : 'Completa los datos del curso para generar el permiso de conduccion.'
                }
              </p>

            </div>

            <button
              class="atm-close"
              aria-label="Cerrar"
            >
              X
            </button>

          </header>

          <form id="atm-office-form">

            <input
              type="hidden"
              name="documentType"
              value="${type}"
            >

            <div class="atm-form-section">

              <h3>
                Datos del oficio
              </h3>

              <div class="atm-form-grid">
                ${this.branchField()}
              </div>

            </div>

            ${
              authorization
                ? `
                  <div class="atm-form-section">

                    <div class="atm-section-heading">

                      <div>
                        <h3>
                          Cursos incluidos
                        </h3>

                        <p>
                          Puedes enviar varios cursos
                          en un mismo oficio.
                        </p>
                      </div>

                      <button
                        type="button"
                        class="btn btn-secondary"
                        id="atm-add-course"
                      >
                        + Anadir otro curso
                      </button>

                    </div>

                    <div id="atm-course-list"></div>

                  </div>
                `
                : this.permitFields()
            }

            <div id="atm-message"></div>

            <footer>

              <button
                type="button"
                class="btn btn-secondary atm-cancel"
              >
                Cancelar
              </button>

              <button
                type="submit"
                class="btn btn-primary"
                id="atm-generate"
              >
                Generar y descargar Word
              </button>

            </footer>

          </form>

        </section>

      </div>
    `;

    this.bindModalClose();

    if (authorization) {
      this.addCourseRow();

      document
        .getElementById('atm-add-course')
        ?.addEventListener(
          'click',
          () => this.addCourseRow()
        );
    } else {
      this.bindPermitCourseSelection();
      this.loadPermitCourses();
    }

    document
      .getElementById('atm-office-form')
      ?.addEventListener(
        'submit',
        (event) =>
          this.submitOffice(event, type)
      );
  }

  permitFields() {
    return `
      <div class="atm-form-section">

        <div class="atm-form-grid">

          <label>
            Tipo de curso

            <select
              name="courseType"
              id="atm-permit-course-type"
              required
            >
              <option value="MOTO">
                Moto · Licencia A
              </option>

              <option value="AUTO">
                Automovil · Licencia B
              </option>
            </select>
          </label>

          <div class="atm-permit-cycle-field">
            <strong>
              Ciclos disponibles
            </strong>

            <div class="atm-cycle-dropdown">
              <button
                type="button"
                class="atm-cycle-toggle"
                id="atm-permit-cycle-toggle"
              >
                Seleccionar cursos
              </button>

              <div
                id="atm-permit-cycle"
                class="atm-permit-cycle-list"
              >
                Cargando ciclos...
              </div>
            </div>
          </div>

          <label>
            Numero de autorizacion ANT

            <input
              name="antAuthorization"
              required
              placeholder="Ej. ANT-DPM-2026-5788-E"
            >
          </label>

          <label>
            Inicio del curso

            <input
              type="date"
              name="courseStart"
              id="atm-permit-course-start"
              required
              readonly
            >
          </label>

          <label>
            Fin del curso

            <input
              type="date"
              name="courseEnd"
              id="atm-permit-course-end"
              required
              readonly
            >
          </label>

          <label>
            Cantidad de estudiantes

            <input
              type="number"
              name="studentCount"
              id="atm-permit-student-count"
              min="1"
              required
              readonly
            >
          </label>

          <label>
            Comprobante de deposito

            <input
              name="receiptNumber"
              placeholder="Numero de comprobante"
            >
          </label>

          <label>
            Banco

            <input
              name="bank"
              placeholder="Ej. Pichincha"
            >
          </label>

        </div>

        <div id="atm-permit-course-status" class="atm-course-status atm-course-status-compact">
          Buscando ciclos disponibles...
        </div>

        <div class="atm-permit-summary" id="atm-permit-summary"></div>

        <div class="atm-permit-actions">
          <button
            type="button"
            class="btn btn-secondary"
            id="atm-download-permit-excel"
            disabled
          >
            Descargar nomina Excel
          </button>

          <button
            type="button"
            class="btn btn-secondary"
            id="atm-download-permit-identifications"
            disabled
          >
            Descargar cédulas ZIP
          </button>

          <span>
            El Excel y el ZIP incluyen a todos los estudiantes matriculados en los ciclos seleccionados.
          </span>
        </div>

      </div>
    `;
  }

  bindPermitCourseSelection() {
    const form = document.getElementById('atm-office-form');
    const branchSelect = form?.querySelector('[name="branchId"]');

    branchSelect?.addEventListener('change', () => this.loadPermitCourses());

    document
      .getElementById('atm-permit-course-type')
      ?.addEventListener('change', () => {
        this.renderPermitCourseOptions();
        this.applySelectedPermitCourse();
      });

    document
      .getElementById('atm-permit-cycle')
      ?.addEventListener('change', () => this.applySelectedPermitCourse());

    document
      .getElementById('atm-permit-cycle-toggle')
      ?.addEventListener('click', () => {
        document
          .querySelector('.atm-cycle-dropdown')
          ?.classList.toggle('is-open');
      });

    document
      .getElementById('atm-download-permit-excel')
      ?.addEventListener('click', async () => {
        const selected = this.selectedPermitCourses();
        if (!selected.length) return;

        download(
          await AdminService.exportPermitStudents({
            branchId: this.currentPermitBranchId(),
            cycleIds: selected.map((item) => item.id).join(','),
            courseType: selected[0].courseType,
            courseStart: selected.reduce((min, item) => !min || item.courseStart < min ? item.courseStart : min, ''),
            courseEnd: selected.reduce((max, item) => !max || item.courseEnd > max ? item.courseEnd : max, ''),
          })
        );
      });

    document
      .getElementById('atm-download-permit-identifications')
      ?.addEventListener('click', async () => {
        const selected = this.selectedPermitCourses();
        if (!selected.length) return;
        download(
          await AdminService.exportPermitStudentIdentifications({
            branchId: this.currentPermitBranchId(),
            cycleIds: selected.map((item) => item.id).join(','),
            courseType: selected[0].courseType,
            courseStart: selected.reduce((min, item) => !min || item.courseStart < min ? item.courseStart : min, ''),
            courseEnd: selected.reduce((max, item) => !max || item.courseEnd > max ? item.courseEnd : max, ''),
          })
        );
      });
  }

  currentPermitBranchId() {
    return document
      .getElementById('atm-office-form')
      ?.querySelector('[name="branchId"]')
      ?.value || '';
  }

  selectedPermitCourse() {
    return this.selectedPermitCourses()[0] || null;
  }

  selectedPermitCourses() {
    const host = document.getElementById('atm-permit-cycle');
    const ids = [...(host?.querySelectorAll('input[type="checkbox"]:checked') || [])]
      .map((field) => field.value)
      .filter(Boolean);
    return this.permitCourses.filter((item) => ids.includes(String(item.id)));
  }

  selectedPermitCourseType() {
    return document.getElementById('atm-permit-course-type')?.value || 'MOTO';
  }

  filteredPermitCourses() {
    const type = this.selectedPermitCourseType();
    return this.permitCourses.filter((item) => item.courseType === type);
  }

  renderPermitCourseOptions() {
    const host = document.getElementById('atm-permit-cycle');
    const status = document.getElementById('atm-permit-course-status');
    if (!host) return;

    const type = this.selectedPermitCourseType();
    const label = type === 'AUTO' ? 'automovil' : 'moto';
    const courses = this.filteredPermitCourses();

    if (!this.permitCourses.length) {
      host.innerHTML = '<p class="muted">No hay ciclos disponibles</p>';
      if (status) status.textContent = 'No hay ciclos disponibles para permiso.';
      return;
    }

    if (!courses.length) {
      host.innerHTML = `<p class="muted">No hay ciclos de ${label}</p>`;
      if (status) status.textContent = `No hay ciclos de ${label} con estudiantes matriculados.`;
      return;
    }

    host.innerHTML = `
      ${courses.map((course) => `
        <label class="atm-permit-cycle-option">
          <input
            type="checkbox"
            name="cycleIds"
            value="${esc(course.id)}"
          >

          <span>
            <b>${esc(course.code)}</b>
            <small>${esc(course.courseName)}</small>
          </span>
        </label>
      `).join('')}
    `;

    if (status) {
      status.textContent = `${courses.length} proximo(s) de ${label} listos para permiso. Marca uno o varios ciclos.`;
    }
  }

  async loadPermitCourses() {
    const host = document.getElementById('atm-permit-cycle');
    const status = document.getElementById('atm-permit-course-status');
    const branchId = this.currentPermitBranchId();

    if (!host) return;

    host.innerHTML = 'Cargando ciclos...';
    if (status) status.textContent = 'Buscando próximos ciclos con estudiantes matriculados...';

    if (!branchId) {
      this.permitCourses = [];
      host.innerHTML = '<p class="muted">Selecciona una sucursal primero...</p>';
      if (status) status.textContent = 'Selecciona una sucursal para consultar sus ciclos.';
      this.applySelectedPermitCourse();
      return;
    }

    try {
      this.permitCourses = (
        await AdminService.permitCourseOptions({ branchId })
      ).data || [];

      if (!this.permitCourses.length) {
        host.innerHTML = '<p class="muted">No hay ciclos disponibles</p>';
        if (status) status.textContent = 'No hay próximos cursos con estudiantes matriculados.';
        this.applySelectedPermitCourse();
        return;
      }

      this.renderPermitCourseOptions();
    } catch (error) {
      this.permitCourses = [];
      host.innerHTML = '<p class="muted">Error al cargar ciclos</p>';
      if (status) status.textContent = error.message || 'No fue posible consultar los ciclos.';
    }

    this.applySelectedPermitCourse();
  }

  applySelectedPermitCourse() {
    const selected = this.selectedPermitCourses();
    const first = selected[0] || null;
    const courseStart = selected.reduce((min, item) => !min || item.courseStart < min ? item.courseStart : min, '');
    const courseEnd = selected.reduce((max, item) => !max || item.courseEnd > max ? item.courseEnd : max, '');
    const enrolledStudents = selected.reduce((total, item) => total + Number(item.enrolledStudents || 0), 0);
    const setValue = (id, value) => {
      const field = document.getElementById(id);
      if (field) field.value = value || '';
    };

    setValue('atm-permit-course-start', courseStart);
    setValue('atm-permit-course-end', courseEnd);
    setValue('atm-permit-student-count', enrolledStudents || '');

    const summary = document.getElementById('atm-permit-summary');
    if (summary) {
      summary.innerHTML = selected.length
        ? `
          <strong>${selected.length} ciclo(s) seleccionado(s)</strong>
          <span>${esc(first.branchName)} - ${esc(first.courseName)}</span>
          <span>${enrolledStudents} estudiante(s) matriculado(s)</span>
          <span>${esc(selected.map((item) => item.code).join(', '))}</span>
          <span>${date(courseStart)} al ${date(courseEnd)}</span>
        `
        : '';
    }

    const toggle = document.getElementById('atm-permit-cycle-toggle');
    if (toggle) {
      toggle.textContent = selected.length
        ? `${selected.length} curso(s) seleccionado(s)`
        : 'Seleccionar cursos';
    }

    const excelButton = document.getElementById('atm-download-permit-excel');
    if (excelButton) excelButton.disabled = !selected.length;
    const identificationsButton = document.getElementById('atm-download-permit-identifications');
    if (identificationsButton) identificationsButton.disabled = !selected.length;
  }

  addCourseRow() {
    const host =
      document.getElementById(
        'atm-course-list'
      );

    if (!host) {
      return;
    }

    const index =
      host.children.length;
    const defaultDate = inputDateToday();
    const selectedCourseType =
      host
        .querySelector('[data-key="courseType"]')
        ?.value || 'MOTO';

    host.insertAdjacentHTML(
      'beforeend',
      `
        <article
          class="atm-course-row"
          data-index="${index}"
        >

          <div class="atm-course-row-head">

            <strong>
              Curso ${index + 1}
            </strong>

            ${
              index
                ? `
                  <button
                    type="button"
                    class="atm-remove-course"
                  >
                    Eliminar
                  </button>
                `
                : ''
            }

          </div>

          <div class="atm-form-grid">

            <label>
              Tipo de curso

              <select data-key="courseType">
                <option value="MOTO" ${selectedCourseType === 'MOTO' ? 'selected' : ''}>
                  Moto · Licencia A
                </option>

                <option value="AUTO" ${selectedCourseType === 'AUTO' ? 'selected' : ''}>
                  Automovil · Licencia B
                </option>
              </select>
            </label>

            <label>
              Inicio de inscripcion

              <input
                type="date"
                data-key="registrationStart"
                value="${defaultDate}"
                required
              >
            </label>

            <label>
              Fin de inscripcion

              <input
                type="date"
                data-key="registrationEnd"
                value="${defaultDate}"
                required
              >
            </label>

            <label>
              Inicio del curso

              <input
                type="date"
                data-key="courseStart"
                value="${defaultDate}"
                required
              >
            </label>

            <label>
              Fin del curso

              <input
                type="date"
                data-key="courseEnd"
                value="${defaultDate}"
                required
              >
            </label>

            <label>
              Comprobante de deposito

              <input
                data-key="receiptNumber"
                placeholder="Opcional"
              >
            </label>

          </div>

        </article>
      `
    );

    host
      .lastElementChild
      .querySelector(
        '.atm-remove-course'
      )
      ?.addEventListener(
        'click',
        (event) => {
          event.currentTarget
            .closest('.atm-course-row')
            .remove();

          this.renumberCourses();
        }
      );
  }

  renumberCourses() {
    document
      .querySelectorAll(
        '.atm-course-row'
      )
      .forEach(
        (row, index) => {
          row.querySelector(
            'strong'
          ).textContent =
            `Curso ${index + 1}`;
        }
      );
  }

  bindModalClose() {
    document
      .querySelector('.atm-close')
      ?.addEventListener(
        'click',
        () => this.closeModal()
      );

    document
      .querySelector('.atm-cancel')
      ?.addEventListener(
        'click',
        () => this.closeModal()
      );
  }

  closeModal() {
    const host =
      document.getElementById(
        'atm-modal'
      );

    if (host) {
      host.innerHTML = '';
    }
  }

  async submitOffice(event, type) {
    event.preventDefault();

    const form =
      event.currentTarget;

    const button =
      document.getElementById(
        'atm-generate'
      );

    const message =
      document.getElementById(
        'atm-message'
      );

    const formData =
      new FormData(form);

    const payload = {
      documentType: type,
      branchId:
        formData.get('branchId'),
    };

    if (
      type === 'AUTHORIZATION'
    ) {
      payload.courses = [
        ...document.querySelectorAll(
          '.atm-course-row'
        ),
      ].map((row) =>
        Object.fromEntries(
          [
            ...row.querySelectorAll(
              '[data-key]'
            ),
          ].map((field) => [
            field.dataset.key,
            field.value,
          ])
        )
      );
    } else {
      const selected =
        this.selectedPermitCourses();

      payload.course =
        Object.fromEntries(
          [
            'cycleId',
            'courseType',
            'antAuthorization',
            'courseStart',
            'courseEnd',
            'studentCount',
            'receiptNumber',
            'bank',
          ].map((key) => [
            key,
            formData.get(key),
          ])
        );

      if (selected.length) {
        payload.course.cycleIds = selected.map((item) => item.id);
        payload.course.cycleId = selected[0].id;
        payload.course.courseType = selected[0].courseType;
        payload.course.courseStart = selected.reduce((min, item) => !min || item.courseStart < min ? item.courseStart : min, '');
        payload.course.courseEnd = selected.reduce((max, item) => !max || item.courseEnd > max ? item.courseEnd : max, '');
        payload.course.studentCount = selected.reduce((total, item) => total + Number(item.enrolledStudents || 0), 0);
      }
    }

    button.disabled = true;
    button.textContent =
      'Generando oficio...';

    message.innerHTML = '';

    try {
      download(
        await AdminService
          .generateAtmAuthorization(
            payload
          )
      );

      this.closeModal();

      await this.loadDocuments();

      this.selectedType = type;

      document
        .querySelectorAll(
          '.atm-type-card'
        )
        .forEach((card) => {
          card.classList.toggle(
            'is-active',
            card.dataset.type === type
          );
        });

      this.renderHistory();

    } catch (error) {
      message.innerHTML = `
        <div class="alert alert-error">
          ${esc(error.message)}
        </div>
      `;

      button.disabled = false;
      button.textContent =
        'Generar y descargar Word';
    }
  }

  openDeleteConfirmation(
    id,
    officeNumber
  ) {
    document.getElementById(
      'atm-modal'
    ).innerHTML = `
      <div class="branch-modal-backdrop">

        <section
          class="atm-modal atm-delete-confirm"
          role="dialog"
          aria-modal="true"
        >

          <div class="atm-delete-header">

            <h2>
              Eliminar oficio
            </h2>

            <button
              class="atm-close"
              aria-label="Cerrar"
            >
              ✕
            </button>

          </div>

          <div class="atm-delete-body">

            <div class="atm-delete-message">

              <p class="atm-delete-question">
                ¿Está seguro de eliminar este oficio?
              </p>

              <div class="atm-delete-office-box">

                <span class="atm-delete-office-label">
                  Oficio:
                </span>

                <p class="atm-delete-office-number">
                  ${esc(officeNumber)}
                </p>

              </div>

            </div>

            <div class="atm-delete-alert">

              <svg
                class="alert-icon"
                viewBox="0 0 24 24"
                fill=" ne"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                ></circle>

                <line
                  x1="12"
                  y1="8"
                  x2="12"
                  y2="12"
                ></line>

                <line
                  x1="12"
                  y1="16"
                  x2="12.01"
                  y2="16"
                ></line>
              </svg>

              <div>

                <p class="alert-title">
                  Advertencia importante
                </p>

                <p class="alert-text">
                  Esta acción eliminará el registro
                  y los archivos asociados a este oficio.
                  Esta operación no se puede deshacer.
                </p>

              </div>

            </div>

          </div>

          <div class="atm-delete-footer">

            <button
              type="button"
              class="btn btn-secondary atm-cancel"
            >
              Cancelar
            </button>

            <button
              type="button"
              class="btn btn-danger atm-delete-confirm-btn"
              data-id="${id}"
            >
              Eliminar oficio
            </button>

          </div>

        </section>

      </div>
    `;

    this.bindModalClose();

    document
      .querySelector(
        '.atm-delete-confirm-btn'
      )
      ?.addEventListener(
        'click',
        () =>
          this.deleteDocument(id)
      );
  }

  async deleteDocument(id) {
    const button =
      document.querySelector(
        '.atm-delete-confirm-btn'
      );

    if (!button) {
      return;
    }

    button.disabled = true;

    const originalText =
      button.textContent;

    button.textContent =
      'Eliminando...';

    try {
      await AdminService
        .deleteAtmAuthorization(id);

      this.closeModal();

      await this.loadDocuments();

      this.renderHistory();

      this.showSuccessNotification(
        'Oficio eliminado correctamente.'
      );

    } catch (error) {
      button.disabled = false;

      button.textContent =
        originalText;

      const body =
        document.querySelector(
          '.atm-delete-body'
        );

      if (body) {
        const previousError =
          body.querySelector(
            '.atm-delete-error'
          );

        previousError?.remove();

        const errorDiv =
          document.createElement(
            'div'
          );

        errorDiv.className =
          'alert alert-error atm-delete-error';

        errorDiv.style.marginBottom =
          '1rem';

        errorDiv.textContent =
          error.message ||
          'No fue posible eliminar el oficio.';

        body.insertBefore(
          errorDiv,
          body.firstChild
        );
      }
    }
  }

  showSuccessNotification(message) {
    const notification =
      document.createElement('div');

    notification.className =
      'atm-notification atm-notification-success';

    notification.textContent =
      message;

    document.body.appendChild(
      notification
    );

    setTimeout(() => {
      notification.classList.add(
        'show'
      );
    }, 10);

    setTimeout(() => {
      notification.classList.remove(
        'show'
      );

      setTimeout(
        () =>
          notification.remove(),
        300
      );
    }, 3000);
  }
}
