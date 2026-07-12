/**
 * TechDesk Pro — Controlador de Tickets
 */

const db = require('../db');
const { v4: uuidv4 } = require('uuid');
const { logAudit } = require('../middleware/audit.middleware');
const {
  notifyTICNewTicket, notifyTicketStatusChange,
  notifyTicketAssigned, notifyNewComment
} = require('./notifications.controller');

function generateCode() {
  const year = new Date().getFullYear();
  const count = db.prepare(`SELECT COUNT(*) as c FROM tickets`).get().c + 1;
  return `TK-${year}-${String(count).padStart(4, '0')}`;
}

/**
 * GET /tickets — Listar tickets (filtrados por rol)
 */
function list(req, res) {
  const { status, priority, category, search, assigned, unassigned, page = 1, limit = 15 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = ['t.deleted_at IS NULL'];
  let params = [];

  // Filtro por rol
  if (req.user.role === 'employee') {
    where.push('t.requester_id = ?');
    params.push(req.user.id);
  }

  // Bug #11: soporte para filtrar por asignado al usuario actual (TIC)
  if (assigned === 'me' && req.user.role !== 'employee') {
    where.push('t.assigned_to = ?');
    params.push(req.user.id);
  }

  // Filtrar sin asignar (tickets disponibles para autoasignación)
  if (unassigned === 'true' && req.user.role !== 'employee') {
    where.push('t.assigned_to IS NULL');
  }

  if (status) { where.push('t.status = ?'); params.push(status); }
  if (priority) { where.push('p.name = ?'); params.push(priority); }
  if (category) { where.push('c.id = ?'); params.push(category); }
  if (search) {
    where.push('(t.code LIKE ? OR t.title LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const tickets = db.prepare(`
    SELECT t.*, 
      p.name as priority_name, p.color as priority_color,
      c.name as category_name, c.icon as category_icon,
      u.name as requester_name,
      a.name as assigned_name,
      d.name as department_name,
      (SELECT COUNT(*) FROM ticket_comments WHERE ticket_id = t.id) as comment_count
    FROM tickets t
    LEFT JOIN priorities p ON t.priority_id = p.id
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN users u ON t.requester_id = u.id
    LEFT JOIN users a ON t.assigned_to = a.id
    LEFT JOIN departments d ON t.department_id = d.id
    ${whereStr}
    ORDER BY p.level DESC, t.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  const totalRow = db.prepare(`
    SELECT COUNT(*) as total FROM tickets t
    LEFT JOIN priorities p ON t.priority_id = p.id
    LEFT JOIN categories c ON t.category_id = c.id
    ${whereStr}
  `).get(...params);

  res.json({
    tickets,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: totalRow.total,
      pages: Math.ceil(totalRow.total / parseInt(limit))
    }
  });
}

/**
 * POST /tickets — Crear ticket
 */
function create(req, res) {
  try {
    const { title, description, category_id, subcategory_id, priority_id, ai_suggested } = req.body;

    if (!title || !description || !priority_id) {
      return res.status(400).json({ error: 'Título, descripción y prioridad son requeridos' });
    }

    const code = generateCode();
    const priority = db.prepare(`SELECT sla_hours FROM priorities WHERE id = ?`).get(priority_id);
    const dueDate = priority
      ? new Date(Date.now() + priority.sla_hours * 3600000).toISOString()
      : null;

    const result = db.prepare(`
      INSERT INTO tickets (code, title, description, category_id, subcategory_id, priority_id, requester_id, department_id, due_date, ai_suggested)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      code, title, description,
      category_id || null, subcategory_id || null, priority_id,
      req.user.id, req.user.department_id || null,
      dueDate,
      ai_suggested ? JSON.stringify(ai_suggested) : null
    );

    const ticket = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(result.lastInsertRowid);

    // Registrar en historial
    db.prepare(`
      INSERT INTO ticket_history (ticket_id, user_id, action, new_value)
      VALUES (?, ?, 'Ticket creado', ?)
    `).run(ticket.id, req.user.id, 'nuevo');

    // Notificar a TIC
    notifyTICNewTicket(ticket);

    logAudit({
      userId: req.user.id, userName: req.user.name,
      action: 'CREATE_TICKET', entity: 'tickets', entityId: ticket.id,
      newData: ticket, req
    });

    res.status(201).json({ success: true, ticket });
  } catch (err) {
    console.error('Create ticket error:', err);
    res.status(500).json({ error: 'Error al crear el ticket' });
  }
}

/**
 * GET /tickets/:id — Detalle del ticket
 */
function getById(req, res) {
  const ticket = db.prepare(`
    SELECT t.*,
      p.name as priority_name, p.color as priority_color, p.level as priority_level,
      c.name as category_name, c.icon as category_icon,
      sc.name as subcategory_name,
      u.name as requester_name, u.email as requester_email, u.department_id as req_dept_id,
      a.name as assigned_name, a.email as assigned_email,
      d.name as department_name
    FROM tickets t
    LEFT JOIN priorities p ON t.priority_id = p.id
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN subcategories sc ON t.subcategory_id = sc.id
    LEFT JOIN users u ON t.requester_id = u.id
    LEFT JOIN users a ON t.assigned_to = a.id
    LEFT JOIN departments d ON t.department_id = d.id
    WHERE t.id = ? AND t.deleted_at IS NULL
  `).get(req.params.id);

  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });

  // Restricción empleado: solo sus propios tickets
  if (req.user.role === 'employee' && ticket.requester_id !== req.user.id) {
    return res.status(403).json({ error: 'No tienes acceso a este ticket' });
  }

  // Comentarios (empleados no ven internos)
  const commentFilter = req.user.role === 'employee' ? `AND type = 'public'` : '';
  const comments = db.prepare(`
    SELECT tc.*, u.name as author_name, u.role as author_role, u.avatar as author_avatar
    FROM ticket_comments tc
    JOIN users u ON tc.user_id = u.id
    WHERE tc.ticket_id = ? ${commentFilter}
    ORDER BY tc.created_at ASC
  `).all(ticket.id);

  // Adjuntos
  const attachments = db.prepare(`
    SELECT ta.*, u.name as uploader_name
    FROM ticket_attachments ta
    JOIN users u ON ta.user_id = u.id
    WHERE ta.ticket_id = ?
    ORDER BY ta.created_at DESC
  `).all(ticket.id);

  // Historial
  const history = db.prepare(`
    SELECT th.*, u.name as user_name
    FROM ticket_history th
    JOIN users u ON th.user_id = u.id
    WHERE th.ticket_id = ?
    ORDER BY th.created_at ASC
  `).all(ticket.id);

  res.json({ ticket, comments, attachments, history });
}

/**
 * PUT /tickets/:id/status — Cambiar estado del ticket
 */
function updateStatus(req, res) {
  const { status, note } = req.body;
  const validStatuses = ['nuevo','en_revision','en_proceso','pendiente','esperando_usuario','resuelto','cerrado'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }

  const ticket = db.prepare(`SELECT * FROM tickets WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });

  // Empleado solo puede cerrar tickets resueltos
  if (req.user.role === 'employee') {
    if (status !== 'cerrado' || ticket.status !== 'resuelto') {
      return res.status(403).json({ error: 'Solo puedes cerrar tickets que estén resueltos' });
    }
    if (ticket.requester_id !== req.user.id) {
      return res.status(403).json({ error: 'No tienes acceso a este ticket' });
    }
  }

  const oldStatus = ticket.status;
  const now = new Date().toISOString();
  const extra = {};
  if (status === 'resuelto') extra.resolved_at = now;
  if (status === 'cerrado') extra.closed_at = now;

  const setClauses = ['status = ?', 'updated_at = datetime(\'now\')'];
  const setParams = [status];
  if (extra.resolved_at) { setClauses.push('resolved_at = ?'); setParams.push(extra.resolved_at); }
  if (extra.closed_at) { setClauses.push('closed_at = ?'); setParams.push(extra.closed_at); }
  setParams.push(ticket.id);

  db.prepare(`UPDATE tickets SET ${setClauses.join(', ')} WHERE id = ?`).run(...setParams);

  // Historial
  db.prepare(`
    INSERT INTO ticket_history (ticket_id, user_id, action, old_value, new_value, note)
    VALUES (?, ?, 'Cambio de estado', ?, ?, ?)
  `).run(ticket.id, req.user.id, oldStatus, status, note || null);

  // Notificar
  notifyTicketStatusChange(ticket, oldStatus, status, req.user.name);

  logAudit({ userId: req.user.id, userName: req.user.name, action: 'STATUS_CHANGE', entity: 'tickets', entityId: ticket.id, oldData: { status: oldStatus }, newData: { status }, req });

  res.json({ success: true });
}

/**
 * PUT /tickets/:id/assign — Asignar ticket (TIC/Admin)
 */
function assign(req, res) {
  const { assigned_to, note } = req.body;
  const ticket = db.prepare(`SELECT * FROM tickets WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });

  const assignee = assigned_to
    ? db.prepare(`SELECT id, name FROM users WHERE id = ? AND role = 'tic'`).get(assigned_to)
    : null;

  db.prepare(`UPDATE tickets SET assigned_to = ?, status = 'en_revision', updated_at = datetime('now') WHERE id = ?`)
    .run(assigned_to || null, ticket.id);

  db.prepare(`INSERT INTO ticket_history (ticket_id, user_id, action, old_value, new_value, note) VALUES (?, ?, 'Asignación', ?, ?, ?)`)
    .run(ticket.id, req.user.id, ticket.assigned_to, assigned_to, note || null);

  if (assigned_to) notifyTicketAssigned(ticket, assigned_to);

  res.json({ success: true });
}

/**
 * POST /tickets/:id/comments — Agregar comentario
 */
function addComment(req, res) {
  const { content, type } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'El comentario no puede estar vacío' });

  const ticket = db.prepare(`SELECT * FROM tickets WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });

  // Empleado solo puede comentarios públicos en sus tickets
  if (req.user.role === 'employee') {
    if (ticket.requester_id !== req.user.id) return res.status(403).json({ error: 'Acceso denegado' });
    if (type === 'internal') return res.status(403).json({ error: 'No puedes crear comentarios internos' });
  }

  const commentType = (req.user.role !== 'employee' && type === 'internal') ? 'internal' : 'public';
  const result = db.prepare(`
    INSERT INTO ticket_comments (ticket_id, user_id, content, type) VALUES (?, ?, ?, ?)
  `).run(ticket.id, req.user.id, content.trim(), commentType);

  db.prepare(`UPDATE tickets SET updated_at = datetime('now') WHERE id = ?`).run(ticket.id);
  db.prepare(`INSERT INTO ticket_history (ticket_id, user_id, action, note) VALUES (?, ?, 'Comentario agregado', ?)`)
    .run(ticket.id, req.user.id, commentType === 'internal' ? 'Comentario interno' : 'Comentario público');

  notifyNewComment(ticket, req.user.name, commentType);

  const comment = db.prepare(`
    SELECT tc.*, u.name as author_name, u.role as author_role FROM ticket_comments tc
    JOIN users u ON tc.user_id = u.id WHERE tc.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json({ success: true, comment });
}

/**
 * GET /tickets/stats — Estadísticas de tickets
 */
function getStats(req, res) {
  let filter = req.user.role === 'employee' ? `AND t.requester_id = ${req.user.id}` : '';

  const stats = {
    total: db.prepare(`SELECT COUNT(*) as c FROM tickets t WHERE deleted_at IS NULL ${filter}`).get().c,
    nuevo: db.prepare(`SELECT COUNT(*) as c FROM tickets t WHERE status = 'nuevo' AND deleted_at IS NULL ${filter}`).get().c,
    en_proceso: db.prepare(`SELECT COUNT(*) as c FROM tickets t WHERE status IN ('en_proceso','en_revision') AND deleted_at IS NULL ${filter}`).get().c,
    resuelto: db.prepare(`SELECT COUNT(*) as c FROM tickets t WHERE status = 'resuelto' AND deleted_at IS NULL ${filter}`).get().c,
    cerrado: db.prepare(`SELECT COUNT(*) as c FROM tickets t WHERE status = 'cerrado' AND deleted_at IS NULL ${filter}`).get().c,
    urgente: db.prepare(`SELECT COUNT(*) as c FROM tickets t JOIN priorities p ON t.priority_id = p.id WHERE p.level = 4 AND t.status NOT IN ('cerrado','resuelto') AND t.deleted_at IS NULL ${filter}`).get().c,
  };

  if (req.user.role === 'tic') {
    stats.mis_tickets = db.prepare(`SELECT COUNT(*) as c FROM tickets WHERE assigned_to = ? AND deleted_at IS NULL`).get(req.user.id).c;
  }

  res.json(stats);
}

/**
 * GET /categories — Obtener categorías y prioridades para formularios
 */
function getFormData(req, res) {
  const categories = db.prepare(`SELECT * FROM categories WHERE active = 1 ORDER BY name`).all();
  const subcategories = db.prepare(`SELECT * FROM subcategories WHERE active = 1 ORDER BY name`).all();
  const priorities = db.prepare(`SELECT * FROM priorities ORDER BY level`).all();
  const ticUsers = db.prepare(`SELECT id, name FROM users WHERE role = 'tic' AND active = 1`).all();
  res.json({ categories, subcategories, priorities, ticUsers });
}

module.exports = { list, create, getById, updateStatus, assign, addComment, getStats, getFormData };
