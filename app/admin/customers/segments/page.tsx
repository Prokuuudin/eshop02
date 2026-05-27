'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import AdminGate from '@/components/admin/AdminGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useOrders } from '@/lib/orders-store'

type Segment = 'VIP' | 'Постоянный' | 'Новый' | 'Неактивный'

interface CustomerRow {
  email: string
  firstName: string
  lastName: string
  totalOrders: number
  totalSpent: number
  lastOrderDate: Date | null
  segment: Segment
}

function getSegment(totalOrders: number, totalSpent: number, lastOrderDate: Date | null): Segment {
  const now = new Date()
  const daysSinceLast = lastOrderDate
    ? (now.getTime() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24)
    : Infinity

  if (totalSpent > 500) return 'VIP'
  if (totalOrders > 3) return 'Постоянный'
  if (daysSinceLast > 180 || totalOrders === 0) return 'Неактивный'
  return 'Новый'
}

const SEGMENT_COLORS: Record<Segment, string> = {
  VIP: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
  Постоянный: 'bg-blue-100 text-blue-800 border border-blue-300',
  Новый: 'bg-green-100 text-green-800 border border-green-300',
  Неактивный: 'bg-gray-100 text-gray-600 border border-gray-300',
}

const SEGMENT_CARD_COLORS: Record<Segment, string> = {
  VIP: 'bg-yellow-50 border-yellow-200',
  Постоянный: 'bg-blue-50 border-blue-200',
  Новый: 'bg-green-50 border-green-200',
  Неактивный: 'bg-gray-50 border-gray-200',
}

type FilterTab = 'Все' | Segment

export default function AdminCustomerSegmentsPage() {
  const orders = useOrders((s) => s.orders)
  const [activeTab, setActiveTab] = useState<FilterTab>('Все')
  const [search, setSearch] = useState('')

  const customers = useMemo<CustomerRow[]>(() => {
    const map = new Map<string, CustomerRow>()

    for (const order of orders) {
      const email = order.email
      if (!email) continue

      const existing = map.get(email)
      const orderDate = order.createdAt ? new Date(order.createdAt) : null

      if (!existing) {
        map.set(email, {
          email,
          firstName: order.firstName,
          lastName: order.lastName,
          totalOrders: 1,
          totalSpent: order.total ?? 0,
          lastOrderDate: orderDate,
          segment: 'Новый',
        })
      } else {
        existing.totalOrders += 1
        existing.totalSpent += order.total ?? 0
        if (orderDate && (!existing.lastOrderDate || orderDate > existing.lastOrderDate)) {
          existing.lastOrderDate = orderDate
          existing.firstName = order.firstName
          existing.lastName = order.lastName
        }
      }
    }

    return Array.from(map.values()).map((c) => ({
      ...c,
      segment: getSegment(c.totalOrders, c.totalSpent, c.lastOrderDate),
    }))
  }, [orders])

  const counts = useMemo(() => {
    const result: Record<Segment, number> = { VIP: 0, Постоянный: 0, Новый: 0, Неактивный: 0 }
    for (const c of customers) result[c.segment]++
    return result
  }, [customers])

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      if (activeTab !== 'Все' && c.segment !== activeTab) return false
      if (search && !c.email.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [customers, activeTab, search])

  const tabs: FilterTab[] = ['Все', 'VIP', 'Постоянный', 'Новый', 'Неактивный']

  return (
    <AdminGate>
      <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold">Сегменты и статусы клиентов</h1>
          <Button variant="outline" asChild>
            <Link href="/admin">← Назад в админку</Link>
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(['VIP', 'Постоянный', 'Новый', 'Неактивный'] as Segment[]).map((seg) => (
            <div
              key={seg}
              className={`rounded-lg border p-4 ${SEGMENT_CARD_COLORS[seg]}`}
            >
              <div className="text-2xl font-bold">{counts[seg]}</div>
              <div className="text-sm text-muted-foreground mt-1">{seg}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-1 flex-wrap">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                  activeTab === tab
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-foreground border-border hover:bg-muted'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <Input
            placeholder="Поиск по email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>

        {/* Table */}
        {customers.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 border rounded-lg">
            Нет данных о заказах. Клиенты появятся после первых заказов.
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 border rounded-lg">
            Клиенты не найдены по заданным фильтрам.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Имя</th>
                  <th className="text-right px-4 py-3 font-medium">Заказов</th>
                  <th className="text-right px-4 py-3 font-medium">Потрачено</th>
                  <th className="text-left px-4 py-3 font-medium">Последний заказ</th>
                  <th className="text-left px-4 py-3 font-medium">Сегмент</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((c) => (
                  <tr key={c.email} className="hover:bg-muted/30">
                    <td className="px-4 py-3">{c.email}</td>
                    <td className="px-4 py-3">
                      {c.firstName} {c.lastName}
                    </td>
                    <td className="px-4 py-3 text-right">{c.totalOrders}</td>
                    <td className="px-4 py-3 text-right">€{c.totalSpent.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      {c.lastOrderDate
                        ? c.lastOrderDate.toLocaleDateString('ru-RU')
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SEGMENT_COLORS[c.segment]}`}
                      >
                        {c.segment}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </AdminGate>
  )
}
