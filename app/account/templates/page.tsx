'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft, BookmarkPlus, ShoppingCart, Pencil, Trash2,
    Package, Check, X, ChevronDown, ChevronUp, Info,
    ShoppingBag, ClipboardList,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { useOrderTemplatesStore, OrderTemplate } from '@/lib/order-templates-store';
import { useCart } from '@/lib/cart-store';
import { getCurrentUser } from '@/lib/auth';
import { useLocaleHelpers } from '@/hooks/useLocaleHelpers';
import { useToast } from '@/lib/toast-context';
import { formatEuro } from '@/lib/utils';

// ── Инструкция ──────────────────────────────────────────────────────────────

function HowItWorks({ t }: { t: (k: string) => string }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30 p-4">
            <button
                className="flex w-full items-center justify-between gap-2 text-left"
                onClick={() => setOpen((v) => !v)}
            >
                <div className="flex items-center gap-2 text-sm font-medium text-indigo-800 dark:text-indigo-200">
                    <Info className="w-4 h-4 shrink-0" />
                    {t('templates.howTitle')}
                </div>
                {open
                    ? <ChevronUp className="w-4 h-4 text-indigo-400 shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-indigo-400 shrink-0" />
                }
            </button>
            {open && (
                <ol className="mt-3 space-y-2 text-sm text-indigo-700 dark:text-primary list-none pl-0">
                    <li className="flex items-start gap-2">
                        <ShoppingBag className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>{t('templates.howStep1')}</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <ClipboardList className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>{t('templates.howStep2')}</span>
                    </li>
                    <li className="flex items-start gap-2">
                        <ShoppingCart className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>{t('templates.howStep3')}</span>
                    </li>
                </ol>
            )}
        </div>
    );
}

// ── Карточка шаблона ─────────────────────────────────────────────────────────

function TemplateCard({
    tpl, onRename, onDelete, onApply, t,
}: {
    tpl: OrderTemplate;
    onRename: (id: string, name: string) => void;
    onDelete: (id: string) => void;
    onApply: (tpl: OrderTemplate) => void;
    t: (key: string) => string;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(tpl.name);
    const [expanded, setExpanded] = useState(false);

    const total = tpl.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const date = new Date(tpl.createdAt).toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric',
    });

    const startEdit = () => { setDraft(tpl.name); setEditing(true); };
    const cancelEdit = () => { setDraft(tpl.name); setEditing(false); };
    const saveEdit = () => {
        const trimmed = draft.trim();
        if (trimmed && trimmed !== tpl.name) onRename(tpl.id, trimmed);
        setEditing(false);
    };

    const visibleItems = expanded ? tpl.items : tpl.items.slice(0, 3);
    const hasMore = tpl.items.length > 3;

    return (
        <TooltipProvider>
            <div className="template-card flex flex-col rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                {/* Шапка */}
                <div className="flex items-start gap-2 p-4 pb-3">
                    <div className="flex-1 min-w-0">
                        {editing ? (
                            <div className="flex items-center gap-1.5">
                                <Input
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveEdit();
                                        if (e.key === 'Escape') cancelEdit();
                                    }}
                                    className="h-8 text-sm"
                                    autoFocus
                                    maxLength={60}
                                />
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            onClick={saveEdit}
                                            disabled={!draft.trim()}
                                            className="p-1 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30 disabled:opacity-40 transition-colors"
                                        >
                                            <Check className="w-4 h-4" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent>{t('templates.saveName')}</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            onClick={cancelEdit}
                                            className="p-1 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent>{t('common.cancel')}</TooltipContent>
                                </Tooltip>
                            </div>
                        ) : (
                            <p
                                className="text-sm font-semibold text-foreground truncate cursor-pointer hover:text-primary dark:hover:text-indigo-400 transition-colors"
                                title={t('templates.clickToRename')}
                                onClick={startEdit}
                            >
                                {tpl.name}
                            </p>
                        )}
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{date}</p>
                    </div>

                    {!editing && (
                        <div className="flex items-center gap-0.5 shrink-0">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={startEdit}
                                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                    >
                                        <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent>{t('templates.rename')}</TooltipContent>
                            </Tooltip>

                            <ConfirmActionDialog
                                title={t('templates.confirmDeleteTitle')}
                                description={t('templates.confirmDeleteDesc')}
                                confirmLabel={t('common.delete')}
                                cancelLabel={t('common.cancel')}
                                onConfirm={() => onDelete(tpl.id)}
                                trigger={
                                    <button
                                        title={t('common.delete')}
                                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                }
                            />
                        </div>
                    )}
                </div>

                {/* Товары */}
                <div className="flex-1 border-t border-gray-100 dark:border-gray-800 px-4 pt-3 pb-2 space-y-1.5">
                    {visibleItems.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="text-gray-700 dark:text-gray-300 truncate">{item.title}</span>
                            <span className="shrink-0 text-gray-400 font-medium tabular-nums">× {item.quantity}</span>
                        </div>
                    ))}
                    {hasMore && (
                        <button
                            onClick={() => setExpanded((v) => !v)}
                            className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 dark:text-primary mt-1 transition-colors"
                        >
                            {expanded
                                ? <><ChevronUp className="w-3 h-3" />{t('templates.showLess')}</>
                                : <><ChevronDown className="w-3 h-3" />+{tpl.items.length - 3} {t('templates.moreItems')}</>
                            }
                        </button>
                    )}
                </div>

                {/* Подвал */}
                <div className="flex items-center justify-between gap-3 border-t border-gray-100 dark:border-gray-800 px-4 py-3 mt-auto">
                    <div>
                        <p className="text-[11px] text-gray-400 uppercase tracking-wide">{t('templates.total')}</p>
                        <p className="text-sm font-bold text-primary">
                            {formatEuro(total, 'en-US')}
                        </p>
                    </div>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                size="sm"
                                className="gap-1.5 bg-primary hover:bg-primary/90"
                                onClick={() => onApply(tpl)}
                            >
                                <ShoppingCart className="w-3.5 h-3.5" />
                                {t('templates.addToCart')}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">{t('templates.addToCartHint')}</TooltipContent>
                    </Tooltip>
                </div>
            </div>
        </TooltipProvider>
    );
}

