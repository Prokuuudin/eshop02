import React from 'react';
import type { ArchivedProductRecord } from '@/lib/product-overrides-store';
import { Button } from '@/components/ui/button';

interface ArchivePanelProps {
    archiveItems: ArchivedProductRecord[];
    onRestore: (id: string) => void;
    onDelete: (id: string) => void;
}

const ArchivePanel: React.FC<ArchivePanelProps> = ({ archiveItems, onRestore, onDelete }) => (
    <div className="admin-products__archive-panel">
        <p className="text-xs text-gray-500 mb-2">
            Здесь хранятся товары, удалённые из каталога. Вы можете восстановить их или удалить
            навсегда.
        </p>
        {archiveItems.length === 0 ? (
            <p className="text-xs text-gray-400">Корзина пуста</p>
        ) : (
            archiveItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2 border p-2 mb-1 rounded">
                    <span className="text-xs">{item.id}</span>
                    <Button size="sm" onClick={() => onRestore(item.id)}>
                        Восстановить
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => onDelete(item.id)}>
                        Удалить навсегда
                    </Button>
                </div>
            ))
        )}
    </div>
);

export default ArchivePanel;
