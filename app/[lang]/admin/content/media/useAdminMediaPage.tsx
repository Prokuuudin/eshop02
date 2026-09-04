'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { reportAdminPartial } from '@/lib/admin-ui-errors';
import { useAdminConfirm } from '@/components/admin/AdminConfirmProvider';
import { useAdminLocale } from '@/lib/use-admin-locale';
import { usePersistentViewMode } from '@/hooks/usePersistentViewMode';

// ─── Types ────────────────────────────────────────────────────────────────────

type MediaFile = {
    name: string;
    path: string;
    size: number;
    isImage: boolean;
    ext: string;
    createdAt: string;
    modifiedAt: string;
};

type SortKey = 'date' | 'name' | 'size';
type ViewMode = 'grid' | 'list';
type FilterType = 'all' | 'image' | 'other';
const MEDIA_VIEW_MODES = ['grid', 'list'] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Component ────────────────────────────────────────────────────────────────

function useAdminMediaPageState() {
    const confirmAction = useAdminConfirm();
    const { l } = useAdminLocale();
    const [files, setFiles] = useState<MediaFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [replacing, setReplacing] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<FilterType>('all');
    const [sort, setSort] = useState<SortKey>('date');
    const [view, setView] = usePersistentViewMode<ViewMode>('admin:media:viewMode', 'grid', MEDIA_VIEW_MODES);

    const [selected, setSelected] = useState<MediaFile | null>(null);
    const [checkedNames, setCheckedNames] = useState<Set<string>>(new Set());
    const [copied, setCopied] = useState<string | null>(null);

    // Usage: filePath → list of product titles that use it
    const [usageMap, setUsageMap] = useState<Map<string, string[]>>(new Map());

    const fileInputRef = useRef<HTMLInputElement>(null);
    const replaceInputRef = useRef<HTMLInputElement>(null);

    const showMsg = (text: string, error = false) => {
        setMessage({ text, error });
        setTimeout(() => setMessage(null), 4000);
    };

    // ── Load media files ────────────────────────────────────────────────────────

    const loadFiles = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/media', { cache: 'no-store' });
            if (!res.ok) throw new Error();
            const data = (await res.json()) as { files: MediaFile[] };
            setFiles(data.files);
        } catch {
            showMsg(l('Не удалось загрузить файлы.', 'Failed to load files.', 'Neizdevās ielādēt failus.'), true);
        } finally {
            setLoading(false);
        }
    }, [l]);

    useEffect(() => {
        let cancelled = false;
        queueMicrotask(() => {
            if (!cancelled) void loadFiles();
        });
        return () => {
            cancelled = true;
        };
    }, [loadFiles]);

    // ── Load product usage ──────────────────────────────────────────────────────

    useEffect(() => {
        fetch('/api/admin/products')
            .then((r) => r.json())
            .then((data: { data?: { products?: Record<string, unknown>[] } }) => {
                const products = data.data?.products ?? [];
                const map = new Map<string, string[]>();
                products.forEach((p) => {
                    const title = String(p.title ?? p.id ?? '');
                    const paths: string[] = [];
                    if (p.image) paths.push(String(p.image));
                    if (Array.isArray(p.images)) p.images.forEach((img) => paths.push(String(img)));
                    paths.forEach((imgPath) => {
                        if (!map.has(imgPath)) map.set(imgPath, []);
                        map.get(imgPath)!.push(title);
                    });
                });
                setUsageMap(map);
            })
            .catch(() => reportAdminPartial(l('Файлы загружены, но сведения об их использовании в товарах недоступны.', 'Files loaded, but product usage information is unavailable.', 'Faili ielādēti, bet informācija par to izmantošanu produktos nav pieejama.'), l('Медиатека', 'Media library', 'Mediju bibliotēka')));
    }, [l]);

    // ── Derived: filtered + sorted ──────────────────────────────────────────────

    const displayed = useMemo(() => {
        const q = search.toLowerCase();
        return files
            .filter((f) => {
                if (q && !f.name.toLowerCase().includes(q)) return false;
                if (filter === 'image' && !f.isImage) return false;
                if (filter === 'other' && f.isImage) return false;
                return true;
            })
            .sort((a, b) => {
                if (sort === 'name') return a.name.localeCompare(b.name);
                if (sort === 'size') return b.size - a.size;
                return new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime();
            });
    }, [files, search, filter, sort]);

    const isAllChecked = displayed.length > 0 && displayed.every((f) => checkedNames.has(f.name));
    const isSomeChecked = displayed.some((f) => checkedNames.has(f.name));

    const toggleCheck = (name: string) => {
        setCheckedNames((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    };

    const toggleAll = () => {
        if (isAllChecked) {
            setCheckedNames(new Set());
        } else {
            setCheckedNames(new Set(displayed.map((f) => f.name)));
        }
    };

    // ── Upload ──────────────────────────────────────────────────────────────────

    const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const picked = Array.from(e.target.files ?? []);
        if (!picked.length) return;
        setUploading(true);
        let ok = 0,
            fail = 0;
        for (const file of picked) {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch('/api/admin/content/upload', { method: 'POST', body: fd });
            if (res.ok) {
                ok++;
            } else {
                fail++;
            }
        }
        e.target.value = '';
        setUploading(false);
        showMsg(
            fail === 0 ? l(`Загружено: ${ok}`, `Uploaded: ${ok}`, `Augšupielādēti: ${ok}`) : l(`Загружено: ${ok}, ошибок: ${fail}`, `Uploaded: ${ok}, errors: ${fail}`, `Augšupielādēti: ${ok}, kļūdas: ${fail}`),
            fail > 0 && ok === 0
        );
        await loadFiles();
    };

    // ── Replace ─────────────────────────────────────────────────────────────────

    const onReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!selected) return;
        const file = e.target.files?.[0];
        if (!file) return;
        setReplacing(true);
        try {
            const fd = new FormData();
            fd.append('name', selected.name);
            fd.append('file', file);
            const res = await fetch('/api/admin/media/replace', { method: 'POST', body: fd });
            if (!res.ok) throw new Error();
            showMsg(l(`Файл «${selected.name}» заменён. Все ссылки на него обновлены автоматически.`, `File “${selected.name}” replaced. All references were updated automatically.`, `Fails “${selected.name}” aizstāts. Visas atsauces atjauninātas automātiski.`));
            await loadFiles();
        } catch {
            showMsg(l('Не удалось заменить файл.', 'Failed to replace file.', 'Neizdevās aizstāt failu.'), true);
        } finally {
            setReplacing(false);
            e.target.value = '';
        }
    };

    // ── Delete single ───────────────────────────────────────────────────────────

    const onDelete = async (file: MediaFile) => {
        const decision = await confirmAction({ title: l(`Удалить «${file.name}»?`, `Delete “${file.name}”?`, `Dzēst “${file.name}”?`), description: l('Файл будет удалён безвозвратно. Если он используется в товарах, ссылки на него перестанут работать.', 'The file will be deleted permanently. Product references to it will stop working.', 'Fails tiks neatgriezeniski dzēsts. Atsauces uz to produktos vairs nedarbosies.'), affected: [file.name, ...(usageMap.get(file.path) ?? []).map((title) => `${l('Товар', 'Product', 'Produkts')}: ${title}`)], confirmText: file.name, destructive: true });
        if (!decision.confirmed) return;
        const res = await fetch('/api/admin/media', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ names: [file.name] }),
        });
        if (res.ok) {
            if (selected?.name === file.name) setSelected(null);
            showMsg(l(`Файл «${file.name}» удалён.`, `File “${file.name}” deleted.`, `Fails “${file.name}” dzēsts.`));
            await loadFiles();
        } else {
            showMsg(l('Не удалось удалить файл.', 'Failed to delete file.', 'Neizdevās dzēst failu.'), true);
        }
    };

    // ── Bulk delete ─────────────────────────────────────────────────────────────

    const onBulkDelete = async () => {
        const names = Array.from(checkedNames);
        if (!names.length) return;
        const decision = await confirmAction({ title: l(`Удалить ${names.length} файлов?`, `Delete ${names.length} files?`, `Dzēst ${names.length} failus?`), description: l('Файлы будут удалены безвозвратно. Связанные изображения в товарах перестанут работать.', 'Files will be deleted permanently. Related product images will stop working.', 'Faili tiks neatgriezeniski dzēsti. Saistītie produktu attēli vairs nedarbosies.'), affected: names, confirmText: l('УДАЛИТЬ', 'DELETE', 'DZĒST'), destructive: true });
        if (!decision.confirmed) return;
        setBulkDeleting(true);
        try {
            const res = await fetch('/api/admin/media', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ names }),
            });
            const data = (await res.json()) as { deleted: number; errors: string[] };
            setCheckedNames(new Set());
            if (selected && names.includes(selected.name)) setSelected(null);
            showMsg(
                l(`Удалено: ${data.deleted}${data.errors.length ? `, ошибок: ${data.errors.length}` : ''}`, `Deleted: ${data.deleted}${data.errors.length ? `, errors: ${data.errors.length}` : ''}`, `Dzēsti: ${data.deleted}${data.errors.length ? `, kļūdas: ${data.errors.length}` : ''}`)
            );
            await loadFiles();
        } catch {
            showMsg(l('Ошибка при удалении.', 'Deletion failed.', 'Dzēšanas kļūda.'), true);
        } finally {
            setBulkDeleting(false);
        }
    };

    // ── Stats ───────────────────────────────────────────────────────────────────

    const totalSize = files.reduce((s, f) => s + f.size, 0);
    const imgCount = files.filter((f) => f.isImage).length;

    // ── Render ──────────────────────────────────────────────────────────────────

    return {
        files,
        setFiles,
        loading,
        setLoading,
        uploading,
        setUploading,
        replacing,
        setReplacing,
        bulkDeleting,
        setBulkDeleting,
        message,
        setMessage,
        search,
        setSearch,
        filter,
        setFilter,
        sort,
        setSort,
        view,
        setView,
        selected,
        setSelected,
        checkedNames,
        setCheckedNames,
        copied,
        setCopied,
        usageMap,
        setUsageMap,
        fileInputRef,
        replaceInputRef,
        showMsg,
        loadFiles,
        displayed,
        isAllChecked,
        isSomeChecked,
        toggleCheck,
        toggleAll,
        onUpload,
        onReplace,
        onDelete,
        onBulkDelete,
        totalSize,
        imgCount,
    };
}

export function useAdminMediaPage(): ReturnType<typeof useAdminMediaPageState> {
  return useAdminMediaPageState()
}
