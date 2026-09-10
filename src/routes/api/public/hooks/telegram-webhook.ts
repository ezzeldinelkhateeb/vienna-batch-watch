import { createFileRoute } from "@tanstack/react-router";
import { sendTelegram, answerTelegramCallback } from "@/lib/telegram.server";
import { daysUntil, statusFor, DEFAULT_THRESHOLDS } from "@/lib/status";

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

// Persistent Reply Keyboard for 1-tap interaction on mobile/desktop
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
          JSON.stringify({ status: "active", service: "Vienna Smart Telegram Bot Engine v2.0" }),
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

          // Acknowledge callback immediately if present
          if (isCallback && callbackId) {
            void answerTelegramCallback(botToken, callbackId);
          }

          const thresholds = {
            early: settings?.threshold_early ?? DEFAULT_THRESHOLDS.early,
            medium: settings?.threshold_medium ?? DEFAULT_THRESHOLDS.medium,
            critical: settings?.threshold_critical ?? DEFAULT_THRESHOLDS.critical,
          };

          // Clean command text
          const splitFirst = rawText.split("@")[0] ?? rawText;
          const cleanCmd = splitFirst.trim();
          const firstWord = (cleanCmd.split(" ")[0] ?? "").toLowerCase();

          let replyText = "";
          let inlineKeyboard: any = null;

          // Normalize Arabic text for smart matching
          const normalized = cleanCmd
            .replace(/[إأآ]/g, "ا")
            .replace(/ة/g, "ه")
            .toLowerCase();

          // ==========================================
          // 1. HELP & START
          // ==========================================
          if (
            firstWord === "/start" ||
            firstWord === "/help" ||
            firstWord === "/menu" ||
            normalized.includes("مساعده") ||
            normalized.includes("اوامر") ||
            normalized.includes("القائمه") ||
            normalized.includes("من انت")
          ) {
            replyText =
              "🍫 *مرحباً بك في نظام الجودة الذكي لمصنع فيينا* 🍫\n" +
              "Vienna Biscuit & Chocolate Factory — AI Bot v2.0\n" +
              "━━━━━━━━━━━━━━━━━━━━\n" +
              "أنا مساعدك الذكي لمتابعة صلاحية خامات البسكوت والشوكولاتة، وقرارات الجودة، وأولويات الصرف بالصلاحية (FEFO).\n\n" +
              "🔘 *الأزرار السريعة متاحة بأسفل الشاشة، أو استخدم الأوامر:*\n" +
              "📊 */status* — ملخص شامل لحالة الخامات والصلاحيات\n" +
              "🚨 */urgent* — الخامات المنتهية والحرجة جداً فوراً\n" +
              "🥇 */fefo* — أولوية الصرف لخطوط الإنتاج والتصنيع\n" +
              "🔒 */qc* — الخامات المحتجزة بانتظار فحص واعتماد الجودة\n" +
              "⛔ */expired* — حصر الخامات المنتهية الصلاحية فقط\n" +
              "🔍 */search <اسم_الخامة>* — بحث فوري عن أي صنف أو تشغيلة\n" +
              "⚡ */check* — تشغيل فحص فوري وإرسال التنبيهات الآن\n\n" +
              "💡 *أو اكتب اسم أي خامة مباشرة* (مثال: كاكاو، سكر، زبدة، فانيليا، لبن) وسأعرض لك كل تفاصيلها!";

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
            normalized.includes("صرف") ||
            normalized.includes("فيفو") ||
            normalized.includes("تشغيل") ||
            normalized.includes("انتاج") ||
            normalized.includes("اولويات")
          ) {
            const { data: items } = await supabaseAdmin
              .from("items")
              .select("id, name, item_code, batch_number, quantity, unit, expiry_date, storage_location, qc_status")
              .eq("qc_status", "approved")
              .order("expiry_date", { ascending: true });

            const validItems = (items ?? []).filter((i) => daysUntil(i.expiry_date) >= 0);

            // Group by material name and take the earliest batch (#1 FEFO)
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
                "━━━━━━━━━━━━━━━━━━━━",
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

              lines.push("━━━━━━━━━━━━━━━━━━━━\n⚠️ *ملاحظة:* يُرجى الالتزام بهذه التشغيلات لمنع هدر الخامات.");
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
            normalized.includes("المخزون") ||
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
              "━━━━━━━━━━━━━━━━━━━━\n" +
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
              "━━━━━━━━━━━━━━━━━━━━\n" +
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
            normalized.includes("طوارئ") ||
            normalized.includes("حرج") ||
            normalized.includes("وشيك") ||
            normalized.includes("هينتهي")
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
                "━━━━━━━━━━━━━━━━━━━━",
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

              lines.push("━━━━━━━━━━━━━━━━━━━━\n📋 *توجيه:* امنح أولوية الصرف لهذه الخامات وفق قاعدة FEFO.");
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
            normalized.includes("المنتهي")
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
                "━━━━━━━━━━━━━━━━━━━━",
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

              lines.push("━━━━━━━━━━━━━━━━━━━━\n🔒 يرجى التنسيق مع فريق الجودة والمخازن للإعدام أو الإرجاع.");
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
            normalized.includes("عينات") ||
            normalized.includes("معمل")
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
                "━━━━━━━━━━━━━━━━━━━━",
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
              "━━━━━━━━━━━━━━━━━━━━\n" +
              `🔍 تم فحص: *${result.checked}* تشغيلة\n` +
              `📨 تنبيهات واتساب المرسلة: *${result.sentWhatsApp}*\n` +
              `📨 تنبيهات تليجرام المرسلة: *${result.sentTelegram}*\n` +
              `⏭️ تم تخطي (مسبقة الإرسال): *${result.skipped}*\n` +
              "━━━━━━━━━━━━━━━━━━━━\n" +
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
          // 8. SEARCH / QUERY KEYWORD
          // ==========================================
          else {
            let searchTerm = rawText;
            if (firstWord === "/search" || firstWord === "/find" || firstWord === "بحث") {
              searchTerm = rawText.replace(firstWord, "").trim();
            }

            if (searchTerm.length >= 2) {
              const { data: matched } = await supabaseAdmin
                .from("items")
                .select("name, item_code, batch_number, quantity, unit, expiry_date, storage_location, qc_status, supplier")
                .or(
                  `name.ilike.%${searchTerm}%,batch_number.ilike.%${searchTerm}%,item_code.ilike.%${searchTerm}%,supplier.ilike.%${searchTerm}%,storage_location.ilike.%${searchTerm}%`,
                )
                .order("expiry_date", { ascending: true })
                .limit(8);

              const results = matched ?? [];
              if (results.length > 0) {
                const lines = [
                  `🔍 *نتائج البحث عن: "${searchTerm}" (${results.length} تشغيلة):*`,
                  "━━━━━━━━━━━━━━━━━━━━",
                ];

                for (const item of results) {
                  const days = daysUntil(item.expiry_date);
                  const cdText = days < 0 ? `⛔ منتهي منذ ${Math.abs(days)} يوم` : `⏳ متبقٍ ${days} يوم`;
                  const qcLabel =
                    item.qc_status === "approved"
                      ? "✅ معتمد"
                      : item.qc_status === "rejected"
                        ? "❌ مرفوض"
                        : "🔒 تحت الحجر";

                  lines.push(
                    `📦 *${item.name}*`,
                    `  🏷️ كود: \`${item.item_code || "—"}\` | تشغيلة: \`#${item.batch_number || "—"}\``,
                    `  ⚖️ كمية: *${item.quantity ?? "—"} ${item.unit ?? ""}* | 🏢 مورد: ${item.supplier || "—"}`,
                    `  📍 موقع: ${item.storage_location || "—"}`,
                    `  📅 انتهاء: *${item.expiry_date}* (${cdText}) | 🛡️ ${qcLabel}\n`,
                  );
                }

                replyText = lines.join("\n");

                inlineKeyboard = {
                  inline_keyboard: [
                    [
                      { text: "🥇 أولوية الصرف FEFO", callback_data: "/fefo" },
                      { text: "📊 تقرير المخزون", callback_data: "/status" },
                    ],
                  ],
                };
              } else {
                replyText =
                  `❓ لم أتمكن من العثور على أي خامة مطابقة للبحث: *"${searchTerm}"*.\n\n` +
                  "💡 تأكد من كتابة اسم الخامة بشكل صحيح، أو اضغط الزر بالأسفل لعرض الملخص الشامل.";

                inlineKeyboard = {
                  inline_keyboard: [
                    [
                      { text: "📊 تقرير المخزون الشامل", callback_data: "/status" },
                      { text: "🚨 الخامات الحرجة", callback_data: "/urgent" },
                    ],
                  ],
                };
              }
            } else {
              replyText =
                "🍫 مرحباً بك في Vienna Batch Watch! اختر من الأزرار بالأسفل أو اكتب */help* لعرض الأوامر.";
            }
          }

          // Send response back to user or group chat with combined keyboards
          if (replyText) {
            const finalReplyMarkup = inlineKeyboard
              ? inlineKeyboard
              : MAIN_KEYBOARD;

            await sendTelegram(botToken, chatId, replyText, {
              parse_mode: "Markdown",
              reply_markup: finalReplyMarkup,
            });
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
