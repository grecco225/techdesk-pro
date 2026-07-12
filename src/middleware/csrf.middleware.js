/**
 * TechDesk Pro — Middleware CSRF
 * Genera un token, lo guarda en cookie, y exige que coincida
 * con el header x-csrf-token en toda petición que modifique datos.
 */

const crypto = require('crypto');

/**
 * Genera o renueva el token CSRF y lo guarda en una cookie.
 * Se ejecuta en TODAS las peticiones (antes de las rutas).
 */
function csrfSetToken(req, res, next) {
  // Si no hay token en la cookie, generar uno nuevo
  if (!req.cookies || !req.cookies._csrf) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie('_csrf', token, {
      httpOnly: false,       // El JS del frontend necesita leerla
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 60 * 1000 // 30 minutos (igual que la sesión)
    });
    req._csrfToken = token;
  } else {
    req._csrfToken = req.cookies._csrf;
  }
  next();
}

/**
 * Valida el token CSRF en peticiones que modifican datos.
 * Compara el header `x-csrf-token` con la cookie `_csrf`.
 * Se salta métodos seguros (GET, HEAD, OPTIONS).
 */
function csrfValidate(req, res, next) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  const cookieToken = req.cookies?._csrf;
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'Token CSRF inválido o ausente' });
  }

  next();
}

module.exports = { csrfSetToken, csrfValidate };
