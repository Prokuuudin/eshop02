import type { Order } from '@/lib/orders-store';
import type { OrderStatus } from '@/lib/admin-store';
import { formatEuro } from '@/lib/utils';

type OrderPrintOptions = {
    orders: Order[];
    locale: string;
    getOrderStatus: (orderId: string) => OrderStatus;
    statusLabels: Record<OrderStatus, string>;
    paymentLabels: Record<string, string>;
    title: string;
    totalLabel: string;
};

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    })[character]!);
}

function buildOrderCard(
    order: Order,
    options: Omit<OrderPrintOptions, 'orders' | 'title'>
): string {
    const status = options.getOrderStatus(order.id);
    const paymentStatus = order.paymentStatus ?? 'unpaid';
    const items = order.items
        .map(
            (item) => `<div style="display:flex;justify-content:space-between;font-size:12px;margin:3px 0">
          <span>${escapeHtml(item.title)}${item.variantLabel ? ` <span style="color:#6b7280">(${escapeHtml(item.variantLabel)})</span>` : ''} × ${item.quantity}</span>
          <span>${formatEuro(item.price * item.quantity, options.locale)}</span>
        </div>`
        )
        .join('');

    return `<div style="margin-bottom:20px;padding:16px;border:1px solid #e5e7eb;border-radius:8px;page-break-inside:avoid">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-family:monospace;font-size:11px;color:#6b7280">${escapeHtml(order.id)}</span>
          <div style="display:flex;gap:8px">
            <span style="font-size:12px;font-weight:600">${options.statusLabels[status]}</span>
            <span style="font-size:12px;color:#6b7280">${options.paymentLabels[paymentStatus]}</span>
          </div>
        </div>
        <p style="margin:2px 0;font-size:14px;font-weight:600">${escapeHtml(order.firstName)} ${escapeHtml(order.lastName)}</p>
        <p style="margin:2px 0;font-size:12px;color:#374151">${escapeHtml(order.email)} · ${escapeHtml(order.phone)}</p>
        <p style="margin:2px 0;font-size:12px;color:#374151">${escapeHtml(order.address)}, ${escapeHtml(order.city)}${
            order.postalCode ? ', ' + escapeHtml(order.postalCode) : ''
        }</p>
        <p style="margin:2px 0 8px;font-size:11px;color:#9ca3af">${new Date(order.createdAt).toLocaleDateString(options.locale)}</p>
        <hr style="margin:8px 0;border:none;border-top:1px solid #e5e7eb"/>
        ${items}
        <hr style="margin:8px 0;border:none;border-top:1px solid #e5e7eb"/>
        <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px">
          <span>${options.totalLabel}</span><span>${formatEuro(order.total, options.locale)}</span>
        </div>
      </div>`;
}

export function buildOrdersPrintHtml(options: OrderPrintOptions): string {
    const rows = options.orders.map((order) => buildOrderCard(order, options)).join('');
    return `<!DOCTYPE html><html><head><title>${escapeHtml(options.title)}</title>
      <style>body{font-family:sans-serif;padding:20px;max-width:760px;margin:0 auto}@media print{body{padding:0}}</style>
      </head><body>${rows}</body></html>`;
}
