import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import {
  ArrowLeft, BatteryCharging, CalendarDays, Check, ChevronRight, Clock3, CreditCard,
  LocateFixed, LogOut, MapPin, Navigation, RefreshCw, Search, X, Zap,
} from 'lucide-react';
import { api } from './api';
import type { Connector, Origin, Reservation, Station } from './types';

const CENTER: [number, number] = [15.3173, 75.7139];
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

function markerIcon(nearest: boolean, selected: boolean) {
  return L.divIcon({
    className: 'ev-marker-wrap',
    html: `<span class="ev-marker ${nearest ? 'nearest' : ''} ${selected ? 'selected' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 5 14h6l-1 8 8-12h-6l1-8Z"/></svg></span>`,
    iconSize: [42, 48], iconAnchor: [21, 44], popupAnchor: [0, -40],
  });
}

function MapClick({ onChoose }: { onChoose: (origin: Origin) => void }) {
  useMapEvents({ click: (event) => onChoose({ lat: event.latlng.lat, lon: event.latlng.lng, label: 'Dropped pin' }) });
  return null;
}

function MapFocus({ station, origin }: { station?: Station; origin: Origin | null }) {
  const map = useMap();
  useEffect(() => {
    if (station && origin) map.fitBounds([[origin.lat, origin.lon], [station.lat, station.lon]], { padding: [60, 60] });
    else if (station) map.flyTo([station.lat, station.lon], 14);
  }, [map, station, origin]);
  return null;
}

type SearchResult = { id: number; label: string; lat: number; lon: number };

