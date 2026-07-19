'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bluetooth, BluetoothSearching, Tv, Speaker, X, WifiOff,
  Gamepad2, Lightbulb, Watch, Headphones, Mouse, Keyboard, Smartphone,
  Unplug, Zap, BatteryMedium, Info, Cpu, Tag, Hash, Fan,
  Eye, Send, Bell, BellOff, ChevronRight, Copy, Check, Terminal,
  AlertTriangle, Radio, Scan, ChevronDown, Shield, Fingerprint, Signal
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// BLE CONSTANTS
// ═══════════════════════════════════════════════════════════════

const BLE_SERVICES = {
  GENERIC_ACCESS: 0x1800, GENERIC_ATTRIBUTE: 0x1801, DEVICE_INFORMATION: 0x180A,
  BATTERY: 0x180F, HEART_RATE: 0x180D, BLOOD_PRESSURE: 0x1810,
  HEALTH_THERMOMETER: 0x1809, HID: 0x1812, RUNNING_SPEED: 0x1814,
  CYCLING_SPEED: 0x1816, CYCLING_POWER: 0x1818, ENVIRONMENTAL_SENSING: 0x181A,
  BODY_COMPOSITION: 0x181B, USER_DATA: 0x181C, WEIGHT_SCALE: 0x181D,
  GLUCOSE: 0x1808, TX_POWER: 0x1804, LINK_LOSS: 0x1803,
  IMMEDIATE_ALERT: 0x1802, CURRENT_TIME: 0x1805, PHONE_ALERT_STATUS: 0x180E,
  ALERT_NOTIFICATION: 0x1811, AUTOMATION_IO: 0x1815, MEDIA_CONTROL: 0x1848,
} as const;

const BLE_CHARS = {
  DEVICE_NAME: 0x2A00, APPEARANCE: 0x2A01, MANUFACTURER_NAME: 0x2A29,
  MODEL_NUMBER: 0x2A24, SERIAL_NUMBER: 0x2A25, HARDWARE_REVISION: 0x2A27,
  FIRMWARE_REVISION: 0x2A26, SOFTWARE_REVISION: 0x2A28, SYSTEM_ID: 0x2A23,
  PNP_ID: 0x2A50, BATTERY_LEVEL: 0x2A19,
} as const;

const ALL_OPTIONAL_SERVICES = Object.values(BLE_SERVICES);

const KNOWN_UUIDS: Record<number, string> = {
  0x1800:'Generic Access',0x1801:'Generic Attribute',0x180A:'Device Information',
  0x180F:'Battery',0x180D:'Heart Rate',0x1810:'Blood Pressure',0x1809:'Health Thermometer',
  0x1812:'HID',0x1814:'Running Speed',0x1816:'Cycling Speed',0x1818:'Cycling Power',
  0x181A:'Environmental Sensing',0x181B:'Body Composition',0x181C:'User Data',
  0x181D:'Weight Scale',0x1802:'Immediate Alert',0x1803:'Link Loss',0x1804:'TX Power',
  0x1805:'Current Time',0x180E:'Phone Alert Status',0x1811:'Alert Notification',
  0x1815:'Automation IO',0x1848:'Media Control',
  0x2A00:'Device Name',0x2A01:'Appearance',0x2A19:'Battery Level',
  0x2A24:'Model Number',0x2A25:'Serial Number',0x2A26:'Firmware Rev',
  0x2A27:'Hardware Rev',0x2A28:'Software Rev',0x2A29:'Manufacturer',
  0x2A23:'System ID',0x2A50:'PnP ID',0x2A37:'Heart Rate',
  0x2A38:'Body Sensor',0x2A6E:'Temperature',0x2A6F:'Humidity',0x2A6D:'Pressure',
};

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

type DeviceType = 'tv'|'speaker'|'ac'|'light'|'wearable'|'headphones'|'gamepad'|'keyboard'|'mouse'|'phone'|'unknown';

interface DeviceInfo {
  manufacturer?: string; model?: string; serial?: string;
  hardware?: string; firmware?: string; software?: string;
  appearance?: number; appearanceLabel?: string;
  detectedServices: string[]; classifiedBy: 'appearance'|'service'|'name'|'pnp';
}

interface ScannedDevice {
  id: string; name: string; type: DeviceType; connected: boolean;
  battery?: number; deviceInfo?: DeviceInfo; bluetoothDevice?: BluetoothDevice;
  server?: BluetoothRemoteGATTServer; probing?: boolean; probeTime?: number;
}

