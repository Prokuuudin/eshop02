import type { MatchStatus, RecommendationStatus } from './constants'
import type {
  EvidenceExclusionReason,
  NoRecommendationReason,
  RecommendationActionMode,
} from './recommendation-engine'
import type { IsoDateTimeDto, PricingFreshnessState, SourceHealthState } from './application-contracts'

export type AdminPricingLanguage = 'ru' | 'en' | 'lv'
type LocalizedText = readonly [ru: string, en: string, lv: string]
export type AdminPresentation = { label: string; description: string }

const languageIndex: Record<AdminPricingLanguage, number> = { ru: 0, en: 1, lv: 2 }

function text(value: LocalizedText, language: AdminPricingLanguage): string {
  return value[languageIndex[language]]
}

function presentation(
  value: { label: LocalizedText; description: LocalizedText },
  language: AdminPricingLanguage,
): AdminPresentation {
  return { label: text(value.label, language), description: text(value.description, language) }
}

const noRecommendationReasons: Record<NoRecommendationReason, { label: LocalizedText; description: LocalizedText }> = {
  invalid_own_price: {
    label: ['Некорректная наша цена', 'Invalid current price', 'Nederīga pašreizējā cena'],
    description: ['Текущая цена товара не может участвовать в расчёте.', 'The current product price cannot be analysed.', 'Pašreizējo produkta cenu nevar analizēt.'],
  },
  invalid_policy: {
    label: ['Некорректные правила', 'Invalid pricing rules', 'Nederīgi cenu noteikumi'],
    description: ['Правила расчёта не прошли проверку.', 'Pricing rules did not pass validation.', 'Cenu noteikumi neizturēja validāciju.'],
  },
  no_trusted_mappings: {
    label: ['Нет подтверждённых сопоставлений', 'No trusted mappings', 'Nav apstiprinātu atbilstību'],
    description: ['Для расчёта нужны ручные или подтверждённые связи товаров.', 'Manual or confirmed product mappings are required.', 'Aprēķinam nepieciešamas manuālas vai apstiprinātas produktu atbilstības.'],
  },
  no_fresh_observations: {
    label: ['Нет свежих наблюдений', 'No fresh observations', 'Nav aktuālu novērojumu'],
    description: ['Подтверждённые цены устарели или имеют некорректное время.', 'Trusted prices are stale or have invalid timestamps.', 'Apstiprinātās cenas ir novecojušas vai ar nederīgu laiku.'],
  },
  no_available_competitors: {
    label: ['Нет доступных предложений', 'No available offers', 'Nav pieejamu piedāvājumu'],
    description: ['Подходящие товары конкурентов сейчас недоступны.', 'Eligible competitor products are currently unavailable.', 'Atbilstošie konkurentu produkti pašlaik nav pieejami.'],
  },
  conflicting_competitor_evidence: {
    label: ['Противоречивые данные источника', 'Conflicting source evidence', 'Pretrunīgi avota dati'],
    description: ['Один конкурент сообщает разные цены для одного сопоставления.', 'One competitor reports conflicting prices for the mapping.', 'Viens konkurents ziņo pretrunīgas cenas vienai atbilstībai.'],
  },
  all_observations_excluded: {
    label: ['Все наблюдения исключены', 'All observations excluded', 'Visi novērojumi izslēgti'],
    description: ['Ни одно наблюдение не прошло текущие правила качества.', 'No observation passed the current quality rules.', 'Neviens novērojums neatbilda pašreizējiem kvalitātes noteikumiem.'],
  },
  insufficient_competitors: {
    label: ['Недостаточно подтверждённых конкурентов', 'Not enough trusted competitors', 'Nepietiek apstiprinātu konkurentu'],
    description: ['Рыночных точек меньше установленного минимума.', 'There are fewer market points than the configured minimum.', 'Tirgus punktu skaits ir mazāks par noteikto minimumu.'],
  },
  no_change: {
    label: ['Изменение не требуется', 'No price change needed', 'Cenas maiņa nav nepieciešama'],
    description: ['Рассчитанная безопасная цена совпадает с текущей.', 'The calculated safe price equals the current price.', 'Aprēķinātā drošā cena sakrīt ar pašreizējo cenu.'],
  },
  difference_below_threshold: {
    label: ['Разница ниже порога', 'Difference below threshold', 'Starpība zem sliekšņa'],
    description: ['Изменение меньше минимального процента для рекомендации.', 'The change is below the minimum recommendation threshold.', 'Izmaiņa ir zem minimālā ieteikuma sliekšņa.'],
  },
  unsupported_currency_or_data: {
    label: ['Неподдерживаемые данные', 'Unsupported price data', 'Neatbalstīti cenu dati'],
    description: ['Валюта или формат цены не поддерживаются безопасным расчётом.', 'The currency or price format is not supported safely.', 'Valūtu vai cenas formātu nevar droši apstrādāt.'],
  },
}

