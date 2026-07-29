import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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
