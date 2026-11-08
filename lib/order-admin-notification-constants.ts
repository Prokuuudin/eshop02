// Dependency-free so that the scheduled outbox entry point can read them without loading Prisma.
export const ADMIN_ORDER_NOTIFICATION_TYPE = 'admin_order_created'
export const ADMIN_ORDER_NOTIFICATION_MAX_ATTEMPTS = 12
