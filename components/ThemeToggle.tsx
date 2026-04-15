"use client";
import { useEffect, useState } from "react";
import { useTranslation } from "@/lib/use-translation";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const THEME_STORAGE_KEY = "eshop_theme";

const applyTheme = (isDark: boolean): void => {
  if (isDark) {
    document.documentElement.classList.add("dark");
    document.body.style.setProperty("--color-bg", "#18181b");
    document.body.style.setProperty("--color-text", "#f3f4f6");
  } else {
    document.documentElement.classList.remove("dark");
    document.body.style.setProperty("--color-bg", "#ffffff");
    document.body.style.setProperty("--color-text", "#111827");
  }
};

export default function ThemeToggle() {
  const { t } = useTranslation();
  const [dark, setDark] = useState(false);
  const [isThemeReady, setIsThemeReady] = useState(false);
  const tooltipLabel = dark ? t("theme.toLight") : t("theme.toDark");

  useEffect(() => {
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
            className="px-3 py-2 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border transition"
            onClick={() => setDark((v) => !v)}
            aria-label={tooltipLabel}
          >
            {dark ? `🌙 ${t("theme.dark")}` : `☀️ ${t("theme.light")}`}
          </button>
        </TooltipTrigger>
        <TooltipContent>{tooltipLabel}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
