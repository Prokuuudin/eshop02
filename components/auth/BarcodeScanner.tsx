'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

type DetectedBarcode = {
  rawValue?: string
}

type BarcodeDetectorInstance = {
  detect: (source: ImageBitmapSource) => Promise<DetectedBarcode[]>
}

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance

type BarcodeScannerProps = {
  onDetected: (value: string) => void
}

const getBarcodeDetector = (): BarcodeDetectorConstructor | undefined => {
  return (globalThis as typeof globalThis & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector
}

export default function BarcodeScanner({ onDetected }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<number | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [status, setStatus] = useState('')

  const stopScanner = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop()
      }
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setIsOpen(false)
    setIsStarting(false)
  }

  useEffect(() => {
    return () => {
      stopScanner()
    }
  }, [])

  const startScanner = async () => {
    const BarcodeDetectorApi = getBarcodeDetector()
    if (!BarcodeDetectorApi) {
      setStatus('Сканирование камерой не поддерживается в этом браузере')
      return
    }

    try {
      setIsStarting(true)
      setStatus('Запрашиваю доступ к камере...')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      })

      streamRef.current = stream
      setIsOpen(true)
      setStatus('Наведите камеру на баркод клиента')

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      const detector = new BarcodeDetectorApi({
        formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code']
      })

      intervalRef.current = window.setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return

        try {
          const barcodes = await detector.detect(videoRef.current)
          const value = barcodes.find((item) => item.rawValue?.trim())?.rawValue?.trim()
          if (!value) return

          onDetected(value)
          setStatus(`Баркод считан: ${value}`)
          stopScanner()
        } catch {
          setStatus('Не удалось распознать баркод. Попробуйте изменить угол камеры.')
        }
      }, 700)
    } catch {
      setStatus('Не удалось получить доступ к камере')
      stopScanner()
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {!isOpen ? (
          <Button type="button" variant="outline" onClick={() => void startScanner()} disabled={isStarting}>
            {isStarting ? 'Подключение к камере...' : 'Сканировать камерой'}
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={stopScanner}>
            Остановить сканер
          </Button>
        )}
      </div>

      {status && <p className="text-xs text-gray-600 dark:text-gray-300">{status}</p>}

      {isOpen && (
        <div className="overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700 bg-black">
          <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
        </div>
      )}
    </div>
  )
}