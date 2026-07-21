'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bluetooth, BluetoothSearching, Tv, Speaker, X,
  Gamepad2, Lightbulb, Watch, Headphones, Mouse, Keyboard, Smartphone,
  BatteryMedium, Fan, Eye, Send, Bell, BellOff, ChevronRight, Copy, Check,
  AlertTriangle, Scan, Zap, Unplug, Layers, ChevronDown,
  Maximize2, Minimize2, Trash2, Pause, Play, Cpu, Printer,
  ScanLine, Plug, Radio, Clock, Server, Terminal
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   MASSIVE UUID DATABASE — 60+ known services, 50+ characteristics
   ═══════════════════════════════════════════════════════════════ */
const SVC_NAMES: Record<number,string> = {
  0x1800:'Generic Access',0x1801:'Generic Attribute',0x1802:'Immediate Alert',0x1803:'Link Loss',
  0x1804:'TX Power',0x1805:'Current Time',0x1806:'Reference Time Update',0x1807:'Next DST Change',
  0x1808:'Glucose',0x1809:'Health Thermometer',0x180A:'Device Information',0x180B:'Network Availability',
  0x180C:'Watchdog',0x180D:'Heart Rate',0x180E:'Phone Alert Status',0x180F:'Battery Service',
  0x1810:'Blood Pressure',0x1811:'Alert Notification',0x1812:'Human Interface Device',
  0x1813:'Scan Parameters',0x1814:'Running Speed and Cadence',0x1815:'Automation IO',
  0x1816:'Cycling Speed and Cadence',0x1818:'Cycling Power',0x1819:'Location and Navigation',
  0x181A:'Environmental Sensing',0x181B:'Body Composition',0x181C:'User Data',
  0x181D:'Weight Scale',0x181E:'Bond Management',0x181F:'Continuous Glucose Monitoring',
  0x1820:'Internet Protocol Support',0x1821:'Indoor Positioning',0x1822:'Pulse Oximeter',
  0x1823:'HTTP Proxy',0x1824:'Transport Discovery',0x1825:'Object Transfer',
  0x1826:'Fitness Machine',0x1827:'Mesh Provisioning',0x1828:'Mesh Proxy',
  0x1829:'Reconnection Configuration',0x183A:'Insulin Delivery',0x183B:'Binary Sensor',
  0x183C:'Emergency Configuration',0x183E:'Authorization Control',0x1843:'Audio Input Control',
  0x1844:'Volume Control',0x1845:'Volume Offset Control',0x1846:'Coordinated Set Identification',
  0x1847:'Device Time',0x1848:'Media Control',0x1849:'Generic Media Control',
  0x184A:'Constant Tone Extension',0x184B:'Telephone Bearer',0x184C:'Generic Telephone Bearer',
  0x184D:'Microphone Control',0x184E:'Audio Stream Control',0x184F:'Broadcast Audio Scan',
  0x1850:'Published Audio Capabilities',0x1851:'Basic Audio Announcement',0x1852:'Broadcast Audio Announcement',
  0x1853:'Common Audio',0x1854:'Hearing Access',0x1855:'Telephony and Media Audio',
  0x1856:'Public Broadcast Announcement',0x1857:'Electronic Shelf Label',
  0x1858:'Gaming Audio',0x1859:'Mesh Proxy Solicitation',
  // Popular custom
  0xFE95:'Xiaomi',0xFEB3:'Tile',0xFE9F:'Google',0xFD6F:'Exposure Notification',
  0xFEAA:'Eddystone',0xFFF0:'Custom Peripheral',0xFFF1:'Custom Data',
};
const CHAR_NAMES: Record<number,string> = {
  0x2A00:'Device Name',0x2A01:'Appearance',0x2A02:'Peripheral Privacy Flag',
  0x2A03:'Reconnection Address',0x2A04:'Preferred Connection Params',
  0x2A05:'Service Changed',0x2A06:'Alert Level',0x2A07:'TX Power Level',
  0x2A08:'Date Time',0x2A09:'Day of Week',0x2A19:'Battery Level',
  0x2A23:'System ID',0x2A24:'Model Number',0x2A25:'Serial Number',
  0x2A26:'Firmware Revision',0x2A27:'Hardware Revision',0x2A28:'Software Revision',
  0x2A29:'Manufacturer Name',0x2A2A:'IEEE 11073-20601',0x2A50:'PnP ID',
  0x2A37:'Heart Rate Measurement',0x2A38:'Body Sensor Location',
  0x2A39:'Heart Rate Control Point',0x2A4D:'Report',0x2A4E:'Protocol Mode',
  0x2A6E:'Temperature',0x2A6F:'Humidity',0x2A6D:'Pressure',
  0x2A76:'UV Index',0x2A77:'Irradiance',0x2A7A:'Heat Index',
  0x2A7B:'Dew Point',0x2A56:'Digital',0x2A58:'Analog',
  0x2A5A:'Aggregate',0x2A5B:'CSC Measurement',0x2A5C:'CSC Feature',
  0x2A5D:'Sensor Location',0x2A63:'Cycling Power Measurement',
  0x2A65:'Cycling Power Feature',0x2A67:'Location and Speed',
  0x2A68:'Navigation',0x2A6C:'Elevation',0x2A93:'Sport Type',
};
const ALL_NAMES = { ...SVC_NAMES, ...CHAR_NAMES };

// Services to probe during deep scan — comprehensive list
const PROBE_SVCS = [
  0x1800,0x180A,0x180F,0x180D,0x1810,0x1809,0x1812,0x1814,0x1816,0x1818,
  0x181A,0x181B,0x181C,0x181D,0x180E,0x1848,0x1815,0x1802,0x1803,0x1804,
  0x1805,0x1808,0x1811,0x1819,0x1820,0x1822,0x1826,0x1843,0x1844,0x184D,
  0x184E,0x1854,
];
const ALL_OPTIONAL = [...new Set([...Object.keys(SVC_NAMES).map(Number),...PROBE_SVCS])];

/* ═══════════════════════════════════════════════════════════════
   APPEARANCE TABLE — 100+ entries for device classification
   ═══════════════════════════════════════════════════════════════ */