const exclusionReasons: Record<EvidenceExclusionReason, { label: LocalizedText; description: LocalizedText }> = {
  untrusted_mapping: { label: ['Связь не подтверждена', 'Mapping not trusted', 'Atbilstība nav apstiprināta'], description: ['Кандидат требует решения человека.', 'The candidate requires human review.', 'Kandidātam nepieciešama cilvēka pārbaude.'] },
  unsupported_currency: { label: ['Другая валюта', 'Unsupported currency', 'Neatbalstīta valūta'], description: ['Расчёт v1 поддерживает только EUR.', 'Version 1 supports EUR only.', 'Pirmā versija atbalsta tikai EUR.'] },
  invalid_price: { label: ['Некорректная цена', 'Invalid price', 'Nederīga cena'], description: ['Цена отсутствует или не прошла строгую проверку.', 'The price is missing or failed strict validation.', 'Cena nav norādīta vai neizturēja stingru validāciju.'] },
  invalid_timestamp: { label: ['Некорректное время', 'Invalid timestamp', 'Nederīgs laiks'], description: ['Временная последовательность наблюдения нарушена.', 'The observation timestamp sequence is invalid.', 'Novērojuma laika secība nav derīga.'] },
  clock_anomaly: { label: ['Время из будущего', 'Clock anomaly', 'Pulksteņa anomālija'], description: ['Наблюдение отмечено временем позже серверного.', 'The observation is dated after server time.', 'Novērojuma laiks ir vēlāks par servera laiku.'] },
  stale_observation: { label: ['Наблюдение устарело', 'Stale observation', 'Novecojis novērojums'], description: ['Цена старше допустимого периода.', 'The price is older than the allowed age.', 'Cena ir vecāka par atļauto periodu.'] },
  source_blocked: { label: ['Источник заблокирован', 'Source blocked', 'Avots bloķēts'], description: ['Мониторинг остановлен политикой безопасности.', 'Monitoring was stopped by a safety policy.', 'Uzraudzību apturēja drošības politika.'] },
  source_inactive: { label: ['Источник неактивен', 'Source inactive', 'Avots nav aktīvs'], description: ['Источник или товар поставлен на паузу.', 'The source or product is paused.', 'Avots vai produkts ir apturēts.'] },
  source_error: { label: ['Ошибка источника', 'Source error', 'Avota kļūda'], description: ['Последняя проверка завершилась безопасно классифицированной ошибкой.', 'The latest check ended with a safely classified error.', 'Pēdējā pārbaude beidzās ar droši klasificētu kļūdu.'] },
  unavailable: { label: ['Нет в наличии', 'Unavailable', 'Nav pieejams'], description: ['Предложение отмечено как отсутствующее.', 'The offer is marked unavailable.', 'Piedāvājums atzīmēts kā nepieejams.'] },
  availability_not_allowed: { label: ['Статус наличия не подходит', 'Availability not eligible', 'Pieejamības statuss nav piemērots'], description: ['Текущие правила требуют подтверждённое наличие.', 'Current rules require confirmed availability.', 'Pašreizējie noteikumi prasa apstiprinātu pieejamību.'] },
  conflicting_competitor_evidence: { label: ['Цены конкурента расходятся', 'Competitor prices conflict', 'Konkurenta cenas atšķiras'], description: ['Все точки этого конкурента исключены до уточнения.', 'All points from this competitor are excluded pending review.', 'Visi šī konkurenta punkti ir izslēgti līdz pārbaudei.'] },
  outlier: { label: ['Статистический выброс', 'Statistical outlier', 'Statistisks izņēmums'], description: ['Цена находится за рассчитанной IQR-границей.', 'The price is outside the calculated IQR fence.', 'Cena atrodas ārpus aprēķinātās IQR robežas.'] },
}

