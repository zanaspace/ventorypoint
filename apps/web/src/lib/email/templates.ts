/**
 * Transactional email templates (inline styles only: email clients ignore stylesheets).
 * Colours follow the design system: purple-600 #582EFD, zinc text, white card.
 */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function layout(title: string, body: string) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#FAFAFA;font-family:'DM Sans',Segoe UI,Helvetica,Arial,sans-serif;color:#18181B;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAFA;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border:1px solid #E4E4E7;border-radius:12px;">
        <tr><td style="padding:28px 28px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:32px;height:32px;border-radius:8px;background:#582EFD;color:#FFFFFF;font-weight:700;font-size:16px;text-align:center;vertical-align:middle;">V</td>
            <td style="padding-left:10px;font-size:16px;font-weight:600;color:#18181B;">VentoryPoint</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:24px 28px 28px;font-size:15px;line-height:22px;">${body}</td></tr>
      </table>
      <p style="max-width:480px;margin:16px auto 0;font-size:12px;line-height:18px;color:#71717A;text-align:center;">
        You received this email because of activity on your VentoryPoint account.
      </p>
    </td></tr>
  </table>
</body></html>`;
}

export function passwordResetEmail({ code, link, minutesValid }: { code: string; link: string; minutesValid: number }) {
  const spaced = code.split("").join(" ");
  const html = layout(
    "Reset your password",
    `<h1 style="margin:0 0 8px;font-size:22px;line-height:28px;font-weight:600;">Reset your password</h1>
     <p style="margin:0 0 20px;color:#52525B;">Enter this code on the reset page, or use the button below. It expires in ${minutesValid} minutes and can be used once.</p>
     <div style="margin:0 0 20px;padding:16px;border-radius:10px;background:#EBEEFF;text-align:center;font-family:'JetBrains Mono',Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:6px;color:#211452;">${esc(spaced)}</div>
     <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td style="border-radius:6px;background:#582EFD;">
       <a href="${esc(link)}" style="display:inline-block;padding:12px 20px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;">Reset password</a>
     </td></tr></table>
     <p style="margin:0;color:#71717A;font-size:13px;line-height:20px;">Didn't ask to reset your password? You can ignore this email; your password won't change.</p>`
  );
  const text = `Reset your VentoryPoint password

Your code: ${code}

Or open this link: ${link}

The code and link expire in ${minutesValid} minutes and can be used once.
Didn't ask to reset your password? Ignore this email; your password won't change.`;
  return { subject: `${code} is your VentoryPoint reset code`, html, text };
}

export function passwordChangedEmail({ when, supportUrl }: { when: string; supportUrl: string }) {
  const html = layout(
    "Your password was changed",
    `<h1 style="margin:0 0 8px;font-size:22px;line-height:28px;font-weight:600;">Your password was changed</h1>
     <p style="margin:0 0 16px;color:#52525B;">The password for your VentoryPoint account was changed on ${esc(when)}.</p>
     <p style="margin:0;color:#52525B;">If this wasn't you, <a href="${esc(supportUrl)}" style="color:#582EFD;font-weight:600;">reset your password now</a> and tell your administrator.</p>`
  );
  const text = `Your VentoryPoint password was changed on ${when}.
If this wasn't you, reset your password now: ${supportUrl} and tell your administrator.`;
  return { subject: "Your VentoryPoint password was changed", html, text };
}