interface GATTServiceInfo { uuid: string; name: string; characteristics: GATTCharInfo[]; }
interface GATTCharInfo {
  uuid: string; name: string; value?: string; rawHex?: string; notifying?: boolean;
  characteristic?: BluetoothRemoteGATTCharacteristic;
  properties: { read: boolean; write: boolean; writeNoResp: boolean; notify: boolean; indicate: boolean };
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function classifyByAppearance(a: number): DeviceType | null {
  const map: Record<number, DeviceType> = {
    0x0040:'phone',0x00C0:'wearable',0x00C1:'wearable',0x00C2:'wearable',
    0x0140:'tv',0x0300:'ac',0x03C1:'keyboard',0x03C2:'mouse',0x03C4:'gamepad',
    0x0840:'speaker',0x0841:'speaker',0x0842:'headphones',0x0843:'headphones',
    0x0C40:'wearable',0x1440:'wearable',
  };
  if (map[a]) return map[a];
  const cat = a & 0xFFC0;
  if (cat >= 0x0040 && cat <= 0x007F) return 'phone';
  if (cat >= 0x00C0 && cat <= 0x00FF) return 'wearable';
  if (cat >= 0x0140 && cat <= 0x017F) return 'tv';
  if (cat >= 0x03C0 && cat <= 0x03FF) { const s = a & 0x3F; return s===1?'keyboard':s===2?'mouse':s===4?'gamepad':null; }
  if (cat >= 0x0840 && cat <= 0x087F) return 'speaker';
  return null;
}

function classifyByServices(uuids: number[]): DeviceType | null {
  const has = (u: number) => uuids.includes(u);
  if (has(0x1848)) return 'speaker';
  if (has(0x1812)) return 'gamepad';
  if (has(0x180D)||has(0x1814)||has(0x1816)||has(0x1818)) return 'wearable';
  if (has(0x181A)||has(0x1809)) return 'ac';
  if (has(0x1810)||has(0x1808)||has(0x181B)||has(0x181D)) return 'wearable';
  if (has(0x180E)) return 'phone';
  return null;
}

function classifyByName(n: string): DeviceType {
  const l = n.toLowerCase();
  if (/\btv\b|bravia|roku|chromecast|fire.?stick|apple.?tv|shield|vizio/i.test(l)) return 'tv';
  if (/speaker|soundbar|bose|jbl|sonos|marshall|echo|homepod|ue.?boom|soundcore|beats.?pill/i.test(l)) return 'speaker';
  if (/\bac\b|thermostat|nest|ecobee|daikin|sensibo|tado/i.test(l)) return 'ac';
  if (/bulb|light|hue|lifx|nanoleaf|govee|yeelight|lamp/i.test(l)) return 'light';
  if (/watch|band|fitbit|garmin|amazfit|polar|suunto|whoop|coros/i.test(l)) return 'wearable';
  if (/headphone|airpod|buds|earbud|wh-1000|wf-1000|qc|momentum|jabra|galaxy.?buds|freebuds|nothing.?ear/i.test(l)) return 'headphones';
  if (/gamepad|controller|xbox|playstation|dualsense|joy.?con|8bitdo/i.test(l)) return 'gamepad';
  if (/keyboard|keychron|hhkb|nuphy/i.test(l)) return 'keyboard';
  if (/mouse|mx.?master|trackpad/i.test(l)) return 'mouse';
  if (/phone|iphone|galaxy.?[saz]|pixel|oneplus|xiaomi/i.test(l)) return 'phone';
  return 'unknown';
}

function classifyByManufacturer(m: string): DeviceType | null {
  if (/bose|jbl|sonos|harman|marshall|bang|yamaha|denon/i.test(m)) return 'speaker';
  if (/samsung|lg|sony|vizio|tcl|hisense|philips/i.test(m)) return 'tv';
  if (/logitech|corsair|razer|steelseries/i.test(m)) return 'mouse';
  if (/fitbit|garmin|polar|suunto|coros|whoop|withings/i.test(m)) return 'wearable';
  return null;
}

function resolveUUID(uuid: string): string {
  const m = uuid.match(/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/i);
  if (m) return KNOWN_UUIDS[parseInt(m[1],16)] || `0x${m[1].toUpperCase()}`;
  return uuid.length > 8 ? uuid.slice(0,8)+'…' : uuid;
}

async function readStrSafe(svc: BluetoothRemoteGATTService, uuid: number): Promise<string|undefined> {
  try { const c = await svc.getCharacteristic(uuid); const v = await c.readValue(); return new TextDecoder().decode(v.buffer).replace(/\0+$/g,'') || undefined; } catch { return undefined; }
}

function decodeValue(dv: DataView) {
  const bytes = new Uint8Array(dv.buffer);
  const hex = Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join(' ');
  try { const t = new TextDecoder().decode(dv.buffer); if (/^[\x20-\x7E\n\r\t]+$/.test(t)) return { text: t, hex, printable: true }; } catch {}
  return { text: hex, hex, printable: false };
}

function isValidHex(s: string) { const h = s.replace(/[\s,:-]/g,''); return h.length > 0 && h.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(h); }
function parseHex(s: string) { const h = s.replace(/[\s,:-]/g,''); return new Uint8Array((h.match(/.{1,2}/g)||[]).map(b=>parseInt(b,16))); }

async function writeSafe(ch: BluetoothRemoteGATTCharacteristic, data: Uint8Array, withResp: boolean) {
  if (withResp && typeof ch.writeValueWithResponse === 'function') await ch.writeValueWithResponse(data);
  else if (!withResp && typeof ch.writeValueWithoutResponse === 'function') await ch.writeValueWithoutResponse(data);
  else await (ch as any).writeValue(data);
}

const DEVICE_META: Record<DeviceType, { icon: typeof Bluetooth; color: string; label: string }> = {
  tv:         { icon: Tv,         color: '#00E6FF', label: 'Television' },
  speaker:    { icon: Speaker,    color: '#D4AF37', label: 'Speaker' },
  ac:         { icon: Fan,        color: '#39FF14', label: 'Climate' },
  light:      { icon: Lightbulb,  color: '#FFD700', label: 'Smart Light' },
  wearable:   { icon: Watch,      color: '#FF6BCD', label: 'Wearable' },
  headphones: { icon: Headphones, color: '#B388FF', label: 'Headphones' },
  gamepad:    { icon: Gamepad2,   color: '#FF6B6B', label: 'Controller' },
  keyboard:   { icon: Keyboard,   color: '#64FFDA', label: 'Keyboard' },
  mouse:      { icon: Mouse,      color: '#80DEEA', label: 'Mouse' },
  phone:      { icon: Smartphone, color: '#FFB74D', label: 'Phone' },
  unknown:    { icon: Bluetooth,  color: '#78909C', label: 'Device' },
};

function getAppearanceLabel(a: number) {
  const cat = (a >> 6) & 0x3FF;
  const m: Record<number,string> = { 0:'Unknown',1:'Phone',2:'Computer',3:'Watch',4:'Clock',5:'Display',6:'Remote',10:'Media Player',15:'HID',33:'Pulse Ox',48:'Audio Sink' };
  return m[cat] || `Cat ${cat}`;
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function WorldRemote({ onClose }: { onClose?: () => void }) {
  const [devices, setDevices] = useState<ScannedDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [btSupported, setBtSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);
  const [gattServices, setGattServices] = useState<GATTServiceInfo[]>([]);
  const [gattLoading, setGattLoading] = useState(false);
  const [expandedSvc, setExpandedSvc] = useState<string | null>(null);
  const [writeInput, setWriteInput] = useState<Record<string, string>>({});
  const [copiedChar, setCopiedChar] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState(0);

  const mountedRef = useRef(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifyListeners = useRef<Map<string, (e: Event) => void>>(new Map());

  useEffect(() => {
    if (typeof navigator !== 'undefined' && !navigator.bluetooth) setBtSupported(false);
    mountedRef.current = true;
    return () => { mountedRef.current = false; if (toastTimer.current) clearTimeout(toastTimer.current); if (errorTimer.current) clearTimeout(errorTimer.current); notifyListeners.current.clear(); };
  }, []);

  const flash = useCallback((msg: string) => {
    if (!mountedRef.current) return;
    setToast(msg); if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => { if (mountedRef.current) setToast(null); }, 1400);
  }, []);

  const setErr = useCallback((msg: string | null) => {
    if (!mountedRef.current) return; setError(msg);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    if (msg) errorTimer.current = setTimeout(() => { if (mountedRef.current) setError(null); }, 6000);
  }, []);

  // ── Disconnect handler ──
  const onDisconnect = useCallback((e: Event) => {
    if (!mountedRef.current) return;
    const dev = e.target as BluetoothDevice;
    setDevices(p => p.map(d => d.bluetoothDevice === dev ? { ...d, connected: false, server: undefined } : d));
    if (expandedDevice) {
      setDevices(p => { const d = p.find(x => x.bluetoothDevice === dev); if (d && d.id === expandedDevice) { setExpandedDevice(null); setGattServices([]); } return p; });
    }
    flash(`${dev.name || 'Device'} lost`);
  }, [expandedDevice, flash]);

  // ── Probe ──
  const probeDevice = useCallback(async (device: ScannedDevice): Promise<ScannedDevice> => {
    if (!device.bluetoothDevice?.gatt) return { ...device, type: classifyByName(device.name), probing: false };
    const info: DeviceInfo = { detectedServices: [], classifiedBy: 'name' };
    let type: DeviceType | null = null; let battery: number | undefined; let name = device.name;
    const t0 = performance.now();
    try {
      const srv = await device.bluetoothDevice.gatt.connect();
      if (!srv) return { ...device, type: classifyByName(device.name), probing: false };
      // Generic Access
      try {
        const gas = await srv.getPrimaryService(0x1800); info.detectedServices.push('Generic Access');
        try { const c = await gas.getCharacteristic(0x2A01); const v = await c.readValue(); const a = v.getUint16(0,true); info.appearance = a; info.appearanceLabel = getAppearanceLabel(a); const t = classifyByAppearance(a); if (t && t !== 'unknown') { type = t; info.classifiedBy = 'appearance'; } } catch {}
        try { const c = await gas.getCharacteristic(0x2A00); const v = await c.readValue(); const n = new TextDecoder().decode(v.buffer).replace(/\0+$/g,''); if (n && n.length > 0) name = n; } catch {}
      } catch {}
      // Device Info
      try {
        const dis = await srv.getPrimaryService(0x180A); info.detectedServices.push('Device Information');
        info.manufacturer = await readStrSafe(dis, 0x2A29); info.model = await readStrSafe(dis, 0x2A24);
        info.serial = await readStrSafe(dis, 0x2A25); info.hardware = await readStrSafe(dis, 0x2A27);
        info.firmware = await readStrSafe(dis, 0x2A26); info.software = await readStrSafe(dis, 0x2A28);
        if (!type && info.manufacturer) { const mt = classifyByManufacturer(info.manufacturer); if (mt) { type = mt; info.classifiedBy = 'pnp'; } }
      } catch {}
      // Service probe
      const found: number[] = [];
      for (const svc of [0x180F,0x180D,0x1812,0x1814,0x1816,0x181A,0x1809,0x1810,0x1808,0x181B,0x181D,0x180E,0x1848,0x1815]) {
        try { const s = await srv.getPrimaryService(svc); found.push(svc); const sn = Object.entries(BLE_SERVICES).find(([,v])=>v===svc)?.[0]?.replace(/_/g,' ')||`0x${svc.toString(16)}`; info.detectedServices.push(sn);
          if (svc === 0x180F) { try { const bc = await s.getCharacteristic(0x2A19); battery = (await bc.readValue()).getUint8(0); } catch {} }
        } catch {}
      }
      if (!type || type === 'unknown') { const st = classifyByServices(found); if (st) { type = st; info.classifiedBy = 'service'; } }
      if (!type || type === 'unknown') { type = classifyByName(name); if (type !== 'unknown') info.classifiedBy = 'name'; }
      if (type === 'unknown' && info.manufacturer) { const mt = classifyByName(`${info.manufacturer} ${info.model||''}`); if (mt !== 'unknown') { type = mt; info.classifiedBy = 'name'; } }
      try { srv.disconnect(); } catch {}
    } catch { if (!type) type = classifyByName(device.name); }
    return { ...device, name, type: type || 'unknown', deviceInfo: info, battery, connected: false, probing: false, probeTime: Math.round(performance.now() - t0) };
  }, []);

  // ── Scan ──
  const scan = useCallback(async () => {
    if (!navigator.bluetooth || scanning) return;
    setScanning(true); setErr(null);
    try {
      const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ALL_OPTIONAL_SERVICES });
      if (dev) {
        if (devices.find(d => d.id === dev.id)) { setScanning(false); return; }
        dev.addEventListener('gattserverdisconnected', onDisconnect);
        const raw: ScannedDevice = { id: dev.id, name: dev.name || `Unknown ${dev.id.slice(0,6)}`, type: 'unknown', connected: false, bluetoothDevice: dev, probing: true };
        setDevices(p => [...p, raw]); setScanCount(c => c + 1);
        const probed = await probeDevice(raw);
        if (mountedRef.current) setDevices(p => p.map(d => d.id === dev.id ? probed : d));
      }
    } catch (e: any) { if (e.name !== 'NotFoundError') setErr(e.message || 'Scan failed'); }
    finally { if (mountedRef.current) setScanning(false); }
  }, [devices, scanning, probeDevice, onDisconnect, setErr]);

