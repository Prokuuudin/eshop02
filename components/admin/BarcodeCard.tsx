'use client';

import React, { useEffect, useRef } from 'react';
import type { CompanyProfile } from '@/lib/company-store';

export default function BarcodeCard({ company }: { company: CompanyProfile }): React.ReactElement {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const barcodeValue = company.cardNumber || company.companyId;

    useEffect(() => {
        if (!svgRef.current) return;

        let isCancelled = false;

        const renderBarcode = async () => {
            const { default: JsBarcode } = await import('jsbarcode');
            if (isCancelled || !svgRef.current) return;

            JsBarcode(svgRef.current, barcodeValue, {
                format: 'CODE128',
                lineColor: '#111827',
                width: 1.8,
                height: 64,
                margin: 0,
                displayValue: false,
                background: 'transparent',
            });
        };

        void renderBarcode();

        return () => {
            isCancelled = true;
        };
    }, [barcodeValue]);

    return (
        <article className="barcode-print-card rounded-xl border border-border bg-card p-6 text-foreground shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Client Card</p>
                    <h3 className="mt-2 text-2xl font-semibold">{company.companyName}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">ID: {company.companyId}</p>
                </div>
                <div className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
                    {company.country || 'B2B'}
                </div>
            </div>

            <div className="rounded-lg border border-border bg-muted p-4">
                <svg ref={svgRef} className="h-16 w-full" aria-label={`Barcode ${barcodeValue}`} />
                <p className="mt-3 text-center font-mono text-lg tracking-[0.32em]">
                    {barcodeValue}
                </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Tax ID</p>
                    <p className="mt-1 font-medium text-foreground">{company.taxId || 'Not set'}</p>
                </div>
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Registration</p>
                    <p className="mt-1 font-medium text-foreground">
                        {company.registrationNumber || 'Not set'}
                    </p>
                </div>
            </div>
        </article>
    );
}
