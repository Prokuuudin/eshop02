import React from 'react';
import { redirect } from 'next/navigation';
import { CreditCard, Truck } from 'lucide-react';
import { getSiteUrl } from '@/lib/site-url';
import { COMPANY } from '@/data/company';
import { stores } from '@/data/stores';
import { resolveLanguage, localizePath } from '@/lib/i18n-routing';
import { getServerContent } from '@/lib/server-translation';
import { serializeJsonLd } from '@/lib/json-ld';

type StaticBlockProps = { children: React.ReactNode; className?: string; type?: string; value?: string };

const Accordion = ({ children, className }: StaticBlockProps): React.JSX.Element => <div className={`${className ?? ''} space-y-6`}>{children}</div>;
const AccordionItem = ({ children, className }: StaticBlockProps): React.JSX.Element => <section className={`${className ?? ''} border-b border-border pb-6 last:border-b-0 last:pb-0`}>{children}</section>;
const AccordionTrigger = ({ children, className }: StaticBlockProps): React.JSX.Element => <h2 className={`${className ?? ''} mb-3 text-lg font-semibold`}>{children}</h2>;
const AccordionContent = ({ children, className }: StaticBlockProps): React.JSX.Element => <div className={className}>{children}</div>;

type DeliveryPaymentContentProps = { params: Promise<{ lang: string; section?: 'delivery' | 'payment' }> };

