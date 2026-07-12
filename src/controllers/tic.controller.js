/**
 * TechDesk Pro — Controlador TIC
 * Gestión de solicitudes administrativas desde TIC al Admin
 */

const db = require('../db');
const { v4: uuidv4 } = require('uuid');
const { logAudit } = require('../middleware/audit.middleware');
const { notifyAdminNewRequest } = require('./notifications.controller');

const REQUEST_TYPES = [
  'baja_empleado', 'suspension_temporal', 'cambio_departamento',
  'cambio_permisos', 'restablecimiento_contrasena', 'asignacion_equipo',
  'retiro_equipo', 'cambio_cargo', 'actualizacion_info', 'otro'
];

/**
 * POST /tic/requests — TIC crea solicitud administrativa
 */
function createRequest(req, res) {
  const { type, subject, description, priority, affected_user_id, observations } = req.body;

  if (!type || !subject || !description || !priority) {
    return res.status(400).json({ error: 'Tipo, asunto, descripción y prioridad son requeridos' });
  }

  if (!REQUEST_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Tipo de solicitud inválido' });
  }

  const year = new Date().getFullYear();
  const count = db.prepare(`SELECT COUNT(*) as c FROM admin_requests`).get().c + 1;
  const code = `SR-${year}-${String(count).padStart(4, '0')}`;

  const result = db.prepare(`
    INSERT INTO admin_requests (code, type, requester_id, affected_user_id, subject, description, priority, observations)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(code, type, req.user.id, affected_user_id || null, subject, description, priority, observations || null);

  const request = db.prepare(`SELECT * FROM admin_requests WHERE id = ?`).get(result.lastInsertRowid);

  notifyAdminNewRequest(request, req.user.name);

  logAudit({ userId: req.user.id, userName: req.user.name, action: 'CREATE_ADMIN_REQUEST', entity: 'admin_requests', entityId: request.id, newData: { type, subject, priority }, req });

  res.status(201).json({ success: true, request });
}

/**
 * GET /tic/requests — TIC ve sus propias solicitudes
 */
function listMyRequests(req, res) {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  let where = ['ar.requester_id = ?'];
  let params = [req.user.id];

  if (status) { where.push('ar.status = ?'); params.push(status); }

  const whereStr = 'WHERE ' + where.join(' AND ');

  const requests = db.prepare(`
    SELECT ar.*, u.name as affected_name, res.name as resolved_by_name
    FROM admin_requests ar
    LEFT JOIN users u ON ar.affected_user_id = u.id
    LEFT JOIN users res ON ar.resolved_by = res.id
    ${whereStr}
    ORDER BY ar.created_at DESC LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  const total = db.prepare(`SELECT COUNT(*) as c FROM admin_requests ar ${whereStr}`).get(...params).c;

  res.json({ requests, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } });
}

/**
 * GET /tic/dashboard — Dashboard TIC
 */
function getDashboard(req, res) {
  const myTickets = db.prepare(`SELECT COUNT(*) as c FROM tickets WHERE assigned_to = ? AND deleted_at IS NULL`).get(req.user.id).c;
  const myPending = db.prepare(`SELECT COUNT(*) as c FROM tickets WHERE assigned_to = ? AND status NOT IN ('resuelto','cerrado') AND deleted_at IS NULL`).get(req.user.id).c;
  const myUrgent  = db.prepare(`SELECT COUNT(*) as c FROM tickets t JOIN priorities p ON t.priority_id = p.id WHERE t.assigned_to = ? AND p.level = 4 AND t.status NOT IN ('resuelto','cerrado') AND t.deleted_at IS NULL`).get(req.user.id).c;
  const allOpen   = db.prepare(`SELECT COUNT(*) as c FROM tickets WHERE status NOT IN ('resuelto','cerrado') AND deleted_at IS NULL`).get().c;
  const unassigned = db.prepare(`SELECT COUNT(*) as c FROM tickets WHERE assigned_to IS NULL AND status = 'nuevo' AND deleted_at IS NULL`).get().c;

  const myRequests = db.prepare(`SELECT COUNT(*) as c FROM admin_requests WHERE requester_id = ?`).get(req.user.id).c;
  const pendingRequests = db.prepare(`SELECT COUNT(*) as c FROM admin_requests WHERE requester_id = ? AND status = 'pendiente'`).get(req.user.id).c;

  const recentTickets = db.prepare(`
    SELECT t.id, t.code, t.title, t.status, p.name as priority, p.color, u.name as requester, t.created_at
    FROM tickets t JOIN priorities p ON t.priority_id = p.id JOIN users u ON t.requester_id = u.id
    WHERE t.assigned_to = ? AND t.deleted_at IS NULL
    ORDER BY p.level DESC, t.created_at DESC LIMIT 5
  `).all(req.user.id);

  const newTickets = db.prepare(`
    SELECT t.id, t.code, t.title, t.status, p.name as priority, p.color, u.name as requester, t.created_at
    FROM tickets t JOIN priorities p ON t.priority_id = p.id JOIN users u ON t.requester_id = u.id
    WHERE t.assigned_to IS NULL AND t.status = 'nuevo' AND t.deleted_at IS NULL
    ORDER BY p.level DESC, t.created_at DESC LIMIT 5
  `).all();

  res.json({ myTickets, myPending, myUrgent, allOpen, unassigned, myRequests, pendingRequests, recentTickets, newTickets });
}

/**
 * GET /tic/request-types — Tipos de solicitudes disponibles
 */
function getRequestTypes(req, res) {
  const labels = {
    baja_empleado: 'Baja de Empleado',
    suspension_temporal: 'Suspensión Temporal',
    cambio_departamento: 'Cambio de Departamento',
    cambio_permisos: 'Cambio de Permisos',
    restablecimiento_contrasena: 'Restablecimiento de Contraseña',
    asignacion_equipo: 'Asignación de Equipo',
    retiro_equipo: 'Retiro de Equipo',
    cambio_cargo: 'Cambio de Cargo',
    actualizacion_info: 'Actualización de Información',
    otro: 'Otro'
  };
  res.json({ types: REQUEST_TYPES.map(t => ({ value: t, label: labels[t] })) });
}

/**
 * GET /tic/employees — Lista empleados activos para el formulario de solicitud
 * Permite a TIC obtener la lista sin necesitar acceso a /admin/users
 */
function listEmployees(req, res) {
  const employees = db.prepare(`
    SELECT u.id, u.name, u.email, d.name as department_name
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    WHERE u.active = 1 AND u.deleted_at IS NULL
    ORDER BY u.name ASC
  `).all();
  res.json({ users: employees });
}

module.exports = { createRequest, listMyRequests, getDashboard, getRequestTypes, listEmployees };
