/**
 * Shared Resend email sender. Single place that owns the Resend HTTP contract:
 * the `RESEND_API_KEY` env gate, the `RESEND_FROM` default, the POST to
 * `https://api.resend.com/emails`, and the non-ok throw. `convex/email.ts` and
 * the auth OTP providers reuse this so the behavior (and the user-facing error
 * messages) stay identical across every caller.
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('Email belum dikonfigurasi.');
  const from = process.env.RESEND_FROM ?? 'kodapos <onboarding@resend.dev>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  if (!res.ok) {
    // Log the raw Resend response server-side for debugging, but never surface
    // the provider body to the client (it can leak request/recipient detail).
    const detail = await res.text().catch(() => '');
    console.error(`Resend send failed (${res.status}): ${detail}`);
    throw new Error('Gagal mengirim email.');
  }
}
