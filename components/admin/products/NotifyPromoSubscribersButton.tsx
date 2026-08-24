'use client';

import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAdminLocale } from '@/lib/use-admin-locale';

interface NotifyPromoSubscribersButtonProps {
    productId: string;
}

export const NotifyPromoSubscribersButton: React.FC<NotifyPromoSubscribersButtonProps> = ({ productId }) => {
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
            <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(true)}>
                    <Bell className="w-4 h-4 mr-2" />
                    {l('Уведомить подписчиков', 'Notify subscribers', 'Paziņot abonentiem')}
                </Button>
                {result && <span className="text-xs text-muted-foreground">{result}</span>}
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={l('Текст акции (необязательно)', 'Promotion text (optional)', 'Akcijas teksts (neobligāti)')}
                className="w-64"
            />
            <Button type="button" onClick={() => void handleSend()} disabled={sending}>
                {sending ? l('Отправка...', 'Sending...', 'Nosūta...') : l('Отправить', 'Send', 'Nosūtīt')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {l('Отмена', 'Cancel', 'Atcelt')}
            </Button>
        </div>
    );
};
