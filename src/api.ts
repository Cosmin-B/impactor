import type {
  SessionResponse,
  RunResponse,
  TeachResponse,
  World,
} from "../shared/types";

async function post<T>(path: string, data: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "That request could not be completed.");
  return result as T;
}

export const api = {
  session: () => post<SessionResponse>("session", {}),
  run: (sessionId: string, world: World) =>
    post<RunResponse>("run", { sessionId, world }),
  teach: (sessionId: string, lesson: string) =>
    post<TeachResponse>("teach", { sessionId, lesson }),
  reset: () => post<SessionResponse>("reset", {}),
};