  // ── Connect ──
  const connect = useCallback(async (device: ScannedDevice) => {
    if (!device.bluetoothDevice?.gatt || connecting) return;
    setConnecting(device.id); setErr(null);
    try {
      const srv = await device.bluetoothDevice.gatt.connect();
      if (!srv) throw new Error('GATT failed');
      let battery = device.battery;
      try { const bs = await srv.getPrimaryService(0x180F); const bc = await bs.getCharacteristic(0x2A19); battery = (await bc.readValue()).getUint8(0); } catch {}
      const updated = { ...device, connected: true, server: srv, battery };
      setDevices(p => p.map(d => d.id === device.id ? updated : d));
      flash('Connected');
    } catch (e: any) { setErr(`Connect: ${e.message}`); }
    finally { if (mountedRef.current) setConnecting(null); }
  }, [connecting, flash, setErr]);

  // ── Disconnect ──
  const disconnect = useCallback((device: ScannedDevice) => {
    try { device.bluetoothDevice?.gatt?.connected && device.bluetoothDevice.gatt.disconnect(); } catch {}
    setDevices(p => p.map(d => d.id === device.id ? { ...d, connected: false, server: undefined } : d));
    if (expandedDevice === device.id) { setExpandedDevice(null); setGattServices([]); }
  }, [expandedDevice]);

