/**
 * TechDesk Pro — Rutas TIC
 */

const express = require('express');
const router = express.Router();
const tic = require('../controllers/tic.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');

const onlyTIC = [requireAuth, requireRole('tic','admin')];

router.get('/dashboard',       ...onlyTIC, tic.getDashboard);
router.get('/request-types',   ...onlyTIC, tic.getRequestTypes);
router.get('/employees',       ...onlyTIC, tic.listEmployees);  // Bug #12: lista empleados sin acceder a /admin
router.get('/requests',        ...onlyTIC, tic.listMyRequests);
router.post('/requests',       ...onlyTIC, tic.createRequest);

module.exports = router;
