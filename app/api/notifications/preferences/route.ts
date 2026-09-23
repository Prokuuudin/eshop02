import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export const runtime = 'nodejs'

const CHANNELS = ['app', 'email', 'both'] as const
type NotificationChannel = typeof CHANNELS[number]

function isChannel(value: unknown): value is NotificationChannel {
  return typeof value === 'string' && (CHANNELS as readonly string[]).includes(value)
}

export async function GET(): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const settings = await prisma.user.findUnique({
      where: { id: user.id },
      select: { notificationChannel: true, notificationsSubscribed: true },
    })
    return NextResponse.json({ channel: isChannel(settings?.notificationChannel) ? settings.notificationChannel : 'app', subscribed: settings?.notificationsSubscribed === true })
  } catch (error) {
    logApiError('[notifications/preferences GET]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null) as { channel?: unknown; subscribed?: unknown } | null
    const hasChannel = body?.channel !== undefined
    const hasSubscribed = body?.subscribed !== undefined
    if ((!hasChannel && !hasSubscribed) || (hasChannel && !isChannel(body?.channel)) || (hasSubscribed && typeof body?.subscribed !== 'boolean')) {
      return NextResponse.json({ error: 'invalid_preferences' }, { status: 400 })
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(hasChannel ? { notificationChannel: body?.channel as NotificationChannel } : {}),
        ...(hasSubscribed ? { notificationsSubscribed: body?.subscribed as boolean } : {}),
      },
      select: { notificationChannel: true, notificationsSubscribed: true },
    })
    return NextResponse.json({ channel: updated.notificationChannel, subscribed: updated.notificationsSubscribed })
  } catch (error) {
    logApiError('[notifications/preferences PATCH]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
