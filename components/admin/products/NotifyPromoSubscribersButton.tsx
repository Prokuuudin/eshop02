'use client';

import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface NotifyPromoSubscribersButtonProps {
    productId: string;
}

export const NotifyPromoSubscribersButton: React.FC<NotifyPromoSubscribersButtonProps> = ({ productId }) => {
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
            setResult(res.ok ? 'Отправлено' : 'Ошибка');
            if (res.ok) {
                setOpen(false);
                setMessage('');
            }
        } catch {
            setResult('Ошибка');
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
                    Уведомить подписчиков
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
                placeholder="Текст акции (необязательно)"
                className="w-64"
            />
            <Button type="button" onClick={() => void handleSend()} disabled={sending}>
                {sending ? 'Отправка...' : 'Отправить'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Отмена
            </Button>
        </div>
    );
};
