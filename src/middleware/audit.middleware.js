/**
 * TechDesk Pro — Middleware de Auditoría
 * Registra todas las acciones importantes del sistema
 */

const db = require('../db');

/**
 * Registra una acción de auditoría
 */
function logAudit({ userId, userName, action, entity, entityId, oldData, newData, req }) {
  try {
    const ip = req
      ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
      : 'system';
    const ua = req ? (req.headers['user-agent'] || '') : 'system';

    db.prepare(`
      INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, old_data, new_data, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId || null,
      userName || 'Sistema',
      action,
      entity,
      entityId || null,
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
      ip,
      ua
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

/**
 * Middleware automático para registrar requests HTTP sensibles
 */
function auditMiddleware(req, res, next) {
  const sensitiveRoutes = ['/auth/', '/admin/', '/tickets/', '/tic/'];
  const isSensitive = sensitiveRoutes.some(r => req.path.includes(r));

  if (isSensitive && req.method !== 'GET' && req.user) {
    const original = res.json.bind(res);
    res.json = function (data) {
      if (res.statusCode < 400) {
        logAudit({
          userId: req.user?.id,
          userName: req.user?.name,
          action: `${req.method} ${req.path}`,
          entity: 'http_request',
          req
        });
      }
      return original(data);
    };
  }
  next();
}

module.exports = { logAudit, auditMiddleware };
