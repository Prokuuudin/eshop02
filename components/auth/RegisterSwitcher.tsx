'use client';
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import RegisterForm from '@/components/auth/RegisterForm';
import RegisterNoCardForm from '@/components/auth/RegisterNoCardForm';
import { useTranslation } from '@/lib/use-translation';
import { Check } from 'lucide-react';

type Props = {
    onClose?: () => void;
};

export default function RegisterSwitcher({ onClose }: Props): React.ReactElement {
    const { t } = useTranslation();
    const [hasCard, setHasCard] = useState(true);

    return (
        <div className="register-switcher max-w-md mx-auto">
            <div className="register-switcher__type-selector flex justify-center gap-2 mb-4">
                <Button
                    className="register-switcher__type-btn"
                    variant={hasCard ? 'default' : 'outline'}
                    onClick={() => setHasCard(true)}
                >
                    {hasCard && <Check className="w-4 h-4 mr-1" />}
                    {t('auth.hasCard', 'Есть карта клиента')}
                </Button>
                <Button
                    className="register-switcher__type-btn"
                    variant={!hasCard ? 'default' : 'outline'}
                    onClick={() => setHasCard(false)}
                >
                    {!hasCard && <Check className="w-4 h-4 mr-1" />}
                    {t('auth.noCard', 'Нет карты клиента')}
                </Button>
            </div>
            <div className="register-switcher__form">
                {hasCard ? <RegisterForm onClose={onClose} onNoPersonalCode={() => setHasCard(false)} /> : <RegisterNoCardForm onClose={onClose} />}
            </div>
        </div>
    );
}
