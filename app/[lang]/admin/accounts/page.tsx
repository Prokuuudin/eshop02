import { redirect } from 'next/navigation'

export default function AdminAccountsPage(): never {
  redirect('/admin/client-barcodes')
}
