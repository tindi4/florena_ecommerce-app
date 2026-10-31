import { Routes } from '@angular/router';
import { adminGuard } from './core/admin.guard';

export const routes: Routes = [
  {
    path: 'admin/login',
    title: 'Connexion administrateur',
    loadComponent: () => import('./pages/admin/admin-login').then((m) => m.AdminLogin),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/admin/admin-shell').then((m) => m.AdminShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', title: 'Tableau de bord', loadComponent: () => import('./pages/admin/admin-dashboard').then((m) => m.AdminDashboard) },
      { path: 'commandes', title: 'Commandes', loadComponent: () => import('./pages/admin/admin-orders').then((m) => m.AdminOrders) },
      { path: 'commandes/:id', title: 'Détail de la commande', loadComponent: () => import('./pages/admin/admin-order-detail').then((m) => m.AdminOrderDetail) },
      { path: 'notifications', title: 'Notifications', loadComponent: () => import('./pages/admin/admin-notifications').then((m) => m.AdminNotifications) },
      { path: 'messages', title: 'Messages', loadComponent: () => import('./pages/admin/admin-messages').then((m) => m.AdminMessages) },
      { path: 'produits', title: 'Produits', loadComponent: () => import('./pages/admin/admin-products').then((m) => m.AdminProducts) },
      { path: 'produits/nouveau', title: 'Nouveau produit', loadComponent: () => import('./pages/admin/admin-product-form').then((m) => m.AdminProductForm) },
      { path: 'produits/:id', title: 'Modifier le produit', loadComponent: () => import('./pages/admin/admin-product-form').then((m) => m.AdminProductForm) },
      { path: 'categories', title: 'Catégories', loadComponent: () => import('./pages/admin/admin-categories').then((m) => m.AdminCategories) },
      { path: 'stock', title: 'Stock', loadComponent: () => import('./pages/admin/admin-stock').then((m) => m.AdminStock) },
    ],
  },
  {
    path: '',
    loadComponent: () => import('./pages/public/public-shell').then((m) => m.PublicShell),
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/public/home').then((m) => m.Home) },
      { path: 'catalogue', title: 'Catalogue', loadComponent: () => import('./pages/public/catalog').then((m) => m.Catalog) },
      { path: 'produit/:slug', loadComponent: () => import('./pages/public/product-detail').then((m) => m.ProductDetailPage) },
      { path: 'panier', title: 'Mon panier', loadComponent: () => import('./pages/public/cart').then((m) => m.CartPage) },
      { path: 'commande', title: 'Passer la commande', loadComponent: () => import('./pages/public/checkout').then((m) => m.Checkout) },
      { path: 'confirmation/:number', title: 'Commande enregistrée', loadComponent: () => import('./pages/public/confirmation').then((m) => m.Confirmation) },
      { path: 'suivi', title: 'Suivre ma commande', loadComponent: () => import('./pages/public/track').then((m) => m.Track) },
      { path: 'contact', title: 'Nous écrire', loadComponent: () => import('./pages/public/contact').then((m) => m.Contact) },
      { path: '**', title: 'Page introuvable', loadComponent: () => import('./pages/public/not-found').then((m) => m.NotFound) },
    ],
  },
];
