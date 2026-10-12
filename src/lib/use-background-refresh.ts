import { useEffect, useRef, type RefObject } from "react";

/** Coming back to the tab refreshes only if the data is at least this old. */
export const FOCUS_REFRESH_MIN_AGE_MS = 30_000;
/** While the tab stays visible, refresh this often. */
export const VISIBLE_POLL_INTERVAL_MS = 5 * 60_000;

/**
 * Silent refresh when the window regains focus or the tab becomes visible,
 * plus a slow poll while it stays visible. Throttled by the age of the last
 * successful load, so focus/visibility events firing together count once.
 */
export function useBackgroundRefresh({
  enabled,
  lastLoadedAt,
  inFlight,
  onRefresh,
}: {
  enabled: boolean;
  lastLoadedAt: RefObject<number | null>;
  inFlight: RefObject<boolean>;
  onRefresh: () => void;
}) {
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return;

    function maybeRefresh(minAgeMs: number) {
      if (document.visibilityState !== "visible") return;
      if (inFlight.current) return;
      const loadedAt = lastLoadedAt.current;
      if (loadedAt !== null && Date.now() - loadedAt < minAgeMs) return;
      onRefreshRef.current();
    }

    const onFocus = () => maybeRefresh(FOCUS_REFRESH_MIN_AGE_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    const poll = window.setInterval(
      () => maybeRefresh(VISIBLE_POLL_INTERVAL_MS),
      // Check more often than the interval so a poll lands soon after it is due.
      VISIBLE_POLL_INTERVAL_MS / 5,
    );

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(poll);
    };
  }, [enabled, inFlight, lastLoadedAt]);
}
