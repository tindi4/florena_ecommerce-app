'use strict';
// Tous les calculs d'argent se font en centimes (entiers).
const toCents = (decimalString) => Math.round(Number(decimalString) * 100);
const fromCents = (cents) => (cents / 100).toFixed(2);
/** Montant lisible (sans caractères spéciaux : utilisable dans un PDF ou un message WhatsApp). */
function formatMoney(amount, currency) {
  const n = Number(amount);
  if (currency === 'XOF' || currency === 'XAF') return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`;
  return `${n.toFixed(2)} ${currency}`;
}
module.exports = { toCents, fromCents, formatMoney };
