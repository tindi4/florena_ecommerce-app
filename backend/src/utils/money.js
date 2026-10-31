'use strict';
// Tous les calculs d'argent se font en centimes (entiers).
const toCents = (decimalString) => Math.round(Number(decimalString) * 100);
const fromCents = (cents) => (cents / 100).toFixed(2);
module.exports = { toCents, fromCents };
