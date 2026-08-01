'use client';

import React from 'react';
import type { PreviewResult } from '@/app/api/admin/import/preview/route';

// ─── CSV parser (no external deps) ───────────────────────────────────────────

function parseCSV(text: string): string[][] {
    const rows: string[][] = [];
    const lines = text.split(/\r?\n/);

    for (const line of lines) {
        if (!line.trim()) continue;
        const cells: string[] = [];
        let cur = '';
        let inQ = false;

        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') {
                if (inQ && line[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else inQ = !inQ;
            } else if (c === ',' && !inQ) {
                cells.push(cur);
                cur = '';
            } else {
                cur += c;
            }
        }
        cells.push(cur);
        rows.push(cells);
    }
    return rows;
}

function csvToObjects(text: string): Record<string, string>[] {
    const rows = parseCSV(text);
    if (rows.length < 2) return [];
    const headers = rows[0].map((h) => h.trim());
    return rows.slice(1).map((row) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
            obj[h] = row[i]?.trim() ?? '';
        });
        return obj;
    });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ImportMode = 'create' | 'update' | 'upsert';

type ImportResult = {
    created: number;
    updated: number;
    skipped: number;
    errors: { row: number; id: string; message: string }[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const REQUIRED_COLS = ['id', 'title', 'brand', 'price', 'stock', 'category'];
// ─── Component ────────────────────────────────────────────────────────────────

function useAdminImportPageState() {
    const [rows, setRows] = React.useState<Record<string, string>[]>([]);
    const [fileName, setFileName] = React.useState('');
    const [mode, setMode] = React.useState<ImportMode>('upsert');
    const [importing, setImporting] = React.useState(false);
    const [previewing, setPreviewing] = React.useState(false);
    const [result, setResult] = React.useState<ImportResult | null>(null);
    const [previewResult, setPreviewResult] = React.useState<PreviewResult | null>(null);
    const [parseError, setParseError] = React.useState('');
    const [missingCols, setMissingCols] = React.useState<string[]>([]);
    const fileRef = React.useRef<HTMLInputElement>(null);

    // ── File handling ─────────────────────────────────────────────────────────

    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFileName(file.name);
        setResult(null);
        setPreviewResult(null);
        setParseError('');
        setMissingCols([]);

        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            try {
                const parsed = csvToObjects(text);
                if (parsed.length === 0) {
                    setParseError('Файл пуст или не содержит строк данных.');
                    return;
                }

                const headers = Object.keys(parsed[0]);
                const missing = REQUIRED_COLS.filter((c) => !headers.includes(c));
                setMissingCols(missing);
                setRows(parsed);
            } catch {
                setParseError('Не удалось разобрать CSV. Проверьте формат файла.');
            }
        };
        reader.readAsText(file, 'utf-8');
        e.target.value = '';
    };

    const onReset = () => {
        setRows([]);
        setFileName('');
        setResult(null);
        setPreviewResult(null);
        setParseError('');
        setMissingCols([]);
    };

    const onModeChange = (m: ImportMode) => {
        setMode(m);
        setPreviewResult(null);
    };

    // ── Preview ───────────────────────────────────────────────────────────────

    const onPreview = async () => {
        if (!rows.length || missingCols.length > 0) return;
        setPreviewing(true);
        setPreviewResult(null);
        setResult(null);
        try {
            const res = await fetch('/api/admin/import/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rows, mode }),
            });
            const data = (await res.json()) as PreviewResult;
            setPreviewResult(data);
        } catch {
            setParseError('Не удалось получить предпросмотр. Проверьте соединение.');
        } finally {
            setPreviewing(false);
        }
    };

    // ── Import ────────────────────────────────────────────────────────────────

    const onImport = async () => {
        if (!rows.length || missingCols.length > 0) return;
        setImporting(true);
        setResult(null);
        try {
            const res = await fetch('/api/admin/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rows, mode }),
            });
            const data = (await res.json()) as ImportResult;
            setResult(data);
        } catch {
            setResult({
                created: 0,
                updated: 0,
                skipped: 0,
                errors: [{ row: 0, id: '', message: 'Ошибка соединения с сервером.' }],
            });
        } finally {
            setImporting(false);
        }
    };

    // ── Derived ───────────────────────────────────────────────────────────────

    const detectedCols = rows.length > 0 ? Object.keys(rows[0]) : [];
    const canImport = rows.length > 0 && missingCols.length === 0;

    // ── Render ────────────────────────────────────────────────────────────────

    return {
        rows,
        setRows,
        fileName,
        setFileName,
        mode,
        setMode,
        importing,
        setImporting,
        previewing,
        setPreviewing,
        result,
        setResult,
        previewResult,
        setPreviewResult,
        parseError,
        setParseError,
        missingCols,
        setMissingCols,
        fileRef,
        onFileChange,
        onReset,
        onModeChange,
        onPreview,
        onImport,
        detectedCols,
        canImport,
    };
}

export function useAdminImportPage(): ReturnType<typeof useAdminImportPageState> {
  return useAdminImportPageState()
}
