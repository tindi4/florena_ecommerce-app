'use strict';
const config = require('../config/env');
const { formatMoney } = require('../utils/money');

/** Numéro au format international sans « + » (ex. 22890123456). Les numéros locaux reçoivent l'indicatif pays. */
function toInternational(phone) {
  const raw = String(phone).trim();
  let digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);
  digits = digits.replace(/^0+/, '');
  const cc = config.notify.countryCode;
  return digits.startsWith(cc) && digits.length > 8 ? digits : `${cc}${digits}`;
}

/** Message de confirmation proposé à l'administrateur (modifiable avant l'envoi). */
function defaultConfirmationMessage(order, shopName = config.shop.name) {
  const title = order.customer_gender === 'FEMME' ? 'Madame ' : order.customer_gender === 'HOMME' ? 'Monsieur ' : '';
  const hello = `Bonjour ${title}${order.customer_name || ''}`.trim();
  const total = formatMoney(order.total_amount, order.currency);
  const fee = order.delivery_fee_status === 'SET' ? ` (livraison incluse : ${formatMoney(order.delivery_fee, order.currency)})` : '';
  // Le code complet est placé après « # » : le navigateur ne l'envoie jamais au serveur (ni journaux, ni en-tête Referer).
  const target = order.tracking_code ? `/suivi#${order.tracking_code}` : `/suivi?n=${order.order_number}`;
  const link = config.notify.siteUrl ? ` Suivez-la ici : ${config.notify.siteUrl}${target}` : '';
  return `${hello}, votre commande ${order.order_number} chez ${shopName} est confirmée. Total à régler : ${total}${fee}.${link}`;
}

/** Lien prêt à ouvrir : l'administrateur envoie lui-même le message depuis WhatsApp ou son application SMS. */
function buildLink(channel, phone, message) {
  const number = toInternational(phone);
  const text = encodeURIComponent(message);
  return channel === 'WHATSAPP' ? `https://wa.me/${number}?text=${text}` : `sms:+${number}?&body=${text}`;
}

module.exports = { toInternational, defaultConfirmationMessage, buildLink };
