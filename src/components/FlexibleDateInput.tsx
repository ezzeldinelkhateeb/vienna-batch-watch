import { useState, useEffect, useRef } from "react";
import { Calendar as CalendarIcon, Check, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Converts Arabic-Indic digits (٠-٩) to standard ASCII digits (0-9) */
export function normalizeDigits(str: string): string {
  return str.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

/**
 * Robust date parser accepting:
 * - D/M/YYYY or DD/MM/YYYY (e.g. 5/9/2026, 05/09/2026)
 * - D-M-YYYY or DD-MM-YYYY (e.g. 5-9-2026)
 * - YYYY-MM-DD or YYYY-M-D (e.g. 2026-9-5)
 * - YYYY/MM/DD
 * - D/M/YY (e.g. 5/9/26 -> 2026)
 * - Arabic digits (e.g. ٥/٩/٢٠٢٦)
 * Returns normalized ISO "YYYY-MM-DD" or null if invalid
 */
export function parseFlexibleDate(input: string): string | null {
  if (!input || !input.trim()) return null;
  const clean = normalizeDigits(input.trim());

  // Split by /, -, or .
  const parts = clean.split(/[/.\s-]+/).filter(Boolean);
  if (parts.length !== 3) return null;

  const [p0, p1, p2] = parts;
  if (!p0 || !p1 || !p2) return null;

  let year: number;
  let month: number;
  let day: number;

  if (p0.length === 4) {
    // Format: YYYY / MM / DD
    year = parseInt(p0, 10);
    month = parseInt(p1, 10);
    day = parseInt(p2, 10);
  } else if (p2.length === 4 || p2.length === 2) {
    // Format: DD / MM / YYYY
    day = parseInt(p0, 10);
    month = parseInt(p1, 10);
    year = parseInt(p2, 10);
    if (p2.length === 2) {
      year = year < 50 ? 2000 + year : 1900 + year;
    }
  } else {
    return null;
  }

  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1970 || year > 2100) return null;

  // Basic month days validation
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) return null;

  const yStr = String(year);
  const mStr = String(month).padStart(2, "0");
  const dStr = String(day).padStart(2, "0");
  return `${yStr}-${mStr}-${dStr}`;
}

/** Formats ISO YYYY-MM-DD into display DD/MM/YYYY */
export function formatToDisplay(iso: string): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    return `${parseInt(parts[2], 10)}/${parseInt(parts[1], 10)}/${parts[0]}`;
  }
  return iso;
}

interface FlexibleDateInputProps {
  id?: string | undefined;
  value: string; // ISO format "YYYY-MM-DD" or ""
  onChange: (isoValue: string) => void;
  placeholder?: string | undefined;
  required?: boolean | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

export function FlexibleDateInput({
  id,
  value,
  onChange,
  placeholder = "DD/MM/YYYY (مثال: 5/9/2026)",
  required,
  disabled,
  className,
}: FlexibleDateInputProps) {
  // Local text representation (what the user types)
  const [text, setText] = useState<string>(() => (value ? formatToDisplay(value) : ""));
  const [isValid, setIsValid] = useState<boolean>(true);
  const datePickerRef = useRef<HTMLInputElement>(null);

  // Keep in sync when external value changes (e.g. form reset or prefill)
  useEffect(() => {
    if (value) {
      const parsed = parseFlexibleDate(value);
      if (parsed) {
        setText(formatToDisplay(parsed));
        setIsValid(true);
      }
    } else {
      setText("");
      setIsValid(true);
    }
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setText(raw);

    if (!raw.trim()) {
      setIsValid(true);
      onChange("");
      return;
    }

    const iso = parseFlexibleDate(raw);
    if (iso) {
      setIsValid(true);
      onChange(iso);
    } else {
      // While typing, could be incomplete
      setIsValid(false);
    }
  };

  const handleBlur = () => {
    if (!text.trim()) {
      setIsValid(true);
      onChange("");
      return;
    }

    const iso = parseFlexibleDate(text);
    if (iso) {
      setIsValid(true);
      setText(formatToDisplay(iso));
      onChange(iso);
    } else {
      setIsValid(false);
    }
  };

  const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const iso = e.target.value;
    if (iso) {
      setText(formatToDisplay(iso));
      setIsValid(true);
      onChange(iso);
    }
  };

  const openCalendar = () => {
    if (disabled) return;
    try {
      if (datePickerRef.current && "showPicker" in datePickerRef.current) {
        datePickerRef.current.showPicker();
      } else {
        datePickerRef.current?.focus();
      }
    } catch {
      datePickerRef.current?.focus();
    }
  };

  return (
    <div className="relative flex items-center">
      <Input
        id={id}
        type="text"
        dir="ltr"
        inputMode="text"
        placeholder={placeholder}
        value={text}
        onChange={handleTextChange}
        onBlur={handleBlur}
        required={required}
        disabled={disabled}
        className={`pe-10 font-mono text-xs ${
          !isValid && text.trim() ? "border-red-500 focus-visible:ring-red-500" : ""
        } ${className || ""}`}
      />

      {/* Hidden native date picker input for calendar trigger */}
      <input
        ref={datePickerRef}
        type="date"
        value={value || ""}
        onChange={handlePickerChange}
        tabIndex={-1}
        className="sr-only absolute pointer-events-none"
        aria-hidden="true"
      />

      {/* Calendar picker button */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={openCalendar}
        disabled={disabled}
        className="absolute end-1 h-7 w-7 text-muted-foreground hover:text-brand"
        title="اختيار من التقويم"
      >
        <CalendarIcon className="size-3.5" />
      </Button>
    </div>
  );
}
