import { NextResponse } from 'next/server';

/**
 * OSIRIS — Worldwide CCTV Camera API
 * Aggregates free public traffic cameras from multiple cities/countries
 * All sources are free, no API keys required
 */

// ── Transport for London JamCams (~900 cameras) ──
async function fetchTfLCameras(): Promise<any[]> {
  try {
    const res = await fetch('https://api.tfl.gov.uk/Place/Type/JamCam', {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map((cam: any) => ({
      id: `tfl-${cam.id}`,
      lat: cam.lat,
      lng: cam.lon,
      name: cam.commonName || 'London JamCam',
      city: 'London',
      country: 'UK',
      feed_url: cam.additionalProperties?.find((p: any) => p.key === 'imageUrl')?.value
        || `https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/${cam.id}.jpg`,
      feed_type: 'image',
      source: 'TfL',
    }));
  } catch (e) {
    console.warn('TfL fetch failed:', e);
    return [];
  }
}

// ── NYC DOT Traffic Cameras (~700 cameras) ──
async function fetchNYCCameras(): Promise<any[]> {
  try {
    const res = await fetch('https://webcams.nyctmc.org/api/cameras', {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map((cam: any) => ({
      id: `nyc-${cam.id || cam.cameraID}`,
      lat: cam.latitude,
      lng: cam.longitude,
      name: cam.name || cam.cameraName || 'NYC Camera',
      city: 'New York City',
      country: 'US',
      feed_url: cam.imageUrl || cam.url || `https://webcams.nyctmc.org/api/cameras/${cam.id || cam.cameraID}/image`,
      feed_type: 'image',
      source: 'NYC DOT',
    })).filter((c: any) => c.lat && c.lng);
  } catch (e) {
    console.warn('NYC fetch failed:', e);
    return [];
  }
}

// ── Caltrans CCTV (California ~2000 cameras) ──
async function fetchCaltransCameras(): Promise<any[]> {
  try {
    const res = await fetch('https://cwwp2.dot.ca.gov/data/d3/cctv/cctvStatusD03.json', {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const cams = data?.data || [];
    return cams.map((cam: any) => ({
      id: `cal-${cam.location?.locationName || Math.random()}`,
      lat: cam.cctv?.imageData?.static?.currentImageURL ? parseFloat(cam.location?.latitude) : null,
      lng: cam.cctv?.imageData?.static?.currentImageURL ? parseFloat(cam.location?.longitude) : null,
      name: cam.location?.locationName || 'Caltrans Camera',
      city: cam.location?.district || 'California',
      country: 'US',
      feed_url: cam.cctv?.imageData?.static?.currentImageURL || '',
      feed_type: 'image',
      source: 'Caltrans',
    })).filter((c: any) => c.lat && c.lng && c.feed_url);
  } catch (e) {
    console.warn('Caltrans fetch failed:', e);
    return [];
  }
}

// ── WSDOT (Washington State ~500 cameras) ──
async function fetchWSDOTCameras(): Promise<any[]> {
  try {
    const res = await fetch('https://data.wsdot.wa.gov/log/public/cameras.json', {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map((cam: any) => ({
      id: `wsdot-${cam.CameraID}`,
      lat: cam.CameraLocation?.Latitude,
      lng: cam.CameraLocation?.Longitude,
      name: cam.Title || cam.Description || 'WSDOT Camera',
      city: 'Washington State',
      country: 'US',
      feed_url: cam.ImageURL || '',
      feed_type: 'image',
      source: 'WSDOT',
    })).filter((c: any) => c.lat && c.lng && c.feed_url);
  } catch (e) {
    console.warn('WSDOT fetch failed:', e);
    return [];
  }
}

// ── Austin TX TxDOT (~200 cameras) ──
async function fetchAustinCameras(): Promise<any[]> {
  try {
    const res = await fetch('https://its.txdot.gov/api/cameras?district=aus', {
      signal: AbortSignal.timeout(10000),
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map((cam: any) => ({
      id: `atx-${cam.deviceId || Math.random()}`,
      lat: cam.latitude || cam.location?.latitude,
      lng: cam.longitude || cam.location?.longitude,
      name: cam.name || cam.description || 'Austin Camera',
      city: 'Austin, TX',
      country: 'US',
      feed_url: cam.imageUrl || cam.url || '',
      feed_type: 'image',
      source: 'TxDOT',
    })).filter((c: any) => c.lat && c.lng);
  } catch (e) {
    console.warn('Austin fetch failed:', e);
    return [];
  }
}

// ── 511 San Francisco (~200 cameras) ──
async function fetch511SFCameras(): Promise<any[]> {
  try {
    const res = await fetch('https://api.511.org/traffic/cameras?api_key=25992f67-d7d2-4d5e-8822-0cb745696444&format=json', {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    // Remove BOM if present
    const clean = text.replace(/^\uFEFF/, '');
    const data = JSON.parse(clean);
    const cameras = data?.cameras || data?.data || [];
    return cameras.map((cam: any) => ({
      id: `sf511-${cam.id}`,
      lat: cam.location?.latitude || cam.latitude,
      lng: cam.location?.longitude || cam.longitude,
      name: cam.name || cam.description || 'SF Bay Camera',
      city: 'San Francisco',
      country: 'US',
      feed_url: cam.imageUrl || cam.currentImageUrl || '',
      feed_type: 'image',
      source: '511 SF',
    })).filter((c: any) => c.lat && c.lng);
  } catch (e) {
    console.warn('511 SF fetch failed:', e);
    return [];
  }
}

export async function GET() {
  try {
    // Fetch all camera sources in parallel
    const [tfl, nyc, wsdot, austin, caltrans, sf511] = await Promise.allSettled([
      fetchTfLCameras(),
      fetchNYCCameras(),
      fetchWSDOTCameras(),
      fetchAustinCameras(),
      fetchCaltransCameras(),
      fetch511SFCameras(),
    ]);

    const allCameras: any[] = [];
    const sources: Record<string, number> = {};

    for (const result of [tfl, nyc, wsdot, austin, caltrans, sf511]) {
      if (result.status === 'fulfilled') {
        const cams = result.value;
        allCameras.push(...cams);
        for (const cam of cams) {
          sources[cam.source] = (sources[cam.source] || 0) + 1;
        }
      }
    }

    return NextResponse.json({
      cameras: allCameras,
      total: allCameras.length,
      sources,
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('CCTV fetch error:', error);
    return NextResponse.json({ cameras: [], error: 'Failed to fetch camera data' }, { status: 500 });
  }
}
