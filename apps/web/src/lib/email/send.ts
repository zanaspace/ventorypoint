/**
 * Transactional email via Resend (https://resend.com), called over its REST API.
 * Server-only. Configure with:
 *   RESEND_API_KEY   re_...           (from the Resend dashboard)
 *   EMAIL_FROM       "VentoryPoint <no-reply@yourdomain.com>"  (a verified Resend domain)
 * Without RESEND_API_KEY, isEmailConfigured() is false and callers fall back.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Groups messages in the Resend dashboard, e.g. "password-reset". */
  tag?: string;
}

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { ok: false, error: "Email is not configured (RESEND_API_KEY / EMAIL_FROM)." };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.tag ? { tags: [{ name: "category", value: message.tag }] } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id) return { ok: false, error: body.message || `Resend responded ${res.status}` };
    return { ok: true, id: body.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Email request failed" };
  }
}
