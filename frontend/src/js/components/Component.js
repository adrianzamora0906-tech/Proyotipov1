/**
 * Component Base
 * Clase base para todos los componentes
 */

class Component {
  constructor(props = {}) {
    this.props = props;
    this.state = {};
    this.eventListeners = [];
  }

  /**
   * Renderiza el componente
   */
  async render() {
    return '<div></div>';
  }

  /**
   * Monta el componente (se ejecuta después de render)
   */
  async mount() {
    this.attachEventListeners();
  }

  /**
   * Actualiza el estado
   */
  setState(newState) {
    this.state = { ...this.state, ...newState };
    this.render().then(html => {
      const container = document.getElementById(this.containerId);
      if (container) {
        container.innerHTML = html;
        this.mount();
      }
    });
  }

  /**
   * Adjunta listeners de eventos
   */
  attachEventListeners() {
    this.eventListeners.forEach(({ selector, event, handler }) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        el.addEventListener(event, handler.bind(this));
      });
    });
  }

  /**
   * Registra un event listener
   */
  on(selector, event, handler) {
    this.eventListeners.push({ selector, event, handler });
  }

  /**
   * Desmontar componente
   */
  unmount() {
    this.eventListeners = [];
  }
}

export default Component;
