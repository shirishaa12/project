import express from 'express';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { db, stationsWithConnectors } from './db.js';
import { calculatePrice, haversineKm, roundDurationMinutes } from './domain.js';
import { cachedStations, ensureFallbackStations, refreshStations } from './stations.js';

const app = express();
const port = Number(process.env.PORT) || 8787;
const host = process.env.PORT ? '0.0.0.0' : '127.0.0.1';
const sessions = new Map<string, string>();

app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

function currentUser(req: express.Request) {
  const userId = sessions.get(req.cookies?.session || '');
  if (!userId) return null;
  return db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(userId);
}

function requireUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Please sign in to continue.' });
  res.locals.user = user;
  next();
}

app.post('/api/auth/login', (req, res) => {
  const user = db.prepare('SELECT id, email, name FROM users WHERE email = ? AND password = ?').get(req.body.email, req.body.password) as { id: string } | undefined;
  if (!user) return res.status(401).json({ error: 'Incorrect email or password.' });
  const token = randomUUID();
  sessions.set(token, user.id);
  res.cookie('session', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 86400000 });
  res.json({ user });
});

app.post('/api/auth/logout', (req, res) => {
  sessions.delete(req.cookies?.session);
  res.clearCookie('session');
  res.status(204).end();
});

app.get('/api/auth/me', (req, res) => res.json({ user: currentUser(req) }));

app.get('/api/stations', async (req, res) => {
  try {
    const result = await refreshStations(req.query.refresh === '1');
    res.json({ ...result, stale: false });
  } catch (error) {
    const stations = cachedStations();
    if (stations.length) return res.json({ stations, cache: true, stale: true, warning: 'Live station data is unavailable. Showing the last saved update.' });
    const fallback = ensureFallbackStations();
    res.json({ stations: fallback, cache: true, stale: true, warning: 'Live station data is unavailable. Showing the statewide demo inventory.' });
  }
});

app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) return res.json({ results: [] });
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({ q: `${q}, Karnataka`, format: 'jsonv2', limit: '5', viewbox: '74.00,18.50,78.60,11.50', bounded: '1' }).toString();
    const response = await fetch(url, { headers: { 'user-agent': 'ChargeKarnataka/1.0 local-demo' }, signal: AbortSignal.timeout(10000) });
    const data = await response.json() as Array<{ place_id: number; display_name: string; lat: string; lon: string }>;
    res.json({ results: data.map((item) => ({ id: item.place_id, label: item.display_name, lat: Number(item.lat), lon: Number(item.lon) })) });
  } catch {
    res.status(503).json({ error: 'Place search is temporarily unavailable.' });
  }
});

