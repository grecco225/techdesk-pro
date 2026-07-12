/**
 * TechDesk Pro — Controlador Administrativo
 */

const db = require('../db');
const bcrypt = require('bcryptjs');
const { logAudit } = require('../middleware/audit.middleware');
const { createNotification } = require('./notifications.controller');

// ── USUARIOS ─────────────────────────────────────────────────

function listUsers(req, res) {
  const { search, role, department, active, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  let where = ['u.deleted_at IS NULL'];
  let params = [];

  if (search) { where.push('(u.name LIKE ? OR u.email LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (role) { where.push('u.role = ?'); params.push(role); }
  if (department) { where.push('u.department_id = ?'); params.push(department); }
  if (active !== undefined) { where.push('u.active = ?'); params.push(parseInt(active)); }

  const whereStr = 'WHERE ' + where.join(' AND ');

  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.active, u.suspended, u.last_login, u.created_at,
      d.name as department_name
    FROM users u LEFT JOIN departments d ON u.department_id = d.id
    ${whereStr}
    ORDER BY u.created_at DESC LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  const total = db.prepare(`SELECT COUNT(*) as c FROM users u ${whereStr}`).get(...params).c;

  res.json({ users, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } });
}

async function createUser(req, res) {
  const { name, email, password, role, department_id, phone } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'Faltan campos requeridos' });

  const exists = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email.toLowerCase());
  if (exists) return res.status(409).json({ error: 'El email ya está registrado' });

  const hash = await bcrypt.hash(password, 12);
  const result = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, department_id, phone)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, email.toLowerCase(), hash, role, department_id || null, phone || null);

  const user = db.prepare(`SELECT id, name, email, role FROM users WHERE id = ?`).get(result.lastInsertRowid);

  // Notificar al nuevo usuario
  createNotification({ userId: user.id, type: 'welcome', title: '¡Bienvenido a TechDesk Pro!', message: `Tu cuenta ha sido creada. Rol: ${role}` });

  logAudit({ userId: req.user.id, userName: req.user.name, action: 'CREATE_USER', entity: 'users', entityId: user.id, newData: { name, email, role }, req });

  res.status(201).json({ success: true, user });
}

