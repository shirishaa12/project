export type Connector = { id: string; type: string; powerKw: number; rate: number };
export type Station = {
  id: string;
  name: string;
  operator: string;
  address: string;
  lat: number;
  lon: number;
  source: string;
  connectors: Connector[];
  distanceKm?: number;
  durationMin?: number;
};

export type Origin = { lat: number; lon: number; label: string };

export type Reservation = {
  id: string;
  startAt: string;
  endAt: string;
  energyKwh: number;
  amount: number;
  status: 'confirmed' | 'cancelled';
  stationName: string;
  address: string;
  connectorType: string;
  powerKw: number;
  paymentStatus: string;
};
