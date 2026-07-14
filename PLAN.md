# Karnataka EV Charging Finder

Build a local, map-first web app for drivers to find EV charging stations across Karnataka, trace the shortest driving route, reserve timed charging slots, and complete a simulated payment.

## Implementation

- React, TypeScript, Vite, Express, SQLite, Leaflet/OpenStreetMap, Overpass, Nominatim, and OSRM.
- Import and cache public Karnataka charging stations, normalize connector data, and preserve the last successful cache during service outages.
- Demo account-backed bookings with conflict-safe timed slots and mock payment.
- Search or click to set an origin, rank stations by driving distance, and draw the nearest route.
- Calculate duration from requested energy and connector power in 15-minute blocks.
- Allow pre-start cancellation without refund.

## Verification

- Unit tests for booking calculations and overlap detection.
- Integration coverage for authentication, payment, reservation, and cancellation.
- Browser verification on mobile and desktop layouts.

## Defaults

- Local runtime, English interface, INR currency, kilometre distances, and Asia/Kolkata time.
- Missing connector data defaults to a 30 kW CCS2 connector and tariff defaults to INR 18/kWh.
