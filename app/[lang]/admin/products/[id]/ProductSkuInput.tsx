'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { useAdminLocale } from '@/lib/use-admin-locale';

interface ProductSkuInputProps {
    productId: string;
    initialSku?: string;
}

export default function ProductSkuInput({ productId, initialSku }: ProductSkuInputProps): React.ReactElement {
    const { l } = useAdminLocale();
    const [sku, setSku] = useState(initialSku || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        setError('');
        setSuccess(false);
        try {
            const res = await fetch('/api/admin/products', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: productId, changes: { sku } }),
            });
            if (!res.ok) throw new Error(l('Ошибка сохранения', 'Save failed', 'Saglabāšanas kļūda'));
            setSuccess(true);
        } catch {
            setError(l('Ошибка сохранения', 'Save failed', 'Saglabāšanas kļūda'));
        } finally {
            setSaving(false);
            setTimeout(() => setSuccess(false), 1500);
        }
    };

    return (
        <div className="flex items-center gap-2 mt-2">
            <Input
                className="w-48"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder={l('SKU / Артикул', 'SKU / Item number', 'SKU / Artikuls')}
                disabled={saving}
            />
            <button
                className="px-3 py-1 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition disabled:opacity-50"
                onClick={handleSave}
                disabled={saving}
                type="button"
            >
                {saving ? l('Сохраняю...', 'Saving...', 'Saglabā...') : l('Сохранить', 'Save', 'Saglabāt')}
            </button>
            {success && <span className="text-green-600 text-xs ml-2">{l('Сохранено', 'Saved', 'Saglabāts')}</span>}
            {error && <span className="text-red-600 text-xs ml-2">{error}</span>}
        </div>
    );
}
