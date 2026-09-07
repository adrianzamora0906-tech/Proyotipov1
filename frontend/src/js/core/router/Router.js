/**
 * Router
 * Sistema de enrutamiento SPA (Single Page Application)
 */

class Router {
  constructor() {
    this.routes = new Map();
    this.currentRoute = null;
    this.beforeHooks = [];
    this.afterHooks = [];
    this.container = null;
    this._navigating = false;
  }

  /**
   * Inicializa el router
   */
  init() {
    this.container = document.getElementById('app');
    window.addEventListener('popstate', () => this.handleNavigation());
    this.handleNavigation();
  }

  /**
   * Registra una ruta
   */
  register(path, component, name = null) {
    this.routes.set(path, {
      path,
      component,
      name: name || path,
    });
  }

  /**
   * Navega a una ruta
   */
  navigate(path) {
    // Use pushState then defer the navigation handling to avoid
    // synchronous re-entrancy when hooks call `navigate` again.
    window.history.pushState(null, null, path);
    setTimeout(() => this.handleNavigation(), 0);
  }

  /**
   * Maneja la navegación
   */
  async handleNavigation() {
    if (this._navigating) return;
    this._navigating = true;
    const path = window.location.pathname;
    const route = this.matchRoute(path);

    try {
      if (!route) {
        this.navigateTo('/login');
        return;
      }

      // Ejecutar hooks antes
      for (const hook of this.beforeHooks) {
        const shouldContinue = await hook(route);
        if (!shouldContinue) return;
      }

      this.currentRoute = route;
      await this.renderRoute(route);

      // Ejecutar hooks después
      for (const hook of this.afterHooks) {
        await hook(route);
      }
    } finally {
      this._navigating = false;
    }
  }

  /**
   * Busca una ruta que coincida con el path actual
   */
  matchRoute(path) {
    // Búsqueda exacta
    if (this.routes.has(path)) {
      return this.routes.get(path);
    }

    // Búsqueda con parámetros
    for (const [pattern, route] of this.routes) {
      const regex = this.patternToRegex(pattern);
      if (regex.test(path)) {
        const params = this.extractParams(pattern, path);
        return { ...route, params };
      }
    }

    return null;
  }

  /**
   * Convierte un patrón a expresión regular
   */
  patternToRegex(pattern) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    const withParams = escaped.replace(/:([^/]+)/g, '([^/]+)');
    return new RegExp(`^${withParams}$`);
  }

  /**
   * Extrae parámetros de la URL
   */
  extractParams(pattern, path) {
    const paramNames = (pattern.match(/:([^/]+)/g) || []).map(p => p.slice(1));
    const regex = this.patternToRegex(pattern);
    const matches = path.match(regex);

    const params = {};
    if (matches) {
      paramNames.forEach((name, index) => {
        params[name] = matches[index + 1];
      });
    }
    return params;
  }

  /**
   * Renderiza una ruta
   */
  async renderRoute(route) {
    if (this.container) {
      if (this.currentComponent?.unmount) {
        this.currentComponent.unmount();
      }
      const component = new route.component(route.params || {});
      this.currentComponent = component;
      this.container.setAttribute('aria-busy', 'true');
      try {
        const html = await component.render();
        this.container.innerHTML = html;
        await component.mount();
      } finally {
        this.container.removeAttribute('aria-busy');
      }
    }
  }

  /**
   * Registra un hook antes de navegar
   */
  before(hook) {
    this.beforeHooks.push(hook);
  }

  /**
   * Registra un hook después de navegar
   */
  after(hook) {
    this.afterHooks.push(hook);
  }

  /**
   * Obtiene la ruta actual
   */
  getCurrentRoute() {
    return this.currentRoute;
  }

  /**
   * Navega a una ruta por nombre
   */
  navigateTo(path) {
    this.navigate(path);
  }

  /**
   * Obtiene todos los parámetros de la ruta actual
   */
  getParams() {
    return this.currentRoute?.params || {};
  }

  /**
   * Obtiene un parámetro específico
   */
  getParam(name) {
    return this.currentRoute?.params?.[name];
  }
}

export default Router;
