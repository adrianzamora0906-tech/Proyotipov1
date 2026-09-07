import Component from '../../components/Component.js';
import SidebarLayout from '../../layouts/SidebarLayout.js';

const sections = {
  manager: ['Resumen ejecutivo', 'Visión consolidada del desempeño financiero y académico.'],
  finance: ['Financiero', 'Ingresos por cursos, evaluaciones, recuperaciones y otros servicios.'],
  courses: ['Cursos', 'Inscritos, resultados e ingresos de cursos regulares y de perfeccionamiento.'],
  evaluations: ['Evaluaciones', 'Evaluaciones independientes, como el examen psicosométrico.'],
  recoveries: ['Recuperaciones', 'Recuperaciones realizadas, resultados y recargos generados.'],
  branches: ['Sucursales', 'Comparación de resultados entre todas las sucursales.'],
  reports: ['Reportes', 'Informes gerenciales filtrables y exportables.'],
  audit: ['Auditoría gerencial', 'Consulta de movimientos financieros relevantes.'],
};

export default class ManagerWorkspaceView extends Component {
  async render() {
    const key = location.pathname === '/manager' ? 'manager' : location.pathname.split('/').pop();
    const [title, description] = sections[key] || sections.manager;
    return SidebarLayout.render(`
      <section class="context-workspace manager-workspace">
        <div class="page-header"><div><h1>${title}</h1><p>${description}</p></div></div>
        <div class="card">
          <h2>Módulo preparado</h2>
          <p>Esta interfaz se desarrollará en la siguiente etapa. El perfil de Gerente General permanecerá exclusivamente en modo consulta.</p>
        </div>
      </section>
    `);
  }
}
