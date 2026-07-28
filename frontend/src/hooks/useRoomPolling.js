// useRoomPolling — polls the backend at a fixed interval until the room is
// in 'playing' state or the component unmounts. Returns { room, error,
// refresh } and exposes a manual refresh function for "host starts game".

import { useCallback, useEffect, useRef, useState } from "react";
import { roomsApi } from "@shared/api/roomsApi.js";

const POLL_INTERVAL_MS = 2500;

export function useRoomPolling(roomId, { enabled = true } = {}) {
  const [room, setRoom] = useState(null);
  const [error, setError] = useState(null);
  const stoppedRef = useRef(false);
  // Use refs to always get the latest roomId/enabled without causing re-renders
  const roomIdRef = useRef(roomId);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const refresh = useCallback(async () => {
    const currentRoomId = roomIdRef.current;
    if (!currentRoomId || !enabledRef.current) return;
    try {
      // /snapshot also marks stale (offline) members on the server, so this
      // single call drives both UI freshness and the "ghost player" cleanup.
      const body = await roomsApi.snapshot(currentRoomId);
      const next = body.room ?? body;
      setRoom(next);
      setError(null);
      if (next?.status === "playing") stoppedRef.current = true;
      return next;
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    stoppedRef.current = false;
    if (!roomId || !enabled) return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    refresh();
    const id = setInterval(() => {
      if (!stoppedRef.current) refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [roomId, enabled, refresh]);

  return { room, error, refresh };
}