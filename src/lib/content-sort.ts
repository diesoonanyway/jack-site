type DatedEntry = {
  id: string;
  data: {
    createdAt?: Date;
    date: Date;
  };
};

export function sortByCreatedAt<T extends DatedEntry>(entries: T[]): T[] {
  return entries.sort((a, b) =>
    (b.data.createdAt ?? b.data.date).valueOf() -
      (a.data.createdAt ?? a.data.date).valueOf() ||
    b.data.date.valueOf() - a.data.date.valueOf() ||
    a.id.localeCompare(b.id)
  );
}
