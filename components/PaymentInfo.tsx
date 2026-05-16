import React from 'react';
import { useTranslation } from '@/lib/use-translation';

/**
 * Компонент PaymentInfo объединяет информацию о способах и процессе оплаты.
 * Использует БЭМ-нейминг и utility-классы для адаптивной и чистой верстки.
 */
export const PaymentInfo = () => {
    const { t } = useTranslation();
    return (
        <section className="payment-info bg-slate-50 dark:bg-gray-800 rounded-lg p-6 shadow">
            <h2 className="payment-info__title text-2xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
                Оплата заказов
            </h2>
            <p className="payment-info__desc mb-4 text-gray-700 dark:text-gray-300">
                Мы стремимся сделать процесс покупки максимально удобным и предлагаем несколько
                способов оплаты для B2B-клиентов и профессиональных мастеров.
            </p>
            <div className="payment-info__methods mb-6">
                <h3 className="payment-info__subtitle font-bold mb-2">Способы оплаты</h3>
                <ul className="payment-info__list list-disc pl-6 space-y-4">
                    <li>
                        <b>Оплата банковской картой</b>
                        <div className="text-sm mt-1">
                            Оплата картой доступна при получении заказа в офисе интернет-магазина:
                            <br />
                            Rencēnu iela 10A, Rīga, LV-1073
                        </div>
                    </li>
                    <li>
                        <b>Оплата наличными</b>
                        <div className="text-sm mt-1">
                            Оплата наличными осуществляется при получении заказа в офисе
                            интернет-магазина:
                            <br />
                            Rencēnu iела 10A, Rīga, LV-1073
                        </div>
                    </li>
                    <li>
                        <b>Оплата банковским переводом</b>
                        <div className="text-sm mt-1">
                            После оформления заказа на вашу электронную почту будет отправлен счёт
                            для оплаты.
                            <br />
                            При оплате банковским переводом обязательно укажите номер заказа в
                            назначении платежа.
                        </div>
                        <div className="payment-info__bank mt-2 p-3 bg-slate-100 dark:bg-gray-700 rounded">
                            <div className="font-bold">Реквизиты для оплаты</div>
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
                            Также доступна оплата с использованием услуг Lateko Līzings.
                        </div>
                    </li>
                </ul>
            </div>
            <div className="payment-info__how mb-6">
                <h3 className="payment-info__subtitle font-bold mb-2">Как происходит оплата</h3>
                <ol className="list-decimal pl-6 space-y-1">
                    <li>Оформите заказ на сайте.</li>
                    <li>Выберите способ и адрес доставки.</li>
                    <li>Получите счёт на указанную электронную почту.</li>
                    <li>Оплатите заказ выбранным способом.</li>
                </ol>
            </div>
            <div className="payment-info__support">
                <h3 className="payment-info__subtitle font-bold mb-2">
                    Если возникли проблемы с оплатой
                </h3>
                <div className="mb-1">
                    Наша служба поддержки поможет решить вопросы, связанные с оплатой заказа.
                </div>
                <ul className="list-disc pl-6">
                    <li>
                        Телефон:{' '}
                        <a href="tel:+37127067730" className="text-blue-600 hover:underline">
                            +371 27067730
                        </a>
                    </li>
                    <li>
                        Skype:{' '}
                        <a href="skype:ShopForHair?chat" className="text-blue-600 hover:underline">
                            ShopForHair
                        </a>
                    </li>
                    <li>
                        E-mail:{' '}
                        <a href="mailto:Info@HairShop.lv" className="text-blue-600 hover:underline">
                            Info@HairShop.lv
                        </a>
                    </li>
                </ul>
            </div>
        </section>
    );
};
