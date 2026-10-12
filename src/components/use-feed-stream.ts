"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Why the feed moved, as told by the server.
 *
 * `activity` is the one that matters beyond the bell. A shared expense does not
 * only add a feed row — it moves the balances of everyone in the book, so a tab
 * left open on Balances or Groups is showing numbers that stopped being true.
 */
export type FeedSignal = { activity: boolean };

const STREAM_URL = "/api/notifications/stream";
const RETRY_FLOOR_MS = 1_000;
const RETRY_CEILING_MS = 30_000;

/**
 * Subscribe to the live feed.
 *
 * Written as an explicit open/close loop rather than left to `EventSource`'s own
 * reconnection, because that only covers a dropped connection. A server that
 * refuses the request — a session that ended, an instance that was recycled —
 * puts the object straight into `CLOSED` and it never retries on its own, which
 * is the case where a person most needs to be told rather than left watching a
 * badge that will never move again.
 *
 * The stream is closed while the tab is hidden. A feed nobody is looking at does
 * not need to be live, and holding a connection open on a phone that is merely
 * asleep is the sort of thing that gets an app deleted.
 */
export function useFeedStream(onSignal: (signal: FeedSignal) => void) {
  const [connected, setConnected] = useState(false);
  // Kept in a ref so a re-render with a new callback never tears down a healthy
  // connection; the server is the thing that decides when this one ends.
  const notify = useRef(onSignal);
  useEffect(() => {
    notify.current = onSignal;
  }, [onSignal]);

  useEffect(() => {
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    function open() {
      source = new EventSource(STREAM_URL);

      source.addEventListener("ready", () => {
        attempt = 0;
        setConnected(true);
      });

      source.addEventListener("feed", (event) => {
        try {
          notify.current(JSON.parse((event as MessageEvent<string>).data) as FeedSignal);
        } catch {
          // A frame we cannot read is a reason to refetch, not a reason to stop.
          notify.current({ activity: false });
        }
      });

      source.onerror = () => {
        setConnected(false);
        source?.close();
        source = null;
        attempt += 1;
        const wait = Math.min(RETRY_FLOOR_MS * 2 ** (attempt - 1), RETRY_CEILING_MS);
        retryTimer = setTimeout(() => {
          if (document.visibilityState === "visible") open();
        }, wait);
      };
    }

    function onVisibility() {
      if (document.visibilityState === "visible") {
        if (!source && !retryTimer) {
          attempt = 0;
          open();
        }
      } else {
        clearTimeout(retryTimer);
        retryTimer = undefined;
        source?.close();
        source = null;
        setConnected(false);
      }
    }

    if (document.visibilityState === "visible") open();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(retryTimer);
      source?.close();
    };
  }, []);

  return connected;
}