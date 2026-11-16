'use strict';
const nodemailer = require('nodemailer');
const config = require('../config/env');
const logger = require('./logger');

/*
 * Envoi d'e-mails (réinitialisation de mot de passe).
 * Tant que SMTP_HOST n'est pas renseigné dans .env, aucun e-mail ne part : la demande est seulement journalisée.
 */
const transport = config.mail.host
  ? nodemailer.createTransport({
    host: config.mail.host, port: config.mail.port, secure: config.mail.secure,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
  })
  : null;

const isConfigured = () => !!transport;

/** Renvoie true si l'e-mail est parti, false sinon (SMTP absent ou erreur d'envoi : jamais d'exception vers l'appelant). */
async function send({ to, subject, text, html }) {
  if (!transport) { logger.warn('E-mail non envoyé : SMTP non configuré (voir .env.example)', { subject }); return false; }
  try {
    await transport.sendMail({ from: config.mail.from, to, subject, text, html });
    return true;
  } catch (err) {
    logger.error('Envoi d\'e-mail impossible', { subject, error: err.message });
    return false;
  }
}

module.exports = { send, isConfigured };
