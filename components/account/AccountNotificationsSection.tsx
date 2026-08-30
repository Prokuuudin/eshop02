'use client';
import React from 'react';
import {
    Bell,
    BellOff,
    CheckCheck,
    Trash2,
    X,
    Monitor,
    Mail,
    Layers,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { useTranslation } from '@/lib/use-translation';
import {
    useNotificationsStore,
    type NotificationChannel,
} from '@/lib/notifications-store';
import { Button } from '@/components/ui/button';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import NotificationItem from './NotificationItem';

// ── Main section ───────────────────────────────────────────────────────────────

export default function AccountNotificationsSection(): React.ReactElement {
    const { t, language } = useTranslation();
    const {
        notifications,
        isSubscribed,
        channel,
        setChannel,
        subscribe,
        unsubscribe,
        markRead,
        markAllRead,
        deleteNotification,
        deleteSelected,
        addNotification,
        fetchInbox,
        unreadCount,
    } = useNotificationsStore();

    const [isExpanded, setIsExpanded] = React.useState(false);
    const [selectedIds, setSelectedIds] = React.useState<string[]>([]);

    const CHANNELS: { value: NotificationChannel; labelKey: string; icon: React.ElementType }[] = [
        { value: 'app',   labelKey: 'notifications.channelApp',   icon: Monitor },
        { value: 'email', labelKey: 'notifications.channelEmail', icon: Mail },
        { value: 'both',  labelKey: 'notifications.channelBoth',  icon: Layers },
    ];

    const unread = unreadCount();
    const hasNotifications = notifications.length > 0;
    const allSelected = hasNotifications && selectedIds.length === notifications.length;
    const someSelected = selectedIds.length > 0 && !allSelected;

    const toggleSelect = (id: string) =>
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );

    const toggleSelectAll = () =>
        setSelectedIds(allSelected ? [] : notifications.map((n) => n.id));

    const clearSelection = () => setSelectedIds([]);

    const handleDeleteSelected = () => {
        deleteSelected(selectedIds);
        clearSelection();
    };

    // Clear stale selections when notifications change
    React.useEffect(() => {
        const ids = new Set(notifications.map((n) => n.id));
        let cancelled = false;
        queueMicrotask(() => {
            if (!cancelled) {
                setSelectedIds((prev) => prev.filter((id) => ids.has(id)));
            }
        });
        return () => {
            cancelled = true;
        };
    }, [notifications]);

    React.useEffect(() => {
        fetchInbox()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleSubscribe = () => {
        subscribe();
        addNotification({ type: 'info',  title: t('notifications.demo3Title'), message: t('notifications.demo3Message') });
        addNotification({ type: 'promo', title: t('notifications.demo2Title'), message: t('notifications.demo2Message') });
        addNotification({ type: 'info',  title: t('notifications.demoTitle'),  message: t('notifications.demoMessage') });
    };

    return (
        <TooltipProvider delayDuration={200}>
        <section className="notifications rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">

            {/* Header — всегда видим */}
            <div
                role="button"
                tabIndex={0}
                onClick={() => setIsExpanded((v) => !v)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setIsExpanded((v) => !v)}
                aria-expanded={isExpanded}
                className={`notifications__header flex items-center justify-between gap-3 px-5 py-4 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors ${isExpanded ? 'border-b border-border' : ''}`}
            >
                {/* Левая часть: иконка + заголовок + счётчики */}
                <div className="flex items-center gap-2 min-w-0">
                    <Bell className="h-5 w-5 text-primary shrink-0" />
                    <h2 className="notifications__title text-base font-semibold text-foreground truncate">
                        {t('notifications.sectionTitle')}
                    </h2>
                    {unread > 0 && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="notifications__badge-unread inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary dark:bg-primary/40 dark:text-primary cursor-default shrink-0">
                                    {unread}
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>
                                {t('notifications.tooltip.unread', undefined, { count: unread })}
                            </TooltipContent>
                        </Tooltip>
                    )}
                    {hasNotifications && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="notifications__badge-total inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400 cursor-default shrink-0">
                                    {notifications.length}
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>
                                {t('notifications.tooltip.total', undefined, { count: notifications.length })}
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>

                {/* Правая часть: подписка + действия + пилюля-подсказка */}
                <div className="flex items-center gap-1 shrink-0">
                    {isSubscribed ? (
                        <Button
                            size="sm"
                            variant="outline"
                            className="notifications__unsubscribe-btn h-7 gap-1.5 text-xs"
                            onClick={(e) => { e.stopPropagation(); unsubscribe(); }}
                        >
                            <BellOff className="h-3.5 w-3.5" />
                            {t('notifications.unsubscribe')}
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            className="notifications__subscribe-btn h-7 gap-1.5 text-xs"
                            onClick={(e) => { e.stopPropagation(); handleSubscribe(); }}
                        >
                            <Bell className="h-3.5 w-3.5" />
                            {t('notifications.subscribe')}
                        </Button>
                    )}
                    {isExpanded && unread > 0 && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); markAllRead(); }}
                            title={t('notifications.markAllRead')}
                            className="notifications__mark-all rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-primary dark:hover:bg-gray-800 dark:hover:text-primary/80"
                        >
                            <CheckCheck className="h-4 w-4" />
                        </button>
                    )}

                    {/* Пилюля-подсказка — клик проходит до хедера и открывает секцию */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="notifications__toggle ml-1 inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-500 transition-colors group-hover:border-primary/50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                                {isExpanded
                                    ? <><ChevronUp className="h-3.5 w-3.5" />{t('notifications.tooltip.collapse')}</>
                                    : <><ChevronDown className="h-3.5 w-3.5" />{t('notifications.tooltip.expand')}</>
                                }
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                            {isExpanded
                                ? t('notifications.tooltip.collapse')
                                : t('notifications.tooltip.expand')}
                        </TooltipContent>
                    </Tooltip>
                </div>
            </div>

            {/* Expandable body */}
            {isExpanded && <>

            {/* Channel selector */}
            {isSubscribed && (
                <div className="notifications__channels border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                    <p className="notifications__channels-label mb-3 text-xs font-medium text-muted-foreground">
                        {t('notifications.channelLabel')}
                    </p>
                    <RadioGroup value={channel} onValueChange={(val) => setChannel(val as NotificationChannel)} className="flex flex-wrap gap-2">
                        {CHANNELS.map(({ value, labelKey, icon: Icon }) => {
                            const isActive = channel === value;
                            return (
                                <label
                                    key={value}
                                    htmlFor={`channel-${value}`}
                                    className={`notifications__channel-option flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                                        isActive
                                            ? 'border-primary/70 bg-primary/5 text-primary dark:border-primary dark:bg-primary/15 dark:text-primary'
                                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-gray-600'
                                    }`}
                                >
                                    <RadioGroupItem id={`channel-${value}`} value={value} className="sr-only" />
                                    <Icon className="h-3.5 w-3.5 shrink-0" />
                                    {t(labelKey)}
                                </label>
                            );
                        })}
                    </RadioGroup>
                </div>
            )}

            {/* Selection toolbar */}
            {hasNotifications && (
                <div className="notifications__selection-bar flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-2.5 dark:border-gray-700">
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
                        <Checkbox
                            checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                            onCheckedChange={toggleSelectAll}
                            aria-label={allSelected ? t('notifications.deselectAll') : t('notifications.selectAll')}
                        />
                        {selectedIds.length > 0
                            ? t('notifications.selectedCount', undefined, { count: selectedIds.length })
                            : t('notifications.selectAll')}
                    </label>

                    {selectedIds.length > 0 && (
                        <div className="flex items-center gap-2">
                            <ConfirmActionDialog
                                title={t('confirm.title')}
                                description={t('confirm.deleteSelectedNotifications', undefined, { count: selectedIds.length })}
                                confirmLabel={t('notifications.deleteSelected')}
                                cancelLabel={t('common.cancel')}
                                onConfirm={handleDeleteSelected}
                                trigger={
                                    <Button size="sm" variant="destructive" className="h-7 gap-1.5 text-xs">
                                        <Trash2 className="h-3.5 w-3.5" />
                                        {t('notifications.deleteSelected')}
                                    </Button>
                                }
                            />
                            <button
                                type="button"
                                onClick={clearSelection}
                                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* List */}
            <div className="notifications__list">
                {!hasNotifications ? (
                    <div className="notifications__empty flex flex-col items-center gap-2 py-10 text-center">
                        <Bell className="h-9 w-9 text-gray-200 dark:text-gray-700" />
                        <p className="text-sm text-gray-400 dark:text-gray-500">
                            {t('notifications.noNotifications')}
                        </p>
                    </div>
                ) : (
                    <div className="max-h-[336px] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
                        {notifications.map((n) => (
                            <div key={n.id} className="px-3 py-2">
                                <NotificationItem
                                    notification={n}
                                    language={language}
                                    isSelected={selectedIds.includes(n.id)}
                                    onToggleSelect={() => toggleSelect(n.id)}
                                    onMarkRead={() => markRead(n.id)}
                                    onDelete={() => deleteNotification(n.id)}
                                    t={t}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* end isExpanded */}
            </>}
        </section>
        </TooltipProvider>
    );
}
