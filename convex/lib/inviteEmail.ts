/**
 * Pure builder for the manager-invite email. Content is English (like the
 * receipt/shift emails). When signInUrl is null (SITE_URL unset) the link line
 * is omitted and the recipient is told to sign in at the app with this email.
 */
export function buildInviteEmail({
  businessName,
  signInUrl,
}: {
  businessName: string;
  signInUrl: string | null;
}): { subject: string; html: string; text: string } {
  const subject = `You have been invited to manage ${businessName} on kodapos`;
  const linkHtml = signInUrl
    ? `<p><a href="${signInUrl}">Sign in to accept</a></p>`
    : '<p>Sign in to kodapos with this email address to accept.</p>';
  const linkText = signInUrl
    ? `Sign in to accept: ${signInUrl}`
    : 'Sign in to kodapos with this email address to accept.';
  const html = `<div><p>You have been invited to help manage <strong>${businessName}</strong> on kodapos.</p>${linkHtml}<p>If you did not expect this, you can ignore this email.</p></div>`;
  const text = `You have been invited to help manage ${businessName} on kodapos.\n\n${linkText}\n\nIf you did not expect this, you can ignore this email.`;
  return { subject, html, text };
}
