/**
 * TechDesk Pro — Rutas de Autenticación
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const auth = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth.middleware');

// Rate limit estricto en login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de inicio de sesión. Espera 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login',           loginLimiter, auth.login);
router.post('/logout',          requireAuth,  auth.logout);
router.post('/forgot-password', loginLimiter, auth.forgotPassword);
router.post('/reset-password',               auth.resetPassword);
router.get('/me',               requireAuth,  auth.me);

module.exports = router;
