// Адреса магазинов всегда на латышском во всех языках интерфейса (требование заказчика).
export const stores = [
  {
    id: 'riga-office',
    city: { ru: "Рига", en: "Riga", lv: "Rīga" },
    name: { ru: 'Рига Офис', en: 'Riga Office', lv: 'Rīgas birojs' },
    address: {
      ru: 'Rencēnu iela 10a, Rīga, LV-1073, Latvija',
      en: 'Rencēnu iela 10a, Rīga, LV-1073, Latvija',
      lv: 'Rencēnu iela 10a, Rīga, LV-1073, Latvija',
    },
    phone: '+37127067730',
    geo: { latitude: 56.9254541, longitude: 24.2023317 },
    hours: {
      ru: ['Рабочие дни: с 09:00 до 17:00', 'Суббота: выходной', 'Воскресенье: выходной'],
      en: ['Weekdays: 09:00-17:00', 'Saturday: closed', 'Sunday: closed'],
      lv: ['Darba dienas: 09:00-17:00', 'Sestdiena: slēgts', 'Svētdiena: slēgts'],
    },
  },
  {
    id: 'imanta',
    city: { ru: "Рига", en: "Riga", lv: "Rīga" },
    name: { ru: 'Рига (Иманта)', en: 'Riga (Imanta)', lv: 'Rīga (Imanta)' },
    address: {
      ru: 'Anniņmuižas bulvāris 82, Rīga, LV-1029, Latvija',
      en: 'Anniņmuižas bulvāris 82, Rīga, LV-1029, Latvija',
      lv: 'Anniņmuižas bulvāris 82, Rīga, LV-1029, Latvija',
    },
    phone: '+37122015204',
    geo: { latitude: 56.9554319, longitude: 24.0058872 },
    hours: {
      ru: ['Рабочие дни: с 09:00 до 19:00', 'Суббота: с 10:00 до 16:00', 'Воскресенье: с 10:00 до 16:00'],
      en: ['Weekdays: 09:00-19:00', 'Saturday: 10:00-16:00', 'Sunday: 10:00-16:00'],
      lv: ['Darba dienas: 09:00-19:00', 'Sestdiena: 10:00-16:00', 'Svētdiena: 10:00-16:00'],
    },
  },
  {
    id: 'plavnieki',
    city: { ru: "Рига", en: "Riga", lv: "Rīga" },
    name: { ru: 'Рига (Плявниеки)', en: 'Riga (Plavnieki)', lv: 'Rīga (Pļavnieki)' },
    address: {
      ru: 'Brāļu Kaudzīšu iela 13, Rīga, LV-1082, Latvija',
      en: 'Brāļu Kaudzīšu iela 13, Rīga, LV-1082, Latvija',
      lv: 'Brāļu Kaudzīšu iela 13, Rīga, LV-1082, Latvija',
    },
    phone: '+37127091811',
    geo: { latitude: 56.9402831, longitude: 24.2025771 },
    hours: {
      ru: ['Рабочие дни: с 09:00 до 19:00', 'Суббота: с 10:00 до 16:00', 'Воскресенье: с 10:00 до 16:00'],
      en: ['Weekdays: 09:00-19:00', 'Saturday: 10:00-16:00', 'Sunday: 10:00-16:00'],
      lv: ['Darba dienas: 09:00-19:00', 'Sestdiena: 10:00-16:00', 'Svētdiena: 10:00-16:00'],
    },
  },
  {
    id: 'daugavpils',
    city: { ru: "Даугавпилс", en: "Daugavpils", lv: "Daugavpils" },
    name: { ru: 'Даугавпилс', en: 'Daugavpils', lv: 'Daugavpils' },
    address: {
      ru: 'Viestura iela 68-2, Daugavpils, LV-5401, Latvija',
      en: 'Viestura iela 68-2, Daugavpils, LV-5401, Latvija',
      lv: 'Viestura iela 68-2, Daugavpils, LV-5401, Latvija',
    },
    phone: '+37125151630',
    geo: { latitude: 55.8726243, longitude: 26.5207536 },
    hours: {
      ru: ['Рабочие дни: с 09:00 до 19:00', 'Суббота: с 10:00 до 16:00', 'Воскресенье: с 10:00 до 16:00'],
      en: ['Weekdays: 09:00-19:00', 'Saturday: 10:00-16:00', 'Sunday: 10:00-16:00'],
      lv: ['Darba dienas: 09:00-19:00', 'Sestdiena: 10:00-16:00', 'Svētdiena: 10:00-16:00'],
    },
  },
  {
    id: 'liepaja',
    city: { ru: "Лиепая", en: "Liepaja", lv: "Liepāja" },
    name: { ru: 'Лиепая', en: 'Liepaja', lv: 'Liepāja' },
    address: {
      ru: 'Graudu iela 43N, Liepāja, LV-3401, Latvija',
      en: 'Graudu iela 43N, Liepāja, LV-3401, Latvija',
      lv: 'Graudu iela 43N, Liepāja, LV-3401, Latvija',
    },
    phone: '+37120043999',
    geo: { latitude: 56.50886, longitude: 21.00872 },
    hours: {
      ru: ['Рабочие дни: с 09:00 до 19:00', 'Суббота: с 10:00 до 16:00', 'Воскресенье: выходной'],
      en: ['Weekdays: 09:00-19:00', 'Saturday: 10:00-16:00', 'Sunday: closed'],
      lv: ['Darba dienas: 09:00-19:00', 'Sestdiena: 10:00-16:00', 'Svētdiena: slēgts'],
    },
  },
  {
    id: 'valmiera',
    city: { ru: "Валмиера", en: "Valmiera", lv: "Valmiera" },
    name: { ru: 'Валмиера', en: 'Valmiera', lv: 'Valmiera' },
    address: {
      ru: 'Stacijas iela 17, Valmiera, LV-4201, Latvija',
      en: 'Stacijas iela 17, Valmiera, LV-4201, Latvija',
      lv: 'Stacijas iela 17, Valmiera, LV-4201, Latvija',
    },
    phone: '+37125151629',
    geo: { latitude: 57.5302211, longitude: 25.4305242 },
    hours: {
      ru: ['Рабочие дни: с 09:00 до 19:00', 'Суббота: с 10:00 до 16:00', 'Воскресенье: выходной'],
      en: ['Weekdays: 09:00-19:00', 'Saturday: 10:00-16:00', 'Sunday: closed'],
      lv: ['Darba dienas: 09:00-19:00', 'Sestdiena: 10:00-16:00', 'Svētdiena: slēgts'],
    },
  },
  {
    id: 'rezekne',
    city: { ru: "Резекне", en: "Rezekne", lv: "Rēzekne" },
    name: { ru: 'Резекне', en: 'Rezekne', lv: 'Rēzekne' },
    address: {
      ru: 'Atbrīvošanas aleja 128, Rēzekne, LV-4601, Latvija',
      en: 'Atbrīvošanas aleja 128, Rēzekne, LV-4601, Latvija',
      lv: 'Atbrīvošanas aleja 128, Rēzekne, LV-4601, Latvija',
    },
    phone: '+37120125353',
    geo: { latitude: 56.5128169, longitude: 27.3349656 },
    hours: {
      ru: ['Рабочие дни: с 09:00 до 19:00', 'Суббота: с 10:00 до 16:00', 'Воскресенье: с 10:00 до 16:00'],
      en: ['Weekdays: 09:00-19:00', 'Saturday: 10:00-16:00', 'Sunday: 10:00-16:00'],
      lv: ['Darba dienas: 09:00-19:00', 'Sestdiena: 10:00-16:00', 'Svētdiena: 10:00-16:00'],
    },
  },
  {
    id: 'jelgava',
    city: { ru: "Елгава", en: "Jelgava", lv: "Jelgava" },
    name: { ru: 'Елгава', en: 'Jelgava', lv: 'Jelgava' },
    address: {
      ru: 'Katoļu iela 1A, Jelgava, LV-3001, Latvija',
      en: 'Katoļu iela 1A, Jelgava, LV-3001, Latvija',
      lv: 'Katoļu iela 1A, Jelgava, LV-3001, Latvija',
    },
    phone: '+37120125353',
    hours: {
      ru: ['Рабочие дни: с 09:00 до 19:00', 'Суббота: с 10:00 до 16:00', 'Воскресенье: выходной'],
      en: ['Weekdays: 09:00-19:00', 'Saturday: 10:00-16:00', 'Sunday: closed'],
      lv: ['Darba dienas: 09:00-19:00', 'Sestdiena: 10:00-16:00', 'Svētdiena: slēgts'],
    },
  },
];
