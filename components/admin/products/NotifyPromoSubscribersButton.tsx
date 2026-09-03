'use client';

import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAdminLocale } from '@/lib/use-admin-locale';

interface NotifyPromoSubscribersButtonProps {
    productId: string;
    presentation?: 'button' | 'menu';
}

export const NotifyPromoSubscribersButton: React.FC<NotifyPromoSubscribersButtonProps> = ({ productId, presentation = 'button' }) => {
    const { l } = useAdminLocale();
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState('');

    const handleSend = async (): Promise<void> => {
        setSending(true);
        setResult('');
        try {
            const res = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/notify-promo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message.trim() || undefined }),
            });
            setResult(res.ok ? l('Отправлено', 'Sent', 'Nosūtīts') : l('Ошибка', 'Error', 'Kļūda'));
            if (res.ok) {
                setOpen(false);
                setMessage('');
            }
        } catch {
            setResult(l('Ошибка', 'Error', 'Kļūda'));
        } finally {
            setSending(false);
            setTimeout(() => setResult(''), 2500);
        }
    };

    if (!open) {
        return (
            <div className={presentation === 'menu' ? 'w-full' : 'flex items-center gap-2'}>
                <Button
                    type="button"
                    variant={presentation === 'menu' ? 'ghost' : 'outline'}
                    className={presentation === 'menu' ? 'h-auto w-full justify-start rounded-sm px-2 py-2.5 font-normal text-white hover:bg-zinc-800 hover:text-white dark:hover:bg-zinc-700' : undefined}
                    onClick={() => setOpen(true)}
                >
                    <Bell className="w-4 h-4 mr-2" />
                    {l('Уведомить подписчиков', 'Notify subscribers', 'Paziņot abonentiem')}
                </Button>
                {result && <span className="text-xs text-muted-foreground">{result}</span>}
            </div>
        );
    }

    return (
        <div className={presentation === 'menu' ? 'flex w-full flex-col gap-2 p-2' : 'flex items-center gap-2'}>
            <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={l('Текст акции (необязательно)', 'Promotion text (optional)', 'Akcijas teksts (neobligāti)')}
                className={presentation === 'menu' ? 'w-full bg-white text-zinc-950 placeholder:text-zinc-500' : 'w-64'}
            />
            <div className={presentation === 'menu' ? 'flex gap-2' : 'contents'}>
                <Button type="button" onClick={() => void handleSend()} disabled={sending}>
                    {sending ? l('Отправка...', 'Sending...', 'Nosūta...') : l('Отправить', 'Send', 'Nosūtīt')}
                </Button>
                <Button type="button" variant="ghost" className={presentation === 'menu' ? 'text-white hover:bg-zinc-800 hover:text-white dark:hover:bg-zinc-700' : undefined} onClick={() => setOpen(false)}>
                    {l('Отмена', 'Cancel', 'Atcelt')}
                </Button>
            </div>
        </div>
    );
};
