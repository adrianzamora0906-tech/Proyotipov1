import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';
import AdminService from '../../services/AdminService.js';

const titles = { people: 'Personas', finance: 'Financiero', academic: 'Académico', audit: 'Auditoría', settings: 'Configuración' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export default class AdminWorkspaceView extends Component {
  async render() {
    const key = location.pathname.split('/').pop();
    const title = titles[key] || 'Administración';
    const branchId = new URLSearchParams(location.search).get('branchId');
    let branch = null;
    let content = '';
    try {
      if (branchId) branch = (await AdminService.branch(branchId)).data;
      if (key === 'audit') {
        const rows = (await AdminService.audit({ limit: 25, branchId })).data.data || [];
        content = rows.map(item => `<div class="list-item"><strong>${new Date(item.created_at).toLocaleString()}</strong> · ${esc(item.action)} · ${esc(item.description || item.entity_type)}</div>`).join('');
      } else if (key === 'settings') {
        const rows = branchId ? (await AdminService.branchSettings(branchId)).data : (await AdminService.settings()).data;
        content = rows.map(item => `<div class="list-item"><strong>${esc(item.key)}</strong> · ${esc(item.scope_type)}</div>`).join('');
      } else if (key === 'academic' && branchId) {
        content = `<p>La gestión académica de esta sede está centralizada en Cursos.</p><a class="btn btn-primary" href="/admin-system/branches?branchId=${encodeURIComponent(branchId)}&tab=courses">Revisar cursos y ciclos</a>`;
      } else if (key === 'finance' && branchId) {
        content = '<p>Contexto financiero de consulta aplicado a la sucursal seleccionada. Las acciones operativas continúan protegidas por sus permisos específicos.</p>';
      } else if (branchId) {
        content = 'Contexto de sucursal aplicado.';
      } else if (key === 'finance' || key === 'academic') {
        const response = await AdminService.branches({ status: 'active', limit: 100 });
        const branches = response.data.data || [];
        content = `<p>Selecciona una sucursal para abrir este módulo con un contexto seguro.</p><div class="branch-quick-actions">${branches.map(item => `<a class="btn" href="/admin-system/${key}?branchId=${encodeURIComponent(item.id)}">${esc(item.name)}</a>`).join('') || '<p>No hay sucursales activas disponibles.</p>'}</div>`;
      }
    } catch (error) {
      content = `<div class="alert alert-error">${esc(error.message)}</div>`;
    }
    const branchName = branch?.name || '';
    const breadcrumb = branch ? `<nav class="context-breadcrumb" aria-label="Migas de pan"><a href="/admin-system/branches">Sucursales</a><span aria-hidden="true">/</span><a href="/admin-system/branches?branchId=${encodeURIComponent(branchId)}">${esc(branchName)}</a><span aria-hidden="true">/</span><span aria-current="page">${esc(title)}</span></nav>` : '';
    const back = branch ? `<a class="btn btn-light" href="/admin-system/branches?branchId=${encodeURIComponent(branchId)}">← Volver a ${esc(branchName)}</a>` : '';
    return SidebarLayout.render(`<section class="context-workspace">${breadcrumb}<div class="page-header"><div><h1>${esc(title)}</h1><p>${branch ? `Sucursal: ${esc(branchName)}` : 'Centro de trabajo administrativo global'}</p></div>${back}</div><div class="card">${content || '<p>Sin registros.</p>'}</div></section>`);
  }
}
