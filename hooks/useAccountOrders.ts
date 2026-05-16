import { useMemo } from 'react';
import { useState } from 'react';

export function useAccountOrders(userOrders: any[], getOrderStatus: (id: string) => string, orderFilter: 'all' | 'active' | 'completed') {
    const activeOrdersCount = useMemo(() => userOrders.filter((order) => {
        const status = getOrderStatus(order.id);
        return status !== 'delivered' && status !== 'cancelled';
    }).length, [userOrders, getOrderStatus]);

    const completedOrdersCount = userOrders.length - activeOrdersCount;

    const filteredOrders = useMemo(() => userOrders.filter((order) => {
        const status = getOrderStatus(order.id);
        if (orderFilter === 'active') return status !== 'delivered' && status !== 'cancelled';
        if (orderFilter === 'completed') return status === 'delivered' || status === 'cancelled';
        return true;
    }), [userOrders, getOrderStatus, orderFilter]);

    const getOrderFilterButtonClasses = (filter: 'all' | 'active' | 'completed'): string => {
        const baseClass = 'flex-1 rounded-xl px-3 py-2 text-sm transition md:flex-none';
        if (orderFilter !== filter) {
            return `${baseClass} text-gray-600 dark:text-gray-300`;
        }
        if (filter === 'active') {
            return `${baseClass} bg-amber-50 text-amber-700 shadow-sm ring-1 ring-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:ring-amber-800`;
        }
        if (filter === 'completed') {
            return `${baseClass} bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:ring-emerald-800`;
        }
        return `${baseClass} bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100`;
    };

    const getStatusLabel = (status: string, t?: (key: string) => string): string => {
        if (!t) return status;
        if (status === 'confirmed') return t('order.status.confirmed');
        if (status === 'shipped') return t('order.status.shipped');
        if (status === 'delivered') return t('order.status.delivered');
        if (status === 'cancelled') return t('order.status.cancelled');
        return t('order.status.pending');
    };

    const getStatusClasses = (status: string): string => {
        if (status === 'confirmed')
            return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200';
        if (status === 'shipped')
            return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200';
        if (status === 'delivered')
            return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200';
        if (status === 'cancelled')
            return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200';
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-200';
    };

    const handleRepeatOrder = (orderId: string, userOrders: any[], replaceWithItems: (items: any[]) => void, router: any) => {
        const order = userOrders.find((item) => item.id === orderId);
        if (!order) return;
        replaceWithItems(order.items);
        router.push('/cart');
    };

    const getDeliveryLabel = (deliveryMethod: string, t?: (key: string) => string): string => {
        if (!t) return deliveryMethod;
        if (deliveryMethod === 'courier') return t('account.deliveryCourier');
        if (deliveryMethod === 'pickup') return t('account.deliveryPickup');
        return t('account.deliveryPost');
    };

    return {
        activeOrdersCount,
        completedOrdersCount,
        filteredOrders,
        getOrderFilterButtonClasses,
        getStatusLabel,
        getStatusClasses,
        handleRepeatOrder,
        getDeliveryLabel,
    };
}
