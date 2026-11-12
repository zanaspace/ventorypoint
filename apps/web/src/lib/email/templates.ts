/**
 * Transactional email templates (inline styles only: email clients ignore external stylesheets).
 * Built with bulletproof HTML tables compatible with Gmail, Apple Mail, Outlook, and mobile clients.
 * Colours follow the VentoryPoint design system:
 *   - Primary Brand Purple: #582EFD
 *   - Dark Slate / Navy: #130D33
 *   - Code container: #F3F4FD (#DBDFFF border)
 *   - Neutral text: #18181B / #52525B / #71717A
 */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface LayoutOptions {
  title: string;
  previewText?: string;
  body: string;
}

function emailLayout({ title, previewText, body }: LayoutOptions) {
  const previewHtml = previewText
    ? `<!--[if !mso]><!--><div style="display:none;font-size:1px;color:#FAFAFA;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;">${esc(
        previewText
      )}</div><!--<![endif]-->`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;background-color:#F5F6FA;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181B;">
  ${previewHtml}
  <!-- Outer Wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F5F6FA;padding:40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;width:100%;background-color:#FFFFFF;border-radius:16px;box-shadow:0 4px 24px rgba(19, 13, 51, 0.06);border:1px solid #E8EAF2;overflow:hidden;">
          
          <!-- Top Accent Brand Bar -->
          <tr>
            <td style="height:5px;background:linear-gradient(90deg, #582EFD 0%, #766FFF 50%, #989CFF 100%);background-color:#582EFD;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Header / Brand Logo -->
          <tr>
            <td style="padding:32px 36px 20px 36px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="width:38px;height:38px;border-radius:10px;background-color:#582EFD;color:#FFFFFF;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-weight:700;font-size:17px;letter-spacing:-0.5px;text-align:center;vertical-align:middle;box-shadow:0 2px 8px rgba(88, 46, 253, 0.35);">
                    VP
                  </td>
                  <td style="padding-left:12px;vertical-align:middle;">
                    <div style="font-size:18px;font-weight:700;letter-spacing:-0.3px;color:#130D33;line-height:22px;">VentoryPoint</div>
                    <div style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:1px;color:#71717A;line-height:14px;">Warehouse OS</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 36px;">
              <div style="height:1px;background-color:#F0F1F6;line-height:1px;font-size:1px;">&nbsp;</div>
            </td>
          </tr>

          <!-- Main Content Body -->
          <tr>
            <td style="padding:28px 36px 36px 36px;">
              ${body}
            </td>
          </tr>

        </table>
        <!-- End Main Card Container -->

        <!-- Professional Footer -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;margin-top:24px;text-align:center;">
          <tr>
            <td style="padding:0 16px;font-size:12px;line-height:18px;color:#8E8E93;">
              <p style="margin:0 0 8px 0;">This is an automated security notification regarding your VentoryPoint account.</p>
              <p style="margin:0 0 12px 0;">
                <a href="https://ventorypoint.com" style="color:#582EFD;text-decoration:none;font-weight:500;">ventorypoint.com</a>
                <span style="color:#D4D4D8;padding:0 6px;">•</span>
                <a href="https://ventorypoint.com/dashboard/settings/support" style="color:#71717A;text-decoration:none;">Support</a>
              </p>
              <p style="margin:0;color:#A1A1AA;font-size:11px;">
                &copy; ${new Date().getFullYear()} VentoryPoint Technologies. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
        <!-- End Footer -->

      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function passwordResetEmail({
  code,
  link,
  minutesValid,
}: {
  code: string;
  link: string;
  minutesValid: number;
}) {
  const formattedCode = code.split("").join(" ");
  const previewText = `Your VentoryPoint password reset code is ${code}. Valid for ${minutesValid} minutes.`;

  const body = `
    <!-- Icon & Title -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
      <tr>
        <td style="width:40px;height:40px;border-radius:50%;background-color:#EBEEFF;text-align:center;vertical-align:middle;">
          <span style="font-size:18px;line-height:1;">🔑</span>
        </td>
        <td style="padding-left:14px;vertical-align:middle;">
          <h1 style="margin:0;font-size:22px;line-height:28px;font-weight:700;color:#130D33;letter-spacing:-0.3px;">
            Reset your password
          </h1>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 24px 0;font-size:15px;line-height:24px;color:#4B4B52;">
      We received a request to reset the password for your VentoryPoint account. Enter the verification code below on the reset screen, or click the direct button.
    </p>

    <!-- OTP Code Highlight Box -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;background-color:#F4F6FF;border:1px solid #D6DCFF;border-radius:12px;text-align:center;">
      <tr>
        <td style="padding:22px 16px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#582EFD;text-transform:uppercase;margin-bottom:8px;">
            Verification Code
          </div>
          <div style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:34px;line-height:38px;font-weight:800;letter-spacing:10px;color:#1E124A;padding-left:10px;">
            ${esc(formattedCode)}
          </div>
          <div style="font-size:12px;color:#6B6B78;margin-top:8px;">
            Expires in <strong style="color:#130D33;">${minutesValid} minutes</strong> &bull; Single-use only
          </div>
        </td>
      </tr>
    </table>

    <!-- Direct CTA Button -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" style="border-radius:8px;background-color:#582EFD;box-shadow:0 3px 12px rgba(88, 46, 253, 0.3);">
                <a href="${esc(link)}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;letter-spacing:0.2px;">
                  Reset Password Directly &rarr;
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Security Advisory Box -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FAFAFA;border:1px solid #EAEAEA;border-radius:8px;margin-top:20px;">
      <tr>
        <td style="padding:14px 18px;font-size:13px;line-height:20px;color:#71717A;">
          <strong style="color:#27272A;">Didn't request this change?</strong><br>
          If you didn't ask to reset your password, you can safely ignore this email. Your current password will remain unchanged and your account stays protected.
        </td>
      </tr>
    </table>
  `;

  const html = emailLayout({
    title: "Reset your VentoryPoint password",
    previewText,
    body,
  });

  const text = `Reset your VentoryPoint password

Your verification code: ${code}

Or open this link directly to set a new password:
${link}

This code and link expire in ${minutesValid} minutes and can only be used once.

Didn't ask for a reset? You can safely ignore this email; your account will remain unchanged.

VentoryPoint Warehouse OS
https://ventorypoint.com`;

  return { subject: `${code} is your VentoryPoint reset code`, html, text };
}

export function passwordChangedEmail({ when, supportUrl }: { when: string; supportUrl: string }) {
  const previewText = `Your VentoryPoint account password was successfully updated on ${when}.`;

  const body = `
    <!-- Icon & Title -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
      <tr>
        <td style="width:40px;height:40px;border-radius:50%;background-color:#DCFCE7;text-align:center;vertical-align:middle;">
          <span style="font-size:18px;line-height:1;">✅</span>
        </td>
        <td style="padding-left:14px;vertical-align:middle;">
          <h1 style="margin:0;font-size:22px;line-height:28px;font-weight:700;color:#130D33;letter-spacing:-0.3px;">
            Password updated successfully
          </h1>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 16px 0;font-size:15px;line-height:24px;color:#4B4B52;">
      The password for your VentoryPoint account was changed on <strong style="color:#130D33;">${esc(
        when
      )}</strong>.
    </p>

    <p style="margin:0 0 24px 0;font-size:15px;line-height:24px;color:#4B4B52;">
      You can now log in using your new password. If you initiated this change, no further action is required.
    </p>

    <!-- Security Warning Alert -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FEF2F2;border:1px solid #FEE2E2;border-radius:8px;">
      <tr>
        <td style="padding:16px 18px;font-size:13px;line-height:20px;color:#991B1B;">
          <strong style="color:#7F1D1D;">Didn't make this change?</strong><br>
          If you did not authorize this change, someone may have accessed your account. 
          <a href="${esc(supportUrl)}" style="color:#DC2626;font-weight:700;text-decoration:underline;">
            Reset your password immediately
          </a> 
          or contact your system administrator.
        </td>
      </tr>
    </table>
  `;

  const html = emailLayout({
    title: "Your VentoryPoint password was changed",
    previewText,
    body,
  });

  const text = `Your VentoryPoint password was changed on ${when}.

You can now sign in using your new credentials.

If you did not make this change, reset your password immediately:
${supportUrl}

VentoryPoint Security Team
https://ventorypoint.com`;

  return { subject: "Security Notice: Your VentoryPoint password was changed", html, text };
}
