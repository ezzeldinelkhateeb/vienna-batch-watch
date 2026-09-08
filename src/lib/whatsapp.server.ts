export interface WhatsAppResult {
  success: boolean;
  error?: string;
}

/**
 * Sends a WhatsApp message through the free CallMeBot API.
 * The number must already be activated with the CallMeBot bot by the user.
 */
export async function sendWhatsApp(
  phone: string,
  apiKey: string,
  text: string,
): Promise<WhatsAppResult> {
  const cleanPhone = phone.trim().replace(/[^\d+]/g, "");
  const url =
    `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(cleanPhone)}` +
    `&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apiKey.trim())}`;

  try {
    const res = await fetch(url, { method: "GET" });
    const body = await res.text();
    if (!res.ok) {
      return { success: false, error: `CallMeBot responded ${res.status}: ${body.slice(0, 200)}` };
    }
    const lowered = body.toLowerCase();
    if (lowered.includes("error") || lowered.includes("apikey is not valid")) {
      return { success: false, error: body.replace(/<[^>]*>/g, " ").trim().slice(0, 300) };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Network error" };
  }
}

export function buildAlertMessage(
  item: {
    name: string;
    supplier: string | null;
    quantity: number | null;
    unit: string | null;
    expiry_date: string;
  },
  status: string,
  days: number,
): string {
  const labels: Record<string, string> = {
    early: "⚠️ Early warning",
    medium: "🟠 Medium warning",
    critical: "🔴 CRITICAL warning",
    expired: "⚫ EXPIRED",
  };
  const qty =
    item.quantity != null ? `${item.quantity}${item.unit ? ` ${item.unit}` : ""}` : "—";
  const timing = days < 0 ? `Expired ${Math.abs(days)} day(s) ago` : `${days} day(s) remaining`;
  return [
    `Vienna Expiry Tracker`,
    `${labels[status] ?? status}`,
    `Item: ${item.name}`,
    `Supplier: ${item.supplier ?? "—"}`,
    `Quantity: ${qty}`,
    `Expiry date: ${item.expiry_date}`,
    timing,
  ].join("\n");
}
