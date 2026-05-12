import { NextResponse } from 'next/server';

/**
 * OSIRIS — NASA FIRMS Active Fire Tracking
 * Real-time worldwide wildfire/fire detection from NASA satellites
 * Free, no API key required
 */

export async function GET() {
  try {
    // NASA FIRMS VIIRS active fire data (last 24h)
    const url = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/d0a624db1bff890120a9bc74e81e4e46/VIIRS_SNPP_NRT/world/1';
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      next: { revalidate: 600 },
    });

    if (!res.ok) {
      // Fallback to MODIS
      const fallbackUrl = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/d0a624db1bff890120a9bc74e81e4e46/MODIS_NRT/world/1';
      const fallbackRes = await fetch(fallbackUrl, {
        signal: AbortSignal.timeout(20000),
      });
      if (!fallbackRes.ok) {
        return NextResponse.json({ fires: [], error: 'NASA FIRMS unavailable' });
      }
      const text = await fallbackRes.text();
      return NextResponse.json({
        fires: parseCSV(text),
        timestamp: new Date().toISOString(),
      });
    }

    const text = await res.text();
    const fires = parseCSV(text);

    return NextResponse.json({
      fires,
      total: fires.length,
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200',
      },
    });
  } catch (error) {
    console.error('FIRMS fetch error:', error);
    return NextResponse.json({ fires: [], error: 'Failed to fetch fire data' }, { status: 500 });
  }
}

function parseCSV(csv: string): any[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const header = lines[0].split(',');
  const latIdx = header.indexOf('latitude');
  const lngIdx = header.indexOf('longitude');
  const brightIdx = header.indexOf('bright_ti4') !== -1 ? header.indexOf('bright_ti4') : header.indexOf('brightness');
  const confIdx = header.indexOf('confidence');
  const dateIdx = header.indexOf('acq_date');
  const timeIdx = header.indexOf('acq_time');
  const frpIdx = header.indexOf('frp');

  const fires: any[] = [];
  // Sample for performance — max 3000 fires
  const step = lines.length > 3000 ? Math.ceil(lines.length / 3000) : 1;

  for (let i = 1; i < lines.length; i += step) {
    const cols = lines[i].split(',');
    const lat = parseFloat(cols[latIdx]);
    const lng = parseFloat(cols[lngIdx]);
    if (isNaN(lat) || isNaN(lng)) continue;

    fires.push({
      lat: Math.round(lat * 1000) / 1000,
      lng: Math.round(lng * 1000) / 1000,
      brightness: parseFloat(cols[brightIdx]) || 0,
      confidence: cols[confIdx] || 'unknown',
      date: cols[dateIdx] || '',
      time: cols[timeIdx] || '',
      frp: parseFloat(cols[frpIdx]) || 0,
    });
  }

  return fires;
}
