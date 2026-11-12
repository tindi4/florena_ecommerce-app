'use strict';
const { z } = require('zod');

const trimmed = (min, max, label) =>
  z.string({ error: (i) => (i.input === undefined ? `${label} requis` : `${label} invalide`) }).trim().min(min, `${label} trop court`).max(max, `${label} trop long`);
const optionalText = (max) =>
  z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().trim().max(max).optional());
const id = z.coerce.number().int().positive();
const phone = z.string().trim().max(25).regex(/^[+0-9 ().-]+$/, 'Numéro de téléphone invalide')
  .refine((v) => v.replace(/\D/g, '').length >= 6, 'Numéro de téléphone trop court');

const blank = (v) => (v === '' || v == null ? undefined : v);
const coord = (min, max) => z.preprocess(blank, z.coerce.number().min(min).max(max).optional());

const ORDER_STATUSES = ['EN_ATTENTE', 'CONFIRMEE', 'EN_PREPARATION', 'TERMINEE', 'ANNULEE'];

const login = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Adresse e-mail invalide').max(190)),
  password: z.string().min(1, 'Mot de passe requis').max(200),
});

const boolFlag = z.preprocess((v) => v === true || v === 'true' || v === 1, z.boolean());

const createOrder = z.object({
  customerName: trimmed(2, 120, 'Nom'),                       // nom obligatoire
  customerGender: z.preprocess(blank, z.enum(['HOMME', 'FEMME']).optional()),   // Monsieur / Madame : facultatif, vide par défaut
  customerPhone: phone,                                       // téléphone obligatoire
  // Adresse ou quartier (un seul champ). Obligatoire seulement si le client demande la livraison.
  deliveryAddress: z.preprocess(blank, z.string().trim().max(500).optional()),
  comment: optionalText(1000),                                // « Laissez un message » (facultatif)
  deliveryRequested: boolFlag.default(false),                 // case « Me faire livrer »
  deliveryFeeAccepted: boolFlag.default(false),               // case « Ajouter les frais de livraison »
  latitude: coord(-90, 90),
  longitude: coord(-180, 180),
  locationLabel: optionalText(255),
  items: z.array(z.object({
    variantId: id,
    quantity: z.coerce.number().int().min(1, 'Quantité minimale : 1').max(99, 'Quantité maximale : 99'),
    expectedPrice: z.coerce.number().nonnegative().optional(),
  })).min(1, 'Le panier est vide').max(50),
}).refine((v) => !v.deliveryRequested || (v.deliveryAddress && v.deliveryAddress.length >= 5), { message: 'Indiquez votre adresse ou quartier pour la livraison', path: ['deliveryAddress'] })
  .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), { message: 'Position incomplète', path: ['latitude'] });

/*
 * Accès à une commande sans compte : code complet SEUL, ou numéro de commande + téléphone.
 * Si le client colle le code complet dans le champ « numéro », on le reconnaît.
 * Le téléphone seul est refusé ici (400), avant même toute recherche en base.
 */
const FULL_CODE = /^CMD-[A-Z2-9]{10}-[A-Z2-9]{20}$/;
const upper = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim().toUpperCase() : undefined);
const accessFields = {
  code: z.preprocess(upper, z.string().max(40).optional()),
  orderNumber: z.preprocess(upper, z.string().max(40).optional()),
  phone: z.preprocess(blank, phone.optional()),
};
const ACCESS_MESSAGE = 'Saisissez le code complet de la commande, ou le numéro de commande avec le téléphone utilisé.';
const normalizeAccess = (v) => {
  const code = v.code || (v.orderNumber && FULL_CODE.test(v.orderNumber) ? v.orderNumber : undefined);
  return code ? { code } : { orderNumber: v.orderNumber, phone: v.phone };
};
const accessOk = (v) => !!(v.code || (v.orderNumber && FULL_CODE.test(v.orderNumber)) || (v.orderNumber && v.phone));
const trackOrder = z.object(accessFields).refine(accessOk, { message: ACCESS_MESSAGE, path: ['orderNumber'] }).transform(normalizeAccess);