  // ── Explore GATT ──
  const explore = useCallback(async (device: ScannedDevice) => {
    if (!device.bluetoothDevice?.gatt) return;
    if (!device.bluetoothDevice.gatt.connected) { try { await device.bluetoothDevice.gatt.connect(); } catch { setErr('Reconnect failed'); return; } }
    setExpandedDevice(device.id); setGattLoading(true); setGattServices([]); setExpandedSvc(null);
    try {
      const svcs = await device.bluetoothDevice.gatt.getPrimaryServices();
      const result: GATTServiceInfo[] = [];
      for (const svc of svcs) {
        const chars: GATTCharInfo[] = [];
        try {
          for (const ch of await svc.getCharacteristics()) {
            let value: string|undefined, rawHex: string|undefined;
            if (ch.properties.read) { try { const v = await ch.readValue(); const d = decodeValue(v); value = d.text; rawHex = d.hex; } catch {} }
            chars.push({ uuid: ch.uuid, name: resolveUUID(ch.uuid), properties: { read: ch.properties.read, write: ch.properties.write, writeNoResp: ch.properties.writeWithoutResponse, notify: ch.properties.notify, indicate: ch.properties.indicate }, value, rawHex, characteristic: ch });
          }
        } catch {}
        result.push({ uuid: svc.uuid, name: resolveUUID(svc.uuid), characteristics: chars });
      }
      if (mountedRef.current) { setGattServices(result); if (result.length > 0) setExpandedSvc(result[0].uuid); }
    } catch (e: any) { setErr(`Explore: ${e.message}`); }
    finally { if (mountedRef.current) setGattLoading(false); }
  }, [setErr]);

