import type { StoredWhoopEvent } from "./whoop-events.ts";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function records(value: unknown): JsonRecord[] {
  const collection = record(value);
  return Array.isArray(collection?.records)
    ? collection.records.flatMap((value) => (record(value) ? [record(value)!] : []))
    : [];
}

function score(value: JsonRecord | null): JsonRecord | null {
  return record(value?.score);
}

function compactCycle(value: JsonRecord | undefined) {
  if (!value) return null;
  const cycleScore = score(value);
  return {
    id: value.id ?? null,
    start: value.start ?? null,
    updated_at: value.updated_at ?? null,
    strain: cycleScore?.strain ?? null,
    kilojoule: cycleScore?.kilojoule ?? null,
    average_heart_rate: cycleScore?.average_heart_rate ?? null,
    max_heart_rate: cycleScore?.max_heart_rate ?? null,
  };
}

function compactSleep(value: JsonRecord | undefined) {
  if (!value) return null;
  const sleepScore = score(value);
  return {
    id: value.id ?? null,
    start: value.start ?? null,
    end: value.end ?? null,
    timezone_offset: value.timezone_offset ?? null,
    score_state: value.score_state ?? null,
    sleep_performance_percentage: sleepScore?.sleep_performance_percentage ?? null,
    sleep_consistency_percentage: sleepScore?.sleep_consistency_percentage ?? null,
    sleep_efficiency_percentage: sleepScore?.sleep_efficiency_percentage ?? null,
    stage_summary: record(sleepScore?.stage_summary),
  };
}

function compactRecovery(value: JsonRecord | undefined) {
  if (!value) return null;
  const recoveryScore = score(value);
  return {
    score: recoveryScore?.recovery_score ?? null,
    rhr: recoveryScore?.resting_heart_rate ?? null,
    hrv: recoveryScore?.hrv_rmssd_milli ?? null,
    spo2: recoveryScore?.spo2_percentage ?? null,
    skin_temp: recoveryScore?.skin_temp_celsius ?? null,
    updated_at: value.updated_at ?? null,
  };
}

function compactWorkout(value: JsonRecord | undefined) {
  if (!value) return null;
  const workoutScore = score(value);
  return {
    sport_name: value.sport_name ?? null,
    start: value.start ?? null,
    end: value.end ?? null,
    strain: workoutScore?.strain ?? null,
    average_heart_rate: workoutScore?.average_heart_rate ?? null,
    max_heart_rate: workoutScore?.max_heart_rate ?? null,
    zone_durations: record(workoutScore?.zone_durations),
  };
}

export function buildWhoopLatest(snapshot: Record<string, unknown>, events: StoredWhoopEvent[]) {
  const sleeps = records(snapshot.sleeps);
  const latestSleep = sleeps.find((sleep) => sleep.nap !== true) ?? sleeps[0];
  return {
    fetched_at:
      typeof snapshot.fetched_at === "string" ? snapshot.fetched_at : new Date().toISOString(),
    events: events.slice(0, 10),
    current_cycle: compactCycle(records(snapshot.cycles)[0]),
    latest_sleep: compactSleep(latestSleep),
    latest_recovery: compactRecovery(records(snapshot.recovery)[0]),
    latest_workout: compactWorkout(records(snapshot.workouts)[0]),
    stats_available: true,
    note: "Current WHOOP aggregate metrics.",
  };
}