// Modification d'une commande par le client (tant qu'elle n'est pas en préparation).
const customerEdit = z.object({
  ...accessFields,
  changes: z.object({
    customerName: z.string().trim().min(2, 'Nom trop court').max(120).optional(),
    customerGender: z.preprocess((v) => (v === '' ? null : v), z.enum(['HOMME', 'FEMME']).nullable().optional()),
    deliveryAddress: z.string().trim().max(500).optional(),
    comment: z.string().trim().max(1000).optional(),
    deliveryRequested: z.boolean().optional(),
    deliveryFeeAccepted: z.boolean().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    locationLabel: z.string().trim().max(255).nullable().optional(),
  }),
}).refine(accessOk, { message: ACCESS_MESSAGE, path: ['orderNumber'] })
  .transform((v) => ({ access: normalizeAccess(v), changes: v.changes }));

// Modification d'une commande par la boutique : plein pouvoir (coordonnées, téléphone, livraison, articles).
const adminOrderEdit = z.object({
  details: z.object({
    customerName: z.string().trim().min(2, 'Nom trop court').max(120).optional(),
    customerGender: z.preprocess((v) => (v === '' ? null : v), z.enum(['HOMME', 'FEMME']).nullable().optional()),
    customerPhone: phone.optional(),
    deliveryAddress: z.string().trim().max(500).optional(),
    comment: z.string().trim().max(1000).optional(),
    deliveryRequested: z.boolean().optional(),
    deliveryFeeAccepted: z.boolean().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    locationLabel: z.string().trim().max(255).nullable().optional(),
  }).optional(),
  // Liste COMPLÈTE des lignes souhaitées : lineId = ligne existante, variantId = nouvel article.
  items: z.array(z.object({
    lineId: id.optional(),
    variantId: id.optional(),
    quantity: z.coerce.number().int().min(1, 'Quantité minimale : 1').max(999),
    unitPrice: z.coerce.number().min(0).max(99999999).optional(),
  }).refine((l) => l.lineId || l.variantId, { message: 'Ligne sans article' })).min(1, 'Une commande doit contenir au moins un article').max(50).optional(),
}).refine((v) => v.details || v.items, { message: 'Rien à modifier' });

const cartCheck = z.object({
  items: z.array(z.object({ variantId: id, quantity: z.coerce.number().int().min(1).max(99) })).min(1).max(50),
});


const contactMessage = z.object({
  name: trimmed(2, 120, 'Nom'),
  phone: z.preprocess((v) => (v === '' || v == null ? undefined : v), phone.optional()),
  email: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().trim().pipe(z.email('E-mail invalide').max(190)).optional()),
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

const notifyCustomer = z.object({
  channel: z.enum(['WHATSAPP', 'SMS']),
  message: z.string().trim().min(5).max(1000).optional(),
});
const deliveryFeeUpdate = z.object({ fee: z.coerce.number().int().min(0).max(10000000) });
const statsQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  all: z.enum(['1']).optional(),   // toute la période, depuis la première commande
});
// Rôle d'un compte : roleId (rôle en base) ou code d'un modèle (MANAGER, ORDER_CLERK, CATALOG_CLERK).
const roleRef = {
  roleId: id.optional(),
  role: z.enum(['MANAGER', 'ORDER_CLERK', 'CATALOG_CLERK'], { error: 'Rôle invalide' }).optional(),
};
const staffUser = z.object({
  name: trimmed(2, 120, 'Nom'),
  email: z.string().trim().toLowerCase().pipe(z.email('Adresse e-mail invalide').max(190)),
  password: z.string().min(12, 'Mot de passe : 12 caractères minimum').max(200),
  ...roleRef,
}).refine((v) => v.roleId || v.role, { message: 'Choisissez un rôle', path: ['roleId'] });
const staffUserUpdate = z.object({
  name: trimmed(2, 120, 'Nom').optional(),
  ...roleRef,
  isActive: z.boolean().optional(),
});
const { ALL_PERMISSIONS } = require('../config/permissions');
const roleInput = z.object({
  name: trimmed(2, 80, 'Nom du rôle'),
  description: optionalText(255),
  permissions: z.array(z.enum(ALL_PERMISSIONS, { error: 'Permission inconnue' })).max(50).default([]),
});
const roleUpdate = z.object({
  name: trimmed(2, 80, 'Nom du rôle').optional(),
  description: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(255).nullable().optional()),
  permissions: z.array(z.enum(ALL_PERMISSIONS, { error: 'Permission inconnue' })).max(50).optional(),
});
const passwordReset = z.object({ password: z.string().min(12, 'Mot de passe : 12 caractères minimum').max(200) });

