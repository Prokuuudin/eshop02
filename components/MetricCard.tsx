'use client'

import React from 'react'
import { Card } from '@/components/ui/card'
import { useTranslation } from '@/lib/use-translation'

interface MetricCardProps {
  label: string
  value: string | number
  icon?: React.ReactNode
  trend?: {
    value: number
    isPositive: boolean
  }
  helpText?: string
}

export default function MetricCard({
  label,
  value,
  icon,
  trend,
  helpText
}: MetricCardProps) {
  return (
    <Card className="p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {label}
          </p>
          <div className="flex items-baseline gap-2 mt-2">
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {value}
            </p>
            {trend && (
              <span className={`text-sm font-semibold ${
                trend.isPositive 
                  ? 'text-green-600 dark:text-green-400' 
                  : 'text-red-600 dark:text-red-400'
              }`}>
                {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
              </span>
            )}
          </div>
          {helpText && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {helpText}
            </p>
          )}
        </div>
        {icon && (
          <div className="ml-4 text-gray-400 dark:text-gray-600 text-2xl">
            {icon}
          </div>
        )}
      </div>
    </Card>
  )
}
