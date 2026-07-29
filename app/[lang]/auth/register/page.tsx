import RegisterSwitcher from '@/components/auth/RegisterSwitcher';
import type { ReactElement } from 'react';
export default async function RegisterPage(): Promise<ReactElement> {
    return (
        <main className="w-full px-4 py-12">
            {/* Клиентский компонент для выбора варианта регистрации */}
            <RegisterSwitcher />
        </main>
    );
}
