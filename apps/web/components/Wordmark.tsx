// `palavva.`: lowercase wordmark, two v's, Tangerine dot (05 §4).
export function Wordmark({ text = "palavva", size = 28, onDark = true, dot = true }: { text?: string; size?: number; onDark?: boolean; dot?: boolean }) {
  return (
    <span role="img" className="inline-flex items-baseline font-extrabold tracking-tight leading-none select-none" style={{ fontSize: size }}
      aria-label={text === "palavva" ? "Palavva" : text}>
      <span aria-hidden="true" style={{ color: onDark ? "#FFFFFF" : "var(--brand-midnight)" }}>{text}</span>
      {dot && <span aria-hidden="true" style={{ color: "var(--brand-accent)" }}>.</span>}
    </span>
  );
}

export function PalavvaMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" role="img" aria-label="Palavva">
      <rect width="128" height="128" rx="28" fill="#1B2030" />
      <path d="M35 95 V42 Q35 27 51 27 H72 Q100 27 100 56 Q100 84 73 84 H54 V101" stroke="#FFFFFF" strokeWidth="12" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="77" cy="56" r="8" fill="#E85E31" />
    </svg>
  );
}
