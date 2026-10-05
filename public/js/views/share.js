/* Public share surface: the ledger card, callable from anywhere in the app. */

import { api } from '../core/api.js';
import { toast, toastError } from '../ui/toast.js';

let impl = null;
let opening = false;

export async function openShareCard() {
  if (opening) return;
  opening = true;
  const finish = toast('Preparing your snapshot…', { duration: 0 });
  try {
    if (!impl) impl = (await import('./you.js')).openCardSheet;
    const card = await api.card();
    await impl(card);
  } catch (e) {
    toastError(e.message || 'Could not build your card.');
  } finally { opening = false; finish(); }
}
