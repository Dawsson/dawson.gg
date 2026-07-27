export type StoredWhoopEvent = {
  type: string;
  resource_id: string;
  received_at: string;
};

export async function getStoredWhoopEvents(
  cache: KVNamespace,
  limit = 50,
): Promise<StoredWhoopEvent[]> {
  const listed = await cache.list({ prefix: "whoop:webhook:", limit });
  return (
    await Promise.all(listed.keys.map(({ name }) => cache.get<StoredWhoopEvent>(name, "json")))
  )
    .filter((event): event is StoredWhoopEvent => event !== null)
    .sort((left, right) => right.received_at.localeCompare(left.received_at));
}
