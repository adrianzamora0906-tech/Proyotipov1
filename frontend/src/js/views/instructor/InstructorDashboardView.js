import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import InstructorDashboardService from '../../services/instructorDashboardService.js';
import { authService } from '../../core/auth/AuthService.js';
import { badgeClass, escapeHtml, formatDateTime, formatTime, stateMessage } from './InstructorHelpers.js';
import { openAttendanceQrModal } from './AttendanceQrModal.js';
import { openCompleteSessionModal } from './CompleteSessionModal.js';
import PracticalSessionService from '../../services/practicalSessionService.js';

class InstructorDashboardView extends Component {
  async render() {
    try {
      const result = await InstructorDashboardService.getDashboard();
      const dashboard = result.data;
      this.dashboardData = dashboard;
      const user = authService.getCurrentUser();
      const today = new Date().toLocaleDateString('es-EC', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      const content = `
        <div class="instructor-page dashboard">
          <div class="dashboard-header">
            <div>
              <h1>Bienvenido, ${escapeHtml(dashboard.instructor.name || user.name)}</h1>
              <p class="dashboard-subtitle">Instructor practico · ${escapeHtml(dashboard.instructor.branch)} · ${today}</p>
            </div>
            <span class="badge badge-success">${escapeHtml(dashboard.instructor.status || 'activo')}</span>
          </div>

          <div class="stats-grid">
            ${this.renderStat(dashboard.summary.nextSession ? formatTime(dashboard.summary.nextSession.scheduledStart) : 'Sin clases', 'Próxima clase', 'next')}
            ${this.renderStat(dashboard.summary.scheduledToday, 'Clases de hoy', 'today')}
            ${this.renderStat(dashboard.summary.monthlyCompletedSessions, 'Clases completadas este mes', 'completed')}
            ${this.renderStat(`${dashboard.summary.monthlyHours} h`, 'Horas impartidas este mes', 'hours')}
            ${this.renderStat(dashboard.summary.openIncidents, 'Incidencias abiertas', 'incidents')}
          </div>

          ${this.renderNextSession(dashboard.summary.nextSession)}

          <div class="dashboard-grid">
            <div class="card">
              <div class="card-header"><h3 class="card-title">Acciones rapidas</h3></div>
              <div class="card-body">
                ${this.renderQuickAction('/instructor/agenda', 'Ver agenda completa', 'Consultar clases por dia o semana')}
                ${this.renderQuickAction('/instructor/students', 'Mis estudiantes', 'Abrir seguimiento academico')}
                ${this.renderQuickAction('/instructor/evaluations', 'Registrar evaluacion', 'Crear una evaluacion practica')}
                ${this.renderQuickAction('/instructor/incidents', 'Reportar incidencia', 'Informar novedades operativas')}
              </div>
            </div>
            ${this.renderRecommendedRoute(dashboard.summary.nextSession, dashboard.routePreview)}
          </div>
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

  renderStat(value, label, action) {
    return `
      <button type="button" class="stat-card dashboard-stat-action" data-dashboard-stat="${action}">
        <div>
          <div class="stat-number">${escapeHtml(value)}</div>
          <div class="stat-label">${label}</div>
        </div>
      </button>
    `;
  }

  openStatsModal(action) {
    const dashboard = this.dashboardData || {};
    const todayItems = dashboard.todayAgenda || [];
    const completedItems = dashboard.completedMonth || [];
    const incidents = dashboard.openIncidents || [];
    let title = '';
    let body = '';

    if (action === 'today') {
      title = 'Clases de hoy';
      body = todayItems.length ? `<div class="dashboard-detail-list">${todayItems.map(item => `
        <article><div><strong>${escapeHtml(item.studentName)}</strong><small>${escapeHtml(item.course)} · Clase ${escapeHtml(item.sessionNumber || 'N/A')}</small></div><div class="dashboard-detail-meta"><strong>${formatTime(item.scheduledStart)}–${formatTime(item.scheduledEnd)}</strong><span class="badge ${badgeClass(item.isExpired ? 'VENCIDA' : item.status)}">${escapeHtml(item.isExpired ? 'VENCIDA' : item.status)}</span></div></article>
      `).join('')}</div>` : this.renderEmpty('No existen clases programadas para hoy.');
    } else if (action === 'completed') {
      title = 'Clases completadas este mes';
      const groups = completedItems.reduce((result, item) => {
        (result[item.course] ||= []).push(item);
        return result;
      }, {});
      body = completedItems.length ? Object.entries(groups).map(([course, items]) => `
        <section class="dashboard-detail-group"><header><strong>${escapeHtml(course)}</strong><span>${items.length} ${items.length === 1 ? 'clase' : 'clases'}</span></header><div class="dashboard-detail-list">${items.map(item => `<article><div><strong>${escapeHtml(item.studentName)}</strong><small>Clase ${escapeHtml(item.sessionNumber || 'N/A')} · ${formatDateTime(item.scheduledStart)}</small></div></article>`).join('')}</div></section>
      `).join('') : this.renderEmpty('Todavía no hay clases completadas este mes.');
    } else if (action === 'hours') {
      title = 'Horas impartidas este mes';
      const totals = completedItems.reduce((result, item) => {
        result[item.course] = (result[item.course] || 0) + Number(item.durationHours || 0);
        return result;
      }, {});
      body = Object.keys(totals).length ? `<div class="dashboard-hours-list">${Object.entries(totals).map(([course, hours]) => `<article><span>${escapeHtml(course)}</span><strong>${hours.toFixed(1)} h</strong></article>`).join('')}<article class="is-total"><span>Total del mes</span><strong>${escapeHtml(dashboard.summary?.monthlyHours || 0)} h</strong></article></div>` : this.renderEmpty('Todavía no hay horas impartidas este mes.');
    } else if (action === 'incidents') {
      title = 'Incidencias abiertas';
      body = incidents.length ? `<div class="dashboard-detail-list">${incidents.map(item => `<article><div><strong>${escapeHtml(item.type)}</strong><small>${escapeHtml(item.studentName || 'Sin estudiante')} · ${formatDateTime(item.reportedAt)}</small><p>${escapeHtml(item.description)}</p></div><div class="dashboard-detail-meta"><span class="badge ${item.priority === 'ALTA' ? 'badge-danger' : 'badge-warning'}">${escapeHtml(item.priority)}</span><small>${escapeHtml(item.status)}</small></div></article>`).join('')}</div>` : this.renderEmpty('No tienes incidencias abiertas.');
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active instructor-stats-overlay';
    overlay.innerHTML = `<div class="modal instructor-stats-modal" role="dialog" aria-modal="true"><div class="modal-header"><h3 class="modal-title">${title}</h3><button type="button" class="modal-close" data-close-stats>&times;</button></div><div class="modal-body">${body}</div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-close-stats>Cerrar</button></div></div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('[data-close-stats]').forEach(button => button.addEventListener('click', close));
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  }

  renderAgenda(items, nextId) {
    return `
      <div class="instructor-table-wrap">
        <table class="table">
          <thead>
            <tr><th>Hora</th><th>Estudiante</th><th>Curso</th><th>Clase</th><th>Vehiculo</th><th>Estado</th><th>Accion</th></tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr class="${item.id === nextId ? 'next-session-row' : ''}">
                <td data-label="Hora">${formatTime(item.scheduledStart)} - ${formatTime(item.scheduledEnd)}</td>
                <td data-label="Estudiante">${escapeHtml(item.studentName)}</td>
                <td data-label="Curso">${escapeHtml(item.course)}</td>
                <td data-label="Clase">${escapeHtml(item.sessionNumber || 'N/A')}</td>
                <td data-label="Vehiculo">${escapeHtml(item.vehicle || 'Sin asignar')}</td>
                <td data-label="Estado"><span class="badge ${badgeClass(item.isExpired ? 'VENCIDA' : item.status)}">${escapeHtml(item.isExpired ? 'VENCIDA' : item.status)}</span></td>
                <td class="mobile-actions" data-label="Accion">${this.renderSessionActions(item)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderNextSession(session) {
    if (!session) {
      return `<div class="card"><div class="card-header"><h3 class="card-title">Próxima clase</h3></div><div class="card-body"><div class="instructor-empty">No tienes clases próximas programadas.</div></div></div>`;
    }
    const address = 'Sportmancar Flavio Reyes';
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    return `
      <div class="card next-class-card">
        <div class="card-header">
          <div><h3 class="card-title">Próxima clase</h3><p class="card-subtitle">Información para atender al estudiante</p></div>
          <span class="badge ${badgeClass(session.status)}">${escapeHtml(session.status)}</span>
        </div>
        <div class="card-body">
          <div class="next-class-summary">
            <div class="next-class-student"><span class="info-label">Estudiante</span><strong>${escapeHtml(session.studentName)}</strong><small>${escapeHtml(session.course)} · Clase ${escapeHtml(session.sessionNumber || 'N/A')}</small></div>
            <div><span class="info-label">Horario</span><strong>${formatDateTime(session.scheduledStart)} – ${formatTime(session.scheduledEnd)}</strong></div>
          </div>
          <div class="pickup-point">
            <div class="pickup-point-icon">⌖</div>
            <div><span class="info-label">Punto de encuentro</span><strong>${escapeHtml(address)}</strong><small>Encuentro en la escuela antes de iniciar la clase.</small></div>
          </div>
          <div class="next-class-actions">
            ${mapsUrl ? `<a class="btn btn-primary" href="${mapsUrl}" target="_blank" rel="noopener">Abrir ubicación</a>` : ''}
            ${this.renderSessionActions(session)}
          </div>
        </div>
      </div>`;
  }

  renderRecommendedRoute(session, routePreview = null) {
    const route = session?.recommendedRoute || routePreview;
    const isPreview = !session?.recommendedRoute && Boolean(routePreview);
    if (!route) {
      return `
        <div class="card">
          <div class="card-header"><h3 class="card-title">Rutas</h3></div>
          <div class="card-body">
            <div class="instructor-empty">La próxima clase aún no tiene una ruta recomendada asignada. Cuando se cargue, aquí aparecerán el recorrido y el mapa.</div>
          </div>
        </div>
      `;
    }

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Rutas</h3>
            <p class="card-subtitle">${escapeHtml(route.name)} · recomendada para la clase ${escapeHtml(route.recommendedSessionNumber || session?.sessionNumber || 'N/A')}${isPreview ? ' · vista previa' : ''}</p>
          </div>
          <a class="btn btn-secondary btn-small" href="${route.mapsUrl}" target="_blank" rel="noopener">Abrir en Google Maps</a>
        </div>
        <div class="card-body">
          <div class="route-summary">
            <div><span class="info-label">Origen</span><span class="info-value">${escapeHtml(route.originLabel)}</span></div>
            <div><span class="info-label">Destino</span><span class="info-value">${escapeHtml(route.destinationLabel)}</span></div>
            <div><span class="info-label">Nivel</span><span class="badge badge-info">${escapeHtml(route.level)}</span></div>
            <div><span class="info-label">Duracion estimada</span><span class="info-value">${escapeHtml(route.estimatedMinutes || 'N/A')} min</span></div>
          </div>
          ${route.focusTopics?.length ? `<div class="route-topics">${route.focusTopics.map(topic => `<span class="badge badge-primary">${escapeHtml(topic)}</span>`).join('')}</div>` : ''}
          ${route.mapTiler ? `
            <div class="route-map" id="recommended-route-map" data-route='${escapeHtml(JSON.stringify(route.mapTiler))}'></div>
          ` : route.embedUrl ? `
            <iframe class="route-map" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade" src="${route.embedUrl}"></iframe>
          ` : `
            <div class="route-map-placeholder">
              <div>
                <strong>Mapa listo para rutas</strong>
                <p>Agrega coordenadas a la ruta recomendada para dibujarla en MapTiler.</p>
              </div>
              <a class="btn btn-primary" href="${route.mapsUrl}" target="_blank" rel="noopener">Ver ruta</a>
            </div>
          `}
        </div>
      </div>
    `;
  }

  renderSessionActions(item) {
    const buttons=[];
    if (item.isExamOnly) return '<div class="instructor-actions"><a href="/instructor/evaluations" class="btn btn-primary btn-small">Evaluar</a><a href="/instructor/agenda" class="btn btn-secondary btn-small">Ver detalle</a></div>';
    if (item.isExpired) buttons.push(`<a href="/instructor/agenda?session=${item.id}" class="btn btn-secondary btn-small">Registrar asistencia</a>`);
    else if (item.canStart) buttons.push(`<button class="btn btn-primary btn-small js-start-session" data-id="${item.id}">Iniciar</button>`);
    else if (item.status === 'EN_CURSO') buttons.push(`<button class="btn btn-success btn-small js-complete-session" data-id="${item.id}">Registrar salida</button>`);
    else buttons.push(`<a href="/instructor/agenda?session=${item.id}" class="btn btn-secondary btn-small">Ver detalle</a>`);
    if(item.isQrTest)buttons.push(`<button class="btn btn-secondary btn-small js-reset-qr-test" data-id="${item.id}">Restablecer prueba</button>`);
    return `<div class="instructor-actions">${buttons.join('')}</div>`;
  }

  renderQuickAction(href, title, subtitle) {
    return `<a href="${href}" class="quick-action"><div class="quick-action-content"><div class="quick-action-title">${title}</div><div class="card-subtitle">${subtitle}</div></div></a>`;
  }

  renderEmpty(message) {
    return `<div class="instructor-empty">${message}</div>`;
  }

  async mount() {
    this.mountRecommendedRouteMap();

    document.querySelectorAll('[data-dashboard-stat]').forEach(card => {
      card.addEventListener('click', () => {
        if (card.dataset.dashboardStat === 'next') {
          document.querySelector('.next-class-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        this.openStatsModal(card.dataset.dashboardStat);
      });
    });

    document.querySelectorAll('.js-start-session').forEach(button => {
      button.addEventListener('click', () => openAttendanceQrModal(
        button.dataset.id,
        () => window.dispatchEvent(new PopStateEvent('popstate')),
      ));
    });
    document.querySelectorAll('.js-complete-session').forEach(button => {
      button.addEventListener('click', () => openAttendanceQrModal(
        button.dataset.id,
        () => openCompleteSessionModal(
          button.dataset.id,
          () => window.dispatchEvent(new PopStateEvent('popstate')),
        ),
        'EXIT',
      ));
    });
    document.querySelectorAll('.js-reset-qr-test').forEach(button => {
      button.addEventListener('click', async () => {
        if (!window.confirm('¿Restablecer esta clase de prueba para generar otro QR?')) return;
        button.disabled = true;
        try {
          await PracticalSessionService.resetQrTestSession(button.dataset.id);
          window.dispatchEvent(new PopStateEvent('popstate'));
        } catch (error) {
          window.alert(stateMessage(error));
          button.disabled = false;
        }
      });
    });
  }

  mountRecommendedRouteMap() {
    const mapElement = document.getElementById('recommended-route-map');
    if (!mapElement) return;
    if (!window.maptilersdk) {
      mapElement.innerHTML = '<div class="route-map-placeholder">No se pudo cargar MapTiler SDK.</div>';
      return;
    }

    try {
      const config = JSON.parse(mapElement.dataset.route || '{}');
      const points = config.points || [];
      if (points.length < 2) return;

      window.maptilersdk.config.apiKey = config.apiKey;
      const bounds = new window.maptilersdk.LngLatBounds();
      points.forEach(point => bounds.extend(point.coordinates));

      const map = new window.maptilersdk.Map({
        container: mapElement,
        style: window.maptilersdk.MapStyle.STREETS,
        center: points[0].coordinates,
        zoom: 14,
      });

      map.on('load', () => {
        map.addSource('recommended-route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: config.lineCoordinates,
            },
            properties: {},
          },
        });

        map.addLayer({
          id: 'recommended-route-line',
          type: 'line',
          source: 'recommended-route',
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': '#4F46E5',
            'line-width': 6,
            'line-opacity': 0.85,
          },
        });

        points.forEach(point => {
          const marker = document.createElement('div');
          marker.className = `route-marker route-marker-${point.type}`;
          marker.title = point.label;
          new window.maptilersdk.Marker({ element: marker })
            .setLngLat(point.coordinates)
            .setPopup(new window.maptilersdk.Popup().setText(point.label))
            .addTo(map);
        });

        map.fitBounds(bounds, { padding: 60, maxZoom: 15 });
      });
    } catch (error) {
      mapElement.innerHTML = '<div class="route-map-placeholder">No se pudo pintar la ruta recomendada.</div>';
    }
  }

  async runAction(button, action) {
    try {
      button.disabled = true;
      button.textContent = 'Procesando...';
      await action();
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (error) {
      window.alert(stateMessage(error));
      button.disabled = false;
    }
  }
}

export default InstructorDashboardView;
