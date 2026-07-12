/**
 * TechDesk Pro — Middleware de Autenticación y RBAC
 */

const db = require('../db');

function setNoStoreHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

/**
 * Verifica que el usuario esté autenticado
 */
function requireAuth(req, res, next) {
  setNoStoreHeaders(res);

  if (!req.session || !req.session.userId) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: 'No autenticado', redirect: '/login' });
    }
    return res.redirect('/login');
  }

  // Cargar usuario desde BD en cada request
  const user = db.prepare(`
    SELECT u.*, d.name as department_name
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    WHERE u.id = ? AND u.active = 1 AND u.deleted_at IS NULL
  `).get(req.session.userId);

  if (!user) {
    req.session.destroy();
    return res.redirect('/login');
  }

  if (user.suspended) {
    req.session.destroy();
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(403).json({ error: 'Cuenta suspendida' });
    }
    return res.redirect('/login?error=suspended');
  }

  req.user = user;
  next();
}

/**
 * RBAC — Verifica que el usuario tiene uno de los roles permitidos
 * @param {...string} roles - Roles permitidos ('admin', 'tic', 'employee')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.redirect('/login');

    if (!roles.includes(req.user.role)) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(403).json({
          error: 'No tienes permisos para esta acción',
          redirect: '/403',
          requiredRole: roles.join(' o ')
        });
      }

      req.session.returnTo = req.originalUrl;
      return res.status(403).sendFile(
        require('path').join(__dirname, '../../public/403.html')
      );
    }
    next();
  };
}

/**
 * Verifica que el usuario sea el dueño del recurso o tenga rol privilegiado
 */
function requireOwnerOrRole(getOwnerId, ...roles) {
  return (req, res, next) => {
    if (!req.user) return res.redirect('/login');
    if (roles.includes(req.user.role)) return next();

    const ownerId = getOwnerId(req);
    if (ownerId === req.user.id) return next();

    return res.status(403).json({ error: 'No tienes permisos para este recurso' });
  };
}

module.exports = { requireAuth, requireRole, requireOwnerOrRole };
