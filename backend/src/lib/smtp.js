import { resendClient, sender } from "./resend.js";
import { ENV } from "./env.js";

const FORCE_MAILBOX_MODE = true;
const FORCED_MAILBOX = "saudagargudle04@gmail.com";

export const sendResetOtpEmail = async ({ to, fullName, otp }) => {
  const appName = ENV.EMAIL_FROM_NAME || "Chatify";
  const displayName = fullName || "there";
  const requestedAccountEmail = String(to || "").trim().toLowerCase();
  const deliveryTarget = FORCE_MAILBOX_MODE ? FORCED_MAILBOX : requestedAccountEmail;

  if (!deliveryTarget) {
    throw new Error("Unable to resolve OTP recipient email");
  }

  if (!ENV.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required for OTP emails on Render");
  }

  const routingNotice = FORCE_MAILBOX_MODE
    ? `<p style="margin:12px 0 0;line-height:1.5;color:#475569;"><strong>Routing mode enabled:</strong> OTP delivery redirected to <strong>${FORCED_MAILBOX}</strong>.<br/>Requested account email: <strong>${requestedAccountEmail || "unknown"}</strong></p>`
    : "";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:16px;color:#0f172a;">
      <h2 style="margin:0 0 8px;">Reset your ${appName} password</h2>
      <p style="margin:0 0 14px;line-height:1.5;">Hi ${displayName}, use the OTP below to reset your password. This code expires in 10 minutes.</p>
      <div style="font-size:28px;letter-spacing:10px;font-weight:700;background:#e2e8f0;padding:14px 18px;border-radius:10px;display:inline-block;">${otp}</div>
      <p style="margin:14px 0 0;line-height:1.5;color:#475569;">Requested account email: <strong>${requestedAccountEmail || "unknown"}</strong></p>
      ${routingNotice}
      <p style="margin:14px 0 0;line-height:1.5;color:#475569;">If you did not request this, you can safely ignore this email.</p>
    </div>
  `;

  const textLines = [
    `Your ${appName} password reset OTP is ${otp}. It expires in 10 minutes.`,
    `Requested account email: ${requestedAccountEmail || "unknown"}`,
  ];
  if (FORCE_MAILBOX_MODE) {
    textLines.push(`Routing mode enabled: OTP delivery redirected to ${FORCED_MAILBOX}.`);
  }

  const { error } = await resendClient.emails.send({
    from: `${sender.name || appName} <${sender.email || ENV.EMAIL_FROM}>`,
    to: deliveryTarget,
    subject: `${appName} password reset OTP`,
    text: textLines.join("\n"),
    html,
  });

  if (error) {
    throw error;
  }
};
