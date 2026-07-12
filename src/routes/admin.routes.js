/**
 * TechDesk Pro — Rutas Administrativas
 */

const express = require('express');
const router = express.Router();
const admin = require('../controllers/admin.controller');
const notif = require('../controllers/notifications.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');

const onlyAdmin = [requireAuth, requireRole('admin')];

// Dashboard
router.get('/dashboard',         ...onlyAdmin, admin.getDashboard);

// Usuarios
router.get('/users',             ...onlyAdmin, admin.listUsers);
router.post('/users',            ...onlyAdmin, admin.createUser);
router.put('/users/:id',         ...onlyAdmin, admin.updateUser);
router.post('/users/:id/reset-password', ...onlyAdmin, admin.resetUserPassword);
router.delete('/users/:id',      ...onlyAdmin, admin.deleteUser);

// Departamentos
router.get('/departments',       requireAuth,  admin.listDepartments);
router.post('/departments',      ...onlyAdmin, admin.createDepartment);

// Solicitudes administrativas
router.get('/requests',          ...onlyAdmin, admin.listAdminRequests);
router.put('/requests/:id',      ...onlyAdmin, admin.resolveAdminRequest);

// Auditoría
router.get('/audit',             ...onlyAdmin, admin.getAuditLogs);

// Notificaciones (todos los roles)
router.get('/notifications',           requireAuth, notif.getNotifications);
router.put('/notifications/:id/read',  requireAuth, notif.markAsRead);
router.put('/notifications/read-all',  requireAuth, notif.markAllAsRead);

module.exports = router;
