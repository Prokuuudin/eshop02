"use client";
import { useEffect, useState } from "react";
import { useTranslation } from "@/lib/use-translation";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const THEME_STORAGE_KEY = "eshop_theme";

const applyTheme = (isDark: boolean): void => {
  document.documentElement.classList.toggle("dark", isDark);
};

export default function ThemeToggle({ compact = false, responsive = false }: { compact?: boolean; responsive?: boolean }): React.ReactElement {
  const { t } = useTranslation();
  const [dark, setDark] = useState(false);
  const [isThemeReady, setIsThemeReady] = useState(false);
  const tooltipLabel = dark ? t("theme.toLight") : t("theme.toDark");

  useEffect(() => {
    queueMicrotask(() => {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === "dark") {
        setDark(true);
        setIsThemeReady(true);
        return;
      }
      if (savedTheme === "light") {
        setDark(false);
        setIsThemeReady(true);
        return;
      }

      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setDark(prefersDark);
      setIsThemeReady(true);
    });
  }, []);

  useEffect(() => {
    if (!isThemeReady) {
      return;
    }
    applyTheme(dark);
    localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  }, [dark, isThemeReady]);

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={`rounded bg-muted text-gray-700 dark:text-gray-200 border transition ${
              compact
                ? 'px-2 py-2 text-lg leading-none'
                : responsive
                  ? 'px-2 min-[940px]:px-3 py-2 text-lg min-[940px]:text-sm leading-none min-[940px]:leading-normal'
                  : 'px-3 py-2'
            }`}
            onClick={() => setDark((v) => !v)}
            aria-label={tooltipLabel}
          >
            {compact && (dark ? '🌙' : '☀️')}
            {responsive && (
              <>
                <span className="min-[940px]:hidden">{dark ? '🌙' : '☀️'}</span>
                <span className="hidden min-[940px]:inline">{dark ? `🌙 ${t("theme.dark")}` : `☀️ ${t("theme.light")}`}</span>
              </>
            )}
            {!compact && !responsive && (dark ? `🌙 ${t("theme.dark")}` : `☀️ ${t("theme.light")}`)}
          </button>
        </TooltipTrigger>
        <TooltipContent>{tooltipLabel}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
