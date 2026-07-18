export const fullSyncConfirmed = (mode: string, confirmation: string | undefined, storeId: string) => mode !== "full" || confirmation === storeId;
export const retryDelayMs = (attempt: number) => Math.min(300_000, 15_000 * 2 ** Math.max(0, attempt - 1));
export const scheduleDue = (lastRun: Date | undefined, intervalHours: number, now = Date.now()) => !lastRun || now - lastRun.getTime() >= intervalHours * 3_600_000;
