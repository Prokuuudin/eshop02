'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';

interface ProductSkuInputProps {
    productId: string;
    initialSku?: string;
}

export default function ProductSkuInput({ productId, initialSku }: ProductSkuInputProps) {
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
            if (!res.ok) throw new Error('Ошибка сохранения');
            setSuccess(true);
        } catch (e) {
            setError('Ошибка сохранения');
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
                placeholder="SKU / Артикул"
                disabled={saving}
            />
            <button
                className="px-3 py-1 rounded bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition disabled:opacity-50"
                onClick={handleSave}
                disabled={saving}
                type="button"
            >
                {saving ? 'Сохраняю...' : 'Сохранить'}
            </button>
            {success && <span className="text-green-600 text-xs ml-2">Сохранено</span>}
            {error && <span className="text-red-600 text-xs ml-2">{error}</span>}
        </div>
    );
}
