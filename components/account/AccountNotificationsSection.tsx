'use client';
import React from 'react';
import {
    Bell,
    BellOff,
    CheckCheck,
    Trash2,
    Check,
    X,
    Info,
    CheckCircle,
    AlertTriangle,
    Tag,
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
    type Notification,
    type NotificationType,
    type NotificationChannel,
} from '@/lib/notifications-store';
import { Button } from '@/components/ui/button';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// ── Type config ────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
    NotificationType,
    { icon: React.ElementType; border: string; dot: string; iconColor: string }
> = {
    info:    { icon: Info,          border: 'border-l-primary/70', dot: 'bg-primary', iconColor: 'text-primary' },
    success: { icon: CheckCircle,   border: 'border-l-emerald-400', dot: 'bg-emerald-500', iconColor: 'text-emerald-500' },
    warning: { icon: AlertTriangle, border: 'border-l-amber-400',   dot: 'bg-amber-500',   iconColor: 'text-amber-500' },
    promo:   { icon: Tag,           border: 'border-l-purple-400',  dot: 'bg-purple-500',  iconColor: 'text-purple-500' },
};

// ── Relative time ──────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string, language: string): string {
    const date = new Date(isoString);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMs / 3_600_000);
    const diffDays = Math.floor(diffMs / 86_400_000);

    if (diffMins < 1) {
        if (language === 'lv') return 'tikko';
        if (language === 'en') return 'just now';
        return 'только что';
    }
    if (diffMins < 60) {
        if (language === 'lv') return `${diffMins} min. atpakaļ`;
        if (language === 'en') return `${diffMins} min ago`;
        return `${diffMins} мин. назад`;
    }
    if (diffHours < 24) {
        if (language === 'lv') return `${diffHours} st. atpakaļ`;
        if (language === 'en') return `${diffHours} h ago`;
        return `${diffHours} ч. назад`;
    }
    if (diffDays < 7) {
        if (language === 'lv') return `${diffDays} d. atpakaļ`;
        if (language === 'en') return `${diffDays} d ago`;
        return `${diffDays} дн. назад`;
    }
    return date.toLocaleDateString(
        language === 'lv' ? 'lv-LV' : language === 'en' ? 'en-GB' : 'ru-RU',
        { day: 'numeric', month: 'short' }
    );
}

// ── Single notification item ───────────────────────────────────────────────────

function NotificationItem({
    notification,
    language,
    isSelected,
    onToggleSelect,
    onMarkRead,
    onDelete,
    t,
}: {
    notification: Notification;
    language: string;
    isSelected: boolean;
    onToggleSelect: () => void;
    onMarkRead: () => void;
    onDelete: () => void;
    t: (key: string, fallback?: string) => string;
}) {
    const cfg = TYPE_CONFIG[notification.type];
    const Icon = cfg.icon;

    return (
        <div
            className={`notifications__item relative flex gap-3 rounded-lg border-l-4 p-4 transition-colors ${cfg.border} ${
                isSelected
                    ? 'bg-primary/5 dark:bg-primary/10'
                    : notification.isRead
                    ? 'bg-card'
                    : 'bg-muted/60'
            }`}
        >
            {/* Unread dot */}
            {!notification.isRead && !isSelected && (
                <span
                    className={`notifications__item-dot absolute right-3 top-3 h-2 w-2 rounded-full ${cfg.dot}`}
                    aria-label={t('notifications.unread')}
                />
            )}

            {/* Checkbox */}
            <div className="notifications__item-checkbox mt-0.5 shrink-0">
                <Checkbox
                    checked={isSelected}
                    onCheckedChange={onToggleSelect}
                    aria-label={notification.title}
                />
            </div>

            {/* Type icon */}
            <div className={`notifications__item-icon mt-0.5 shrink-0 ${cfg.iconColor}`}>
                <Icon className="h-4 w-4" />
            </div>

            {/* Content */}
            <div className="notifications__item-body min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                    <p
                        className={`notifications__item-title text-sm font-semibold leading-snug ${
                            notification.isRead
                                ? 'text-muted-foreground'
                                : 'text-foreground'
                        }`}
                    >
                        {notification.title}
                    </p>
                    <span className="notifications__item-time shrink-0 text-[11px] text-gray-400 dark:text-gray-500">
                        {formatRelativeTime(notification.createdAt, language)}
                    </span>
                </div>

                <p className="notifications__item-message mt-1 text-xs leading-relaxed text-muted-foreground">
                    {notification.message}
                </p>

                <div className="notifications__item-actions mt-2 flex items-center gap-3">
                    {!notification.isRead && (
                        <button
                            type="button"
                            onClick={onMarkRead}
                            className="notifications__item-mark-read flex items-center gap-1 text-[11px] text-primary hover:text-primary dark:text-primary dark:hover:text-primary/70"
                        >
                            <Check className="h-3 w-3" />
                            {t('notifications.markRead')}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onDelete}
                        className="notifications__item-delete flex items-center gap-1 text-[11px] text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                    >
                        <X className="h-3 w-3" />
                        {t('notifications.delete')}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Main section ───────────────────────────────────────────────────────────────

export default function AccountNotificationsSection() {
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
        setSelectedIds((prev) => prev.filter((id) => ids.has(id)));
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
