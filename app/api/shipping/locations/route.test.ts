import { expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

it('returns only the requested carrier and country lockers', async () => {
  const response = GET(new NextRequest('http://localhost/api/shipping/locations?method=unisend&country=EE'))
  const { locations } = await response.json()
  expect(locations).toHaveLength(306)
  expect(locations.every((location: { provider: string; country: string; type: string }) => location.provider === 'unisend' && location.country === 'EE' && location.type === 'locker')).toBe(true)
})

it('maps the checkout post method to official Omniva lockers', async () => {
  const response = GET(new NextRequest('http://localhost/api/shipping/locations?method=post&country=LV'))
  const { locations } = await response.json()
  expect(locations.length).toBeGreaterThan(300)
  expect(locations.every((location: { provider: string; country: string }) => location.provider === 'omniva' && location.country === 'LV')).toBe(true)
})

it('rejects unsupported carrier and country queries', () => {
  expect(GET(new NextRequest('http://localhost/api/shipping/locations?method=dpd&country=LV')).status).toBe(400)
  expect(GET(new NextRequest('http://localhost/api/shipping/locations?method=unisend&country=DE')).status).toBe(400)
})