const messageStatus = z.object({ status: z.enum(['NOUVEAU', 'TRAITE']) });

/* ----- Comptes clients ----- */
// Nom d'utilisateur : lettres minuscules, chiffres, « . _ - », au moins une lettre (sinon on le confondrait avec un téléphone).
const username = z.string().trim().toLowerCase()
  .min(3, "Nom d'utilisateur : 3 caractères minimum").max(30, "Nom d'utilisateur : 30 caractères maximum")
  .regex(/^[a-z0-9._-]+$/, "Nom d'utilisateur : lettres, chiffres, point, tiret ou tiret bas uniquement")
  .refine((v) => /[a-z]/.test(v), "Le nom d'utilisateur doit contenir au moins une lettre");
const customerPassword = z.string().min(8, 'Mot de passe : 8 caractères minimum').max(200, 'Mot de passe trop long');
const customerRegister = z.object({
  phone,
  username: z.preprocess(blank, username.optional()),
  name: z.preprocess(blank, trimmed(2, 120, 'Nom').optional()),
  password: customerPassword,
});
const customerLogin = z.object({
  identifier: trimmed(3, 60, 'Téléphone ou nom d\'utilisateur'),
  password: z.string().min(1, 'Mot de passe requis').max(200),
});
const customerProfile = z.object({
  username: z.preprocess((v) => (v === '' ? null : v), username.nullable().optional()),
  name: z.preprocess((v) => (v === '' ? null : v), trimmed(2, 120, 'Nom').nullable().optional()),
}).refine((v) => v.username !== undefined || v.name !== undefined, { message: 'Rien à modifier' });
const customerPasswordChange = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis').max(200),
  newPassword: customerPassword,
});
const customerPreferences = z.object({ theme: z.enum(['light', 'dark'], { error: 'Thème invalide' }) });
// Rattacher des commandes passées en invité : code complet ou numéro (le téléphone du compte doit correspondre).
const claimOrders = z.object({
  orders: z.array(z.preprocess(upper, z.string().max(40))).min(1, 'Indiquez au moins une commande').max(30),
});

const shopSettings = z.object({
  shopName: trimmed(2, 80, 'Nom de la boutique').optional(),
  primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur invalide : format attendu #RRGGBB (ex. #0d4f4c)').optional(),
}).refine((v) => v.shopName !== undefined || v.primaryColor !== undefined, { message: 'Rien à modifier' });

module.exports = {
  ORDER_STATUSES, login, createOrder, customerEdit, adminOrderEdit, cartCheck, trackOrder, contactMessage, orderStatus, orderPayment,
  product, category, activeFlag, stockAdjust, messageStatus, id, notifyCustomer, deliveryFeeUpdate, statsQuery,
  staffUser, staffUserUpdate, passwordReset, shopSettings, roleInput, roleUpdate,
  customerRegister, customerLogin, customerProfile, customerPasswordChange, customerPreferences, claimOrders, FULL_CODE,
};
