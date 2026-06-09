import type { ErpAdapter, ErpFetchResult } from '../erp-adapter'

export class RestPaginatedAdapter implements ErpAdapter {
  readonly name = 'rest-paginated'

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly pageSize = 100,
  ) {}

  async fetchPage(_cursor?: string | number): Promise<ErpFetchResult> {
    // TODO: implement when real ERP API format is known.
    // Replace this stub with actual HTTP fetch + ErpProduct mapping.
    throw new Error(
      'RestPaginatedAdapter.fetchPage: not implemented. Implement ErpProduct mapping for your ERP API.',
    )
  }
}
