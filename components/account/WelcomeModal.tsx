'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { User2, Mail, Phone, PartyPopper, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clearNewUserFlag, type User } from '@/lib/auth';

const isInternalEmail = (email: string) => email.endsWith('@client.local');

type FieldHint = {
    key: string;
    icon: React.ReactNode;
    label: string;
    hint: string;
    missing: boolean;
};

export default function WelcomeModal({ user }: { user: User }) {
    const router = useRouter();

    const fields: FieldHint[] = [
        {
            key: 'name',
            icon: <User2 className="h-4 w-4 text-indigo-500" />,
            label: 'Имя',
            hint: 'Как к вам обращаться в переписке и на документах',
            missing: !user.name?.trim(),
        },
        {
            key: 'email',
            icon: <Mail className="h-4 w-4 text-indigo-500" />,
            label: 'E-mail',
            hint: 'Для уведомлений о заказах, доставке и счетов',
            missing: !user.email || isInternalEmail(user.email),
        },
        {
            key: 'phone',
            icon: <Phone className="h-4 w-4 text-indigo-500" />,
            label: 'Телефон',
            hint: 'Менеджер свяжется с вами по вопросам заказа',
            missing: !user.phone?.trim(),
        },
    ];

    const missingFields = fields.filter((f) => f.missing);
    const filledFields = fields.filter((f) => !f.missing);

    const handleGoToProfile = () => {
        clearNewUserFlag();
        router.push('/account/profile');
    };

    const handleClose = () => {
        clearNewUserFlag();
    };

    return (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
            <div className="w-full max-w-md rounded-2xl bg-card shadow-2xl overflow-hidden">
                {/* Шапка */}
                <div className="bg-primary px-6 py-5 text-white">
                    <div className="flex items-center gap-3 mb-1">
                        <PartyPopper className="h-6 w-6 text-indigo-200" />
                        <h2 className="text-lg font-bold">
                            Добро пожаловать{user.name ? `, ${user.name}` : ''}!
                        </h2>
                    </div>
                    <p className="text-indigo-200 text-sm">
                        Вы успешно зарегистрированы. Кабинет готов к работе.
                    </p>
                </div>

                <div className="px-6 py-5 space-y-4">
                    {/* Незаполненные поля */}
                    {missingFields.length > 0 && (
                        <div>
                            <p className="text-sm font-semibold text-foreground mb-3">
                                Заполните профиль для удобной работы:
                            </p>
                            <ul className="space-y-3">
                                {missingFields.map((f) => (
                                    <li key={f.key} className="flex items-start gap-3 rounded-xl border border-indigo-100 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/30 px-4 py-3">
                                        <span className="mt-0.5 flex-shrink-0">{f.icon}</span>
                                        <div>
                                            <span className="text-sm font-medium text-foreground">
                                                {f.label}
                                            </span>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {f.hint}
                                            </p>
                                        </div>
                                        <span className="ml-auto flex-shrink-0 text-xs text-amber-600 dark:text-amber-400 font-medium mt-0.5">
                                            не заполнено
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Уже заполненные */}
                    {filledFields.length > 0 && (
                        <ul className="space-y-2">
                            {filledFields.map((f) => (
                                <li key={f.key} className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <span className="h-4 w-4 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-xs">✓</span>
                                    {f.label} заполнен
                                </li>
                            ))}
                        </ul>
                    )}

                    {/* Кнопки */}
                    <div className="flex flex-col gap-2 pt-1">
                        {missingFields.length > 0 ? (
                            <Button className="w-full gap-2" onClick={handleGoToProfile}>
                                Заполнить профиль
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        ) : (
                            <Button className="w-full" onClick={handleClose}>
                                Перейти в кабинет
                            </Button>
                        )}
                        <Button variant="ghost" className="w-full text-gray-400" onClick={handleClose}>
                            {missingFields.length > 0 ? 'Заполню позже' : 'Закрыть'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
