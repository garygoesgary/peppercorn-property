export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const sheetsWebhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const apiKey = process.env.RESEND_API_KEY;
  const destinationEmail = process.env.DESTINATION_EMAIL;

  if (!sheetsWebhookUrl || !apiKey || !destinationEmail) {
    return res.status(500).json({ error: 'Missing configuration' });
  }

  const sheetRes = await fetch(sheetsWebhookUrl);
  if (!sheetRes.ok) {
    return res.status(502).json({ error: 'Failed to read sheet' });
  }
  const rows = await sheetRes.json();

  const oneDayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const newRows = rows.filter((row) => {
    const t = new Date(row.Timestamp).getTime();
    return !Number.isNaN(t) && now - t < oneDayMs;
  });

  if (newRows.length === 0) {
    return res.status(200).json({ ok: true, sent: false, reason: 'No new submissions in the last 24 hours' });
  }

  const lines = newRows.map(
    (row) => `- ${row.Name} — ${row['Property Address']} (signed: ${row.Signature})`
  );

  const emailBody = {
    from: 'Peppercorn Property <onboarding@resend.dev>',
    to: [destinationEmail],
    subject: `Micallef St Petition — ${newRows.length} new statement${newRows.length === 1 ? '' : 's'} of support`,
    text: [
      `${newRows.length} new statement(s) of support in the last 24 hours:`,
      '',
      ...lines,
      '',
      `Total statements of support so far: ${rows.length}`,
    ].join('\n'),
  };

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailBody),
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    console.error('Resend error:', errText);
    return res.status(502).json({ error: 'Failed to send digest email' });
  }

  return res.status(200).json({ ok: true, sent: true, count: newRows.length });
}