const APP_LABELS: Record<number,string> = {
  0:'Unknown',64:'Generic Phone',128:'Generic Computer',192:'Generic Watch',193:'Sports Watch',
  256:'Generic Clock',320:'Generic Display',384:'Generic Remote Control',448:'Generic Glasses',
  512:'Generic Tag',576:'Generic Keyring',640:'Generic Media Player',704:'Generic Barcode Scanner',
  768:'Generic Thermometer',769:'Ear Thermometer',832:'Generic Heart Rate Sensor',833:'Heart Rate Belt',
  896:'Generic Blood Pressure',960:'Generic HID',961:'Keyboard',962:'Mouse',963:'Joystick',
  964:'Gamepad',965:'Digitizer Tablet',966:'Card Reader',967:'Digital Pen',968:'Barcode Scanner',
  969:'Touchpad',970:'Presentation Remote',1024:'Generic Glucose Meter',1088:'Generic Running/Walking Sensor',
  1089:'In-Shoe Sensor',1090:'On-Shoe Sensor',1091:'On-Hip Sensor',1152:'Generic Cycling',
  1216:'Generic Control Device',1217:'Switch',1218:'Multi-Switch',1219:'Button',1220:'Slider',
  1221:'Rotary Switch',1222:'Touch Panel',1280:'Generic Network Device',1281:'Access Point',
  1282:'Mesh Device',1283:'Mesh Network Proxy',1344:'Generic Sensor',1345:'Motion Sensor',
  1346:'Air Quality Sensor',1347:'Temperature Sensor',1348:'Humidity Sensor',1349:'Leak Sensor',
  1350:'Smoke Sensor',1351:'Occupancy Sensor',1352:'Contact Sensor',1353:'Carbon Monoxide Sensor',
  1354:'Carbon Dioxide Sensor',1355:'Ambient Light Sensor',1356:'Energy Sensor',1357:'Color Light Sensor',
  1358:'Rain Sensor',1359:'Fire Sensor',1360:'Wind Sensor',1361:'Proximity Sensor',
  1362:'Multi-Sensor',1408:'Generic Light Fixture',1409:'Wall Light',1410:'Ceiling Light',
  1411:'Floor Light',1412:'Cabinet Light',1413:'Desk Light',1414:'Troffer Light',
  1415:'Pendant Light',1416:'In-Ground Light',1417:'Flood Light',1418:'Underwater Light',
  1472:'Generic Fan',1473:'Ceiling Fan',1474:'Axial Fan',1475:'Exhaust Fan',1476:'Pedestal Fan',
  1477:'Desk Fan',1478:'Wall Fan',1536:'Generic HVAC',1537:'Thermostat',1538:'Humidifier',
  1539:'De-Humidifier',1540:'Heater',1541:'Radiator',1542:'Boiler',1543:'Heat Pump',
  1600:'Generic Air Conditioning',1664:'Generic Humidifier',1728:'Generic Heating',
  1792:'Generic Access Control',1793:'Access Door',1794:'Garage Door',1795:'Emergency Exit Door',
  1856:'Generic Motorized Device',1857:'Motorized Gate',1858:'Awning',1859:'Blind/Shade',
  1920:'Generic Power Device',1921:'Power Outlet',1922:'Power Strip',1984:'Generic Light Source',
  1985:'Incandescent Light',1986:'LED Lamp',1987:'HID Lamp',1988:'Fluorescent Lamp',
  2048:'Generic Window Covering',2112:'Generic Audio Sink',2113:'Standalone Speaker',
  2114:'Soundbar',2115:'Bookshelf Speaker',2116:'Standmounted Speaker',2117:'Speakerphone',
  2176:'Generic Audio Source',2177:'Microphone',2178:'Alarm',2179:'Bell',2180:'Horn',
  2181:'Broadcasting Device',2182:'Service Desk',2183:'Kiosk',2184:'Broadcasting Room',
  2185:'Auditorium',
};
function appLabel(a:number):string { return APP_LABELS[a] || `0x${a.toString(16).padStart(4,'0')}`; }

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */
type PktOp = 'SCAN'|'PROBE'|'READ'|'WRITE'|'NOTIFY'|'CONNECT'|'DISCONNECT'|'ENUM'|'ERROR'|'SUB'|'INFO';
interface Pkt { id:number; ts:number; op:PktOp; src:string; msg:string; hex?:string; len?:number; }
interface BLEDev {
  id:string; name:string; type:string; icon:typeof Bluetooth; color:string; classBy:string;
  connected:boolean; probing:boolean; probeMs?:number; battery?:number;
  manufacturer?:string; model?:string; serial?:string; firmware?:string; hardware?:string; software?:string;
  appearance?:number; appearanceLabel?:string;
  services:string[]; serviceCount:number; charCount:number; totalBytes:number;
  bt?:BluetoothDevice; srv?:BluetoothRemoteGATTServer;
}
interface Svc { uuid:string; name:string; chars:Chr[]; }
interface Chr { uuid:string; name:string; value?:string; hex?:string; notifying?:boolean; char?:BluetoothRemoteGATTCharacteristic; p:{r:boolean;w:boolean;wn:boolean;n:boolean;i:boolean}; }

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */
function nameUUID(u:string):string{const m=u.match(/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/i);if(m){const n=ALL_NAMES[parseInt(m[1],16)];return n||`0x${m[1].toUpperCase()}`;}return u.length>8?u.slice(0,8)+'…':u;}
async function readStr(s:BluetoothRemoteGATTService,u:number){try{const c=await s.getCharacteristic(u);const v=await c.readValue();return new TextDecoder().decode(v.buffer).replace(/\0+$/g,'')||undefined;}catch{return undefined;}}
function decode(dv:DataView){const b=new Uint8Array(dv.buffer);const hex=Array.from(b).map(x=>x.toString(16).padStart(2,'0')).join(' ');try{const t=new TextDecoder().decode(dv.buffer);if(/^[\x20-\x7E\n\r\t]+$/.test(t))return{text:t,hex};}catch{}return{text:hex,hex};}
function validHex(s:string){const h=s.replace(/[\s,:-]/g,'');return h.length>0&&h.length%2===0&&/^[0-9a-fA-F]+$/.test(h);}
function parseHex(s:string){const h=s.replace(/[\s,:-]/g,'');return new Uint8Array((h.match(/.{1,2}/g)||[]).map(b=>parseInt(b,16)));}
async function writeSafe(ch:BluetoothRemoteGATTCharacteristic,d:Uint8Array,resp:boolean){if(resp&&typeof ch.writeValueWithResponse==='function')await ch.writeValueWithResponse(d);else if(!resp&&typeof ch.writeValueWithoutResponse==='function')await ch.writeValueWithoutResponse(d);else await(ch as any).writeValue(d);}
function fts(t:number){const d=new Date(t);return d.toLocaleTimeString('en-US',{hour12:false})+'.'+d.getMilliseconds().toString().padStart(3,'0');}
function toHex(s:string){return Array.from(new TextEncoder().encode(s)).map(x=>x.toString(16).padStart(2,'0')).join(' ');}

/* ═══════════════════════════════════════════════════════════════
   CLASSIFICATION ENGINE — multi-signal fusion
   ═══════════════════════════════════════════════════════════════ */
