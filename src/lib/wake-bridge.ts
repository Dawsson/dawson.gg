import type { BriefingSession } from "./briefing-sessions.ts";

export const WAKE_TYPES = ["daily_wake", "meeting_wake", "critical_wake"] as const;
export const WAKE_SEVERITIES = ["low", "medium", "high", "critical"] as const;

export type WakeBridgeInput = {
  type: (typeof WAKE_TYPES)[number];
  severity: (typeof WAKE_SEVERITIES)[number];
  goal: string;
  successCondition: string;
  maxDurationSeconds: number;
};

export function parseWakeBridgeInput(value: unknown): WakeBridgeInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if ("to" in input || "phone" in input || "phone_number" in input || "destination" in input) {
    return null;
  }
  const maxDurationSeconds = input.max_duration_seconds ?? 45;
  if (
    !WAKE_TYPES.includes(input.type as WakeBridgeInput["type"]) ||
    !WAKE_SEVERITIES.includes(input.severity as WakeBridgeInput["severity"]) ||
    typeof input.goal !== "string" ||
    input.goal.length < 1 ||
    input.goal.length > 500 ||
    typeof input.success_condition !== "string" ||
    input.success_condition.length < 1 ||
    input.success_condition.length > 500 ||
    !Number.isInteger(maxDurationSeconds) ||
    Number(maxDurationSeconds) < 30 ||
    Number(maxDurationSeconds) > 180
  ) {
    return null;
  }
  return {
    type: input.type as WakeBridgeInput["type"],
    severity: input.severity as WakeBridgeInput["severity"],
    goal: input.goal,
    successCondition: input.success_condition,
    maxDurationSeconds: Number(maxDurationSeconds),
  };
}

export function publicWakeBridge(session: BriefingSession) {
  const confirmation = session.actions.find(
    (action) =>
      action.type === "note" &&
      action.status === "approved" &&
      action.content === "Dawson explicitly confirmed: I am awake and getting up.",
  );
  const failed = session.voiceSession.status === "failed";
  const finished = Boolean(session.completedAt) || session.voiceSession.status === "completed";
  const status = confirmation
    ? "awake_confirmed"
    : failed
      ? "failed"
      : finished
        ? "not_confirmed"
        : session.voiceSession.status;
  const result = confirmation ? "awake_confirmed" : finished ? "not_confirmed" : null;
  return {
    id: session.voiceSession.id,
    status,
    result,
    confidence: confirmation ? 0.99 : finished ? 0.9 : null,
    summary: confirmation
      ? "Dawson explicitly confirmed he is awake and getting up."
      : finished
        ? "The call ended without an explicit wake confirmation."
        : null,
    evidence: confirmation?.content ?? null,
    created_at: session.voiceSession.createdAt,
    updated_at: session.voiceSession.updatedAt,
    expires_at: session.voiceSession.expiresAt,
    next_recommended_action: confirmation ? "stop" : failed || finished ? "retry" : "wait",
  };
}
