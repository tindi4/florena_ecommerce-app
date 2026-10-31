export type OrderStatus = 'EN_ATTENTE' | 'CONFIRMEE' | 'EN_PREPARATION' | 'TERMINEE' | 'ANNULEE';
export type PaymentStatus = 'NON_PAYE' | 'PAYE';
export type Attributes = Record<string, string>;

export interface Paged<T> { items: T[]; page: number; limit: number; total: number; totalPages: number; }
export interface Category { id: number; name: string; slug: string; description?: string; productCount: number; }
export interface ProductCard {
  id: number; name: string; slug: string; shortDescription: string; category: { name: string; slug: string } | null;
  priceMin: number; priceMax: number; inStock: boolean; imageUrl: string | null;
}
export interface Variant { id: number; sku: string | null; attributes: Attributes; price: number; stock: number; }
export interface ProductDetail {
  id: number; name: string; slug: string; description: string | null; category: { name: string; slug: string } | null;
  images: { id: number; url: string; alt: string }[]; variants: Variant[];
}
export interface CartLine {
  variantId: number; slug: string; name: string; imageUrl: string | null; attributes: Attributes; price: number; quantity: number;
}
export interface CartCheckItem {
  variantId: number; available: boolean; reason?: string | null; price?: number; stock?: number; productName?: string;
  imageUrl?: string | null; attributes?: Attributes; slug?: string;
}
export interface OrderItem { id: number; name: string; sku: string | null; attributes: Attributes; imageUrl: string | null; quantity: number; unitPrice: number; lineTotal: number; }
export interface TrackedOrder {
  orderNumber: string; status: OrderStatus; paymentStatus: PaymentStatus; paidAt: string | null; createdAt: string; total: number; currency: string;
  customerName: string; deliveryAddress: string; city: string | null; items: OrderItem[];
  timeline: { type: 'STATUS' | 'PAYMENT'; value: string; at: string }[];
}
export interface AdminOrderRow {
  id: number; orderNumber: string; customerName: string; customerPhone: string; status: OrderStatus; paymentStatus: PaymentStatus;
  total: number; currency: string; createdAt: string; itemCount: number; isNew: boolean;
}
export interface AdminOrder {
  id: number; orderNumber: string; status: OrderStatus; paymentStatus: PaymentStatus; paidAt: string | null; paidBy: string | null; paymentNote: string | null;
  customerName: string; customerPhone: string; deliveryAddress: string; city: string | null; comment: string | null; currency: string; total: number;
  createdAt: string; allowedStatuses: OrderStatus[]; items: OrderItem[];
  history: { id: number; type: 'STATUS' | 'PAYMENT'; from: string | null; to: string; comment: string | null; admin: string | null; at: string }[];
}
export interface Counters { unreadNotifications: number; newMessages: number; todoOrders: number; unpaidOrders: number; }
export interface AdminNotification { id: number; type: 'NEW_ORDER' | 'NEW_MESSAGE'; title: string; body: string | null; orderId: number | null; messageId: number | null; isRead: boolean; createdAt: string; }
export interface CustomerMessage { id: number; name: string; phone: string | null; email: string | null; orderNumber: string | null; message: string; status: 'NOUVEAU' | 'TRAITE'; handledBy: string | null; createdAt: string; }
export interface AdminVariant { id?: number; sku: string | null; attributes: Attributes; price: number; stockQuantity: number; isActive: boolean; }
export interface AdminProduct {
  id: number; name: string; slug: string; description: string | null; categoryId: number | null; isActive: boolean;
  images: { id: number; url: string; alt: string | null; position: number }[]; variants: AdminVariant[];
}
export interface AdminProductRow { id: number; name: string; slug: string; isActive: boolean; category: string | null; imageUrl: string | null; variantCount: number; totalStock: number; priceMin: number | null; }
export interface AdminCategory { id: number; name: string; slug: string; description: string | null; isActive: boolean; productCount: number; }
export interface StockRow { variantId: number; productId: number; productName: string; sku: string | null; attributes: Attributes; stock: number; isActive: boolean; }

export const STATUS_LABELS: Record<OrderStatus, string> = {
  EN_ATTENTE: 'En attente', CONFIRMEE: 'Confirmée', EN_PREPARATION: 'En préparation', TERMINEE: 'Terminée', ANNULEE: 'Annulée',
};
export const STATUS_ACTIONS: Record<OrderStatus, string> = {
  EN_ATTENTE: 'En attente', CONFIRMEE: 'Confirmer', EN_PREPARATION: 'Mettre en préparation', TERMINEE: 'Marquer terminée', ANNULEE: 'Annuler',
};
