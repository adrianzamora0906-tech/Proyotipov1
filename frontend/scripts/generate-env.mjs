import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = resolve(fileURLToPath(new URL('.', import.meta.url)));
const frontendDirectory = resolve(scriptDirectory, '..');

function readLocalEnvironment() {
  try {
    return Object.fromEntries(
      readFileSync(resolve(frontendDirectory, '.env'), 'utf8')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#') && line.includes('='))
        .map(line => {
          const separator = line.indexOf('=');
          return [
            line.slice(0, separator).trim(),
            line.slice(separator + 1).trim().replace(/^["']|["']$/g, '')
          ];
        })
    );
  } catch {
    return {};
  }
}

const localEnvironment = readLocalEnvironment();
const apiBaseUrl = (process.env.API_BASE_URL || localEnvironment.API_BASE_URL || '').trim();
const moodleUrl = (process.env.MOODLE_URL || localEnvironment.MOODLE_URL || '').trim();

if (!apiBaseUrl) {
  throw new Error('Falta API_BASE_URL. Configura esta variable con la URL HTTPS del tunel terminada en /api.');
}

let parsedApiUrl;
try {
  parsedApiUrl = new URL(apiBaseUrl);
} catch {
  throw new Error('API_BASE_URL no es una URL valida. Ejemplo: https://xxxxx.trycloudflare.com/api');
}

if (!['http:', 'https:'].includes(parsedApiUrl.protocol)) {
  throw new Error('API_BASE_URL debe utilizar http o https.');
}

if (process.env.NETLIFY === 'true' && parsedApiUrl.protocol !== 'https:') {
  throw new Error('En Netlify, API_BASE_URL debe utilizar https para evitar bloqueo por contenido mixto.');
}

if (parsedApiUrl.pathname === '/') parsedApiUrl.pathname = '/api';
parsedApiUrl.pathname = `${parsedApiUrl.pathname.replace(/\/+$/, '')}/`;
const normalizedApiBaseUrl = parsedApiUrl.toString().replace(/\/$/, '');
const publicConfig = {
  API_BASE_URL: normalizedApiBaseUrl,
  MOODLE_URL: moodleUrl
};

const output = `// Generado durante el despliegue. No colocar secretos en este archivo.\nwindow.__SPORTMANCAR_CONFIG__ = ${JSON.stringify(publicConfig, null, 2)};\n`;
writeFileSync(resolve(frontendDirectory, 'env.js'), output, 'utf8');
console.log(`Configuracion publica generada para ${parsedApiUrl.origin}.`);
