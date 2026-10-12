const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'sportmancar_erp',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '12345',
  min: parseInt(process.env.DB_POOL_MIN) || 2,
  max: parseInt(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: parseInt(process.env.DB_TIMEOUT) || 5000,
  connectionTimeoutMillis: parseInt(process.env.DB_TIMEOUT) || 5000,
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err);
  process.exit(-1);
});

/**
 * Ejecuta una query con parámetros
 */
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  try { require('../services/ResourceTelemetryService').recordQuery(duration); } catch (_error) {}
  if (process.env.LOG_LEVEL === 'debug') {
    console.log('Query ejecutada:', { text: text.substring(0, 80), duration, rows: res.rowCount });
  }
  return res;
}

/**
 * Obtiene un cliente del pool para transacciones
 */
async function getClient() {
  const client = await pool.connect();
  if (!client.__sportmancarTelemetryWrapped) {
    const originalQuery = client.query.bind(client);
    client.query = async (...args) => {
      const start = Date.now();
      try { return await originalQuery(...args); }
      finally {
        try { require('../services/ResourceTelemetryService').recordQuery(Date.now() - start); } catch (_error) {}
      }
    };
    Object.defineProperty(client, '__sportmancarTelemetryWrapped', { value: true });
  }
  return client;
}

module.exports = {
  pool,
  query,
  getClient,
};
