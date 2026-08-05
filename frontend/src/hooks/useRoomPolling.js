// useRoomPolling — polls the backend at a fixed interval until the room is
// in 'playing' state or the component unmounts. Returns { room, error,
// refresh } and exposes a manual refresh function for "host starts game".

import { useCallback, useEffect, useRef, useState } from "react";
import { roomsApi } from "@shared/api/roomsApi.js";
import { loadSession } from "@config/env.js";

const POLL_INTERVAL_MS = 3000;

export function useRoomPolling(roomId, { enabled = true, memberId = null } = {}) {
  const [room, setRoom] = useState(null);
  const [error, setError] = useState(null);
  const stoppedRef = useRef(false);
  // Use refs to always get the latest roomId/enabled/memberId without causing re-renders.
  const roomIdRef = useRef(roomId);
  const enabledRef = useRef(enabled);
  const memberIdRef = useRef(memberId);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    memberIdRef.current = memberId;
  }, [memberId]);

  const refresh = useCallback(async () => {
    const currentRoomId = roomIdRef.current;
    const currentMemberId = memberIdRef.current;
    if (!currentRoomId || !enabledRef.current) return;
    try {
      // /snapshot also marks stale (offline) members on the server, so this
      // single call drives both UI freshness and the "ghost player" cleanup.
      // Pass the local memberId so the server keeps us marked online and the
      // snapshot is scoped to our viewer (avoids stale-member prune races).
      const myId = currentMemberId || loadSession()?.playerId || null;
      const body = await roomsApi.snapshot(currentRoomId, myId);
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
