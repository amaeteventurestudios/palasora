import { EngineNav } from "@/components/admin/EngineNav";

export default function EngineLayout({ children }: { children: React.ReactNode }) {
  return (<><EngineNav />{children}</>);
}