export default async function DeliveryPaymentContent({ params }: DeliveryPaymentContentProps): Promise<React.JSX.Element> {
    const routeParams = await params;
    const language = resolveLanguage(routeParams.lang);
    const section = routeParams.section;
    if (!section) redirect(localizePath('/delivery', language));
    const { t } = await getServerContent(language);
    const siteUrl = getSiteUrl();

    const faqSchema = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
            {
                '@type': 'Question',
                name: t('deliveryPayment.deliveryTitle'),
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: [
                        t('deliveryPayment.methods.courierLatvia.label'),
                        t('deliveryPayment.methods.omniva.label'),
                        t('deliveryPayment.methods.pickup.label'),
                    ].join('. '),
                },
            },
            {
                '@type': 'Question',
                name: t('deliveryPayment.paymentTitle'),
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: [
                        t('deliveryPayment.payment.paysera.label'),
                        t('deliveryPayment.payment.paypal.label'),
                        t('deliveryPayment.payment.transfer.label'),
                        t('deliveryPayment.payment.card.label'),
                        t('deliveryPayment.payment.cash.label'),
                    ].join('. '),
                },
            },
        ],
        url: `${siteUrl}${localizePath(`/${section}`, language)}`,
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqSchema) }}
            />
            <section className="mx-auto max-w-6xl px-4 py-10 text-foreground">
                <h1 className="mb-10 flex items-center justify-center gap-3 text-center text-3xl font-bold text-foreground">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground dark:bg-white dark:text-brand">
                        {section === 'delivery' ? <Truck size={26} aria-hidden="true" /> : <CreditCard size={26} aria-hidden="true" />}
                    </span>
                    {t(section === 'delivery' ? 'deliveryPayment.deliveryTitle' : 'deliveryPayment.paymentTitle')}
                </h1>

                <div className="delivery-payment bem-delivery-payment grid grid-cols-1 gap-8 py-8">
                    {/* Левая колонка: Доставка */}
                    {section === 'delivery' && (
                    <section id="delivery" className="delivery-payment__section bem-delivery-payment__section flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow transition-colors">
                        <Accordion
                            type="multiple"
                            className="delivery-payment__accordion bem-delivery-payment__accordion"
                        >
                            <AccordionItem
                                value="methods"
                                className="delivery-payment__item bem-delivery-payment__item"
                            >
                                <AccordionTrigger className="delivery-payment__trigger bem-delivery-payment__trigger">
                                    {t('deliveryPayment.methods.title')}
                                </AccordionTrigger>
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content leading-6">
                                    <ul className="list-disc space-y-5 pl-5">
                                        <li>
                                            <b>{t('deliveryPayment.methods.courierLatvia.label')}</b>
                                            <ul className="mt-2 list-disc space-y-1 pl-5">
                                                <li>{t('deliveryPayment.methods.courierLatvia.price')}</li>
                                            </ul>
                                            <div className="mt-2 text-xs leading-5 text-muted-foreground">
                                                {t('deliveryPayment.methods.courierLatvia.freeNote')}
                                            </div>
                                        </li>
                                        <li>
                                            <b>{t('deliveryPayment.methods.omniva.label')}</b>
                                            <ul className="mt-2 list-disc space-y-1 pl-5">
                                                <li>{t('deliveryPayment.methods.omniva.price')}</li>
                                                <li>{t('deliveryPayment.methods.omniva.maxSize')}</li>
                                                <li>{t('deliveryPayment.methods.omniva.weight')}</li>
                                            </ul>
                                        </li>
                                        <li>
                                            <b>{t('deliveryPayment.methods.pickup.label')}</b>
                                            <div className="delivery-info__shops mt-2 text-sm">
                                                {t('deliveryPayment.methods.pickup.intro')}
                                                <ul className="mt-2 list-disc space-y-1 pl-5">
                                                    {stores.map((store) => (
                                                        <li key={store.id}>{store.city[language]} — {store.address[language]}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </li>
                                    </ul>
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem
                                value="rules"
                                className="delivery-payment__item bem-delivery-payment__item"
                            >
                                <AccordionTrigger className="delivery-payment__trigger bem-delivery-payment__trigger">
                                    {t('deliveryPayment.rules.title')}
                                </AccordionTrigger>
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content">
                                    <ul className="delivery-info__list list-disc space-y-3 pl-5 leading-6">
                                        <li>{t('deliveryPayment.rules.item1')}</li>
                                        <li>{t('deliveryPayment.rules.item2')}</li>
                                        <li>{t('deliveryPayment.rules.item3')}</li>
                                        <li>{t('deliveryPayment.rules.item4')}</li>
                                        <li>{t('deliveryPayment.rules.item5')}</li>
                                        <li>{t('deliveryPayment.rules.item6')}</li>
                                        <li>{t('deliveryPayment.rules.item7')}</li>
                                        <li>{t('deliveryPayment.rules.item8')}</li>
                                        <li>{t('deliveryPayment.rules.item9')}</li>
                                        <li>{t('deliveryPayment.rules.item10')}</li>
                                    </ul>
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem
                                value="return"
                                className="delivery-payment__item bem-delivery-payment__item"
                            >
                                <AccordionTrigger className="delivery-payment__trigger bem-delivery-payment__trigger">
                                    {t('deliveryPayment.return.title')}
                                </AccordionTrigger>
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content">
                                    <p className="mb-4 leading-6">{t('deliveryPayment.return.intro')}</p>
                                    <div className="mb-2 font-medium">{t('deliveryPayment.return.conditionsTitle')}</div>
                                    <ul className="mb-4 list-disc space-y-2 pl-5">
                                        <li>{t('deliveryPayment.return.condition1')}</li>
                                        <li>{t('deliveryPayment.return.condition2')}</li>
                                        <li>{t('deliveryPayment.return.condition3')}</li>
                                    </ul>
                                    <p className="mb-3 leading-6">{t('deliveryPayment.return.refundNote')}</p>
                                    <div className="text-xs leading-5 text-muted-foreground">
                                        {t('deliveryPayment.return.exceptionIntro')}
                                        <br />• {t('deliveryPayment.return.exceptionItem1')}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem
                                value="contacts"
                                className="delivery-payment__item bem-delivery-payment__item"
                            >
                                <AccordionTrigger className="delivery-payment__trigger bem-delivery-payment__trigger">
                                    {t('deliveryPayment.contacts.title')}
                                </AccordionTrigger>
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content">
                                    <div className="mb-3">{t('deliveryPayment.contacts.intro')}</div>
                                    <ul className="list-disc space-y-2 pl-5">
                                        <li>
                                            {t('contact.phoneLabel')}:{' '}
                                            <a
                                                href={`tel:${COMPANY.phone}`}
                                                className="text-primary hover:underline"
                                            >
                                                {COMPANY.phone}
                                            </a>
                                        </li>
                                        <li>
                                            {t('contact.emailLabel')}:{' '}
                                            <a
                                                href={`mailto:${COMPANY.email}`}
                                                className="text-primary hover:underline"
                                            >
                                                {COMPANY.email}
                                            </a>
                                        </li>
                                    </ul>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </section>
                    )}
                    {/* Правая колонка: Оплата */}
                    {section === 'payment' && (
                    <section id="payment" className="delivery-payment__section bem-delivery-payment__section flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow transition-colors">
                        <Accordion
                            type="multiple"
                            className="delivery-payment__accordion bem-delivery-payment__accordion"
                        >
                            <AccordionItem
                                value="methods"
                                className="delivery-payment__item bem-delivery-payment__item"
                            >
                                <AccordionTrigger className="delivery-payment__trigger bem-delivery-payment__trigger">
                                    {t('deliveryPayment.payment.methods.title')}
                                </AccordionTrigger>
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content">
                                    <ul className="payment-info__list list-disc space-y-5 pl-5 leading-6">
                                        <li>
                                            <b>{t('deliveryPayment.payment.paysera.label')}</b>
                                            <div className="mt-2 text-sm">{t('deliveryPayment.payment.paysera.note')}</div>
                                        </li>
                                        <li>
                                            <b>{t('deliveryPayment.payment.paypal.label')}</b>
                                            <div className="mt-2 text-sm">{t('deliveryPayment.payment.paypal.note')}</div>
                                        </li>
                                        <li>
                                            <b>{t('deliveryPayment.payment.card.label')}</b>
                                            <div className="mt-2 text-sm">
                                                {t('deliveryPayment.payment.card.note')}
                                                <br />
                                                {COMPANY.officeAddress}
                                            </div>
                                        </li>
                                        <li>
                                            <b>{t('deliveryPayment.payment.cash.label')}</b>
                                            <div className="mt-2 text-sm">
                                                {t('deliveryPayment.payment.cash.note')}
                                                <br />
                                                {COMPANY.officeAddress}
                                            </div>
                                        </li>
                                        <li>
                                            <b>{t('deliveryPayment.payment.transfer.label')}</b>
                                            <div className="mt-2 text-sm">
                                                {t('deliveryPayment.payment.transfer.note1')}
                                                <br />
                                                {t('deliveryPayment.payment.transfer.note2')}
                                            </div>
                                            <div className="payment-info__bank mt-3 space-y-1 rounded bg-muted p-4">
                                                <div className="font-bold">
                                                    {t('deliveryPayment.payment.transfer.requisitesTitle')}
                                                </div>
                                                <div>
                                                    <b>{COMPANY.name}</b>
                                                </div>
                                                <div>{COMPANY.legalAddress}</div>
                                                <div>{t('contact.regNumberLabel')}: {COMPANY.regNumber}</div>
                                                <div>{t('contact.vatLabel')}: {COMPANY.vatNumber}</div>
                                                <div>
                                                    <b>{t('contact.bankLabel')}:</b> {COMPANY.bankName}
                                                </div>
                                                <div>
                                                    <b>{t('contact.bankAccountLabel')}:</b> {COMPANY.bankAccount}
                                                </div>
                                                <div>
                                                    <b>{t('contact.swiftLabel')}:</b> {COMPANY.swift}
                                                </div>
                                            </div>
                                        </li>
                                    </ul>
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem
                                value="how"
                                className="delivery-payment__item bem-delivery-payment__item"
                            >
                                <AccordionTrigger className="delivery-payment__trigger bem-delivery-payment__trigger">
                                    {t('deliveryPayment.payment.how.title')}
                                </AccordionTrigger>
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content">
                                    <ol className="list-decimal space-y-2 pl-5 leading-6">
                                        <li>{t('deliveryPayment.payment.how.step1')}</li>
                                        <li>{t('deliveryPayment.payment.how.step2')}</li>
                                        <li>{t('deliveryPayment.payment.how.step3')}</li>
                                        <li>{t('deliveryPayment.payment.how.step4')}</li>
                                    </ol>
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem
                                value="security"
                                className="delivery-payment__item bem-delivery-payment__item"
                            >
                                <AccordionTrigger className="delivery-payment__trigger bem-delivery-payment__trigger">
                                    {t('deliveryPayment.payment.security.title')}
                                </AccordionTrigger>
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content">
                                    <div className="mb-4 leading-6">{t('deliveryPayment.payment.security.intro')}</div>
                                    <ul className="mb-3 list-disc space-y-2 pl-5 leading-6">
                                        <li>{t('deliveryPayment.payment.security.item1')}</li>
                                        <li>{t('deliveryPayment.payment.security.item2')}</li>
                                        <li>{t('deliveryPayment.payment.security.item3')}</li>
                                    </ul>
                                    <div className="text-xs leading-5 text-muted-foreground">
                                        {t('deliveryPayment.payment.security.note')}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem
                                value="support"
                                className="delivery-payment__item bem-delivery-payment__item"
                            >
                                <AccordionTrigger className="delivery-payment__trigger bem-delivery-payment__trigger">
                                    {t('deliveryPayment.support.title')}
                                </AccordionTrigger>
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content">
                                    <div className="mb-3 leading-6">{t('deliveryPayment.support.intro')}</div>
                                    <ul className="list-disc space-y-2 pl-5">
                                        <li>
                                            {t('contact.phoneLabel')}:{' '}
                                            <a
                                                href={`tel:${COMPANY.phone}`}
                                                className="text-primary hover:underline"
                                            >
                                                {COMPANY.phone}
                                            </a>
                                        </li>
                                        <li>
                                            {t('contact.emailLabel')}:{' '}
                                            <a
                                                href={`mailto:${COMPANY.email}`}
                                                className="text-primary hover:underline"
                                            >
                                                {COMPANY.email}
                                            </a>
                                        </li>
                                    </ul>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </section>
                    )}
                </div>
                {/* Советы и примечания */}
                <div className="mt-10 border-t pt-4 text-sm text-muted-foreground">
                    <ul className="list-disc space-y-1 pl-6">
                        {[1, 2, 3].map((i) => (
                            <li key={i}>{t(`deliveryPayment.tips.${i}`)}</li>
                        ))}
                        <li>{t('deliveryPayment.note')}</li>
                    </ul>
                </div>
            </section>
        </>
    );
}
