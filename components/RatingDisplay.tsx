'use client'
import React from 'react'

type RatingDisplayProps = {
  rating: number
  count?: number
  showLabel?: boolean
}

export default function RatingDisplay({ rating, count, showLabel = true }: RatingDisplayProps) {
  const filledStars = Math.round(rating)

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className={`text-lg ${i < filledStars ? 'text-yellow-400' : 'text-gray-300'}`}>
            ★
          </span>
        ))}
      </div>
      {showLabel && (
        <span className="text-sm text-gray-600">
          {rating.toFixed(1)} {count && `(${count})`}
        </span>
      )}
    </div>
  )
}
