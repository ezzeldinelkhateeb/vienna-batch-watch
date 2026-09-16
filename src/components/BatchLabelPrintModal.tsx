import React, { useState } from "react";
import { Printer, Tag, Sparkles, Copy, Layout, Check, ShieldCheck, MapPin, Calendar, Clock } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/hooks/use-settings";
import { useRegisterBackModal } from "@/lib/modal-stack";
import { type ItemRow } from "@/components/ItemFormDialog";
import { BarcodeSvg } from "@/lib/barcode-generator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ItemRow | null;
}

type LabelSize = "50x30" | "70x40" | "80x50" | "a4";

export function BatchLabelPrintModal({ open, onOpenChange, item }: Props) {
  useRegisterBackModal(open, () => onOpenChange(false), "batch-label-print-modal");
  const { t, lang } = useI18n();
  const settings = useSettings();

  const [labelSize, setLabelSize] = useState<LabelSize>("50x30");
  const [copies, setCopies] = useState<number>(1);
  const [barcodeField, setBarcodeField] = useState<"batch" | "code">("batch");

  if (!item) return null;

  const factoryName = settings.data?.factory_name || "Vienna";
  const barcodeValue = barcodeField === "code" && item.item_code
    ? item.item_code
    : item.batch_number || item.id.slice(0, 8).toUpperCase();

  const handlePrint = () => {
    window.print();
  };

  const isApproved = item.qc_status === "approved";
  const qcLabel = isApproved
    ? lang === "ar" ? "مفحوص ومعتمد ✅" : "QC RELEASED ✅"
    : lang === "ar" ? "تحت الحجر 🔒" : "QUARANTINE 🔒";

  // Label size dimensions mapping
  const sizeStyles: Record<LabelSize, { width: string; height: string; fontSize: string }> = {
    "50x30": { width: "50mm", height: "30mm", fontSize: "text-[10px]" },
    "70x40": { width: "70mm", height: "40mm", fontSize: "text-[12px]" },
    "80x50": { width: "80mm", height: "50mm", fontSize: "text-[13px]" },
    a4: { width: "65mm", height: "35mm", fontSize: "text-[11px]" },
  };

  const currentStyle = sizeStyles[labelSize];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm sm:text-base font-bold text-cocoa flex items-center gap-2">
              <Tag className="size-4 text-brand" />
              <span>{lang === "ar" ? "طباعة ملصق الباركود الحراري للشحنة" : "Print Batch Thermal Label"}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Label Size Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {lang === "ar" ? "مقاس الملصق / ورق الطباعة" : "Label Sticker Size"}
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "50x30", title: "50 × 30 مم", subtitle: "طابعات الباركود (Standard)" },
                  { id: "70x40", title: "70 × 40 مم", subtitle: "كرتون ومستودعات (Medium)" },
                  { id: "80x50", title: "80 × 50 مم", subtitle: "براميل وبالتات (Pallet)" },
                  { id: "a4", title: "ورقة A4 (شبكة)", subtitle: "طابعات عادية (Sheet)" },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setLabelSize(s.id as LabelSize)}
                    className={`flex flex-col items-start p-2 rounded-lg border text-start transition-all ${
                      labelSize === s.id
                        ? "border-brand bg-brand/10 text-brand ring-1 ring-brand font-bold"
                        : "border-border/80 hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    <span className="text-xs">{s.title}</span>
                    <span className="text-[9px] opacity-75">{s.subtitle}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Print Configuration: Copies & Value */}
            <div className="grid grid-cols-2 gap-3 bg-muted/40 p-3 rounded-lg border border-border/80">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">
                  {lang === "ar" ? "عدد الملصقات (Copies)" : "Number of Copies"}
                </Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={copies}
                    onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                    className="h-8 text-xs font-bold font-mono w-20"
                  />
                  <div className="flex gap-1">
                    {[1, 2, 5, 10].map((c) => (
                      <Button
                        key={c}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCopies(c)}
                        className={`h-8 px-2 text-xs ${copies === c ? "border-brand text-brand font-bold" : ""}`}
                      >
                        {c}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">
                  {lang === "ar" ? "قيمة الباركود المشفرة" : "Barcode Encoded Value"}
                </Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBarcodeField("batch")}
                    className={`flex-1 py-1.5 px-2 rounded border text-xs font-medium transition-all ${
                      barcodeField === "batch"
                        ? "bg-brand text-white border-brand"
                        : "bg-card border-border hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    {lang === "ar" ? "رقم الباتش" : "Batch No"}
                  </button>
                  {item.item_code && (
                    <button
                      type="button"
                      onClick={() => setBarcodeField("code")}
                      className={`flex-1 py-1.5 px-2 rounded border text-xs font-medium transition-all ${
                        barcodeField === "code"
                          ? "bg-brand text-white border-brand"
                          : "bg-card border-border hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      {lang === "ar" ? "كود الصنف" : "Item Code"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Label Live Preview Box */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">
                {lang === "ar" ? "معاينة الملصق على الشاشة (Live Preview)" : "Live Label Preview"}
              </Label>
              <div className="flex justify-center items-center p-4 bg-muted/20 border border-dashed rounded-xl overflow-auto">
                <div
                  className="bg-white text-slate-950 p-2.5 rounded shadow-sm border border-slate-300 flex flex-col justify-between"
                  style={{
                    width: currentStyle.width,
                    minHeight: currentStyle.height,
                    boxSizing: "border-box",
                  }}
                >
                  {/* Top Bar: Factory Name & QC Badge */}
                  <div className="flex items-center justify-between border-b border-slate-300 pb-1 mb-1">
                    <span className="font-extrabold text-[11px] tracking-tight text-brand">
                      {factoryName}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                        isApproved
                          ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                          : "bg-amber-100 text-amber-900 border-amber-300"
                      }`}
                    >
                      {qcLabel}
                    </span>
                  </div>

                  {/* Material Name */}
                  <div className="font-black text-xs sm:text-sm text-slate-950 leading-tight mb-1 truncate">
                    {item.name}
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-x-2 text-[10px] leading-tight font-medium text-slate-700 mb-1">
                    <div>
                      <span className="text-slate-500">{lang === "ar" ? "التشغيلة: " : "Batch: "}</span>
                      <span className="font-mono font-bold text-slate-950">{item.batch_number || "—"}</span>
                    </div>
                    {item.item_code && (
                      <div>
                        <span className="text-slate-500">{lang === "ar" ? "كود: " : "Code: "}</span>
                        <span className="font-mono text-slate-950">{item.item_code}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-slate-500">{lang === "ar" ? "الانتهاء: " : "Exp: "}</span>
                      <span className="font-mono font-extrabold text-red-600">{item.expiry_date}</span>
                    </div>
                    {item.production_date && (
                      <div>
                        <span className="text-slate-500">{lang === "ar" ? "الإنتاج: " : "Prod: "}</span>
                        <span className="font-mono text-slate-800">{item.production_date}</span>
                      </div>
                    )}
                    {item.storage_location && (
                      <div className="col-span-2 truncate">
                        <span className="text-slate-500">{lang === "ar" ? "الموقع: " : "Loc: "}</span>
                        <span className="text-slate-800">{item.storage_location.split(" (")[0]}</span>
                      </div>
                    )}
                  </div>

                  {/* Barcode Render */}
                  <div className="pt-1 flex justify-center items-center border-t border-slate-200">
                    <BarcodeSvg
                      value={barcodeValue}
                      height={labelSize === "50x30" ? 34 : 44}
                      barWidth={labelSize === "50x30" ? 1.3 : 1.6}
                      showText={true}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              {lang === "ar" ? "إغلاق" : "Close"}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handlePrint}
              className="gap-1.5 bg-brand text-brand-foreground text-xs shadow-sm"
            >
              <Printer className="size-3.5" />
              <span>
                {lang === "ar"
                  ? `طباعة ${copies} ملصق الآن`
                  : `Print ${copies} Label(s)`}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dedicated Hidden Print Container (Visible only during window.print()) */}
      <div id="thermal-print-container" className="hidden print:block">
        <style dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body * {
                visibility: hidden !important;
              }
              #thermal-print-container, #thermal-print-container * {
                visibility: visible !important;
              }
              #thermal-print-container {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                background: white !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              .thermal-sticker-page {
                page-break-after: always;
                page-break-inside: avoid;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                box-sizing: border-box;
                padding: 2mm;
                color: black !important;
                background: white !important;
              }
              @page {
                size: auto;
                margin: 0;
              }
            }
          `
        }} />

        <div className={labelSize === "a4" ? "p-4 grid grid-cols-3 gap-3" : ""}>
          {Array.from({ length: copies }).map((_, idx) => (
            <div
              key={`label-print-${idx}`}
              className="thermal-sticker-page"
              style={{
                width: currentStyle.width,
                minHeight: currentStyle.height,
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid black", paddingBottom: "2px", marginBottom: "3px" }}>
                <span style={{ fontSize: "11px", fontWeight: "900", color: "black" }}>{factoryName}</span>
                <span style={{ fontSize: "9px", fontWeight: "800", border: "1px solid black", padding: "1px 4px", borderRadius: "3px" }}>
                  {qcLabel}
                </span>
              </div>

              {/* Material Name */}
              <div style={{ fontSize: "12px", fontWeight: "900", color: "black", margin: "2px 0", lineHeight: "1.2" }}>
                {item.name}
              </div>

              {/* Info Table */}
              <div style={{ fontSize: "9px", lineHeight: "1.3", color: "black", margin: "2px 0" }}>
                <div><strong>التشغيلة Batch:</strong> {item.batch_number || "—"}</div>
                <div><strong>تاريخ الانتهاء Exp:</strong> <span style={{ fontWeight: "900" }}>{item.expiry_date}</span></div>
                {item.storage_location && (
                  <div><strong>الموقع:</strong> {item.storage_location.split(" (")[0]}</div>
                )}
              </div>

              {/* Barcode SVG */}
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginTop: "3px", borderTop: "1px solid #ccc", paddingTop: "2px" }}>
                <BarcodeSvg
                  value={barcodeValue}
                  height={labelSize === "50x30" ? 30 : 40}
                  barWidth={labelSize === "50x30" ? 1.2 : 1.5}
                  showText={true}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
