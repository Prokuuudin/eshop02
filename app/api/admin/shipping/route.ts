import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export const runtime = 'nodejs'

const SETTINGS_PATH = path.join(process.cwd(), 'data', 'shipping-settings.json')

export async function GET() {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, 'utf-8')
    const data: unknown = JSON.parse(raw)
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'failed_to_read_settings' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body: unknown = await request.json()
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(body, null, 2), 'utf-8')
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'failed_to_save_settings' }, { status: 500 })
  }
}
