import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { saveOrderPaymentStatus } from '@/lib/stripe-payment-store'

export const runtime = 'nodejs'

type CheckoutItem = {
  id: string
  title: string
  quantity: number
  price: number
}

const toCents = (amount: number) => Math.max(0, Math.round(amount * 100))

const resolveBaseUrl = (req: NextRequest): string => {
  const origin = req.headers.get('origin')
  if (origin) return origin

  const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
  const protocol = req.headers.get('x-forwarded-proto') || 'http'
  return host ? `${protocol}://${host}` : 'http://localhost:3000'
}

export async function POST(req: NextRequest) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json({ error: 'STRIPE_SECRET_KEY is not configured' }, { status: 500 })
    }

    const stripe = new Stripe(secretKey)
    const body = await req.json()

    const { orderId, email, items, grandTotal } = body as {
      orderId?: string
      email?: string
      items?: CheckoutItem[]
      grandTotal?: number
    }

    if (!orderId || !Array.isArray(items) || items.length === 0 || !grandTotal) {
      return NextResponse.json({ error: 'Invalid checkout payload' }, { status: 400 })
    }

    const baseUrl = resolveBaseUrl(req)

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: items.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: 'eur',
          unit_amount: toCents(item.price),
          product_data: {
            name: item.title
          }
        }
      })),
      metadata: {
        orderId
      },
      success_url: `${baseUrl}/order/${orderId}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/order/${orderId}?payment=cancelled`
    })

    await saveOrderPaymentStatus({
      orderId,
      paymentStatus: 'pending',
      sessionId: session.id,
      paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
      customerEmail: email
    })

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
      amountExpected: toCents(grandTotal)
    })
  } catch (error) {
    console.error('Stripe checkout session error:', error)
    return NextResponse.json({ error: 'Failed to initialize payment session' }, { status: 500 })
  }
}
