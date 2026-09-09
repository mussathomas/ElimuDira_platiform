import 'server-only';

import { createWhatsAppProvider } from './whatsapp';
import { createSmsProvider } from './sms';

export async function sendGuardianMessage(schoolId: string, to: string, message: string) {
  const providers = [createWhatsAppProvider(schoolId), createSmsProvider(schoolId)];

  for (const provider of providers) {
    try {
      await provider.send(to, message);
      return;
    } catch {
      // Fall through to the next configured transport.
    }
  }

  throw new Error('No guardian messaging provider is configured for this school.');
}
