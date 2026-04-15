'use client'

import React, { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import type { CompanyProfile } from '@/lib/company-store'

export default function BarcodeCard({ company }: { company: CompanyProfile }) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const barcodeValue = company.customerBarcode || company.companyId

  useEffect(() => {
    if (!svgRef.current) return

    JsBarcode(svgRef.current, barcodeValue, {
      format: 'CODE128',
      lineColor: '#111827',
      width: 1.8,
      height: 64,
      margin: 0,
      displayValue: false,
      background: 'transparent'
    })
  }, [barcodeValue])

  return (
    <article className="barcode-print-card rounded-xl border border-gray-200 bg-white p-6 text-gray-900 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-gray-500">Client Card</p>
          <h3 className="mt-2 text-2xl font-semibold">{company.companyName}</h3>
          <p className="mt-1 text-sm text-gray-600">ID: {company.companyId}</p>
        </div>
        <div className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600">
          {company.country || 'B2B'}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <svg ref={svgRef} className="h-16 w-full" aria-label={`Barcode ${barcodeValue}`} />
        <p className="mt-3 text-center font-mono text-lg tracking-[0.32em]">{barcodeValue}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-gray-600">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Tax ID</p>
          <p className="mt-1 font-medium text-gray-900">{company.taxId || 'Not set'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Registration</p>
          <p className="mt-1 font-medium text-gray-900">{company.registrationNumber || 'Not set'}</p>
        </div>
      </div>
    </article>
  )
}