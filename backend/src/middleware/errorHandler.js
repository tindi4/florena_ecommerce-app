'use strict';
const { ZodError } = require('zod');
const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');
const config = require('../config/env');

function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route introuvable.' } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Certaines informations sont invalides.',
        details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      },
    });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Requête trop volumineuse.' } });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'JSON invalide.' } });
  }
  if (err && err.name === 'MulterError') {
    const max = req.uploadLimitLabel || '5 Mo';
    const message = err.code === 'LIMIT_FILE_SIZE' ? `Fichier trop lourd : ${max} maximum.` : `Fichier refusé (un seul fichier, ${max} maximum).`;
    return res.status(400).json({ error: { code: 'UPLOAD_ERROR', message } });
  }
  logger.error('Erreur non gérée', { path: req.path, method: req.method, message: err && err.message, stack: config.isProd ? undefined : err && err.stack });
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Une erreur interne est survenue.' } });
}

module.exports = { notFoundHandler, errorHandler };
