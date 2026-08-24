export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, propertyAddress, email, phone, signature } = req.body || {};

  if (!name || !propertyAddress || !signature) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const destinationEmail = process.env.DESTINATION_EMAIL;
  const sheetsWebhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;

  if (!apiKey || !destinationEmail) {
    return res.status(500).json({ error: 'Server is not configured to send email yet' });
  }

  const emailBody = {
    from: 'Peppercorn Property <onboarding@resend.dev>',
    to: [destinationEmail],
    ...(email ? { reply_to: email } : {}),
    subject: `Micallef St Petition — New Statement of Support (${name})`,
    text: [
      `Name: ${name}`,
      `Property Address: ${propertyAddress}`,
      `Email: ${email || 'Not provided'}`,
      `Phone: ${phone || 'Not provided'}`,
      `Signature: ${signature}`,
    ].join('\n'),
  };

  // Send the email and log to the Google Sheet in parallel. The sheet write
  // is best-effort — awaited so it actually completes before the function
  // returns, but its failure doesn't block the email send, which is the
  // critical path.
  const sheetsPromise = sheetsWebhookUrl
    ? fetch(sheetsWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, propertyAddress, email, phone, signature }),
      }).catch((err) => console.error('Sheets webhook error:', err))
    : Promise.resolve();

  try {
    const [resendRes] = await Promise.all([
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailBody),
      }),
      sheetsPromise,
    ]);

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('Resend error:', errText);
      return res.status(502).json({ error: 'Failed to send email' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Submit form error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}