  // ── Notify toggle ──
  const toggleNotify = useCallback(async (svcUuid: string, ch: GATTCharInfo) => {
    if (!ch.characteristic) return;
    const key = `${svcUuid}/${ch.uuid}`;
    try {
      if (ch.notifying) {
        await ch.characteristic.stopNotifications();
        const l = notifyListeners.current.get(key); if (l) { ch.characteristic.removeEventListener('characteristicvaluechanged', l); notifyListeners.current.delete(key); }
        setGattServices(p => p.map(s => s.uuid === svcUuid ? { ...s, characteristics: s.characteristics.map(c => c.uuid === ch.uuid ? { ...c, notifying: false } : c) } : s));
        flash('Notify OFF');
      } else {
        await ch.characteristic.startNotifications();
        const listener = (e: Event) => { if (!mountedRef.current) return; const t = (e.target as BluetoothRemoteGATTCharacteristic).value; if (!t) return; const d = decodeValue(t); setGattServices(p => p.map(s => s.uuid === svcUuid ? { ...s, characteristics: s.characteristics.map(c => c.uuid === ch.uuid ? { ...c, value: d.text, rawHex: d.hex } : c) } : s)); };
        ch.characteristic.addEventListener('characteristicvaluechanged', listener); notifyListeners.current.set(key, listener);
        setGattServices(p => p.map(s => s.uuid === svcUuid ? { ...s, characteristics: s.characteristics.map(c => c.uuid === ch.uuid ? { ...c, notifying: true } : c) } : s));
        flash('Notify ON');
      }
    } catch (e: any) { flash(`Fail: ${(e.message||'').slice(0,25)}`); }
  }, [flash]);

  const connCount = devices.filter(d => d.connected).length;
  const activeExploreDevice = devices.find(d => d.id === expandedDevice);

  return (
    <div className="glass-panel p-0 w-full flex flex-col overflow-hidden osiris-glow" style={{ minWidth: 300, maxHeight: 650 }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-primary)]" style={{ background: 'linear-gradient(180deg, rgba(0,230,255,0.03) 0%, transparent 100%)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,230,255,0.08)', border: '1px solid rgba(0,230,255,0.15)' }}>
            <Radio className="w-4 h-4 text-[var(--cyan-primary)]" />
          </div>
          <div>
            <h3 className="text-[11px] font-mono font-bold tracking-wider text-[var(--text-primary)]">BLE SCANNER</h3>
            <div className="flex items-center gap-2">
              <span className="text-[7px] font-mono text-[var(--text-muted)] tracking-widest">
                {devices.length > 0 ? `${devices.length} FOUND` : 'READY'}
                {connCount > 0 && <> · <span className="text-[var(--alert-green)]">{connCount} LIVE</span></>}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {scanning && <div className="w-1.5 h-1.5 rounded-full bg-[var(--cyan-primary)] animate-pulse" />}
          {onClose && (
            <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5 transition-colors">
              <X className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            </button>
          )}
        </div>
      </div>

      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="absolute top-14 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-lg backdrop-blur-md pointer-events-none"
            style={{ background: 'rgba(0,230,255,0.12)', border: '1px solid rgba(0,230,255,0.2)' }}>
            <span className="text-[8px] font-mono font-bold text-[var(--cyan-primary)] tracking-wider">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto styled-scrollbar">

        {/* Errors */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mx-3 mt-3 p-2 rounded-lg flex items-center gap-2" style={{ background: 'rgba(255,61,61,0.06)', border: '1px solid rgba(255,61,61,0.15)' }}>
                <AlertTriangle className="w-3 h-3 text-[#FF3D3D] shrink-0" />
                <span className="text-[8px] font-mono text-[#FF3D3D] flex-1">{error}</span>
                <button onClick={() => setError(null)} className="p-0.5 rounded hover:bg-white/5"><X className="w-2.5 h-2.5 text-[#FF3D3D]/50" /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!btSupported && (
          <div className="mx-3 mt-3 p-3 rounded-lg flex items-center gap-2" style={{ background: 'rgba(255,61,61,0.06)', border: '1px solid rgba(255,61,61,0.15)' }}>
            <WifiOff className="w-4 h-4 text-[#FF3D3D] shrink-0" />
            <div><p className="text-[8px] font-mono text-[#FF3D3D] font-bold">Web Bluetooth Unavailable</p><p className="text-[7px] font-mono text-[#FF3D3D]/70 mt-0.5">Use Chrome or Edge on desktop</p></div>
          </div>
        )}

