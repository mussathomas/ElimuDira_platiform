import 'server-only';

import type { MessageProvider } from './types';

export function createSmsProvider(_schoolId?: string): MessageProvider {
  return {
    async send(_to: string, _message: string) {
      throw new Error('SMS provider is not configured for this school.');
    },
  };
}