const recommendationStatuses: Record<RecommendationStatus | 'not_persisted', LocalizedText> = {
  pending: ['Ожидает решения', 'Pending review', 'Gaida lēmumu'],
  ignored: ['Отклонена', 'Ignored', 'Ignorēts'],
  erp_pending: ['Ожидает ERP', 'Pending in ERP', 'Gaida ERP'],
  applied: ['Применена', 'Applied', 'Piemērots'],
  erp_applied: ['Применена в ERP', 'Applied in ERP', 'Piemērots ERP'],
  stale: ['Устарела', 'Stale', 'Novecojis'],
  not_persisted: ['Не сохранена', 'Not persisted', 'Nav saglabāts'],
}

const actionModes: Record<RecommendationActionMode, { label: LocalizedText; description: LocalizedText }> = {
  local_apply: { label: ['Применить', 'Apply', 'Piemērot'], description: ['Локальная цена; действие появится после подключения backend.', 'Local price; the action will be enabled after backend integration.', 'Lokāla cena; darbība būs pieejama pēc backend integrācijas.'] },
  erp_required: { label: ['Передать в ERP', 'Send to ERP', 'Nosūtīt uz ERP'], description: ['Цена управляется ERP и не меняется напрямую.', 'The price is ERP-owned and cannot be changed directly.', 'Cenu pārvalda ERP, un to nevar mainīt tieši.'] },
  apply_blocked: { label: ['Применение недоступно', 'Apply unavailable', 'Piemērošana nav pieejama'], description: ['Состояние товара запрещает безопасное изменение цены.', 'The product state prevents a safe price update.', 'Produkta stāvoklis neļauj droši mainīt cenu.'] },
}

const sourceHealth: Record<SourceHealthState, { label: LocalizedText; description: LocalizedText }> = {
  ok: { label: ['OK', 'OK', 'OK'], description: ['Последняя проверка успешна.', 'The latest check succeeded.', 'Pēdējā pārbaude bija veiksmīga.'] },
  stale: { label: ['Устарел', 'Stale', 'Novecojis'], description: ['Источник давно не подтверждал данные.', 'The source has not confirmed data recently.', 'Avots ilgi nav apstiprinājis datus.'] },
  transient_error: { label: ['Временная ошибка', 'Transient error', 'Pagaidu kļūda'], description: ['Проверку можно безопасно повторить позднее.', 'The check can be retried safely later.', 'Pārbaudi vēlāk var droši atkārtot.'] },
  rate_limited: { label: ['Лимит запросов', 'Rate limited', 'Pieprasījumu limits'], description: ['Источник временно ограничил частоту запросов.', 'The source temporarily limited request frequency.', 'Avots īslaicīgi ierobežoja pieprasījumu biežumu.'] },
  blocked: { label: ['Заблокирован', 'Blocked', 'Bloķēts'], description: ['Мониторинг остановлен до ручной проверки.', 'Monitoring is stopped pending manual review.', 'Uzraudzība apturēta līdz manuālai pārbaudei.'] },
  disabled: { label: ['Выключен', 'Disabled', 'Izslēgts'], description: ['Мониторинг источника отключён администратором.', 'Source monitoring is disabled by an administrator.', 'Avota uzraudzību administrators ir izslēdzis.'] },
}

const freshnessStates: Record<PricingFreshnessState, LocalizedText> = {
  fresh: ['Свежие данные', 'Fresh data', 'Aktuāli dati'],
  stale: ['Данные устарели', 'Stale data', 'Novecojuši dati'],
  problem: ['Требует внимания', 'Needs attention', 'Nepieciešama uzmanība'],
  unavailable: ['Нет данных', 'No data', 'Nav datu'],
}

const mappingStatuses: Record<MatchStatus, LocalizedText> = {
  confirmed: ['Подтверждено', 'Confirmed', 'Apstiprināts'],
  manual: ['Связано вручную', 'Manually mapped', 'Piesaistīts manuāli'],
  likely: ['Кандидат', 'Candidate', 'Kandidāts'],
  ambiguous: ['Неоднозначно', 'Ambiguous', 'Neskaidrs'],
  rejected: ['Отклонено', 'Rejected', 'Noraidīts'],
}

export function getNoRecommendationPresentation(code: NoRecommendationReason, language: AdminPricingLanguage): AdminPresentation {
  return presentation(noRecommendationReasons[code], language)
}

export function getEvidenceExclusionPresentation(code: EvidenceExclusionReason, language: AdminPricingLanguage): AdminPresentation {
  return presentation(exclusionReasons[code], language)
}

export function getRecommendationStatusLabel(code: RecommendationStatus | 'not_persisted', language: AdminPricingLanguage): string {
  return text(recommendationStatuses[code], language)
}

export function getRecommendationActionPresentation(code: RecommendationActionMode, language: AdminPricingLanguage): AdminPresentation {
  return presentation(actionModes[code], language)
}

export function getSourceHealthPresentation(code: SourceHealthState, language: AdminPricingLanguage): AdminPresentation {
  return presentation(sourceHealth[code], language)
}

export function getFreshnessLabel(code: PricingFreshnessState, language: AdminPricingLanguage): string {
  return text(freshnessStates[code], language)
}

export function getMappingStatusLabel(code: MatchStatus, language: AdminPricingLanguage): string {
  return text(mappingStatuses[code], language)
}

function groupedInteger(value: number, language: AdminPricingLanguage): string {
  const separator = language === 'en' ? ',' : '\u00a0'
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, separator)
}

/** Formats integer cents without converting money to a floating-point major-unit value. */
export function formatEuroCents(cents: number, language: AdminPricingLanguage, showPlus = false): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError('Money must be integer cents')
  const negative = cents < 0
  const absolute = Math.abs(cents)
  const major = Math.floor(absolute / 100)
  const minor = String(absolute % 100).padStart(2, '0')
  const sign = negative ? '-' : showPlus && cents > 0 ? '+' : ''
  const amount = `${groupedInteger(major, language)}${language === 'en' ? '.' : ','}${minor}`
  return language === 'en' ? `${sign}€${amount}` : `${sign}${amount}\u00a0€`
}

export function formatBasisPoints(basisPoints: number, language: AdminPricingLanguage, showPlus = false): string {
  if (!Number.isSafeInteger(basisPoints)) throw new RangeError('Percent must be integer basis points')
  const negative = basisPoints < 0
  const absolute = Math.abs(basisPoints)
  const major = Math.floor(absolute / 100)
  const minor = String(absolute % 100).padStart(2, '0')
  const sign = negative ? '-' : showPlus && basisPoints > 0 ? '+' : ''
  return `${sign}${major}${language === 'en' ? '.' : ','}${minor}%`
}

export function formatIsoDateTime(value: IsoDateTimeDto, language: AdminPricingLanguage): string {
  const locale = language === 'ru' ? 'ru-RU' : language === 'lv' ? 'lv-LV' : 'en-GB'
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Riga',
  }).format(new Date(value))
}

function buildAdminPricingCopy(language: AdminPricingLanguage) {
  const l = (value: LocalizedText): string => text(value, language)
  return {
    title: l(['Мониторинг цен', 'Competitor pricing', 'Konkurentu cenu uzraudzība']),
    description: l(['Объяснимые рекомендации на основе подтверждённых источников.', 'Explainable recommendations from trusted sources.', 'Izskaidrojami ieteikumi no apstiprinātiem avotiem.']),
    statusTitle: l(['Подключение данных ещё не завершено', 'Data connection is not enabled yet', 'Datu savienojums vēl nav iespējots']),
    statusDescription: l(['Интерфейс подготовлен, но реальные данные мониторинга и действия пока недоступны.', 'The interface is ready, but live monitoring data and actions are not available yet.', 'Saskarne ir sagatavota, bet reālie uzraudzības dati un darbības vēl nav pieejami.']),
    noFakeData: l(['Показатели не заполняются демонстрационными значениями.', 'Metrics are not filled with demonstration values.', 'Rādītāji netiek aizpildīti ar demonstrācijas vērtībām.']),
    summaryTitle: l(['Сводка', 'Overview', 'Kopsavilkums']),
    productsTitle: l(['Рекомендации по товарам', 'Product recommendations', 'Produktu ieteikumi']),
    sourcesTitle: l(['Состояние источников', 'Source health', 'Avotu stāvoklis']),
    mappingsTitle: l(['Сопоставления', 'Mappings', 'Atbilstības']),
    productsDescription: l(['Наша цена, рынок и подготовленные рекомендации.', 'Current prices, market context, and prepared recommendations.', 'Pašreizējās cenas, tirgus konteksts un sagatavotie ieteikumi.']),
    sourcesDescription: l(['Безопасные операционные статусы без сетевых и секретных данных.', 'Safe operational states without network or secret details.', 'Droši darbības statusi bez tīkla vai slepeniem datiem.']),
    mappingsDescription: l(['Кандидаты требуют понятного обоснования и решения человека.', 'Candidates require clear evidence and human review.', 'Kandidātiem nepieciešams skaidrs pamatojums un cilvēka pārbaude.']),
    futureSection: l(['Будущий раздел', 'Future section', 'Nākamā sadaļa']),
    unavailableValue: '—',
    summaryLabels: {
      monitoredCompetitors: l(['Активные конкуренты', 'Monitored competitors', 'Uzraudzītie konkurenti']),
      trackedCompetitorProducts: l(['Товары конкурентов', 'Tracked competitor products', 'Uzraudzītie konkurentu produkti']),
      trustedMappings: l(['Подтверждённые связи', 'Trusted mappings', 'Apstiprinātās atbilstības']),
      mappingsPendingReview: l(['На ручной проверке', 'Pending manual review', 'Gaida manuālu pārbaudi']),
      freshObservations: l(['Свежие наблюдения', 'Fresh observations', 'Aktuālie novērojumi']),
      staleOrProblemSources: l(['Проблемные источники', 'Stale or problem sources', 'Novecojuši vai problemātiski avoti']),
      pendingRecommendations: l(['Ожидают решения', 'Pending recommendations', 'Ieteikumi gaida lēmumu']),
      erpPendingRecommendations: l(['Ожидают ERP', 'ERP-pending recommendations', 'Ieteikumi gaida ERP']),
    },
    table: {
      caption: l(['Таблица рекомендаций цен товаров', 'Product pricing recommendations', 'Produktu cenu ieteikumi']),
      product: l(['Товар', 'Product', 'Produkts']),
      currentPrice: l(['Наша цена', 'Our price', 'Mūsu cena']),
      market: l(['Рынок', 'Market', 'Tirgus']),
      competitors: l(['Конкуренты', 'Competitors', 'Konkurenti']),
      recommendation: l(['Рекомендация', 'Recommendation', 'Ieteikums']),
      status: l(['Статус', 'Status', 'Statuss']),
      action: l(['Действие', 'Action', 'Darbība']),
      median: l(['Медиана', 'Median', 'Mediāna']),
      minimum: l(['Минимум', 'Minimum', 'Minimums']),
      emptyTitle: l(['Данные о товарах пока не подключены', 'Product pricing data is not connected yet', 'Produktu cenu dati vēl nav pievienoti']),
      emptyDescription: l(['После подключения backend здесь появятся только реальные расчёты.', 'Only real calculations will appear here after backend integration.', 'Pēc backend integrācijas šeit parādīsies tikai reāli aprēķini.']),
      actionPreview: l(['Предпросмотр действия — без изменения цены', 'Action preview — no price change', 'Darbības priekšskatījums — cena netiek mainīta']),
    },
    sourceTable: {
      caption: l(['Состояние источников конкурентов', 'Competitor source health', 'Konkurentu avotu stāvoklis']),
      source: l(['Источник', 'Source', 'Avots']),
      health: l(['Состояние', 'Health', 'Stāvoklis']),
      lastCheck: l(['Последняя проверка', 'Last check', 'Pēdējā pārbaude']),
      failures: l(['Ошибки подряд', 'Consecutive failures', 'Secīgās kļūdas']),
      empty: l(['Источники ещё не подключены.', 'No sources are connected yet.', 'Avoti vēl nav pievienoti.']),
    },
  }
}

export type AdminPricingCopy = ReturnType<typeof buildAdminPricingCopy>

export function getAdminPricingCopy(language: AdminPricingLanguage): AdminPricingCopy {
  return buildAdminPricingCopy(language)
}
