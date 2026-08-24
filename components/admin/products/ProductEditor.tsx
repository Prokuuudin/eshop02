'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAdminLocale } from '@/lib/use-admin-locale';

interface ProductEditorProps {
    draft: { title: string; [key: string]: unknown };
    onChange: (patch: Partial<ProductEditorProps['draft']>) => void;
    onSave: () => void;
    onReset: () => void;
    onDelete: () => void;
    loading?: boolean;
}

const ProductEditor: React.FC<ProductEditorProps> = ({
    draft,
    onChange,
    onSave,
    onReset,
    onDelete,
    loading,
}) => {
    const { l } = useAdminLocale();
    return (
        <form className="space-y-4">
            <Input
                value={draft.title}
                onChange={(e) => onChange({ title: e.target.value })}
                placeholder={l('Название', 'Name', 'Nosaukums')}
            />
            {/* ...другие поля draft... */}
            <div className="flex gap-2">
                <Button type="button" onClick={onSave} disabled={loading}>
                    {l('Сохранить', 'Save', 'Saglabāt')}
                </Button>
                <Button type="button" onClick={onReset} variant="outline">
                    {l('Сбросить', 'Reset', 'Atiestatīt')}
                </Button>
                <Button type="button" onClick={onDelete} variant="destructive">
                    {l('Удалить', 'Delete', 'Dzēst')}
                </Button>
            </div>
        </form>
    );
};

export default ProductEditor;
