'use strict';
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
const badRequest = (msg, details) => new AppError(400, 'BAD_REQUEST', msg, details);
const unauthorized = (msg = 'Authentification requise.') => new AppError(401, 'UNAUTHORIZED', msg);
const forbidden = (msg = 'Accès refusé.') => new AppError(403, 'FORBIDDEN', msg);
const notFound = (msg = 'Ressource introuvable.') => new AppError(404, 'NOT_FOUND', msg);
const conflict = (msg, details, code = 'CONFLICT') => new AppError(409, code, msg, details);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict };
