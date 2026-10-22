import account from './ru/account'
import checkout from './ru/checkout'
import admin from './ru/admin'
import catalog from './ru/catalog'
import common from './ru/common'

const ru: Record<string, string> = {
  'launchNotice.title': "Добро пожаловать в Hairshop Pro!",
  'launchNotice.body': "Благодарим вас за доверие и сотрудничество. Мы продолжаем развивать и совершенствовать наш интернет-магазин. Будем признательны за ваши замечания и предложения — они помогут нам сделать Hairshop Pro ещё удобнее для вас.",
  'launchNotice.feedback': "Замечания и предложения:",
  'launchNotice.contact': "Написать нам",
  'launchNotice.dontShowAgain': "Больше не показывать",
  'launchNotice.close': "Закрыть уведомление",
  ...common,
  ...account,
  ...catalog,
  ...checkout,
  ...admin,
}

export default ru
