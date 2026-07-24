import { API_BASE_URL } from "../../config/env.js";

export async function createRoom(hostName) {
  const response = await fetch(`${API_BASE_URL}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hostName }),
  });
  if (!response.ok) await throwApiError(response);
  const payload = await response.json();
  return payload.room;
}

export async function joinRoom(code, playerName) {
  const response = await fetch(`${API_BASE_URL}/api/rooms/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: code.toUpperCase(), playerName }),
  });
  if (!response.ok) await throwApiError(response);
  const payload = await response.json();
  return payload.room;
}

export async function getRoom(roomId) {
  const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}`);
  if (!response.ok) await throwApiError(response);
  return await response.json();
}

async function throwApiError(response) {
  let message = `Yêu cầu thất bại (${response.status})`;
  try {
    const data = await response.json();
    if (data && data.message) message = data.message;
  } catch {
    /* ignore */
  }
  const error = new Error(message);
  error.status = response.status;
  throw error;
}
