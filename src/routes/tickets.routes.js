/**
 * TechDesk Pro — Rutas de Tickets
 */

const express = require('express');
const router = express.Router();
const tickets = require('../controllers/tickets.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Configuración de multer para adjuntos
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../public/uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf','.doc','.docx','.xls','.xlsx','.png','.jpg','.jpeg','.gif','.txt','.zip'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// Todos los autenticados
router.get('/form-data',     requireAuth, tickets.getFormData);
router.get('/stats',         requireAuth, tickets.getStats);
router.get('/',              requireAuth, tickets.list);
router.post('/',             requireAuth, tickets.create);
router.get('/:id',           requireAuth, tickets.getById);

// Comentarios
router.post('/:id/comments', requireAuth, tickets.addComment);

// Adjuntos
router.post('/:id/attachments', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Archivo no válido o demasiado grande (máx 10MB)' });
  const db = require('../db');
  const ticket = db.prepare(`SELECT id FROM tickets WHERE id = ? AND deleted_at IS NULL`).get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });

  db.prepare(`INSERT INTO ticket_attachments (ticket_id, user_id, filename, original_name, mimetype, size) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(ticket.id, req.user.id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size);

  res.status(201).json({ success: true, filename: req.file.filename, originalName: req.file.originalname });
});

// Solo TIC y Admin
router.put('/:id/status',   requireAuth, requireRole('tic','admin'), tickets.updateStatus);
router.put('/:id/assign',   requireAuth, requireRole('tic','admin'), tickets.assign);

// Empleado puede cerrar sus propios tickets
router.put('/:id/close',    requireAuth, (req, res) => {
  req.body.status = 'cerrado';
  tickets.updateStatus(req, res);
});

module.exports = router;
