'use client';

import React from 'react';
import type { ArchivedProductRecord } from '@/lib/product-overrides-store';
import { Button } from '@/components/ui/button';
import { useAdminLocale } from '@/lib/use-admin-locale';

interface ArchivePanelProps {
    archiveItems: ArchivedProductRecord[];
    onRestore: (id: string) => void;
    onDelete: (id: string) => void;
}

const ArchivePanel: React.FC<ArchivePanelProps> = ({ archiveItems, onRestore, onDelete }) => {
    const { l } = useAdminLocale();
    return (
    <div className="admin-products__archive-panel">
        <p className="text-xs text-muted-foreground mb-2">
            {l('Здесь хранятся товары, удалённые из каталога. Вы можете восстановить их или удалить навсегда.', 'Products removed from the catalog are stored here. You can restore or permanently delete them.', 'Šeit glabājas no kataloga izņemtās preces. Tās var atjaunot vai neatgriezeniski dzēst.')}
        </p>
        {archiveItems.length === 0 ? (
            <p className="text-xs text-muted-foreground">{l('Корзина пуста', 'Trash is empty', 'Atkritne ir tukša')}</p>
        ) : (
            archiveItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2 border p-2 mb-1 rounded">
                    <span className="text-xs">{item.id}</span>
                    <Button size="sm" onClick={() => onRestore(item.id)}>
                        {l('Восстановить', 'Restore', 'Atjaunot')}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => onDelete(item.id)}>
                        {l('Удалить навсегда', 'Delete permanently', 'Dzēst neatgriezeniski')}
                    </Button>
                </div>
            ))
        )}
    </div>
    );
};

export default ArchivePanel;
