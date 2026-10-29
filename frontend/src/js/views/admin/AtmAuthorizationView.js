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
                    ${item.document_type==='PERMIT'?`<small>${esc(({DRAFT:'Borrador',CONFIRMED:'Compra confirmada',CANCELLED:'Compra anulada'})[item.purchase_status]||'Registro anterior sin confirmación')}${item.purchase_status?` · ${Number(item.purchase_count||0)} estudiantes`:''}</small>${item.confirmed_at?`<small>${dateTime(item.confirmed_at)}</small>`:''}`:''}
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
                    ${item.purchase_status==='DRAFT'?`<button type="button" class="btn btn-small atm-confirm-purchase" data-id="${esc(item.id)}" data-count="${Number(item.purchase_count||0)}">Confirmar compra</button>`:''}
                    ${item.purchase_status==='CONFIRMED'?`<button type="button" class="btn btn-small atm-cancel-purchase" data-id="${esc(item.id)}">Anular compra</button>`:''}

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

                    ${!item.purchase_status||item.purchase_status==='DRAFT'?`<button
                      type="button"
                      class="atm-delete-document"
                      data-id="${item.id}"
                      data-office="${esc(item.office_number)}"
                      aria-label="Eliminar oficio"
                      title="Eliminar oficio"
                    >
                      &times;
                    </button>`:''}

                    </div>

                  </td>

                </tr>
              `;
            }).join('')}

          </tbody>

        </table>

      </div>
    `;

    host.querySelectorAll('.atm-confirm-purchase,.atm-cancel-purchase').forEach(button=>{
      button.addEventListener('click',async()=>{
        const cancel=button.classList.contains('atm-cancel-purchase');
        let reason='';
        if(cancel){reason=window.prompt('Motivo de anulación de la compra:')?.trim();if(!reason)return;}
        else if(!window.confirm(`¿Confirmar la compra para ${button.dataset.count} estudiantes de este oficio?`))return;
        button.disabled=true;
        try{
          const result=cancel?await AdminService.cancelPermitPurchase(button.dataset.id,reason):await AdminService.confirmPermitPurchase(button.dataset.id);
          if(result.success===false)throw new Error(result.error?.message||result.error||'No se pudo actualizar la compra.');
          await this.loadDocuments();this.renderHistory();
        }catch(error){button.disabled=false;host.querySelector('.atm-purchase-error')?.remove();host.insertAdjacentHTML('afterbegin',`<div class="alert alert-error atm-purchase-error" role="alert">${esc(error.message||'No se pudo actualizar la compra.')}</div>`);}
      });
    });

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

          <label>
            Numero de autorizacion ANT

            <input
              name="antAuthorization"
              required
              placeholder="Ej. ANT-DPM-2026-5788-E"
            >
          </label>

          <label>
            Matrícula desde

            <input
              type="date"
              name="courseStart"
              id="atm-permit-course-start"
              required
            >
          </label>

          <label>
            Matrícula hasta

            <input
              type="date"
              name="courseEnd"
              id="atm-permit-course-end"
              required
            >
          </label>

          <label>
            Cantidad de estudiantes

            <input
              type="number"
              name="studentCount"
              id="atm-permit-student-count"
              readonly
              min="1"
              required
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
          Selecciona las fechas de matrícula.
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

        </div>

      </div>
    `;
  }

  bindPermitCourseSelection() {
    const form=document.getElementById('atm-office-form');
    for(const selector of ['[name="branchId"]','#atm-permit-course-type','#atm-permit-course-start','#atm-permit-course-end']) {
      form?.querySelector(selector)?.addEventListener('change',()=>this.loadPermitCourses());
    }
    for(const [id,method] of [['atm-download-permit-excel','exportPermitStudents'],['atm-download-permit-identifications','exportPermitStudentIdentifications']]) {
      document.getElementById(id)?.addEventListener('click',async event=>{
        const button=event.currentTarget;button.disabled=true;
        try {download(await AdminService[method](this.permitDateFilters()));}
        catch(error){document.getElementById('atm-permit-course-status').textContent=error.message||'No se pudo descargar el archivo.';}
        finally{button.disabled=!this.permitEligibleCount;}
      });
    }
  }

  currentPermitBranchId() {
    return document.getElementById('atm-office-form')?.querySelector('[name="branchId"]')?.value || '';
  }

  permitDateFilters() {
    return {branchId:this.currentPermitBranchId(),
      courseType:document.getElementById('atm-permit-course-type')?.value,
      courseStart:document.getElementById('atm-permit-course-start')?.value,
      courseEnd:document.getElementById('atm-permit-course-end')?.value};
  }

  async loadPermitCourses() {
    const requestId=this.permitRequestId=(this.permitRequestId||0)+1;
    const filters=this.permitDateFilters();
    const status=document.getElementById('atm-permit-course-status');
    const count=document.getElementById('atm-permit-student-count');
    const submit=document.getElementById('atm-office-form')?.querySelector('[type="submit"]');
    this.permitEligibleCount=0;
    if(count)count.value='';
    if(submit)submit.disabled=true;
    for(const id of ['atm-download-permit-excel','atm-download-permit-identifications']) {
      const button=document.getElementById(id);if(button)button.disabled=true;
    }
    if(!filters.branchId||!filters.courseStart||!filters.courseEnd||filters.courseStart>filters.courseEnd) {
      if(status)status.textContent='Selecciona sucursal y un rango válido de fechas de matrícula.';
      return;
    }
    if(status)status.textContent='Consultando estudiantes...';
    try {
      const result=await AdminService.permitCourseOptions(filters);
      if(requestId!==this.permitRequestId||!count?.isConnected)return;
      if(result.success===false)throw new Error(result.error?.message||result.error||'No se pudo consultar el listado.');
      this.permitEligibleCount=Number(result.data?.studentCount||0);
      count.value=this.permitEligibleCount;
      if(status)status.textContent=this.permitEligibleCount
        ? this.permitEligibleCount+' estudiantes con pago completo.'
        : 'No hay estudiantes con pago completo en este período de inscripción.';
      if(submit)submit.disabled=!this.permitEligibleCount;
      for(const id of ['atm-download-permit-excel','atm-download-permit-identifications']) {
        const button=document.getElementById(id);if(button)button.disabled=!this.permitEligibleCount;
      }
    }catch(error){if(requestId===this.permitRequestId&&status)status.textContent=error.message||'No se pudo consultar el listado.';}
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
      payload.course =
        Object.fromEntries(
          [
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
