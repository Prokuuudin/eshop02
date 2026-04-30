import React from 'react';
import type { Product, BadgeType } from '@/data/products';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface ProductEditorProps {
    product: Product;
    draft: any;
    onChange: (patch: Partial<any>) => void;
    onSave: () => void;
    onReset: () => void;
    onDelete: () => void;
    loading?: boolean;
}

const ProductEditor: React.FC<ProductEditorProps> = ({
    product,
    draft,
    onChange,
    onSave,
    onReset,
    onDelete,
    loading,
}) => {
    return (
        <form className="space-y-4">
            <Input
                value={draft.title}
                onChange={(e) => onChange({ title: e.target.value })}
                placeholder="Название"
            />
            {/* ...другие поля draft... */}
            <div className="flex gap-2">
                <Button type="button" onClick={onSave} disabled={loading}>
                    Сохранить
                </Button>
                <Button type="button" onClick={onReset} variant="outline">
                    Сбросить
                </Button>
                <Button type="button" onClick={onDelete} variant="destructive">
                    Удалить
                </Button>
            </div>
        </form>
    );
};

export default ProductEditor;
