"use client"
import { useEffect } from "react"

export default function ThemeInitScript() {
  useEffect(() => {
    try {
      const key = "eshop_theme"
      const saved = localStorage.getItem(key)
      const dark =
        saved === "dark" ||
        (saved !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches)
      document.documentElement.classList.toggle("dark", dark)
    } catch (e) {}
  }, [])
  return null
}
