'use strict';
require('dotenv').config();
async function main() {
  const origin = process.env.PINID_ORIGIN;
  const secret = process.env.PINID_ADMIN_SECRET;
  if (!origin || !secret) throw new Error('Configure PINID_ORIGIN and PINID_ADMIN_SECRET privately');
  const response = await fetch(`${origin}/pinid/api/invitations`, { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'X-PinID-Admin': secret },
    body: JSON.stringify({ expires_in_seconds: 172800 }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Invitation request failed (${response.status})`);
  const value = await response.json();
  // Explicit one-time admin delivery, not application/HTTP logging.
  process.stdout.write(`Invitation (deliver privately; do not log): ${value.invitation}\nExpires: ${new Date(value.expires_at).toISOString()}\n`);
}
main().catch(() => { process.stderr.write('Invitation generation failed. Check configuration, origin, authorization and health.\n'); process.exitCode = 1; });
