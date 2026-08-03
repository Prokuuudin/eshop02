import React from 'react';
import { redirect } from 'next/navigation';
import { CreditCard, Truck } from 'lucide-react';
import { getSiteUrl } from '@/lib/site-url';
import { COMPANY } from '@/data/company';
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
                        t('deliveryPayment.courier'),
                        t('deliveryPayment.pickup'),
                        t('deliveryPayment.regions'),
                    ].join('. '),
                },
            },
            {
                '@type': 'Question',
                name: t('deliveryPayment.paymentTitle'),
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: [
                        t('deliveryPayment.card'),
                        t('deliveryPayment.cash'),
                        t('deliveryPayment.online'),
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
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0088C4] text-white dark:bg-white dark:text-[#0088C4]">
                        {section === 'delivery' ? <Truck size={26} aria-hidden="true" /> : <CreditCard size={26} aria-hidden="true" />}
                    </span>
                    {t(section === 'delivery' ? 'deliveryPayment.deliveryTitle' : 'deliveryPayment.paymentTitle')}
                </h1>

                <div className="delivery-payment bem-delivery-payment grid grid-cols-1 gap-8 py-8">
                    {/* Левая колонка: Доставка */}
                    {section === 'delivery' && (
                    <section id="delivery" className="delivery-payment__section bem-delivery-payment__section flex h-full flex-col rounded-2xl border border-gray-100 bg-card p-6 shadow transition-colors dark:border-gray-700">
                        <Accordion
                            type="multiple"
                            className="delivery-payment__accordion bem-delivery-payment__accordion"
                        >
                            <AccordionItem
                                value="methods"
                                className="delivery-payment__item bem-delivery-payment__item"
                            >
                                <AccordionTrigger className="delivery-payment__trigger bem-delivery-payment__trigger">
                                    Способы доставки
                                </AccordionTrigger>
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content leading-6">
                                    <ul className="list-disc space-y-5 pl-5">
                                        <li>
                                            <b>Доставка курьером по Латвии</b>
                                            <ul className="mt-2 list-disc space-y-1 pl-5">
                                                <li>Стоимость — от 10 €</li>
                                            </ul>
                                            <div className="mt-2 text-xs leading-5 text-muted-foreground">
                                                При заказе на сумму свыше 200 € доставка по Латвии
                                                осуществляется бесплатно.
                                            </div>
                                        </li>
                                        <li>
                                            <b>Доставка в пакоматы OMNIVA</b>
                                            <ul className="mt-2 list-disc space-y-1 pl-5">
                                                <li>Стоимость — от 4 €</li>
                                                <li>
                                                    Максимальный размер посылки: 38 × 64 × 19 см
                                                </li>
                                                <li>Вес — до 30 кг</li>
                                            </ul>
                                        </li>
                                        <li>
                                            <b>Самовывоз из магазинов — бесплатно</b>
                                            <div className="delivery-info__shops mt-2 text-sm">
                                                Оплаченный заказ можно получить в одном из наших
                                                магазинов:
                                                <ul className="mt-2 list-disc space-y-1 pl-5">
                                                    <li>Рига — Brāļu Kaudzīšu iela 13</li>
                                                    <li>Рига — Anniņmuižas bulvāris 82</li>
                                                    <li>Даугавпилс — Viestura iela 68-2</li>
                                                    <li>Лиепая — Graudu iela 43N</li>
                                                    <li>Валмиера — Stacijas iela 17</li>
                                                    <li>Резекне — Atbrīvošanas aleja 128</li>
                                                    <li>Елгава — Katoļu iela 1A</li>
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
                                    Правила курьерской доставки
                                </AccordionTrigger>
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content">
                                    <ul className="delivery-info__list list-disc space-y-3 pl-5 leading-6">
                                        <li>Курьер ожидает получение заказа не более 10 минут.</li>
                                        <li>
                                            При получении необходимо указать имя, фамилию и
                                            поставить подпись в накладной.
                                        </li>
                                        <li>
                                            Заказ считается доставленным после подписания документов
                                            получателем или его представителем.
                                        </li>
                                        <li>
                                            При получении обязательно проверьте упаковку в
                                            присутствии курьера. Если упаковка повреждена, это
                                            необходимо зафиксировать в накладной.
                                        </li>
                                        <li>
                                            Если получатель отсутствует по указанному адресу или
                                            отказывается принимать заказ, повторная доставка или
                                            переадресация оплачивается отдельно.
                                        </li>
                                        <li>
                                            Доставка осуществляется по рабочим дням с 8:00 до 17:00.
                                        </li>
                                        <li>
                                            Перед доставкой получатель получает SMS с информацией о
                                            времени и адресе доставки.
                                        </li>
                                        <li>
                                            Если необходимо изменить время или адрес доставки,
                                            просьба заранее связаться с курьерской службой по
                                            номеру, указанному в SMS.
                                        </li>
                                        <li>
                                            Если получатель не отвечает на звонок курьера или адрес
                                            меняется в день доставки, заказ переносится на следующий
                                            рабочий день.
                                        </li>
                                        <li>Стоимость повторной доставки — 5 €.</li>
                                    </ul>
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem
                                value="return"
                                className="delivery-payment__item bem-delivery-payment__item"
                            >
                                <AccordionTrigger className="delivery-payment__trigger bem-delivery-payment__trigger">
                                    Возврат товара
                                </AccordionTrigger>
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content">
                                    <p className="mb-4 leading-6">
                                        Вы можете вернуть товар в течение 14 дней с момента
                                        получения заказа.
                                    </p>
                                    <div className="mb-2 font-medium">Условия возврата:</div>
                                    <ul className="mb-4 list-disc space-y-2 pl-5">
                                        <li>товар не был в использовании;</li>
                                        <li>сохранён товарный вид;</li>
                                        <li>сохранена оригинальная неповреждённая упаковка.</li>
                                    </ul>
                                    <p className="mb-3 leading-6">
                                        После получения и проверки товара возврат денежных средств
                                        будет произведён на ваш банковский счёт.
                                    </p>
                                    <div className="text-xs leading-5 text-gray-500">
                                        Обратите внимание! Согласно правилам дистанционной торговли,
                                        товары не подлежат возврату, если:
                                        <br />• была вскрыта упаковка товара, который по
                                        соображениям гигиены и здоровья не может быть возвращён
                                        обратно.
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem
                                value="contacts"
                                className="delivery-payment__item bem-delivery-payment__item"
                            >
                                <AccordionTrigger className="delivery-payment__trigger bem-delivery-payment__trigger">
                                    Вопросы по доставке
                                </AccordionTrigger>
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content">
                                    <div className="mb-3">Свяжитесь с нашей службой поддержки:</div>
                                    <ul className="list-disc space-y-2 pl-5">
                                        <li>
                                            Телефон:{' '}
                                            <a
                                                href="tel:+37127067730"
                                                className="text-blue-600 hover:underline"
                                            >
                                                +371 27067730
                                            </a>
                                        </li>
                                        <li>
                                            Skype:{' '}
                                            <a
                                                href="skype:ShopForHair?chat"
                                                className="text-blue-600 hover:underline"
                                            >
                                                ShopForHair
                                            </a>
                                        </li>
                                        <li>
                                            E-mail:{' '}
                                            <a
                                                href="mailto:info@hairshop.lv"
                                                className="text-blue-600 hover:underline"
                                            >
                                                info@hairshop.lv
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
                    <section id="payment" className="delivery-payment__section bem-delivery-payment__section flex h-full flex-col rounded-2xl border border-gray-100 bg-card p-6 shadow transition-colors dark:border-gray-700">
                        <Accordion
                            type="multiple"
                            className="delivery-payment__accordion bem-delivery-payment__accordion"
                        >
                            <AccordionItem
                                value="methods"
                                className="delivery-payment__item bem-delivery-payment__item"
                            >
                                <AccordionTrigger className="delivery-payment__trigger bem-delivery-payment__trigger">
                                    Способы оплаты
                                </AccordionTrigger>
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content">
                                    <ul className="payment-info__list list-disc space-y-5 pl-5 leading-6">
                                        <li>
                                            <b>Оплата банковской картой</b>
                                            <div className="mt-2 text-sm">
                                                Оплата картой доступна при получении заказа в офисе
                                                интернет-магазина:
                                                <br />
                                                Rencēnu iela 10A, Rīga, LV-1073
                                            </div>
                                        </li>
                                        <li>
                                            <b>Оплата наличными</b>
                                            <div className="mt-2 text-sm">
                                                Оплата наличными осуществляется при получении заказа
                                                в офисе интернет-магазина:
                                                <br />
                                                Rencēnu iela 10A, Rīga, LV-1073
                                            </div>
                                        </li>
                                        <li>
                                            <b>Оплата банковским переводом</b>
                                            <div className="mt-2 text-sm">
                                                После оформления заказа на вашу электронную почту
                                                будет отправлен счёт для оплаты.
                                                <br />
                                                При оплате банковским переводом обязательно укажите
                                                номер заказа в назначении платежа.
                                            </div>
                                            <div className="payment-info__bank mt-3 space-y-1 rounded bg-slate-100 p-4 dark:bg-gray-700">
                                                <div className="font-bold">
                                                    Реквизиты для оплаты
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
                                        <li>
                                            <b>Оплата через Lateko Līzings</b>
                                            <div className="mt-2 text-sm">
                                                Также доступна оплата с использованием услуг Lateko
                                                Līzings.
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
                                    Как происходит оплата
                                </AccordionTrigger>
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content">
                                    <ol className="list-decimal space-y-2 pl-5 leading-6">
                                        <li>Оформите заказ на сайте.</li>
                                        <li>Выберите способ и адрес доставки.</li>
                                        <li>Получите счёт на указанную электронную почту.</li>
                                        <li>Оплатите заказ выбранным способом.</li>
                                    </ol>
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem
                                value="security"
                                className="delivery-payment__item bem-delivery-payment__item"
                            >
                                <AccordionTrigger className="delivery-payment__trigger bem-delivery-payment__trigger">
                                    Безопасность платежей
                                </AccordionTrigger>
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content">
                                    <div className="mb-4 leading-6">
                                        Все платежи на нашем сайте защищены с помощью современных
                                        технологий шифрования (SSL/TLS).
                                    </div>
                                    <ul className="mb-3 list-disc space-y-2 pl-5 leading-6">
                                        <li>
                                            Данные банковских карт не сохраняются и не передаются
                                            третьим лицам.
                                        </li>
                                        <li>
                                            Оплата проходит через сертифицированные платёжные шлюзы.
                                        </li>
                                        <li>Мы соблюдаем стандарты безопасности PCI DSS.</li>
                                    </ul>
                                    <div className="text-xs leading-5 text-gray-500">
                                        Если у вас возникли вопросы по безопасности платежей,
                                        свяжитесь с нашей службой поддержки.
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem
                                value="support"
                                className="delivery-payment__item bem-delivery-payment__item"
                            >
                                <AccordionTrigger className="delivery-payment__trigger bem-delivery-payment__trigger">
                                    Вопросы по оплате
                                </AccordionTrigger>
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content">
                                    <div className="mb-3 leading-6">
                                        Наша служба поддержки поможет решить вопросы, связанные с
                                        оплатой заказа.
                                    </div>
                                    <ul className="list-disc space-y-2 pl-5">
                                        <li>
                                            Телефон:{' '}
                                            <a
                                                href="tel:+37127067730"
                                                className="text-blue-600 hover:underline"
                                            >
                                                +371 27067730
                                            </a>
                                        </li>
                                        <li>
                                            Skype:{' '}
                                            <a
                                                href="skype:ShopForHair?chat"
                                                className="text-blue-600 hover:underline"
                                            >
                                                ShopForHair
                                            </a>
                                        </li>
                                        <li>
                                            E-mail:{' '}
                                            <a
                                                href="mailto:info@hairshop.lv"
                                                className="text-blue-600 hover:underline"
                                            >
                                                info@hairshop.lv
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
