import test from 'node:test';
import assert from 'node:assert/strict';
import Router from '../src/js/core/router/Router.js';

function createMockWindow(pathname = '/login') {
  return {
    location: { pathname },
    history: {
      pushState() {},
    },
    addEventListener() {},
  };
}

test('el router libera el bloqueo de navegación cuando un hook interrumpe el cambio de ruta', async () => {
  global.window = createMockWindow('/login');
  global.document = {
    getElementById: () => ({ innerHTML: '' }),
  };

  const router = new Router();
  router.register('/login', class LoginView {
    async render() {
      return '<div>login</div>';
    }

    async mount() {}
  }, 'login');

  router.before(async () => false);

  await router.handleNavigation();

  assert.equal(router._navigating, false);
});
