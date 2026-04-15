'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import JsBarcode from 'jsbarcode'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCompanyStore, type CompanyProfile } from '@/lib/company-store'
import { useAccessRequestStore } from '@/lib/access-request-store'
import { approveAccessRequest, getCurrentUser, rejectAccessRequest, type TeamRole } from '@/lib/auth'
import AdminGate from '@/components/admin/AdminGate'
import BarcodeCard from '@/components/admin/BarcodeCard'

type CompanyDraft = {
  companyId: string
  companyName: string
  customerBarcode: string
  taxId: string
  registrationNumber: string
  city: string
  country: string
  paymentTermDays: '0' | '30' | '60' | '90'
  approvalWorkflowEnabled: boolean
}

const EMPTY_DRAFT: CompanyDraft = {
  companyId: '',
  companyName: '',
  customerBarcode: '',
  taxId: '',
  registrationNumber: '',
  city: '',
  country: '',
  paymentTermDays: '30',
  approvalWorkflowEnabled: false
}

const toDraft = (company: CompanyProfile): CompanyDraft => ({
  companyId: company.companyId,
  companyName: company.companyName,
  customerBarcode: company.customerBarcode ?? '',
  taxId: company.taxId ?? '',
  registrationNumber: company.registrationNumber ?? '',
  city: company.city ?? '',
  country: company.country ?? '',
  paymentTermDays: String(company.paymentTermDays) as CompanyDraft['paymentTermDays'],
  approvalWorkflowEnabled: company.approvalWorkflowEnabled
})

const normalizeBarcode = (value: string): string => value.trim().replace(/\s+/g, '').toUpperCase()

const generateNextBarcode = (companies: CompanyProfile[]): string => {
  const maxNumber = companies.reduce((max, company) => {
    const match = normalizeBarcode(company.customerBarcode ?? '').match(/CLI-(\d{5})/)
    if (!match) return max
    return Math.max(max, Number(match[1]))
  }, 9999)

  return `CLI-${String(maxNumber + 1).padStart(5, '0')}`
}

const createBarcodeImageDataUrl = async (value: string): Promise<string> => {
  const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svgNode.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  svgNode.setAttribute('width', '600')
  svgNode.setAttribute('height', '160')

  JsBarcode(svgNode, value, {
    format: 'CODE128',
    lineColor: '#111827',
    width: 2,
    height: 80,
    margin: 0,
    displayValue: false,
    background: '#ffffff'
  })

  const svgMarkup = new XMLSerializer().serializeToString(svgNode)
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const nextImage = new Image()
    nextImage.onload = () => resolve(nextImage)
    nextImage.onerror = () => reject(new Error('Не удалось подготовить изображение баркода'))
    nextImage.src = svgUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 320

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas context недоступен')
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  return canvas.toDataURL('image/png')
}

const downloadBarcodeCardPdf = async (company: CompanyProfile): Promise<void> => {
  const { jsPDF } = await import('jspdf')
  const barcodeValue = company.customerBarcode || company.companyId
  const barcodeImage = await createBarcodeImageDataUrl(barcodeValue)
  const document = new jsPDF({ unit: 'pt', format: 'a4' })

  document.setFillColor(248, 250, 252)
  document.roundedRect(40, 40, 515, 290, 18, 18, 'F')
  document.setDrawColor(226, 232, 240)
  document.roundedRect(40, 40, 515, 290, 18, 18, 'S')

  document.setFontSize(11)
  document.setTextColor(100, 116, 139)
  document.text('Client Card', 64, 76)

  document.setFontSize(24)
  document.setTextColor(17, 24, 39)
  document.text(company.companyName, 64, 110)

  document.setFontSize(12)
  document.setTextColor(75, 85, 99)
  document.text(`ID: ${company.companyId}`, 64, 132)
  document.text(`Country: ${company.country || 'B2B'}`, 420, 76)

  document.setFillColor(255, 255, 255)
  document.roundedRect(64, 156, 468, 104, 12, 12, 'F')
  document.setDrawColor(229, 231, 235)
  document.roundedRect(64, 156, 468, 104, 12, 12, 'S')
  document.addImage(barcodeImage, 'PNG', 84, 168, 428, 64)

  document.setFontSize(16)
  document.setTextColor(17, 24, 39)
  document.text(barcodeValue, 180, 248)

  document.setFontSize(10)
  document.setTextColor(156, 163, 175)
  document.text('Tax ID', 64, 290)
  document.text('Registration', 300, 290)

  document.setFontSize(12)
  document.setTextColor(31, 41, 55)
  document.text(company.taxId || 'Not set', 64, 308)
  document.text(company.registrationNumber || 'Not set', 300, 308)

  document.save(`${barcodeValue}.pdf`)
}

