"use client";
import { useRouter } from "next/navigation";
import { DataTable, type Column } from "../DataTable";
import { Badge } from "@/components/ui/badge";

export type InquiryRow = { id: string; reference: string; business: string; contact: string; email: string; stage: string; country: string; region: string; industry: string; forward: string; owner: string; followUp: string; created: string };
const STAGE: Record<string, string> = { new: "New", contacted: "Contacted", qualified: "Qualified", proposal: "Proposal", won: "Won", lost: "Lost" };
export function InquiryTable({ rows, selected }: { rows: InquiryRow[]; selected?: string }) {
  const router = useRouter();
  const cols: Column<InquiryRow>[] = [
    { key: "ref", header: "Reference", cell: (r) => <span className={`font-mono text-xs ${r.id === selected ? "font-bold" : ""}`}>{r.reference}</span>, sort: (r) => r.reference },
    { key: "business", header: "Business", cell: (r) => r.business, sort: (r) => r.business.toLowerCase() },
    { key: "contact", header: "Contact", cell: (r) => <span>{r.contact}<br /><span className="text-xs text-muted-foreground">{r.email}</span></span> },
    { key: "stage", header: "Stage", cell: (r) => <Badge variant={r.stage === "won" ? "default" : r.stage === "lost" ? "destructive" : "outline"}>{STAGE[r.stage] ?? r.stage}</Badge>, sort: (r) => Object.keys(STAGE).indexOf(r.stage) },
    { key: "where", header: "Country / industry", cell: (r) => <span className="text-xs">{r.country || r.region || "—"} / {r.industry || "—"}</span> },
    { key: "crm", header: "CRM", cell: (r) => <span className="text-xs">{r.forward}</span>, sort: (r) => r.forward },
    { key: "owner", header: "Owner", cell: (r) => r.owner || "—", sort: (r) => r.owner },
    { key: "follow", header: "Follow up", cell: (r) => <span className="text-xs">{r.followUp || "—"}</span>, sort: (r) => r.followUp || "9999" },
    { key: "created", header: "Received", cell: (r) => <span className="text-xs">{r.created.slice(0, 10)}</span>, sort: (r) => r.created },
  ];
  return <DataTable caption="Sponsor inquiries" testid="inquiry-table" rows={rows} columns={cols} rowKey={(r) => r.id} initialSort={{ key: "created", dir: "desc" }} initialPageSize={50}
    search={(r) => `${r.reference} ${r.business} ${r.contact} ${r.email} ${r.country} ${r.industry}`} onRowClick={(r) => router.push(`/admin/sponsors?id=${r.id}#inquiry`)}
    filters={[{ key: "stage", label: "Stage", options: Object.entries(STAGE).map(([value, label]) => ({ value, label })), get: (r) => r.stage },
      { key: "crm", label: "CRM", options: ["FORWARDED", "NOT_CONFIGURED", "FORWARD_FAILED", "DUPLICATE", "MANUAL", "PENDING_FORWARD"].map((v) => ({ value: v, label: v })), get: (r) => r.forward }]}
    empty="No inquiries yet. They arrive from the Advertise page and are kept here even if the CRM is down." />;
}
