import { createFileRoute } from "@tanstack/react-router";
import { sendTelegram } from "@/lib/telegram.server";
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
}

export const Route = createFileRoute("/api/public/hooks/telegram-webhook")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(
          JSON.stringify({ status: "active", service: "Vienna Telegram Bot Webhook" }),
          { headers: { "content-type": "application/json" } },
        );
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as TelegramUpdate;
          const msg = body.message;

          if (!msg || !msg.text) {
            return new Response(JSON.stringify({ ok: true }), {
              headers: { "content-type": "application/json" },
            });
          }

          const chatId = String(msg.chat.id);
          const rawText = msg.text.trim();

          // Get bot token and settings
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

          const thresholds = {
            early: settings?.threshold_early ?? DEFAULT_THRESHOLDS.early,
            medium: settings?.threshold_medium ?? DEFAULT_THRESHOLDS.medium,
            critical: settings?.threshold_critical ?? DEFAULT_THRESHOLDS.critical,
          };

          // Clean command (remove @BotName if present)
          const cleanCmd = rawText.split("@")[0].trim();
          const firstWord = cleanCmd.split(" ")[0].toLowerCase();

          let replyText = "";

          // 1. HELP & START
          if (
            firstWord === "/start" ||
            firstWord === "/help" ||
            cleanCmd.includes("مساعدة") ||
            cleanCmd.includes("أوامر") ||
            cleanCmd.includes("اوامر")
          ) {
            replyText =
              "🍫 *مرحباً بك في بوت الجودة ومراقبة الخامات الذكي* 🍫\n" +
              "مصنع فينا للبسكوت والشيكولاتة (Vienna Batch Watch)\n" +
              "━━━━━━━━━━━━━━━━━━━━\n" +
              "يمكنك إرسال أي استفسار أو استخدام الأوامر السريعة التالية:\n\n" +
              "📊 */status* أو *تقرير* — ملخص شامل لحالة المخزون والصلاحيات\n" +
              "🚨 */urgent* أو *طوارئ* — الخامات الحرجة والمنتهية فوراً\n" +
              "🔒 */qc* أو *حجر* — الشحنات تحت الحجر وبانتظار اعتماد الجودة\n" +
              "🔍 */search <اسم_الخامة>* — بحث عن أي صنف أو رقم تشغيلة\n" +
              "⚡ */check* أو *فحص الآن* — تشغيل فحص فوري وإرسال التنبيهات\n\n" +
              "💡 *أو اكتب اسم أي خامة مباشرة* (مثل: كاكاو، سكر، فانيليا، لبن) وسأوافيك بكافة تفاصيلها وتواريخها!";
          }

          // 2. SUMMARY & STATUS
          else if (
            firstWord === "/status" ||
            firstWord === "/summary" ||
            firstWord === "/report" ||
            cleanCmd === "تقرير" ||
            cleanCmd === "حالة" ||
            cleanCmd === "ملخص" ||
            cleanCmd === "المخزون"
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
            }

            replyText =
              "📊 *تقرير الجودة والمخزون الحالي — Vienna* 📊\n" +
              "━━━━━━━━━━━━━━━━━━━━\n" +
              `📦 *إجمالي التشغيلات المسجلة:* ${total}\n\n` +
              "🛡️ *موقف فحص الجودة (QC Status):*\n" +
              `• ✅ معتمد ومقبول: ${approved}\n` +
              `• 🔒 تحت الحجر: ${quarantine}\n` +
              `• ❌ مرفوض: ${rejected}\n\n` +
              "⏰ *موقف الصلاحية (Expiry Status):*\n" +
              `• 🟢 حالة ممتازة (صالح): ${normal}\n` +
              `• 🟡 تنبيه مبكر (≤ 90 يوم): ${early}\n` +
              `• 🟠 تحذير متوسط (≤ 60 يوم): ${medium}\n` +
              `• 🚨 إنذار حرج (≤ 30 يوم): ${critical}\n` +
              `• ⛔ منتهي الصلاحية: ${expired}\n` +
              "━━━━━━━━━━━━━━━━━━━━\n" +
              (critical > 0 || expired > 0
                ? "⚠️ *تنبيه:* يوجد أصناف حرجة تحتاج لمتابعة فورية. اكتب /urgent لعرضها."
                : "✅ جميع الخامات في نطاق تشغيل آمن وفق معايير FEFO.");
          }

          // 3. URGENT & EXPIRING
          else if (
            firstWord === "/urgent" ||
            firstWord === "/expiring" ||
            cleanCmd.includes("طوارئ") ||
            cleanCmd.includes("حرج") ||
            cleanCmd.includes("منتهي") ||
            cleanCmd.includes("قريب من الانتهاء")
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
              replyText = "🎉 ممتاز! لا توجد حالياً أي خامات منتهية أو قاربت على الانتهاء.";
            } else {
              const lines = [
                `🚨 *قائمة الخامات الحرجة والوشيكة (${urgentItems.length} تشغيلة):*`,
                "━━━━━━━━━━━━━━━━━━━━",
              ];

              for (const { item, days, st } of urgentItems.slice(0, 10)) {
                const badge =
                  st === "expired"
                    ? "⛔ منتهي"
                    : st === "critical"
                      ? "🚨 حرج جداً"
                      : st === "medium"
                        ? "🟠 متوسط"
                        : "🟡 مبكر";

                const cdText = days < 0 ? `منتهي منذ ${Math.abs(days)} يوم` : `${days} يوم متبقٍ`;
                lines.push(
                  `• ${badge} *${item.name}*`,
                  `  🏷️ كود: ${item.item_code || "—"} | تشغيلة: #${item.batch_number || "—"}`,
                  `  ⚖️ كمية: ${item.quantity ?? "—"} ${item.unit ?? ""} | 📍 موقع: ${item.storage_location || "—"}`,
                  `  📅 انتهاء: ${item.expiry_date} (${cdText})\n`,
                );
              }

              if (urgentItems.length > 10) {
                lines.push(`_... ويوجد ${urgentItems.length - 10} خامة أخرى مسجلة في لوحة التحكم._`);
              }

              lines.push("━━━━━━━━━━━━━━━━━━━━\n📋 *تعليمات:* أولوية الصرف للخامات الأقرب انتهاءً (قاعدة FEFO).");
              replyText = lines.join("\n");
            }
          }

          // 4. QC QUARANTINE INSPECTION
          else if (firstWord === "/qc" || cleanCmd === "حجر" || cleanCmd === "الحجر") {
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
                  `  🔢 تشغيلة: #${item.batch_number || "—"} | كود: ${item.item_code || "—"}`,
                  `  🏢 مورد: ${item.supplier || "—"} | ⚖️ كمية: ${item.quantity ?? "—"} ${item.unit ?? ""}`,
                  `  📍 موقع: ${item.storage_location || "—"} | 📅 انتهاء: ${item.expiry_date}\n`,
                );
              }
              if (list.length > 8) {
                lines.push(`_... ويوجد ${list.length - 8} شحنة أخرى في الحجر._`);
              }
              replyText = lines.join("\n");
            }
          }

          // 5. TRIGGER IMMEDIATE EXPIRY CHECK
          else if (firstWord === "/check" || cleanCmd === "فحص" || cleanCmd === "فحص الآن") {
            const { runExpiryCheckEngine } = await import("@/lib/whatsapp.functions");
            const result = await runExpiryCheckEngine();
            replyText =
              "⚡ *تم تشغيل فحص الصلاحية الفوري بنجاح!* ⚡\n" +
              "━━━━━━━━━━━━━━━━━━━━\n" +
              `🔍 تم فحص: ${result.checked} تشغيلة\n` +
              `📨 تنبيهات واتساب المرسلة: ${result.sentWhatsApp}\n` +
              `📨 تنبيهات تليجرام المرسلة: ${result.sentTelegram}\n` +
              `⏭️ تم تخطي (مسبقة الإرسال): ${result.skipped}\n` +
              "━━━━━━━━━━━━━━━━━━━━\n" +
              "✅ التنبيهات وصلت للمجموعات والمسؤولين بنجاح.";
          }

          // 6. SEARCH / QUERY KEYWORD
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
                  `name.ilike.%${searchTerm}%,batch_number.ilike.%${searchTerm}%,item_code.ilike.%${searchTerm}%,supplier.ilike.%${searchTerm}%`,
                )
                .limit(6);

              const results = matched ?? [];
              if (results.length > 0) {
                const lines = [
                  `🔍 *نتائج البحث عن: "${searchTerm}" (${results.length} تشغيلة):*`,
                  "━━━━━━━━━━━━━━━━━━━━",
                ];

                for (const item of results) {
                  const days = daysUntil(item.expiry_date);
                  const cdText = days < 0 ? `منتهي منذ ${Math.abs(days)} يوم` : `${days} يوم متبقٍ`;
                  const qcLabel =
                    item.qc_status === "approved"
                      ? "✅ معتمد"
                      : item.qc_status === "rejected"
                        ? "❌ مرفوض"
                        : "🔒 حجر";

                  lines.push(
                    `📦 *${item.name}*`,
                    `  🏷️ كود: ${item.item_code || "—"} | تشغيلة: #${item.batch_number || "—"}`,
                    `  ⚖️ كمية: ${item.quantity ?? "—"} ${item.unit ?? ""} | 🏢 مورد: ${item.supplier || "—"}`,
                    `  📍 موقع: ${item.storage_location || "—"}`,
                    `  📅 انتهاء: ${item.expiry_date} (${cdText}) | 🛡️ ${qcLabel}\n`,
                  );
                }

                replyText = lines.join("\n");
              } else {
                replyText =
                  `❓ لم أتمكن من العثور على أي خامة مطابقة للبحث: "${searchTerm}".\n\n` +
                  "تأكد من كتابة الاسم بدقة، أو اكتب */status* لعرض الملخص الشامل أو */help* للأوامر.";
              }
            } else {
              replyText =
                "🍫 مرحباً بك في Vienna Batch Watch! اكتب */help* أو *مساعدة* للتعرف على الأوامر المتاحة.";
            }
          }

          // Send response back to user or group chat
          if (replyText) {
            await sendTelegram(botToken, chatId, replyText);
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
