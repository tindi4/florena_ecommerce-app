import { Routes } from '@angular/router';
import { adminGuard, loginGuard, permissionGuard } from './core/admin.guard';
import { customerGuard } from './core/customer-auth.service';

export const routes: Routes = [
  {
    path: 'admin/login',
    title: 'Connexion administrateur',
    canActivate: [loginGuard],
    loadComponent: () => import('./pages/admin/admin-login').then((m) => m.AdminLogin),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    canActivateChild: [adminGuard],
    loadComponent: () => import('./pages/admin/admin-shell').then((m) => m.AdminShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', canActivate: [permissionGuard], data: { perm: 'orders.view' }, title: 'Tableau de bord', loadComponent: () => import('./pages/admin/admin-dashboard').then((m) => m.AdminDashboard) },
      { path: 'commandes', canActivate: [permissionGuard], data: { perm: 'orders.view' }, title: 'Commandes', loadComponent: () => import('./pages/admin/admin-orders').then((m) => m.AdminOrders) },
      { path: 'commandes/:id', canActivate: [permissionGuard], data: { perm: 'orders.view' }, title: 'Détail de la commande', loadComponent: () => import('./pages/admin/admin-order-detail').then((m) => m.AdminOrderDetail) },
      { path: 'notifications', canActivate: [permissionGuard], data: { perm: ['orders.view', 'messages'] }, title: 'Notifications', loadComponent: () => import('./pages/admin/admin-notifications').then((m) => m.AdminNotifications) },
      { path: 'messages', canActivate: [permissionGuard], data: { perm: 'messages' }, title: 'Messages', loadComponent: () => import('./pages/admin/admin-messages').then((m) => m.AdminMessages) },
      { path: 'produits', canActivate: [permissionGuard], data: { perm: 'products' }, title: 'Articles', loadComponent: () => import('./pages/admin/admin-products').then((m) => m.AdminProducts) },
      { path: 'produits/nouveau', canActivate: [permissionGuard], data: { perm: 'products' }, title: 'Nouvel article', loadComponent: () => import('./pages/admin/admin-product-form').then((m) => m.AdminProductForm) },
      { path: 'produits/:id', canActivate: [permissionGuard], data: { perm: 'products' }, title: "Modifier l'article", loadComponent: () => import('./pages/admin/admin-product-form').then((m) => m.AdminProductForm) },
      { path: 'categories', canActivate: [permissionGuard], data: { perm: 'products' }, title: 'Catégories de produits', loadComponent: () => import('./pages/admin/admin-categories').then((m) => m.AdminCategories) },
      { path: 'stock', canActivate: [permissionGuard], data: { perm: 'stock' }, title: 'Stock', loadComponent: () => import('./pages/admin/admin-stock').then((m) => m.AdminStock) },
      { path: 'statistiques', canActivate: [permissionGuard], data: { perm: 'stats' }, title: 'Statistiques', loadComponent: () => import('./pages/admin/admin-stats').then((m) => m.AdminStats) },
      { path: 'reglages', canActivate: [permissionGuard], data: { perm: 'settings' }, title: 'Réglages', loadComponent: () => import('./pages/admin/admin-settings').then((m) => m.AdminSettings) },
      { path: 'equipe', canActivate: [permissionGuard], data: { perm: 'team' }, title: 'Équipe', loadComponent: () => import('./pages/admin/admin-team').then((m) => m.AdminTeam) },
      { path: 'aucun-acces', title: 'Aucun accès', loadComponent: () => import('./pages/admin/admin-no-access').then((m) => m.AdminNoAccess) },
      // Toute adresse /admin/... inconnue : retour au tableau de bord (ou à /admin/login si non connecté).
      { path: '**', redirectTo: 'dashboard' },
    ],
  },
  {
    path: '',
    loadComponent: () => import('./pages/public/public-shell').then((m) => m.PublicShell),
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/public/home').then((m) => m.Home) },
      { path: 'catalogue', title: 'Articles', loadComponent: () => import('./pages/public/catalog').then((m) => m.Catalog) },
      { path: 'produit/:slug', loadComponent: () => import('./pages/public/product-detail').then((m) => m.ProductDetailPage) },
      { path: 'panier', title: 'Mon panier', loadComponent: () => import('./pages/public/cart').then((m) => m.CartPage) },
      { path: 'commande', title: 'Passer la commande', loadComponent: () => import('./pages/public/checkout').then((m) => m.Checkout) },
      { path: 'confirmation/:number', title: 'Commande enregistrée', loadComponent: () => import('./pages/public/confirmation').then((m) => m.Confirmation) },
      { path: 'suivi', title: 'Suivre ma commande', loadComponent: () => import('./pages/public/track').then((m) => m.Track) },
      { path: 'connexion', title: 'Mon compte : connexion', loadComponent: () => import('./pages/public/customer-login').then((m) => m.CustomerLogin) },
      { path: 'mon-compte', title: 'Mon compte', canActivate: [customerGuard], loadComponent: () => import('./pages/public/account').then((m) => m.Account) },
      { path: 'contact', title: 'Nous écrire', loadComponent: () => import('./pages/public/contact').then((m) => m.Contact) },
      { path: '**', title: 'Page introuvable', loadComponent: () => import('./pages/public/not-found').then((m) => m.NotFound) },
    ],
  },
];
