export const roundDurationMinutes = (energyKwh: number, powerKw: number) =>
  Math.max(15, Math.ceil((energyKwh / powerKw) * 4) * 15);

export const calculatePrice = (energyKwh: number, rate: number) =>
  Math.round(energyKwh * rate * 100) / 100;

export const overlaps = (startA: string, endA: string, startB: string, endB: string) =>
  new Date(startA).getTime() < new Date(endB).getTime() &&
  new Date(endA).getTime() > new Date(startB).getTime();

export const haversineKm = (a: [number, number], b: [number, number]) => {
  const rad = (value: number) => (value * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const lat1 = rad(a[0]);
  const lat2 = rad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};
