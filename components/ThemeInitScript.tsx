"use client"
import { useEffect } from "react"

export default function ThemeInitScript() {
  useEffect(() => {
    try {
      var key = "eshop_theme"
      var saved = localStorage.getItem(key)
      var dark =
        saved === "dark" ||
        (saved !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches)
      if (dark) {
        document.documentElement.classList.add("dark")
        document.body && document.body.style.setProperty("--color-bg", "#18181b")
        document.body && document.body.style.setProperty("--color-text", "#f3f4f6")
      } else {
        document.documentElement.classList.remove("dark")
        document.body && document.body.style.setProperty("--color-bg", "#ffffff")
        document.body && document.body.style.setProperty("--color-text", "#111827")
      }
    } catch (e) {}
  }, [])
  return null
}
