'use client';

import React from 'react';
import { Button } from '@/components/ui/button';

import type { useAdminOrdersPage } from './useAdminOrdersPage';

type OrdersState = ReturnType<typeof useAdminOrdersPage>;

export default function OrdersPagination({ state }: { state: OrdersState }): React.ReactElement {
    const {
            page,
            setPage,
            filtered,
            totalPages,
          } = state;
    return (
        <>
            {totalPages > 1 && (
                <div className="flex items-center justify-between gap-4 pt-2">
                    <span className="text-sm text-muted-foreground">
                        {page + 1} / {totalPages} Â· {filtered.length} Ð·Ð°ÐºÐ°Ð·Ð¾Ð²
                    </span>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(0)}
                            disabled={page === 0}
                        >
                            Â«
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                            disabled={page === 0}
                        >
                            â€¹
                        </Button>
                        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                            const offset = Math.max(0, Math.min(page - 3, totalPages - 7));
                            const pg = i + offset;
                            return (
                                <Button
                                    key={pg}
                                    variant={pg === page ? 'default' : 'outline'}
                                    size="sm"
                                    className={[
                                        'hidden sm:inline-flex',
                                        pg === page ? 'bg-primary text-primary-foreground' : '',
                                    ].join(' ')}
                                    onClick={() => setPage(pg)}
                                >
                                    {pg + 1}
                                </Button>
                            );
                        })}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                            disabled={page >= totalPages - 1}
                        >
                            â€º
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(totalPages - 1)}
                            disabled={page >= totalPages - 1}
                        >
                            Â»
                        </Button>
                    </div>
                </div>
            )}
        </>
    );
}
