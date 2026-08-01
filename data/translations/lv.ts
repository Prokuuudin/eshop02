import account from './lv/account'
import checkout from './lv/checkout'
import admin from './lv/admin'
import catalog from './lv/catalog'
import common from './lv/common'

const lv: Record<string, string> = {
  ...common,
  ...account,
  ...catalog,
  ...checkout,
  ...admin,
}

export default lv