export default function AdminClientBarcodesPage() {
  const [draft, setDraft] = useState<CompanyDraft>(EMPTY_DRAFT)
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [message, setMessage] = useState('')
  const [printCompanyId, setPrintCompanyId] = useState<string>('')
  const [pdfBusy, setPdfBusy] = useState(false)
  const [requestRoles, setRequestRoles] = useState<Record<string, TeamRole>>({})

  const { getCompanies, upsertCompany, deleteCompany } = useCompanyStore()
  const { getPendingRequests } = useAccessRequestStore()
  const companies = getCompanies()
  const pendingRequests = getPendingRequests()
  const selectedPrintCompany = companies.find((company) => company.companyId === printCompanyId) ?? companies[0]

  const resolveRequestRole = (requestId: string, companyId: string): TeamRole => {
    const explicitRole = requestRoles[requestId]
    if (explicitRole) return explicitRole

    const company = companies.find((item) => item.companyId === companyId)
    return company && company.teamMembers.length === 0 ? 'admin' : 'buyer'
  }

  const resetForm = () => {
    setDraft(EMPTY_DRAFT)
    setEditingCompanyId(null)
    setFormError('')
  }

  const startEdit = (company: CompanyProfile) => {
    setDraft(toDraft(company))
    setEditingCompanyId(company.companyId)
    setFormError('')
    setMessage('')
    setPrintCompanyId(company.companyId)
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setFormError('')
    setMessage('')

    const companyId = draft.companyId.trim()
    const companyName = draft.companyName.trim()
    const customerBarcode = normalizeBarcode(draft.customerBarcode)
    if (!companyId || !companyName || !customerBarcode) {
      setFormError('Заполните company ID, название компании и баркод')
      return
    }

    const barcodeInUse = companies.find(
      (company) => company.companyId !== editingCompanyId && normalizeBarcode(company.customerBarcode ?? '') === customerBarcode
    )
    if (barcodeInUse) {
      setFormError(`Баркод уже используется: ${barcodeInUse.companyName}`)
      return
    }

    upsertCompany({
      companyId,
      companyName,
      customerBarcode,
      taxId: draft.taxId.trim() || undefined,
      registrationNumber: draft.registrationNumber.trim() || undefined,
      city: draft.city.trim() || undefined,
      country: draft.country.trim() || undefined,
      paymentTermDays: Number(draft.paymentTermDays) as 0 | 30 | 60 | 90,
      approvalWorkflowEnabled: draft.approvalWorkflowEnabled
    })

    setMessage(editingCompanyId ? 'Компания обновлена' : 'Компания добавлена')
    resetForm()
  }

  const handleDelete = (companyId: string) => {
    deleteCompany(companyId)
    if (editingCompanyId === companyId) {
      resetForm()
    }
    setMessage('Компания удалена')
    setFormError('')
  }

  const handleDownloadPdf = async () => {
    if (!selectedPrintCompany) return

    setPdfBusy(true)
    setFormError('')
    setMessage('')

    try {
      await downloadBarcodeCardPdf(selectedPrintCompany)
      setMessage('PDF карточки подготовлен')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Не удалось сформировать PDF')
    } finally {
      setPdfBusy(false)
    }
  }

  const handleApproveRequest = (requestId: string, companyId: string) => {
    const reviewer = getCurrentUser()
    const selectedRole = resolveRequestRole(requestId, companyId)
    const result = approveAccessRequest(requestId, selectedRole, reviewer)

    if (!result.success) {
      setFormError(result.error || 'Не удалось одобрить заявку')
      setMessage('')
      return
    }

    setMessage('Заявка одобрена, аккаунт создан')
    setFormError('')
  }

  const handleRejectRequest = (requestId: string) => {
    const reviewer = getCurrentUser()
    const result = rejectAccessRequest(requestId, reviewer, 'Отклонено администратором')

    if (!result.success) {
      setFormError(result.error || 'Не удалось отклонить заявку')
      setMessage('')
      return
    }

    setMessage('Заявка отклонена')
    setFormError('')
  }

  return (
    <AdminGate>
    <main className="max-w-6xl mx-auto px-4 py-10 space-y-6">
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }

          .barcode-print-root,
          .barcode-print-root * {
            visibility: visible;
          }

          .barcode-print-root {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 24px;
          }
        }
      `}</style>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Клиентские баркоды</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">Управление компаниями и баркодами для активации аккаунтов.</p>
        </div>
        <Link href="/admin"><Button variant="outline">Назад в админку</Button></Link>
      </div>

      <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <h2 className="text-xl font-semibold mb-4">{editingCompanyId ? 'Редактирование компании' : 'Новая компания'}</h2>
        {formError && <p className="mb-3 text-sm text-red-600">{formError}</p>}
        {message && <p className="mb-3 text-sm text-emerald-600">{message}</p>}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-sm">
            <span className="block mb-1">Company ID</span>
            <Input value={draft.companyId} onChange={(e) => setDraft((prev) => ({ ...prev, companyId: e.target.value }))} placeholder="company_new_client" />
          </label>
          <label className="text-sm">
            <span className="block mb-1">Название компании</span>
            <Input value={draft.companyName} onChange={(e) => setDraft((prev) => ({ ...prev, companyName: e.target.value }))} placeholder="SIA Example" />
          </label>
          <label className="text-sm">
            <span className="block mb-1">Баркод клиента</span>
            <Input value={draft.customerBarcode} onChange={(e) => setDraft((prev) => ({ ...prev, customerBarcode: e.target.value }))} placeholder="CLI-40004" />
          </label>
          <div className="flex items-end">
            <Button type="button" variant="outline" onClick={() => setDraft((prev) => ({ ...prev, customerBarcode: generateNextBarcode(companies) }))}>
              Сгенерировать баркод
            </Button>
          </div>
          <label className="text-sm">
            <span className="block mb-1">ИНН / Tax ID</span>
            <Input value={draft.taxId} onChange={(e) => setDraft((prev) => ({ ...prev, taxId: e.target.value }))} />
          </label>
          <label className="text-sm">
            <span className="block mb-1">Регистрационный номер</span>
            <Input value={draft.registrationNumber} onChange={(e) => setDraft((prev) => ({ ...prev, registrationNumber: e.target.value }))} />
          </label>
          <label className="text-sm">
            <span className="block mb-1">Город</span>
            <Input value={draft.city} onChange={(e) => setDraft((prev) => ({ ...prev, city: e.target.value }))} />
          </label>
          <label className="text-sm">
            <span className="block mb-1">Страна</span>
            <Input value={draft.country} onChange={(e) => setDraft((prev) => ({ ...prev, country: e.target.value }))} />
          </label>
          <label className="text-sm">
            <span className="block mb-1">Отсрочка платежа</span>
            <select
              value={draft.paymentTermDays}
              onChange={(e) => setDraft((prev) => ({ ...prev, paymentTermDays: e.target.value as CompanyDraft['paymentTermDays'] }))}
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
            >
              <option value="0">0 дней</option>
              <option value="30">30 дней</option>
              <option value="60">60 дней</option>
              <option value="90">90 дней</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={draft.approvalWorkflowEnabled}
              onChange={(e) => setDraft((prev) => ({ ...prev, approvalWorkflowEnabled: e.target.checked }))}
            />
            Включить workflow одобрения заказов
          </label>

          <div className="md:col-span-2 flex flex-wrap gap-2">
            <Button type="submit">{editingCompanyId ? 'Сохранить изменения' : 'Добавить компанию'}</Button>
            {editingCompanyId && <Button type="button" variant="outline" onClick={resetForm}>Отменить</Button>}
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Заявки на доступ ({pendingRequests.length})</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">Пользователи отправляют заявку по выданному баркоду, а администратор вручную назначает роль и одобряет доступ.</p>
          </div>
        </div>

        {pendingRequests.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-4 text-sm text-gray-600 dark:text-gray-300">
            Новых заявок нет.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((request) => {
              const selectedRole = resolveRequestRole(request.id, request.companyId)

              return (
                <div key={request.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{request.name || request.email}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">Email: {request.email}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">Компания: {request.companyName}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">Баркод: {request.barcode}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">Отправлена: {new Date(request.requestedAt).toLocaleString('ru-RU')}</p>
                    </div>

                    <div className="flex min-w-[240px] flex-col gap-2">
                      <label className="text-sm">
                        <span className="mb-1 block">Роль после одобрения</span>
                        <select
                          value={selectedRole}
                          onChange={(event) => setRequestRoles((prev) => ({ ...prev, [request.id]: event.target.value as TeamRole }))}
                          className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
                        >
                          <option value="viewer">viewer</option>
                          <option value="buyer">buyer</option>
                          <option value="manager">manager</option>
                          <option value="admin">admin</option>
                        </select>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => handleApproveRequest(request.id, request.companyId)}>Одобрить</Button>
                        <Button size="sm" variant="outline" onClick={() => handleRejectRequest(request.id)}>Отклонить</Button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <h2 className="text-xl font-semibold mb-4">Компании ({companies.length})</h2>
        <div className="space-y-3">
          {companies.map((company) => (
            <div key={company.companyId} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{company.companyName}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">ID: {company.companyId}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">Баркод: {company.customerBarcode || 'не задан'}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">Команда: {company.teamMembers.length} пользователей</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => startEdit(company)}>Редактировать</Button>
                  <Button size="sm" variant="outline" onClick={() => setPrintCompanyId(company.companyId)}>Карточка</Button>
                  <Button size="sm" variant="outline" onClick={() => handleDelete(company.companyId)}>Удалить</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {selectedPrintCompany && (
        <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Печатная карточка клиента</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">Подходит для печати и выдачи клиенту.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={selectedPrintCompany.companyId}
                onChange={(event) => setPrintCompanyId(event.target.value)}
                className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
              >
                {companies.map((company) => (
                  <option key={company.companyId} value={company.companyId}>{company.companyName}</option>
                ))}
              </select>
              <Button type="button" variant="outline" onClick={handleDownloadPdf} disabled={pdfBusy}>
                {pdfBusy ? 'Готовим PDF...' : 'Скачать PDF'}
              </Button>
              <Button type="button" onClick={() => window.print()}>Печать карточки</Button>
            </div>
          </div>

          <div className="barcode-print-root max-w-2xl">
            <BarcodeCard company={selectedPrintCompany} />
          </div>
        </section>
      )}
    </main>
    </AdminGate>
  )
}