function classify(name:string, appearance?:number, mfr?:string, svcs?:number[]):{type:string;icon:typeof Bluetooth;color:string;by:string} {
  // 1. Appearance (most reliable)
  if(appearance!=null){
    const cat=(appearance>>6)&0x3FF;
    const sub=appearance&0x3F;
    if(cat===1) return{type:'Phone',icon:Smartphone,color:'#FFB74D',by:'appearance'};
    if(cat===2) return{type:'Computer',icon:Cpu,color:'#80DEEA',by:'appearance'};
    if(cat===3) return{type:'Watch',icon:Watch,color:'#FF6BCD',by:'appearance'};
    if(cat===5) return{type:'Display',icon:Tv,color:'#00E6FF',by:'appearance'};
    if(cat===6) return{type:'Remote',icon:Radio,color:'#90A4AE',by:'appearance'};
    if(cat===10) return{type:'Media Player',icon:Tv,color:'#00E6FF',by:'appearance'};
    if(cat===15){if(sub===1)return{type:'Keyboard',icon:Keyboard,color:'#64FFDA',by:'appearance'};if(sub===2)return{type:'Mouse',icon:Mouse,color:'#80DEEA',by:'appearance'};if(sub===3)return{type:'Joystick',icon:Gamepad2,color:'#FF6B6B',by:'appearance'};if(sub===4)return{type:'Gamepad',icon:Gamepad2,color:'#FF6B6B',by:'appearance'};if(sub===9)return{type:'Touchpad',icon:Mouse,color:'#80DEEA',by:'appearance'};if(sub===10)return{type:'Presenter',icon:Radio,color:'#90A4AE',by:'appearance'};return{type:'HID',icon:Keyboard,color:'#64FFDA',by:'appearance'};}
    if(cat>=21&&cat<=23) return{type:'Sensor',icon:Radio,color:'#FFD700',by:'appearance'};
    if(cat>=22&&cat<=23) return{type:'Light',icon:Lightbulb,color:'#FFD700',by:'appearance'};
    if(cat>=24&&cat<=26) return{type:'Climate',icon:Fan,color:'#00FF88',by:'appearance'};
    if(cat===28||cat===29) return{type:'Access Control',icon:Plug,color:'#FF6B6B',by:'appearance'};
    if(cat===31) return{type:'Light Source',icon:Lightbulb,color:'#FFD700',by:'appearance'};
    if(cat===33){if(sub>=1)return{type:'Speaker',icon:Speaker,color:'#FFB800',by:'appearance'};return{type:'Audio Sink',icon:Speaker,color:'#FFB800',by:'appearance'};}
    if(cat===34) return{type:'Audio Source',icon:Radio,color:'#B388FF',by:'appearance'};
    // Headphones from raw values
    if(appearance>=0x0841&&appearance<=0x087F) return{type:'Headphones',icon:Headphones,color:'#B388FF',by:'appearance'};
    if(appearance===0x0840) return{type:'Speaker',icon:Speaker,color:'#FFB800',by:'appearance'};
  }
  // 2. Services
  if(svcs&&svcs.length>0){
    if(svcs.includes(0x1848)||svcs.includes(0x1843)||svcs.includes(0x1844)) return{type:'Audio Device',icon:Speaker,color:'#FFB800',by:'service'};
    if(svcs.includes(0x1812)) return{type:'HID',icon:Keyboard,color:'#64FFDA',by:'service'};
    if(svcs.includes(0x180D)) return{type:'Heart Rate',icon:Watch,color:'#FF6BCD',by:'service'};
    if(svcs.includes(0x1810)) return{type:'Blood Pressure',icon:Watch,color:'#FF6BCD',by:'service'};
    if(svcs.includes(0x1822)) return{type:'Pulse Oximeter',icon:Watch,color:'#FF6BCD',by:'service'};
    if(svcs.includes(0x1826)) return{type:'Fitness Machine',icon:Watch,color:'#FF6BCD',by:'service'};
    if(svcs.includes(0x1814)||svcs.includes(0x1816)||svcs.includes(0x1818)) return{type:'Sports Sensor',icon:Watch,color:'#FF6BCD',by:'service'};
    if(svcs.includes(0x181A)||svcs.includes(0x1809)) return{type:'Environment Sensor',icon:Fan,color:'#00FF88',by:'service'};
    if(svcs.includes(0x180E)) return{type:'Phone',icon:Smartphone,color:'#FFB74D',by:'service'};
    if(svcs.includes(0x1819)) return{type:'Navigation',icon:Radio,color:'#FFB74D',by:'service'};
  }
  // 3. Manufacturer
  if(mfr){
    if(/apple/i.test(mfr)) return{type:'Apple Device',icon:Smartphone,color:'#FFB74D',by:'manufacturer'};
    if(/bose|jbl|sonos|harman|marshall|yamaha|denon|bang.*olufsen|b&o|ultimate.?ears|anker|soundcore/i.test(mfr)) return{type:'Speaker',icon:Speaker,color:'#FFB800',by:'manufacturer'};
    if(/samsung|lg|sony|vizio|tcl|hisense|philips/i.test(mfr)) return{type:'Electronics',icon:Tv,color:'#00E6FF',by:'manufacturer'};
    if(/logitech|corsair|razer|steelseries|hyperx/i.test(mfr)) return{type:'Peripheral',icon:Mouse,color:'#80DEEA',by:'manufacturer'};
    if(/fitbit|garmin|polar|suunto|coros|whoop|amazfit|huami/i.test(mfr)) return{type:'Wearable',icon:Watch,color:'#FF6BCD',by:'manufacturer'};
    if(/nintendo|xbox|playstation|8bitdo/i.test(mfr)) return{type:'Controller',icon:Gamepad2,color:'#FF6B6B',by:'manufacturer'};
    if(/gopro/i.test(mfr)) return{type:'Camera',icon:Radio,color:'#FFB74D',by:'manufacturer'};
    if(/tile|chipolo|airtag/i.test(mfr)) return{type:'Tracker',icon:Radio,color:'#90A4AE',by:'manufacturer'};
  }
  // 4. Name heuristics
  const l=name.toLowerCase();
  if(/\btv\b|bravia|roku|chromecast|fire.?stick|apple.?tv|shield|vizio|tizen/i.test(l)) return{type:'Television',icon:Tv,color:'#00E6FF',by:'name'};
  if(/speaker|soundbar|bose|jbl|sonos|marshall|echo|homepod|soundcore|ue.?(boom|megaboom|wonderboom)/i.test(l)) return{type:'Speaker',icon:Speaker,color:'#FFB800',by:'name'};
  if(/headphone|airpod|buds|earbud|wh-1000|wf-1000|qc[0-9]|jabra|galaxy.?buds|freebuds|momentum|px[0-9]|elite/i.test(l)) return{type:'Headphones',icon:Headphones,color:'#B388FF',by:'name'};
  if(/watch|band|fitbit|garmin|amazfit|polar|suunto|mi.?band|versa|sense|fenix|forerunner|venu/i.test(l)) return{type:'Wearable',icon:Watch,color:'#FF6BCD',by:'name'};
  if(/gamepad|controller|xbox|playstation|dualsense|joy.?con|8bitdo|pro.?controller/i.test(l)) return{type:'Controller',icon:Gamepad2,color:'#FF6B6B',by:'name'};
  if(/keyboard|keychron|hhkb|nuphy|anne.?pro/i.test(l)) return{type:'Keyboard',icon:Keyboard,color:'#64FFDA',by:'name'};
  if(/mouse|mx.?master|trackpad|trackball|g.?pro|deathadder|viper/i.test(l)) return{type:'Mouse',icon:Mouse,color:'#80DEEA',by:'name'};
  if(/phone|iphone|galaxy.?[saz]|pixel|oneplus|xiaomi|oppo|huawei/i.test(l)) return{type:'Phone',icon:Smartphone,color:'#FFB74D',by:'name'};
  if(/bulb|light|hue|lifx|nanoleaf|govee|yeelight|wiz|tradfri|led.?strip/i.test(l)) return{type:'Light',icon:Lightbulb,color:'#FFD700',by:'name'};
  if(/\bac\b|thermostat|nest|ecobee|daikin|sensibo|tado|hvac/i.test(l)) return{type:'Climate',icon:Fan,color:'#00FF88',by:'name'};
  if(/printer|epson|canon|brother|hp.?[a-z]/i.test(l)) return{type:'Printer',icon:Printer,color:'#90A4AE',by:'name'};
  if(/tile|chipolo|nut|tracker|airtag|smarttag/i.test(l)) return{type:'Tracker',icon:Radio,color:'#90A4AE',by:'name'};
  if(/gopro|insta360|dji|osmo|action.?cam/i.test(l)) return{type:'Camera',icon:Radio,color:'#FFB74D',by:'name'};
  if(/lock|schlage|august|yale|nuki/i.test(l)) return{type:'Smart Lock',icon:Plug,color:'#FF6B6B',by:'name'};
  if(/scale|withings|renpho|eufy/i.test(l)) return{type:'Scale',icon:Watch,color:'#FF6BCD',by:'name'};
  if(/toothbrush|oral.?b|sonicare/i.test(l)) return{type:'Smart Toothbrush',icon:Radio,color:'#00FF88',by:'name'};
  return{type:'Unknown',icon:Bluetooth,color:'#90A4AE',by:'—'};
}

