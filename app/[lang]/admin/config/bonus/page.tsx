import { redirect } from 'next/navigation'

export default function AdminConfigBonusRedirect(): React.ReactElement {
  redirect('/admin/bonus')
}
