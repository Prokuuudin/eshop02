'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import AdminGate from '@/components/admin/AdminGate';
import { useAdminLocale } from '@/lib/use-admin-locale';
import { getOnboardingSteps, type OnboardingStep } from './onboarding-steps';

const STORAGE_KEY = 'admin-onboarding-checked';

export default function AdminOnboardingPage(): React.ReactElement {
    const { language, l } = useAdminLocale();
    const localizedSteps = getOnboardingSteps(language);
    const groupLabels: Record<OnboardingStep['group'], string> = {
        day1: l('Первый день', 'First day', 'Pirmā diena'),
        week1: l('Первая неделя', 'First week', 'Pirmā nedēļa'),
        month1: l('Первый месяц', 'First month', 'Pirmais mēnesis'),
    };
    const [checked, setChecked] = useState<Set<number>>(new Set());
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        queueMicrotask(() => {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw) as number[];
                    if (Array.isArray(parsed)) setChecked(new Set(parsed));
                }
            } catch {
                /* ignore */
            }
            setLoaded(true);
        });
    }, []);

    const toggle = (id: number) => {
        setChecked((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
            } catch {
                /* ignore */
            }
            return next;
        });
    };

    const reset = () => {
        setChecked(new Set());
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            /* ignore */
        }
    };

    const total = localizedSteps.length;
    const done = checked.size;
    const allDone = done === total;

    const groups: OnboardingStep['group'][] = ['day1', 'week1', 'month1'];

    return (
        <AdminGate>
            <main className="w-full py-4 space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">
                            {l(
                                'Онбординг сотрудника',
                                'Employee onboarding',
                                'Darbinieka ievadīšana darbā'
                            )}
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {l(
                                'Чеклист для знакомства с системой — отмечайте шаги по мере выполнения',
                                'A checklist for learning the system — mark steps as you complete them',
                                'Sistēmas iepazīšanas kontrolsaraksts — atzīmējiet pabeigtos soļus'
                            )}
                        </p>
                    </div>
                    <Link href="/admin">
                        <Button variant="outline">
                            {l('Назад в админку', 'Back to admin', 'Atpakaļ uz administrēšanu')}
                        </Button>
                    </Link>
                </div>

                {/* Progress */}
                <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-foreground">
                            {l('Прогресс', 'Progress', 'Progress')}: {done} {l('из', 'of', 'no')}{' '}
                            {total}
                        </span>
                        <Button variant="outline" size="sm" onClick={reset}>
                            {l('Сбросить прогресс', 'Reset progress', 'Atiestatīt progresu')}
                        </Button>
                    </div>
                    <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                        <div
                            className="h-3 rounded-full transition-all duration-300"
                            style={{
                                width: `${Math.round((done / total) * 100)}%`,
                                background: allDone ? '#16a34a' : '#6366f1',
                            }}
                        />
                    </div>
                    {loaded && allDone && (
                        <div className="mt-4 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-800 dark:text-green-200 font-medium">
                            {l(
                                'Отличная работа! Вы прошли все шаги онбординга. Добро пожаловать в команду!',
                                'Great work! You completed every onboarding step. Welcome to the team!',
                                'Lielisks darbs! Jūs pabeidzāt visus ievadīšanas soļus. Laipni lūdzam komandā!'
                            )}
                        </div>
                    )}
                </div>

                {/* Steps */}
                {groups.map((group) => (
                    <div
                        key={group}
                        className="bg-card rounded-xl border border-border shadow-sm overflow-hidden"
                    >
                        <div className="px-5 py-3 border-b border-border bg-muted/50">
                            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                                {groupLabels[group]}
                            </h2>
                        </div>
                        <ul className="divide-y divide-border">
                            {localizedSteps
                                .filter((s) => s.group === group)
                                .map((step) => {
                                    const isDone = checked.has(step.id);
                                    return (
                                        <li
                                            key={step.id}
                                            className="flex items-start gap-4 px-5 py-4"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => toggle(step.id)}
                                                aria-label={
                                                    isDone
                                                        ? l(
                                                              'Снять отметку',
                                                              'Mark as incomplete',
                                                              'Atzīmēt kā nepabeigtu'
                                                          )
                                                        : l(
                                                              'Отметить выполненным',
                                                              'Mark as complete',
                                                              'Atzīmēt kā pabeigtu'
                                                          )
                                                }
                                                className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                                    isDone
                                                        ? 'bg-green-500 border-green-500 text-white'
                                                        : 'border-gray-300 dark:border-gray-600 hover:border-primary/70'
                                                }`}
                                            >
                                                {isDone && (
                                                    <svg
                                                        className="w-3 h-3"
                                                        viewBox="0 0 12 12"
                                                        fill="none"
                                                    >
                                                        <path
                                                            d="M2 6l3 3 5-5"
                                                            stroke="currentColor"
                                                            strokeWidth="1.8"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        />
                                                    </svg>
                                                )}
                                            </button>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start gap-2">
                                                    <span className="text-lg leading-none mt-0.5 flex-shrink-0">
                                                        {step.icon}
                                                    </span>
                                                    <span
                                                        className={`text-sm leading-relaxed ${
                                                            isDone
                                                                ? 'line-through text-gray-400 dark:text-gray-500'
                                                                : 'text-gray-800 dark:text-gray-200'
                                                        }`}
                                                    >
                                                        <span className="font-medium text-muted-foreground mr-1">
                                                            {step.id}.
                                                        </span>
                                                        {step.text}
                                                    </span>
                                                </div>
                                            </div>
                                            {step.href && step.linkLabel && (
                                                <Link
                                                    href={step.href}
                                                    className="flex-shrink-0 text-xs font-medium text-primary hover:underline whitespace-nowrap mt-0.5"
                                                >
                                                    {step.linkLabel} →
                                                </Link>
                                            )}
                                        </li>
                                    );
                                })}
                        </ul>
                    </div>
                ))}
            </main>
        </AdminGate>
    );
}
