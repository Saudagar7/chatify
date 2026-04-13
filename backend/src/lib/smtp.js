import nodemailer from "nodemailer";
import { ENV } from "./env.js";

let transporter = null;

const normalizeAppPassword = (value = "") => String(value).replace(/\s+/g, "").trim();

const getTransporter = () => {
  if (transporter) return transporter;

  if (!ENV.SMTP_GMAIL_USER || !ENV.SMTP_GMAIL_APP_PASSWORD) {
    throw new Error("SMTP_GMAIL_USER and SMTP_GMAIL_APP_PASSWORD are required");
  }

  transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    auth: {
      user: ENV.SMTP_GMAIL_USER,
      pass: normalizeAppPassword(ENV.SMTP_GMAIL_APP_PASSWORD),
    },
    tls: {
      minVersion: "TLSv1.2",
    },
  });

  return transporter;
};

export const sendResetOtpEmail = async ({ to, fullName, otp }) => {
  const mailer = getTransporter();
  const appName = ENV.EMAIL_FROM_NAME || "Chatify";
  const fromAddress = ENV.EMAIL_FROM || ENV.SMTP_GMAIL_USER;
  const displayName = fullName || "there";
  const requestedAccountEmail = String(to || "").trim().toLowerCase();
  const isDevelopment = ENV.NODE_ENV === "development";
  const deliveryTarget = isDevelopment
    ? String(ENV.EMAIL_FROM || ENV.SMTP_GMAIL_USER || "").trim()
    : requestedAccountEmail;

  if (!deliveryTarget) {
    throw new Error("Unable to resolve OTP recipient email");
  }

  const devNotice = isDevelopment
    ? `<p style="margin:12px 0 0;line-height:1.5;color:#475569;"><strong>Development mode:</strong> OTP delivery was redirected to this mailbox.<br/>Requested account email: <strong>${requestedAccountEmail || "unknown"}</strong></p>`
    : "";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:16px;color:#0f172a;">
      <h2 style="margin:0 0 8px;">Reset your ${appName} password</h2>
      <p style="margin:0 0 14px;line-height:1.5;">Hi ${displayName}, use the OTP below to reset your password. This code expires in 10 minutes.</p>
      <div style="font-size:28px;letter-spacing:10px;font-weight:700;background:#e2e8f0;padding:14px 18px;border-radius:10px;display:inline-block;">${otp}</div>
      <p style="margin:14px 0 0;line-height:1.5;color:#475569;">Requested account email: <strong>${requestedAccountEmail || "unknown"}</strong></p>
      ${devNotice}
      <p style="margin:14px 0 0;line-height:1.5;color:#475569;">If you did not request this, you can safely ignore this email.</p>
    </div>
  `;

  const textLines = [
    `Your ${appName} password reset OTP is ${otp}. It expires in 10 minutes.`,
    `Requested account email: ${requestedAccountEmail || "unknown"}`,
  ];
  if (isDevelopment) {
    textLines.push("Development mode: OTP delivery redirected to EMAIL_FROM mailbox.");
  }

  await mailer.sendMail({
    from: `${appName} <${fromAddress}>`,
    to: deliveryTarget,
    subject: `${appName} password reset OTP`,
    text: textLines.join("\n"),
    html,
  });
};
