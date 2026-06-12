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
      document.documentElement.classList.toggle("dark", dark)
    } catch (e) {}
  }, [])
  return null
}
