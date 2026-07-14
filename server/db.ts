import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const file = resolve('data/charge-tumakuru.db');
mkdirSync(dirname(file), { recursive: true });
export const db = new DatabaseSync(file);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS stations (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, operator TEXT NOT NULL, address TEXT NOT NULL,
    lat REAL NOT NULL, lon REAL NOT NULL, source TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS connectors (
    id TEXT PRIMARY KEY, station_id TEXT NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
    type TEXT NOT NULL, power_kw REAL NOT NULL, rate REAL NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reservations (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), station_id TEXT NOT NULL REFERENCES stations(id),
    connector_id TEXT NOT NULL REFERENCES connectors(id), start_at TEXT NOT NULL, end_at TEXT NOT NULL,
    energy_kwh REAL NOT NULL, amount REAL NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY, reservation_id TEXT NOT NULL REFERENCES reservations(id), amount REAL NOT NULL,
    status TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  INSERT OR IGNORE INTO users VALUES ('demo-driver', 'driver@demo.local', 'demo1234', 'Aarav Rao');
`);

export type StationRow = {
  id: string; name: string; operator: string; address: string; lat: number; lon: number;
  source: string; updated_at: string;
};

export function stationsWithConnectors() {
  const stations = db.prepare("SELECT * FROM stations WHERE source != 'Local demo fallback' ORDER BY name").all() as unknown as StationRow[];
  const connectorQuery = db.prepare('SELECT id, type, power_kw as powerKw, rate FROM connectors WHERE station_id = ?');
  return stations.map((station) => ({
    id: station.id,
    name: station.name,
    operator: station.operator,
    address: station.address,
    lat: station.lat,
    lon: station.lon,
    source: station.source,
    connectors: connectorQuery.all(station.id),
  }));
}
