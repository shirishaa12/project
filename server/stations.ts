import { db, stationsWithConnectors } from './db.js';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const BBOX = '11.50,74.00,18.50,78.60';
const CACHE_KEY = 'stations_updated_karnataka_v1';

// A small local inventory keeps the demo navigable when Overpass has no coverage
// or is rate-limited. It is labeled in the UI so it is never mistaken for live data.
const FALLBACK_STATIONS = [
  { id: 'ka-demo-bengaluru', name: 'Bengaluru Central EV Hub', operator: 'Charge Karnataka demo', address: 'Central Bengaluru, Karnataka', lat: 12.9716, lon: 77.5946, power: 120 },
  { id: 'ka-demo-mysuru', name: 'Mysuru City Charge Point', operator: 'Charge Karnataka demo', address: 'Mysuru, Karnataka', lat: 12.2958, lon: 76.6394, power: 60 },
  { id: 'ka-demo-mangaluru', name: 'Mangaluru Coastal Charger', operator: 'Charge Karnataka demo', address: 'Mangaluru, Karnataka', lat: 12.9141, lon: 74.856, power: 60 },
  { id: 'ka-demo-hubballi', name: 'Hubballi Highway EV Hub', operator: 'Charge Karnataka demo', address: 'Hubballi, Karnataka', lat: 15.3647, lon: 75.124, power: 90 },
  { id: 'ka-demo-belagavi', name: 'Belagavi Fast Charge', operator: 'Charge Karnataka demo', address: 'Belagavi, Karnataka', lat: 15.8497, lon: 74.4977, power: 60 },
  { id: 'ka-demo-kalaburagi', name: 'Kalaburagi EV Stop', operator: 'Charge Karnataka demo', address: 'Kalaburagi, Karnataka', lat: 17.3297, lon: 76.8343, power: 45 },
  { id: 'ka-demo-davanagere', name: 'Davanagere Charge Plaza', operator: 'Charge Karnataka demo', address: 'Davanagere, Karnataka', lat: 14.4644, lon: 75.9218, power: 60 },
  { id: 'ka-demo-shivamogga', name: 'Shivamogga EV Hub', operator: 'Charge Karnataka demo', address: 'Shivamogga, Karnataka', lat: 13.9299, lon: 75.5681, power: 45 },
  { id: 'ka-demo-ballari', name: 'Ballari Rapid Charger', operator: 'Charge Karnataka demo', address: 'Ballari, Karnataka', lat: 15.1394, lon: 76.9214, power: 60 },
  { id: 'ka-demo-tumakuru', name: 'Tumakuru City Charge Point', operator: 'Charge Karnataka demo', address: 'B.H. Road, Tumakuru, Karnataka', lat: 13.3409, lon: 77.101, power: 60 },
  { id: 'ka-demo-hassan', name: 'Hassan Traveller Charge', operator: 'Charge Karnataka demo', address: 'Hassan, Karnataka', lat: 13.0033, lon: 76.1004, power: 45 },
  { id: 'ka-demo-udupi', name: 'Udupi Coastal EV Point', operator: 'Charge Karnataka demo', address: 'Udupi, Karnataka', lat: 13.3409, lon: 74.7421, power: 30 },
];

type OsmElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const connectorType = (tags: Record<string, string>) => {
  if (tags['socket:type2_combo'] || tags['socket:ccs']) return 'CCS2';
  if (tags['socket:chademo']) return 'CHAdeMO';
  if (tags['socket:type2']) return 'Type 2';
  return 'CCS2';
};

const powerFrom = (tags: Record<string, string>) => {
  const raw = tags.maxpower || tags['charging_station:output'] || tags.output;
  const match = raw?.match(/[\d.]+/);
  return match ? Math.min(350, Math.max(3.3, Number(match[0]))) : 30;
};

export async function refreshStations(force = false) {
  const stamp = db.prepare('SELECT value FROM metadata WHERE key = ?').get(CACHE_KEY) as { value?: string } | undefined;
  const fresh = stamp?.value && Date.now() - new Date(stamp.value).getTime() < 24 * 60 * 60 * 1000;
  if (fresh && !force) return { stations: stationsWithConnectors(), cache: true };

  const query = `[out:json][timeout:45];nwr["amenity"="charging_station"](${BBOX});out center tags;`;
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'ChargeTumakuru/1.0 local-demo' },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Station service returned ${response.status}`);
  const payload = await response.json() as { elements: OsmElement[] };
  const now = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE');
  try {
    const upsertStation = db.prepare(`INSERT INTO stations VALUES (?, ?, ?, ?, ?, ?, 'OpenStreetMap', ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, operator=excluded.operator, address=excluded.address,
      lat=excluded.lat, lon=excluded.lon, updated_at=excluded.updated_at`);
    const upsertConnector = db.prepare(`INSERT INTO connectors VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET type=excluded.type, power_kw=excluded.power_kw, rate=excluded.rate`);
    let imported = 0;
    for (const element of payload.elements) {
      const tags = element.tags || {};
      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      if (lat == null || lon == null) continue;
      const id = `osm-${element.type}-${element.id}`;
      const name = tags.name || tags.operator || 'EV charging station';
      const address = [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'] || tags['addr:city']]
        .filter(Boolean).join(', ') || 'Karnataka';
      upsertStation.run(id, name, tags.operator || 'Independent network', address, lat, lon, now);
      upsertConnector.run(`${id}-main`, id, connectorType(tags), powerFrom(tags), 18);
      imported += 1;
    }
    if (imported === 0) {
      const fallbackStation = db.prepare(`INSERT INTO stations VALUES (?, ?, ?, ?, ?, ?, 'Karnataka demo fallback', ?)
        ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at`);
      const fallbackConnector = db.prepare(`INSERT INTO connectors VALUES (?, ?, 'CCS2', ?, 18)
        ON CONFLICT(id) DO UPDATE SET power_kw=excluded.power_kw`);
      for (const station of FALLBACK_STATIONS) {
        fallbackStation.run(station.id, station.name, station.operator, station.address, station.lat, station.lon, now);
        fallbackConnector.run(`${station.id}-main`, station.id, station.power);
      }
    }
    db.prepare('INSERT INTO metadata VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(CACHE_KEY, now);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { stations: stationsWithConnectors(), cache: false };
}

export function cachedStations() {
  return stationsWithConnectors();
}

export function ensureFallbackStations() {
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    const fallbackStation = db.prepare(`INSERT INTO stations VALUES (?, ?, ?, ?, ?, ?, 'Karnataka demo fallback', ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, operator=excluded.operator, address=excluded.address,
      lat=excluded.lat, lon=excluded.lon, source=excluded.source, updated_at=excluded.updated_at`);
    const fallbackConnector = db.prepare(`INSERT INTO connectors VALUES (?, ?, 'CCS2', ?, 18)
      ON CONFLICT(id) DO UPDATE SET power_kw=excluded.power_kw, rate=excluded.rate`);
    for (const station of FALLBACK_STATIONS) {
      fallbackStation.run(station.id, station.name, station.operator, station.address, station.lat, station.lon, now);
      fallbackConnector.run(`${station.id}-main`, station.id, station.power);
    }
    db.prepare('INSERT INTO metadata VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(CACHE_KEY, now);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return stationsWithConnectors();
}
