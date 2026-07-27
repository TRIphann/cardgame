// useRoomPolling — polls the backend at a fixed interval until the room is
// in 'playing' state or the component unmounts. Returns { room, error,
// refresh } and exposes a manual refresh function for "host starts game".

import { useCallback, useEffect, useRef, useState } from "react";
import { getRoom } from "@shared/api/roomsApi.js";

const POLL_INTERVAL_MS = 2500;

export function useRoomPolling(roomId, { enabled = true } = {}) {
  const [room, setRoom] = useState(null);
  const [error, setError] = useState(null);
  const stoppedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!roomId || !enabled) return;
    try {
      const body = await getRoom(roomId);
      const next = body.room ?? body;
      setRoom(next);
      setError(null);
      if (next?.status === "playing") stoppedRef.current = true;
      return next;
    } catch (err) {
      setError(err);
    }
  }, [roomId, enabled]);

  useEffect(() => {
    stoppedRef.current = false;
    if (!roomId || !enabled) return undefined;
    refresh();
    const id = setInterval(() => {
      if (!stoppedRef.current) refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [roomId, enabled, refresh]);

  return { room, error, refresh };
}