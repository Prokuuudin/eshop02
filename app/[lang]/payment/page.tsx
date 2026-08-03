import DeliveryPaymentContent from '@/app/[lang]/delivery-payment/page'

export default async function PaymentPage({ params }: { params: Promise<{ lang: string }> }): Promise<React.ReactElement> {
  const { lang } = await params
  return <DeliveryPaymentContent params={Promise.resolve({ lang, section: 'payment' })} />
}
