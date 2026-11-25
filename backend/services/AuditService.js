const db = require('../config/database');

const BLOCKED_KEYS = new Set([
  'code', 'previousCode', 'code_hash', 'previous_code_hash', 'password_fingerprint',
  'password', 'password_hash', 'currentPassword', 'newPassword', 'refresh_token',
  'refreshToken', 'access_token', 'accessToken', 'token', 'jwt', 'secret', 'api_key', 'apiKey',
  'file', 'file_path', 'fileUrl', 'file_url', 'pdf', 'base64',
]);

function sanitize(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 5) return '[MAX_DEPTH]';
  if (Array.isArray(value)) return value.slice(0, 100).map(item => sanitize(item, depth + 1));
  if (typeof value !== 'object') return typeof value === 'string' && value.length > 2000
    ? `${value.slice(0, 2000)}[TRUNCATED]` : value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !BLOCKED_KEYS.has(key))
    .map(([key, item]) => [key, sanitize(item, depth + 1)]));
}

class AuditService {
  static sanitize = sanitize;

  static async log(data, client = db) {
    const context = data.requestContext || {};
    const entityType = data.entityType || data.entity || 'SYSTEM';
    await client.query(`
      INSERT INTO audit_logs (
        user_id, role, branch_id, action, module, entity, entity_type, entity_id,
        description, old_values, new_values, metadata, ip_address, user_agent, request_id, session_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,$16)
    `, [
      data.userId || context.userId || null,
      data.role || context.roles?.join(',') || null,
      data.branchId || context.branchId || null,
      data.action,
      data.module,
      entityType.toLowerCase(),
      entityType,
      data.entityId || null,
      data.description || null,
      data.oldValues === undefined ? null : JSON.stringify(sanitize(data.oldValues)),
      data.newValues === undefined ? null : JSON.stringify(sanitize(data.newValues)),
      JSON.stringify(sanitize(data.metadata || {})),
      context.ipAddress || null,
      context.userAgent || null,
      context.requestId || null,
      context.sessionId || null,
    ]);
  }
}

module.exports = AuditService;
