import account from './ru/account'
import checkout from './ru/checkout'
import admin from './ru/admin'
import catalog from './ru/catalog'
import common from './ru/common'

const ru: Record<string, string> = {
  ...common,
  ...account,
  ...catalog,
  ...checkout,
  ...admin,
}

export default ru
