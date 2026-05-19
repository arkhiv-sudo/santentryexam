// Email notification stub.
// Currently logs intent without sending. To enable real email:
// 1. Set up SendGrid/Resend API key in functions environment
// 2. Replace sendEmail() body with the real API call

export interface EmailRequest {
  to: string;
  subject: string;
  text: string;
  html?: string;
  type: 'score_available' | 'retake_approved' | 'account_created' | 'exam_reminder';
}

export async function sendEmail(req: EmailRequest): Promise<{ ok: boolean; reason?: string }> {
  // TODO: integrate SendGrid/Resend
  console.log('[email][STUB]', req.type, '→', req.to, '|', req.subject);
  return { ok: true, reason: 'stub' };
}