const OP_CLR:Record<string,string> = {SCAN:'#00E6FF',PROBE:'#B388FF',READ:'#64FFDA',WRITE:'#FFB800',NOTIFY:'#00FF88',CONNECT:'#00E6FF',DISCONNECT:'#FF6B6B',ENUM:'#80DEEA',ERROR:'#FF3D3D',SUB:'#FF6BCD',INFO:'#90A4AE'};

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function WorldRemote({ onClose }: { onClose?: () => void }) {
  const [devices, setDevices] = useState<BLEDev[]>([]);
  const [scanning, setScanning] = useState(false);
  const [btOk, setBtOk] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [connecting, setConnecting] = useState<string|null>(null);
  const [gattTarget, setGattTarget] = useState<string|null>(null);
  const [gattSvcs, setGattSvcs] = useState<Svc[]>([]);
  const [gattLoading, setGattLoading] = useState(false);
  const [exSvc, setExSvc] = useState<string|null>(null);
  const [wIn, setWIn] = useState<Record<string,string>>({});
  const [copied, setCopied] = useState<string|null>(null);
  const [pkts, setPkts] = useState<Pkt[]>([]);
  const [bytes, setBytes] = useState(0);
  const [view, setView] = useState<'devices'|'log'>('devices');
  const [autoScr, setAutoScr] = useState(true);
  const [exDev, setExDev] = useState<string|null>(null);
  const [full, setFull] = useState(false);
  const [paused, setPaused] = useState(false);

  const mtd=useRef(true); const errT=useRef<ReturnType<typeof setTimeout>|null>(null);
  const nL=useRef<Map<string,(e:Event)=>void>>(new Map()); const pid=useRef(0);
  const logEl=useRef<HTMLDivElement>(null); const t0=useRef(Date.now()); const [tick,setTick]=useState(0);

  useEffect(()=>{if(typeof navigator!=='undefined'&&!navigator.bluetooth)setBtOk(false);mtd.current=true;t0.current=Date.now();const iv=setInterval(()=>{if(mtd.current)setTick(t=>t+1);},1000);return()=>{mtd.current=false;clearInterval(iv);if(errT.current)clearTimeout(errT.current);nL.current.clear();};},[]);
  useEffect(()=>{if(autoScr&&logEl.current)logEl.current.scrollTop=logEl.current.scrollHeight;},[pkts,autoScr]);
  useEffect(()=>{if(full)document.body.style.overflow='hidden';else document.body.style.overflow='';return()=>{document.body.style.overflow='';};},[full]);

  const setErr=useCallback((m:string|null)=>{if(!mtd.current)return;setError(m);if(errT.current)clearTimeout(errT.current);if(m)errT.current=setTimeout(()=>{if(mtd.current)setError(null);},6000);},[]);
  const log=useCallback((op:PktOp,src:string,msg:string,hex?:string,len?:number)=>{if(!mtd.current||paused)return;const p:Pkt={id:++pid.current,ts:Date.now(),op,src,msg,hex,len};setPkts(prev=>{const next=[...prev,p];return next.length>2000?next.slice(-2000):next;});if(len)setBytes(b=>b+len);},[paused]);

  const onDC=useCallback((e:Event)=>{if(!mtd.current)return;const d=e.target as BluetoothDevice;setDevices(p=>p.map(x=>x.bt===d?{...x,connected:false,srv:undefined}:x));log('DISCONNECT',d.name||'?','GATT disconnected');},[log]);

  /* ═══ DEEP PROBE — extracts maximum data from a BLE device ═══ */
  const deepProbe = useCallback(async(dev:BLEDev):Promise<BLEDev> => {
    if(!dev.bt?.gatt) return{...dev,probing:false,...classify(dev.name)};
    const p0=performance.now();
    let name=dev.name, mfr:string|undefined, model:string|undefined, serial:string|undefined,
        fw:string|undefined, hw:string|undefined, sw:string|undefined,
        appearance:number|undefined, appLabel2:string|undefined,
        battery:number|undefined;
    const services:string[]=[]; const foundSvcs:number[]=[]; let charCount=0, totalBytes=0;

    log('PROBE',dev.name,'Deep scanning GATT services...');
    try {
      const s=await dev.bt.gatt.connect();
      log('CONNECT',dev.name,'GATT connected — probing all services');

      // Generic Access
      try{const ga=await s.getPrimaryService(0x1800); services.push('Generic Access');
        try{const c=await ga.getCharacteristic(0x2A00);const v=await c.readValue();const n=new TextDecoder().decode(v.buffer).replace(/\0+$/g,'');if(n){name=n;totalBytes+=v.byteLength;log('READ',dev.name,`Device Name → "${n}"`,toHex(n),v.byteLength);}}catch{}
        try{const c=await ga.getCharacteristic(0x2A01);const v=await c.readValue();appearance=v.getUint16(0,true);appLabel2=appLabel(appearance);totalBytes+=v.byteLength;const hx=Array.from(new Uint8Array(v.buffer)).map(x=>x.toString(16).padStart(2,'0')).join(' ');log('READ',name,`Appearance → ${appLabel2} (0x${appearance.toString(16).padStart(4,'0')})`,hx,v.byteLength);}catch{}
        try{const c=await ga.getCharacteristic(0x2A04);const v=await c.readValue();const min=v.getUint16(0,true)*1.25;const max=v.getUint16(2,true)*1.25;const lat=v.getUint16(4,true);const to=v.getUint16(6,true)*10;totalBytes+=v.byteLength;log('READ',name,`Conn Params → min:${min}ms max:${max}ms latency:${lat} timeout:${to}ms`);}catch{}
        charCount+=3;
      }catch{log('INFO',dev.name,'Generic Access not available');}

      // Device Information
      try{const di=await s.getPrimaryService(0x180A); services.push('Device Information');
        const fields:[string,number][]=[['Manufacturer',0x2A29],['Model',0x2A24],['Serial',0x2A25],['Hardware Rev',0x2A27],['Firmware Rev',0x2A26],['Software Rev',0x2A28]];
        for(const[lbl,uuid]of fields){
          const val=await readStr(di,uuid);
          if(val){if(uuid===0x2A29)mfr=val;if(uuid===0x2A24)model=val;if(uuid===0x2A25)serial=val;if(uuid===0x2A27)hw=val;if(uuid===0x2A26)fw=val;if(uuid===0x2A28)sw=val;
            totalBytes+=val.length;log('READ',name,`${lbl} → "${val}"`,toHex(val),val.length);}
          charCount++;
        }
        // System ID
        try{const c=await di.getCharacteristic(0x2A23);const v=await c.readValue();const hx=Array.from(new Uint8Array(v.buffer)).map(x=>x.toString(16).padStart(2,'0')).join(' ');totalBytes+=v.byteLength;log('READ',name,`System ID → ${hx}`,hx,v.byteLength);charCount++;}catch{}
        // PnP ID
        try{const c=await di.getCharacteristic(0x2A50);const v=await c.readValue();const src=v.getUint8(0);const vid=v.getUint16(1,true);const pid2=v.getUint16(3,true);const ver=v.getUint16(5,true);totalBytes+=v.byteLength;log('READ',name,`PnP ID → src:${src} vendor:0x${vid.toString(16)} product:0x${pid2.toString(16)} ver:${ver}`,undefined,v.byteLength);charCount++;}catch{}
      }catch{log('INFO',name,'Device Information not available');}

      // Battery
      try{const bs=await s.getPrimaryService(0x180F);services.push('Battery');foundSvcs.push(0x180F);
        const bc=await bs.getCharacteristic(0x2A19);const bv=await bc.readValue();battery=bv.getUint8(0);totalBytes+=bv.byteLength;
        log('READ',name,`Battery → ${battery}%`,battery.toString(16).padStart(2,'0'),1);charCount++;
      }catch{}

      // TX Power
      try{const tx=await s.getPrimaryService(0x1804);services.push('TX Power');foundSvcs.push(0x1804);
        const tc=await tx.getCharacteristic(0x2A07);const tv=await tc.readValue();const dbm=tv.getInt8(0);totalBytes+=tv.byteLength;
        log('READ',name,`TX Power → ${dbm} dBm`,undefined,1);charCount++;
      }catch{}

      // Scan remaining services
      for(const svc of PROBE_SVCS){
        if([0x1800,0x180A,0x180F,0x1804].includes(svc)) continue;
        try{await s.getPrimaryService(svc);foundSvcs.push(svc);const sn=SVC_NAMES[svc]||`0x${svc.toString(16)}`;services.push(sn);log('ENUM',name,`Service: ${sn} (0x${svc.toString(16).padStart(4,'0')})`);}catch{}
      }

      // Try to discover ALL services (catch custom ones too)
      try{
        const allSvcs=await s.getPrimaryServices();
        for(const sv of allSvcs){
          const sn=nameUUID(sv.uuid);
          if(!services.includes(sn)){services.push(sn);log('ENUM',name,`Service: ${sn}`);}
          // Count characteristics
          try{const chs=await sv.getCharacteristics();charCount+=chs.length;log('ENUM',name,`  └─ ${chs.length} characteristics`);}catch{}
        }
      }catch{}

      try{s.disconnect();}catch{}
    }catch(e:any){log('ERROR',dev.name,`Probe error: ${e.message}`);}

    const cls=classify(name,appearance,mfr,foundSvcs);
    const ms=Math.round(performance.now()-p0);
    log('INFO',name,`✓ ${cls.type} via ${cls.by} — ${services.length} svcs, ${charCount} chars, ${totalBytes}B in ${ms}ms`);

    return{...dev,name,probing:false,probeMs:ms,battery,...cls,classBy:cls.by,
      manufacturer:mfr,model,serial,firmware:fw,hardware:hw,software:sw,
      appearance,appearanceLabel:appLabel2,services,serviceCount:services.length,charCount,totalBytes};
  },[log]);

  /* ═══ SCAN ═══ */
  const scan = useCallback(async()=>{
    if(!navigator.bluetooth||scanning)return;setScanning(true);setErr(null);
    log('SCAN','SCANNER','Bluetooth device picker opened...');
    try{
      const d=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:ALL_OPTIONAL});
      if(!d){setScanning(false);return;}
      if(devices.find(x=>x.id===d.id)){log('INFO','SCANNER','Already captured');setScanning(false);return;}
      d.addEventListener('gattserverdisconnected',onDC);
      log('SCAN','SCANNER',`Selected: "${d.name||d.id}" [${d.id.slice(0,12)}]`);
      const raw:BLEDev={id:d.id,name:d.name||`Device-${d.id.slice(0,6)}`,type:'Unknown',icon:Bluetooth,color:'#90A4AE',classBy:'—',connected:false,probing:true,services:[],serviceCount:0,charCount:0,totalBytes:0,bt:d};
      setDevices(p=>[...p,raw]);
      const probed=await deepProbe(raw);
      if(mtd.current)setDevices(p=>p.map(x=>x.id===d.id?probed:x));
    }catch(e:any){if(e.name!=='NotFoundError'){setErr(e.message);log('ERROR','SCANNER',e.message);}else log('INFO','SCANNER','Picker dismissed');}
    finally{if(mtd.current)setScanning(false);}
  },[devices,scanning,deepProbe,onDC,setErr,log]);

  /* ═══ CONNECT / DISCONNECT ═══ */
  const connect=useCallback(async(dev:BLEDev)=>{if(!dev.bt?.gatt||connecting)return;setConnecting(dev.id);log('CONNECT',dev.name,'Connecting...');
    try{const s=await dev.bt.gatt.connect();if(!s)throw new Error('fail');let b=dev.battery;
      try{const bs=await s.getPrimaryService(0x180F);const bc=await bs.getCharacteristic(0x2A19);b=(await bc.readValue()).getUint8(0);}catch{}
      setDevices(p=>p.map(d=>d.id===dev.id?{...d,connected:true,srv:s,battery:b}:d));log('CONNECT',dev.name,'✓ Connected');
    }catch(e:any){setErr(e.message);log('ERROR',dev.name,e.message);}finally{if(mtd.current)setConnecting(null);}
  },[connecting,setErr,log]);

  const disconnect=useCallback((dev:BLEDev)=>{try{dev.bt?.gatt?.connected&&dev.bt.gatt.disconnect();}catch{}
    setDevices(p=>p.map(d=>d.id===dev.id?{...d,connected:false,srv:undefined}:d));if(gattTarget===dev.id){setGattTarget(null);setGattSvcs([]);}log('DISCONNECT',dev.name,'Dropped');
  },[gattTarget,log]);

  /* ═══ GATT EXPLORER ═══ */
  const explore=useCallback(async(dev:BLEDev)=>{if(!dev.bt?.gatt)return;if(!dev.bt.gatt.connected){try{await dev.bt.gatt.connect();}catch{return;}}
    setGattTarget(dev.id);setGattLoading(true);setGattSvcs([]);setExSvc(null);log('ENUM',dev.name,'Full GATT enumeration...');
    try{const svcs=await dev.bt.gatt.getPrimaryServices();const result:Svc[]=[];
      for(const s of svcs){const sn=nameUUID(s.uuid);const chars:Chr[]=[];
        try{for(const ch of await s.getCharacteristics()){let value:string|undefined,hex:string|undefined;
          if(ch.properties.read){try{const v=await ch.readValue();const d=decode(v);value=d.text;hex=d.hex;log('READ',dev.name,`${nameUUID(ch.uuid)}: ${d.text.slice(0,60)}`,d.hex,v.byteLength);}catch{}}
          chars.push({uuid:ch.uuid,name:nameUUID(ch.uuid),p:{r:ch.properties.read,w:ch.properties.write,wn:ch.properties.writeWithoutResponse,n:ch.properties.notify,i:ch.properties.indicate},value,hex,char:ch});
        }}catch{}result.push({uuid:s.uuid,name:sn,chars});}
      if(mtd.current){setGattSvcs(result);if(result.length>0)setExSvc(result[0].uuid);}
      log('INFO',dev.name,`✓ ${result.length} services, ${result.reduce((a,s)=>a+s.chars.length,0)} characteristics`);
    }catch(e:any){log('ERROR',dev.name,e.message);}finally{if(mtd.current)setGattLoading(false);}
  },[log]);

  const toggleN=useCallback(async(su:string,ch:Chr,dn:string)=>{if(!ch.char)return;const key=`${su}/${ch.uuid}`;try{if(ch.notifying){await ch.char.stopNotifications();const l=nL.current.get(key);if(l){ch.char.removeEventListener('characteristicvaluechanged',l);nL.current.delete(key);}setGattSvcs(p=>p.map(s=>s.uuid===su?{...s,chars:s.chars.map(c=>c.uuid===ch.uuid?{...c,notifying:false}:c)}:s));log('SUB',dn,`✗ ${ch.name}`);}else{await ch.char.startNotifications();const listener=(e:Event)=>{if(!mtd.current)return;const t=(e.target as BluetoothRemoteGATTCharacteristic).value;if(!t)return;const d=decode(t);setGattSvcs(p=>p.map(s=>s.uuid===su?{...s,chars:s.chars.map(c=>c.uuid===ch.uuid?{...c,value:d.text,hex:d.hex}:c)}:s));log('NOTIFY',dn,`${ch.name}: ${d.text.slice(0,50)}`,d.hex,t.byteLength);};ch.char.addEventListener('characteristicvaluechanged',listener);nL.current.set(key,listener);setGattSvcs(p=>p.map(s=>s.uuid===su?{...s,chars:s.chars.map(c=>c.uuid===ch.uuid?{...c,notifying:true}:c)}:s));log('SUB',dn,`✓ ${ch.name}`);}}catch(e:any){log('ERROR',dn,(e.message||'').slice(0,40));}
  },[log]);

  // Derived
  const upSec=Math.floor((Date.now()-t0.current)/1000);
  const upStr=`${Math.floor(upSec/60).toString().padStart(2,'0')}:${(upSec%60).toString().padStart(2,'0')}`;
  const liveCount=devices.filter(d=>d.connected).length;

  /* ═══ RENDER ═══ */
  const inner = (
    <div className={`flex flex-col overflow-hidden ${full?'w-full h-full':''}`} style={{...(!full&&{minWidth:340,maxHeight:700}),background:'#060810',borderRadius:full?0:14,border:full?'none':'1px solid rgba(0,230,255,0.06)',boxShadow:full?'none':'0 8px 40px rgba(0,0,0,0.6)'}}>

      {/* HEADER */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{background:'linear-gradient(180deg,rgba(0,230,255,0.04),transparent)',borderBottom:'1px solid rgba(0,230,255,0.06)'}}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center relative shrink-0" style={{background:'rgba(0,230,255,0.06)',border:'1px solid rgba(0,230,255,0.1)'}}>
          <Bluetooth className="w-4 h-4 text-[var(--cyan-primary)]"/>
          {scanning&&<motion.div className="absolute inset-0 rounded-lg" animate={{boxShadow:['0 0 0px rgba(0,230,255,0.2)','0 0 12px rgba(0,230,255,0.4)','0 0 0px rgba(0,230,255,0.2)']}} transition={{duration:1,repeat:Infinity}}/>}
        </div>
        <div className="mr-auto">
          <h3 className="text-[11px] font-mono font-bold tracking-[0.25em] text-[var(--text-primary)]">BLE SCANNER</h3>
          <span className={`text-[7px] font-mono tracking-widest ${scanning?'text-[var(--cyan-primary)] animate-pulse':'text-[var(--text-muted)]'}`}>{scanning?'● SCANNING':liveCount>0?`● ${liveCount} LIVE`:`${devices.length} CAPTURED`}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center"><div className="text-[5px] font-mono text-[var(--text-muted)] tracking-[0.2em]">DEVS</div><div className="text-[10px] font-mono font-bold text-[var(--cyan-primary)] tabular-nums">{devices.length}</div></div>
          <div className="text-center"><div className="text-[5px] font-mono text-[var(--text-muted)] tracking-[0.2em]">PKTS</div><div className="text-[10px] font-mono font-bold text-[#00FF88] tabular-nums">{pkts.length}</div></div>
          <div className="text-center"><div className="text-[5px] font-mono text-[var(--text-muted)] tracking-[0.2em]">DATA</div><div className="text-[10px] font-mono font-bold text-[var(--text-muted)] tabular-nums">{bytes>1024?`${(bytes/1024).toFixed(1)}K`:bytes}B</div></div>
        </div>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          <button onClick={()=>setFull(!full)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5">{full?<Minimize2 className="w-3.5 h-3.5 text-[var(--text-muted)]"/>:<Maximize2 className="w-3.5 h-3.5 text-[var(--text-muted)]"/>}</button>
          {onClose&&<button onClick={()=>{if(full)setFull(false);else onClose();}} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5"><X className="w-3.5 h-3.5 text-[var(--text-muted)]"/></button>}
        </div>
      </div>

      {/* SCAN BAR */}
      <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{background:'rgba(0,0,0,0.3)',borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
        <motion.button whileTap={{scale:0.95}} onClick={scan} disabled={scanning||!btOk}
          className="px-4 py-1.5 rounded-lg text-[7px] font-mono font-bold tracking-[0.15em] flex items-center gap-1.5 disabled:opacity-30"
          style={{background:scanning?'rgba(0,230,255,0.08)':'linear-gradient(135deg,rgba(0,230,255,0.1),rgba(0,230,255,0.04))',color:'var(--cyan-primary)',border:'1px solid rgba(0,230,255,0.1)'}}>
          {scanning?<BluetoothSearching className="w-3 h-3 animate-pulse"/>:<Scan className="w-3 h-3"/>}
          {scanning?'SCANNING...':'SCAN DEVICE'}
        </motion.button>
        <div className="flex-1"/>
        {(['devices','log'] as const).map(tab=>(
          <button key={tab} onClick={()=>setView(tab)} className="relative px-3 py-1.5 text-[7px] font-mono font-bold tracking-[0.15em] uppercase transition-colors rounded-lg"
            style={{color:view===tab?'var(--cyan-primary)':'var(--text-muted)',background:view===tab?'rgba(0,230,255,0.06)':'transparent'}}>
            {tab==='devices'?`DEVICES ${devices.length}`:`LOG ${pkts.length}`}
          </button>
        ))}
      </div>

      {/* ERROR */}
      <AnimatePresence>{error&&<motion.div initial={{height:0}} animate={{height:'auto'}} exit={{height:0}} className="overflow-hidden shrink-0"><div className="mx-3 mt-2 p-2 rounded-lg flex items-center gap-2" style={{background:'rgba(255,61,61,0.04)',border:'1px solid rgba(255,61,61,0.1)'}}><AlertTriangle className="w-3 h-3 text-[#FF3D3D] shrink-0"/><span className="text-[7px] font-mono text-[#FF3D3D] flex-1 truncate">{error}</span><button onClick={()=>setError(null)}><X className="w-2.5 h-2.5 text-[#FF3D3D]/50"/></button></div></motion.div>}</AnimatePresence>

      {/* BODY */}
      <div className="flex-1 overflow-hidden flex">

        {/* ═══ DEVICES ═══ */}
        {view==='devices'&&(
          <div className={`flex-1 overflow-y-auto styled-scrollbar ${full?'flex flex-wrap content-start gap-3 p-4':'px-3 py-3 space-y-2'}`}>
            {devices.length===0&&!scanning&&btOk&&(
              <div className={`flex flex-col items-center justify-center opacity-30 ${full?'w-full py-16':'py-10'}`}>
                <Bluetooth className="w-10 h-10 text-[var(--cyan-primary)]/20 mb-3"/>
                <p className="text-[9px] font-mono text-[var(--text-muted)] text-center tracking-wider leading-relaxed">
                  Tap <span className="text-[var(--cyan-primary)]">SCAN DEVICE</span> to detect nearby<br/>Bluetooth peripherals and deep-probe them.
                </p>
              </div>
            )}
            {!btOk&&<div className="p-3 rounded-xl" style={{background:'rgba(255,61,61,0.04)',border:'1px solid rgba(255,61,61,0.08)'}}><span className="text-[8px] font-mono text-[#FF3D3D]">Web Bluetooth unavailable — Chrome or Edge required</span></div>}

            {devices.map(dev=>{
              const isE=exDev===dev.id;const isG=gattTarget===dev.id;const isC=connecting===dev.id;
              return(
                <motion.div key={dev.id} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} layout className={full?'w-full sm:w-[calc(50%-6px)] lg:w-[calc(33.33%-8px)]':'w-full'}>
                  <div className="rounded-xl overflow-hidden transition-all" style={{background:dev.connected?`linear-gradient(135deg,${dev.color}06,${dev.color}02)`:'rgba(255,255,255,0.015)',border:`1px solid ${dev.connected?dev.color+'15':'rgba(255,255,255,0.04)'}`,boxShadow:dev.connected?`0 0 20px ${dev.color}08`:'none'}}>

                    <button className="w-full p-3.5 flex items-start gap-3 text-left" onClick={()=>setExDev(isE?null:dev.id)}>
                      <motion.div animate={dev.probing?{rotate:[0,360]}:{}} transition={{duration:2,repeat:Infinity,ease:'linear'}}
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 relative"
                        style={{background:`linear-gradient(135deg,${dev.color}12,${dev.color}05)`,border:`1px solid ${dev.color}18`}}>
                        {dev.probing||isC?<div className="w-4 h-4 border-2 rounded-full animate-spin" style={{borderColor:dev.color,borderTopColor:'transparent'}}/>:<dev.icon className="w-5 h-5" style={{color:dev.color}}/>}
                        {dev.connected&&<div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--alert-green)] border-2 animate-pulse" style={{borderColor:'#060810'}}/>}
                      </motion.div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-mono font-bold text-[var(--text-primary)] truncate">{dev.name}</span>
                          {dev.connected&&<span className="text-[5px] font-mono px-1 py-0.5 rounded bg-[var(--alert-green)]/10 text-[var(--alert-green)] tracking-widest font-bold">LIVE</span>}
                        </div>
                        {dev.probing?<div className="flex items-center gap-2"><motion.div className="h-1 rounded-full flex-1" style={{background:`${dev.color}10`}}><motion.div className="h-full rounded-full" style={{background:dev.color}} animate={{width:['0%','60%','100%']}} transition={{duration:3}}/></motion.div><span className="text-[6px] font-mono tracking-wider" style={{color:dev.color}}>DEEP PROBE</span></div>
                        :<div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[7px] font-mono px-1.5 py-0.5 rounded-md tracking-wider font-bold" style={{background:`${dev.color}10`,color:dev.color,border:`1px solid ${dev.color}12`}}>{dev.type.toUpperCase()}</span>
                          <span className="text-[5px] font-mono px-1 py-0.5 rounded bg-white/4 text-[var(--text-muted)] tracking-[0.15em]">via {dev.classBy.toUpperCase()}</span>
                          {dev.battery!=null&&<span className="text-[6px] font-mono flex items-center gap-0.5" style={{color:dev.battery>50?'var(--alert-green)':dev.battery>20?'#FFB800':'#FF3D3D'}}><BatteryMedium className="w-2.5 h-2.5"/>{dev.battery}%</span>}
                          <span className="text-[5px] font-mono text-[var(--text-muted)]"><Server className="w-2 h-2 inline mr-0.5"/>{dev.serviceCount}</span>
                          <span className="text-[5px] font-mono text-[var(--text-muted)]"><Clock className="w-2 h-2 inline mr-0.5"/>{dev.probeMs}ms</span>
                        </div>}
                      </div>
                      <ChevronDown className={`w-3 h-3 text-[var(--text-muted)] transition-transform mt-1 shrink-0 ${isE?'rotate-180':''}`}/>
                    </button>

                    <AnimatePresence>{isE&&!dev.probing&&(<motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden"><div className="px-3.5 pb-3.5" style={{borderTop:'1px solid rgba(255,255,255,0.03)'}}>
                      {/* Details grid */}
                      <div className="mt-2.5 space-y-0.5 mb-2.5">
                        {dev.manufacturer&&<div className="flex gap-2"><span className="text-[5px] font-mono text-[var(--text-muted)] w-[70px] shrink-0 tracking-wider">Manufacturer</span><span className="text-[7px] font-mono text-[var(--text-primary)]">{dev.manufacturer}</span></div>}
                        {dev.model&&<div className="flex gap-2"><span className="text-[5px] font-mono text-[var(--text-muted)] w-[70px] shrink-0 tracking-wider">Model</span><span className="text-[7px] font-mono text-[var(--text-primary)]">{dev.model}</span></div>}
                        {dev.serial&&<div className="flex gap-2"><span className="text-[5px] font-mono text-[var(--text-muted)] w-[70px] shrink-0 tracking-wider">Serial</span><span className="text-[7px] font-mono text-[var(--text-primary)]">{dev.serial}</span></div>}
                        {dev.firmware&&<div className="flex gap-2"><span className="text-[5px] font-mono text-[var(--text-muted)] w-[70px] shrink-0 tracking-wider">Firmware</span><span className="text-[7px] font-mono text-[var(--text-primary)]">{dev.firmware}</span></div>}
                        {dev.hardware&&<div className="flex gap-2"><span className="text-[5px] font-mono text-[var(--text-muted)] w-[70px] shrink-0 tracking-wider">Hardware</span><span className="text-[7px] font-mono text-[var(--text-primary)]">{dev.hardware}</span></div>}
                        {dev.software&&<div className="flex gap-2"><span className="text-[5px] font-mono text-[var(--text-muted)] w-[70px] shrink-0 tracking-wider">Software</span><span className="text-[7px] font-mono text-[var(--text-primary)]">{dev.software}</span></div>}
                        {dev.appearance!=null&&<div className="flex gap-2"><span className="text-[5px] font-mono text-[var(--text-muted)] w-[70px] shrink-0 tracking-wider">Appearance</span><span className="text-[7px] font-mono" style={{color:dev.color}}>{dev.appearanceLabel} (0x{dev.appearance.toString(16).padStart(4,'0')})</span></div>}
                        <div className="flex gap-2"><span className="text-[5px] font-mono text-[var(--text-muted)] w-[70px] shrink-0 tracking-wider">Probe Stats</span><span className="text-[7px] font-mono text-[var(--text-muted)]">{dev.serviceCount} svcs · {dev.charCount} chars · {dev.totalBytes}B · {dev.probeMs}ms</span></div>
                      </div>
                      {/* Services */}
                      {dev.services.length>0&&<div className="flex flex-wrap gap-1 mb-3">{dev.services.map((s,i)=><span key={i} className="text-[5px] font-mono px-1.5 py-0.5 rounded tracking-wider" style={{background:`${dev.color}06`,color:`${dev.color}70`}}>{s}</span>)}</div>}
                      <div className="text-[4px] font-mono text-[var(--text-muted)] mb-3 opacity-30 tracking-wider">{dev.id}</div>
                      {/* Actions */}
                      <div className="flex gap-2">
                        {dev.connected?(<>
                          <motion.button whileTap={{scale:0.95}} onClick={()=>explore(dev)} className="flex-1 py-2 rounded-lg text-[7px] font-mono font-bold tracking-[0.15em] flex items-center justify-center gap-1.5" style={{background:`${dev.color}08`,color:dev.color,border:`1px solid ${dev.color}10`}}><Layers className="w-3 h-3"/>EXPLORE GATT</motion.button>
                          <motion.button whileTap={{scale:0.95}} onClick={()=>disconnect(dev)} className="py-2 px-3 rounded-lg text-[7px] font-mono font-bold tracking-[0.15em]" style={{background:'rgba(255,61,61,0.05)',color:'#FF6B6B'}}><Unplug className="w-3 h-3"/></motion.button>
                        </>):(
                          <motion.button whileTap={{scale:0.95}} onClick={()=>connect(dev)} disabled={!!connecting} className="flex-1 py-2.5 rounded-lg text-[8px] font-mono font-bold tracking-[0.15em] flex items-center justify-center gap-2 disabled:opacity-30" style={{background:`${dev.color}08`,color:dev.color,border:`1px solid ${dev.color}10`}}><Zap className="w-3.5 h-3.5"/>{isC?'PAIRING...':'CONNECT'}</motion.button>
                        )}
                      </div>
                      {/* GATT Explorer */}
                      <AnimatePresence>{isG&&(<motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden"><div className="mt-3 pt-3" style={{borderTop:`1px solid ${dev.color}08`}}>
                        <div className="flex items-center justify-between mb-2"><span className="text-[7px] font-mono font-bold tracking-[0.15em]" style={{color:dev.color}}>GATT TREE</span><button onClick={()=>{setGattTarget(null);setGattSvcs([]);}}><X className="w-2.5 h-2.5 text-[var(--text-muted)]"/></button></div>
                        {gattLoading?<div className="flex items-center justify-center py-4 gap-2"><div className="w-4 h-4 border-2 rounded-full animate-spin" style={{borderColor:dev.color,borderTopColor:'transparent'}}/><span className="text-[7px] font-mono animate-pulse" style={{color:dev.color}}>ENUMERATING...</span></div>
                        :gattSvcs.map(svc=>(<div key={svc.uuid}>
                          <button onClick={()=>setExSvc(exSvc===svc.uuid?null:svc.uuid)} className="w-full p-2 rounded-lg flex items-center gap-2 text-left hover:bg-white/[0.02]"><Bluetooth className="w-2.5 h-2.5 shrink-0" style={{color:dev.color}}/><span className="text-[7px] font-mono font-bold text-[var(--text-primary)] truncate flex-1">{svc.name}</span><span className="text-[6px] font-mono" style={{color:`${dev.color}80`}}>{svc.chars.length}</span><ChevronRight className={`w-2.5 h-2.5 text-[var(--text-muted)] transition-transform ${exSvc===svc.uuid?'rotate-90':''}`}/></button>
                          <AnimatePresence>{exSvc===svc.uuid&&(<motion.div initial={{height:0}} animate={{height:'auto'}} exit={{height:0}} className="overflow-hidden"><div className="pl-4 pr-1 py-1 space-y-1">{svc.chars.map(ch=>{const ck=`${svc.uuid}/${ch.uuid}`;const fl=[ch.p.r&&'R',ch.p.w&&'W',ch.p.wn&&'Wn',ch.p.n&&'N',ch.p.i&&'I'].filter(Boolean).join('·');const wV=wIn[ck]||'';const wOk=!wV||validHex(wV);return(
                            <div key={ch.uuid} className="p-2 rounded-lg" style={{background:'rgba(0,0,0,0.25)',borderLeft:`2px solid ${dev.color}12`}}>
                              <div className="flex items-center gap-1 mb-1"><span className="text-[6px] font-mono font-bold text-[var(--text-primary)] truncate flex-1">{ch.name}</span><span className="text-[5px] font-mono px-1 py-0.5 rounded" style={{background:`${dev.color}06`,color:`${dev.color}80`}}>{fl}</span></div>
                              {ch.value&&<div className="flex items-center gap-1 mb-1.5"><div className="flex-1 rounded px-2 py-1 min-w-0" style={{background:'rgba(0,0,0,0.3)'}}><div className={`text-[7px] font-mono truncate ${ch.notifying?'text-[#00FF88]':'text-[var(--alert-green)]'}`}>{ch.value}</div>{ch.hex&&ch.hex!==ch.value&&<div className="text-[5px] font-mono text-[var(--text-muted)] truncate mt-0.5 opacity-50">{ch.hex}</div>}</div><button onClick={()=>{navigator.clipboard?.writeText(ch.value||'');setCopied(ck);setTimeout(()=>setCopied(null),1500);}} className="p-1 rounded hover:bg-white/5 shrink-0">{copied===ck?<Check className="w-2 h-2 text-[var(--alert-green)]"/>:<Copy className="w-2 h-2 text-[var(--text-muted)]"/>}</button></div>}
                              <div className="flex items-center gap-1 flex-wrap">
                                {ch.p.r&&<button onClick={async()=>{if(!ch.char)return;try{const v=await ch.char.readValue();const d=decode(v);setGattSvcs(sv=>sv.map(s=>s.uuid===svc.uuid?{...s,chars:s.chars.map(c=>c.uuid===ch.uuid?{...c,value:d.text,hex:d.hex}:c)}:s));log('READ',dev.name,`${ch.name}: ${d.text.slice(0,50)}`,d.hex,v.byteLength);}catch{log('ERROR',dev.name,`Read: ${ch.name}`);}}} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[5px] font-mono" style={{background:`${dev.color}06`,color:dev.color}}><Eye className="w-2 h-2"/>READ</button>}
                                {ch.p.n&&<button onClick={()=>toggleN(svc.uuid,ch,dev.name)} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[5px] font-mono" style={{background:ch.notifying?'rgba(0,255,136,0.06)':'rgba(255,255,255,0.02)',color:ch.notifying?'#00FF88':'var(--text-muted)'}}>{ch.notifying?<Bell className="w-2 h-2"/>:<BellOff className="w-2 h-2"/>}{ch.notifying?'LIVE':'SUB'}</button>}
                                {(ch.p.w||ch.p.wn)&&<div className="flex items-center gap-0.5 flex-1"><input type="text" placeholder="FF 01" value={wV} onChange={e=>setWIn(iv=>({...iv,[ck]:e.target.value}))} className="flex-1 rounded px-1.5 py-0.5 text-[6px] font-mono text-[var(--text-primary)] outline-none min-w-0" style={{background:'rgba(0,0,0,0.3)',border:`1px solid ${wOk?'transparent':'rgba(255,61,61,0.3)'}`}}/><button onClick={async()=>{if(!ch.char||!wV||!validHex(wV))return;try{await writeSafe(ch.char,parseHex(wV),ch.p.w);log('WRITE',dev.name,`${ch.name} ← ${wV}`);setWIn(iv=>({...iv,[ck]:''}));}catch{log('ERROR',dev.name,`Write: ${ch.name}`);}}} disabled={!wV||!wOk} className="p-0.5 rounded shrink-0 disabled:opacity-30" style={{color:'#FFB800'}}><Send className="w-2 h-2"/></button></div>}
                              </div>
                            </div>);})}</div></motion.div>)}</AnimatePresence>
                        </div>))}
                      </div></motion.div>)}</AnimatePresence>
                    </div></motion.div>)}</AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* ═══ LOG ═══ */}
        {view==='log'&&(
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-1.5 shrink-0" style={{background:'rgba(0,0,0,0.3)',borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
              <span className="text-[5px] font-mono text-[var(--text-muted)] tracking-[0.15em]"># · TIME · OP · SRC · DETAIL</span>
              <div className="flex items-center gap-2">
                <button onClick={()=>setPaused(!paused)} className={`text-[6px] font-mono tracking-wider px-1.5 py-0.5 rounded flex items-center gap-1 ${paused?'text-[#FFB800]':'text-[var(--text-muted)]'}`}>{paused?<><Pause className="w-2 h-2"/>PAUSED</>:<><Play className="w-2 h-2"/>LIVE</>}</button>
                <button onClick={()=>setAutoScr(!autoScr)} className={`text-[6px] font-mono tracking-wider px-1.5 py-0.5 rounded ${autoScr?'text-[var(--alert-green)]':'text-[var(--text-muted)]'}`}>{autoScr?'▼ AUTO':'⏸ HOLD'}</button>
                <button onClick={()=>{setPkts([]);setBytes(0);pid.current=0;}} className="text-[6px] font-mono text-[var(--text-muted)] tracking-wider px-1.5 py-0.5 rounded hover:bg-white/5 flex items-center gap-1"><Trash2 className="w-2 h-2"/>CLR</button>
              </div>
            </div>
            <div ref={logEl} className="flex-1 overflow-y-auto styled-scrollbar font-mono" style={{background:'#020406'}}>
              {pkts.length===0?<div className="flex items-center justify-center h-full opacity-20"><span className="text-[9px] font-mono text-[var(--text-muted)] tracking-wider">Scan a device to see packet activity...</span></div>
              :<div className="py-0.5">{pkts.map(p=>{const oc=OP_CLR[p.op]||'#90A4AE';return(<div key={p.id} className="px-3 py-[3px] flex items-start hover:bg-white/[0.015] border-b border-white/[0.01] group" style={{fontSize:11,lineHeight:'18px'}}><span className="text-white/10 shrink-0 w-[28px] tabular-nums text-right pr-2">{p.id}</span><span className="text-[var(--text-muted)]/40 shrink-0 w-[72px] tabular-nums">{fts(p.ts)}</span><span className="shrink-0 font-bold tracking-wider" style={{color:oc,width:full?70:52}}>{p.op}</span><span className="text-[var(--cyan-primary)]/50 shrink-0 truncate" style={{width:full?110:65}}>{p.src}</span><span className="text-[var(--text-secondary)] flex-1 truncate">{p.msg}</span>{p.hex&&<span className="text-[var(--text-muted)]/20 ml-2 truncate group-hover:text-[var(--text-muted)]/50" style={{maxWidth:full?200:80}}>{p.hex}</span>}{p.len!=null&&<span className="text-[var(--text-muted)]/15 ml-1 shrink-0 tabular-nums group-hover:text-[var(--text-muted)]/40">{p.len}B</span>}</div>);})}</div>}
            </div>
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{background:'rgba(0,0,0,0.4)',borderTop:'1px solid rgba(255,255,255,0.03)'}}>
        <div className="flex items-center gap-2"><div className={`w-1.5 h-1.5 rounded-full ${btOk?'bg-[var(--alert-green)]':'bg-[#FF3D3D]'} ${scanning?'animate-pulse':''}`}/><span className="text-[6px] font-mono text-[var(--text-muted)] tracking-[0.15em]">{scanning?'SCANNING':liveCount>0?`${liveCount} CONNECTED`:'IDLE'} · {upStr}</span></div>
        <div className="flex items-center gap-3"><span className="text-[5px] font-mono text-[var(--text-muted)]/25 tracking-widest">OSIRIS · BLE</span></div>
      </div>
    </div>
  );

  if(full) return createPortal(<motion.div initial={{opacity:0}} animate={{opacity:1}} className="fixed inset-0 z-[9999] flex" style={{background:'rgba(0,0,0,0.9)',backdropFilter:'blur(8px)'}}><div className="w-full h-full p-3 flex">{inner}</div></motion.div>,document.body);
  return inner;
}
