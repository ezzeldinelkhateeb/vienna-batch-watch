import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "ar" | "en";

type Dict = Record<string, string>;

const en: Dict = {
  brandTagline: "HIGH QUALITY CHOCOLATE",
  systemSubtitle: "Raw Material Expiry Tracking System",
  inventory: "Inventory",
  settings: "Settings",
  notificationsLog: "Notifications Log",
  signOut: "Sign out",
  language: "العربية",

  signIn: "Sign in",
  signUp: "Create account",
  email: "Email",
  password: "Password",
  loginTitle: "Sign in to continue",
  loginSubtitle: "Team access to the shared raw material inventory",
  noAccount: "Don't have an account?",
  haveAccount: "Already have an account?",
  checkEmail: "Account created. Check your email to confirm, then sign in.",

  addItem: "Add new item",
  editItem: "Edit item",
  name: "Name",
  supplier: "Supplier",
  productionDate: "Production date",
  expiryDate: "Expiry date",
  quantity: "Quantity",
  unit: "Unit",
  notes: "Notes",
  status: "Status",
  remaining: "Time remaining",
  actions: "Actions",
  save: "Save",
  cancel: "Cancel",
  edit: "Edit",
  delete: "Delete",
  saving: "Saving…",
  loading: "Loading…",
  deleteConfirm: "Delete this item permanently?",
  noItems: "No items yet. Add your first raw material.",
  noResults: "No items match your search.",
  searchLegacy: "Search",
  allStatuses: "All statuses",
  exportCsv: "Export CSV",

  legend: "Color legend",
  statusNormal: "Normal",
  statusEarly: "Early warning",
  statusMedium: "Medium warning",
  statusCritical: "Critical warning",
  statusExpired: "Expired",
  legendNormal: "more than {n} days left",
  legendEarly: "{a}–{b} days left",
  legendCritical: "{n} days or less left",
  legendExpired: "past the expiry date",

  monthsDaysLeft: "{m} months and {d} days left ({n} days)",
  daysLeft: "{n} days left",
  todayExpires: "Expires today",
  expiredAgo: "Expired {n} days ago",

  whatsappSettings: "WhatsApp alerts",
  phone: "WhatsApp number (international format)",
  apiKey: "CallMeBot API key",
  sendTest: "Send test message",
  sending: "Sending…",
  testSent: "Test message sent successfully.",
  thresholds: "Warning thresholds (days)",
  thresholdEarly: "Early warning starts at",
  thresholdMedium: "Medium warning starts at",
  thresholdCritical: "Critical warning starts at",
  adminOnly: "Only admins can change these settings.",
  saved: "Settings saved.",
  callmebotHint:
    "Activate your number once with CallMeBot on WhatsApp, then paste the API key it gives you here.",
  backToInventory: "Back to inventory",
  sentAt: "Sent at",
  item: "Item",
  message: "Message",
  result: "Result",
  success: "Sent",
  failed: "Failed",
  noLogs: "No alerts have been sent yet.",

  itemCode: "Item Code",
  photoOptional: "Photo (optional)",
  photo: "Photo",
  removePhoto: "Remove photo",
  choosePhoto: "Choose image",
  uploadingPhoto: "Uploading image…",
  notSet: "Not set",
  viewPhoto: "View photo",
  closePhoto: "Close",

  errRequiredName: "Item name is required.",
  errRequiredExpiry: "Expiry date is required.",
  errRequiredCode: "Item code is required.",
  errDuplicateCode: "This item code is already used by another item.",
  errPhotoType: "Please choose a JPG, PNG or WebP image.",
  errQuantity: "Quantity must be a number of 0 or more.",
  errGeneric: "Something went wrong. Please try again.",
  errMissingWhatsapp: "Add your WhatsApp number and API key first.",
  totalItems: "Total items",
  search: "Search by code, name or supplier",

  // Quality Control (QC)
  qcStatus: "QC Status",
  quarantine: "Quarantine",
  approved: "Approved",
  rejected: "Rejected",
  conditional: "Conditional",
  storageLocation: "Storage Location",
  qcNotes: "QC Inspection Notes",
  errProductionAfterExpiry: "Production date cannot be after expiry date.",
  adminDeleteOnly: "Only administrators can delete raw material batches.",
  loginAdminContact: "Need access? Please contact your system administrator at Vienna.",
  allQcStatuses: "All QC statuses",

  // Phase 2: Barcode, Mobile Cards, Reports & COA
  scanBarcode: "Scan Barcode / QR",
  cameraScan: "Camera Scanner",
  cameraInstruction: "Point your camera at the raw material barcode or QR code",
  stopCamera: "Close Camera",
  barcodeDetected: "Barcode detected!",
  cameraError: "Unable to access camera. Please check browser permissions.",
  manualCodeInput: "Or type code manually",
  submitCode: "Apply Code",
  viewMode: "View",
  viewTable: "Table",
  viewCards: "Cards",
  printQcReport: "Print QC Report",
  print: "Print / Save PDF",
  close: "Close",
  coaNumber: "COA Reference #",
  qcReportTitle: "Quality Assurance & Batch Inspection Report",
  preparedBy: "Prepared by (Storekeeper)",
  inspectedBy: "Inspected by (QC Inspector)",
  approvedBy: "Approved by (QA Manager)",
  signature: "Signature & Date",
  reportDate: "Report Date",
  officialStamp: "Vienna Quality Assurance Stamp",
};