app.post('/api/routes/nearest', async (req, res) => {
  const origin = req.body.origin as { lat: number; lon: number };
  const stations = stationsWithConnectors();
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lon) || !stations.length) return res.status(400).json({ error: 'Choose an origin and load stations first.' });
  const shortlist = stations
    .map((station) => ({ ...station, airKm: haversineKm([origin.lat, origin.lon], [station.lat, station.lon]) }))
    .sort((a, b) => a.airKm - b.airKm).slice(0, 12);
  try {
    const coords = [`${origin.lon},${origin.lat}`, ...shortlist.map((s) => `${s.lon},${s.lat}`)].join(';');
    const table = await fetch(`https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=distance,duration`, { signal: AbortSignal.timeout(15000) });
    if (!table.ok) throw new Error('routing failed');
    const matrix = await table.json() as { distances: number[][]; durations: number[][] };
    const ranked = shortlist.map((station, index) => ({ ...station, distanceKm: matrix.distances[0][index + 1] / 1000, durationMin: Math.round(matrix.durations[0][index + 1] / 60) })).sort((a, b) => a.distanceKm - b.distanceKm);
    const nearest = ranked[0];
    const routeResponse = await fetch(`https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${nearest.lon},${nearest.lat}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(15000) });
    const routeData = await routeResponse.json() as { routes?: Array<{ geometry: { coordinates: [number, number][] } }> };
    res.json({ ranked, nearestId: nearest.id, route: routeData.routes?.[0]?.geometry.coordinates.map(([lon, lat]) => [lat, lon]) || [] });
  } catch {
    res.status(503).json({ error: 'Driving routes are temporarily unavailable. Station locations are still shown.' });
  }
});

app.get('/api/stations/:stationId/availability', (req, res) => {
  const from = String(req.query.from || new Date().toISOString());
  const until = String(req.query.until || new Date(Date.now() + 7 * 86400000).toISOString());
  const bookings = db.prepare(`SELECT connector_id as connectorId, start_at as startAt, end_at as endAt
    FROM reservations WHERE station_id = ? AND status = 'confirmed' AND start_at < ? AND end_at > ?`).all(req.params.stationId, until, from);
  res.json({ bookings });
});

app.post('/api/reservations', requireUser, (req, res) => {
  const { stationId, connectorId, startAt, energyKwh, paymentOutcome } = req.body;
  const connector = db.prepare('SELECT power_kw as powerKw, rate FROM connectors WHERE id = ? AND station_id = ?').get(connectorId, stationId) as { powerKw: number; rate: number } | undefined;
  const energy = Number(energyKwh);
  const start = new Date(startAt);
  if (!connector || !Number.isFinite(energy) || energy < 1 || energy > 100 || Number.isNaN(start.getTime())) return res.status(400).json({ error: 'Enter a valid station, start time, and energy amount.' });
  if (start.getTime() < Date.now() || start.getTime() > Date.now() + 7 * 86400000) return res.status(400).json({ error: 'Reservations must start within the next seven days.' });
  if (paymentOutcome === 'failed') return res.status(402).json({ error: 'Mock payment was declined. No reservation was created.' });
  const minutes = roundDurationMinutes(energy, connector.powerKw);
  const end = new Date(start.getTime() + minutes * 60000);
  const amount = calculatePrice(energy, connector.rate);
  const reservationId = randomUUID();
  const paymentId = randomUUID();

  db.exec('BEGIN IMMEDIATE');
  try {
    const conflict = db.prepare(`SELECT id FROM reservations WHERE connector_id = ? AND status = 'confirmed'
      AND start_at < ? AND end_at > ?`).get(connectorId, end.toISOString(), start.toISOString());
    if (conflict) {
      db.exec('ROLLBACK');
      return res.status(409).json({ error: 'That charging slot was just reserved. Choose another start time.' });
    }
    db.prepare('INSERT INTO reservations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      reservationId, res.locals.user.id, stationId, connectorId, start.toISOString(), end.toISOString(), energy, amount, 'confirmed', new Date().toISOString());
    db.prepare('INSERT INTO payments VALUES (?, ?, ?, ?, ?)').run(paymentId, reservationId, amount, 'paid', new Date().toISOString());
    db.exec('COMMIT');
    res.status(201).json({ reservationId, paymentId, amount, durationMinutes: minutes });
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
});

app.get('/api/reservations', requireUser, (req, res) => {
  const items = db.prepare(`SELECT r.id, r.start_at as startAt, r.end_at as endAt, r.energy_kwh as energyKwh,
    r.amount, r.status, s.name as stationName, s.address, c.type as connectorType, c.power_kw as powerKw,
    p.status as paymentStatus FROM reservations r JOIN stations s ON s.id=r.station_id
    JOIN connectors c ON c.id=r.connector_id JOIN payments p ON p.reservation_id=r.id
    WHERE r.user_id = ? ORDER BY r.start_at DESC`).all(res.locals.user.id);
  res.json({ reservations: items });
});

app.post('/api/reservations/:id/cancel', requireUser, (req, res) => {
  const reservationId = String(req.params.id);
  const booking = db.prepare('SELECT start_at as startAt, status FROM reservations WHERE id = ? AND user_id = ?').get(reservationId, res.locals.user.id) as { startAt: string; status: string } | undefined;
  if (!booking) return res.status(404).json({ error: 'Reservation not found.' });
  if (booking.status !== 'confirmed' || new Date(booking.startAt).getTime() <= Date.now()) return res.status(409).json({ error: 'Only upcoming confirmed reservations can be cancelled.' });
  db.prepare("UPDATE reservations SET status = 'cancelled' WHERE id = ?").run(reservationId);
  res.json({ status: 'cancelled', paymentStatus: 'paid' });
});

const staticDir = resolve('dist');
app.use(express.static(staticDir));
app.get('/{*splat}', (req, res, next) => req.path.startsWith('/api') ? next() : res.sendFile(resolve(staticDir, 'index.html')));

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(port, host, () => console.log(`API listening on http://${host}:${port}`));
