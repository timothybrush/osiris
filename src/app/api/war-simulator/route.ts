import { NextResponse } from 'next/server';

// Global state for simulated alerts (works in Node.js serverless environment)
let simulatedAlerts: any[] = [];
let lastUpdate = Date.now();

const ZONES = [
  // Israel Strikes on Lebanon / Gaza
  { origin: { lat: 32.8, lng: 34.98 }, target: { lat: 33.89, lng: 35.50 }, name: 'Beirut', originName: 'Israel', type: 'AIRSTRIKE' },
  { origin: { lat: 33.0, lng: 35.1 }, target: { lat: 33.27, lng: 35.20 }, name: 'Tyre (South Lebanon)', originName: 'Israel', type: 'ARTILLERY_STRIKE' },
  { origin: { lat: 31.65, lng: 34.56 }, target: { lat: 31.5, lng: 34.46 }, name: 'Gaza Strip', originName: 'Israel', type: 'AIRSTRIKE' },
  { origin: { lat: 31.51, lng: 34.59 }, target: { lat: 31.28, lng: 34.24 }, name: 'Rafah', originName: 'Israel', type: 'DRONE_STRIKE' },
  
  // Ukraine / Russia
  { origin: { lat: 50.6, lng: 36.6 }, target: { lat: 50.0, lng: 36.2 }, name: 'Kharkiv', originName: 'Belgorod', type: 'BALLISTIC_MISSILE' },
  { origin: { lat: 46.5, lng: 39.5 }, target: { lat: 46.48, lng: 30.73 }, name: 'Odesa', originName: 'Black Sea', type: 'CRUISE_MISSILE' },
  { origin: { lat: 53.0, lng: 30.0 }, target: { lat: 50.45, lng: 30.52 }, name: 'Kyiv', originName: 'Belarus', type: 'UAV_SWARM' },
  
  // Israel Strikes on Yemen
  { origin: { lat: 29.55, lng: 34.95 }, target: { lat: 14.80, lng: 42.95 }, name: 'Hodeidah Port (Yemen)', originName: 'Israel', type: 'AIRSTRIKE' },
];

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function updateSimulatedAlerts() {
  const now = Date.now();
  // Remove expired alerts
  simulatedAlerts = simulatedAlerts.filter(a => a.impactTime > now);

  // 10% chance to spawn a new alert every time it's called (if less than 5 active)
  if (simulatedAlerts.length < 5 && Math.random() < 0.15) {
    const zone = ZONES[Math.floor(Math.random() * ZONES.length)];
    
    // Add some random jitter to target and origin
    const originLat = zone.origin.lat + (Math.random() - 0.5) * 0.1;
    const originLng = zone.origin.lng + (Math.random() - 0.5) * 0.1;
    const targetLat = zone.target.lat + (Math.random() - 0.5) * 0.05;
    const targetLng = zone.target.lng + (Math.random() - 0.5) * 0.05;

    // Flight time based on type
    const flightDurationMs = 
      zone.type === 'BALLISTIC_MISSILE' ? 180000 : // 3 mins
      zone.type === 'CRUISE_MISSILE' ? 300000 :    // 5 mins
      zone.type === 'UAV_SWARM' ? 600000 :         // 10 mins
      45000;                                       // 45s standard rocket

    simulatedAlerts.push({
      id: `alert-${generateId()}`,
      city: zone.name,
      originName: zone.originName,
      type: zone.type,
      launchTime: now,
      impactTime: now + flightDurationMs,
      origin: [originLng, originLat], // GeoJSON format: [lng, lat]
      target: [targetLng, targetLat],
      threatLevel: zone.type.includes('MISSILE') ? 'CRITICAL' : 'HIGH',
      status: 'ACTIVE',
      source: 'OSIRIS_PREDICTIVE_SIMULATOR'
    });
  }
}

export async function GET() {
  try {
    // Attempt to fetch real alerts here (pseudo-code block for future live integration)
    /*
    const liveRes = await fetch('https://api.tzevaadom.co.il/alerts-history/');
    if (liveRes.ok) { ... merge with simulatedAlerts ... }
    */

    // Update the predictive engine state
    updateSimulatedAlerts();

    // Calculate T-Minus for response
    const now = Date.now();
    const formattedAlerts = simulatedAlerts.map(a => ({
      ...a,
      timeToImpactMs: Math.max(0, a.impactTime - now)
    }));

    // Sort by impact time (most imminent first)
    formattedAlerts.sort((a, b) => a.timeToImpactMs - b.timeToImpactMs);

    return NextResponse.json({
      alerts: formattedAlerts,
      defcon: formattedAlerts.length > 2 ? 2 : formattedAlerts.length > 0 ? 3 : 4,
      timestamp: new Date().toISOString()
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0' // Never cache this
      }
    });

  } catch (error) {
    console.error('War simulator engine error:', error);
    return NextResponse.json({ alerts: [], error: 'Simulation engine failed' }, { status: 500 });
  }
}
