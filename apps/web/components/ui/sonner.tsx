"use client"

import { useEffect, useState } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

// Palavva sets the theme on <html data-theme>; follow it instead of next-themes.
const Toaster = ({ ...props }: ToasterProps) => {
  const [theme, setTheme] = useState<ToasterProps["theme"]>("system")
  useEffect(() => {
    const read = () => setTheme((document.documentElement.dataset.theme as ToasterProps["theme"]) ?? "system")
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
    return () => mo.disconnect()
  }, [])
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      style={{ "--normal-bg": "var(--popover)", "--normal-text": "var(--popover-foreground)", "--normal-border": "var(--border)" } as React.CSSProperties}
      {...props}
    />
  )
}

export { Toaster }
