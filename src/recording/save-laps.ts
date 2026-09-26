import type { LapSession } from "../sim/lap-recorder.ts";

/** `yyyy-mm-dd-hhmmss-<race id>`, in local time: sorts by when it was driven and says what it was. */
export function lapSessionId(now: Date, raceId: string): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${raceId}`;
}

export type LapSaveResult = { ok: true; laps: number } | { ok: false; error: string };

/**
 * Whether a run cut short by a restart or by leaving the race is saved (2026-09-26): once it has raced for a second
 * past the countdown, and when the log has ticks the last save did not. Saved only at a finished lap, a restart threw
 * away the attempt it ended, and with it whatever made the driver restart ("I restarted, so you won't see that").
 */
export function unsavedRun(logged: number, saved: number, racingTicks: number, tickHz: number): boolean {
  return racingTicks >= tickHz && logged > saved;
}

/**
 * Save a session through the dev server's `/__laps` endpoint, replacing its
 * earlier save. Saves are serialised so a slow write never lands after a newer
 * one. The session is stringified immediately: the recorder keeps growing.
 * Only `pnpm dev` serves the endpoint; a production build reports that instead.
 */
export function createLapSaver(fetchImpl: typeof fetch = (...args) => fetch(...args)) {
  let queue: Promise<unknown> = Promise.resolve();
  return (session: LapSession): Promise<LapSaveResult> => {
    const body = JSON.stringify(session);
    const save = queue.then(async (): Promise<LapSaveResult> => {
      try {
        const response = await fetchImpl(`/__laps/${encodeURIComponent(session.id)}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body });
        const detail = await response.json().catch(() => null) as { saved?: string; laps?: number; error?: string } | null;
        // Anything but the endpoint's own answer is not a save, whatever its status: a static host may answer 200 with a page.
        if (response.ok && detail?.saved) return { ok: true, laps: detail.laps ?? session.recorded.length };
        if (!detail) return { ok: false, error: "recordings save only under pnpm dev" };
        return { ok: false, error: detail.error ?? `HTTP ${response.status}` };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
    queue = save;
    return save;
  };
}
