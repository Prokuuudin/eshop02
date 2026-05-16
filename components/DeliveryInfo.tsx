import React from 'react';
import { useTranslation } from '@/lib/use-translation';
import {
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
} from '@/components/ui/accordion';

/**
 * Компонент DeliveryInfo объединяет информацию о доставке и правилах получения заказов.
 * Использует БЭМ-нейминг и utility-классы для адаптивной и чистой верстки.
 */
export const DeliveryInfo = () => {
    const { t } = useTranslation();
    return (
        <section className="delivery-info bg-slate-50 dark:bg-gray-800 rounded-lg p-6 shadow">
            <h2 className="delivery-info__title text-2xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
                Доставка и получение заказов
            </h2>
            <p className="delivery-info__desc mb-4 text-gray-700 dark:text-gray-300">
                Срок доставки заказов — от 3 рабочих дней в зависимости от способа доставки и
                региона.
            </p>
            <div className="delivery-info__methods grid md:grid-cols-2 gap-6 mb-6">
                <div className="delivery-info__block">
                    <h3 className="delivery-info__subtitle font-bold mb-2">Способы доставки</h3>
                    <Accordion type="single" collapsible>
                        <AccordionItem value="latvia">
                            <AccordionTrigger>Доставка по Латвии</AccordionTrigger>
                            <AccordionContent>
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
                                            <li>Максимальный размер посылки: 38 × 64 × 19 см</li>
                                            <li>Вес — до 30 кг</li>
                                        </ul>
                                    </li>
                                    <li>
                                        <b>Самовывоз из магазинов — бесплатно</b>
                                        <div className="delivery-info__shops text-sm mt-1">
                                            <div>
                                                Оплаченный заказ можно получить в одном из наших
                                                магазинов:
                                            </div>
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
                        <AccordionItem value="riga">
                            <AccordionTrigger>Доставка по Риге</AccordionTrigger>
                            <AccordionContent>
                                <ul className="list-disc pl-6 mb-2">
                                    <li>
                                        <b>Доставка по Риге курьером</b>
                                        <ul className="list-disc pl-6">
                                            <li>Заказ до 100 € — доставка 10 €</li>
                                            <li>Заказ свыше 100 € — бесплатно</li>
                                        </ul>
                                    </li>
                                    <li>
                                        <b>Самовывоз из офиса</b>
                                        <div className="text-sm mt-1">
                                            Вы можете бесплатно получить заказ в офисе:
                                            <br />
                                            Rencēnu iела 10A, Rīga, LV-1073
                                        </div>
                                    </li>
                                </ul>
                            </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="europe">
                            <AccordionTrigger>Доставка по Европе</AccordionTrigger>
                            <AccordionContent>
                                <ul className="list-disc pl-6 mb-2">
                                    <li>
                                        <b>Доставка в Литву и Эстонию</b>
                                        <div className="text-sm mt-1">
                                            Доставка осуществляется через пакоматы OMNIVA.
                                        </div>
                                        <ul className="list-disc pl-6">
                                            <li>Стоимость — от 4 €</li>
                                            <li>Размер упаковки: до 38 × 64 × 19 см</li>
                                            <li>Вес — до 30 кг</li>
                                        </ul>
                                        <div className="text-xs mt-1">
                                            Заказ доставляется в выбранный вами пакомат.
                                        </div>
                                    </li>
                                </ul>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </div>
                <div className="delivery-info__block">
                    <h3 className="delivery-info__subtitle font-bold mb-2">
                        Правила курьерской доставки
                    </h3>
                    <ul className="delivery-info__list list-disc pl-6 space-y-2">
                        <li>Курьер ожидает получение заказа не более 10 минут.</li>
                        <li>
                            При получении необходимо указать имя, фамилию и поставить подпись в
                            накладной.
                        </li>
                        <li>
                            Заказ считается доставленным после подписания документов получателем или
                            его представителем.
                        </li>
                        <li>
                            При получении обязательно проверьте упаковку в присутствии курьера. Если
                            упаковка повреждена, это необходимо зафиксировать в накладной.
                        </li>
                        <li>
                            Если получатель отсутствует по указанному адресу или отказывается
                            принимать заказ, повторная доставка или переадресация оплачивается
                            отдельно.
                        </li>
                        <li>Доставка осуществляется по рабочим дням с 8:00 до 17:00.</li>
                        <li>
                            Перед доставкой получатель получает SMS с информацией о времени и адресе
                            доставки.
                        </li>
                        <li>
                            Если необходимо изменить время или адрес доставки, просьба заранее
                            связаться с курьерской службой по номеру, указанному в SMS.
                        </li>
                        <li>
                            Если получатель не отвечает на звонок курьера или адрес меняется в день
                            доставки, заказ переносится на следующий рабочий день.
                        </li>
                        <li>Стоимость повторной доставки — 5 €.</li>
                    </ul>
                </div>
            </div>
            <div className="delivery-info__return mb-6">
                <h3 className="delivery-info__subtitle font-bold mb-2">Возврат товара</h3>
                <p className="mb-2">
                    Вы можете вернуть товар в течение 14 дней с момента получения заказа.
                </p>
                <div className="mb-2">Условия возврата:</div>
                <ul className="list-disc pl-6 mb-2">
                    <li>товар не был в использовании;</li>
                    <li>сохранён товарный вид;</li>
                    <li>сохранена оригинальная неповреждённая упаковка.</li>
                </ul>
                <p className="mb-2">
                    После получения и проверки товара возврат денежных средств будет произведён на
                    ваш банковский счёт.
                </p>
                <div className="text-xs text-gray-500 mb-2">
                    Обратите внимание! Согласно правилам дистанционной торговли, товары не подлежат
                    возврату, если:
                    <br />• была вскрыта упаковка товара, который по соображениям гигиены и здоровья
                    не может быть возвращён обратно.
                </div>
            </div>
            <div className="delivery-info__contacts">
                <h3 className="delivery-info__subtitle font-bold mb-2">Если возникли вопросы</h3>
                <div className="mb-1">Свяжитесь с нашей службой поддержки:</div>
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
