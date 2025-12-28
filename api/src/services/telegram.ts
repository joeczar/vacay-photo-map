const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export async function sendTelegramMessage(text: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("[TELEGRAM] Not configured, skipping notification");
    return false;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
          parse_mode: "HTML",
        }),
      },
    );
    return response.ok;
  } catch (error) {
    console.error("[TELEGRAM] Failed to send message:", error);
    return false;
  }
}

export function generateRecoveryCode(): string {
  // Use cryptographically secure random number generator
  const buffer = new Uint8Array(4);
  crypto.getRandomValues(buffer);
  const randomNum = new DataView(buffer.buffer).getUint32(0, false);
  return ((randomNum % 900000) + 100000).toString();
}