function updateUser(req, res) {
  const { name, email, role, department_id, phone, active, suspended } = req.body;
  const user = db.prepare(`SELECT * FROM users WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const oldData = { name: user.name, role: user.role, active: user.active, suspended: user.suspended };

  db.prepare(`
    UPDATE users SET name=?, email=?, role=?, department_id=?, phone=?, active=?, suspended=?, updated_at=datetime('now')
    WHERE id = ?
  `).run(name || user.name, email || user.email, role || user.role, department_id ?? user.department_id, phone ?? user.phone, active ?? user.active, suspended ?? user.suspended, user.id);

  logAudit({ userId: req.user.id, userName: req.user.name, action: 'UPDATE_USER', entity: 'users', entityId: user.id, oldData, newData: req.body, req });

  res.json({ success: true });
}

async function resetUserPassword(req, res) {
  const { password } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });

  const user = db.prepare(`SELECT id, name FROM users WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const hash = await bcrypt.hash(password, 12);
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(hash, user.id);

  createNotification({ userId: user.id, type: 'password_reset', title: '🔐 Contraseña Restablecida', message: 'Un administrador restableció tu contraseña. Por favor cámbiala al ingresar.' });

  logAudit({ userId: req.user.id, userName: req.user.name, action: 'RESET_PASSWORD', entity: 'users', entityId: user.id, req });

  res.json({ success: true });
}

function deleteUser(req, res) {
  const user = db.prepare(`SELECT id, name FROM users WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (user.id === req.user.id) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });

  db.prepare(`UPDATE users SET deleted_at = datetime('now'), active = 0 WHERE id = ?`).run(user.id);
  logAudit({ userId: req.user.id, userName: req.user.name, action: 'DELETE_USER', entity: 'users', entityId: user.id, oldData: { name: user.name }, req });

  res.json({ success: true });
}

// ── DEPARTAMENTOS ─────────────────────────────────────────────

function listDepartments(req, res) {
  const depts = db.prepare(`
    SELECT d.*, COUNT(u.id) as user_count
    FROM departments d LEFT JOIN users u ON d.id = u.department_id AND u.deleted_at IS NULL AND u.active = 1
    GROUP BY d.id ORDER BY d.name
  `).all();
  res.json({ departments: depts });
}

function createDepartment(req, res) {
  const { name, code, description } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'Nombre y código son requeridos' });
  try {
    const result = db.prepare(`INSERT INTO departments (name, code, description) VALUES (?, ?, ?)`).run(name, code.toUpperCase(), description || null);
    res.status(201).json({ success: true, id: result.lastInsertRowid });
  } catch { res.status(409).json({ error: 'El nombre o código ya existe' }); }
}

// ── SOLICITUDES ADMINISTRATIVAS ───────────────────────────────

function listAdminRequests(req, res) {
  const { status, priority, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  let where = [];
  let params = [];

  if (status) { where.push('ar.status = ?'); params.push(status); }
  if (priority) { where.push('ar.priority = ?'); params.push(priority); }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const requests = db.prepare(`
    SELECT ar.*,
      r.name as requester_name, r.email as requester_email,
      a.name as affected_name, a.email as affected_email,
      res.name as resolved_by_name
    FROM admin_requests ar
    LEFT JOIN users r ON ar.requester_id = r.id
    LEFT JOIN users a ON ar.affected_user_id = a.id
    LEFT JOIN users res ON ar.resolved_by = res.id
    ${whereStr}
    ORDER BY CASE ar.priority WHEN 'urgente' THEN 1 WHEN 'alta' THEN 2 WHEN 'media' THEN 3 ELSE 4 END,
             ar.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  const total = db.prepare(`SELECT COUNT(*) as c FROM admin_requests ar ${whereStr}`).get(...params).c;

  res.json({ requests, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } });
}

function resolveAdminRequest(req, res) {
  const { action, admin_response } = req.body; // action: 'aprobada' | 'rechazada'
  if (!['aprobada', 'rechazada'].includes(action)) return res.status(400).json({ error: 'Acción inválida' });

  const request = db.prepare(`SELECT * FROM admin_requests WHERE id = ?`).get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Solicitud no encontrada' });
  if (request.status !== 'pendiente') return res.status(400).json({ error: 'La solicitud ya fue procesada' });

  // Bug #12: Bloquear auto-aprobación (el que creó la solicitud no puede resolverla)
  if (request.requester_id === req.user.id) {
    return res.status(403).json({ error: 'No puedes aprobar o rechazar tu propia solicitud' });
  }

  db.prepare(`
    UPDATE admin_requests SET status=?, admin_response=?, resolved_by=?, resolved_at=datetime('now'), updated_at=datetime('now')
    WHERE id=?
  `).run(action, admin_response || null, req.user.id, request.id);

  const { notifyRequestResponse } = require('./notifications.controller');
  notifyRequestResponse(request, action);

  logAudit({ userId: req.user.id, userName: req.user.name, action: `REQUEST_${action.toUpperCase()}`, entity: 'admin_requests', entityId: request.id, req });

  res.json({ success: true });
}

// ── DASHBOARD EJECUTIVO ───────────────────────────────────────

function getDashboard(req, res) {
  const stats = {
    users: {
      total: db.prepare(`SELECT COUNT(*) as c FROM users WHERE deleted_at IS NULL`).get().c,
      active: db.prepare(`SELECT COUNT(*) as c FROM users WHERE active = 1 AND deleted_at IS NULL`).get().c,
      suspended: db.prepare(`SELECT COUNT(*) as c FROM users WHERE suspended = 1`).get().c,
    },
    tickets: {
      total: db.prepare(`SELECT COUNT(*) as c FROM tickets WHERE deleted_at IS NULL`).get().c,
      open: db.prepare(`SELECT COUNT(*) as c FROM tickets WHERE status NOT IN ('cerrado','resuelto') AND deleted_at IS NULL`).get().c,
      closed: db.prepare(`SELECT COUNT(*) as c FROM tickets WHERE status = 'cerrado' AND deleted_at IS NULL`).get().c,
      resolved: db.prepare(`SELECT COUNT(*) as c FROM tickets WHERE status = 'resuelto' AND deleted_at IS NULL`).get().c,
      urgent: db.prepare(`SELECT COUNT(*) as c FROM tickets t JOIN priorities p ON t.priority_id = p.id WHERE p.level = 4 AND t.status NOT IN ('cerrado','resuelto') AND t.deleted_at IS NULL`).get().c,
    },
    requests: {
      total: db.prepare(`SELECT COUNT(*) as c FROM admin_requests`).get().c,
      pending: db.prepare(`SELECT COUNT(*) as c FROM admin_requests WHERE status = 'pendiente'`).get().c,
      approved: db.prepare(`SELECT COUNT(*) as c FROM admin_requests WHERE status = 'aprobada'`).get().c,
    },
    byStatus: db.prepare(`SELECT status, COUNT(*) as count FROM tickets WHERE deleted_at IS NULL GROUP BY status`).all(),
    byPriority: db.prepare(`SELECT p.name, p.color, COUNT(t.id) as count FROM priorities p LEFT JOIN tickets t ON t.priority_id = p.id AND t.deleted_at IS NULL GROUP BY p.id`).all(),
    recentTickets: db.prepare(`
      SELECT t.id, t.code, t.title, t.status, p.name as priority, p.color, u.name as requester, t.created_at
      FROM tickets t JOIN priorities p ON t.priority_id = p.id JOIN users u ON t.requester_id = u.id
      WHERE t.deleted_at IS NULL ORDER BY t.created_at DESC LIMIT 5
    `).all(),
  };

  res.json(stats);
}

// ── AUDITORÍA ─────────────────────────────────────────────────

function getAuditLogs(req, res) {
  const { entity, user, page = 1, limit = 30 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  let where = [];
  let params = [];

  if (entity) { where.push('entity = ?'); params.push(entity); }
  if (user) { where.push('user_id = ?'); params.push(user); }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const logs = db.prepare(`SELECT * FROM audit_logs ${whereStr} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
  const total = db.prepare(`SELECT COUNT(*) as c FROM audit_logs ${whereStr}`).get(...params).c;

  res.json({ logs, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } });
}

module.exports = {
  listUsers, createUser, updateUser, resetUserPassword, deleteUser,
  listDepartments, createDepartment,
  listAdminRequests, resolveAdminRequest,
  getDashboard, getAuditLogs
};
