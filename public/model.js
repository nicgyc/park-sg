export const TYPES = { C: 'Cars', Y: 'Motorcycles', H: 'Heavy vehicles' };
export function status(row) {
  if (!row.capacity) return 'No capacity';
  if (!row.available) return 'Full';
  return row.availability < 0.2 ? 'Limited' : 'Available';
}
export function selectRows(rows, { query = '', type = 'C', availability = 'all', sort = 'available' } = {}) {
  return rows.filter(row => row.id.toLowerCase().includes(query.trim().toLowerCase())
    && (type === 'all' || row.type === type)
    && (availability === 'all' || status(row).toLowerCase() === availability))
    .sort((a, b) => (sort === 'id' ? a.id.localeCompare(b.id)
      : sort === 'ratio' ? (b.availability ?? -1) - (a.availability ?? -1)
        : b.available - a.available) || a.id.localeCompare(b.id) || a.type.localeCompare(b.type));
}
export function summarize(rows) {
  const capacity = rows.reduce((sum, row) => sum + row.capacity, 0);
  const available = rows.reduce((sum, row) => sum + row.available, 0);
  return { carparks: new Set(rows.map(row => row.id)).size, capacity, available,
    occupancy: capacity ? (capacity - available) / capacity : null,
    limited: rows.filter(row => ['Limited', 'Full'].includes(status(row))).length };
}
export function toCsv(rows) {
  return ['Carpark,Lot type,Available,Capacity,Updated at',
    ...rows.map(row => [row.id, TYPES[row.type], row.available, row.capacity, row.updatedAt].join(','))].join('\r\n');
}
