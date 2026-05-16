'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCompanyStore, type CompanyProfile } from '@/lib/company-store';
import { useAccessRequestStore } from '@/lib/access-request-store';
import {
    approveAccessRequest,
    getCurrentUser,
    listCompanyUsers,
    rejectAccessRequest,
    updateUserTeamRole,
    type TeamRole,
} from '@/lib/auth';
import AdminGate from '@/components/admin/AdminGate';
import BarcodeCard from '@/components/admin/BarcodeCard';
import { useTranslation } from '@/lib/use-translation';

type CompanyDraft = {
    companyId: string;
    companyName: string;
    cardNumber: string;
    taxId: string;
    registrationNumber: string;
    city: string;
    country: string;
    paymentTermDays: '0' | '30' | '60' | '90';
    approvalWorkflowEnabled: boolean;
};

const EMPTY_DRAFT: CompanyDraft = {
    companyId: '',
    companyName: '',
    cardNumber: '',
    taxId: '',
    registrationNumber: '',
    city: '',
    country: '',
    paymentTermDays: '30',
    approvalWorkflowEnabled: false,
};

const toDraft = (company: CompanyProfile): CompanyDraft => ({
    companyId: company.companyId,
    companyName: company.companyName,
    cardNumber: company.cardNumber ?? '',
    taxId: company.taxId ?? '',
    registrationNumber: company.registrationNumber ?? '',
    city: company.city ?? '',
    country: company.country ?? '',
    paymentTermDays: String(company.paymentTermDays) as CompanyDraft['paymentTermDays'],
    approvalWorkflowEnabled: company.approvalWorkflowEnabled,
});

const normalizeCardNumber = (value: string): string => value.replace(/\s+/g, '').toUpperCase();

const generateNextCardNumber = (companies: CompanyProfile[]): string => {
    // Пример генерации: просто увеличиваем максимальный номер
    const maxNumber = companies.reduce((max, company) => {
        const num = Number((company.cardNumber ?? '').replace(/\D/g, ''));
        return isNaN(num) ? max : Math.max(max, num);
    }, 1234567890123455);
    return String(maxNumber + 1).padStart(16, '0');
};

const createCardImageDataUrl = async (value: string): Promise<string> => {
    const { default: JsBarcode } = await import('jsbarcode');
    const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgNode.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgNode.setAttribute('width', '600');
    svgNode.setAttribute('height', '160');

    JsBarcode(svgNode, value, {
        format: 'CODE128',
        lineColor: '#111827',
        width: 2,
        height: 80,
        margin: 0,
        displayValue: false,
        background: '#ffffff',
    });

    const svgMarkup = new XMLSerializer().serializeToString(svgNode);
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const nextImage = new Image();
        nextImage.onload = () => resolve(nextImage);
        nextImage.onerror = () => reject(new Error('Failed to prepare barcode image'));
        nextImage.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 320;

    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Canvas context is unavailable');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/png');
};

const downloadCardPdf = async (company: CompanyProfile): Promise<void> => {
    const { jsPDF } = await import('jspdf');
    const cardValue = company.cardNumber || company.companyId;
    const cardImage = await createCardImageDataUrl(cardValue);
    const document = new jsPDF({ unit: 'pt', format: 'a4' });

    document.setFillColor(248, 250, 252);
    document.roundedRect(40, 40, 515, 290, 18, 18, 'F');
    document.setDrawColor(226, 232, 240);
    document.roundedRect(40, 40, 515, 290, 18, 18, 'S');

    document.setFontSize(11);
    document.setTextColor(100, 116, 139);
    document.text('Client Card', 64, 76);

    document.setFontSize(24);
    document.setTextColor(17, 24, 39);
    document.text(company.companyName, 64, 110);

    document.setFontSize(12);
    document.setTextColor(75, 85, 99);
    document.text(`ID: ${company.companyId}`, 64, 132);
    document.text(`Country: ${company.country || 'B2B'}`, 420, 76);

    document.setFillColor(255, 255, 255);
    document.roundedRect(64, 156, 468, 104, 12, 12, 'F');
    document.setDrawColor(229, 231, 235);
    document.roundedRect(64, 156, 468, 104, 12, 12, 'S');
    document.addImage(cardImage, 'PNG', 84, 168, 428, 64);

    document.setFontSize(16);
    document.setTextColor(17, 24, 39);
    document.text(cardValue, 180, 248);

    document.setFontSize(10);
    document.setTextColor(156, 163, 175);
    document.text('Tax ID', 64, 290);
    document.text('Registration', 300, 290);

    document.setFontSize(12);
    document.setTextColor(31, 41, 55);
    document.text(company.taxId || 'Not set', 64, 308);
    document.text(company.registrationNumber || 'Not set', 300, 308);

    document.save(`${cardValue}.pdf`);
};