function OriginSearch({ onChoose }: { onChoose: (origin: Origin) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function change(value: string) {
    setQuery(value);
    clearTimeout(timer.current);
    if (value.trim().length < 3) return setResults([]);
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(value)}`);
        setResults(data.results);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 450);
  }

  return <div className="search-box">
    <Search size={18} aria-hidden="true" />
    <input value={query} onChange={(e) => change(e.target.value)} placeholder="Search your starting point" aria-label="Search starting point" />
    {searching && <span className="spinner small" aria-label="Searching" />}
    {results.length > 0 && <div className="search-results">
      {results.map((result) => <button key={result.id} onClick={() => {
        onChoose({ lat: result.lat, lon: result.lon, label: result.label.split(',').slice(0, 2).join(',') });
        setQuery(result.label.split(',')[0]); setResults([]);
      }}><MapPin size={16} /><span>{result.label}</span></button>)}
    </div>}
  </div>;
}

function Login({ onLogin }: { onLogin: (user: { name: string; email: string }) => void }) {
  const [email, setEmail] = useState('driver@demo.local');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const data = await api<{ user: { name: string; email: string } }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      onLogin(data.user);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return <main className="login-page">
    <section className="login-brand">
      <div className="brand-lockup"><span className="brand-icon"><Zap /></span><span>Charge Karnataka</span></div>
      <div className="city-signal" aria-hidden="true">
        <span className="road road-a" /><span className="road road-b" /><span className="pulse pulse-a" /><span className="pulse pulse-b" /><span className="pulse pulse-c" />
      </div>
      <div className="login-copy"><p>POWER YOUR ROUTE</p><h1>Find a charge.<br />Keep moving.</h1><span>Public stations, road-distance routing, and reserved charging slots across Karnataka.</span></div>
    </section>
    <section className="login-panel">
      <form onSubmit={submit}>
        <div><span className="eyebrow">DRIVER ACCESS</span><h2>Welcome back</h2><p>Your demo account is ready to use.</p></div>
        <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary wide" disabled={busy}>{busy ? <span className="spinner" /> : <>Sign in <ChevronRight size={18} /></>}</button>
        <div className="demo-note"><Check size={16} /><span>Credentials are pre-filled for this local demo.</span></div>
      </form>
    </section>
  </main>;
}

function StationList({ stations, selectedId, nearestId, onSelect }: { stations: Station[]; selectedId?: string; nearestId?: string; onSelect: (station: Station) => void }) {
  return <div className="station-list">
    {stations.map((station) => <button className={`station-row ${selectedId === station.id ? 'active' : ''}`} key={station.id} onClick={() => onSelect(station)}>
      <span className="station-symbol"><Zap size={18} /></span>
      <span className="station-copy"><strong>{station.name}</strong><small>{station.operator} · {station.connectors[0]?.powerKw ?? 30} kW</small></span>
      <span className="station-metric">
        {station.id === nearestId && <em>NEAREST</em>}
        <strong>{station.distanceKm != null ? `${station.distanceKm.toFixed(1)} km` : '—'}</strong>
        <small>{station.durationMin != null ? `${station.durationMin} min` : 'Select origin'}</small>
      </span>
    </button>)}
  </div>;
}

function StationDrawer({ station, isNearest, onClose, onBook }: { station: Station; isNearest: boolean; onClose: () => void; onBook: (connector: Connector) => void }) {
  const connector = station.connectors[0];
  return <aside className="station-drawer">
    <div className="drawer-grip" />
    <div className="drawer-top"><div>{isNearest && <span className="nearest-label"><Navigation size={13} /> Closest by road</span>}<h2>{station.name}</h2><p>{station.address}</p></div><button className="icon-btn" onClick={onClose} title="Close station details"><X /></button></div>
    <div className="station-facts">
      <span><MapPin /><strong>{station.distanceKm != null ? `${station.distanceKm.toFixed(1)} km` : '—'}</strong><small>Road distance</small></span>
      <span><Clock3 /><strong>{station.durationMin != null ? `${station.durationMin} min` : '—'}</strong><small>Drive time</small></span>
      <span><Zap /><strong>{connector?.powerKw ?? 30} kW</strong><small>{connector?.type ?? 'CCS2'}</small></span>
    </div>
    <div className="connector-line"><span className="availability-dot" /><div><strong>Connector available</strong><small>Live availability is managed by this demo</small></div><strong>{money.format(connector?.rate ?? 18)}<small>/kWh</small></strong></div>
    <button className="primary wide" onClick={() => onBook(connector)}>Reserve this charger <ChevronRight size={18} /></button>
    <p className="source-note">Station location from {station.source}</p>
  </aside>;
}

function BookingModal({ station, connector, onClose, onDone }: { station: Station; connector: Connector; onClose: () => void; onDone: () => void }) {
  const nextHour = new Date(Date.now() + 3600000); nextHour.setMinutes(0, 0, 0);
  const localDefault = new Date(nextHour.getTime() - nextHour.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [energy, setEnergy] = useState(20);
  const [startAt, setStartAt] = useState(localDefault);
  const [step, setStep] = useState<'details' | 'pay' | 'success'>('details');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const duration = Math.max(15, Math.ceil((energy / connector.powerKw) * 4) * 15);
  const amount = Math.round(energy * connector.rate);

  async function pay(outcome: 'success' | 'failed') {
    setBusy(true); setError('');
    try {
      await api('/api/reservations', { method: 'POST', body: JSON.stringify({ stationId: station.id, connectorId: connector.id, startAt: new Date(startAt).toISOString(), energyKwh: energy, paymentOutcome: outcome === 'failed' ? 'failed' : 'success' }) });
      setStep('success');
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="modal-backdrop" role="presentation"><section className="booking-modal" role="dialog" aria-modal="true" aria-label="Reserve charging slot">
    {step !== 'success' && <header><button className="icon-btn" onClick={step === 'pay' ? () => setStep('details') : onClose} title="Go back"><ArrowLeft /></button><div><span className="eyebrow">{step === 'details' ? 'RESERVE A SLOT' : 'MOCK PAYMENT'}</span><h2>{step === 'details' ? station.name : 'Review and pay'}</h2></div><button className="icon-btn" onClick={onClose} title="Close"><X /></button></header>}
    {step === 'details' && <div className="booking-body">
      <div className="booking-station"><span><Zap /></span><div><strong>{connector.type} · {connector.powerKw} kW</strong><small>{station.address}</small></div><em>AVAILABLE</em></div>
      <label>Start time<input type="datetime-local" value={startAt} min={localDefault} max={new Date(Date.now() + 7 * 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onChange={(e) => setStartAt(e.target.value)} /></label>
      <label>Energy needed <span>{energy} kWh</span><input className="range" type="range" min="5" max="80" step="5" value={energy} onChange={(e) => setEnergy(Number(e.target.value))} /></label>
      <div className="estimate"><span><Clock3 /><small>Reserved time</small><strong>{duration < 60 ? `${duration} min` : `${duration / 60} hr`}</strong></span><span><CreditCard /><small>Estimated cost</small><strong>{money.format(amount)}</strong></span></div>
      <p className="calculation">Based on {connector.powerKw} kW power at {money.format(connector.rate)}/kWh.</p>
      <button className="primary wide" onClick={() => setStep('pay')}>Continue to payment <ChevronRight size={18} /></button>
    </div>}
    {step === 'pay' && <div className="booking-body payment-body">
      <div className="payment-total"><span>Estimated session total</span><strong>{money.format(amount)}</strong><small>{energy} kWh · {duration} minutes · Mock transaction</small></div>
      <div className="pay-method"><span className="pay-logo">UPI</span><div><strong>Demo payment method</strong><small>No real money will be charged</small></div><Check size={20} /></div>
      {error && <p className="form-error">{error}</p>}
      <button className="primary wide" disabled={busy} onClick={() => pay('success')}>{busy ? <span className="spinner" /> : <>Pay {money.format(amount)} <ChevronRight size={18} /></>}</button>
      <button className="text-button" disabled={busy} onClick={() => pay('failed')}>Simulate declined payment</button>
    </div>}
    {step === 'success' && <div className="success-body"><span className="success-icon"><Check /></span><span className="eyebrow">RESERVATION CONFIRMED</span><h2>Your charger is ready.</h2><p>{station.name}<br />{dateTime.format(new Date(startAt))}</p><div><span>Energy<strong>{energy} kWh</strong></span><span>Paid<strong>{money.format(amount)}</strong></span></div><button className="primary wide" onClick={onDone}>View my bookings</button></div>}
  </section></div>;
}

function Bookings({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = () => api<{ reservations: Reservation[] }>('/api/reservations').then((d) => setItems(d.reservations)).catch((e) => setError(e.message)).finally(() => setLoading(false));
  useEffect(() => { void load(); }, []);
  async function cancel(id: string) {
    if (!confirm('Cancel this reservation? The payment will not be refunded.')) return;
    try { await api(`/api/reservations/${id}/cancel`, { method: 'POST' }); load(); }
    catch (err) { setError((err as Error).message); }
  }
  return <main className="bookings-page">
    <header className="page-header"><button className="icon-btn" onClick={onBack} title="Back to map"><ArrowLeft /></button><div><span className="eyebrow">YOUR SESSIONS</span><h1>My bookings</h1></div></header>
    <section className="bookings-content">
      {loading && <div className="center-state"><span className="spinner dark" /><p>Loading reservations…</p></div>}
      {error && <div className="notice error">{error}</div>}
      {!loading && items.length === 0 && <div className="empty-state"><span><CalendarDays /></span><h2>No bookings yet</h2><p>Reserve a station from the map and it will appear here.</p><button className="primary" onClick={onBack}>Explore stations</button></div>}
      <div className="booking-list">{items.map((item) => {
        const upcoming = item.status === 'confirmed' && new Date(item.startAt).getTime() > Date.now();
        return <article className="booking-item" key={item.id}>
          <div className="booking-date"><strong>{new Date(item.startAt).getDate()}</strong><span>{new Date(item.startAt).toLocaleString('en-IN', { month: 'short' }).toUpperCase()}</span></div>
          <div className="booking-info"><span className={`status ${item.status}`}>{item.status}</span><h2>{item.stationName}</h2><p><Clock3 /> {dateTime.format(new Date(item.startAt))} · {item.connectorType} {item.powerKw} kW</p><p><MapPin /> {item.address}</p></div>
          <div className="booking-price"><small>{item.paymentStatus === 'paid' ? 'PAID' : item.paymentStatus}</small><strong>{money.format(item.amount)}</strong>{upcoming && <button className="danger-text" onClick={() => cancel(item.id)}>Cancel booking</button>}</div>
        </article>;
      })}</div>
    </section>
  </main>;
}

export default function App() {
  const [user, setUser] = useState<{ name: string; email: string } | null | undefined>();
  const [stations, setStations] = useState<Station[]>([]);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [selected, setSelected] = useState<Station>();
  const [nearestId, setNearestId] = useState<string>();
  const [route, setRoute] = useState<[number, number][]>([]);
  const [loading, setLoading] = useState(true);
  const [routeBusy, setRouteBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<'map' | 'bookings'>('map');
  const [booking, setBooking] = useState<{ station: Station; connector: Connector }>();

  useEffect(() => { api<{ user: typeof user }>('/api/auth/me').then((d) => setUser(d.user || null)).catch(() => setUser(null)); }, []);
  async function loadStations(refresh = false) {
    setLoading(true); setNotice('');
    try {
      const data = await api<{ stations: Station[]; warning?: string }>(`/api/stations${refresh ? '?refresh=1' : ''}`);
      setStations(data.stations); if (data.warning) setNotice(data.warning);
    } catch (err) { setNotice((err as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (user) loadStations(); }, [user]);

  async function chooseOrigin(value: Origin) {
    setOrigin(value); setRouteBusy(true); setNotice(''); setRoute([]);
    try {
      const data = await api<{ ranked: Station[]; nearestId: string; route: [number, number][] }>('/api/routes/nearest', { method: 'POST', body: JSON.stringify({ origin: value }) });
      const ranks = new Map(data.ranked.map((s) => [s.id, s]));
      const next = stations.map((station) => ranks.get(station.id) || station);
      setStations(next); setNearestId(data.nearestId); setRoute(data.route);
      setSelected(next.find((station) => station.id === data.nearestId));
    } catch (err) { setNotice((err as Error).message); setNearestId(undefined); }
    finally { setRouteBusy(false); }
  }
  const sorted = useMemo(() => [...stations].sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999)), [stations]);

  if (user === undefined) return <div className="app-loading"><span className="brand-icon"><Zap /></span><span className="spinner dark" /></div>;
  if (!user) return <Login onLogin={setUser} />;
  if (view === 'bookings') return <Bookings onBack={() => setView('map')} />;
  return <main className="app-shell">
    <header className="topbar">
      <div className="brand-lockup"><span className="brand-icon"><Zap /></span><span>Charge Karnataka</span></div>
      <OriginSearch onChoose={chooseOrigin} />
      <nav><button className="nav-button" onClick={() => setView('bookings')}><CalendarDays /> <span>My bookings</span></button><span className="avatar">{user.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}</span><button className="icon-btn" title="Sign out" onClick={async () => { await api('/api/auth/logout', { method: 'POST' }); setUser(null); }}><LogOut /></button></nav>
    </header>
    <section className="workspace">
      <aside className="sidebar">
        <div className="sidebar-heading"><div><span className="eyebrow">CHARGING NETWORK</span><h1>Stations near you</h1><p>{origin ? `From ${origin.label}` : 'Search or tap the map to set your origin'}</p></div><button className="icon-btn" onClick={() => loadStations(true)} title="Refresh station data"><RefreshCw className={loading ? 'spin' : ''} /></button></div>
        {notice && <div className="notice">{notice}</div>}
        {routeBusy && <div className="route-loading"><span className="spinner dark" /><span>Finding the shortest drive…</span></div>}
        {loading ? <div className="station-skeleton">{[1,2,3,4].map((n) => <span key={n} />)}</div> : stations.length ? <StationList stations={sorted} selectedId={selected?.id} nearestId={nearestId} onSelect={setSelected} /> : <div className="empty-compact"><BatteryCharging /><strong>No stations loaded</strong><button onClick={() => loadStations(true)}>Retry</button></div>}
        <footer><span><span className="availability-dot" /> Public station data</span><small>© OpenStreetMap contributors</small></footer>
      </aside>
      <div className="map-area">
        <MapContainer center={CENTER} zoom={7} zoomControl={false}>
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapClick onChoose={chooseOrigin} />
          <MapFocus station={selected} origin={origin} />
          {origin && <CircleMarker center={[origin.lat, origin.lon]} radius={9} pathOptions={{ color: '#fff', weight: 4, fillColor: '#f05b47', fillOpacity: 1 }}><Tooltip permanent direction="top">Start</Tooltip></CircleMarker>}
          {stations.map((station) => <Marker key={station.id} position={[station.lat, station.lon]} icon={markerIcon(station.id === nearestId, station.id === selected?.id)} eventHandlers={{ click: () => setSelected(station) }}><Popup><strong>{station.name}</strong><br />{station.connectors[0]?.powerKw ?? 30} kW · {station.connectors[0]?.type ?? 'CCS2'}</Popup></Marker>)}
          {route.length > 0 && <Polyline positions={route} pathOptions={{ color: '#f05b47', weight: 5, opacity: .85 }} />}
        </MapContainer>
        {!origin && <div className="map-hint"><LocateFixed /><span><strong>Choose your starting point</strong><small>Search above or tap anywhere on the map</small></span></div>}
        <div className="map-legend"><span><i className="legend-nearest" /> Nearest</span><span><i /> Station</span></div>
        {selected && <StationDrawer station={selected} isNearest={selected.id === nearestId} onClose={() => setSelected(undefined)} onBook={(connector) => setBooking({ station: selected, connector })} />}
      </div>
    </section>
    {booking && <BookingModal station={booking.station} connector={booking.connector} onClose={() => setBooking(undefined)} onDone={() => { setBooking(undefined); setView('bookings'); }} />}
  </main>;
}
