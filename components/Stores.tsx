"use client";
import React from "react";
import Image from "next/image";
import { useTranslation } from "@/lib/use-translation";
import { stores } from "@/data/stores";

export default function Stores() {
  const { t, language } = useTranslation();
  // Данные магазинов с переводами
  const storeCards = [
    {
      id: 'riga-office',
      name: { ru: 'Рига Офис', en: 'Riga Office', lv: 'Rīgas birojs' },
        address: {
          ru: 'ул. Ренцену 10a, Рига, LV-1073, Латвия',
          en: '10a Rencenu St., Riga, LV-1073, Latvia',
          lv: 'Rencēnu iela 10a, Rīga, LV-1073, Latvija',
        },
      phone: '+37127067730',
      hours: {
        ru: ['Рабочие дни: с 09:00 до 17:00', 'Суббота: выходной', 'Воскресенье: выходной'],
        en: ['Weekdays: 09:00-17:00', 'Saturday: closed', 'Sunday: closed'],
        lv: ['Darba dienas: 09:00-17:00', 'Sestdiena: slēgts', 'Svētdiena: slēgts'],
      },
    },
    {
      id: 'imanta',
      name: { ru: 'Рига (Иманта)', en: 'Riga (Imanta)', lv: 'Rīga (Imanta)' },
        address: {
          ru: 'Аннинмуйжас булварис 82, Рига, LV-1029, Латвия',
          en: '82 Anninmuizas Blvd., Riga, LV-1029, Latvia',
          lv: 'Anniņmuižas bulvāris 82, Rīga, LV-1029, Latvija',
        },
      phone: '+37122015204',
      hours: {
        ru: ['Рабочие дни: с 09:00 до 19:00', 'Суббота: с 10:00 до 16:00', 'Воскресенье: с 10:00 до 16:00'],
        en: ['Weekdays: 09:00-19:00', 'Saturday: 10:00-16:00', 'Sunday: 10:00-16:00'],
        lv: ['Darba dienas: 09:00-19:00', 'Sestdiena: 10:00-16:00', 'Svētdiena: 10:00-16:00'],
      },
    },
    {
      id: 'plavnieki',
      name: { ru: 'Рига (Плявниеки)', en: 'Riga (Plavnieki)', lv: 'Rīga (Pļavnieki)' },
        address: {
          ru: 'ул. Бралю Каудзишу 13, Рига, LV-1082, Латвия',
          en: '13 Bralu Kaudzisu St., Riga, LV-1082, Latvia',
          lv: 'Brāļu Kaudzīšu iela 13, Rīga, LV-1082, Latvija',
        },
      phone: '+37127091811',
      hours: {
        ru: ['Рабочие дни: с 09:00 до 19:00', 'Суббота: с 10:00 до 16:00', 'Воскресенье: с 10:00 до 16:00'],
        en: ['Weekdays: 09:00-19:00', 'Saturday: 10:00-16:00', 'Sunday: 10:00-16:00'],
        lv: ['Darba dienas: 09:00-19:00', 'Sestdiena: 10:00-16:00', 'Svētdiena: 10:00-16:00'],
      },
    },
    {
      id: 'yugla',
      name: { ru: 'Рига (Югла)', en: 'Riga (Jugla)', lv: 'Rīga (Jugla)' },
        address: {
          ru: 'ул. Бривибас 412 к-2, Рига, LV-1024, Латвия',
          en: '412-2 Brivibas St., Riga, LV-1024, Latvia',
          lv: 'Brīvības iela 412 k-2, Rīga, LV-1024, Latvija',
        },
      phone: '+37127801149',
      hours: {
        ru: ['Рабочие дни: с 09:00 до 19:00', 'Суббота: с 10:00 до 16:00', 'Воскресенье: выходной'],
        en: ['Weekdays: 09:00-19:00', 'Saturday: 10:00-16:00', 'Sunday: closed'],
        lv: ['Darba dienas: 09:00-19:00', 'Sestdiena: 10:00-16:00', 'Svētdiena: slēgts'],
      },
    },
    {
      id: 'daugavpils',
      name: { ru: 'Даугавпилс', en: 'Daugavpils', lv: 'Daugavpils' },
        address: {
          ru: 'ул. Виестура 68-2, Даугавпилс, LV-5401, Латвия',
          en: '68-2 Viestura St., Daugavpils, LV-5401, Latvia',
          lv: 'Viestura iela 68-2, Daugavpils, LV-5401, Latvija',
        },
      phone: '+37125151630',
      hours: {
        ru: ['Рабочие дни: с 09:00 до 19:00', 'Суббота: с 10:00 до 16:00', 'Воскресенье: с 10:00 до 16:00'],
        en: ['Weekdays: 09:00-19:00', 'Saturday: 10:00-16:00', 'Sunday: 10:00-16:00'],
        lv: ['Darba dienas: 09:00-19:00', 'Sestdiena: 10:00-16:00', 'Svētdiena: 10:00-16:00'],
      },
    },
    {
      id: 'liepaja',
      name: { ru: 'Лиепая', en: 'Liepaja', lv: 'Liepāja' },
        address: {
          ru: 'ул. Грауду 43N, Лиепая, LV-3401, Латвия',
          en: '43N Graudu St., Liepaja, LV-3401, Latvia',
          lv: 'Graudu iela 43N, Liepāja, LV-3401, Latvija',
        },
      phone: '+37120043999',
      hours: {
        ru: ['Рабочие дни: с 09:00 до 19:00', 'Суббота: с 10:00 до 16:00', 'Воскресенье: выходной'],
        en: ['Weekdays: 09:00-19:00', 'Saturday: 10:00-16:00', 'Sunday: closed'],
        lv: ['Darba dienas: 09:00-19:00', 'Sestdiena: 10:00-16:00', 'Svētdiena: slēgts'],
      },
    },
    {
      id: 'valmiera',
      name: { ru: 'Валмиера', en: 'Valmiera', lv: 'Valmiera' },
        address: {
          ru: 'ул. Стацияс 17, Валмиера, LV-4201, Латвия',
          en: '17 Stacijas St., Valmiera, LV-4201, Latvia',
          lv: 'Stacijas iela 17, Valmiera, LV-4201, Latvija',
        },
      phone: '+37125151629',
      hours: {
        ru: ['Рабочие дни: с 09:00 до 19:00', 'Суббота: с 10:00 до 16:00', 'Воскресенье: выходной'],
        en: ['Weekdays: 09:00-19:00', 'Saturday: 10:00-16:00', 'Sunday: closed'],
        lv: ['Darba dienas: 09:00-19:00', 'Sestdiena: 10:00-16:00', 'Svētdiena: slēgts'],
      },
    },
    {
      id: 'rezekne',
      name: { ru: 'Резекне', en: 'Rezekne', lv: 'Rēzekne' },
        address: {
          ru: 'аллея Атбривоšanas 128, Резекне, LV-4601, Латвия',
          en: '128 Atbrivosanas Ave., Rezekne, LV-4601, Latvia',
          lv: 'Atbrīvošanas aleja 128, Rēzekne, LV-4601, Latvija',
        },
      phone: '+37120125353',
      hours: {
        ru: ['Рабочие дни: с 09:00 до 19:00', 'Суббота: с 10:00 до 16:00', 'Воскресенье: с 10:00 до 16:00'],
        en: ['Weekdays: 09:00-19:00', 'Saturday: 10:00-16:00', 'Sunday: 10:00-16:00'],
        lv: ['Darba dienas: 09:00-19:00', 'Sestdiena: 10:00-16:00', 'Svētdiena: 10:00-16:00'],
      },
    },
    {
      id: 'jelgava',
      name: { ru: 'Елгава', en: 'Jelgava', lv: 'Jelgava' },
        address: {
          ru: 'ул. Катољу 1A, Елгава, LV-3001, Латвия',
          en: '1A Katolu St., Jelgava, LV-3001, Latvia',
          lv: 'Katoļu iela 1A, Jelgava, LV-3001',
        },
      phone: '+37120125353',
      hours: {
        ru: ['Рабочие дни: с 09:00 до 19:00', 'Суббота: с 10:00 до 16:00', 'Воскресенье: выходной'],
        en: ['Weekdays: 09:00-19:00', 'Saturday: 10:00-16:00', 'Sunday: closed'],
        lv: ['Darba dienas: 09:00-19:00', 'Sestdiena: 10:00-16:00', 'Svētdiena: slēgts'],
      },
    },
  ];

  return (
    <section className="stores py-8" id="stores">
      <div className="w-full px-4">
        <div className="mb-4">
          <h2 className="stores__title text-2xl font-semibold">
            {t("stores.title")}
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {storeCards.map((store) => (
            <div key={store.id} className="store-card p-4 border rounded-lg flex flex-col items-center bg-slate-50 dark:bg-gray-800 shadow overflow-hidden">
              <Image
                src={`/stores/${store.id}.jpg`}
                alt={store.name[language]}
                width={320}
                height={180}
                className="mb-2 rounded w-full h-40 object-cover"
              />
              <h3 className="text-lg font-bold mb-1">{store.name[language]}</h3>
              <p className="text-sm text-gray-600 mb-1">{store.address[language]}</p>
              <p className="text-sm text-gray-600 mb-1">{t('stores.phone') ?? 'Телефон'}: {store.phone}</p>
              <div className="text-sm text-gray-600">
                {t('stores.hours') ?? 'Время работы'}:
                <ul className="ml-4 list-disc">
                  {store.hours[language].map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
