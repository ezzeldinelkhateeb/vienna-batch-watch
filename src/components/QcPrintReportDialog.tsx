import { Printer, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { type ItemRow } from "@/components/ItemFormDialog";
import { type Status, daysUntil, statusFor, type Thresholds } from "@/lib/status";
import { STATUS_LABEL_KEY } from "@/components/StatusPill";
import { countdownText } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ItemRow[];
  thresholds?: Thresholds;
}

export function QcPrintReportDialog({ open, onOpenChange, items, thresholds }: Props) {
  const { t } = useI18n();

  const handlePrint = () => {
    window.print();
  };

  const todayStr = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const quarantineCount = items.filter((i) => (i.qc_status ?? "quarantine") === "quarantine").length;
  const approvedCount = items.filter((i) => i.qc_status === "approved").length;
  const rejectedCount = items.filter((i) => i.qc_status === "rejected").length;
  const criticalCount = items.filter((i) => {
    const st = statusFor(daysUntil(i.expiry_date), thresholds);
    return st === "critical" || st === "expired";
  }).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto p-4 sm:p-8">
        <DialogHeader className="flex flex-row items-center justify-between border-b pb-4 print:hidden">
          <DialogTitle className="text-lg font-semibold text-cocoa">
            {t("qcReportTitle")}
          </DialogTitle>
          <div className="flex gap-2">
            <Button onClick={handlePrint} size="sm" className="gap-1.5">
              <Printer className="size-4" />
              {t("print")}
            </Button>
          </div>
        </DialogHeader>

        {/* Printable Paper Content */}
        <div className="print-content space-y-6 pt-2 text-foreground">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b-2 border-cocoa pb-4">
            <div>
              <h1 className="font-serif text-3xl font-bold tracking-tight text-cocoa">
                Vienna
              </h1>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                High Quality Chocolate — QA & QC Department
              </p>
              <h2 className="mt-2 text-base font-semibold text-cocoa">
                {t("qcReportTitle")}
              </h2>
            </div>
            <div className="mt-3 sm:mt-0 text-xs text-muted-foreground text-start sm:text-end">
              <p><span className="font-semibold text-foreground">{t("reportDate")}:</span> {todayStr}</p>
              <p><span className="font-semibold text-foreground">{t("totalItems")}:</span> {items.length} {t("item")}</p>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-center dark:bg-amber-950/20">
              <p className="text-xs text-amber-900 dark:text-amber-300">{t("quarantine")}</p>
              <p className="text-xl font-bold text-amber-950 dark:text-amber-200">{quarantineCount}</p>
            </div>
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-center dark:bg-emerald-950/20">
              <p className="text-xs text-emerald-900 dark:text-emerald-300">{t("approved")}</p>
              <p className="text-xl font-bold text-emerald-950 dark:text-emerald-200">{approvedCount}</p>
            </div>
            <div className="rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-center dark:bg-rose-950/20">
              <p className="text-xs text-rose-900 dark:text-rose-300">{t("rejected")}</p>
              <p className="text-xl font-bold text-rose-950 dark:text-rose-200">{rejectedCount}</p>
            </div>
            <div className="rounded-lg border border-red-300 bg-red-50 p-2.5 text-center dark:bg-red-950/20">
              <p className="text-xs text-red-900 dark:text-red-300">{t("statusCritical")}</p>
              <p className="text-xl font-bold text-red-950 dark:text-red-200">{criticalCount}</p>
            </div>
          </div>

          {/* Main Inspection Table */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-start text-xs">
              <thead className="bg-muted/80 font-semibold text-cocoa">
                <tr>
                  <th className="p-2 text-start">#</th>
                  <th className="p-2 text-start">{t("itemCode")}</th>
                  <th className="p-2 text-start">{t("name")}</th>
                  <th className="p-2 text-start">{t("supplier")}</th>
                  <th className="p-2 text-start">{t("qcStatus")}</th>
                  <th className="p-2 text-start">{t("storageLocation")}</th>
                  <th className="p-2 text-start">{t("expiryDate")}</th>
                  <th className="p-2 text-start">{t("quantity")}</th>
                  <th className="p-2 text-start">{t("qcNotes")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((it, idx) => {
                  const days = daysUntil(it.expiry_date);
                  const st = statusFor(days, thresholds);
                  return (
                    <tr key={it.id} className="odd:bg-background even:bg-muted/20">
                      <td className="p-2 font-mono">{idx + 1}</td>
                      <td className="p-2 font-mono font-medium">{it.item_code || "—"}</td>
                      <td className="p-2 font-medium">{it.name}</td>
                      <td className="p-2">{it.supplier || "—"}</td>
                      <td className="p-2 font-semibold">
                        {t((it.qc_status ?? "quarantine") as never)}
                      </td>
                      <td className="p-2">{it.storage_location || "—"}</td>
                      <td className="p-2 font-mono whitespace-nowrap">
                        {it.expiry_date}
                        <span className="block text-[10px] text-muted-foreground">
                          {countdownText(days, t)}
                        </span>
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {it.quantity != null ? `${it.quantity}` : "—"}
                      </td>
                      <td className="p-2 max-w-[12rem] text-muted-foreground">
                        {it.qc_notes || it.notes || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Signatures & Official Approvals Section */}
          <div className="mt-8 border-t pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center text-xs">
              <div className="rounded-lg border border-dashed p-4">
                <p className="font-semibold text-cocoa">{t("preparedBy")}</p>
                <div className="my-6 border-b border-muted-foreground/30" />
                <p className="text-muted-foreground">{t("signature")}</p>
              </div>

              <div className="rounded-lg border border-dashed p-4">
                <p className="font-semibold text-cocoa">{t("inspectedBy")}</p>
                <div className="my-6 border-b border-muted-foreground/30" />
                <p className="text-muted-foreground">{t("signature")}</p>
              </div>

              <div className="rounded-lg border border-dashed p-4">
                <p className="font-semibold text-cocoa">{t("approvedBy")}</p>
                <div className="my-6 border-b border-muted-foreground/30" />
                <p className="text-muted-foreground">{t("signature")}</p>
              </div>
            </div>

            <div className="mt-6 text-center text-[11px] text-muted-foreground">
              <p>Vienna High Quality Chocolate — Internal Quality Management System</p>
              <p className="font-serif italic text-cocoa/70">Certified for Food Safety & Quality Standards</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
