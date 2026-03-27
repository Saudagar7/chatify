export function createWelcomeEmailTemplate(name, clientURL) {
  const displayName = name || 'there';
  const link = clientURL || '#';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 10px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden;">
          <tr>
            <td style="background:#4f46e5; padding:30px; text-align:center;">
              <h1 style="color:#ffffff; margin:0; font-size:28px;">Welcome Aboard 🎉</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:30px; color:#333333;">
              <h2 style="margin-top:0;">Hi ${displayName},</h2>
              <p style="font-size:16px; line-height:1.6;">
                We’re excited to have you with us! Your account has been successfully created and you’re ready to get started.
              </p>
              <p style="font-size:16px; line-height:1.6;">
                Click the button below to begin your journey with us.
              </p>
              <div style="text-align:center; margin:30px 0;">
                <a href="${link}" style="background:#4f46e5; color:#ffffff; padding:14px 28px; text-decoration:none; border-radius:6px; font-size:16px; display:inline-block;">
                  Get Started
                </a>
              </div>
              <p style="font-size:16px; line-height:1.6;">
                If you need any help, just reply to this email — we’re always here for you.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f4f6f8; padding:20px; text-align:center; font-size:14px; color:#777777;">
              © 2026 Chatify. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}