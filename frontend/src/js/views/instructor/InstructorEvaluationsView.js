import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import EvaluationService from '../../services/evaluationService.js';
import InstructorStudentService from '../../services/instructorStudentService.js';
import InstructorAgendaService from '../../services/instructorAgendaService.js';
import { badgeClass, escapeHtml, stateMessage } from './InstructorHelpers.js';

class InstructorEvaluationsView extends Component {
  async render() {
    try {
      const params = new URLSearchParams(window.location.search);
      this.selectedEnrollmentId = params.get('enrollment') || '';
      this.practicalSessionId = params.get('session') || '';
      this.isExoneration = params.get('mode') === 'exoneration';
      const [evaluations, students] = await Promise.all([
        EvaluationService.getEvaluations(),
        InstructorStudentService.getStudents({ limit: 100 }),
      ]);
      this.criteria = evaluations.criteria || [];
      this.evaluations = evaluations.data || [];
      const evaluationStudents = [...(students.data || [])];
      if (this.practicalSessionId && this.selectedEnrollmentId && !evaluationStudents.some(item => String(item.enrollmentId) === String(this.selectedEnrollmentId))) {
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const examAgenda = await InstructorAgendaService.getAgenda({ date: today, appointmentType: 'EXAM_ONLY' });
        const exam = (examAgenda.data || []).find(item => String(item.id) === String(this.practicalSessionId));
        if (exam) evaluationStudents.push({ enrollmentId: exam.enrollmentId, name: exam.studentName, course: exam.course });
      }

      const content = `
        <div class="instructor-page">
          <div class="page-header">
            <div><h1>${this.isExoneration ? 'Exonerar estudiante' : 'Evaluaciones'}</h1><p>${this.isExoneration ? 'Completa la evaluación final para cerrar sus clases prácticas.' : 'Registro de evaluaciones practicas e intentos'}</p></div>
          </div>
          <div class="dashboard-grid">
            <div class="card">
              <div class="card-header"><h3 class="card-title">${this.isExoneration ? 'Evaluación para exoneración' : 'Examen práctico final'}</h3></div>
              <div class="card-body">${this.renderForm(evaluationStudents, this.criteria)}</div>
            </div>
            <div class="card">
              <div class="card-header"><h3 class="card-title">Evaluaciones realizadas</h3></div>
              <div class="card-body">${this.renderEvaluations(evaluations.data)}</div>
            </div>
          </div>
          ${this.renderEvaluationDetailModal()}
        </div>
      `;
      const layout = await SidebarLayout.render(content);
      setTimeout(() => SidebarLayout.attachEventListeners(), 0);
      return layout;
    } catch (error) {
      const layout = await SidebarLayout.render(`<div class="alert alert-error">${stateMessage(error)}</div>`);
      setTimeout(() => SidebarLayout.attachEventListeners(), 0);
      return layout;
    }
  }

