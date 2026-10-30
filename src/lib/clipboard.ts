/**
 * Copy with automatic clearing: the clipboard is emptied CLEAR_AFTER_MS after the last copy.
 * Browsers only allow clipboard writes while the page has focus, so a clear that comes due
 * while the app is in the background is done as soon as it gets focus back.
 */
export const CLEAR_AFTER_MS = 30_000;

let timer: number | undefined;
let pendingClear = false;

async function clearNow(): Promise<void> {
  try {
    await navigator.clipboard.writeText("");
    pendingClear = false;
  } catch {
    pendingClear = true;
  }
}

function retryWhenBack() {
  if (pendingClear && document.visibilityState === "visible") void clearNow();
}

window.addEventListener("focus", retryWhenBack);
document.addEventListener("visibilitychange", retryWhenBack);

export async function copyAndClear(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
  window.clearTimeout(timer);
  pendingClear = false;
  timer = window.setTimeout(() => void clearNow(), CLEAR_AFTER_MS);
}

/** Clear right away if a copied value may still be in the clipboard (e.g. on sign-out). */
export function clearIfCopied(): void {
  if (timer === undefined && !pendingClear) return;
  window.clearTimeout(timer);
  timer = undefined;
  void clearNow();
}
