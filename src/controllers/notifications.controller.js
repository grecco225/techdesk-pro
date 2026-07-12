/**
 * TechDesk Pro — Controlador de Notificaciones
 */

const db = require('../db');

/**
 * Crea una notificación para un usuario
 */
function createNotification({ userId, type, title, message, link }) {
  try {
    db.prepare(`
      INSERT INTO notifications (user_id, type, title, message, link)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, type, title, message, link || null);
  } catch (err) {
    console.error('Notification error:', err.message);
  }
}

/**
 * Notifica a todos los usuarios TIC sobre un nuevo ticket
 */
function notifyTICNewTicket(ticket) {
  const ticUsers = db.prepare(`SELECT id FROM users WHERE role = 'tic' AND active = 1`).all();
  ticUsers.forEach(u => {
    createNotification({
      userId: u.id,
      type: 'new_ticket',
      title: '🎫 Nuevo Ticket',
      message: `Se creó el ticket #${ticket.code}: ${ticket.title}`,
      link: `/tickets/${ticket.id}`
    });
  });
}

/**
 * Notifica al empleado sobre cambio de estado de su ticket
 */
function notifyTicketStatusChange(ticket, oldStatus, newStatus, changedByName) {
  const statusLabels = {
    nuevo: 'Nuevo', en_revision: 'En Revisión', en_proceso: 'En Proceso',
    pendiente: 'Pendiente', esperando_usuario: 'Esperando Usuario',
    resuelto: 'Resuelto', cerrado: 'Cerrado'
  };

  createNotification({
    userId: ticket.requester_id,
    type: 'status_change',
    title: '🔄 Estado de Ticket Actualizado',
    message: `Tu ticket #${ticket.code} cambió de "${statusLabels[oldStatus]}" a "${statusLabels[newStatus]}" por ${changedByName}`,
    link: `/tickets/${ticket.id}`
  });
}

/**
 * Notifica al TIC asignado sobre un nuevo ticket
 */
function notifyTicketAssigned(ticket, assignedUserId) {
  createNotification({
    userId: assignedUserId,
    type: 'ticket_assigned',
    title: '📋 Ticket Asignado',
    message: `Se te asignó el ticket #${ticket.code}: ${ticket.title}`,
    link: `/tickets/${ticket.id}`
  });
}

/**
 * Notifica al empleado sobre un nuevo comentario en su ticket
 */
function notifyNewComment(ticket, commentAuthorName, commentType) {
  if (commentType === 'internal') return; // Los comentarios internos no notifican al empleado
  createNotification({
    userId: ticket.requester_id,
    type: 'new_comment',
    title: '💬 Nuevo Comentario',
    message: `${commentAuthorName} comentó en tu ticket #${ticket.code}`,
    link: `/tickets/${ticket.id}`
  });
}

/**
 * Notifica al Admin sobre una nueva solicitud administrativa
 */
function notifyAdminNewRequest(adminRequest, requesterName) {
  const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin' AND active = 1`).all();
  admins.forEach(a => {
    createNotification({
      userId: a.id,
      type: 'admin_request',
      title: '⚡ Nueva Solicitud Administrativa',
      message: `${requesterName} envió una solicitud: ${adminRequest.subject}`,
      link: `/admin/requests/${adminRequest.id}`
    });
  });
}

/**
 * Notifica al TIC sobre la respuesta a su solicitud
 */
function notifyRequestResponse(adminRequest, status) {
  const statusLabel = status === 'aprobada' ? '✅ Aprobada' : '❌ Rechazada';
  createNotification({
    userId: adminRequest.requester_id,
    type: 'request_response',
    title: `Solicitud ${statusLabel}`,
    message: `Tu solicitud "${adminRequest.subject}" fue ${status}`,
    link: `/tic/requests/${adminRequest.id}`
  });
}

/**
 * GET /notifications — Obtener notificaciones del usuario
 */
function getNotifications(req, res) {
  const limit = parseInt(req.query.limit) || 20;
  const notifications = db.prepare(`
    SELECT * FROM notifications WHERE user_id = ?
    ORDER BY created_at DESC LIMIT ?
  `).all(req.user.id, limit);

  const unreadCount = db.prepare(`
    SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0
  `).get(req.user.id).count;

  res.json({ notifications, unreadCount });
}

/**
 * PUT /notifications/:id/read — Marcar como leída
 */
function markAsRead(req, res) {
  db.prepare(`UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`).run(req.params.id, req.user.id);
  res.json({ success: true });
}

/**
 * PUT /notifications/read-all — Marcar todas como leídas
 */
function markAllAsRead(req, res) {
  db.prepare(`UPDATE notifications SET read = 1 WHERE user_id = ?`).run(req.user.id);
  res.json({ success: true });
}

module.exports = {
  createNotification,
  notifyTICNewTicket,
  notifyTicketStatusChange,
  notifyTicketAssigned,
  notifyNewComment,
  notifyAdminNewRequest,
  notifyRequestResponse,
  getNotifications,
  markAsRead,
  markAllAsRead
};
