# RegisterNoCardForm — Document Upload UX — Design Spec

**Date:** 2026-06-03  
**Status:** Approved

---

## Problem

Current upload zone has one button with no indication that camera capture is possible. Users on mobile don't know they can photograph a document directly.

## Solution

Split the upload zone into two explicit buttons when no file is selected:
- **Из галереи** — gallery/file picker
- **Сфотографировать** — direct camera capture

## Design

### Upload zone — no file selected

```
┌──────────────────────────────────────┐
│                                      │
│  [📁 Из галереи]  [📷 Сфотографировать] │
│                                      │
│         JPG, PNG, PDF                │
└──────────────────────────────────────┘
```

### Upload zone — file selected

Unchanged from current: filename + X clear button.

---

## Implementation

### Two hidden inputs

```tsx
<input
  key={`gallery-${fileKey}`}
  ref={galleryRef}
  type="file"
  accept="image/*,application/pdf"
  className="sr-only"
  onChange={(e) => setCertificate(e.target.files?.[0] ?? null)}
/>
<input
  key={`camera-${fileKey}`}
  ref={cameraRef}
  type="file"
  accept="image/*"
  capture="environment"
  className="sr-only"
  onChange={(e) => setCertificate(e.target.files?.[0] ?? null)}
/>
```

Replace existing single hidden input. Remove `required` from hidden inputs (validation handled in `handleSubmit` already).

### Two refs

Replace `fileInputRef` with:
```typescript
const galleryRef = useRef<HTMLInputElement>(null)
const cameraRef = useRef<HTMLInputElement>(null)
```

### Upload zone JSX (empty state)

```tsx
<div className="register-form__file-upload w-full rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-5 dark:border-gray-600 dark:bg-gray-800">
  <div className="flex gap-2 justify-center">
    <button
      type="button"
      onClick={() => galleryRef.current?.click()}
      className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:border-indigo-400 hover:text-indigo-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:border-indigo-500 transition-colors"
    >
      <Upload className="w-4 h-4" />
      {t('auth.uploadFromGallery')}
    </button>
    <button
      type="button"
      onClick={() => cameraRef.current?.click()}
      className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:border-indigo-400 hover:text-indigo-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:border-indigo-500 transition-colors"
    >
      <Camera className="w-4 h-4" />
      {t('auth.takePhoto')}
    </button>
  </div>
  <p className="mt-2 text-center text-xs text-gray-400 dark:text-gray-500">
    {t('auth.certificateFormats')}
  </p>
</div>
```

### New translation keys (ru/en/lv)

| Key | RU | EN | LV |
|-----|----|----|-----|
| `auth.uploadFromGallery` | Из галереи | From gallery | No galerijas |
| `auth.takePhoto` | Сфотографировать | Take photo | Uzņemt foto |

### Import Camera icon

Add `Camera` to lucide-react import:
```typescript
import { Upload, X, Camera } from 'lucide-react';
```

---

## Files Touched

| File | Change |
|------|--------|
| `components/auth/RegisterNoCardForm.tsx` | Two refs, two inputs, two buttons, Camera import |
| `data/translations.ts` | 2 new keys × 3 languages |
