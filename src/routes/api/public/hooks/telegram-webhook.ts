import { createFileRoute } from "@tanstack/react-router";
import { sendTelegram, sendTelegramPhoto, answerTelegramCallback } from "@/lib/telegram.server";
import { daysUntil, statusFor, DEFAULT_THRESHOLDS } from "@/lib/status";
import { parsePhotos } from "@/lib/photos";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string };
    chat: { id: number | string; title?: string; type: string };
    date: number;
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string };
    message?: {
      message_id: number;
      chat: { id: number | string };
    };
    data?: string;
  };
}

// Persistent 1-tap Reply Keyboard
const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: "📊 تقرير المخزون" }, { text: "🚨 الخامات الحرجة" }],
    [{ text: "🥇 أولوية الصرف (FEFO)" }, { text: "🔒 شحنات الحجر (QC)" }],
    [{ text: "⚡ فحص الصلاحية الآن" }, { text: "ℹ️ قائمة الأوامر والمساعدة" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

export const Route = createFileRoute("/api/public/hooks/telegram-webhook")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(
          JSON.stringify({ status: "active", service: "Vienna Smart AI Telegram Bot Engine v3.0" }),
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
            chatId = body.callback_query.message ? String(body.callback_query.message.chat.id) : null;
            rawText = body.callback_query.data || "";
          } else if (body.message?.text) {
            chatId = String(body.message.chat.id);
            rawText = body.message.text.trim();
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

          // Acknowledge callback query immediately
          if (isCallback && callbackId) {
            void answerTelegramCallback(botToken, callbackId);
          }

          const thresholds = {
            early: settings?.threshold_early ?? DEFAULT_THRESHOLDS.early,
            medium: settings?.threshold_medium ?? DEFAULT_THRESHOLDS.medium,
            critical: settings?.threshold_critical ?? DEFAULT_THRESHOLDS.critical,
          };

          // Clean command text
          const splitFirst = (rawText.split("@")[0] || rawText).trim();
          const cleanCmd = splitFirst.trim();
          const firstWord = (cleanCmd.split(" ")[0] || "").toLowerCase();

          // Normalized Arabic for intent matching
          const normalized = cleanCmd
            .replace(/[إأآ]/g, "ا")
            .replace(/ة/g, "ه")
            .toLowerCase();

          let replyText = "";
          let photoUrlToSend: string | null = null;
          let inlineKeyboard: any = null;

          // ==========================================
          // 1. HELP & START
          // ==========================================
          if (
            firstWord === "/start" ||
            firstWord === "/help" ||
            firstWord === "/menu" ||
            rawText === "ℹ️ قائمة الأوامر والمساعدة" ||
            normalized === "مساعده" ||
            normalized === "اوامر" ||
            normalized === "القائمه" ||
            normalized.includes("من انت")
          ) {
            replyText =
              "🍫 *مرحباً بك في بوت الجودة والتشغيل الذكي — مصنع فيينا* 🍫\n" +
              "Vienna Biscuit & Chocolate Factory — AI Bot v3.0\n" +
              "━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
              "أنا أتعرف تلقائياً على *رقم التشغيلة (Batch Number)*، أو *كود الصنف*، أو *اسم الخامة*، وأرسل لك التقرير الفوري الشامل!\n\n" +
              "✨ *قدرات البحث الذكي المتطورة:*\n" +
              "• *ارسل رقم تشغيلة واحد* (مثال: `B-101` أو `تشغيلة 504`) ⬅️ يعرض بطاقة الجودة والموقع والصور.\n" +
              "• *ارسل عدة تشغيلات معاً* (مثال: `B-101, B-202, B-303` أو كل تشغيلة في سطر) ⬅️ يعرض تقرير مقارن فوري لكافة التشغيلات في رد واحد!\n" +
              "• *ارسل اسم أي خامة* (مثال: `كاكاو`، `سكر`، `فانيليا`) ⬅️ يعرض كل دفعاتها بالمخزن مرتبة حسب الأقرب انتهاءً.\n\n" +
              "🔘 *الأوامر السريعة:*\n" +
              "📊 */status* — ملخص شامل للمخزون والصلاحيات\n" +
              "🚨 */urgent* — الخامات الحرجة والمنتهية فوراً\n" +
              "🥇 */fefo* — أولوية الصرف للإنتاج والتصنيع\n" +
              "🔒 */qc* — شحنات الحجر وبانتظار اعتماد الجودة\n" +
              "⛔ */expired* — كشف الخامات المنتهية الصلاحية فقط\n" +
              "⚡ */check* — تشغيل فحص فوري وإرسال التنبيهات الآن";

            inlineKeyboard = {
              inline_keyboard: [
                [
                  { text: "📊 تقرير المخزون", callback_data: "/status" },
                  { text: "🚨 الخامات الحرجة", callback_data: "/urgent" },
                ],
                [
                  { text: "🥇 أولوية الصرف (FEFO)", callback_data: "/fefo" },
                  { text: "🔒 شحنات الحجر", callback_data: "/qc" },
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
            normalized === "صرف" ||
            normalized === "فيفو" ||
            normalized.includes("اولويه الصرف") ||
            normalized.includes("اولويات الصرف") ||
            normalized.includes("اصرف ايه") ||
            normalized.includes("مين عليه الدور")
          ) {
            const { data: items } = await supabaseAdmin
              .from("items")
              .select("id, name, item_code, batch_number, quantity, unit, expiry_date, storage_location, qc_status")
              .eq("qc_status", "approved")
              .order("expiry_date", { ascending: true });

            const validItems = (items ?? []).filter((i) => daysUntil(i.expiry_date) >= 0);

            // Group by material name and take earliest batch
            const fefoGroups = new Map<string, typeof validItems[0]>();
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

              let rank = 1;
              for (const item of priorityBatches.slice(0, 10)) {
                const days = daysUntil(item.expiry_date);
                const cdText = days === 0 ? "ينتهي اليوم!" : `${days} يوم متبقٍ`;
                lines.push(
                  `${rank}. 🍫 *${item.name}*`,
                  `   • تشغيلة أولوية #1: \`#${item.batch_number || "—"}\` | كود: \`${item.item_code || "—"}\``,
                  `   • الرصيد: *${item.quantity ?? "—"} ${item.unit ?? ""}* | موقع: ${item.storage_location || "المخزن العام"}`,
                  `   • الصلاحية: *${item.expiry_date}* (${cdText})\n`,
                );
                rank++;
              }

              if (priorityBatches.length > 10) {
                lines.push(`_... ويوجد ${priorityBatches.length - 10} خامة أخرى مسجلة._`);
              }

              lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━\n⚠️ *ملاحظة:* يُرجى الالتزام بهذه التشغيلات لمنع هدر الخامات.");
              replyText = lines.join("\n");

              inlineKeyboard = {
                inline_keyboard: [
                  [
                    { text: "📊 تقرير المخزون", callback_data: "/status" },
                    { text: "🚨 الخامات الحرجة", callback_data: "/urgent" },
                  ],
                ],
              };
            }
          }

          // ==========================================
          // 3. SUMMARY & STATUS
          // ==========================================
          else if (
            firstWord === "/status" ||
            firstWord === "/summary" ||
            firstWord === "/report" ||
            rawText === "📊 تقرير المخزون" ||
            normalized === "تقرير" ||
            normalized === "حاله" ||
            normalized === "ملخص" ||
            normalized === "المخزون" ||
            normalized.includes("احصائيات") ||
            normalized.includes("كام صنف")
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
                ? `⚠️ *تنبيه:* يوجد *${critical + expired}* تشغيلة حرجة/منتهية! اضغط الزر أدناه لمعاينتها.`
                : "✅ جميع الخامات في نطاق تشغيل آمن وسليم.");

            inlineKeyboard = {
              inline_keyboard: [
                [
                  { text: "🚨 الخامات الحرجة والمنتهية", callback_data: "/urgent" },
                  { text: "🥇 أولوية الصرف (FEFO)", callback_data: "/fefo" },
                ],
                [
                  { text: "🔒 شحنات الحجر (QC)", callback_data: "/qc" },
                  { text: "⚡ تشغيل فحص فوري", callback_data: "/check" },
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
            normalized === "طوارئ" ||
            normalized === "حرج" ||
            normalized.includes("خامات حرجه") ||
            normalized.includes("ايه اللي هينتهي") ||
            normalized.includes("قريب من الانتهاء")
          ) {
            const { data: items } = await supabaseAdmin
              .from("items")
              .select("name, item_code, batch_number, quantity, unit, expiry_date, storage_location, qc_status")
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
            } else {
              const lines = [
                `🚨 *قائمة الخامات الحرجة والوشيكة (${urgentItems.length} تشغيلة):*`,
                "━━━━━━━━━━━━━━━━━━━━━━━━━",
              ];

              for (const { item, days, st } of urgentItems.slice(0, 10)) {
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
              }

              if (urgentItems.length > 10) {
                lines.push(`_... ويوجد ${urgentItems.length - 10} خامة أخرى مسجلة في لوحة التحكم._`);
              }

              lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━\n📋 *توجيه:* امنح أولوية الصرف لهذه الخامات وفق قاعدة FEFO.");
              replyText = lines.join("\n");

              inlineKeyboard = {
                inline_keyboard: [
                  [
                    { text: "🥇 أولوية الصرف FEFO", callback_data: "/fefo" },
                    { text: "⚡ فحص الصلاحية وإرسال تنبيه", callback_data: "/check" },
                  ],
                ],
              };
            }
          }

          // ==========================================
          // 5. EXPIRED ONLY
          // ==========================================
          else if (
            firstWord === "/expired" ||
            normalized === "منتهي" ||
            normalized === "منتهيه" ||
            normalized === "المنتهي"
          ) {
            const { data: items } = await supabaseAdmin
              .from("items")
              .select("name, item_code, batch_number, quantity, unit, expiry_date, storage_location, qc_status")
              .order("expiry_date", { ascending: true });

            const expiredItems = (items ?? []).filter((i) => daysUntil(i.expiry_date) < 0);

            if (expiredItems.length === 0) {
              replyText = "✅ ممتاز! لا توجد أي خامة منتهية الصلاحية مسجلة في النظام حالياً.";
            } else {
              const lines = [
                `⛔ *كشف الخامات منتهية الصلاحية (${expiredItems.length} تشغيلة):*`,
                "_(يُحظر صرفها لخطوط الإنتاج فوراً ويجب عزلها في الحجر)_",
                "━━━━━━━━━━━━━━━━━━━━━━━━━",
              ];

              for (const item of expiredItems.slice(0, 10)) {
                const days = Math.abs(daysUntil(item.expiry_date));
                lines.push(
                  `• ⛔ *${item.name}*`,
                  `  🔢 تشغيلة: \`#${item.batch_number || "—"}\` | كود: \`${item.item_code || "—"}\``,
                  `  ⚖️ كمية: *${item.quantity ?? "—"} ${item.unit ?? ""}* | موقع: ${item.storage_location || "—"}`,
                  `  📅 تاريخ الانتهاء: *${item.expiry_date}* (منتهي منذ ${days} يوم)\n`,
                );
              }

              if (expiredItems.length > 10) {
                lines.push(`_... ويوجد ${expiredItems.length - 10} تشغيلة منتهية أخرى._`);
              }

              lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━\n🔒 يرجى التنسيق مع فريق الجودة والمخازن للإعدام أو الإرجاع.");
              replyText = lines.join("\n");
            }
          }

          // ==========================================
          // 6. QC QUARANTINE INSPECTION
          // ==========================================
          else if (
            firstWord === "/qc" ||
            rawText === "🔒 شحنات الحجر (QC)" ||
            normalized === "حجر" ||
            normalized === "الحجر" ||
            normalized.includes("عينات الجوده")
          ) {
            const { data: quarantineItems } = await supabaseAdmin
              .from("items")
              .select("name, item_code, batch_number, quantity, unit, expiry_date, storage_location, supplier")
              .eq("qc_status", "quarantine")
              .order("created_at", { ascending: false });

            const list = quarantineItems ?? [];
            if (list.length === 0) {
              replyText = "✅ لا توجد أي شحنات في الحجر الصحي حالياً. جميع الخامات مفحوصة ومعتمدة!";
            } else {
              const lines = [
                `🔒 *شحنات بانتظار فحص واعتماد الجودة (${list.length} تشغيلة):*`,
                "━━━━━━━━━━━━━━━━━━━━━━━━━",
              ];
              for (const item of list.slice(0, 8)) {
                lines.push(
                  `• 📦 *${item.name}*`,
                  `  🔢 تشغيلة: \`#${item.batch_number || "—"}\` | كود: \`${item.item_code || "—"}\``,
                  `  🏢 مورد: ${item.supplier || "—"} | ⚖️ كمية: *${item.quantity ?? "—"} ${item.unit ?? ""}*`,
                  `  📍 موقع: ${item.storage_location || "—"} | 📅 انتهاء: *${item.expiry_date}*\n`,
                );
              }
              if (list.length > 8) {
                lines.push(`_... ويوجد ${list.length - 8} شحنة أخرى في الحجر._`);
              }
              replyText = lines.join("\n");

              inlineKeyboard = {
                inline_keyboard: [
                  [
                    { text: "📊 تقرير المخزون", callback_data: "/status" },
                    { text: "🥇 أولوية الصرف FEFO", callback_data: "/fefo" },
                  ],
                ],
              };
            }
          }

          // ==========================================
          // 7. TRIGGER IMMEDIATE EXPIRY CHECK
          // ==========================================
          else if (
            firstWord === "/check" ||
            rawText === "⚡ فحص الصلاحية الآن" ||
            normalized === "فحص" ||
            normalized === "شيك" ||
            normalized.includes("ابعت التنبيهات")
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
              "✅ التنبيهات وصلت بنجاح للمجموعات والمسؤولين.";

            inlineKeyboard = {
              inline_keyboard: [
                [
                  { text: "🚨 عرض الخامات الحرجة", callback_data: "/urgent" },
                  { text: "📊 تقرير المخزون", callback_data: "/status" },
                ],
              ],
            };
          }

          // ==========================================
          // 8. SMART PRODUCT & BATCH DATA PARSER (SINGLE & MULTI-ITEM)
          // ==========================================
          else {
            // Extract distinct search tokens from user's message
            const tokens = extractSearchTokens(rawText);

            if (tokens.length === 0) {
              replyText =
                "🍫 مرحباً بك في Vienna Batch Watch! اكتب رقم أي تشغيلة أو اسم أي خامة للبحث الفوري، أو اكتب */help* لعرض الأوامر.";
            } else if (tokens.length === 1) {
              // --- SINGLE TOKEN QUERY ---
              const token = tokens[0]!;
              const { data: matched } = await supabaseAdmin
                .from("items")
                .select("*")
                .or(
                  `batch_number.ilike.%${token}%,item_code.ilike.%${token}%,name.ilike.%${token}%,coa_number.ilike.%${token}%,supplier.ilike.%${token}%`,
                )
                .order("expiry_date", { ascending: true })
                .limit(8);

              const results = matched ?? [];

              if (results.length === 0) {
                replyText =
                  `❓ لم أتمكن من العثور على أي تشغيلة أو خامة مطابقة لـ: *"${token}"*.\n\n` +
                  "💡 تأكد من كتابة رقم التشغيلة أو كود الصنف بدقة، أو اكتب */status* لعرض ملخص المخزون.";

                inlineKeyboard = {
                  inline_keyboard: [
                    [
                      { text: "📊 تقرير المخزون الشامل", callback_data: "/status" },
                      { text: "🚨 الخامات الحرجة", callback_data: "/urgent" },
                    ],
                  ],
                };
              } else if (results.length === 1) {
                // Exactly 1 item matched -> Ultra Detailed Report Card!
                const item = results[0];
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

                const isFefoPriority = siblingBatches && siblingBatches[0]?.id === item.id;

                const report = buildSingleItemReportCard(item, days, st, isFefoPriority);
                replyText = report.text;

                // If item has a photo, attempt to get signed URL
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
                      { text: "🥇 أولوية الصرف FEFO", callback_data: "/fefo" },
                      { text: "📊 تقرير المخزون", callback_data: "/status" },
                    ],
                  ],
                };
              } else {
                // Multiple batches match this single query (e.g. user typed "كاكاو" or "سكر")
                const lines = [
                  `🔍 *تم العثور على ${results.length} تشغيلات مطابقة لـ "${token}":*`,
                  "_(مرتبة بأولوية الصرف بالصلاحية FEFO)_",
                  "━━━━━━━━━━━━━━━━━━━━━━━━━",
                ];

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
                    `${idx}. 📦 *${item.name}*${fefoTag}`,
                    `   • تشغيلة: \`#${item.batch_number || "—"}\` | كود: \`${item.item_code || "—"}\``,
                    `   • الرصيد: *${item.quantity ?? "—"} ${item.unit ?? ""}* | موقع: ${item.storage_location || "—"}`,
                    `   • الصلاحية: *${item.expiry_date}* (${cdText}) | ${qcLabel}\n`,
                  );
                  idx++;
                }

                lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━\n💡 لعرض بطاقة تفصيلية لأي تشغيلة، ارسل رقم التشغيلة مباشرة.");
                replyText = lines.join("\n");

                inlineKeyboard = {
                  inline_keyboard: [
                    [
                      { text: "🥇 أولوية الصرف FEFO", callback_data: "/fefo" },
                      { text: "📊 تقرير المخزون", callback_data: "/status" },
                    ],
                  ],
                };
              }
            } else {
              // --- MULTI-TOKEN QUERY (User sent multiple batch numbers / items) ---
              const matchedItems: Array<{ token: string; item: any }> = [];
              const notFoundTokens: string[] = [];

              for (const token of tokens) {
                const { data: matched } = await supabaseAdmin
                  .from("items")
                  .select("*")
                  .or(
                    `batch_number.ilike.%${token}%,item_code.ilike.%${token}%,name.ilike.%${token}%`,
                  )
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

                let idx = 1;
                for (const { token, item } of matchedItems) {
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

                inlineKeyboard = {
                  inline_keyboard: [
                    [
                      { text: "🥇 أولوية الصرف FEFO", callback_data: "/fefo" },
                      { text: "📊 تقرير المخزون", callback_data: "/status" },
                    ],
                  ],
                };
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
 * Intelligently extract search tokens from raw user text:
 * Supports multi-line input, commas, conjunctions, and strips conversational filler words.
 */
function extractSearchTokens(raw: string): string[] {
  let cleaned = raw.trim();

  // Strip common bot commands if prepended
  cleaned = cleaned.replace(/^\/(search|find|batch|item|check)\s*/i, "");

  // Strip conversational Arabic prefixes
  const prefixes = [
    /^(عايز|اريد|شوفلي|شفلي|ابحث عن|تقرير عن|بيانات|تفاصيل|حاله|حالة|استعلام عن|استعلم عن)\s+/i,
    /^(تشغيله|تشغيلة|الباتش|باتش|رقم الباتش|رقم التشغيلة|رقم التشغيله|كود الصنف|كود)\s+/i,
  ];

  for (const prefix of prefixes) {
    cleaned = cleaned.replace(prefix, "").trim();
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
