/**
 * TechDesk Pro — Controlador de Autenticación
 */

const db = require('../db');
const bcrypt = require('bcryptjs');
const { logAudit } = require('../middleware/audit.middleware');
const { createNotification } = require('./notifications.controller');

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

/**
 * POST /auth/login
 */
async function login(req, res) {
  try {
    const { email, password, remember } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' });
    }

    const user = db.prepare(`
      SELECT u.*, d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.email = ? AND u.deleted_at IS NULL
    `).get(email.toLowerCase().trim());

    // Usuario no existe
    if (!user) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // Cuenta suspendida
    if (user.suspended) {
      return res.status(403).json({ error: 'Tu cuenta está suspendida. Contacta al administrador.' });
    }

    // Cuenta inactiva
    if (!user.active) {
      return res.status(403).json({ error: 'Tu cuenta está desactivada. Contacta al administrador.' });
    }

    // Cuenta bloqueada por intentos
    if (user.locked_until) {
      const lockedUntil = new Date(user.locked_until);
      if (lockedUntil > new Date()) {
        const mins = Math.ceil((lockedUntil - new Date()) / 60000);
        return res.status(429).json({ error: `Cuenta bloqueada. Intenta en ${mins} minutos.` });
      }
      // Desbloquear si ya pasó el tiempo
      db.prepare(`UPDATE users SET login_attempts = 0, locked_until = NULL WHERE id = ?`).run(user.id);
    }

    // Verificar contraseña
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const attempts = (user.login_attempts || 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        const lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
        db.prepare(`UPDATE users SET login_attempts = ?, locked_until = ? WHERE id = ?`).run(attempts, lockUntil, user.id);
        return res.status(429).json({ error: `Demasiados intentos. Cuenta bloqueada por ${LOCK_MINUTES} minutos.` });
      }
      db.prepare(`UPDATE users SET login_attempts = ? WHERE id = ?`).run(attempts, user.id);
      return res.status(401).json({ error: `Credenciales incorrectas. Intentos restantes: ${MAX_ATTEMPTS - attempts}` });
    }

    // Login exitoso — resetear intentos y actualizar last_login
    db.prepare(`UPDATE users SET login_attempts = 0, locked_until = NULL, last_login = datetime('now') WHERE id = ?`).run(user.id);

    // Crear sesión
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Error al crear sesión' });

      req.session.userId = user.id;
      req.session.userRole = user.role;
      if (remember) req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 días

      logAudit({
        userId: user.id, userName: user.name,
        action: 'LOGIN', entity: 'users', entityId: user.id, req
      });

      res.json({
        success: true,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        redirect: getDashboardByRole(user.role)
      });
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST /auth/logout
 */
function logout(req, res) {
  const userId = req.session?.userId;
  const userName = req.user?.name;

  req.session.destroy((err) => {
    logAudit({ userId, userName, action: 'LOGOUT', entity: 'users', entityId: userId, req });
    res.clearCookie('techdesk.sid');
    res.json({ success: true, redirect: '/login' });
  });
}

/**
 * POST /auth/forgot-password
 */
async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });

  const user = db.prepare(`SELECT id, name, email FROM users WHERE email = ? AND active = 1`).get(email.toLowerCase().trim());

  // Siempre responder con éxito (no revelar si el email existe)
  if (!user) {
    return res.json({ success: true, message: 'Si el correo existe, recibirás instrucciones.' });
  }

  const { v4: uuidv4 } = require('uuid');
  const token = uuidv4().replace(/-/g, '');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hora

  db.prepare(`UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?`).run(token, expires, user.id);

  // En producción aquí enviarías el email con nodemailer
  // Por ahora: log en consola y en dev mode exponer el link en la respuesta
  const resetLink = `${req.protocol}://${req.get('host')}/reset-password?token=${token}`;
  console.log(`🔑 Reset token para ${user.email}: ${token}`);
  console.log(`🔗 Link de reset: ${resetLink}`);

  const isDev = process.env.NODE_ENV !== 'production';
  res.json({
    success: true,
    message: 'Si el correo existe, recibirás instrucciones en breve.',
    ...(isDev && { devResetLink: resetLink, devNote: 'Este link solo se muestra en modo desarrollo.' })
  });
}

/**
 * POST /auth/reset-password
 */
async function resetPassword(req, res) {
  const { token, password, confirmPassword } = req.body;

  if (!token || !password) return res.status(400).json({ error: 'Datos incompletos' });
  if (password !== confirmPassword) return res.status(400).json({ error: 'Las contraseñas no coinciden' });
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });

  const user = db.prepare(`
    SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > datetime('now')
  `).get(token);

  if (!user) return res.status(400).json({ error: 'Token inválido o expirado' });

  const hash = await bcrypt.hash(password, 12);
  db.prepare(`UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?`).run(hash, user.id);

  logAudit({ userId: user.id, userName: user.name, action: 'PASSWORD_RESET', entity: 'users', entityId: user.id, req });

  res.json({ success: true, message: 'Contraseña actualizada exitosamente' });
}

/**
 * GET /auth/me — Datos del usuario actual
 */
function me(req, res) {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });
  const { password_hash, reset_token, remember_token, ...safeUser } = req.user;
  res.json({ user: safeUser });
}

function getDashboardByRole(role) {
  const map = { admin: '/dashboard', tic: '/dashboard', employee: '/dashboard' };
  return map[role] || '/dashboard';
}

module.exports = { login, logout, forgotPassword, resetPassword, me };
