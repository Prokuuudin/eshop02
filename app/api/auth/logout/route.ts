import { NextRequest, NextResponse } from 'next/server'
import { deleteSession, SESSION_COOKIE } from '@/lib/server-auth'

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (token) await deleteSession(token)

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
