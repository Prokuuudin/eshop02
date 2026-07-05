import RegisterSwitcher from '@/components/auth/RegisterSwitcher';
export default async function RegisterPage() {
    return (
        <main className="w-full px-4 py-12">
            {/* Клиентский компонент для выбора варианта регистрации */}
            <RegisterSwitcher />
        </main>
    );
}
