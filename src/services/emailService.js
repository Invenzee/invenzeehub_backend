const crypto = require('crypto');
const { Resend } = require('resend');
const AppError = require('../utils/AppError');
const { isResendMuted } = require('../utils/externalMute');

let resendClient;

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new AppError('RESEND_API_KEY is not configured', 500, { code: 'CONFIG_ERROR' });
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

function getFromAddress() {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new AppError('EMAIL_FROM is not configured', 500, { code: 'CONFIG_ERROR' });
  }
  return from;
}

/**
 * Generate a numeric OTP (default 6 digits).
 */
function generateLoginCode(length = 6) {
  const digits = '0123456789';
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += digits[bytes[i] % 10];
  }
  return code;
}

/**
 * @returns {{ muted: boolean, id?: string }}
 */
async function sendLoginCodeEmail({ to, name, code, purpose = 'login' }) {
  const minutes = Number(process.env.LOGIN_CODE_EXPIRES_MINUTES) || 10;
  const appName = process.env.APP_NAME || 'InvenzeeHub';
  const isReset = purpose === 'reset';

  if (isResendMuted()) {
    console.warn(
      `[MUTE_EXTERNAL] Resend muted — ${purpose} code for ${to}: ${code} (expires in ${minutes}m)`
    );
    return { muted: true };
  }

  const resend = getResend();
  const from = getFromAddress();
  const subject = isReset
    ? `${appName} password reset code: ${code}`
    : `${appName} login code: ${code}`;
  const heading = isReset ? `${appName} password reset` : `${appName} login`;
  const intro = isReset
    ? 'Use this code to reset your password:'
    : 'Your verification code is:';

  const { data, error } = await resend.emails.send({
    from,
    to: [to],
    subject,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="margin-bottom: 8px;">${heading}</h2>
        <p>Hi ${name || 'there'},</p>
        <p>${intro}</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px; margin: 24px 0;">${code}</p>
        <p>This code expires in <strong>${minutes} minutes</strong>. If you did not request it, you can ignore this email.</p>
      </div>
    `,
    text: `Your ${appName} ${isReset ? 'password reset' : 'login'} code is ${code}. It expires in ${minutes} minutes.`,
  });

  if (error) {
    throw new AppError('Failed to send verification email', 502, {
      code: 'EMAIL_SEND_FAILED',
      details: process.env.NODE_ENV !== 'production' ? error : undefined,
    });
  }

  return { muted: false, id: data?.id };
}

module.exports = {
  generateLoginCode,
  sendLoginCodeEmail,
  isResendMuted,
};
