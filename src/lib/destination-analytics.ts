export interface DestinationTrip {
  requestId: string;
  destination: string;
}

export interface DestinationTripCount {
  name: string;
  trips: number;
}

export function aggregateDestinationTrips(rows: DestinationTrip[]): DestinationTripCount[] {
  const groups = new Map<string, { name: string; requestIds: Set<string> }>();

  for (const row of rows) {
    const name = row.destination.split(",")[0]?.trim().replace(/\s+/g, " ") ?? "";
    if (!name) continue;

    const key = name.toLocaleLowerCase();
    let group = groups.get(key);
    if (!group) {
      group = { name, requestIds: new Set<string>() };
      groups.set(key, group);
    }
    group.requestIds.add(row.requestId);
  }
  return [...groups.values()]
    .map(({ name, requestIds }) => ({ name, trips: requestIds.size }))
    .sort((a, b) => b.trips - a.trips || a.name.localeCompare(b.name))
    .slice(0, 20);
}
