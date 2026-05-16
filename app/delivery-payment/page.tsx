'use client';

import React from 'react';

import { useTranslation } from '@/lib/use-translation';
import { getSiteUrl } from '@/lib/site-url';

import {
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
} from '@/components/ui/accordion';

export default function DeliveryPaymentPage() {
    const { t } = useTranslation();
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
        url: `${siteUrl}/delivery-payment`,
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
            />
            <section className="max-w-6xl mx-auto py-10 px-4 text-gray-900 dark:text-gray-100">
                <h1 className="text-3xl font-bold mb-10 text-center text-gray-900 dark:text-gray-100">
                    {t('deliveryPayment.title')}
                </h1>

                <div className="delivery-payment bem-delivery-payment grid grid-cols-1 md:grid-cols-2 gap-8 py-8">
                    {/* Левая колонка: Доставка */}
                    <section className="delivery-payment__section bem-delivery-payment__section bg-white dark:bg-gray-800 rounded-2xl shadow p-6 flex flex-col h-full border border-gray-100 dark:border-gray-700 transition-colors">
                        <h2 className="delivery-payment__title bem-delivery-payment__title text-2xl font-bold mb-4 text-blue-700 dark:text-blue-300">
                            Доставка
                        </h2>
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
                                <AccordionContent className="delivery-payment__content bem-delivery-payment__content">
                                    <ul className="list-disc pl-6 mb-2">
                                        <li>
                                            <b>Доставка курьером по Латвии</b>
                                            <ul className="list-disc pl-6">
                                                <li>Стоимость — от 10 €</li>
                                            </ul>
                                            <div className="text-xs mt-1">
                                                При заказе на сумму свыше 200 € доставка по Латвии
                                                осуществляется бесплатно.
                                            </div>
                                        </li>
                                        <li>
                                            <b>Доставка в пакоматы OMNIVA</b>
                                            <ul className="list-disc pl-6">
                                                <li>Стоимость — от 4 €</li>
                                                <li>
                                                    Максимальный размер посылки: 38 × 64 × 19 см
                                                </li>
                                                <li>Вес — до 30 кг</li>
                                            </ul>
                                        </li>
                                        <li>
                                            <b>Самовывоз из магазинов — бесплатно</b>
                                            <div className="delivery-info__shops text-sm mt-1">
                                                Оплаченный заказ можно получить в одном из наших
                                                магазинов:
                                                <ul className="list-disc pl-6">
                                                    <li>Рига — Brāļu Kaudzīšu iела 13</li>
                                                    <li>Рига — Anniņmuižas булvāрис 82</li>
                                                    <li>Даугавпилс — Viestура iела 68</li>
                                                    <li>Лиепая — Graudu iела 43N</li>
                                                    <li>Валмиера — Stacijas iела 17</li>
                                                    <li>Резекне — Atbrīвоšanas aleja 128</li>
                                                    <li>Елгава — Katoļu iела 1A</li>
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
                                    <ul className="delivery-info__list list-disc pl-6 space-y-2">
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
                                    <p className="mb-2">
                                        Вы можете вернуть товар в течение 14 дней с момента
                                        получения заказа.
                                    </p>
                                    <div className="mb-2">Условия возврата:</div>
                                    <ul className="list-disc pl-6 mb-2">
                                        <li>товар не был в использовании;</li>
                                        <li>сохранён товарный вид;</li>
                                        <li>сохранена оригинальная неповреждённая упаковка.</li>
                                    </ul>
                                    <p className="mb-2">
                                        После получения и проверки товара возврат денежных средств
                                        будет произведён на ваш банковский счёт.
                                    </p>
                                    <div className="text-xs text-gray-500 mb-2">
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
                                    <div className="mb-1">Свяжитесь с нашей службой поддержки:</div>
                                    <ul className="list-disc pl-6">
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
                                                href="mailto:Info@HairShop.lv"
                                                className="text-blue-600 hover:underline"
                                            >
                                                Info@HairShop.lv
                                            </a>
                                        </li>
                                    </ul>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </section>
                    {/* Правая колонка: Оплата */}
                    <section className="delivery-payment__section bem-delivery-payment__section bg-white dark:bg-gray-800 rounded-2xl shadow p-6 flex flex-col h-full border border-gray-100 dark:border-gray-700 transition-colors">
                        <h2 className="delivery-payment__title bem-delivery-payment__title text-2xl font-bold mb-4 text-green-700 dark:text-green-300">
                            Оплата
                        </h2>
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
                                    <ul className="payment-info__list list-disc pl-6 space-y-4">
                                        <li>
                                            <b>Оплата банковской картой</b>
                                            <div className="text-sm mt-1">
                                                Оплата картой доступна при получении заказа в офисе
                                                интернет-магазина:
                                                <br />
                                                Rencēnu iela 10A, Rīga, LV-1073
                                            </div>
                                        </li>
                                        <li>
                                            <b>Оплата наличными</b>
                                            <div className="text-sm mt-1">
                                                Оплата наличными осуществляется при получении заказа
                                                в офисе интернет-магазина:
                                                <br />
                                                Rencēnu iела 10A, Rīga, LV-1073
                                            </div>
                                        </li>
                                        <li>
                                            <b>Оплата банковским переводом</b>
                                            <div className="text-sm mt-1">
                                                После оформления заказа на вашу электронную почту
                                                будет отправлен счёт для оплаты.
                                                <br />
                                                При оплате банковским переводом обязательно укажите
                                                номер заказа в назначении платежа.
                                            </div>
                                            <div className="payment-info__bank mt-2 p-3 bg-slate-100 dark:bg-gray-700 rounded">
                                                <div className="font-bold">
                                                    Реквизиты для оплаты
                                                </div>
                                                <div>
                                                    <b>SIA Miks Plus</b>
                                                </div>
                                                <div>Rencēnu 10A, Rīga, Latvija, LV-1029</div>
                                                <div>PVN Nr.: LV4010335137</div>
                                                <div>
                                                    <b>Банк:</b> AS Swedbank
                                                </div>
                                                <div>
                                                    <b>SWIFT:</b> HABALV22
                                                </div>
                                                <div>
                                                    <b>Счёт:</b> LV66HABA0551036604107
                                                </div>
                                            </div>
                                        </li>
                                        <li>
                                            <b>Оплата через Lateko Līzings</b>
                                            <div className="text-sm mt-1">
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
                                    <ol className="list-decimal pl-6 space-y-1">
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
                                    <div className="mb-2">
                                        Все платежи на нашем сайте защищены с помощью современных
                                        технологий шифрования (SSL/TLS).
                                    </div>
                                    <ul className="list-disc pl-6 mb-2">
                                        <li>
                                            Данные банковских карт не сохраняются и не передаются
                                            третьим лицам.
                                        </li>
                                        <li>
                                            Оплата проходит через сертифицированные платёжные шлюзы.
                                        </li>
                                        <li>Мы соблюдаем стандарты безопасности PCI DSS.</li>
                                    </ul>
                                    <div className="text-xs text-gray-500">
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
                                    <div className="mb-1">
                                        Наша служба поддержки поможет решить вопросы, связанные с
                                        оплатой заказа.
                                    </div>
                                    <ul className="list-disc pl-6">
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
                                                href="mailto:Info@HairShop.lv"
                                                className="text-blue-600 hover:underline"
                                            >
                                                Info@HairShop.lv
                                            </a>
                                        </li>
                                    </ul>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </section>
                </div>
                {/* Советы и примечания */}
                <div className="mt-10 text-gray-600 dark:text-gray-400 text-sm border-t pt-4">
                    <ul className="list-disc pl-6 space-y-1">
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
