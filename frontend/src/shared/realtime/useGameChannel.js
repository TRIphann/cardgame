// useGameChannel — hooks a React component up to the GameHub realtime
// channel. When the server broadcasts "room-updated" for any room, the
// hook re-fetches the snapshot via /api/rooms/{id}/snapshot and calls the
// consumer's onUpdate.
//
// Latency: server pushes within ~50ms of mutation; client re-fetch adds
// another ~30-80ms on top. Polling fallback fires every POLL_MS if the
// hub disconnects so we never get stuck.

import { useEffect, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { API_BASE_URL } from "@config/env.js";
import { roomsApi } from "@shared/api/roomsApi.js";

const FALLBACK_POLL_MS = 1500;
const HUB_RETRY_MS = 3000;

function hubUrl() {
  // Translate REST base URL "https://host" -> "https://host/hubs/game"
  // and "http://host:port" -> "http://host:port/hubs/game".
  const base = API_BASE_URL.replace(/\/+$/, "");
  return `${base}/hubs/game`;
}

export function useGameChannel({ roomId, memberId, onUpdate, enabled }) {
  const [connected, setConnected] = useState(false);
  const connRef = useRef(null);
  const pollTimerRef = useRef(null);
  const retryTimerRef = useRef(null);

  useEffect(() => {
    if (!enabled || !roomId) return undefined;
    let disposed = false;

    const startPoll = () => {
      if (pollTimerRef.current) return;
      const tick = async () => {
        try {
          const data = await roomsApi.snapshotWithViewer(roomId, memberId);
          if (!disposed) onUpdate?.(data);
        } catch (_) {
          // tolerate transient errors
        }
      };
      // Do a single baseline fetch after a short delay so the hub has a
      // chance to connect first. Without this, an always-on poll would
      // race the realtime channel and double-fetch snapshots on every
      // server update.
      pollTimerRef.current = setTimeout(() => {
        if (disposed) return;
        tick();
        pollTimerRef.current = setInterval(tick, FALLBACK_POLL_MS);
      }, 400);
    };

    const stopPoll = () => {
      if (pollTimerRef.current) {
        // Might be a setTimeout (before interval started) or setInterval.
        clearTimeout(pollTimerRef.current);
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    const stopRetry = () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };

    const startHub = async () => {
      stopRetry();
      try {
        const conn = new signalR.HubConnectionBuilder()
          .withUrl(hubUrl())
          .withAutomaticReconnect([1000, 2000, 5000, 10000])
          .configureLogging(signalR.LogLevel.Warning)
          .build();

        conn.on("room-updated", async () => {
          // Server says "something changed in this room" — re-fetch the
          // snapshot so the client has the exact new state.
          try {
            const data = await roomsApi.snapshotWithViewer(roomId, memberId);
            if (!disposed) onUpdate?.(data);
          } catch (_) {}
        });

        conn.onreconnecting(() => {
          if (disposed) return;
          setConnected(false);
          // Fall back to polling so the UI doesn't freeze.
          startPoll();
        });
        conn.onreconnected(() => {
          if (disposed) return;
          setConnected(true);
          stopPoll();
          // Re-join after reconnect (server may have dropped group membership).
          conn.invoke("JoinRoom", roomId, memberId).catch(() => {});
        });
        conn.onclose(() => {
          if (disposed) return;
          setConnected(false);
          startPoll();
        });

        await conn.start();
        if (disposed) {
          await conn.stop();
          return;
        }
        connRef.current = conn;
        await conn.invoke("JoinRoom", roomId, memberId);
        setConnected(true);
        stopPoll(); // hub is up, no need to poll.
      } catch (_) {
        // Hub unreachable (cold start, network glitch, …) — fall back to
        // polling and try the hub again after a delay.
        if (!disposed) {
          startPoll();
          retryTimerRef.current = setTimeout(() => {
            if (!disposed) startHub();
          }, HUB_RETRY_MS);
        }
      }
    };

    // Always start with a baseline poll in case the hub is slow to connect —
    // this also gives us a first state to render immediately.
    startPoll();
    startHub();

    return () => {
      disposed = true;
      stopPoll();
      stopRetry();
      if (connRef.current) {
        try {
          connRef.current.invoke("LeaveRoom", roomId).catch(() => {});
        } catch (_) {}
        connRef.current.stop().catch(() => {});
        connRef.current = null;
      }
    };
  }, [enabled, roomId, memberId]);

  return { connected };
}
