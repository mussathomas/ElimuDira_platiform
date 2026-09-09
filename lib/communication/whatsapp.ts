import 'server-only';

import type { MessageProvider } from './types';

export function createWhatsAppProvider(_schoolId?: string): MessageProvider {
  return {
    async send(_to: string, _message: string) {
      throw new Error('WhatsApp provider is not configured for this school.');
    },
  };
}
