/* Public share surface: the ledger card, callable from anywhere in the app. */

import { api } from '../core/api.js';
import { toastError } from '../ui/toast.js';

let impl = null;

export async function openShareCard() {
  if (!impl) impl = (await import('./you.js')).openCardSheet;
  try {
    const card = await api.card();
    impl(card);
  } catch (e) {
    toastError(e.message || 'Could not build your card.');
  }
}
