# RegisterNoCardForm — Gallery + Camera Upload Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single upload button in RegisterNoCardForm with two explicit buttons — "From gallery" and "Take photo" — so mobile users can photograph documents directly.

**Architecture:** Two hidden `<input type="file">` elements with separate refs — one without `capture` (gallery/PDF), one with `capture="environment"` (camera). Both share the same `setCertificate` handler. The upload zone shows both buttons when no file is selected, and the existing filename + clear UI when a file is selected.

**Tech Stack:** React 18, TypeScript, lucide-react (`Camera` icon), Next.js App Router.

---

## Files

| File | Change |
|------|--------|
| `data/translations.ts` | Add `auth.uploadFromGallery` + `auth.takePhoto` (ru/en/lv) |
| `components/auth/RegisterNoCardForm.tsx` | Two refs, two inputs, two buttons, Camera import |

---

### Task 1: Add translation keys

**Files:**
- Modify: `data/translations.ts`

- [ ] **Step 1: Add to `ru` block**

Find `'auth.certificateDropzone': 'Нажмите для загрузки файла',` (around line 699) and add after it:

```typescript
'auth.uploadFromGallery': 'Из галереи',
'auth.takePhoto': 'Сфотографировать',
```

- [ ] **Step 2: Add to `en` block**

Find `'auth.certificateDropzone': 'Click to upload a file',` (around line 2075) and add after it:

```typescript
'auth.uploadFromGallery': 'From gallery',
'auth.takePhoto': 'Take photo',
```

- [ ] **Step 3: Add to `lv` block**

Find `'auth.certificateDropzone': 'Noklikšķiniet, lai augšupielādētu failu',` (around line 3767) and add after it:

```typescript
'auth.uploadFromGallery': 'No galerijas',
'auth.takePhoto': 'Uzņemt foto',
```

- [ ] **Step 4: Commit**

```bash
git add data/translations.ts
git commit -m "feat: add gallery/camera upload translation keys"
```

---

### Task 2: Update RegisterNoCardForm

**Files:**
- Modify: `components/auth/RegisterNoCardForm.tsx`

- [ ] **Step 1: Add `Camera` to lucide-react import**

Current line 3:
```typescript
import { Upload, X } from 'lucide-react';
```
Change to:
```typescript
import { Upload, X, Camera } from 'lucide-react';
```

- [ ] **Step 2: Replace `fileInputRef` with two refs**

Current line 29:
```typescript
const fileInputRef = useRef<HTMLInputElement>(null);
```
Replace with:
```typescript
const galleryRef = useRef<HTMLInputElement>(null);
const cameraRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 3: Replace the hidden input + upload zone JSX**

Find this entire block (lines 142–193):
```tsx
<div className="register-form__field">
    <label className="register-form__label block mb-1 text-sm text-gray-900 dark:text-gray-100">
        {t('auth.certificate')}
    </label>
    <input
        key={fileKey}
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        onChange={(e) => setCertificate(e.target.files?.[0] ?? null)}
        required
    />
    <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className={`register-form__file-upload w-full flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-sm transition-colors ${
            certificate
                ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-600 dark:bg-indigo-950/30'
                : 'border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-indigo-500'
        }`}
    >
        {certificate ? (
            <div className="register-form__file-selected flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
                <Upload className="w-4 h-4 shrink-0" />
                <span className="register-form__file-name truncate max-w-[220px]">{certificate.name}</span>
                <span
                    role="button"
                    aria-label="Удалить файл"
                    className="register-form__file-clear ml-1 rounded-full p-0.5 hover:bg-indigo-200 dark:hover:bg-indigo-800"
                    onClick={(e) => {
                        e.stopPropagation();
                        setCertificate(null);
                        setFileKey((k) => k + 1);
                    }}
                >
                    <X className="w-3.5 h-3.5" />
                </span>
            </div>
        ) : (
            <>
                <Upload className="register-form__file-icon w-6 h-6 text-gray-400 dark:text-gray-500" />
                <span className="register-form__file-placeholder text-gray-500 dark:text-gray-400">
                    {t('auth.certificateDropzone')}
                </span>
                <span className="register-form__file-formats text-xs text-gray-400 dark:text-gray-500">
                    {t('auth.certificateFormats')}
                </span>
            </>
        )}
    </button>
</div>
```

Replace with:
```tsx
<div className="register-form__field">
    <label className="register-form__label block mb-1 text-sm text-gray-900 dark:text-gray-100">
        {t('auth.certificate')}
    </label>
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
    <div className={`register-form__file-upload w-full rounded-lg border-2 border-dashed px-4 py-4 transition-colors ${
        certificate
            ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-600 dark:bg-indigo-950/30'
            : 'border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800'
    }`}>
        {certificate ? (
            <div className="register-form__file-selected flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
                <Upload className="w-4 h-4 shrink-0" />
                <span className="register-form__file-name truncate max-w-[220px]">{certificate.name}</span>
                <span
                    role="button"
                    aria-label="Удалить файл"
                    className="register-form__file-clear ml-1 rounded-full p-0.5 hover:bg-indigo-200 dark:hover:bg-indigo-800"
                    onClick={() => {
                        setCertificate(null);
                        setFileKey((k) => k + 1);
                    }}
                >
                    <X className="w-3.5 h-3.5" />
                </span>
            </div>
        ) : (
            <>
                <div className="flex gap-2 justify-center">
                    <button
                        type="button"
                        onClick={() => galleryRef.current?.click()}
                        className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:border-indigo-400 hover:text-indigo-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:border-indigo-500 dark:hover:text-indigo-400 transition-colors"
                    >
                        <Upload className="w-4 h-4" />
                        {t('auth.uploadFromGallery')}
                    </button>
                    <button
                        type="button"
                        onClick={() => cameraRef.current?.click()}
                        className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:border-indigo-400 hover:text-indigo-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:border-indigo-500 dark:hover:text-indigo-400 transition-colors"
                    >
                        <Camera className="w-4 h-4" />
                        {t('auth.takePhoto')}
                    </button>
                </div>
                <p className="mt-2 text-center text-xs text-gray-400 dark:text-gray-500">
                    {t('auth.certificateFormats')}
                </p>
            </>
        )}
    </div>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add components/auth/RegisterNoCardForm.tsx
git commit -m "feat: gallery + camera upload buttons in no-card registration form"
```

---

## Self-Review

**Spec coverage:**
- ✅ Two hidden inputs with separate refs → Step 2+3
- ✅ Gallery input: `accept="image/*,application/pdf"`, no `capture` → Step 3
- ✅ Camera input: `accept="image/*"`, `capture="environment"` → Step 3
- ✅ Both share `setCertificate` handler → Step 3
- ✅ Empty state shows two buttons → Step 3
- ✅ Selected state unchanged (filename + X) → Step 3
- ✅ `Camera` icon from lucide-react → Step 1
- ✅ Translation keys ru/en/lv → Task 1
- ✅ `e.stopPropagation()` removed — no longer needed (clear button is inside a `<div>`, not a `<button>` that would trigger parent click)

**Placeholders:** None.

**Type consistency:** `galleryRef` / `cameraRef` both `useRef<HTMLInputElement>(null)` — `?.click()` is valid on `HTMLInputElement`. ✅