  renderForm(students, criteria) {
    return `
      <form id="evaluation-form">
        <div class="form-group">
          <label class="form-label required">Estudiante</label>
          <select class="form-select" name="enrollmentId" required ${this.isExoneration ? 'disabled' : ''}>
            <option value="">Seleccionar...</option>
            ${students.map(item => `<option value="${item.enrollmentId}" ${String(item.enrollmentId) === String(this.selectedEnrollmentId) ? 'selected' : ''}>${escapeHtml(item.name)} - ${escapeHtml(item.course)}</option>`).join('')}
          </select>
          ${this.isExoneration ? `<input type="hidden" name="enrollmentId" value="${escapeHtml(this.selectedEnrollmentId)}">` : ''}
        </div>
        <input type="hidden" name="practicalSessionId" value="${escapeHtml(this.practicalSessionId || '')}">
        <input type="hidden" name="evaluationType" value="${this.isExoneration ? 'EXONERACION' : 'PRACTICA'}">
        <div class="evaluation-scale-help"><strong>${this.isExoneration ? 'Evaluación obligatoria para exonerar' : 'Examen práctico final'}</strong><span>Marca un porcentaje en cada criterio.${this.isExoneration ? ' Se requiere un resultado aprobado.' : ''}</span></div>
        <div class="evaluation-criteria-list">
          ${criteria.map(item => `
            <div class="evaluation-criterion" data-criterion-id="${item.id}" data-maximum="${item.maximum_score}">
              <div class="evaluation-criterion__head">
                <strong>${escapeHtml(item.name)}</strong>
                <button class="evaluation-criteria-toggle" type="button" aria-expanded="false" aria-controls="criterion-guide-${item.id}" aria-label="Ver criterios de ${escapeHtml(item.name)}">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  <span>Ver criterios</span>
                </button>
                <span class="criterion-earned">0 / ${Number(item.maximum_score)}</span>
              </div>
              <div class="evaluation-criteria-guide" id="criterion-guide-${item.id}" hidden>
                <div><strong>Criterios considerados</strong><button type="button" class="evaluation-criteria-hide">Ocultar</button></div>
                <ol>${String(item.description || '').split(/\r?\n/).filter(Boolean).map(text => `<li>${escapeHtml(text)}</li>`).join('')}</ol>
              </div>
              <div class="evaluation-percentage-options" role="radiogroup" aria-label="Calificación de ${escapeHtml(item.name)}">
                ${[0, 25, 50, 75, 100].map((percent, index) => `<label class="evaluation-percentage-option">
                  <input type="radio" name="criterion-${item.id}" value="${percent}" ${index === 0 ? 'required' : ''}>
                  <span>${percent}%</span>
                </label>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
        <div class="alert alert-info" id="evaluation-total">Total: 0%</div>
        <button class="btn btn-primary evaluation-submit" type="submit">${this.isExoneration ? 'Registrar exoneración' : 'Registrar evaluación'}</button>
      </form>
    `;
  }

  renderEvaluations(items) {
    if (!items.length) return '<div class="instructor-empty">Aun no hay evaluaciones registradas.</div>';
    return `
      <table class="table">
        <thead><tr><th>Estudiante</th><th>Tipo</th><th>Intento</th><th>Puntaje</th><th>Resultado</th><th></th></tr></thead>
        <tbody>${items.map(item => `
          <tr>
            <td data-label="Estudiante">${escapeHtml(`${item.first_name || ''} ${item.last_name || ''}`)}</td>
            <td data-label="Evaluacion">${escapeHtml(item.evaluation_type)}</td>
            <td data-label="Intento">${item.attempt_number}</td>
            <td data-label="Puntaje">${item.total_score || 0}/${item.maximum_score || 0} (${item.percentage || 0}%)</td>
            <td data-label="Resultado"><span class="badge ${badgeClass(item.result)}">${escapeHtml(item.result || 'REGISTRADA')}</span></td>
            <td data-label="Detalle"><button class="btn btn-secondary btn-small js-evaluation-detail" type="button" data-id="${item.id}">Ver resultado</button></td>
          </tr>
        `).join('')}</tbody>
      </table>
    `;
  }

  renderEvaluationDetailModal() {
    return `<div class="evaluation-detail-overlay" id="evaluation-detail-overlay" hidden>
      <section class="evaluation-detail-modal" role="dialog" aria-modal="true" aria-labelledby="evaluation-detail-title">
        <header><div><small>Examen práctico final</small><h2 id="evaluation-detail-title">Resultado</h2></div><button type="button" class="evaluation-detail-close" aria-label="Cerrar">×</button></header>
        <div class="evaluation-detail-summary"><strong id="evaluation-detail-total"></strong><span id="evaluation-detail-status"></span></div>
        <div class="evaluation-detail-scores" id="evaluation-detail-scores"></div>
        <footer><button type="button" class="btn btn-primary evaluation-detail-close">Cerrar</button></footer>
      </section>
    </div>`;
  }

  async mount() {
    const form = document.getElementById('evaluation-form');
    document.querySelectorAll('.evaluation-criteria-toggle').forEach(button => {
      button.addEventListener('click', () => {
        const guide = document.getElementById(button.getAttribute('aria-controls'));
        const willOpen = guide.hidden;
        guide.hidden = !willOpen;
        button.setAttribute('aria-expanded', String(willOpen));
      });
    });
    document.querySelectorAll('.evaluation-criteria-hide').forEach(button => {
      button.addEventListener('click', () => {
        const guide = button.closest('.evaluation-criteria-guide');
        guide.hidden = true;
        document.querySelector(`[aria-controls="${guide.id}"]`)?.setAttribute('aria-expanded', 'false');
      });
    });

    const detailOverlay = document.getElementById('evaluation-detail-overlay');
    const closeDetail = () => {
      detailOverlay.hidden = true;
      document.body.classList.remove('modal-open');
    };
    document.querySelectorAll('.js-evaluation-detail').forEach(button => {
      button.addEventListener('click', () => {
        const evaluation = this.evaluations.find(item => String(item.id) === String(button.dataset.id));
        if (!evaluation) return;
        const scores = Array.isArray(evaluation.scores) ? evaluation.scores : [];
        document.getElementById('evaluation-detail-title').textContent = `${evaluation.first_name || ''} ${evaluation.last_name || ''}`.trim();
        document.getElementById('evaluation-detail-total').textContent = `${Number(evaluation.total_score || 0)}/${Number(evaluation.maximum_score || 0)} (${Number(evaluation.percentage || 0)}%)`;
        const status = document.getElementById('evaluation-detail-status');
        status.textContent = evaluation.result || 'REGISTRADA';
        status.className = `badge ${badgeClass(evaluation.result)}`;
        document.getElementById('evaluation-detail-scores').innerHTML = scores.length
          ? scores.map(score => `<article><div><strong>${escapeHtml(score.name || 'Categoría')}</strong><span>${Number(score.percentage || 0)}%</span></div><b>${Number(score.score || 0)}/${Number(score.maximumScore || 0)}</b></article>`).join('')
          : '<div class="instructor-empty">Esta evaluación histórica no tiene desglose disponible.</div>';
        detailOverlay.hidden = false;
        document.body.classList.add('modal-open');
      });
    });
    detailOverlay?.querySelectorAll('.evaluation-detail-close').forEach(button => button.addEventListener('click', closeDetail));
    detailOverlay?.addEventListener('click', event => {
      if (event.target === detailOverlay) closeDetail();
    });

    form?.addEventListener('input', () => this.updateTotal());
    form?.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      try {
        button.disabled = true;
        const formData = new FormData(form);
        const scores = [...document.querySelectorAll('.evaluation-criterion')].map(row => {
          const percent = Number(row.querySelector('input[type="radio"]:checked')?.value || 0);
          const maximum = Number(row.dataset.maximum || 0);
          return {
            criterionId: row.dataset.criterionId,
            score: Number((maximum * percent / 100).toFixed(2)),
            observations: null,
          };
        });
        await EvaluationService.createEvaluation({
          enrollmentId: formData.get('enrollmentId'),
          practicalSessionId: formData.get('practicalSessionId') || null,
          evaluationType: formData.get('evaluationType') || 'PRACTICA',
          generalObservations: null,
          scores,
        });
        window.dispatchEvent(new PopStateEvent('popstate'));
      } catch (error) {
        window.alert(stateMessage(error));
        button.disabled = false;
      }
    });
    this.updateTotal();
  }

  updateTotal() {
    const rows = [...document.querySelectorAll('.evaluation-criterion')];
    const maximum = rows.reduce((total, row) => total + Number(row.dataset.maximum || 0), 0);
    const total = rows.reduce((sum, row) => {
      const criterionMaximum = Number(row.dataset.maximum || 0);
      const selected = row.querySelector('input[type="radio"]:checked');
      const percent = Number(selected?.value || 0);
      const earned = criterionMaximum * percent / 100;
      const indicator = row.querySelector('.criterion-earned');
      if (indicator) indicator.textContent = selected ? `${Number(earned.toFixed(2))} / ${criterionMaximum}` : `0 / ${criterionMaximum}`;
      return sum + earned;
    }, 0);
    const percentage = maximum ? Math.round((total / maximum) * 100) : 0;
    const target = document.getElementById('evaluation-total');
    if (target) target.textContent = `Total: ${Number(total.toFixed(2))}/${maximum} (${percentage}%)`;
  }
}

export default InstructorEvaluationsView;