        {/* ── Scan Button ── */}
        <div className="px-3 pt-3 pb-2">
          <motion.button
            whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.01 }}
            onClick={scan} disabled={scanning || !btSupported}
            className="w-full py-3 rounded-xl flex items-center justify-center gap-2.5 transition-all disabled:opacity-30"
            style={{ background: scanning ? 'rgba(0,230,255,0.06)' : 'linear-gradient(135deg, rgba(0,230,255,0.08), rgba(0,230,255,0.04))', border: '1px solid rgba(0,230,255,0.15)' }}
          >
            {scanning ? (
              <BluetoothSearching className="w-4 h-4 text-[var(--cyan-primary)] animate-pulse" />
            ) : (
              <Scan className="w-4 h-4 text-[var(--cyan-primary)]" />
            )}
            <span className="text-[9px] font-mono font-bold tracking-[0.15em] text-[var(--cyan-primary)]">
              {scanning ? 'SCANNING NEARBY...' : 'DETECT NEARBY DEVICES'}
            </span>
          </motion.button>
        </div>

        {/* ── Device List ── */}
        {devices.length > 0 && (
          <div className="px-3 pb-3 space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[7px] font-mono text-[var(--text-muted)] tracking-widest uppercase">{devices.length} Device{devices.length !== 1 ? 's' : ''} Detected</span>
              {scanCount > 1 && <span className="text-[6px] font-mono text-[var(--text-muted)] tracking-widest">{scanCount} SCANS</span>}
            </div>

            {devices.map(device => {
              const meta = DEVICE_META[device.type];
              const Icon = meta.icon;
              const isExpanded = expandedDevice === device.id;
              const isConn = connecting === device.id;

              return (
                <motion.div key={device.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} layout
                  className="rounded-xl overflow-hidden transition-all"
                  style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${device.connected ? 'rgba(0,230,255,0.15)' : 'rgba(255,255,255,0.04)'}` }}>

                  {/* ── Device Card ── */}
                  <div className="p-3">
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 relative" style={{ background: `${meta.color}10`, border: `1px solid ${meta.color}20` }}>
                        {device.probing || isConn ? (
                          <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: meta.color, borderTopColor: 'transparent' }} />
                        ) : (
                          <Icon className="w-5 h-5" style={{ color: meta.color }} />
                        )}
                        {device.connected && <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--alert-green)] border-2 border-[#0a0a0f]" />}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-mono font-bold text-[var(--text-primary)] truncate">{device.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {device.probing ? (
                            <span className="text-[7px] font-mono tracking-wider animate-pulse" style={{ color: meta.color }}>PROBING GATT...</span>
                          ) : (
                            <>
                              <span className="text-[7px] font-mono px-1.5 py-0.5 rounded-md tracking-wider" style={{ background: `${meta.color}12`, color: meta.color }}>{meta.label.toUpperCase()}</span>
                              {device.deviceInfo?.classifiedBy && (
                                <span className="text-[6px] font-mono px-1 py-0.5 rounded bg-white/5 text-[var(--text-muted)] tracking-wider">
                                  {device.deviceInfo.classifiedBy.toUpperCase()}
                                </span>
                              )}
                              {device.battery != null && (
                                <span className="flex items-center gap-0.5 text-[7px] font-mono text-[var(--text-muted)]">
                                  <BatteryMedium className="w-2.5 h-2.5" />{device.battery}%
                                </span>
                              )}
                              {device.probeTime != null && (
                                <span className="text-[6px] font-mono text-[var(--text-muted)] tracking-wider">{device.probeTime}ms</span>
                              )}
                            </>
                          )}
                        </div>

                        {/* Device details row */}
                        {device.deviceInfo && !device.probing && (
                          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                            {device.deviceInfo.manufacturer && (
                              <span className="text-[6px] font-mono px-1.5 py-0.5 rounded-md bg-white/4 text-[var(--text-muted)] tracking-wider truncate max-w-[100px]">{device.deviceInfo.manufacturer}</span>
                            )}
                            {device.deviceInfo.model && (
                              <span className="text-[6px] font-mono px-1.5 py-0.5 rounded-md bg-white/4 text-[var(--text-muted)] tracking-wider truncate max-w-[100px]">{device.deviceInfo.model}</span>
                            )}
                            {device.deviceInfo.firmware && (
                              <span className="text-[6px] font-mono px-1.5 py-0.5 rounded-md bg-white/4 text-[var(--text-muted)] tracking-wider">FW {device.deviceInfo.firmware}</span>
                            )}
                            {device.deviceInfo.appearance != null && (
                              <span className="text-[6px] font-mono px-1.5 py-0.5 rounded-md tracking-wider" style={{ background: `${meta.color}08`, color: `${meta.color}AA` }}>
                                {device.deviceInfo.appearanceLabel}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Services pills */}
                        {device.deviceInfo && device.deviceInfo.detectedServices.length > 0 && !device.probing && (
                          <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                            {device.deviceInfo.detectedServices.slice(0, 6).map((s, i) => (
                              <span key={i} className="text-[5px] font-mono px-1 py-0.5 rounded bg-[var(--cyan-primary)]/5 text-[var(--cyan-primary)]/60 tracking-wider uppercase">{s}</span>
                            ))}
                            {device.deviceInfo.detectedServices.length > 6 && (
                              <span className="text-[5px] font-mono text-[var(--text-muted)]">+{device.deviceInfo.detectedServices.length - 6}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      {!device.probing && (
                        <div className="flex flex-col gap-1 shrink-0">
                          {device.connected ? (
                            <>
                              <motion.button whileTap={{ scale: 0.9 }} onClick={() => explore(device)}
                                className="px-2 py-1.5 rounded-lg text-[7px] font-mono font-bold tracking-wider transition-all"
                                style={{ background: 'rgba(0,230,255,0.08)', color: 'var(--cyan-primary)', border: '1px solid rgba(0,230,255,0.15)' }}>
                                GATT
                              </motion.button>
                              <motion.button whileTap={{ scale: 0.9 }} onClick={() => disconnect(device)}
                                className="px-2 py-1.5 rounded-lg text-[7px] font-mono font-bold tracking-wider transition-all"
                                style={{ background: 'rgba(255,61,61,0.06)', color: '#FF3D3D', border: '1px solid rgba(255,61,61,0.1)' }}>
                                DROP
                              </motion.button>
                            </>
                          ) : (
                            <motion.button whileTap={{ scale: 0.9 }} onClick={() => connect(device)} disabled={!!connecting}
                              className="px-2.5 py-1.5 rounded-lg text-[7px] font-mono font-bold tracking-wider transition-all disabled:opacity-30"
                              style={{ background: 'rgba(0,230,255,0.08)', color: 'var(--cyan-primary)', border: '1px solid rgba(0,230,255,0.15)' }}>
                              {isConn ? '...' : 'PAIR'}
                            </motion.button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── GATT Explorer (inline) ── */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="border-t px-3 pb-3 pt-2" style={{ borderColor: 'rgba(0,230,255,0.08)', background: 'rgba(0,230,255,0.02)' }}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[7px] font-mono text-[var(--cyan-primary)] tracking-widest font-bold">GATT SERVICES</span>
                            <button onClick={() => { setExpandedDevice(null); setGattServices([]); }} className="text-[var(--text-muted)] p-0.5 rounded hover:bg-white/5">
                              <X className="w-3 h-3" />
                            </button>
                          </div>

                          {gattLoading ? (
                            <div className="flex items-center justify-center py-6 gap-2">
                              <div className="w-4 h-4 border-2 border-[var(--cyan-primary)] border-t-transparent rounded-full animate-spin" />
                              <span className="text-[7px] font-mono text-[var(--cyan-primary)] tracking-wider animate-pulse">ENUMERATING...</span>
                            </div>
                          ) : gattServices.length === 0 ? (
                            <div className="text-center py-4"><p className="text-[7px] font-mono text-[var(--text-muted)]">No services found</p></div>
                          ) : (
                            <div className="space-y-1">
                              {gattServices.map(svc => (
                                <div key={svc.uuid}>
                                  <button onClick={() => setExpandedSvc(expandedSvc === svc.uuid ? null : svc.uuid)}
                                    className={`w-full p-2 rounded-lg flex items-center gap-2 transition-all text-left hover:bg-white/3 ${expandedSvc === svc.uuid ? 'bg-white/3' : ''}`}>
                                    <Bluetooth className="w-3 h-3 text-[var(--cyan-primary)] shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-[7px] font-mono font-bold text-[var(--text-primary)] truncate">{svc.name}</div>
                                      <div className="text-[5px] font-mono text-[var(--text-muted)] truncate">{svc.uuid}</div>
                                    </div>
                                    <span className="text-[6px] font-mono text-[var(--text-muted)]">{svc.characteristics.length}</span>
                                    <ChevronRight className={`w-3 h-3 text-[var(--text-muted)] transition-transform ${expandedSvc === svc.uuid ? 'rotate-90' : ''}`} />
                                  </button>

                                  <AnimatePresence>
                                    {expandedSvc === svc.uuid && (
                                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                        <div className="pl-3 pr-1 py-1 space-y-1">
                                          {svc.characteristics.map(ch => {
                                            const ck = `${svc.uuid}/${ch.uuid}`;
                                            const flags = [ch.properties.read&&'R',ch.properties.write&&'W',ch.properties.writeNoResp&&'Wn',ch.properties.notify&&'N',ch.properties.indicate&&'I'].filter(Boolean).join('·');
                                            const wVal = writeInput[ck] || '';
                                            const wValid = !wVal || isValidHex(wVal);

                                            return (
                                              <div key={ch.uuid} className="p-2 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)', borderLeft: '2px solid rgba(0,230,255,0.08)' }}>
                                                <div className="flex items-center gap-1.5 mb-1">
                                                  <span className="text-[7px] font-mono font-bold text-[var(--text-primary)] truncate flex-1">{ch.name}</span>
                                                  <span className="text-[5px] font-mono px-1 py-0.5 rounded text-[var(--cyan-primary)] tracking-wider" style={{ background: 'rgba(0,230,255,0.08)' }}>{flags}</span>
                                                </div>
                                                <div className="text-[5px] font-mono text-[var(--text-muted)] truncate mb-1.5">{ch.uuid}</div>

                                                {ch.value && (
                                                  <div className="flex items-center gap-1 mb-1.5">
                                                    <div className="flex-1 rounded px-1.5 py-1 min-w-0" style={{ background: 'rgba(0,0,0,0.3)' }}>
                                                      <div className="text-[7px] font-mono text-[var(--alert-green)] truncate">{ch.value}</div>
                                                      {ch.rawHex && ch.rawHex !== ch.value && <div className="text-[5px] font-mono text-[var(--text-muted)] truncate mt-0.5">{ch.rawHex}</div>}
                                                    </div>
                                                    <motion.button whileTap={{ scale: 0.9 }}
                                                      onClick={() => { navigator.clipboard?.writeText(ch.value||''); setCopiedChar(ck); setTimeout(() => setCopiedChar(null), 1500); }}
                                                      className="p-1 rounded hover:bg-white/5 shrink-0">
                                                      {copiedChar === ck ? <Check className="w-2.5 h-2.5 text-[var(--alert-green)]" /> : <Copy className="w-2.5 h-2.5 text-[var(--text-muted)]" />}
                                                    </motion.button>
                                                  </div>
                                                )}

                                                <div className="flex items-center gap-1 flex-wrap">
                                                  {ch.properties.read && (
                                                    <motion.button whileTap={{ scale: 0.9 }}
                                                      onClick={async () => { if (!ch.characteristic) return; try { const v = await ch.characteristic.readValue(); const d = decodeValue(v); setGattServices(p => p.map(s => s.uuid === svc.uuid ? { ...s, characteristics: s.characteristics.map(c => c.uuid === ch.uuid ? { ...c, value: d.text, rawHex: d.hex } : c) } : s)); flash(`Read: ${d.text.slice(0,20)}`); } catch (e: any) { flash(`Fail: ${(e.message||'').slice(0,25)}`); } }}
                                                      className="flex items-center gap-0.5 px-1.5 py-1 rounded text-[6px] font-mono tracking-wider transition-colors"
                                                      style={{ background: 'rgba(0,230,255,0.06)', color: 'var(--cyan-primary)' }}>
                                                      <Eye className="w-2.5 h-2.5" /> READ
                                                    </motion.button>
                                                  )}
                                                  {ch.properties.notify && (
                                                    <motion.button whileTap={{ scale: 0.9 }} onClick={() => toggleNotify(svc.uuid, ch)}
                                                      className={`flex items-center gap-0.5 px-1.5 py-1 rounded text-[6px] font-mono tracking-wider transition-colors`}
                                                      style={{ background: ch.notifying ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.03)', color: ch.notifying ? 'var(--gold-primary)' : 'var(--text-muted)' }}>
                                                      {ch.notifying ? <Bell className="w-2.5 h-2.5" /> : <BellOff className="w-2.5 h-2.5" />}
                                                      {ch.notifying ? 'LIVE' : 'SUB'}
                                                    </motion.button>
                                                  )}
                                                  {(ch.properties.write || ch.properties.writeNoResp) && (
                                                    <div className="flex items-center gap-0.5 flex-1">
                                                      <input type="text" placeholder="FF 01 A3" value={wVal}
                                                        onChange={e => setWriteInput(p => ({ ...p, [ck]: e.target.value }))}
                                                        className={`flex-1 rounded px-1.5 py-1 text-[7px] font-mono text-[var(--text-primary)] outline-none min-w-0 transition-colors ${wValid ? 'border-transparent focus:border-[var(--gold-primary)]/30' : 'border-[#FF3D3D]/30'}`}
                                                        style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid transparent' }} aria-label="Hex bytes" />
                                                      <motion.button whileTap={{ scale: 0.9 }}
                                                        onClick={async () => { if (!ch.characteristic || !wVal || !isValidHex(wVal)) return; try { await writeSafe(ch.characteristic, parseHex(wVal), ch.properties.write); flash(`Sent: ${wVal}`); setWriteInput(p => ({ ...p, [ck]: '' })); } catch (e: any) { flash(`Fail: ${(e.message||'').slice(0,25)}`); } }}
                                                        disabled={!wVal || !wValid}
                                                        className="p-1 rounded transition-colors shrink-0 disabled:opacity-30"
                                                        style={{ background: 'rgba(212,175,55,0.08)', color: 'var(--gold-primary)' }}>
                                                        <Send className="w-2.5 h-2.5" />
                                                      </motion.button>
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* ── Empty State ── */}
        {devices.length === 0 && !scanning && btSupported && (
          <div className="flex flex-col items-center justify-center py-12 px-6">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(0,230,255,0.04)', border: '1px solid rgba(0,230,255,0.08)' }}>
              <Radio className="w-7 h-7 text-[var(--cyan-primary)]/30" />
            </div>
            <p className="text-[9px] font-mono text-[var(--text-muted)] text-center tracking-wider leading-relaxed mb-1">No devices detected yet</p>
            <p className="text-[7px] font-mono text-[var(--text-muted)]/50 text-center tracking-wider">Tap scan to discover nearby Bluetooth devices.<br/>Each device is auto-probed via GATT for identification.</p>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-4 py-2 border-t border-[var(--border-secondary)] flex items-center justify-between" style={{ background: 'rgba(0,0,0,0.2)' }}>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${btSupported ? 'bg-[var(--alert-green)]' : 'bg-[#FF3D3D]'}`} />
          <span className="text-[6px] font-mono text-[var(--text-muted)] tracking-widest">{btSupported ? 'WEB BLUETOOTH' : 'UNAVAILABLE'}</span>
        </div>
        <span className="text-[6px] font-mono text-[var(--text-muted)] tracking-widest opacity-50">CHROME · EDGE</span>
      </div>
    </div>
  );
}
