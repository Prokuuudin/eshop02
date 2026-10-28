import account from './en/account'
import checkout from './en/checkout'
import admin from './en/admin'
import catalog from './en/catalog'
import common from './en/common'

const en: Record<string, string> = {
  'launchNotice.title': "Welcome to Hairshop Pro!",
  'launchNotice.body': "Thank you for your trust and cooperation. We continue to develop and improve our online store. We would appreciate your feedback and suggestions — they will help us make Hairshop Pro even more convenient for you.",
  'launchNotice.feedback': "Feedback and suggestions:",
  'launchNotice.contact': "Contact us",
  'launchNotice.dontShowAgain': "Don't show again",
  'launchNotice.close': "Close notification",
  ...common,
  ...account,
  ...catalog,
  ...checkout,
  ...admin,
}

export default en
