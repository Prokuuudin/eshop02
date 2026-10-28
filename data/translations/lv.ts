import account from './lv/account'
import checkout from './lv/checkout'
import admin from './lv/admin'
import catalog from './lv/catalog'
import common from './lv/common'

const lv: Record<string, string> = {
  'launchNotice.title': "Laipni lūdzam Hairshop Pro!",
  'launchNotice.body': "Paldies par jūsu uzticību un sadarbību. Mēs turpinām attīstīt un pilnveidot mūsu interneta veikalu. Būsim pateicīgi par jūsu atsauksmēm un ieteikumiem — tie palīdzēs mums padarīt iepirkšanos Hairshop Pro vēl ērtāku jums.",
  'launchNotice.feedback': "Ieteikumi un atsauksmes:",
  'launchNotice.contact': "Rakstiet mums",
  'launchNotice.dontShowAgain': "Vairs nerādīt",
  'launchNotice.close': "Aizvērt paziņojumu",
  ...common,
  ...account,
  ...catalog,
  ...checkout,
  ...admin,
}

export default lv
