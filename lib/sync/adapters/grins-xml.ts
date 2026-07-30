import type { ErpAdapter, ErpFetchResult } from '../erp-adapter'
import { getFtpsConfigFromEnv, downloadFtpsFile } from '../ftps-client'
import { saveSnapshot } from '../xml-snapshot-store'
import { parseGrinsXml } from '../grins-xml-parser'

export class GrinsXmlAdapter implements ErpAdapter {
  readonly name = 'grins-xml'

  async fetchPage(): Promise<ErpFetchResult> {
    const config = getFtpsConfigFromEnv()
    const xml = await downloadFtpsFile(config)
    await saveSnapshot(xml)
    const products = parseGrinsXml(xml)
    return { products, hasMore: false }
  }
}
