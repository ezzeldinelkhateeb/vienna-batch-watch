import { createFileRoute } from "@tanstack/react-router";
import { sendTelegram, sendTelegramPhoto, answerTelegramCallback } from "@/lib/telegram.server";
import { daysUntil, statusFor, DEFAULT_THRESHOLDS } from "@/lib/status";
import { parsePhotos } from "@/lib/photos";
import { generateMorningBriefing, generateLowStockReport } from "@/lib/telegram-reports.server";

interface TelegramMessage {
  message_id: number;
  from?: { id: number; first_name?: string; username?: string };
  chat: { id: number | string; title?: string; type: string };
  date: number;
  text?: string;
  caption?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string; username?: string };
    message?: TelegramMessage;
    data?: string;
  };
}

// Persistent 1-tap Reply Keyboard (Always active at the bottom of the chat)
const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: "📊 تقرير المخزون" }, { text: "🚨 الخامات الحرجة" }],
    [{ text: "🥇 أولوية الصرف (FEFO)" }, { text: "🔒 شحنات الحجر (QC)" }],
    [{ text: "🌅 نشرة وردية الصباح" }, { text: "📉 كشف النواقص" }],
    [{ text: "⚡ فحص الصلاحية الآن" }, { text: "ℹ️ قائمة الأوامر والمساعدة" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

// Keyword banks for single-word / short colloquial queries
const FEFO_KEYWORDS = [
  "صرف", "الصرف", "اصرف", "سحب", "السحب", "فيفو", "ففو", "fefo",
  "اولويه", "أولوية", "اولويات", "أولويات", "اولويه الصرف", "اولويات الصرف",
  "تشغيل", "التشغيل", "انتاج", "الإنتاج", "ترتيب الصرف", "مين عليه الدور", "اصرف ايه", "مين عليه"
];

const URGENT_KEYWORDS = [
  "حرج", "حرجه", "حرجة", "الحرج", "الحرجه", "الحرجة", "طوارئ", "طواري",
  "الطوارئ", "خطر", "الخطر", "قريب", "القريب", "وشيك", "الوشيك", "ينتهي",
  "هينتهي", "هيبوظ", "باظ", "تحذير", "تنبيه", "تنبيهات", "انذار", "إنذار", "urgent", "expiring"
];

const EXPIRED_KEYWORDS = [
  "منتهي", "منتهيه", "منتهية", "المنتهي", "المنتهيه", "المنتهية",
  "اكسباير", "اكسبايرد", "expired", "تالف", "التالف", "هالك", "الهالك",
  "توالف", "التوالف", "بايظ", "بايظه", "باظت"
];

const QC_KEYWORDS = [
  "حجر", "الحجر", "محجوز", "المحجوز", "معلق", "المعلق", "كواليتي",
  "الجودة", "الجوده", "جودة", "جوده", "عينات", "العينات", "تحت الفحص",
  "موقف الجودة", "موقف الجوده", "qc", "quarantine"
];

const REJECTED_KEYWORDS = [
  "مرفوض", "مرفوضه", "مرفوضة", "المرفوض", "المرفوضه", "المرفوضة",
  "مرفوضات", "المرفوضات", "رفض", "الرفض", "rejected"
];

const STATUS_KEYWORDS = [
  "تقرير", "التقرير", "مخزون", "المخزون", "مخزن", "المخزن", "رصيد", "الرصيد",
  "احصائيات", "الاحصائيات", "كام صنف", "كام خامه", "كام خامة", "حاله المخزن",
  "وضع المخزن", "رصيد المخزن", "ملخص", "status", "summary", "stats", "report"
];

const MORNING_KEYWORDS = [
  "صباح", "الصباح", "صباح الخير", "صباحك", "نشره", "نشرة", "النشرة", "النشره",
  "نشرة الصباح", "نشره الصباح", "تقرير الصباح", "وردية", "ورديه", "الوردية", "الورديه",
  "وردية الصباح", "الوردية الصباحية", "morning", "briefing", "shift"
];

const LOWSTOCK_KEYWORDS = [
  "نواقص", "النواقص", "ناقص", "نقص", "النقص", "منخفض", "المنخفض", "رصيد منخفض",
  "رصيد قليل", "قليل", "اعادة طلب", "إعادة طلب", "طلب خامات", "شراء", "المشتريات",
  "lowstock", "reorder"
];

const CHECK_KEYWORDS = [
  "فحص", "الفحص", "شيك", "افحص", "ابعت التنبيهات", "شغل الفحص", "تحديث الصلاحية", "check"
];

const HELP_KEYWORDS = [
  "مساعده", "مساعدة", "المساعدة", "المساعده", "اوامر", "أوامر", "الاوامر", "الأوامر",
  "القائمه", "القائمة", "قائمة", "قائمه", "مين انت", "من انت", "دليل", "تعليمات",
  "ازاي استخدمك", "سلام", "السلام", "مرحبا", "اهلا", "أهلا", "مساء الخير",
  "يا بوت", "help", "menu", "start"
];

export const Route = createFileRoute("/api/public/hooks/telegram-webhook")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(
          JSON.stringify({
            status: "active",
            service: "Vienna Smart AI Telegram Bot Engine v5.0 (Deep NLU & Smart Options)",
            timestamp: new Date().toISOString(),
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as TelegramUpdate;

          // Extract message or callback query
          let chatId: string | null = null;
          let rawText = "";
          let isCallback = false;
          let callbackId: string | undefined;

          if (body.callback_query) {
            isCallback = true;
            callbackId = body.callback_query.id;
            chatId = body.callback_query.message
              ? String(body.callback_query.message.chat.id)
              : body.callback_query.from
                ? String(body.callback_query.from.id)
                : null;
            rawText = (body.callback_query.data || "").trim();
          } else {
            const msg = body.message || body.channel_post || body.edited_message;
            if (msg) {
              chatId = String(msg.chat.id);
              rawText = (msg.text || msg.caption || "").trim();
            }
          }

          if (!chatId || !rawText) {
            return new Response(JSON.stringify({ ok: true }), {
              headers: { "content-type": "application/json" },
            });
          }

          // Get bot token and settings from Supabase
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: settings } = await supabaseAdmin
            .from("app_settings")
            .select("telegram_bot_token, threshold_early, threshold_medium, threshold_critical")
            .maybeSingle();

          const botToken = settings?.telegram_bot_token || process.env["TELEGRAM_BOT_TOKEN"];
          if (!botToken) {
            console.warn("[telegram-webhook] Bot token not configured in app_settings");
            return new Response(JSON.stringify({ ok: true }), {
              headers: { "content-type": "application/json" },
            });
          }

          // Acknowledge callback query immediately to dismiss the button loading spinner!
          if (isCallback && callbackId) {
            await answerTelegramCallback(botToken, callbackId, "جارٍ المعالجة... ⚡");
          }

          const thresholds = {
            early: settings?.threshold_early ?? DEFAULT_THRESHOLDS.early,
            medium: settings?.threshold_medium ?? DEFAULT_THRESHOLDS.medium,
            critical: settings?.threshold_critical ?? DEFAULT_THRESHOLDS.critical,
          };

          // Clean command text (strip bot mentions like @vienna_bot cleanly)
          const cleanCmd = rawText.replace(/@\w+/g, "").trim();
          const firstWord = (cleanCmd.split(/\s+/)[0] || "").toLowerCase();

          // Normalized Arabic for intelligent intent matching
          const normalized = cleanCmd
            .replace(/[إأآ]/g, "ا")
            .replace(/ة/g, "ه")
            .replace(/[ًٌٍَُِّْ]/g, "")
            .toLowerCase();

          let replyText = "";
          let photoUrlToSend: string | null = null;
          let inlineKeyboard: any = null;

          // ==========================================
          // ACTION ROUTE A: ITEM DRILLDOWN VIA BUTTON (item:<id>)
          // ==========================================
          if (cleanCmd.startsWith("item:")) {
            const itemId = cleanCmd.replace(/^item:/, "").trim();
            const { data: item } = await supabaseAdmin
              .from("items")
              .select("*")
              .eq("id", itemId)
              .maybeSingle();

            if (!item) {
              replyText = "⚠️ عذراً، لم يتم العثور على بيانات هذه التشغيلة (قد تكون حذفت أو تم تعديلها).";
            } else {
              const days = daysUntil(item.expiry_date);
              const st = statusFor(days, thresholds);

              // Check FEFO priority for this material
              const { data: siblingBatches } = await supabaseAdmin
                .from("items")
                .select("id, expiry_date, batch_number")
                .eq("name", item.name)
                .eq("qc_status", "approved")
                .order("expiry_date", { ascending: true })
                .limit(1);

              const isFefoPriority = Boolean(siblingBatches && siblingBatches[0]?.id === item.id);
              const report = buildSingleItemReportCard(item, days, st, isFefoPriority);
              replyText = report.text;

              if (item.photo_path) {
                const photos = parsePhotos(item.photo_path);
                if (photos[0]?.path) {
                  const { data: signed } = await supabaseAdmin.storage
                    .from("item-photos")
                    .createSignedUrl(photos[0].path, 3600);
                  if (signed?.signedUrl) {
                    photoUrlToSend = signed.signedUrl;
                  }
                }
              }

              // Build interactive buttons: Quick Actions row + Drilldown navigation row
              const itemButtons: Array<Array<{ text: string; callback_data: string }>> = [];
              const qc = item.qc_status ?? "quarantine";
              const currentStock = Number(item.quantity) || 0;

              // Row 1: Immediate Decisions / Operational Actions
              if (qc === "quarantine") {
                itemButtons.push([
                  { text: "✅ فك الحجر واعتماد", callback_data: `qc_act:approved:${item.id}` },
                  { text: "❌ رفض التشغيلة", callback_data: `qc_act:rejected:${item.id}` },
                ]);
              } else if (qc === "approved") {
                const actionRow: Array<{ text: string; callback_data: string }> = [];
                if (currentStock > 0) {
                  actionRow.push({ text: "🏭 صرف لخط الإنتاج", callback_data: `dispense_prompt:${item.id}` });
                }
                actionRow.push({ text: "🔒 إعادة للحجر", callback_data: `qc_act:quarantine:${item.id}` });
                itemButtons.push(actionRow);
              } else if (qc === "rejected") {
                itemButtons.push([
                  { text: "🔄 إعادة فحص بالحجر", callback_data: `qc_act:quarantine:${item.id}` },
                ]);
              }

              // Row 2 & 3: Navigation & Global Reports
              itemButtons.push([
                { text: `📦 كل دفعات (${item.name.slice(0, 14)})`, callback_data: `mat:${item.name}` },
                { text: "🥇 أولوية الصرف FEFO", callback_data: "/fefo" },
              ]);
              itemButtons.push([
                { text: "📊 تقرير المخزون", callback_data: "/status" },
                { text: "🚨 الخامات الحرجة", callback_data: "/urgent" },
              ]);

              inlineKeyboard = { inline_keyboard: itemButtons };
            }
          }

          // ==========================================
          // ACTION ROUTE B: MATERIAL BATCHES VIA BUTTON (mat:<name>)
          // ==========================================
          else if (cleanCmd.startsWith("mat:")) {
            const materialName = cleanCmd.replace(/^mat:/, "").trim();
            const { data: matched } = await supabaseAdmin
              .from("items")
              .select("*")
              .ilike("name", `%${materialName}%`)
              .order("expiry_date", { ascending: true });

            const results = matched ?? [];
            if (results.length === 0) {
              replyText = `ℹ️ لا توجد تشغيلات مسجلة حالياً للخامة: *"${materialName}"*.`;
            } else {
              const lines = [
                `🍫 *كافة تشغيلات خامة (${materialName}) بالمخزن:*`,
                `_(إجمالي: ${results.length} تشغيلة — مرتبة بأولوية الصرف FEFO)_`,
                "━━━━━━━━━━━━━━━━━━━━━━━━━",
              ];

              const buttonsRow: Array<Array<{ text: string; callback_data: string }>> = [];

              let idx = 1;
              for (const item of results) {
                const days = daysUntil(item.expiry_date);
                const cdText = days < 0 ? `⛔ منتهي منذ ${Math.abs(days)} يوم` : `⏳ متبقٍ ${days} يوم`;
                const qcLabel =
                  item.qc_status === "approved"
                    ? "✅ معتمد"
                    : item.qc_status === "rejected"
                      ? "❌ مرفوض"
                      : "🔒 حجر";

                const fefoBadge = idx === 1 && item.qc_status === "approved" ? " 🥇 [أولوية #1]" : "";

                lines.push(
                  `${idx}. 📦 *تشغيلة #${item.batch_number || item.item_code || "—"}*${fefoBadge}`,
                  `   • الرصيد: *${item.quantity ?? "—"} ${item.unit ?? ""}* | موقع: ${item.storage_location || "المخزن العام"}`,
                  `   • الصلاحية: *${item.expiry_date}* (${cdText}) | ${qcLabel}\n`,
                );

                const label = `🔍 تشغيلة #${(item.batch_number || item.item_code || String(idx)).slice(0, 14)}`;
                buttonsRow.push([{ text: label, callback_data: `item:${item.id}` }]);
                idx++;
              }

              buttonsRow.push([
                { text: "🥇 أولوية الصرف العامة", callback_data: "/fefo" },
                { text: "📊 تقرير المخزون", callback_data: "/status" },
              ]);

              replyText = lines.join("\n");
              inlineKeyboard = { inline_keyboard: buttonsRow.slice(0, 8) };
            }
          }

          // ==========================================
          // ACTION ROUTE C: ALL BATCHES COMBINED (allbatches:<name>)
          // ==========================================
          else if (cleanCmd.startsWith("allbatches:")) {
            const searchTerm = cleanCmd.replace(/^allbatches:/, "").trim();
            const variants = generateSearchVariants(searchTerm);
            const orFilters = variants
              .map((v) => `name.ilike.%${v}%,batch_number.ilike.%${v}%,item_code.ilike.%${v}%`)
              .join(",");

            const { data: matched } = await supabaseAdmin
              .from("items")
              .select("*")
              .or(orFilters)
              .order("expiry_date", { ascending: true })
              .limit(25);

            const results = matched ?? [];
            if (results.length === 0) {
              replyText = `ℹ️ لا توجد تشغيلات مسجلة حالياً لـ *"${searchTerm}"*.`;
            } else {
              const lines = [
                `📋 *كافة تشغيلات "${searchTerm}" بالمخزن (${results.length} تشغيلة):*`,
                "_(مرتبة بأولوية الصرف بالصلاحية FEFO)_",
                "━━━━━━━━━━━━━━━━━━━━━━━━━",
              ];

              const buttonsRow: Array<Array<{ text: string; callback_data: string }>> = [];
              let idx = 1;
              for (const item of results.slice(0, 10)) {
                const days = daysUntil(item.expiry_date);
                const cdText = days < 0 ? `⛔ منتهي منذ ${Math.abs(days)} يوم` : `⏳ متبقٍ ${days} يوم`;
                const qcLabel =
                  item.qc_status === "approved"
                    ? "✅ معتمد"
                    : item.qc_status === "rejected"
                      ? "❌ مرفوض"
                      : "🔒 حجر";

                const fefoTag = idx === 1 && item.qc_status === "approved" ? " 🥇 [أولوية #1]" : "";

                lines.push(
                  `${idx}. 📦 *${item.name}*${fefoTag}`,
                  `   • تشغيلة: \`#${item.batch_number || "—"}\` | كود: \`${item.item_code || "—"}\``,
                  `   • الرصيد: *${item.quantity ?? "—"} ${item.unit ?? ""}* | موقع: ${item.storage_location || "—"}`,
                  `   • الصلاحية: *${item.expiry_date}* (${cdText}) | ${qcLabel}\n`,
                );

                buttonsRow.push([
                  {
                    text: `🔍 فحص تشغيلة #${(item.batch_number || item.item_code || String(idx)).slice(0, 14)}`,
                    callback_data: `item:${item.id}`,
                  },
                ]);
                idx++;
              }

              if (results.length > 10) {
                lines.push(`_... ويوجد ${results.length - 10} تشغيلة أخرى مسجلة._`);
              }

              lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━\n💡 اضغط على زر أي تشغيلة أدناه لعرض بطاقة الجودة والموقع بالكامل:");
              replyText = lines.join("\n");

              buttonsRow.push([
                { text: "🥇 أولوية الصرف FEFO", callback_data: "/fefo" },
                { text: "📊 تقرير المخزون", callback_data: "/status" },
              ]);

              inlineKeyboard = { inline_keyboard: buttonsRow.slice(0, 8) };
            }
          }

          // ==========================================
          // ACTION ROUTE D: QC STATUS CHANGE (qc_act:<status>:<id>)
          // ==========================================
          else if (cleanCmd.startsWith("qc_act:")) {
            const parts = cleanCmd.split(":");
            const targetStatus = parts[1] as "approved" | "rejected" | "quarantine";
            const targetId = parts[2]?.trim();

            if (!targetId || !["approved", "rejected", "quarantine"].includes(targetStatus)) {
              replyText = "⚠️ أمر تعديل حالة الجودة غير مكتمل.";
            } else {
              const { data: item } = await supabaseAdmin
                .from("items")
                .select("id, name, batch_number, qc_status, qc_notes, quantity, unit")
                .eq("id", targetId)
                .maybeSingle();

              if (!item) {
                replyText = "⚠️ تعذر العثور على التشغيلة لتعديل قرار الجودة.";
              } else {
                const fromUser = body.callback_query?.from;
                const actorName = fromUser?.first_name
                  ? `${fromUser.first_name}${fromUser.username ? ` (@${fromUser.username})` : ""}`
                  : "بوت تليجرام";

                const arabicStatus =
                  targetStatus === "approved"
                    ? "اعتماد وفك الحجر"
                    : targetStatus === "rejected"
                      ? "رفض وتجنيب"
                      : "تحويل إلى الحجر المؤقت";

                const dateStr = new Date().toLocaleDateString("ar-EG");
                const newNote = `[${dateStr}] تم ${arabicStatus} عبر تليجرام بواسطة ${actorName}`;
                const combinedNotes = item.qc_notes ? `${item.qc_notes}\n${newNote}` : newNote;

                const { error: updateErr } = await supabaseAdmin
                  .from("items")
                  .update({
                    qc_status: targetStatus,
                    qc_inspected_at: new Date().toISOString(),
                    qc_inspected_by: `Telegram: ${actorName}`,
                    qc_notes: combinedNotes,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", targetId);

                if (updateErr) {
                  replyText = `❌ فشل تحديث حالة التشغيلة: ${updateErr.message}`;
                } else {
                  if (targetStatus === "approved") {
                    replyText =
                      `✅ *تم بنجاح اعتماد وفك الحجر عن التشغيلة!* 🎉\n` +
                      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                      `📦 *الخامة:* *${item.name}*\n` +
                      `🔢 *التشغيلة:* \`#${item.batch_number || "—"}\`\n` +
                      `⚖️ *الرصيد المتاح:* *${item.quantity ?? "—"} ${item.unit ?? "كجم"}*\n` +
                      `👤 *المسؤول المعتمد:* ${actorName}\n` +
                      `⏰ *التوقيت:* ${new Date().toLocaleTimeString("ar-EG")}\n` +
                      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                      `_أصبحت التشغيلة الآن معتمدة وجاهزة للصرف لخطوط الإنتاج والتصنيع._`;

                    inlineKeyboard = {
                      inline_keyboard: [
                        [
                          { text: "🔍 فحص التشغيلة المعتمدة", callback_data: `item:${item.id}` },
                          ...(Number(item.quantity) > 0
                            ? [{ text: "🏭 صرف للإنتاج الآن", callback_data: `dispense_prompt:${item.id}` }]
                            : []),
                        ],
                        [
                          { text: `📦 كل دفعات (${item.name.slice(0, 14)})`, callback_data: `mat:${item.name}` },
                          { text: "🔒 شحنات الحجر المتبقية", callback_data: "/qc" },
                        ],
                        [
                          { text: "🥇 أولوية الصرف FEFO", callback_data: "/fefo" },
                          { text: "📊 تقرير المخزون", callback_data: "/status" },
                        ],
                      ],
                    };
                  } else if (targetStatus === "rejected") {
                    replyText =
                      `⛔ *تم رفض التشغيلة وتجنيبها من الصرف والتصنيع!*\n` +
                      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                      `📦 *الخامة:* *${item.name}*\n` +
                      `🔢 *التشغيلة:* \`#${item.batch_number || "—"}\`\n` +
                      `👤 *المسؤول القائم بالرفض:* ${actorName}\n` +
                      `⏰ *التوقيت:* ${new Date().toLocaleTimeString("ar-EG")}\n` +
                      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                      `_تم تصنيف التشغيلة رسمياً كمرفوضة وتجنيبها لحين اتخاذ قرار الإعدام أو الإرجاع للمورد._`;

                    inlineKeyboard = {
                      inline_keyboard: [
                        [
                          { text: "🔍 بطاقة التشغيلة", callback_data: `item:${item.id}` },
                          { text: "❌ كشف المرفوضات", callback_data: "/rejected" },
                        ],
                        [
                          { text: "🔒 شحنات الحجر", callback_data: "/qc" },
                          { text: "📊 تقرير المخزون", callback_data: "/status" },
                        ],
                      ],
                    };
                  } else {
                    replyText =
                      `🔒 *تم تحويل التشغيلة إلى منطقة الحجر الصحي (Quarantine)*\n` +
                      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                      `📦 *الخامة:* *${item.name}*\n` +
                      `🔢 *التشغيلة:* \`#${item.batch_number || "—"}\`\n` +
                      `👤 *بواسطة:* ${actorName}\n` +
                      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                      `_التشغيلة محجوزة بانتظار سحب العينات وفحص الجودة._`;

                    inlineKeyboard = {
                      inline_keyboard: [
                        [{ text: "🔍 فحص التشغيلة", callback_data: `item:${item.id}` }],
                        [{ text: "🔒 شحنات الحجر", callback_data: "/qc" }],
                      ],
                    };
                  }
                }
              }
            }
          }

          // ==========================================
          // ACTION ROUTE E: DISPENSE PROMPT (dispense_prompt:<id>)
          // ==========================================
          else if (cleanCmd.startsWith("dispense_prompt:")) {
            const targetId = cleanCmd.replace(/^dispense_prompt:/, "").trim();
            const { data: item } = await supabaseAdmin
              .from("items")
              .select("id, name, batch_number, quantity, unit, storage_location, qc_status")
              .eq("id", targetId)
              .maybeSingle();

            if (!item) {
              replyText = "⚠️ تعذر العثور على التشغيلة لبدء عملية الصرف.";
            } else {
              const currentQty = Number(item.quantity) || 0;
              const unit = item.unit || "كجم";

              if (currentQty <= 0) {
                replyText = `⚠️ رصيد تشغيلة *${item.name}* (\`#${item.batch_number || "—"}\`) هو 0 ${unit} بالفعل؛ لا توجد كمية قابلة للصرف.`;
                inlineKeyboard = {
                  inline_keyboard: [
                    [{ text: "🔙 رجوع لبطاقة التشغيلة", callback_data: `item:${item.id}` }],
                  ],
                };
              } else {
                const qtyHalf = Math.round(currentQty * 0.5 * 100) / 100;
                const qtyQuarter = Math.round(currentQty * 0.25 * 100) / 100;

                replyText =
                  `🏭 *تسجيل صرف سريع لخط الإنتاج والتصنيع*\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `📦 *الخامة:* *${item.name}*\n` +
                  `🔢 *التشغيلة:* \`#${item.batch_number || "—"}\`\n` +
                  `⚖️ *الرصيد الحالي بالمخزن:* *${currentQty} ${unit}*\n` +
                  `📍 *موقع التخزين:* ${item.storage_location || "المخزن العام"}\n\n` +
                  `اختر الكمية المراد خصمها وصرفها فوراً للتشغيل:`;

                const dispenseRows: Array<Array<{ text: string; callback_data: string }>> = [
                  [
                    {
                      text: `⚡ صرف كامل الرصيد (${currentQty} ${unit})`,
                      callback_data: `dispense_exec:${item.id}:all`,
                    },
                  ],
                ];

                if (qtyHalf > 0 && qtyHalf < currentQty) {
                  dispenseRows.push([
                    {
                      text: `⚖️ صرف نصف الكمية (${qtyHalf} ${unit})`,
                      callback_data: `dispense_exec:${item.id}:half`,
                    },
                  ]);
                }

                if (qtyQuarter > 0 && qtyQuarter < qtyHalf) {
                  dispenseRows.push([
                    {
                      text: `🧪 صرف ربع الكمية (${qtyQuarter} ${unit})`,
                      callback_data: `dispense_exec:${item.id}:quarter`,
                    },
                  ]);
                }

                dispenseRows.push([
                  { text: "🔙 إلغاء والرجوع", callback_data: `item:${item.id}` },
                ]);

                inlineKeyboard = { inline_keyboard: dispenseRows };
              }
            }
          }

          // ==========================================
          // ACTION ROUTE F: DISPENSE EXECUTION (dispense_exec:<id>:<ratio>)
          // ==========================================
          else if (cleanCmd.startsWith("dispense_exec:")) {
            const parts = cleanCmd.split(":");
            const targetId = parts[1]?.trim();
            const ratio = parts[2]?.trim();

            const { data: item } = await supabaseAdmin
              .from("items")
              .select("id, name, batch_number, quantity, unit, storage_location")
              .eq("id", targetId)
              .maybeSingle();

            if (!item) {
              replyText = "⚠️ تعذر العثور على التشغيلة لتنفيذ الصرف.";
            } else {
              const currentQty = Number(item.quantity) || 0;
              const unit = item.unit || "كجم";

              let qtyToDispense = 0;
              if (ratio === "all") {
                qtyToDispense = currentQty;
              } else if (ratio === "half") {
                qtyToDispense = Math.round(currentQty * 0.5 * 100) / 100;
              } else if (ratio === "quarter") {
                qtyToDispense = Math.round(currentQty * 0.25 * 100) / 100;
              } else {
                qtyToDispense = parseFloat(ratio || "0") || 0;
              }

              if (qtyToDispense <= 0 || qtyToDispense > currentQty) {
                replyText = `⚠️ الكمية المطلوب صرفها (${qtyToDispense} ${unit}) غير صحيحة أو تتجاوز الرصيد الحالي (${currentQty} ${unit}).`;
                inlineKeyboard = {
                  inline_keyboard: [
                    [{ text: "🔙 رجوع لبطاقة التشغيلة", callback_data: `item:${item.id}` }],
                  ],
                };
              } else {
                const remainingQty = Math.max(0, Math.round((currentQty - qtyToDispense) * 100) / 100);

                // 1. Update items table
                const { error: updateErr } = await supabaseAdmin
                  .from("items")
                  .update({
                    quantity: remainingQty,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", item.id);

                if (updateErr) {
                  replyText = `❌ فشل تحديث الرصيد: ${updateErr.message}`;
                } else {
                  // 2. Insert into stock_movements
                  const fromUser = body.callback_query?.from;
                  const actorName = fromUser?.first_name
                    ? `${fromUser.first_name}${fromUser.username ? ` (@${fromUser.username})` : ""}`
                    : "بوت تليجرام";

                  await supabaseAdmin.from("stock_movements").insert({
                    item_id: item.id,
                    item_name: item.name,
                    batch_number: item.batch_number || null,
                    movement_type: "production_dispense",
                    quantity_dispensed: qtyToDispense,
                    unit: unit,
                    previous_quantity: currentQty,
                    remaining_quantity: remainingQty,
                    production_line: "صرف إنتاج (أزرار تليجرام السريعة)",
                    recipient_name: actorName,
                    notes: "تم تسجيل الصرف بنقرة واحدة عبر تليجرام",
                  });

                  replyText =
                    `🏭 *تم بنجاح تسجيل صرف الخامات للإنتاج!* ✨\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `📦 *الخامة:* *${item.name}*\n` +
                    `🔢 *التشغيلة:* \`#${item.batch_number || "—"}\`\n` +
                    `➖ *الكمية المصروفة:* *${qtyToDispense} ${unit}*\n` +
                    `📊 *الرصيد المتبقي بالمخزن:* *${remainingQty} ${unit}*\n` +
                    `👤 *القائم بالصرف:* ${actorName}\n` +
                    `⏰ *التوقيت:* ${new Date().toLocaleTimeString("ar-EG")}\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `_تم خصم الكمية من المخزون وتوثيق حركة في سجل حركات المخزن فوراً._`;

                  inlineKeyboard = {
                    inline_keyboard: [
                      [{ text: "🔍 فحص رصيد التشغيلة الآن", callback_data: `item:${item.id}` }],
                      [{ text: `📦 كل دفعات (${item.name.slice(0, 14)})`, callback_data: `mat:${item.name}` }],
                      [{ text: "🥇 أولوية الصرف FEFO", callback_data: "/fefo" }],
                      [{ text: "📊 تقرير المخزون", callback_data: "/status" }],
                    ],
                  };
                }
              }
            }
          }

          // ==========================================
          // MORNING SHIFT BRIEFING (/morning)
          // ==========================================
          else if (
            firstWord === "/morning" ||
            rawText === "🌅 نشرة وردية الصباح" ||
            matchesAnyKeyword(normalized, MORNING_KEYWORDS)
          ) {
            const { data: allItems } = await supabaseAdmin
              .from("items")
              .select("id, name, item_code, batch_number, quantity, unit, expiry_date, storage_location, qc_status, supplier")
              .order("expiry_date", { ascending: true });

            const briefing = generateMorningBriefing(allItems || [], thresholds);
            replyText = briefing.text;
            inlineKeyboard = briefing.reply_markup;
          }

          // ==========================================
          // LOW STOCK / REORDER ALERT (/lowstock)
          // ==========================================
          else if (
            firstWord === "/lowstock" ||
            rawText === "📉 كشف النواقص" ||
            matchesAnyKeyword(normalized, LOWSTOCK_KEYWORDS)
          ) {
            const { data: allItems } = await supabaseAdmin
              .from("items")
              .select("id, name, item_code, batch_number, quantity, unit, expiry_date, storage_location, qc_status, supplier")
              .order("expiry_date", { ascending: true });

            const lowStock = generateLowStockReport(allItems || []);
            replyText = lowStock.text;
            inlineKeyboard = lowStock.reply_markup;
          }

          // ==========================================
          // 1. HELP & START & GREETINGS
          // ==========================================
          else if (
            firstWord === "/start" ||
            firstWord === "/help" ||
            firstWord === "/menu" ||
            rawText === "ℹ️ قائمة الأوامر والمساعدة" ||
            matchesAnyKeyword(normalized, HELP_KEYWORDS)
          ) {
            replyText =
              "🍫 *مرحباً بك في بوت الجودة والتشغيل الذكي — مصنع فيينا* 🍫\n" +
              "Vienna Biscuit & Chocolate Factory — AI Bot v5.0\n" +
              "━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
              "أنا مساعدك الذكي لإدارة المخزون وفحص الصلاحيات والجودة. يمكنك كتابة أي كلمة مفردة أو سؤال وسأفهم طلبك فوراً:\n\n" +
              "✨ *القدرات الذكية والإجراءات الفورية:*\n" +
              "• *ارسل كلمة مفردة* (مثال: `كاكاو`، `سكر`) ⬅️ إذا كانت الكلمة مشتركة في عدة أصناف، أعرض لك خيارات تفاعلية بنقرة واحدة!\n" +
              "• *ارسل رقم تشغيلة* (مثال: `B-101`) ⬅️ يعرض بطاقة الفحص الشاملة مع أزرار فورية لـ (فك الحجر - الرفض - الصرف للإنتاج).\n" +
              "• *إجراءات فورية بالأزرار*: اعتماد وفك الحجر أو صرف الكميات لخط الإنتاج بنقرة زر دون فتح المتصفح!\n\n" +
              "🔘 *الأوامر السريعة في تليجرام:*\n" +
              "🌅 */morning* — نشرة وردية الصباح وخطة خامات اليوم\n" +
              "📉 */lowstock* — كشف النواقص والأصناف قاربت على النفاد\n" +
              "📊 */status* — ملخص شامل للمخزون والصلاحيات\n" +
              "🚨 */urgent* — الخامات الحرجة والمنتهية فوراً\n" +
              "🥇 */fefo* — أولوية الصرف لخطوط التصنيع\n" +
              "🔒 */qc* — شحنات الحجر وبانتظار اعتماد الجودة\n" +
              "⛔ */expired* — كشف الخامات المنتهية الصلاحية\n" +
              "❌ */rejected* — كشف الخامات المرفوضة والتوالف\n" +
              "⚡ */check* — تشغيل فحص فوري وإرسال التنبيهات الآن";

            inlineKeyboard = {
              inline_keyboard: [
                [
                  { text: "🌅 نشرة وردية الصباح", callback_data: "/morning" },
                  { text: "📉 كشف النواقص", callback_data: "/lowstock" },
                ],
                [
                  { text: "📊 تقرير المخزون", callback_data: "/status" },
                  { text: "🚨 الخامات الحرجة", callback_data: "/urgent" },
                ],
                [
                  { text: "🥇 أولوية الصرف (FEFO)", callback_data: "/fefo" },
                  { text: "🔒 شحنات الحجر (QC)", callback_data: "/qc" },
                ],
                [
                  { text: "⛔ المنتهية فقط", callback_data: "/expired" },
                  { text: "⚡ فحص الصلاحية الآن", callback_data: "/check" },
                ],
              ],
            };
          }

          // ==========================================
          // 2. FEFO DISPATCH PRIORITY (أولوية الصرف)
          // ==========================================
          else if (
            firstWord === "/fefo" ||
            rawText === "🥇 أولوية الصرف (FEFO)" ||
            matchesAnyKeyword(normalized, FEFO_KEYWORDS)
          ) {
            const { data: items } = await supabaseAdmin
              .from("items")
              .select("id, name, item_code, batch_number, quantity, unit, expiry_date, storage_location, qc_status")
              .eq("qc_status", "approved")
              .order("expiry_date", { ascending: true });

            const validItems = (items ?? []).filter((i) => daysUntil(i.expiry_date) >= 0);

            // Group by material name and take earliest batch
            const fefoGroups = new Map<string, (typeof validItems)[0]>();
            for (const item of validItems) {
              const key = item.name.trim().toLowerCase();
              if (!fefoGroups.has(key)) {
                fefoGroups.set(key, item);
              }
            }

            const priorityBatches = Array.from(fefoGroups.values());

            if (priorityBatches.length === 0) {
              replyText = "ℹ️ لا توجد خامات معتمدة ومتاحة للصرف حالياً في النظام.";
            } else {
              const lines = [
                "🥇 *قائمة أولوية الصرف لخطوط التصنيع (FEFO #1):*",
                "_(First Expired, First Out — الأقرب انتهاءً يصرف أولاً)_",
                "━━━━━━━━━━━━━━━━━━━━━━━━━",
              ];

              const itemButtons: Array<Array<{ text: string; callback_data: string }>> = [];

              let rank = 1;
              for (const item of priorityBatches.slice(0, 8)) {
                const days = daysUntil(item.expiry_date);
                const cdText = days === 0 ? "ينتهي اليوم!" : `${days} يوم متبقٍ`;
                lines.push(
                  `${rank}. 🍫 *${item.name}*`,
                  `   • تشغيلة أولوية #1: \`#${item.batch_number || item.item_code || "—"}\``,
                  `   • الرصيد: *${item.quantity ?? "—"} ${item.unit ?? ""}* | موقع: ${item.storage_location || "المخزن العام"}`,
                  `   • الصلاحية: *${item.expiry_date}* (${cdText})\n`,
                );

                itemButtons.push([
                  {
                    text: `🔍 فحص ${item.name.slice(0, 14)} (#${(item.batch_number || item.item_code || "").slice(0, 8)})`,
                    callback_data: `item:${item.id}`,
                  },
                ]);
                rank++;
              }

              if (priorityBatches.length > 8) {
                lines.push(`_... ويوجد ${priorityBatches.length - 8} خامة أخرى مسجلة._`);
              }

              lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━\n⚠️ *ملاحظة:* يُرجى الالتزام بهذه التشغيلات لمنع هدر الخامات.");
              replyText = lines.join("\n");

              itemButtons.push([
                { text: "📊 تقرير المخزون", callback_data: "/status" },
                { text: "🚨 الخامات الحرجة", callback_data: "/urgent" },
              ]);

              inlineKeyboard = { inline_keyboard: itemButtons };
            }
          }

          // ==========================================
          // 3. SUMMARY & STATUS
          // ==========================================
          else if (
            firstWord === "/status" ||
            firstWord === "/summary" ||
            firstWord === "/report" ||
            firstWord === "/stats" ||
            rawText === "📊 تقرير المخزون" ||
            matchesAnyKeyword(normalized, STATUS_KEYWORDS)
          ) {
            const { data: items } = await supabaseAdmin
              .from("items")
              .select("id, expiry_date, qc_status");

            const allItems = items ?? [];
            const total = allItems.length;

            let normal = 0;
            let early = 0;
            let medium = 0;
            let critical = 0;
            let expired = 0;

            let approved = 0;
            let quarantine = 0;
            let rejected = 0;
            let conditional = 0;

            for (const item of allItems) {
              const days = daysUntil(item.expiry_date);
              const st = statusFor(days, thresholds);
              if (st === "normal") normal++;
              else if (st === "early") early++;
              else if (st === "medium") medium++;
              else if (st === "critical") critical++;
              else if (st === "expired") expired++;

              const qc = item.qc_status ?? "quarantine";
              if (qc === "approved") approved++;
              else if (qc === "quarantine") quarantine++;
              else if (qc === "rejected") rejected++;
              else if (qc === "conditional") conditional++;
            }

            replyText =
              "📊 *تقرير الجودة والمخزون الحالي — Vienna Factory* 📊\n" +
              "━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
              `📦 *إجمالي التشغيلات المسجلة:* ${total}\n\n` +
              "🛡️ *موقف فحص الجودة (QC Status):*\n" +
              `• ✅ معتمد للإفراج: *${approved}*\n` +
              `• 🔒 تحت الحجر (Quarantine): *${quarantine}*\n` +
              `• ⚠️ قبول مشروط: *${conditional}*\n` +
              `• ❌ دفعات مرفوضة: *${rejected}*\n\n` +
              "⏰ *موقف الصلاحية (Expiry Status):*\n" +
              `• 🟢 حالة آمنة وممتازة: *${normal}*\n` +
              `• 🟡 تنبيه مبكر (≤ ${thresholds.early} يوم): *${early}*\n` +
              `• 🟠 تحذير متوسط (≤ ${thresholds.medium} يوم): *${medium}*\n` +
              `• 🚨 إنذار حرج (≤ ${thresholds.critical} يوم): *${critical}*\n` +
              `• ⛔ منتهي الصلاحية: *${expired}*\n` +
              "━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
              (critical > 0 || expired > 0
                ? `⚠️ *تنبيه:* يوجد *${critical + expired}* تشغيلة حرجة/منتهية! اضغط الزر أدناه لمعاينتها فوراً.`
                : "✅ جميع الخامات في نطاق تشغيل آمن وسليم ومطابق للمواصفات.");

            inlineKeyboard = {
              inline_keyboard: [
                [
                  { text: "🚨 الخامات الحرجة والمنتهية", callback_data: "/urgent" },
                  { text: "🥇 أولوية الصرف (FEFO)", callback_data: "/fefo" },
                ],
                [
                  { text: "🔒 شحنات الحجر (QC)", callback_data: "/qc" },
                  { text: "⛔ المنتهية فقط", callback_data: "/expired" },
                ],
                [
                  { text: "⚡ تشغيل فحص فوري", callback_data: "/check" },
                  { text: "🔄 تحديث التقرير", callback_data: "/status" },
                ],
              ],
            };
          }

          // ==========================================
          // 4. URGENT & EXPIRING
          // ==========================================
          else if (
            firstWord === "/urgent" ||
            firstWord === "/expiring" ||
            rawText === "🚨 الخامات الحرجة" ||
            matchesAnyKeyword(normalized, URGENT_KEYWORDS)
          ) {
            const { data: items } = await supabaseAdmin
              .from("items")
              .select("id, name, item_code, batch_number, quantity, unit, expiry_date, storage_location, qc_status")
              .order("expiry_date", { ascending: true });

            const urgentItems = (items ?? [])
              .map((item) => {
                const days = daysUntil(item.expiry_date);
                const st = statusFor(days, thresholds);
                return { item, days, st };
              })
              .filter(({ st }) => st !== "normal");

            if (urgentItems.length === 0) {
              replyText = "🎉 ممتاز جداً! لا توجد حالياً أي خامات منتهية أو حرجة في مصنع فيينا.";
              inlineKeyboard = {
                inline_keyboard: [
                  [
                    { text: "📊 تقرير المخزون", callback_data: "/status" },
                    { text: "🥇 أولوية الصرف FEFO", callback_data: "/fefo" },
                  ],
                ],
              };
            } else {
              const lines = [
                `🚨 *قائمة الخامات الحرجة والوشيكة (${urgentItems.length} تشغيلة):*`,
                "━━━━━━━━━━━━━━━━━━━━━━━━━",
              ];

              const urgentButtons: Array<Array<{ text: string; callback_data: string }>> = [];

              for (const { item, days, st } of urgentItems.slice(0, 8)) {
                const badge =
                  st === "expired"
                    ? "⛔ [منتهي الصلاحية]"
                    : st === "critical"
                      ? "🚨 [إنذار حرج]"
                      : st === "medium"
                        ? "🟠 [تحذير متوسط]"
                        : "🟡 [تنبيه مبكر]";

                const cdText = days < 0 ? `منتهي منذ ${Math.abs(days)} يوم` : `${days} يوم متبقٍ`;
                lines.push(
                  `• ${badge} *${item.name}*`,
                  `  🏷️ كود: \`${item.item_code || "—"}\` | تشغيلة: \`#${item.batch_number || "—"}\``,
                  `  ⚖️ كمية: *${item.quantity ?? "—"} ${item.unit ?? ""}* | 📍 موقع: ${item.storage_location || "—"}`,
                  `  📅 انتهاء: *${item.expiry_date}* (${cdText})\n`,
                );

                urgentButtons.push([
                  {
                    text: `🔍 فحص ${item.name.slice(0, 14)} (#${(item.batch_number || item.item_code || "").slice(0, 8)})`,
                    callback_data: `item:${item.id}`,
                  },
                ]);
              }

              if (urgentItems.length > 8) {
                lines.push(`_... ويوجد ${urgentItems.length - 8} خامة أخرى مسجلة في لوحة التحكم._`);
              }

              lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━\n📋 *توجيه:* امنح أولوية الصرف لهذه الخامات وفق قاعدة FEFO.");
              replyText = lines.join("\n");

              urgentButtons.push([
                { text: "🥇 أولوية الصرف FEFO", callback_data: "/fefo" },
                { text: "⛔ المنتهية فقط", callback_data: "/expired" },
              ]);
              urgentButtons.push([
                { text: "📊 تقرير المخزون", callback_data: "/status" },
                { text: "⚡ فحص وإرسال تنبيه", callback_data: "/check" },
              ]);

              inlineKeyboard = { inline_keyboard: urgentButtons };
            }
          }

          // ==========================================
          // 5. EXPIRED ONLY
          // ==========================================
          else if (
            firstWord === "/expired" ||
            matchesAnyKeyword(normalized, EXPIRED_KEYWORDS)
          ) {
            const { data: items } = await supabaseAdmin
              .from("items")
              .select("id, name, item_code, batch_number, quantity, unit, expiry_date, storage_location, qc_status")
              .order("expiry_date", { ascending: true });

            const expiredItems = (items ?? []).filter((i) => daysUntil(i.expiry_date) < 0);

            if (expiredItems.length === 0) {
              replyText = "✅ ممتاز! لا توجد أي خامة منتهية الصلاحية مسجلة في النظام حالياً.";
              inlineKeyboard = {
                inline_keyboard: [
                  [
                    { text: "🚨 الخامات الحرجة", callback_data: "/urgent" },
                    { text: "📊 تقرير المخزون", callback_data: "/status" },
                  ],
                ],
              };
            } else {
              const lines = [
                `⛔ *كشف الخامات منتهية الصلاحية (${expiredItems.length} تشغيلة):*`,
                "_(يُحظر صرفها لخطوط الإنتاج فوراً ويجب عزلها في الحجر)_",
                "━━━━━━━━━━━━━━━━━━━━━━━━━",
              ];

              const expButtons: Array<Array<{ text: string; callback_data: string }>> = [];

              for (const item of expiredItems.slice(0, 8)) {
                const days = Math.abs(daysUntil(item.expiry_date));
                lines.push(
                  `• ⛔ *${item.name}*`,
                  `  🔢 تشغيلة: \`#${item.batch_number || "—"}\` | كود: \`${item.item_code || "—"}\``,
                  `  ⚖️ كمية: *${item.quantity ?? "—"} ${item.unit ?? ""}* | موقع: ${item.storage_location || "—"}`,
                  `  📅 تاريخ الانتهاء: *${item.expiry_date}* (منتهي منذ ${days} يوم)\n`,
                );

                expButtons.push([
                  {
                    text: `🔍 فحص ${item.name.slice(0, 14)} (#${(item.batch_number || item.item_code || "").slice(0, 8)})`,
                    callback_data: `item:${item.id}`,
                  },
                ]);
              }

              if (expiredItems.length > 8) {
                lines.push(`_... ويوجد ${expiredItems.length - 8} تشغيلة منتهية أخرى._`);
              }

              lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━\n🔒 يرجى التنسيق مع فريق الجودة والمخازن للإعدام أو الإرجاع.");
              replyText = lines.join("\n");

              expButtons.push([
                { text: "📊 تقرير المخزون", callback_data: "/status" },
                { text: "🔒 شحنات الحجر", callback_data: "/qc" },
              ]);

              inlineKeyboard = { inline_keyboard: expButtons };
            }
          }

          // ==========================================
          // 6. QC QUARANTINE INSPECTION
          // ==========================================
          else if (
            firstWord === "/qc" ||
            rawText === "🔒 شحنات الحجر (QC)" ||
            matchesAnyKeyword(normalized, QC_KEYWORDS)
          ) {
            const { data: quarantineItems } = await supabaseAdmin
              .from("items")
              .select("id, name, item_code, batch_number, quantity, unit, expiry_date, storage_location, supplier")
              .eq("qc_status", "quarantine")
              .order("created_at", { ascending: false });

            const list = quarantineItems ?? [];
            if (list.length === 0) {
              replyText = "✅ لا توجد أي شحنات في الحجر الصحي حالياً. جميع الخامات مفحوصة ومعتمدة!";
              inlineKeyboard = {
                inline_keyboard: [
                  [
                    { text: "📊 تقرير المخزون", callback_data: "/status" },
                    { text: "🥇 أولوية FEFO", callback_data: "/fefo" },
                  ],
                ],
              };
            } else {
              const lines = [
                `🔒 *شحنات بانتظار فحص واعتماد الجودة (${list.length} تشغيلة):*`,
                "━━━━━━━━━━━━━━━━━━━━━━━━━",
              ];

              const qcButtons: Array<Array<{ text: string; callback_data: string }>> = [];

              for (const item of list.slice(0, 8)) {
                lines.push(
                  `• 📦 *${item.name}*`,
                  `  🔢 تشغيلة: \`#${item.batch_number || "—"}\` | كود: \`${item.item_code || "—"}\``,
                  `  🏢 مورد: ${item.supplier || "—"} | ⚖️ كمية: *${item.quantity ?? "—"} ${item.unit ?? ""}*`,
                  `  📍 موقع: ${item.storage_location || "—"} | 📅 انتهاء: *${item.expiry_date}*\n`,
                );

                qcButtons.push([
                  {
                    text: `🔍 فحص ${item.name.slice(0, 14)} (#${(item.batch_number || item.item_code || "").slice(0, 8)})`,
                    callback_data: `item:${item.id}`,
                  },
                ]);
              }

              if (list.length > 8) {
                lines.push(`_... ويوجد ${list.length - 8} شحنة أخرى في الحجر._`);
              }
              replyText = lines.join("\n");

              qcButtons.push([
                { text: "📊 تقرير المخزون", callback_data: "/status" },
                { text: "🥇 أولوية الصرف FEFO", callback_data: "/fefo" },
              ]);

              inlineKeyboard = { inline_keyboard: qcButtons };
            }
          }

          // ==========================================
          // 7. REJECTED ITEMS (المرفوضات)
          // ==========================================
          else if (
            firstWord === "/rejected" ||
            matchesAnyKeyword(normalized, REJECTED_KEYWORDS)
          ) {
            const { data: rejectedItems } = await supabaseAdmin
              .from("items")
              .select("id, name, item_code, batch_number, quantity, unit, expiry_date, storage_location, qc_notes")
              .eq("qc_status", "rejected")
              .order("created_at", { ascending: false });

            const list = rejectedItems ?? [];
            if (list.length === 0) {
              replyText = "✅ ممتاز! لا توجد أي خامات أو تشغيلات مرفوضة في النظام حالياً.";
              inlineKeyboard = {
                inline_keyboard: [
                  [
                    { text: "📊 تقرير المخزون", callback_data: "/status" },
                    { text: "🥇 أولوية FEFO", callback_data: "/fefo" },
                  ],
                ],
              };
            } else {
              const lines = [
                `❌ *كشف الخامات المرفوضة من الجودة (${list.length} تشغيلة):*`,
                "_(يُحظر استخدامها تماماً ويجب التحفظ عليها لإجراءات الإعدام/الإرجاع)_",
                "━━━━━━━━━━━━━━━━━━━━━━━━━",
              ];

              const rejButtons: Array<Array<{ text: string; callback_data: string }>> = [];

              for (const item of list.slice(0, 8)) {
                lines.push(
                  `• ❌ *${item.name}*`,
                  `  🔢 تشغيلة: \`#${item.batch_number || "—"}\` | كود: \`${item.item_code || "—"}\``,
                  `  ⚖️ كمية: *${item.quantity ?? "—"} ${item.unit ?? ""}* | موقع: ${item.storage_location || "—"}`,
                  item.qc_notes ? `  📝 سبب الرفض: _${item.qc_notes}_\n` : "\n",
                );

                rejButtons.push([
                  {
                    text: `🔍 فحص ${item.name.slice(0, 14)} (#${(item.batch_number || item.item_code || "").slice(0, 8)})`,
                    callback_data: `item:${item.id}`,
                  },
                ]);
              }

              replyText = lines.join("\n");
              rejButtons.push([
                { text: "📊 تقرير المخزون", callback_data: "/status" },
                { text: "🔒 شحنات الحجر", callback_data: "/qc" },
              ]);

              inlineKeyboard = { inline_keyboard: rejButtons };
            }
          }

          // ==========================================
          // 8. TRIGGER IMMEDIATE EXPIRY CHECK
          // ==========================================
          else if (
            firstWord === "/check" ||
            rawText === "⚡ فحص الصلاحية الآن" ||
            matchesAnyKeyword(normalized, CHECK_KEYWORDS)
          ) {
            const { runExpiryCheckEngine } = await import("@/lib/whatsapp.functions");
            const result = await runExpiryCheckEngine();
            replyText =
              "⚡ *تم تشغيل محرك فحص الصلاحية الفوري بنجاح!* ⚡\n" +
              "━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
              `🔍 تم فحص: *${result.checked}* تشغيلة\n` +
              `📨 تنبيهات واتساب المرسلة: *${result.sentWhatsApp}*\n` +
              `📨 تنبيهات تليجرام المرسلة: *${result.sentTelegram}*\n` +
              `⏭️ تم تخطي (مسبقة الإرسال): *${result.skipped}*\n` +
              "━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
              "✅ تم إرسال التنبيهات اللازمة للمجموعات والمسؤولين بنجاح.";

            inlineKeyboard = {
              inline_keyboard: [
                [
                  { text: "🚨 عرض الخامات الحرجة", callback_data: "/urgent" },
                  { text: "📊 تقرير المخزون", callback_data: "/status" },
                ],
                [
                  { text: "🥇 أولوية الصرف FEFO", callback_data: "/fefo" },
                ],
              ],
            };
          }

          // ==========================================
          // 9. SMART PRODUCT & BATCH DATA PARSER (DEEP SEARCH & MULTI-PRODUCT OPTIONS)
          // ==========================================
          else {
            // Extract distinct search tokens from user's message
            const tokens = extractSearchTokens(rawText);

            if (tokens.length === 0) {
              replyText =
                "🍫 مرحباً بك في Vienna Batch Watch! اكتب رقم أي تشغيلة أو كود أو اسم أي خامة للبحث الفوري، أو اضغط الزر أدناه لعرض الأوامر.";
              inlineKeyboard = {
                inline_keyboard: [
                  [
                    { text: "📊 تقرير المخزون", callback_data: "/status" },
                    { text: "🚨 الخامات الحرجة", callback_data: "/urgent" },
                  ],
                  [
                    { text: "🥇 أولوية الصرف FEFO", callback_data: "/fefo" },
                    { text: "ℹ️ دليل الأوامر", callback_data: "/help" },
                  ],
                ],
              };
            } else if (tokens.length === 1) {
              // --- SINGLE TOKEN QUERY ---
              const token = tokens[0]!;
              const variants = generateSearchVariants(token);

              // Build comprehensive OR filter using all morphological variants
              const orFilters = variants
                .map(
                  (v) =>
                    `batch_number.ilike.%${v}%,item_code.ilike.%${v}%,name.ilike.%${v}%,coa_number.ilike.%${v}%,supplier.ilike.%${v}%,storage_location.ilike.%${v}%`,
                )
                .join(",");

              const { data: matched } = await supabaseAdmin
                .from("items")
                .select("*")
                .or(orFilters)
                .order("expiry_date", { ascending: true })
                .limit(40);

              const results = matched ?? [];

              if (results.length === 0) {
                replyText =
                  `❓ لم أتمكن من العثور على أي تشغيلة أو خامة مطابقة لـ: *"${token}"*.\n\n` +
                  "💡 تأكد من كتابة رقم التشغيلة أو كود الصنف بدقة، أو ابحث باسم الخامة (مثل: كاكاو، سكر، دقيق).";

                inlineKeyboard = {
                  inline_keyboard: [
                    [
                      { text: "📊 تقرير المخزون الشامل", callback_data: "/status" },
                      { text: "🚨 الخامات الحرجة", callback_data: "/urgent" },
                    ],
                    [
                      { text: "🥇 أولوية الصرف FEFO", callback_data: "/fefo" },
                    ],
                  ],
                };
              } else {
                // Group results by distinct product name (trimmed)
                const productMap = new Map<string, typeof results>();
                for (const item of results) {
                  const pName = item.name.trim();
                  if (!productMap.has(pName)) {
                    productMap.set(pName, []);
                  }
                  productMap.get(pName)!.push(item);
                }

                // ==========================================
                // 💡 SMART MULTI-PRODUCT BRANCH:
                // If the word matches MULTIPLE DISTINCT PRODUCTS,
                // present intelligent options/buttons so the user can choose directly!
                // ==========================================
                if (productMap.size > 1) {
                  replyText =
                    `🔍 كلمة *"${token}"* مشتركة في *${productMap.size}* منتجات مسجلة بمصنع فيينا:\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `يرجى اختيار الصنف المطلوب لمعاينة تشغيلاته وموقف الجودة والصرف:`;

                  const productButtons: Array<Array<{ text: string; callback_data: string }>> = [];
                  for (const [prodName, batches] of productMap.entries()) {
                    const hasCritical = batches.some((b) => daysUntil(b.expiry_date) <= thresholds.critical);
                    const icon = hasCritical ? "🚨" : "🍫";
                    const label = `${icon} ${prodName.slice(0, 24)} (${batches.length} تشغيلة)`;
                    productButtons.push([{ text: label, callback_data: `mat:${prodName}` }]);
                  }

                  // Add option to view all batches combined
                  productButtons.push([
                    {
                      text: `📋 عرض كل التشغيلات معاً (${results.length} تشغيلة)`,
                      callback_data: `allbatches:${token}`,
                    },
                  ]);
                  productButtons.push([
                    { text: "📊 تقرير المخزون", callback_data: "/status" },
                    { text: "🥇 أولوية الصرف FEFO", callback_data: "/fefo" },
                  ]);

                  inlineKeyboard = { inline_keyboard: productButtons.slice(0, 8) };
                } else if (results.length === 1 && results[0]) {
                  // Single product, exactly 1 batch -> Ultra Detailed Report Card!
                  const item = results[0];
                  const days = daysUntil(item.expiry_date);
                  const st = statusFor(days, thresholds);

                  const { data: siblingBatches } = await supabaseAdmin
                    .from("items")
                    .select("id, expiry_date, batch_number")
                    .eq("name", item.name)
                    .eq("qc_status", "approved")
                    .order("expiry_date", { ascending: true })
                    .limit(1);

                  const isFefoPriority = Boolean(siblingBatches && siblingBatches[0]?.id === item.id);
                  const report = buildSingleItemReportCard(item, days, st, isFefoPriority);
                  replyText = report.text;

                  if (item.photo_path) {
                    const photos = parsePhotos(item.photo_path);
                    if (photos[0]?.path) {
                      const { data: signed } = await supabaseAdmin.storage
                        .from("item-photos")
                        .createSignedUrl(photos[0].path, 3600);
                      if (signed?.signedUrl) {
                        photoUrlToSend = signed.signedUrl;
                      }
                    }
                  }

                  inlineKeyboard = {
                    inline_keyboard: [
                      [
                        { text: `📦 كل تشغيلات (${item.name.slice(0, 16)})`, callback_data: `mat:${item.name}` },
                        { text: "🥇 أولوية الصرف FEFO", callback_data: "/fefo" },
                      ],
                      [
                        { text: "📊 تقرير المخزون", callback_data: "/status" },
                        { text: "🚨 الخامات الحرجة", callback_data: "/urgent" },
                      ],
                    ],
                  };
                } else {
                  // Single product, multiple batches -> FEFO order list with 1-tap inspection buttons!
                  const firstItem = results[0]!;
                  const lines = [
                    `🔍 *تشغيلات (${firstItem.name}) بالمخزن (${results.length} تشغيلة):*`,
                    "_(مرتبة بأولوية الصرف بالصلاحية FEFO)_",
                    "━━━━━━━━━━━━━━━━━━━━━━━━━",
                  ];

                  const buttonsRow: Array<Array<{ text: string; callback_data: string }>> = [];

                  let idx = 1;
                  for (const item of results) {
                    const days = daysUntil(item.expiry_date);
                    const cdText = days < 0 ? `⛔ منتهي منذ ${Math.abs(days)} يوم` : `⏳ متبقٍ ${days} يوم`;
                    const qcLabel =
                      item.qc_status === "approved"
                        ? "✅ معتمد"
                        : item.qc_status === "rejected"
                          ? "❌ مرفوض"
                          : "🔒 تحت الحجر";

                    const fefoTag = idx === 1 && item.qc_status === "approved" ? " 🥇 [أولوية #1]" : "";

                    lines.push(
                      `${idx}. 📦 *تشغيلة #${item.batch_number || "—"}*${fefoTag}`,
                      `   • كود: \`${item.item_code || "—"}\` | رصيد: *${item.quantity ?? "—"} ${item.unit ?? ""}*`,
                      `   • موقع: ${item.storage_location || "المخزن العام"}`,
                      `   • الصلاحية: *${item.expiry_date}* (${cdText}) | ${qcLabel}\n`,
                    );

                    buttonsRow.push([
                      {
                        text: `🔍 فحص تشغيلة #${(item.batch_number || item.item_code || String(idx)).slice(0, 14)}`,
                        callback_data: `item:${item.id}`,
                      },
                    ]);
                    idx++;
                  }

                  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━\n💡 اضغط على زر أي تشغيلة أدناه لعرض بطاقة الجودة والموقع بالكامل:");
                  replyText = lines.join("\n");

                  buttonsRow.push([
                    { text: "🥇 أولوية الصرف FEFO", callback_data: "/fefo" },
                    { text: "📊 تقرير المخزون", callback_data: "/status" },
                  ]);

                  inlineKeyboard = { inline_keyboard: buttonsRow.slice(0, 8) };
                }
              }
            } else {
              // --- MULTI-TOKEN QUERY (User sent multiple batch numbers / items) ---
              const matchedItems: Array<{ token: string; item: any }> = [];
              const notFoundTokens: string[] = [];

              for (const token of tokens) {
                const variants = generateSearchVariants(token);
                const orFilters = variants
                  .map((v) => `batch_number.ilike.%${v}%,item_code.ilike.%${v}%,name.ilike.%${v}%`)
                  .join(",");

                const { data: matched } = await supabaseAdmin
                  .from("items")
                  .select("*")
                  .or(orFilters)
                  .order("expiry_date", { ascending: true })
                  .limit(1);

                if (matched && matched[0]) {
                  matchedItems.push({ token, item: matched[0] });
                } else {
                  notFoundTokens.push(token);
                }
              }

              if (matchedItems.length === 0) {
                replyText =
                  `❓ لم أتمكن من العثور على أي بيانات للتشغيلات المرسلة:\n` +
                  notFoundTokens.map((t) => `• \`${t}\``).join("\n") +
                  "\n\nيرجى التأكد من صحة أرقام التشغيلات أو الأكواد.";
              } else {
                const lines = [
                  `📋 *تقرير الفحص والتشغيلات المتعددة (${matchedItems.length} تشغيلة):*`,
                  "━━━━━━━━━━━━━━━━━━━━━━━━━",
                ];

                const multiButtons: Array<Array<{ text: string; callback_data: string }>> = [];

                let idx = 1;
                for (const { token: _t, item } of matchedItems) {
                  const days = daysUntil(item.expiry_date);
                  const st = statusFor(days, thresholds);

                  const statusBadge =
                    st === "expired"
                      ? "⛔ منتهي"
                      : st === "critical"
                        ? "🚨 حرج جداً"
                        : st === "medium"
                          ? "🟠 متوسط"
                          : st === "early"
                            ? "🟡 مبكر"
                            : "🟢 ممتاز";

                  const cdText = days < 0 ? `منتهي منذ ${Math.abs(days)} يوم` : `متبقٍ ${days} يوم`;
                  const qcLabel =
                    item.qc_status === "approved"
                      ? "✅ معتمد"
                      : item.qc_status === "rejected"
                        ? "❌ مرفوض"
                        : "🔒 تحت الحجر";

                  lines.push(
                    `${idx}. 🍫 *${item.name}*`,
                    `   • تشغيلة: \`#${item.batch_number || "—"}\` | كود: \`${item.item_code || "—"}\``,
                    `   • الصلاحية: *${item.expiry_date}* (${cdText}) ⬅️ ${statusBadge}`,
                    `   • الرصيد: *${item.quantity ?? "—"} ${item.unit ?? ""}* | موقع: ${item.storage_location || "—"}`,
                    `   • موقف الجودة: ${qcLabel}\n`,
                  );

                  multiButtons.push([
                    {
                      text: `🔍 فحص تشغيلة #${(item.batch_number || item.item_code || String(idx)).slice(0, 14)}`,
                      callback_data: `item:${item.id}`,
                    },
                  ]);
                  idx++;
                }

                if (notFoundTokens.length > 0) {
                  lines.push(
                    "━━━━━━━━━━━━━━━━━━━━━━━━━",
                    "⚠️ *تشغيلات لم يتم العثور عليها:*",
                    notFoundTokens.map((t) => `• \`${t}\``).join("\n"),
                  );
                }

                lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━\n💡 اضغط على الأزرار السريعة أدناه لمزيد من الإجراءات.");
                replyText = lines.join("\n");

                multiButtons.push([
                  { text: "🥇 أولوية الصرف FEFO", callback_data: "/fefo" },
                  { text: "📊 تقرير المخزون", callback_data: "/status" },
                ]);

                inlineKeyboard = { inline_keyboard: multiButtons.slice(0, 8) };
              }
            }
          }

          // Send response back: with photo if available, or with text
          if (replyText) {
            const finalReplyMarkup = inlineKeyboard || MAIN_KEYBOARD;

            if (photoUrlToSend) {
              const photoRes = await sendTelegramPhoto(botToken, chatId, photoUrlToSend, replyText, {
                parse_mode: "Markdown",
                reply_markup: finalReplyMarkup,
              });

              // Fallback to text if photo fails
              if (!photoRes.success) {
                await sendTelegram(botToken, chatId, replyText, {
                  parse_mode: "Markdown",
                  reply_markup: finalReplyMarkup,
                });
              }
            } else {
              await sendTelegram(botToken, chatId, replyText, {
                parse_mode: "Markdown",
                reply_markup: finalReplyMarkup,
              });
            }
          }

          return new Response(JSON.stringify({ ok: true }), {
            headers: { "content-type": "application/json" },
          });
        } catch (err) {
          console.error("[telegram-webhook] Error processing update:", err);
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});

/**
 * Checks if clean user input matches any of the given keywords,
 * whether as an exact standalone word, prefix/suffix, or part of a short phrase.
 */
function matchesAnyKeyword(text: string, keywords: string[]): boolean {
  const clean = text.trim();
  const words = clean.split(/\s+/);
  for (const kw of keywords) {
    if (clean === kw) return true;
    if (words.includes(kw)) return true;
    if (words.length <= 4 && (clean.startsWith(kw + " ") || clean.endsWith(" " + kw))) return true;
    if (kw.length >= 4 && clean.includes(kw)) return true;
  }
  return false;
}

/**
 * Generates search variants to handle Arabic morphology:
 * - Stems leading 'ال' (e.g. 'الكاكاو' -> 'كاكاو')
 * - Normalizes 'ه' vs 'ة'
 * - Normalizes 'ي' vs 'ى'
 * - Normalizes hamzas ('أ', 'إ', 'آ' -> 'ا')
 */
function generateSearchVariants(raw: string): string[] {
  const clean = raw.trim();
  const variants = new Set<string>();
  variants.add(clean);

  // Strip leading 'ال'
  if (clean.startsWith("ال") && clean.length > 3) {
    variants.add(clean.slice(2));
  }

  // Handle 'ه' vs 'ة' at the end
  if (clean.endsWith("ة")) {
    variants.add(clean.slice(0, -1) + "ه");
    variants.add(clean.slice(0, -1)); // root stem
  } else if (clean.endsWith("ه")) {
    variants.add(clean.slice(0, -1) + "ة");
    variants.add(clean.slice(0, -1)); // root stem
  }

  // Handle 'ي' vs 'ى' at the end
  if (clean.endsWith("ي")) {
    variants.add(clean.slice(0, -1) + "ى");
  } else if (clean.endsWith("ى")) {
    variants.add(clean.slice(0, -1) + "ي");
  }

  // Handle 'أ' / 'إ' / 'آ' -> 'ا'
  const normalizedAlef = clean.replace(/[إأآ]/g, "ا");
  if (normalizedAlef !== clean) {
    variants.add(normalizedAlef);
    if (normalizedAlef.startsWith("ال") && normalizedAlef.length > 3) {
      variants.add(normalizedAlef.slice(2));
    }
  }

  return Array.from(variants).filter((v) => v.length >= 2);
}

/**
 * Intelligently extract search tokens from raw user text:
 * Supports multi-line input, commas, conjunctions, and strips conversational filler words.
 */
function extractSearchTokens(raw: string): string[] {
  let cleaned = raw.trim();

  // Strip common bot commands if prepended
  cleaned = cleaned.replace(/^\/(search|find|batch|item|check)\s*/i, "");

  // Strip conversational Arabic prefixes iteratively
  const prefixes = [
    /^(عايز|عاوز|اريد|شوفلي|شفلي|ابحث عن|تقرير عن|بيانات|تفاصيل|حاله|حالة|استعلام عن|استعلم عن|ممكن تشوف|هاتلي)\s+/i,
    /^(تشغيله|تشغيلة|الباتش|باتش|رقم الباتش|رقم التشغيلة|رقم التشغيله|كود الصنف|كود)\s+/i,
    /^(مورد|المورد|مخزن|المخزن)\s+/i,
  ];

  let previous = "";
  while (previous !== cleaned) {
    previous = cleaned;
    for (const prefix of prefixes) {
      cleaned = cleaned.replace(prefix, "").trim();
    }
  }

  // 1. Check for multiple lines
  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.replace(/^(\d+[\.\-\)]|\-|\*)\s*/, "").trim())
    .filter((l) => l.length >= 2);

  if (lines.length > 1) {
    return Array.from(new Set(lines));
  }

  // 2. Check for comma, semicolon, slash, or Arabic conjunction ' و '
  const delimiterRegex = /[,،;؛\/]|\s+و\s+/;
  if (delimiterRegex.test(cleaned)) {
    const parts = cleaned
      .split(delimiterRegex)
      .map((p) => cleanSingleToken(p))
      .filter((p) => p.length >= 2);

    if (parts.length > 1) {
      return Array.from(new Set(parts));
    }
  }

  // 3. Single token
  const single = cleanSingleToken(cleaned);
  return single.length >= 2 ? [single] : [];
}

/** Clean a single token from leading symbols like # or prefixes */
function cleanSingleToken(token: string): string {
  let s = token.trim();
  s = s.replace(/^[#\-_\s]+/, "");
  s = s.replace(/^(تشغيلة|تشغيله|باتش|كود)\s+/i, "");
  return s.trim();
}

/**
 * Format a comprehensive, high-fidelity report card for a single product/batch
 */
function buildSingleItemReportCard(
  item: any,
  days: number,
  st: string,
  isFefoPriority?: boolean,
): { text: string } {
  const statusHeader =
    st === "expired"
      ? "⛔ [منتهي الصلاحية — يُحظر الصرف]"
      : st === "critical"
        ? "🚨 [إنذار حرج — أوشكت الصلاحية]"
        : st === "medium"
          ? "🟠 [تحذير متوسط — أولوية صرف]"
          : st === "early"
            ? "🟡 [تنبيه مبكر — مراقبة دورية]"
            : "🟢 [حالة آمنة وممتازة]";

  const cdText = days < 0 ? `منتهي منذ ${Math.abs(days)} يوم` : `${days} يوم متبقٍ`;

  const qcLabel =
    item.qc_status === "approved"
      ? "✅ معتمد للإفراج والتصنيع (Approved)"
      : item.qc_status === "rejected"
        ? "❌ مرفوض نهائياً (Rejected)"
        : item.qc_status === "conditional"
          ? "⚠️ قبول مشروط (Conditional)"
          : "🔒 تحت الحجر والفحص (Quarantine)";

  const fefoNotice = isFefoPriority
    ? "🥇 *أولوية الصرف #1 للإنتاج (FEFO)*: هذه هي التشغيلة الأسبق انتهاءً لهذا الصنف ويجب سحبها أولاً."
    : "⏳ *ملاحظة الصرف*: توجد تشغيلات أخرى مسجلة لنفس الخامة تنتهي قبل هذه الدفعة.";

  const text =
    `🍫 *بطاقة تقرير فحص الخامة — Vienna Batch Watch* 🍫\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 *اسم الخامة:* *${item.name}*\n` +
    `🔢 *رقم التشغيلة (Batch):* \`#${item.batch_number || "غير محدد"}\`\n` +
    `🏷️ *كود الصنف:* \`${item.item_code || "—"}\`\n` +
    `🏢 *المورد:* ${item.supplier || "—"}\n\n` +
    `⏰ *موقف الصلاحية:*\n` +
    `• الحالة: ${statusHeader}\n` +
    `• تاريخ الصلاحية: *${item.expiry_date}*\n` +
    `• تاريخ الإنتاج: ${item.production_date || "—"}\n` +
    `• الوقت المتبقي: *${cdText}*\n\n` +
    `🛡️ *قرار فحص الجودة (QC Decision):*\n` +
    `• الموقف: *${qcLabel}*\n` +
    (item.coa_number ? `• شهادة التحليل (COA): \`#${item.coa_number}\`\n` : "") +
    (item.qc_notes ? `• تقرير الجودة: _${item.qc_notes}_\n` : "") +
    `\n⚖️ *الرصيد والتخزين:*\n` +
    `• الكمية: *${item.quantity ?? "—"} ${item.unit ?? ""}*\n` +
    `• موقع التخزين: 📍 *${item.storage_location || "المخزن العام"}*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${fefoNotice}\n` +
    (item.notes ? `\n📝 *ملاحظات إضافية:* ${item.notes}` : "");

  return { text };
}
