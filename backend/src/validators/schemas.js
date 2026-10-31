'use strict';
const { z } = require('zod');

const trimmed = (min, max, label) =>
  z.string({ required_error: `${label} requis` }).trim().min(min, `${label} trop court`).max(max, `${label} trop long`);
const optionalText = (max) =>
  z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().trim().max(max).optional());
const id = z.coerce.number().int().positive();
const phone = z.string().trim().max(25).regex(/^[+0-9 ().-]+$/, 'Numéro de téléphone invalide')
  .refine((v) => v.replace(/\D/g, '').length >= 6, 'Numéro de téléphone trop court');

const ORDER_STATUSES = ['EN_ATTENTE', 'CONFIRMEE', 'EN_PREPARATION', 'TERMINEE', 'ANNULEE'];

const login = z.object({
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide').max(190),
  password: z.string().min(1, 'Mot de passe requis').max(200),
});

const createOrder = z.object({
  customerName: trimmed(2, 120, 'Nom'),
  customerPhone: phone,
  deliveryAddress: trimmed(5, 500, 'Adresse'),
  city: optionalText(120),
  comment: optionalText(1000),
  items: z.array(z.object({
    variantId: id,
    quantity: z.coerce.number().int().min(1, 'Quantité minimale : 1').max(99, 'Quantité maximale : 99'),
    expectedPrice: z.coerce.number().nonnegative().optional(),
  })).min(1, 'Le panier est vide').max(50),
});

const cartCheck = z.object({
  items: z.array(z.object({ variantId: id, quantity: z.coerce.number().int().min(1).max(99) })).min(1).max(50),
});

const trackOrder = z.object({
  orderNumber: z.string().trim().toUpperCase().max(24),
  phone,
});

const contactMessage = z.object({
  name: trimmed(2, 120, 'Nom'),
  phone: z.preprocess((v) => (v === '' || v == null ? undefined : v), phone.optional()),
  email: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().trim().email('E-mail invalide').max(190).optional()),
  orderNumber: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().trim().toUpperCase().max(24).optional()),
  message: trimmed(5, 2000, 'Message'),
}).refine((v) => v.phone || v.email, { message: 'Indiquez un téléphone ou un e-mail pour que nous puissions vous répondre', path: ['phone'] });

const orderStatus = z.object({
  status: z.enum(ORDER_STATUSES),
  comment: optionalText(255),
});

const orderPayment = z.object({
  paid: z.boolean(),
  note: optionalText(255),
});

const variantInput = z.object({
  id: id.optional(),
  sku: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().trim().max(80).optional()),
  attributes: z.record(z.string().trim().min(1).max(40), z.string().trim().min(1).max(60)).refine((o) => Object.keys(o).length <= 6, 'Six options maximum'),
  price: z.coerce.number().min(0, 'Prix invalide').max(99999999),
  stockQuantity: z.coerce.number().int().min(0, 'Stock invalide').max(1000000),
  isActive: z.boolean().default(true),
});

const product = z.object({
  name: trimmed(2, 200, 'Nom du produit'),
  categoryId: z.preprocess((v) => (v === '' || v === 0 ? null : v), id.nullable().optional()),
  description: optionalText(5000),
  isActive: z.boolean().default(true),
  variants: z.array(variantInput).min(1, 'Ajoutez au moins une variante').max(300),
});

const category = z.object({
  name: trimmed(2, 120, 'Nom de la catégorie'),
  description: optionalText(1000),
  isActive: z.boolean().default(true),
});

const activeFlag = z.object({ isActive: z.boolean() });

const stockAdjust = z.object({
  quantity: z.coerce.number().int().min(0, 'Le stock ne peut pas être négatif').max(1000000),
  reason: trimmed(3, 255, 'Motif'),
});

const messageStatus = z.object({ status: z.enum(['NOUVEAU', 'TRAITE']) });

module.exports = {
  ORDER_STATUSES, login, createOrder, cartCheck, trackOrder, contactMessage, orderStatus, orderPayment,
  product, category, activeFlag, stockAdjust, messageStatus, id,
};