// ── Страница ─────────────────────────────────────────────────────────────────

export default function AccountTemplatesPage() {
    const { t } = useLocaleHelpers();
    const router = useRouter();
    const { showToast } = useToast();
    const allTemplates = useOrderTemplatesStore((s) => s.templates);
    const { rename, delete: del } = useOrderTemplatesStore();
    const { addItem } = useCart();
    const [userId, setUserId] = useState<string | null>(null);

    useEffect(() => {
        const u = getCurrentUser();
        if (!u) { router.replace('/auth/login'); return; }
        setUserId(u.id);
    }, [router]);

    const templates = useMemo(
        () => (userId ? allTemplates.filter((tp) => tp.userId === userId) : []),
        [allTemplates, userId]
    );

    const handleApply = (tpl: OrderTemplate) => {
        tpl.items.forEach((item) => addItem(item, item.quantity));
        showToast(t('templates.cartMerged'), 'success');
    };

    if (!userId) return null;

    return (
        <main className="w-full max-w-3xl mx-auto px-4 py-10">
            {/* Шапка */}
            <div className="mb-6">
                <Link
                    href="/account"
                    className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors mb-4"
                >
                    <ArrowLeft className="w-4 h-4" />
                    {t('common.back')}
                </Link>
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-primary dark:bg-indigo-900/40 dark:text-primary">
                        <BookmarkPlus className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-foreground">
                            {t('templates.pageTitle')}
                        </h1>
                        {templates.length > 0 && (
                            <p className="text-sm text-muted-foreground">
                                {templates.length} {t('templates.count')}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Инструкция */}
            <div className="mb-6">
                <HowItWorks t={t} />
            </div>

            {/* Шаблоны */}
            {templates.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {templates.map((tpl) => (
                        <TemplateCard
                            key={tpl.id}
                            tpl={tpl}
                            t={t}
                            onRename={rename}
                            onDelete={del}
                            onApply={handleApply}
                        />
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center gap-5 py-16 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
                        <Package className="h-8 w-8 text-gray-400" />
                    </div>
                    <div className="max-w-sm">
                        <p className="text-base font-semibold text-gray-700 dark:text-gray-300">
                            {t('templates.emptyTitle')}
                        </p>
                        <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
                            {t('templates.emptyHint')}
                        </p>
                    </div>
                    <div className="flex flex-col gap-2 text-sm">
                        <Link href="/cart" className="inline-flex items-center gap-2 text-primary hover:text-indigo-700 dark:text-primary font-medium">
                            <ShoppingBag className="w-4 h-4" />
                            {t('templates.emptyCta1')}
                        </Link>
                        <Link href="/account#orders-history" className="inline-flex items-center gap-2 text-primary hover:text-indigo-700 dark:text-primary font-medium">
                            <ClipboardList className="w-4 h-4" />
                            {t('templates.emptyCta2')}
                        </Link>
                    </div>
                </div>
            )}
        </main>
    );
}