const ar: Dict = {
  brandTagline: "شوكولاتة عالية الجودة",
  systemSubtitle: "نظام تتبع صلاحية المواد الخام",
  inventory: "المخزون",
  settings: "الإعدادات",
  notificationsLog: "سجل التنبيهات",
  signOut: "تسجيل الخروج",
  language: "English",

  signIn: "تسجيل الدخول",
  signUp: "إنشاء حساب",
  email: "البريد الإلكتروني",
  password: "كلمة المرور",
  loginTitle: "سجّل الدخول للمتابعة",
  loginSubtitle: "وصول الفريق إلى مخزون المواد الخام المشترك",
  noAccount: "ليس لديك حساب؟",
  haveAccount: "لديك حساب بالفعل؟",
  checkEmail: "تم إنشاء الحساب. تحقق من بريدك للتأكيد ثم سجّل الدخول.",

  addItem: "إضافة صنف جديد",
  editItem: "تعديل الصنف",
  name: "الاسم",
  supplier: "المورد",
  productionDate: "تاريخ الإنتاج",
  expiryDate: "تاريخ الانتهاء",
  quantity: "الكمية",
  unit: "الوحدة",
  notes: "ملاحظات",
  status: "الحالة",
  remaining: "المدة المتبقية",
  actions: "إجراءات",
  save: "حفظ",
  cancel: "إلغاء",
  edit: "تعديل",
  delete: "حذف",
  saving: "جارٍ الحفظ…",
  loading: "جارٍ التحميل…",
  deleteConfirm: "هل تريد حذف هذا الصنف نهائيًا؟",
  noItems: "لا توجد أصناف بعد. أضف أول مادة خام.",
  noResults: "لا توجد أصناف مطابقة للبحث.",
  searchLegacy: "بحث",
  search: "ابحث بالكود أو الاسم أو المورد",
  allStatuses: "كل الحالات",
  exportCsv: "تصدير Excel/CSV",

  legend: "دليل الألوان",
  statusNormal: "طبيعي",
  statusEarly: "تحذير مبكر",
  statusMedium: "تحذير متوسط",
  statusCritical: "تحذير حرج",
  statusExpired: "منتهي الصلاحية",
  legendNormal: "متبقٍ أكثر من {n} يوم",
  legendEarly: "متبقٍ من {b} إلى {a} يوم",
  legendCritical: "متبقٍ {n} يوم أو أقل",
  legendExpired: "تجاوز تاريخ الانتهاء",

  monthsDaysLeft: "متبقٍ {m} شهر و{d} يوم ({n} يوم)",
  daysLeft: "متبقٍ {n} يوم",
  todayExpires: "ينتهي اليوم",
  expiredAgo: "انتهى منذ {n} يوم",

  whatsappSettings: "تنبيهات واتساب",
  phone: "رقم واتساب (بالصيغة الدولية)",
  apiKey: "مفتاح CallMeBot API",
  sendTest: "إرسال رسالة تجريبية",
  sending: "جارٍ الإرسال…",
  testSent: "تم إرسال الرسالة التجريبية بنجاح.",
  thresholds: "حدود التحذير (بالأيام)",
  thresholdEarly: "يبدأ التحذير المبكر عند",
  thresholdMedium: "يبدأ التحذير المتوسط عند",
  thresholdCritical: "يبدأ التحذير الحرج عند",
  adminOnly: "المسؤولون فقط يمكنهم تغيير هذه الإعدادات.",
  saved: "تم حفظ الإعدادات.",
  callmebotHint:
    "قم بتنشيط رقمك مرة واحدة مع بوت CallMeBot على واتساب، ثم الصق المفتاح الذي يمنحك إياه هنا.",
  backToInventory: "الرجوع إلى المخزون",
  sentAt: "وقت الإرسال",
  item: "الصنف",
  message: "الرسالة",
  result: "النتيجة",
  success: "تم الإرسال",
  failed: "فشل",
  noLogs: "لم يتم إرسال أي تنبيهات بعد.",

  itemCode: "كود الصنف",
  photoOptional: "الصورة (اختياري)",
  photo: "الصورة",
  removePhoto: "إزالة الصورة",
  choosePhoto: "اختر صورة",
  uploadingPhoto: "جارٍ رفع الصورة…",
  notSet: "غير محدد",
  viewPhoto: "عرض الصورة",
  closePhoto: "إغلاق",

  errRequiredName: "اسم الصنف مطلوب.",
  errRequiredExpiry: "تاريخ الانتهاء مطلوب.",
  errRequiredCode: "كود الصنف مطلوب.",
  errDuplicateCode: "هذا الكود مستخدم بالفعل لصنف آخر.",
  errPhotoType: "اختر صورة بصيغة JPG أو PNG أو WebP.",
  errQuantity: "يجب أن تكون الكمية رقمًا أكبر من أو يساوي صفر.",
  errGeneric: "حدث خطأ ما. حاول مرة أخرى.",
  errMissingWhatsapp: "أضف رقم واتساب ومفتاح API أولًا.",
  totalItems: "إجمالي الأصناف",

  // Quality Control (QC)
  qcStatus: "حالة الجودة",
  quarantine: "تحت الحجر",
  approved: "مقبول",
  rejected: "مرفوض",
  conditional: "مشروط",
  storageLocation: "موقع التخزين",
  qcNotes: "ملاحظات فحص الجودة",
  errProductionAfterExpiry: "لا يمكن أن يكون تاريخ الإنتاج لاحقاً لتاريخ انتهاء الصلاحية.",
  adminDeleteOnly: "المسؤولون فقط يمكنهم حذف دفعات المواد الخام.",
  loginAdminContact: "تحتاج إلى صلاحية وصول؟ يرجى التواصل مع مسؤول النظام في شركة فينا.",
  allQcStatuses: "كل حالات الجودة",

  // Phase 2: Barcode, Mobile Cards, Reports & COA
  scanBarcode: "مسح باركود / QR",
  cameraScan: "ماسح الكاميرا",
  cameraInstruction: "وجّه الكاميرا نحو باركود الصنف أو رمز QR",
  stopCamera: "إغلاق الكاميرا",
  barcodeDetected: "تم التقاط الباركود!",
  cameraError: "تعذر فتح الكاميرا. يرجى السماح بالوصول للكاميرا من المتصفح.",
  manualCodeInput: "أو اكتب الكود يدوياً",
  submitCode: "تطبيق الكود",
  viewMode: "طريقة العرض",
  viewTable: "جدول",
  viewCards: "بطاقات",
  printQcReport: "طباعة تقرير الجودة",
  print: "طباعة / حفظ PDF",
  close: "إغلاق",
  coaNumber: "رقم شهادة التحليل (COA)",
  qcReportTitle: "تقرير فحص واعتماد جودة المواد الخام",
  preparedBy: "إعداد: أمين المخزن",
  inspectedBy: "فحص: مهندس الجودة",
  approvedBy: "اعتماد: مدير توكيد الجودة",
  signature: "التوقيع والتاريخ",
  reportDate: "تاريخ التقرير",
  officialStamp: "ختم توكيد الجودة - شركة فينا",
};

const dicts: Record<Lang, Dict> = { ar, en };

interface I18nValue {
  lang: Lang;
  dir: "rtl" | "ltr";
  t: (key: keyof typeof en, vars?: Record<string, string | number>) => string;
  toggle: () => void;
}

const I18nContext = createContext<I18nValue | null>(null);

const STORAGE_KEY = "vienna-lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("ar");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "ar") setLang(stored);
  }, []);

  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      dir,
      t: (key, vars) => {
        let out = dicts[lang][key as string] ?? dicts.en[key as string] ?? String(key);
        if (vars) {
          for (const [k, v] of Object.entries(vars)) {
            out = out.replaceAll(`{${k}}`, String(v));
          }
        }
        return out;
      },
      toggle: () => {
        const next: Lang = lang === "ar" ? "en" : "ar";
        setLang(next);
        window.localStorage.setItem(STORAGE_KEY, next);
      },
    }),
    [lang, dir],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}

export type TranslateKey = keyof typeof en;