export default function AdminClientBarcodesPage() {
    const { t, language } = useTranslation();
    const l = (ru: string, en: string, lv: string) =>
        language === 'ru' ? ru : language === 'lv' ? lv : en;
    const tl = (
        key: string,
        ru: string,
        en: string,
        lv: string,
        params?: Record<string, string | number>
    ) => t(key, l(ru, en, lv), params);

    const [draft, setDraft] = useState<CompanyDraft>(EMPTY_DRAFT);
    const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
    const [formError, setFormError] = useState('');
    const [message, setMessage] = useState('');
    const [printCompanyId, setPrintCompanyId] = useState<string>('');
    const [pdfBusy, setPdfBusy] = useState(false);
    const [requestRoles, setRequestRoles] = useState<Record<string, TeamRole>>({});
    const [memberRolesDraft, setMemberRolesDraft] = useState<Record<string, TeamRole>>({});
    const [roleUpdateInProgress, setRoleUpdateInProgress] = useState<string | null>(null);

    const { getCompanies, upsertCompany, deleteCompany } = useCompanyStore();
    const { getPendingRequests } = useAccessRequestStore();
    const companies = getCompanies();
    const pendingRequests = getPendingRequests();
    const selectedPrintCompany =
        companies.find((company) => company.companyId === printCompanyId) ?? companies[0];

    const resolveRequestRole = (requestId: string, companyId: string): TeamRole => {
        const explicitRole = requestRoles[requestId];
        if (explicitRole) return explicitRole;

        const company = companies.find((item) => item.companyId === companyId);
        return company && company.teamMembers.length === 0 ? 'admin' : 'buyer';
    };

    const resetForm = () => {
        setDraft(EMPTY_DRAFT);
        setEditingCompanyId(null);
        setFormError('');
    };

    const startEdit = (company: CompanyProfile) => {
        setDraft(toDraft(company));
        setEditingCompanyId(company.companyId);
        setFormError('');
        setMessage('');
        setPrintCompanyId(company.companyId);
    };

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        setFormError('');
        setMessage('');

        const companyId = draft.companyId.trim();
        const companyName = draft.companyName.trim();
        const cardNumber = normalizeCardNumber(draft.cardNumber);
        if (!companyId || !companyName || !cardNumber) {
            setFormError(
                tl(
                    'admin.clientBarCodes.msg.fillRequired',
                    'Заполните company ID, название компании и номер карты',
                    'Fill company ID, company name, and card number',
                    'Aizpildiet company ID, uznemuma nosaukumu un kartes numuru'
                )
            );
            return;
        }

        const cardInUse = companies.find(
            (company) =>
                company.companyId !== editingCompanyId &&
                normalizeCardNumber(company.cardNumber ?? '') === cardNumber
        );
        if (cardInUse) {
            setFormError(
                tl(
                    'admin.clientBarCodes.msg.cardInUseWithCompany',
                    'Номер карты уже используется: {company}',
                    'Card number is already in use: {company}',
                    'Kartes numurs jau tiek izmantots: {company}',
                    { company: cardInUse.companyName }
                )
            );
            return;
        }

        upsertCompany({
            companyId,
            companyName,
            cardNumber,
            taxId: draft.taxId.trim() || undefined,
            registrationNumber: draft.registrationNumber.trim() || undefined,
            city: draft.city.trim() || undefined,
            country: draft.country.trim() || undefined,
            paymentTermDays: Number(draft.paymentTermDays) as 0 | 30 | 60 | 90,
            approvalWorkflowEnabled: draft.approvalWorkflowEnabled,
        });

        setMessage(
            editingCompanyId
                ? tl(
                      'admin.clientBarcodes.msg.companyUpdated',
                      'Компания обновлена',
                      'Company updated',
                      'Uznemums atjaunots'
                  )
                : tl(
                      'admin.clientBarcodes.msg.companyAdded',
                      'Компания добавлена',
                      'Company added',
                      'Uznemums pievienots'
                  )
        );
        resetForm();
    };

    const handleDelete = (companyId: string) => {
        deleteCompany(companyId);
        if (editingCompanyId === companyId) {
            resetForm();
        }
        setMessage(
            tl(
                'admin.clientBarcodes.msg.companyDeleted',
                'Компания удалена',
                'Company deleted',
                'Uznemums izdzests'
            )
        );
        setFormError('');
    };

    const handleDownloadPdf = async () => {
        if (!selectedPrintCompany) return;

        setPdfBusy(true);
        setFormError('');
        setMessage('');

        try {
            await downloadCardPdf(selectedPrintCompany);
            setMessage(
                tl(
                    'admin.clientBarcodes.msg.pdfReady',
                    'PDF карточки подготовлен',
                    'PDF card is ready',
                    'PDF kartite ir sagatavota'
                )
            );
        } catch (error) {
            setFormError(
                error instanceof Error
                    ? error.message
                    : tl(
                          'admin.clientBarcodes.msg.pdfFailed',
                          'Не удалось сформировать PDF',
                          'Failed to generate PDF',
                          'Neizdevas izveidot PDF'
                      )
            );
        } finally {
            setPdfBusy(false);
        }
    };

    const handleApproveRequest = (requestId: string, companyId: string) => {
        const reviewer = getCurrentUser();
        const selectedRole = resolveRequestRole(requestId, companyId);
        const result = approveAccessRequest(requestId, selectedRole, reviewer);

        if (!result.success) {
            setFormError(
                result.error ||
                    tl(
                        'admin.clientBarcodes.msg.approveFailed',
                        'Не удалось одобрить заявку',
                        'Failed to approve request',
                        'Neizdevas apstiprinat pieprasijumu'
                    )
            );
            setMessage('');
            return;
        }

        setMessage(
            tl(
                'admin.clientBarcodes.msg.requestApproved',
                'Заявка одобрена, аккаунт создан',
                'Request approved, account created',
                'Pieprasijums apstiprinats, konts izveidots'
            )
        );
        setFormError('');
    };

    const handleRejectRequest = (requestId: string) => {
        const reviewer = getCurrentUser();
        const result = rejectAccessRequest(
            requestId,
            reviewer,
            tl(
                'admin.clientBarcodes.msg.rejectedByAdmin',
                'Отклонено администратором',
                'Rejected by administrator',
                'Administrators noraidija'
            )
        );

        if (!result.success) {
            setFormError(
                result.error ||
                    tl(
                        'admin.clientBarcodes.msg.rejectFailed',
                        'Не удалось отклонить заявку',
                        'Failed to reject request',
                        'Neizdevas noraidit pieprasijumu'
                    )
            );
            setMessage('');
            return;
        }

        setMessage(
            tl(
                'admin.clientBarcodes.msg.requestRejected',
                'Заявка отклонена',
                'Request rejected',
                'Pieprasijums noraidits'
            )
        );
        setFormError('');
    };

    const resolveMemberRoleDraft = (userId: string, fallbackRole: TeamRole): TeamRole => {
        return memberRolesDraft[userId] ?? fallbackRole;
    };

    const handleUpdateTeamMemberRole = (userId: string, fallbackRole: TeamRole) => {
        const reviewer = getCurrentUser();
        const nextRole = resolveMemberRoleDraft(userId, fallbackRole);

        setRoleUpdateInProgress(userId);
        setFormError('');
        setMessage('');

        const result = updateUserTeamRole(userId, nextRole, reviewer);
        if (!result.success) {
            setFormError(
                result.error ||
                    tl(
                        'admin.clientBarcodes.msg.updateRoleFailed',
                        'Не удалось изменить роль',
                        'Failed to change role',
                        'Neizdevas nomainit lomu'
                    )
            );
            setRoleUpdateInProgress(null);
            return;
        }

        setMemberRolesDraft((prev) => ({
            ...prev,
            [userId]: nextRole,
        }));
        setMessage(
            tl(
                'admin.clientBarcodes.msg.roleUpdated',
                'Роль пользователя обновлена',
                'User role updated',
                'Lietotaja loma atjaunota'
            )
        );
        setRoleUpdateInProgress(null);
    };

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
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                            {tl(
                                'admin.clientBarcodes.title',
                                'Клиентские баркоды',
                                'Client barcodes',
                                'Klientu barkodi'
                            )}
                        </h1>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                            {tl(
                                'admin.clientBarcodes.subtitle',
                                'Управление компаниями и баркодами для активации аккаунтов.',
                                'Manage companies and barcodes for account activation.',
                                'Uznemumu un barkodu parvaldiba kontu aktivizacijai.'
                            )}
                        </p>
                    </div>
                    <Link href="/admin">
                        <Button variant="outline">
                            {tl(
                                'admin.clientBarcodes.backToAdmin',
                                'Назад в админку',
                                'Back to admin',
                                'Atpakal uz admin'
                            )}
                        </Button>
                    </Link>
                </div>

                <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
                    <h2 className="text-xl font-semibold mb-4">
                        {editingCompanyId
                            ? tl(
                                  'admin.clientBarcodes.editCompany',
                                  'Редактирование компании',
                                  'Edit company',
                                  'Rediget uznemumu'
                              )
                            : tl(
                                  'admin.clientBarcodes.newCompany',
                                  'Новая компания',
                                  'New company',
                                  'Jauns uznemums'
                              )}
                    </h2>
                    {formError && <p className="mb-3 text-sm text-red-600">{formError}</p>}
                    {message && <p className="mb-3 text-sm text-emerald-600">{message}</p>}

                    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="text-sm">
                            <span className="block mb-1">
                                {tl(
                                    'admin.clientBarcodes.field.companyId',
                                    'Company ID',
                                    'Company ID',
                                    'Company ID'
                                )}
                            </span>
                            <Input
                                value={draft.companyId}
                                onChange={(e) =>
                                    setDraft((prev) => ({ ...prev, companyId: e.target.value }))
                                }
                                placeholder="company_new_client"
                            />
                        </label>
                        <label className="text-sm">
                            <span className="block mb-1">
                                {tl(
                                    'admin.clientBarcodes.field.companyName',
                                    'Название компании',
                                    'Company name',
                                    'Uznemuma nosaukums'
                                )}
                            </span>
                            <Input
                                value={draft.companyName}
                                onChange={(e) =>
                                    setDraft((prev) => ({ ...prev, companyName: e.target.value }))
                                }
                                placeholder="SIA Example"
                            />
                        </label>
                        <label className="text-sm">
                            <span className="block mb-1">
                                {tl(
                                    'admin.clientBarcodes.field.clientCardNumber',
                                    'Номер карты клиента',
                                    'Client card number',
                                    'Klienta kartes numurs'
                                )}
                            </span>
                            <Input
                                value={draft.cardNumber}
                                onChange={(e) =>
                                    setDraft((prev) => ({ ...prev, cardNumber: e.target.value }))
                                }
                                placeholder="1234 5678 9012 3456"
                            />
                        </label>
                        <div className="flex items-end">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() =>
                                    setDraft((prev) => ({
                                        ...prev,
                                        cardNumber: generateNextCardNumber(companies),
                                    }))
                                }
                            >
                                {tl(
                                    'admin.clientBarcodes.generateCardNumber',
                                    'Сгенерировать номер карты',
                                    'Generate card number',
                                    'Generet kartes numuru'
                                )}
                            </Button>
                        </div>
                        <label className="text-sm">
                            <span className="block mb-1">
                                {tl(
                                    'admin.clientBarcodes.field.taxId',
                                    'ИНН / Tax ID',
                                    'Tax ID',
                                    'Nodoklu ID'
                                )}
                            </span>
                            <Input
                                value={draft.taxId}
                                onChange={(e) =>
                                    setDraft((prev) => ({ ...prev, taxId: e.target.value }))
                                }
                            />
                        </label>
                        <label className="text-sm">
                            <span className="block mb-1">
                                {tl(
                                    'admin.clientBarcodes.field.registrationNumber',
                                    'Регистрационный номер',
                                    'Registration number',
                                    'Registracijas numurs'
                                )}
                            </span>
                            <Input
                                value={draft.registrationNumber}
                                onChange={(e) =>
                                    setDraft((prev) => ({
                                        ...prev,
                                        registrationNumber: e.target.value,
                                    }))
                                }
                            />
                        </label>
                        <label className="text-sm">
                            <span className="block mb-1">
                                {tl('admin.clientBarcodes.field.city', 'Город', 'City', 'Pilseta')}
                            </span>
                            <Input
                                value={draft.city}
                                onChange={(e) =>
                                    setDraft((prev) => ({ ...prev, city: e.target.value }))
                                }
                            />
                        </label>
                        <label className="text-sm">
                            <span className="block mb-1">
                                {tl(
                                    'admin.clientBarcodes.field.country',
                                    'Страна',
                                    'Country',
                                    'Valsts'
                                )}
                            </span>
                            <Input
                                value={draft.country}
                                onChange={(e) =>
                                    setDraft((prev) => ({ ...prev, country: e.target.value }))
                                }
                            />
                        </label>
                        <label className="text-sm">
                            <span className="block mb-1">
                                {tl(
                                    'admin.clientBarcodes.field.paymentTerm',
                                    'Отсрочка платежа',
                                    'Payment term',
                                    'Apmaksas termins'
                                )}
                            </span>
                            <select
                                value={draft.paymentTermDays}
                                onChange={(e) =>
                                    setDraft((prev) => ({
                                        ...prev,
                                        paymentTermDays: e.target
                                            .value as CompanyDraft['paymentTermDays'],
                                    }))
                                }
                                className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
                            >
                                <option value="0">
                                    {tl(
                                        'admin.clientBarcodes.paymentTerm.0',
                                        '0 дней',
                                        '0 days',
                                        '0 dienas'
                                    )}
                                </option>
                                <option value="30">
                                    {tl(
                                        'admin.clientBarcodes.paymentTerm.30',
                                        '30 дней',
                                        '30 days',
                                        '30 dienas'
                                    )}
                                </option>
                                <option value="60">
                                    {tl(
                                        'admin.clientBarcodes.paymentTerm.60',
                                        '60 дней',
                                        '60 days',
                                        '60 dienas'
                                    )}
                                </option>
                                <option value="90">
                                    {tl(
                                        'admin.clientBarcodes.paymentTerm.90',
                                        '90 дней',
                                        '90 days',
                                        '90 dienas'
                                    )}
                                </option>
                            </select>
                        </label>
                        <label className="flex items-center gap-2 text-sm md:col-span-2">
                            <input
                                type="checkbox"
                                checked={draft.approvalWorkflowEnabled}
                                onChange={(e) =>
                                    setDraft((prev) => ({
                                        ...prev,
                                        approvalWorkflowEnabled: e.target.checked,
                                    }))
                                }
                            />
                            {tl(
                                'admin.clientBarcodes.enableApprovalWorkflow',
                                'Включить workflow одобрения заказов',
                                'Enable order approval workflow',
                                'Ieslegt pasutijumu apstiprinasanas procesu'
                            )}
                        </label>

                        <div className="md:col-span-2 flex flex-wrap gap-2">
                            <Button type="submit">
                                {editingCompanyId
                                    ? tl(
                                          'admin.clientBarcodes.saveChanges',
                                          'Сохранить изменения',
                                          'Save changes',
                                          'Saglabat izmainas'
                                      )
                                    : tl(
                                          'admin.clientBarcodes.addCompany',
                                          'Добавить компанию',
                                          'Add company',
                                          'Pievienot uznemumu'
                                      )}
                            </Button>
                            {editingCompanyId && (
                                <Button type="button" variant="outline" onClick={resetForm}>
                                    {tl(
                                        'admin.clientBarcodes.cancel',
                                        'Отменить',
                                        'Cancel',
                                        'Atcelt'
                                    )}
                                </Button>
                            )}
                        </div>
                    </form>
                </section>

                <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-semibold">
                                {tl(
                                    'admin.clientBarcodes.accessRequests',
                                    'Заявки на доступ',
                                    'Access requests',
                                    'Piekluves pieprasijumi'
                                )}{' '}
                                ({pendingRequests.length})
                            </h2>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                                {tl(
                                    'admin.clientBarcodes.accessRequestsDescription',
                                    'Пользователи отправляют заявку по выданному баркоду, а администратор вручную назначает роль и одобряет доступ.',
                                    'Users submit requests by issued barcode, and administrator assigns role and approves access manually.',
                                    'Lietotaji iesniedz pieprasijumu ar izsniegto barkodu, bet administrators manuali piekir lomu un apstiprina piekluvi.'
                                )}
                            </p>
                        </div>
                    </div>

                    {pendingRequests.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-4 text-sm text-gray-600 dark:text-gray-300">
                            {tl(
                                'admin.clientBarcodes.noRequests',
                                'Новых заявок нет.',
                                'No new requests.',
                                'Jaunu pieprasijumu nav.'
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {pendingRequests.map((request) => {
                                const selectedRole = resolveRequestRole(
                                    request.id,
                                    request.companyId
                                );

                                return (
                                    <div
                                        key={request.id}
                                        className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-4">
                                            <div className="space-y-1">
                                                <p className="font-semibold text-gray-900 dark:text-gray-100">
                                                    {request.name || request.email}
                                                </p>
                                                <p className="text-sm text-gray-600 dark:text-gray-300">
                                                    Email: {request.email}
                                                </p>
                                                <p className="text-sm text-gray-600 dark:text-gray-300">
                                                    {tl(
                                                        'admin.clientBarcodes.company',
                                                        'Компания',
                                                        'Company',
                                                        'Uznemums'
                                                    )}
                                                    : {request.companyName}
                                                </p>
                                                <p className="text-sm text-gray-600 dark:text-gray-300">
                                                    {tl(
                                                        'admin.clientBarcodes.cardNumber',
                                                        'Номер карты',
                                                        'Card number',
                                                        'Kartes numurs'
                                                    )}
                                                    : {request.cardNumber}
                                                </p>
                                                <p className="text-sm text-gray-600 dark:text-gray-300">
                                                    {tl(
                                                        'admin.clientBarcodes.submitted',
                                                        'Отправлена',
                                                        'Submitted',
                                                        'Iesniegts'
                                                    )}
                                                    :{' '}
                                                    {new Date(request.requestedAt).toLocaleString(
                                                        language === 'ru'
                                                            ? 'ru-RU'
                                                            : language === 'lv'
                                                            ? 'lv-LV'
                                                            : 'en-US'
                                                    )}
                                                </p>
                                            </div>

                                            <div className="flex min-w-[240px] flex-col gap-2">
                                                <label className="text-sm">
                                                    <span className="mb-1 block">
                                                        {tl(
                                                            'admin.clientBarcodes.roleAfterApproval',
                                                            'Роль после одобрения',
                                                            'Role after approval',
                                                            'Loma pec apstiprinasanas'
                                                        )}
                                                    </span>
                                                    <select
                                                        value={selectedRole}
                                                        onChange={(event) =>
                                                            setRequestRoles((prev) => ({
                                                                ...prev,
                                                                [request.id]: event.target
                                                                    .value as TeamRole,
                                                            }))
                                                        }
                                                        className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
                                                    >
                                                        <option value="viewer">viewer</option>
                                                        <option value="buyer">buyer</option>
                                                        <option value="manager">manager</option>
                                                        <option value="admin">admin</option>
                                                    </select>
                                                </label>
                                                <div className="flex flex-wrap gap-2">
                                                    <Button
                                                        size="sm"
                                                        onClick={() =>
                                                            handleApproveRequest(
                                                                request.id,
                                                                request.companyId
                                                            )
                                                        }
                                                    >
                                                        {tl(
                                                            'admin.clientBarcodes.approve',
                                                            'Одобрить',
                                                            'Approve',
                                                            'Apstiprinat'
                                                        )}
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() =>
                                                            handleRejectRequest(request.id)
                                                        }
                                                    >
                                                        {tl(
                                                            'admin.clientBarcodes.reject',
                                                            'Отклонить',
                                                            'Reject',
                                                            'Noraidit'
                                                        )}
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
                    <h2 className="text-xl font-semibold mb-4">
                        {tl('admin.clientBarcodes.companies', 'Компании', 'Companies', 'Uznemumi')}{' '}
                        ({companies.length})
                    </h2>
                    <div className="space-y-3">
                        {companies.map((company) => {
                            const companyUsers = listCompanyUsers(company.companyId);

                            return (
                                <div
                                    key={company.companyId}
                                    className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <p className="font-semibold text-gray-900 dark:text-gray-100">
                                                {company.companyName}
                                            </p>
                                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                                ID: {company.companyId}
                                            </p>
                                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                                {tl(
                                                    'admin.clientBarcodes.barcode',
                                                    'Баркод',
                                                    'Barcode',
                                                    'Barkods'
                                                )}
                                                :{' '}
                                                {company.cardNumber ||
                                                    tl(
                                                        'admin.clientBarcodes.notSet',
                                                        'не задан',
                                                        'not set',
                                                        'nav iestatits'
                                                    )}
                                            </p>
                                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                                {tl(
                                                    'admin.clientBarcodes.team',
                                                    'Команда',
                                                    'Team',
                                                    'Komanda'
                                                )}
                                                : {company.teamMembers.length}{' '}
                                                {tl(
                                                    'admin.clientBarcodes.users',
                                                    'пользователей',
                                                    'users',
                                                    'lietotaji'
                                                )}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => startEdit(company)}
                                            >
                                                {tl(
                                                    'admin.clientBarcodes.edit',
                                                    'Редактировать',
                                                    'Edit',
                                                    'Rediget'
                                                )}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setPrintCompanyId(company.companyId)}
                                            >
                                                {tl(
                                                    'admin.clientBarcodes.card',
                                                    'Карточка',
                                                    'Card',
                                                    'Kartite'
                                                )}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleDelete(company.companyId)}
                                            >
                                                {tl(
                                                    'admin.clientBarcodes.delete',
                                                    'Удалить',
                                                    'Delete',
                                                    'Dzest'
                                                )}
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="mt-4 rounded-md border border-gray-200 dark:border-gray-700 p-3">
                                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                            {tl(
                                                'admin.clientBarcodes.accountsAndRoles',
                                                'Аккаунты компании и роли',
                                                'Company accounts and roles',
                                                'Uznemuma konti un lomas'
                                            )}
                                        </p>

                                        {companyUsers.length === 0 ? (
                                            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                                                {tl(
                                                    'admin.clientBarcodes.noAccounts',
                                                    'Аккаунтов пока нет.',
                                                    'No accounts yet.',
                                                    'Kontu vel nav.'
                                                )}
                                            </p>
                                        ) : (
                                            <div className="mt-3 space-y-2">
                                                {companyUsers.map((companyUser) => {
                                                    const selectedRole = resolveMemberRoleDraft(
                                                        companyUser.id,
                                                        companyUser.teamRole ?? 'viewer'
                                                    );
                                                    const isBusy =
                                                        roleUpdateInProgress === companyUser.id;

                                                    return (
                                                        <div
                                                            key={companyUser.id}
                                                            className="grid grid-cols-1 gap-2 rounded border border-gray-200 dark:border-gray-700 p-2 md:grid-cols-[1.5fr_1fr_auto] md:items-center"
                                                        >
                                                            <div>
                                                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                                    {companyUser.name ||
                                                                        companyUser.email}
                                                                </p>
                                                                <p className="text-xs text-gray-600 dark:text-gray-300">
                                                                    {companyUser.email}
                                                                </p>
                                                            </div>

                                                            <select
                                                                value={selectedRole}
                                                                onChange={(event) => {
                                                                    const role = event.target
                                                                        .value as TeamRole;
                                                                    setMemberRolesDraft((prev) => ({
                                                                        ...prev,
                                                                        [companyUser.id]: role,
                                                                    }));
                                                                }}
                                                                className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                                                            >
                                                                <option value="viewer">
                                                                    viewer
                                                                </option>
                                                                <option value="buyer">buyer</option>
                                                                <option value="manager">
                                                                    manager
                                                                </option>
                                                                <option value="admin">admin</option>
                                                            </select>

                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                disabled={isBusy}
                                                                onClick={() =>
                                                                    handleUpdateTeamMemberRole(
                                                                        companyUser.id,
                                                                        companyUser.teamRole ??
                                                                            'viewer'
                                                                    )
                                                                }
                                                            >
                                                                {isBusy
                                                                    ? tl(
                                                                          'admin.clientBarcodes.saving',
                                                                          'Сохраняем...',
                                                                          'Saving...',
                                                                          'Saglabajam...'
                                                                      )
                                                                    : tl(
                                                                          'admin.clientBarcodes.changeRole',
                                                                          'Сменить роль',
                                                                          'Change role',
                                                                          'Mainit lomu'
                                                                      )}
                                                            </Button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {selectedPrintCompany && (
                    <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="text-xl font-semibold">
                                    {tl(
                                        'admin.clientBarcodes.printableCard',
                                        'Печатная карточка клиента',
                                        'Printable client card',
                                        'Drukas klienta kartite'
                                    )}
                                </h2>
                                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                                    {tl(
                                        'admin.clientBarcodes.printableCardDescription',
                                        'Подходит для печати и выдачи клиенту.',
                                        'Suitable for printing and handing to a client.',
                                        'Paredzeta drukai un izsniegsanai klientam.'
                                    )}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <select
                                    value={selectedPrintCompany.companyId}
                                    onChange={(event) => setPrintCompanyId(event.target.value)}
                                    className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                                >
                                    {companies.map((company) => (
                                        <option key={company.companyId} value={company.companyId}>
                                            {company.companyName}
                                        </option>
                                    ))}
                                </select>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleDownloadPdf}
                                    disabled={pdfBusy}
                                >
                                    {pdfBusy
                                        ? tl(
                                              'admin.clientBarcodes.preparingPdf',
                                              'Готовим PDF...',
                                              'Preparing PDF...',
                                              'Sagatavojam PDF...'
                                          )
                                        : tl(
                                              'admin.clientBarcodes.downloadPdf',
                                              'Скачать PDF',
                                              'Download PDF',
                                              'Lejupieladet PDF'
                                          )}
                                </Button>
                                <Button type="button" onClick={() => window.print()}>
                                    {tl(
                                        'admin.clientBarcodes.printCard',
                                        'Печать карточки',
                                        'Print card',
                                        'Druket kartiti'
                                    )}
                                </Button>
                            </div>
                        </div>

                        <div className="barcode-print-root max-w-2xl">
                            <BarcodeCard company={selectedPrintCompany} />
                        </div>
                    </section>
                )}
            </main>
        </AdminGate>
    );
}
