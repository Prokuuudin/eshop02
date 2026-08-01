import account from './en/account'
import checkout from './en/checkout'
import admin from './en/admin'
import catalog from './en/catalog'
import common from './en/common'

const en: Record<string, string> = {
  ...common,
  ...account,
  ...catalog,
  ...checkout,
  ...admin,
}

export default en
