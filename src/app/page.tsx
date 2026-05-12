'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import LayerPanel from '@/components/LayerPanel';
import IntelFeed from '@/components/IntelFeed';
import MarketsPanel from '@/components/MarketsPanel';
import SearchBar from '@/components/SearchBar';
import ScaleBar from '@/components/ScaleBar';
import ErrorBoundary from '@/components/ErrorBoundary';

const OsirisMap = dynamic(() => import('@/components/OsirisMap'), { ssr: false });

export default function Dashboard() {
  const dataRef = useRef<any>({});
  const [dataVersion, setDataVersion] = useState(0);
  const data = dataRef.current;

  const [backendStatus, setBackendStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [mapView, setMapView] = useState({ zoom: 2.5, latitude: 20 });
  const [flyToLocation, setFlyToLocation] = useState<{ lat: number; lng: number; ts: number } | null>(null);
  const [mouseCoords, setMouseCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState('');
  const [regionDossier, setRegionDossier] = useState<any>(null);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [uptime, setUptime] = useState('00:00:00');
  const startTime = useRef(Date.now());
  const geocodeCache = useRef<Map<string, string>>(new Map());
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastGeocodedPos = useRef<{ lat: number; lng: number } | null>(null);

  // ── DEFAULT: Most layers OFF — don't flood the user ──
  const [activeLayers, setActiveLayers] = useState({
    flights: false,
    private: false,
    jets: false,
    military: false,
    satellites: false,
    cctv: false,
    earthquakes: true,
    fires: false,
    global_incidents: false,
    gps_jamming: false,
    day_night: true,
  });

  // Uptime clock
  useEffect(() => {
    const iv = setInterval(() => {
      const e = Math.floor((Date.now() - startTime.current) / 1000);
      setUptime(`${String(Math.floor(e/3600)).padStart(2,'0')}:${String(Math.floor((e%3600)/60)).padStart(2,'0')}:${String(e%60).padStart(2,'0')}`);
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  // Splash screen
  useEffect(() => { setTimeout(() => setShowSplash(false), 2500); }, []);

  // Mouse coords + reverse geocode
  const handleMouseCoords = useCallback((coords: { lat: number; lng: number }) => {
    setMouseCoords(coords);
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    geocodeTimer.current = setTimeout(async () => {
      if (lastGeocodedPos.current) {
        const d = Math.abs(coords.lat - lastGeocodedPos.current.lat) + Math.abs(coords.lng - lastGeocodedPos.current.lng);
        if (d < 0.1) return;
      }
      const gk = `${coords.lat.toFixed(2)},${coords.lng.toFixed(2)}`;
      if (geocodeCache.current.has(gk)) { setLocationLabel(geocodeCache.current.get(gk)!); lastGeocodedPos.current = coords; return; }
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=json&zoom=10&addressdetails=1`, { headers: { 'Accept-Language': 'en' } });
        if (res.ok) {
          const d = await res.json();
          const a = d.address || {};
          const label = [a.city||a.town||a.village||a.county, a.state||a.region, a.country].filter(Boolean).join(', ') || 'Unknown';
          if (geocodeCache.current.size > 500) { const it = geocodeCache.current.keys(); for (let i=0;i<100;i++) { const k = it.next().value; if(k) geocodeCache.current.delete(k); }}
          geocodeCache.current.set(gk, label);
          setLocationLabel(label);
          lastGeocodedPos.current = coords;
        }
      } catch {}
    }, 1500);
  }, []);

  // Region dossier (right-click)
  const handleRightClick = useCallback(async (coords: { lat: number; lng: number }) => {
    setDossierLoading(true); setRegionDossier(null);
    try {
      const res = await fetch(`/api/region-dossier?lat=${coords.lat}&lng=${coords.lng}`);
      if (res.ok) setRegionDossier(await res.json());
    } catch {} finally { setDossierLoading(false); }
  }, []);

  // ── PROGRESSIVE DATA LOADING — staggered fetches ──
  useEffect(() => {
    const fetchEndpoint = async (url: string, key: string, transform?: (d: any) => any) => {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          const d = transform ? transform(json) : json;
          dataRef.current = { ...dataRef.current, ...d };
          setDataVersion(v => v + 1);
          setBackendStatus('connected');
        }
      } catch { setBackendStatus('error'); }
    };

    // Priority 1: Earthquakes + News (lightweight, immediate value)
    fetchEndpoint('/api/earthquakes', 'eq');
    fetchEndpoint('/api/news', 'news');

    // Priority 2: Markets (small payload) — 500ms delay
    setTimeout(() => fetchEndpoint('/api/markets', 'markets'), 500);

    // Priority 3: Flights (large payload) — 1.5s delay
    setTimeout(() => fetchEndpoint('/api/flights', 'flights'), 1500);

    // Priority 4: CCTV + Fires — 3s delay
    setTimeout(() => fetchEndpoint('/api/cctv', 'cctv'), 3000);
    setTimeout(() => fetchEndpoint('/api/fires', 'fires'), 3500);

    // Priority 5: Satellites + GDELT — 5s delay
    setTimeout(() => fetchEndpoint('/api/satellites', 'sats'), 5000);
    setTimeout(() => fetchEndpoint('/api/gdelt', 'gdelt', d => ({ gdelt: d.events })), 6000);

    // Polling intervals (after initial load)
    const intervals = [
      setInterval(() => fetchEndpoint('/api/flights', 'flights'), 60000),
      setInterval(() => fetchEndpoint('/api/earthquakes', 'eq'), 120000),
      setInterval(() => fetchEndpoint('/api/satellites', 'sats'), 120000),
      setInterval(() => fetchEndpoint('/api/news', 'news'), 300000),
      setInterval(() => fetchEndpoint('/api/markets', 'markets'), 120000),
      setInterval(() => fetchEndpoint('/api/cctv', 'cctv'), 300000),
      setInterval(() => fetchEndpoint('/api/fires', 'fires'), 600000),
      setInterval(() => fetchEndpoint('/api/gdelt', 'gdelt', d => ({ gdelt: d.events })), 600000),
    ];
    return () => intervals.forEach(clearInterval);
  }, []);

  const totalFlights = (data.commercial_flights?.length||0)+(data.private_flights?.length||0)+(data.private_jets?.length||0)+(data.military_flights?.length||0);

  return (
    <main className="fixed inset-0 w-full h-full bg-[var(--bg-void)] overflow-hidden">

      {/* ── SPLASH ── */}
      <AnimatePresence>
        {showSplash && (
          <motion.div initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }} className="absolute inset-0 z-[999] bg-[var(--bg-void)] flex flex-col items-center justify-center">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6 }} className="w-16 h-16 rounded-full border-2 border-[var(--gold-primary)] flex items-center justify-center mb-4 animate-glow-pulse">
              <div className="w-8 h-8 rounded-full bg-[var(--gold-primary)]/20 border border-[var(--gold-primary)]/40" />
            </motion.div>
            <motion.h1 initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="text-3xl font-bold tracking-[0.6em] text-[var(--text-heading)] font-mono">OSIRIS</motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="text-[9px] text-[var(--gold-primary)] font-mono tracking-[0.3em] mt-2">INITIALIZING GLOBAL INTELLIGENCE FEEDS...</motion.p>
            <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.8, duration: 1.5 }} className="w-48 h-[2px] bg-gradient-to-r from-transparent via-[var(--gold-primary)] to-transparent mt-6 origin-left" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MAP ── */}
      <ErrorBoundary name="Map">
        <OsirisMap data={data} activeLayers={activeLayers} onEntityClick={() => {}} onMouseCoords={handleMouseCoords} onRightClick={handleRightClick} onViewStateChange={setMapView} flyToLocation={flyToLocation} />
      </ErrorBoundary>

      {/* ── HEADER ── */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 2.5 }} className="absolute top-5 left-5 z-[200] pointer-events-none flex items-center gap-3">
        <div className="w-9 h-9 flex items-center justify-center relative">
          <div className="w-7 h-7 rounded-full border-2 border-[var(--gold-primary)] flex items-center justify-center animate-glow-pulse">
            <div className="w-3.5 h-3.5 rounded-full bg-[var(--gold-primary)]/30 border border-[var(--gold-primary)]/60" />
          </div>
          <div className="absolute w-[1px] h-full bg-[var(--gold-primary)]/30" />
          <div className="absolute w-full h-[1px] bg-[var(--gold-primary)]/30" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-[0.5em] text-[var(--text-heading)] font-mono">OSIRIS</h1>
          <span className="text-[7px] text-[var(--gold-primary)] font-mono tracking-[0.3em] opacity-80">GLOBAL INTELLIGENCE PLATFORM</span>
        </div>
      </motion.div>

      {/* ── TOP-RIGHT STATUS ── */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3 }} className="absolute top-4 right-5 z-[200] pointer-events-none flex items-center gap-4 text-[7px] font-mono tracking-widest text-[var(--text-muted)]">
        <span>SYS: <span className={backendStatus === 'connected' ? 'text-[var(--alert-green)]' : 'text-[var(--alert-red)]'}>{backendStatus.toUpperCase()}</span></span>
        <span>UPTIME: <span className="text-[var(--gold-primary)]">{uptime}</span></span>
        <span>V1.1.0</span>
      </motion.div>

      {/* ── LEFT HUD ── */}
      <div className="absolute left-5 top-20 bottom-24 w-72 flex flex-col gap-3 z-[200] pointer-events-none overflow-y-auto styled-scrollbar pr-1">
        <LayerPanel data={data} activeLayers={activeLayers} setActiveLayers={setActiveLayers} />
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }} className="glass-panel px-3 py-2.5 pointer-events-auto">
          <div className="grid grid-cols-4 gap-2 text-center">
            <div><div className="hud-label">AIRCRAFT</div><div className="hud-value text-[10px]">{totalFlights.toLocaleString()}</div></div>
            <div><div className="hud-label">SATS</div><div className="hud-value text-[10px]">{(data.satellites?.length||0).toLocaleString()}</div></div>
            <div><div className="hud-label">CCTV</div><div className="hud-value text-[10px]">{(data.cameras?.length||0).toLocaleString()}</div></div>
            <div><div className="hud-label">FIRES</div><div className="hud-value text-[10px]">{(data.fires?.length||0).toLocaleString()}</div></div>
          </div>
        </motion.div>
      </div>

      {/* ── RIGHT HUD ── */}
      <div className="absolute right-5 top-20 bottom-24 w-80 flex flex-col gap-3 z-[200] pointer-events-auto overflow-y-auto styled-scrollbar pr-1">
        <SearchBar onLocate={(lat, lng) => setFlyToLocation({ lat, lng, ts: Date.now() })} />
        <MarketsPanel data={data} />
        <IntelFeed data={data} onLocate={(lat, lng) => setFlyToLocation({ lat, lng, ts: Date.now() })} />
      </div>

      {/* ── BOTTOM CENTER ── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 3, duration: 0.8 }} className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[200] pointer-events-auto">
        <div className="glass-panel px-5 py-2.5 flex items-center gap-5 osiris-glow">
          <div className="flex flex-col items-center min-w-[110px]">
            <div className="hud-label">COORDINATES</div>
            <div className="text-[10px] font-mono font-bold text-[var(--gold-primary)] tracking-wide">{mouseCoords ? `${mouseCoords.lat.toFixed(4)}, ${mouseCoords.lng.toFixed(4)}` : '—'}</div>
          </div>
          <div className="w-px h-7 bg-[var(--border-primary)]" />
          <div className="flex flex-col items-center min-w-[160px] max-w-[280px]">
            <div className="hud-label">LOCATION</div>
            <div className="text-[9px] text-[var(--text-secondary)] font-mono truncate max-w-[280px]">{locationLabel || 'Hover over map...'}</div>
          </div>
          <div className="w-px h-7 bg-[var(--border-primary)]" />
          <div className="flex flex-col items-center">
            <div className="hud-label">ZOOM</div>
            <div className="text-[10px] font-mono font-bold text-[var(--gold-primary)]">{mapView.zoom.toFixed(1)}</div>
          </div>
        </div>
      </motion.div>

      {/* ── Scale Bar ── */}
      <div className="absolute bottom-[4.5rem] left-[20rem] z-[201] pointer-events-none">
        <ScaleBar zoom={mapView.zoom} latitude={mapView.latitude} />
      </div>

      {/* ── Region Dossier ── */}
      {(regionDossier || dossierLoading) && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="absolute top-20 left-1/2 -translate-x-1/2 z-[300] w-[480px] max-h-[65vh] overflow-y-auto styled-scrollbar">
          <div className="glass-panel p-5 osiris-glow">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-mono font-bold text-[var(--gold-primary)] tracking-wider">REGION DOSSIER</h2>
              <button onClick={() => { setRegionDossier(null); setDossierLoading(false); }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs">✕</button>
            </div>
            {dossierLoading ? (
              <div className="text-center py-8">
                <div className="w-5 h-5 border-2 border-[var(--gold-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <span className="text-[8px] font-mono text-[var(--text-muted)] tracking-widest">COMPILING INTEL...</span>
              </div>
            ) : regionDossier && (
              <div className="space-y-3">
                <div><div className="hud-label mb-0.5">LOCATION</div><div className="text-xs text-[var(--text-primary)]">{regionDossier.location?.display_name}</div></div>
                {regionDossier.country && (
                  <div className="grid grid-cols-2 gap-2">
                    <div><div className="hud-label mb-0.5">COUNTRY</div><div className="text-xs text-[var(--text-primary)]">{regionDossier.country.flag} {regionDossier.country.name}</div></div>
                    <div><div className="hud-label mb-0.5">CAPITAL</div><div className="text-xs text-[var(--text-primary)]">{regionDossier.country.capital}</div></div>
                    <div><div className="hud-label mb-0.5">POPULATION</div><div className="text-xs text-[var(--text-primary)]">{regionDossier.country.population?.toLocaleString()}</div></div>
                    <div><div className="hud-label mb-0.5">REGION</div><div className="text-xs text-[var(--text-primary)]">{regionDossier.country.subregion || regionDossier.country.region}</div></div>
                    <div><div className="hud-label mb-0.5">LANGUAGES</div><div className="text-xs text-[var(--text-primary)]">{regionDossier.country.languages?.join(', ')}</div></div>
                    <div><div className="hud-label mb-0.5">AREA</div><div className="text-xs text-[var(--text-primary)]">{regionDossier.country.area?.toLocaleString()} km²</div></div>
                  </div>
                )}
                {regionDossier.head_of_state && (<div><div className="hud-label mb-0.5">HEAD OF STATE</div><div className="text-xs text-[var(--gold-primary)]">{regionDossier.head_of_state.name}</div><div className="text-[8px] text-[var(--text-muted)]">{regionDossier.head_of_state.position}</div></div>)}
                {regionDossier.wikipedia && (<div><div className="hud-label mb-1">INTELLIGENCE BRIEF</div><div className="flex gap-3">{regionDossier.wikipedia.thumbnail && <img src={regionDossier.wikipedia.thumbnail} alt="" className="w-14 h-14 rounded object-cover flex-shrink-0" />}<p className="text-[8px] text-[var(--text-secondary)] leading-relaxed">{regionDossier.wikipedia.extract}</p></div></div>)}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ── OVERLAYS ── */}
      <div className="vignette absolute inset-0 pointer-events-none z-[2]" />
      <div className="crt-scanlines absolute inset-0 pointer-events-none z-[3] opacity-[0.02]" />
      {/* Corner frames */}
      {['top-0 left-0','top-0 right-0','bottom-0 left-0','bottom-0 right-0'].map((pos, i) => (
        <div key={i} className={`absolute ${pos} w-16 h-16 pointer-events-none z-[1]`}>
          <div className={`absolute ${pos.includes('top') ? 'top-0' : 'bottom-0'} ${pos.includes('left') ? 'left-0' : 'right-0'} w-full h-[1px] bg-gradient-to-${pos.includes('left') ? 'r' : 'l'} from-[var(--gold-primary)]/30 to-transparent`} />
          <div className={`absolute ${pos.includes('top') ? 'top-0' : 'bottom-0'} ${pos.includes('left') ? 'left-0' : 'right-0'} w-[1px] h-full bg-gradient-to-${pos.includes('top') ? 'b' : 't'} from-[var(--gold-primary)]/30 to-transparent`} />
        </div>
      ))}
    </main>
  );
}
