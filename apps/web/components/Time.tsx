import { fullDate, parsePbDate, relativeTime } from "@/lib/format";

export function Time({ value, prefix = "" }: { value?: string | null; prefix?: string }) {
  const d = parsePbDate(value);
  if (!d) return null;
  return <time dateTime={d.toISOString()} title={fullDate(d)}>{prefix}{relativeTime(d)}</time>;
}
