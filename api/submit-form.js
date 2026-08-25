export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, propertyAddress, email, phone, signature } = req.body || {};

  if (!name || !propertyAddress || !signature) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const sheetsWebhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;

  if (!sheetsWebhookUrl) {
    return res.status(500).json({ error: 'Server is not configured to record submissions yet' });
  }

  try {
    const sheetsRes = await fetch(sheetsWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, propertyAddress, email, phone, signature }),
    });

    if (!sheetsRes.ok) {
      const errText = await sheetsRes.text();
      console.error('Sheets webhook error:', errText);
      return res.status(502).json({ error: 'Failed to record submission' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Submit form error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}
