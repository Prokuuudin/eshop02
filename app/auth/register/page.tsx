import { Button } from '@/components/ui/button';
import { headers } from 'next/headers';
import { translations, type Language } from '@/data/translations';
import RegisterForm from '@/components/auth/RegisterForm';
import BenefitsList from '@/components/BenefitsList';
import Link from 'next/link';
import RegisterSwitcher from '@/components/auth/RegisterSwitcher';
export default async function RegisterPage() {
    return (
        <main className="w-full px-4 py-12">
            {/* Клиентский компонент для выбора варианта регистрации */}
            <RegisterSwitcher />
        </main>
    );
}
