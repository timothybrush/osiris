'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bluetooth, BluetoothSearching, Tv, Speaker, X, WifiOff,
  Gamepad2, Lightbulb, Watch, Headphones, Mouse, Keyboard, Smartphone,
  BatteryMedium, Fan, Eye, Send, Bell, BellOff, ChevronRight, Copy, Check,
  AlertTriangle, Radio, Scan, Signal, Zap, Unplug, Terminal,
  ChevronDown, Shield, Clock, Cpu, Hash, Tag, Server, Layers
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// BLE CONSTANTS
// ═══════════════════════════════════════════════════════════════
const BLE = {
  SVC: { GA:0x1800,GATT:0x1801,DI:0x180A,BAT:0x180F,HR:0x180D,BP:0x1810,HT:0x1809,HID:0x1812,RS:0x1814,CS:0x1816,CP:0x1818,ENV:0x181A,BC:0x181B,UD:0x181C,WS:0x181D,GL:0x1808,TX:0x1804,LL:0x1803,IA:0x1802,CT:0x1805,PAS:0x180E,AN:0x1811,AIO:0x1815,MC:0x1848 },
  CHR: { NAME:0x2A00,APP:0x2A01,MFR:0x2A29,MODEL:0x2A24,SERIAL:0x2A25,HW:0x2A27,FW:0x2A26,SW:0x2A28,SYS:0x2A23,PNP:0x2A50,BATT:0x2A19 },
} as const;
const ALL_SVCS = Object.values(BLE.SVC);
const UUID_NAMES: Record<number,string> = {
  0x1800:'Generic Access',0x1801:'Generic Attribute',0x180A:'Device Information',0x180F:'Battery Service',
  0x180D:'Heart Rate',0x1810:'Blood Pressure',0x1809:'Health Thermometer',0x1812:'Human Interface Device',
  0x1814:'Running Speed',0x1816:'Cycling Speed',0x1818:'Cycling Power',0x181A:'Environmental Sensing',
  0x181B:'Body Composition',0x181C:'User Data',0x181D:'Weight Scale',0x1802:'Immediate Alert',
  0x1803:'Link Loss',0x1804:'TX Power',0x1805:'Current Time',0x180E:'Phone Alert',
  0x1811:'Alert Notification',0x1815:'Automation IO',0x1848:'Media Control',
  0x2A00:'Device Name',0x2A01:'Appearance',0x2A19:'Battery Level',0x2A24:'Model Number',
  0x2A25:'Serial Number',0x2A26:'Firmware Rev',0x2A27:'Hardware Rev',0x2A28:'Software Rev',
  0x2A29:'Manufacturer',0x2A23:'System ID',0x2A50:'PnP ID',0x2A37:'Heart Rate',
  0x2A38:'Body Sensor Location',0x2A6E:'Temperature',0x2A6F:'Humidity',0x2A6D:'Pressure',
};

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════
type DType = 'tv'|'speaker'|'ac'|'light'|'wearable'|'headphones'|'gamepad'|'keyboard'|'mouse'|'phone'|'unknown';
interface DInfo { manufacturer?: string; model?: string; serial?: string; hardware?: string; firmware?: string; software?: string; appearance?: number; appearanceLabel?: string; services: string[]; classifiedBy: string; }
interface Device { id: string; name: string; type: DType; connected: boolean; battery?: number; info?: DInfo; bt?: BluetoothDevice; server?: BluetoothRemoteGATTServer; probing?: boolean; probeMs?: number; }
interface SvcInfo { uuid: string; name: string; chars: CharInfo[]; }
interface CharInfo { uuid: string; name: string; value?: string; hex?: string; notifying?: boolean; char?: BluetoothRemoteGATTCharacteristic; props: { r:boolean;w:boolean;wn:boolean;n:boolean;i:boolean }; }

// ═══════════════════════════════════════════════════════════════
// CLASSIFICATION (pure)
// ═══════════════════════════════════════════════════════════════
function byAppearance(a: number): DType|null {
  const m: Record<number,DType> = {0x0040:'phone',0x00C0:'wearable',0x00C1:'wearable',0x00C2:'wearable',0x0140:'tv',0x0300:'ac',0x03C1:'keyboard',0x03C2:'mouse',0x03C4:'gamepad',0x0840:'speaker',0x0841:'speaker',0x0842:'headphones',0x0843:'headphones',0x0C40:'wearable',0x1440:'wearable'};
  if (m[a]) return m[a];
  const c=a&0xFFC0;
  if(c>=0x40&&c<=0x7F)return'phone'; if(c>=0xC0&&c<=0xFF)return'wearable'; if(c>=0x140&&c<=0x17F)return'tv';
  if(c>=0x3C0&&c<=0x3FF){const s=a&0x3F;return s===1?'keyboard':s===2?'mouse':s===4?'gamepad':null;}
  if(c>=0x840&&c<=0x87F)return'speaker'; return null;
}
function bySvcs(u: number[]): DType|null {
  const h=(x:number)=>u.includes(x);
  if(h(0x1848))return'speaker'; if(h(0x1812))return'gamepad';
  if(h(0x180D)||h(0x1814)||h(0x1816)||h(0x1818))return'wearable';
  if(h(0x181A)||h(0x1809))return'ac'; if(h(0x1810)||h(0x1808)||h(0x181B)||h(0x181D))return'wearable';
  if(h(0x180E))return'phone'; return null;
}
function byName(n: string): DType {
  const l=n.toLowerCase();
  if(/\btv\b|bravia|roku|chromecast|fire.?stick|apple.?tv|shield|vizio/i.test(l))return'tv';
  if(/speaker|soundbar|bose|jbl|sonos|marshall|echo|homepod|ue.?boom|soundcore|beats.?pill/i.test(l))return'speaker';
  if(/\bac\b|thermostat|nest|ecobee|daikin|sensibo|tado/i.test(l))return'ac';
  if(/bulb|light|hue|lifx|nanoleaf|govee|yeelight|lamp/i.test(l))return'light';
  if(/watch|band|fitbit|garmin|amazfit|polar|suunto|whoop|coros/i.test(l))return'wearable';
  if(/headphone|airpod|buds|earbud|wh-1000|wf-1000|qc|momentum|jabra|galaxy.?buds|freebuds|nothing.?ear/i.test(l))return'headphones';
  if(/gamepad|controller|xbox|playstation|dualsense|joy.?con|8bitdo/i.test(l))return'gamepad';
  if(/keyboard|keychron|hhkb|nuphy/i.test(l))return'keyboard';
  if(/mouse|mx.?master|trackpad/i.test(l))return'mouse';
  if(/phone|iphone|galaxy.?[saz]|pixel|oneplus|xiaomi/i.test(l))return'phone';
  return'unknown';
}
function byMfr(m: string): DType|null {
  if(/bose|jbl|sonos|harman|marshall|bang|yamaha|denon/i.test(m))return'speaker';
  if(/samsung|lg|sony|vizio|tcl|hisense|philips/i.test(m))return'tv';
  if(/logitech|corsair|razer|steelseries/i.test(m))return'mouse';
  if(/fitbit|garmin|polar|suunto|coros|whoop|withings/i.test(m))return'wearable';
  return null;
}
function resolveUUID(u: string): string { const m=u.match(/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/i); if(m)return UUID_NAMES[parseInt(m[1],16)]||`0x${m[1].toUpperCase()}`; return u.length>8?u.slice(0,8)+'…':u; }
async function readStr(s: BluetoothRemoteGATTService, u: number) { try{const c=await s.getCharacteristic(u);const v=await c.readValue();return new TextDecoder().decode(v.buffer).replace(/\0+$/g,'')||undefined;}catch{return undefined;} }
function decode(dv: DataView) { const b=new Uint8Array(dv.buffer);const hex=Array.from(b).map(x=>x.toString(16).padStart(2,'0')).join(' '); try{const t=new TextDecoder().decode(dv.buffer);if(/^[\x20-\x7E\n\r\t]+$/.test(t))return{text:t,hex};}catch{} return{text:hex,hex}; }
function validHex(s: string){const h=s.replace(/[\s,:-]/g,'');return h.length>0&&h.length%2===0&&/^[0-9a-fA-F]+$/.test(h);}
function parseHex(s: string){const h=s.replace(/[\s,:-]/g,'');return new Uint8Array((h.match(/.{1,2}/g)||[]).map(b=>parseInt(b,16)));}
async function writeSafe(ch:BluetoothRemoteGATTCharacteristic,d:Uint8Array,resp:boolean){if(resp&&typeof ch.writeValueWithResponse==='function')await ch.writeValueWithResponse(d);else if(!resp&&typeof ch.writeValueWithoutResponse==='function')await ch.writeValueWithoutResponse(d);else await(ch as any).writeValue(d);}

// ── DEVICE META ──
const META: Record<DType,{icon:typeof Bluetooth;color:string;glow:string;label:string;emoji:string}> = {
  tv:         {icon:Tv,        color:'#00E6FF',glow:'0 0 20px rgba(0,230,255,0.3)',  label:'Television',    emoji:'📺'},
  speaker:    {icon:Speaker,   color:'#FFB800',glow:'0 0 20px rgba(255,184,0,0.3)',   label:'Speaker',       emoji:'🔊'},
  ac:         {icon:Fan,       color:'#00FF88',glow:'0 0 20px rgba(0,255,136,0.3)',   label:'Climate',       emoji:'❄️'},
  light:      {icon:Lightbulb, color:'#FFD700',glow:'0 0 20px rgba(255,215,0,0.3)',   label:'Smart Light',   emoji:'💡'},
  wearable:   {icon:Watch,     color:'#FF6BCD',glow:'0 0 20px rgba(255,107,205,0.3)', label:'Wearable',      emoji:'⌚'},
  headphones: {icon:Headphones,color:'#B388FF',glow:'0 0 20px rgba(179,136,255,0.3)', label:'Headphones',    emoji:'🎧'},
  gamepad:    {icon:Gamepad2,  color:'#FF6B6B',glow:'0 0 20px rgba(255,107,107,0.3)', label:'Controller',    emoji:'🎮'},
  keyboard:   {icon:Keyboard,  color:'#64FFDA',glow:'0 0 20px rgba(100,255,218,0.3)', label:'Keyboard',      emoji:'⌨️'},
  mouse:      {icon:Mouse,     color:'#80DEEA',glow:'0 0 20px rgba(128,222,234,0.3)', label:'Mouse',         emoji:'🖱️'},
  phone:      {icon:Smartphone,color:'#FFB74D',glow:'0 0 20px rgba(255,183,77,0.3)',  label:'Phone',         emoji:'📱'},
  unknown:    {icon:Bluetooth, color:'#90A4AE',glow:'0 0 20px rgba(144,164,174,0.2)', label:'Unknown',       emoji:'📡'},
};

function appLabel(a:number){const c=(a>>6)&0x3FF;const m:Record<number,string>={0:'Unknown',1:'Phone',2:'Computer',3:'Watch',5:'Display',6:'Remote',10:'Media Player',15:'HID',48:'Audio Sink'};return m[c]||`0x${a.toString(16)}`;}

// ═══════════════════════════════════════════════════════════════
// RADAR PULSE ANIMATION
// ═══════════════════════════════════════════════════════════════
function RadarPulse({ active }: { active: boolean }) {
  return (
    <div className="relative w-20 h-20">
      <div className="absolute inset-0 rounded-full border border-[var(--cyan-primary)]/20" />
      {active && (
        <>
          <motion.div className="absolute inset-0 rounded-full border border-[var(--cyan-primary)]/30"
            animate={{ scale: [1, 2.5], opacity: [0.4, 0] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }} />
          <motion.div className="absolute inset-0 rounded-full border border-[var(--cyan-primary)]/20"
            animate={{ scale: [1, 2.5], opacity: [0.3, 0] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 0.6 }} />
          <motion.div className="absolute inset-0 rounded-full border border-[var(--cyan-primary)]/10"
            animate={{ scale: [1, 2.5], opacity: [0.2, 0] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 1.2 }} />
        </>
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div animate={active ? { rotate: 360 } : {}} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: 'radial-gradient(circle, rgba(0,230,255,0.15), transparent)', boxShadow: active ? '0 0 30px rgba(0,230,255,0.2)' : 'none' }}>
          <Radio className="w-5 h-5 text-[var(--cyan-primary)]" />
        </motion.div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SIGNAL BARS
// ═══════════════════════════════════════════════════════════════
function SignalBars({ strength, color }: { strength: number; color: string }) {
  return (
    <div className="flex items-end gap-[2px] h-3">
      {[1,2,3,4].map(i => (
        <div key={i} className="rounded-sm transition-all duration-300"
          style={{ width: 3, height: 3 + i * 2.5, background: i <= strength ? color : 'rgba(255,255,255,0.08)', opacity: i <= strength ? 1 : 0.3 }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function WorldRemote({ onClose }: { onClose?: () => void }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [scanning, setScanning] = useState(false);
  const [btOk, setBtOk] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [connecting, setConnecting] = useState<string|null>(null);
  const [gattTarget, setGattTarget] = useState<string|null>(null);
  const [gattSvcs, setGattSvcs] = useState<SvcInfo[]>([]);
  const [gattLoading, setGattLoading] = useState(false);
  const [expandedSvc, setExpandedSvc] = useState<string|null>(null);
  const [writeInput, setWriteInput] = useState<Record<string,string>>({});
  const [copied, setCopied] = useState<string|null>(null);
  const [toast, setToast] = useState<string|null>(null);

  const mounted = useRef(true);
  const toastT = useRef<ReturnType<typeof setTimeout>|null>(null);
  const errT = useRef<ReturnType<typeof setTimeout>|null>(null);
  const nListeners = useRef<Map<string,(e:Event)=>void>>(new Map());

  useEffect(() => { if(typeof navigator!=='undefined'&&!navigator.bluetooth)setBtOk(false); mounted.current=true; return()=>{mounted.current=false;if(toastT.current)clearTimeout(toastT.current);if(errT.current)clearTimeout(errT.current);nListeners.current.clear();}; }, []);

  const flash = useCallback((m:string)=>{if(!mounted.current)return;setToast(m);if(toastT.current)clearTimeout(toastT.current);toastT.current=setTimeout(()=>{if(mounted.current)setToast(null);},1400);},[]);
  const setErr = useCallback((m:string|null)=>{if(!mounted.current)return;setError(m);if(errT.current)clearTimeout(errT.current);if(m)errT.current=setTimeout(()=>{if(mounted.current)setError(null);},6000);},[]);

  const onDC = useCallback((e:Event)=>{if(!mounted.current)return;const d=e.target as BluetoothDevice;setDevices(p=>p.map(x=>x.bt===d?{...x,connected:false,server:undefined}:x));flash(`${d.name||'Device'} disconnected`);},[flash]);

  // ── PROBE ──
  const probe = useCallback(async(dev:Device):Promise<Device>=>{
    if(!dev.bt?.gatt)return{...dev,type:byName(dev.name),probing:false};
    const info:DInfo={services:[],classifiedBy:'name'};let type:DType|null=null;let batt:number|undefined;let name=dev.name;const t0=performance.now();
    try{
      const s=await dev.bt.gatt.connect(); if(!s)return{...dev,type:byName(dev.name),probing:false};
      try{const g=await s.getPrimaryService(0x1800);info.services.push('Generic Access');
        try{const c=await g.getCharacteristic(0x2A01);const v=await c.readValue();const a=v.getUint16(0,true);info.appearance=a;info.appearanceLabel=appLabel(a);const t=byAppearance(a);if(t&&t!=='unknown'){type=t;info.classifiedBy='appearance';}}catch{}
        try{const c=await g.getCharacteristic(0x2A00);const v=await c.readValue();const n=new TextDecoder().decode(v.buffer).replace(/\0+$/g,'');if(n&&n.length>0)name=n;}catch{}
      }catch{}
      try{const d=await s.getPrimaryService(0x180A);info.services.push('Device Information');
        info.manufacturer=await readStr(d,0x2A29);info.model=await readStr(d,0x2A24);info.serial=await readStr(d,0x2A25);
        info.hardware=await readStr(d,0x2A27);info.firmware=await readStr(d,0x2A26);info.software=await readStr(d,0x2A28);
        if(!type&&info.manufacturer){const mt=byMfr(info.manufacturer);if(mt){type=mt;info.classifiedBy='pnp';}}
      }catch{}
      const found:number[]=[];
      for(const svc of[0x180F,0x180D,0x1812,0x1814,0x1816,0x181A,0x1809,0x1810,0x1808,0x181B,0x181D,0x180E,0x1848,0x1815]){
        try{const sv=await s.getPrimaryService(svc);found.push(svc);const sn=Object.entries(BLE.SVC).find(([,v])=>v===svc)?.[0]?.replace(/_/g,' ')||`0x${svc.toString(16)}`;info.services.push(sn);
          if(svc===0x180F){try{const bc=await sv.getCharacteristic(0x2A19);batt=(await bc.readValue()).getUint8(0);}catch{}}
        }catch{}}
      if(!type||type==='unknown'){const st=bySvcs(found);if(st){type=st;info.classifiedBy='service';}}
      if(!type||type==='unknown'){type=byName(name);if(type!=='unknown')info.classifiedBy='name';}
      if(type==='unknown'&&info.manufacturer){const mt=byName(`${info.manufacturer} ${info.model||''}`);if(mt!=='unknown'){type=mt;info.classifiedBy='name';}}
      try{s.disconnect();}catch{}
    }catch{if(!type)type=byName(dev.name);}
    return{...dev,name,type:type||'unknown',info,battery:batt,connected:false,probing:false,probeMs:Math.round(performance.now()-t0)};
  },[]);

  // ── SCAN ──
  const scan = useCallback(async()=>{
    if(!navigator.bluetooth||scanning)return; setScanning(true);setErr(null);
    try{
      const d=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:ALL_SVCS});
      if(d){if(devices.find(x=>x.id===d.id)){setScanning(false);return;}
        d.addEventListener('gattserverdisconnected',onDC);
        const raw:Device={id:d.id,name:d.name||`Device-${d.id.slice(0,6)}`,type:'unknown',connected:false,bt:d,probing:true};
        setDevices(p=>[...p,raw]);
        const probed=await probe(raw);
        if(mounted.current)setDevices(p=>p.map(x=>x.id===d.id?probed:x));
      }
    }catch(e:any){if(e.name!=='NotFoundError')setErr(e.message||'Scan failed');}
    finally{if(mounted.current)setScanning(false);}
  },[devices,scanning,probe,onDC,setErr]);

  // ── CONNECT / DISCONNECT ──
  const connect = useCallback(async(dev:Device)=>{
    if(!dev.bt?.gatt||connecting)return;setConnecting(dev.id);setErr(null);
    try{const s=await dev.bt.gatt.connect();if(!s)throw new Error('GATT failed');let b=dev.battery;
      try{const bs=await s.getPrimaryService(0x180F);const bc=await bs.getCharacteristic(0x2A19);b=(await bc.readValue()).getUint8(0);}catch{}
      setDevices(p=>p.map(d=>d.id===dev.id?{...d,connected:true,server:s,battery:b}:d));flash('Connected');
    }catch(e:any){setErr(`Connect: ${e.message}`);}finally{if(mounted.current)setConnecting(null);}
  },[connecting,flash,setErr]);

  const disconnect = useCallback((dev:Device)=>{try{dev.bt?.gatt?.connected&&dev.bt.gatt.disconnect();}catch{}
    setDevices(p=>p.map(d=>d.id===dev.id?{...d,connected:false,server:undefined}:d));
    if(gattTarget===dev.id){setGattTarget(null);setGattSvcs([]);}
  },[gattTarget]);

  // ── EXPLORE GATT ──
  const explore = useCallback(async(dev:Device)=>{
    if(!dev.bt?.gatt)return;
    if(!dev.bt.gatt.connected){try{await dev.bt.gatt.connect();}catch{setErr('Reconnect failed');return;}}
    setGattTarget(dev.id);setGattLoading(true);setGattSvcs([]);setExpandedSvc(null);
    try{
      const svcs=await dev.bt.gatt.getPrimaryServices();const result:SvcInfo[]=[];
      for(const s of svcs){const chars:CharInfo[]=[];
        try{for(const ch of await s.getCharacteristics()){let value:string|undefined,hex:string|undefined;
          if(ch.properties.read){try{const v=await ch.readValue();const d=decode(v);value=d.text;hex=d.hex;}catch{}}
          chars.push({uuid:ch.uuid,name:resolveUUID(ch.uuid),props:{r:ch.properties.read,w:ch.properties.write,wn:ch.properties.writeWithoutResponse,n:ch.properties.notify,i:ch.properties.indicate},value,hex,char:ch});
        }}catch{}
        result.push({uuid:s.uuid,name:resolveUUID(s.uuid),chars});
      }
      if(mounted.current){setGattSvcs(result);if(result.length>0)setExpandedSvc(result[0].uuid);}
    }catch(e:any){setErr(`Explore: ${e.message}`);}finally{if(mounted.current)setGattLoading(false);}
  },[setErr]);

  // ── NOTIFY ──
  const toggleNotify = useCallback(async(su:string,ch:CharInfo)=>{
    if(!ch.char)return;const key=`${su}/${ch.uuid}`;
    try{if(ch.notifying){await ch.char.stopNotifications();const l=nListeners.current.get(key);if(l){ch.char.removeEventListener('characteristicvaluechanged',l);nListeners.current.delete(key);}
      setGattSvcs(p=>p.map(s=>s.uuid===su?{...s,chars:s.chars.map(c=>c.uuid===ch.uuid?{...c,notifying:false}:c)}:s));flash('Notify OFF');
    }else{await ch.char.startNotifications();
      const listener=(e:Event)=>{if(!mounted.current)return;const t=(e.target as BluetoothRemoteGATTCharacteristic).value;if(!t)return;const d=decode(t);
        setGattSvcs(p=>p.map(s=>s.uuid===su?{...s,chars:s.chars.map(c=>c.uuid===ch.uuid?{...c,value:d.text,hex:d.hex}:c)}:s));};
      ch.char.addEventListener('characteristicvaluechanged',listener);nListeners.current.set(key,listener);
      setGattSvcs(p=>p.map(s=>s.uuid===su?{...s,chars:s.chars.map(c=>c.uuid===ch.uuid?{...c,notifying:true}:c)}:s));flash('Notify ON');
    }}catch(e:any){flash(`Fail: ${(e.message||'').slice(0,25)}`);}
  },[flash]);

  const connCount = devices.filter(d=>d.connected).length;

  // ═══ RENDER ═══
  return (
    <div className="w-full flex flex-col overflow-hidden" style={{ minWidth: 320, maxHeight: 680, background: 'linear-gradient(180deg, #0c0e14 0%, #080a10 100%)', borderRadius: 16, border: '1px solid rgba(0,230,255,0.08)', boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 0 60px rgba(0,230,255,0.03)' }}>

      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between px-5 py-4" style={{ background: 'linear-gradient(180deg, rgba(0,230,255,0.04) 0%, transparent 100%)', borderBottom: '1px solid rgba(0,230,255,0.06)' }}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(0,230,255,0.12), rgba(0,230,255,0.04))', border: '1px solid rgba(0,230,255,0.15)', boxShadow: '0 0 20px rgba(0,230,255,0.08)' }}>
              <Radio className="w-4.5 h-4.5 text-[var(--cyan-primary)]" />
            </div>
            {scanning && <motion.div className="absolute -inset-1 rounded-xl border border-[var(--cyan-primary)]/20" animate={{ scale:[1,1.3],opacity:[0.4,0] }} transition={{ duration:1.5,repeat:Infinity }} />}
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold tracking-[0.2em] text-[var(--text-primary)]">BLE SCANNER</h3>
            <div className="flex items-center gap-2 mt-0.5">
              {devices.length > 0 ? (
                <span className="text-[8px] font-mono text-[var(--text-muted)] tracking-widest">
                  {devices.length} DETECTED{connCount > 0 && <> · <span className="text-[var(--alert-green)]">{connCount} LINKED</span></>}
                </span>
              ) : (
                <span className="text-[8px] font-mono text-[var(--cyan-primary)]/50 tracking-widest">READY TO SCAN</span>
              )}
            </div>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5 transition-colors" style={{ border: '1px solid rgba(255,255,255,0.04)' }}>
            <X className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </button>
        )}
      </div>

      {/* ═══ TOAST ═══ */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl pointer-events-none"
            style={{ background:'rgba(0,230,255,0.1)',border:'1px solid rgba(0,230,255,0.15)',backdropFilter:'blur(12px)',boxShadow:'0 4px 20px rgba(0,230,255,0.1)' }}>
            <span className="text-[9px] font-mono font-bold text-[var(--cyan-primary)] tracking-wider">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ SCROLLABLE BODY ═══ */}
      <div className="flex-1 overflow-y-auto styled-scrollbar">

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden">
              <div className="mx-4 mt-3 p-2.5 rounded-xl flex items-center gap-2" style={{ background:'rgba(255,61,61,0.06)',border:'1px solid rgba(255,61,61,0.12)' }}>
                <AlertTriangle className="w-3.5 h-3.5 text-[#FF3D3D] shrink-0" />
                <span className="text-[8px] font-mono text-[#FF3D3D] flex-1">{error}</span>
                <button onClick={()=>setError(null)} className="p-0.5 rounded hover:bg-white/5"><X className="w-2.5 h-2.5 text-[#FF3D3D]/50" /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!btOk && (
          <div className="mx-4 mt-3 p-4 rounded-xl flex items-center gap-3" style={{ background:'rgba(255,61,61,0.04)',border:'1px solid rgba(255,61,61,0.1)' }}>
            <WifiOff className="w-5 h-5 text-[#FF3D3D] shrink-0" />
            <div><p className="text-[9px] font-mono text-[#FF3D3D] font-bold tracking-wider">BLUETOOTH UNAVAILABLE</p><p className="text-[7px] font-mono text-[#FF3D3D]/60 mt-0.5">Requires Chrome or Edge on desktop</p></div>
          </div>
        )}

        {/* ═══ SCAN AREA ═══ */}
        <div className="px-4 pt-4 pb-3 flex flex-col items-center">
          <RadarPulse active={scanning} />
          <motion.button whileTap={{scale:0.96}} whileHover={{scale:1.02}} onClick={scan} disabled={scanning||!btOk}
            className="w-full mt-4 py-3.5 rounded-xl flex items-center justify-center gap-2.5 transition-all disabled:opacity-30 font-mono"
            style={{ background: scanning ? 'rgba(0,230,255,0.05)' : 'linear-gradient(135deg, rgba(0,230,255,0.1) 0%, rgba(0,230,255,0.04) 100%)', border:'1px solid rgba(0,230,255,0.12)', boxShadow: scanning ? '0 0 30px rgba(0,230,255,0.05)' : '0 2px 20px rgba(0,230,255,0.05)' }}>
            {scanning ? <BluetoothSearching className="w-4 h-4 text-[var(--cyan-primary)] animate-pulse" /> : <Scan className="w-4 h-4 text-[var(--cyan-primary)]" />}
            <span className="text-[10px] font-bold tracking-[0.2em] text-[var(--cyan-primary)]">{scanning ? 'SCANNING...' : 'DETECT NEARBY DEVICES'}</span>
          </motion.button>
        </div>

        {/* ═══ DEVICE LIST ═══ */}
        {devices.length > 0 && (
          <div className="px-4 pb-4 space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-[8px] font-mono text-[var(--text-muted)] tracking-[0.2em] uppercase">{devices.length} Device{devices.length!==1?'s':''}</span>
              <div className="flex items-center gap-1"><Signal className="w-2.5 h-2.5 text-[var(--text-muted)]" /><span className="text-[7px] font-mono text-[var(--text-muted)] tracking-widest">NEARBY</span></div>
            </div>

            {devices.map(dev => {
              const m = META[dev.type];
              const Icon = m.icon;
              const isConn = connecting === dev.id;
              const isGatt = gattTarget === dev.id;
              // Signal strength: connected = 4, has info = 3, probed = 2, unknown = 1
              const sig = dev.connected ? 4 : dev.info?.manufacturer ? 3 : dev.info ? 2 : 1;

              return (
                <motion.div key={dev.id} initial={{opacity:0,y:12,scale:0.97}} animate={{opacity:1,y:0,scale:1}} transition={{type:'spring',stiffness:300,damping:25}} layout>
                  <div className="rounded-2xl overflow-hidden transition-all" style={{
                    background: dev.connected
                      ? `linear-gradient(135deg, ${m.color}08 0%, ${m.color}03 100%)`
                      : 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)',
                    border: `1px solid ${dev.connected ? m.color+'20' : 'rgba(255,255,255,0.04)'}`,
                    boxShadow: dev.connected ? m.glow.replace('0.3','0.08') : 'none',
                  }}>

                    {/* ── CARD ── */}
                    <div className="p-4">
                      <div className="flex items-start gap-3.5">

                        {/* Icon block */}
                        <div className="relative">
                          <motion.div
                            animate={dev.probing ? { rotate: [0, 360] } : {}}
                            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                            className="w-12 h-12 rounded-2xl flex items-center justify-center"
                            style={{ background: `linear-gradient(135deg, ${m.color}15, ${m.color}05)`, border: `1px solid ${m.color}20`, boxShadow: dev.connected ? m.glow.replace('0.3','0.15') : 'none' }}>
                            {dev.probing || isConn ? (
                              <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: m.color, borderTopColor: 'transparent' }} />
                            ) : (
                              <Icon className="w-6 h-6" style={{ color: m.color }} />
                            )}
                          </motion.div>
                          {dev.connected && (
                            <motion.div initial={{scale:0}} animate={{scale:1}} className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ background: '#0c0e14', border: '2px solid #0c0e14' }}>
                              <div className="w-2 h-2 rounded-full bg-[var(--alert-green)] animate-pulse" />
                            </motion.div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-mono font-bold text-[var(--text-primary)] truncate">{dev.name}</span>
                            <SignalBars strength={sig} color={m.color} />
                          </div>

                          {dev.probing ? (
                            <div className="flex items-center gap-2">
                              <motion.div className="h-1 rounded-full flex-1" style={{ background: `${m.color}10` }}>
                                <motion.div className="h-full rounded-full" style={{ background: m.color }}
                                  animate={{ width: ['0%', '60%', '90%', '100%'] }} transition={{ duration: 3, ease: 'easeOut' }} />
                              </motion.div>
                              <span className="text-[7px] font-mono tracking-wider shrink-0" style={{ color: m.color }}>PROBING</span>
                            </div>
                          ) : (
                            <>
                              {/* Type + Classification row */}
                              <div className="flex items-center gap-1.5 flex-wrap mb-2">
                                <span className="text-[8px] font-mono font-bold px-2 py-0.5 rounded-lg tracking-wider" style={{ background: `${m.color}12`, color: m.color, border: `1px solid ${m.color}15` }}>
                                  {m.emoji} {m.label.toUpperCase()}
                                </span>
                                {dev.info?.classifiedBy && (
                                  <span className="text-[6px] font-mono px-1.5 py-0.5 rounded-md bg-white/4 text-[var(--text-muted)] tracking-[0.15em] uppercase">{dev.info.classifiedBy}</span>
                                )}
                                {dev.battery != null && (
                                  <span className="flex items-center gap-0.5 text-[7px] font-mono" style={{ color: dev.battery > 50 ? 'var(--alert-green)' : dev.battery > 20 ? '#FFB800' : '#FF3D3D' }}>
                                    <BatteryMedium className="w-3 h-3" />{dev.battery}%
                                  </span>
                                )}
                                {dev.probeMs != null && (
                                  <span className="flex items-center gap-0.5 text-[6px] font-mono text-[var(--text-muted)]"><Clock className="w-2 h-2" />{dev.probeMs}ms</span>
                                )}
                              </div>

                              {/* Manufacturer / Model row */}
                              {dev.info && (dev.info.manufacturer || dev.info.model || dev.info.firmware) && (
                                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                                  {dev.info.manufacturer && (
                                    <span className="text-[7px] font-mono px-2 py-0.5 rounded-lg bg-white/3 text-[var(--text-secondary)] tracking-wider">{dev.info.manufacturer}</span>
                                  )}
                                  {dev.info.model && (
                                    <span className="text-[7px] font-mono px-2 py-0.5 rounded-lg bg-white/3 text-[var(--text-secondary)] tracking-wider">{dev.info.model}</span>
                                  )}
                                  {dev.info.firmware && (
                                    <span className="text-[6px] font-mono px-1.5 py-0.5 rounded-lg bg-white/3 text-[var(--text-muted)] tracking-wider">v{dev.info.firmware}</span>
                                  )}
                                </div>
                              )}

                              {/* Services */}
                              {dev.info && dev.info.services.length > 0 && (
                                <div className="flex items-center gap-1 flex-wrap">
                                  <Server className="w-2.5 h-2.5 text-[var(--text-muted)] shrink-0 mr-0.5" />
                                  {dev.info.services.slice(0, 5).map((s, i) => (
                                    <span key={i} className="text-[6px] font-mono px-1.5 py-0.5 rounded-md tracking-wider" style={{ background: `${m.color}06`, color: `${m.color}80` }}>{s}</span>
                                  ))}
                                  {dev.info.services.length > 5 && <span className="text-[6px] font-mono text-[var(--text-muted)]">+{dev.info.services.length-5}</span>}
                                </div>
                              )}

                              {/* Appearance */}
                              {dev.info?.appearance != null && (
                                <div className="mt-1.5 flex items-center gap-1.5">
                                  <Shield className="w-2.5 h-2.5 text-[var(--text-muted)]" />
                                  <span className="text-[6px] font-mono text-[var(--text-muted)] tracking-wider">{dev.info.appearanceLabel} · 0x{dev.info.appearance.toString(16).padStart(4,'0')}</span>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      {!dev.probing && (
                        <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                          {dev.connected ? (
                            <>
                              <motion.button whileTap={{scale:0.95}} onClick={()=>explore(dev)}
                                className="flex-1 py-2 rounded-xl text-[8px] font-mono font-bold tracking-[0.15em] flex items-center justify-center gap-1.5"
                                style={{ background:`${m.color}08`,color:m.color,border:`1px solid ${m.color}12` }}>
                                <Layers className="w-3 h-3" />EXPLORE GATT
                              </motion.button>
                              <motion.button whileTap={{scale:0.95}} onClick={()=>disconnect(dev)}
                                className="py-2 px-3 rounded-xl text-[8px] font-mono font-bold tracking-[0.15em] flex items-center gap-1.5"
                                style={{ background:'rgba(255,61,61,0.06)',color:'#FF6B6B',border:'1px solid rgba(255,61,61,0.08)' }}>
                                <Unplug className="w-3 h-3" />DROP
                              </motion.button>
                            </>
                          ) : (
                            <motion.button whileTap={{scale:0.95}} onClick={()=>connect(dev)} disabled={!!connecting}
                              className="flex-1 py-2.5 rounded-xl text-[9px] font-mono font-bold tracking-[0.15em] flex items-center justify-center gap-2 disabled:opacity-30"
                              style={{ background:`linear-gradient(135deg, ${m.color}10, ${m.color}05)`,color:m.color,border:`1px solid ${m.color}15` }}>
                              <Zap className="w-3.5 h-3.5" />{isConn ? 'PAIRING...' : 'CONNECT'}
                            </motion.button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ── GATT EXPLORER (inline) ── */}
                    <AnimatePresence>
                      {isGatt && (
                        <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden">
                          <div className="px-4 pb-4 pt-1" style={{ borderTop:`1px solid ${m.color}08`,background:`${m.color}02` }}>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <Terminal className="w-3.5 h-3.5" style={{ color: m.color }} />
                                <span className="text-[8px] font-mono font-bold tracking-[0.15em]" style={{ color: m.color }}>GATT SERVICES</span>
                              </div>
                              <button onClick={()=>{setGattTarget(null);setGattSvcs([]);}} className="p-1 rounded-lg hover:bg-white/5"><X className="w-3 h-3 text-[var(--text-muted)]" /></button>
                            </div>

                            {gattLoading ? (
                              <div className="flex flex-col items-center py-6 gap-2">
                                <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: m.color, borderTopColor: 'transparent' }} />
                                <span className="text-[7px] font-mono tracking-wider animate-pulse" style={{ color: m.color }}>ENUMERATING...</span>
                              </div>
                            ) : gattSvcs.length === 0 ? (
                              <div className="text-center py-4"><p className="text-[7px] font-mono text-[var(--text-muted)]">No services accessible</p></div>
                            ) : (
                              <div className="space-y-1.5">
                                {gattSvcs.map(svc => (
                                  <div key={svc.uuid}>
                                    <button onClick={()=>setExpandedSvc(expandedSvc===svc.uuid?null:svc.uuid)}
                                      className="w-full p-2.5 rounded-xl flex items-center gap-2 transition-all text-left hover:bg-white/3"
                                      style={{ background: expandedSvc === svc.uuid ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                                      <Bluetooth className="w-3 h-3 shrink-0" style={{ color: m.color }} />
                                      <div className="flex-1 min-w-0">
                                        <div className="text-[8px] font-mono font-bold text-[var(--text-primary)] truncate">{svc.name}</div>
                                        <div className="text-[6px] font-mono text-[var(--text-muted)] truncate">{svc.uuid}</div>
                                      </div>
                                      <span className="text-[7px] font-mono px-1.5 py-0.5 rounded-md" style={{ background: `${m.color}08`, color: `${m.color}90` }}>{svc.chars.length}</span>
                                      <ChevronRight className={`w-3 h-3 text-[var(--text-muted)] transition-transform ${expandedSvc===svc.uuid?'rotate-90':''}`} />
                                    </button>
                                    <AnimatePresence>
                                      {expandedSvc === svc.uuid && (
                                        <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden">
                                          <div className="pl-4 pr-1 py-1 space-y-1.5">
                                            {svc.chars.map(ch => {
                                              const ck=`${svc.uuid}/${ch.uuid}`; const flags=[ch.props.r&&'R',ch.props.w&&'W',ch.props.wn&&'Wn',ch.props.n&&'N',ch.props.i&&'I'].filter(Boolean).join('·');
                                              const wVal=writeInput[ck]||''; const wOk=!wVal||validHex(wVal);
                                              return (
                                                <div key={ch.uuid} className="p-2.5 rounded-xl" style={{ background:'rgba(0,0,0,0.25)',borderLeft:`2px solid ${m.color}15` }}>
                                                  <div className="flex items-center gap-1.5 mb-1"><span className="text-[7px] font-mono font-bold text-[var(--text-primary)] truncate flex-1">{ch.name}</span><span className="text-[6px] font-mono px-1.5 py-0.5 rounded-md tracking-wider" style={{background:`${m.color}08`,color:`${m.color}90`}}>{flags}</span></div>
                                                  <div className="text-[5px] font-mono text-[var(--text-muted)] truncate mb-2">{ch.uuid}</div>
                                                  {ch.value && (
                                                    <div className="flex items-center gap-1 mb-2">
                                                      <div className="flex-1 rounded-lg px-2 py-1.5 min-w-0" style={{background:'rgba(0,0,0,0.3)'}}>
                                                        <div className="text-[8px] font-mono text-[var(--alert-green)] truncate">{ch.value}</div>
                                                        {ch.hex && ch.hex !== ch.value && <div className="text-[6px] font-mono text-[var(--text-muted)] truncate mt-0.5">{ch.hex}</div>}
                                                      </div>
                                                      <motion.button whileTap={{scale:0.9}} onClick={()=>{navigator.clipboard?.writeText(ch.value||'');setCopied(ck);setTimeout(()=>setCopied(null),1500);}} className="p-1.5 rounded-lg hover:bg-white/5 shrink-0">
                                                        {copied===ck?<Check className="w-2.5 h-2.5 text-[var(--alert-green)]"/>:<Copy className="w-2.5 h-2.5 text-[var(--text-muted)]"/>}
                                                      </motion.button>
                                                    </div>
                                                  )}
                                                  <div className="flex items-center gap-1 flex-wrap">
                                                    {ch.props.r && <motion.button whileTap={{scale:0.9}} onClick={async()=>{if(!ch.char)return;try{const v=await ch.char.readValue();const d=decode(v);setGattSvcs(p=>p.map(s=>s.uuid===svc.uuid?{...s,chars:s.chars.map(c=>c.uuid===ch.uuid?{...c,value:d.text,hex:d.hex}:c)}:s));flash(`Read OK`);}catch(e:any){flash(`Fail`);}}} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[6px] font-mono tracking-wider" style={{background:`${m.color}06`,color:m.color}}><Eye className="w-2.5 h-2.5"/>READ</motion.button>}
                                                    {ch.props.n && <motion.button whileTap={{scale:0.9}} onClick={()=>toggleNotify(svc.uuid,ch)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[6px] font-mono tracking-wider" style={{background:ch.notifying?'rgba(212,175,55,0.08)':'rgba(255,255,255,0.03)',color:ch.notifying?'var(--gold-primary)':'var(--text-muted)'}}>{ch.notifying?<Bell className="w-2.5 h-2.5"/>:<BellOff className="w-2.5 h-2.5"/>}{ch.notifying?'LIVE':'SUB'}</motion.button>}
                                                    {(ch.props.w||ch.props.wn) && (
                                                      <div className="flex items-center gap-0.5 flex-1">
                                                        <input type="text" placeholder="FF 01 A3" value={wVal} onChange={e=>setWriteInput(p=>({...p,[ck]:e.target.value}))} className="flex-1 rounded-lg px-2 py-1 text-[7px] font-mono text-[var(--text-primary)] outline-none min-w-0" style={{background:'rgba(0,0,0,0.3)',border:`1px solid ${wOk?'transparent':'rgba(255,61,61,0.3)'}`}} aria-label="Hex" />
                                                        <motion.button whileTap={{scale:0.9}} onClick={async()=>{if(!ch.char||!wVal||!validHex(wVal))return;try{await writeSafe(ch.char,parseHex(wVal),ch.props.w);flash('Sent');setWriteInput(p=>({...p,[ck]:''}));}catch(e:any){flash('Fail');}}} disabled={!wVal||!wOk} className="p-1 rounded-lg shrink-0 disabled:opacity-30" style={{background:'rgba(212,175,55,0.06)',color:'var(--gold-primary)'}}><Send className="w-2.5 h-2.5"/></motion.button>
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
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* ═══ EMPTY STATE ═══ */}
        {devices.length === 0 && !scanning && btOk && (
          <div className="flex flex-col items-center justify-center py-8 px-6">
            <p className="text-[8px] font-mono text-[var(--text-muted)]/50 text-center tracking-wider leading-loose">
              Tap <span className="text-[var(--cyan-primary)]">DETECT</span> to discover nearby Bluetooth devices.<br/>
              Each device is auto-probed via GATT for deep identification.
            </p>
          </div>
        )}
      </div>

      {/* ═══ FOOTER ═══ */}
      <div className="px-5 py-2.5 flex items-center justify-between" style={{ background:'rgba(0,0,0,0.3)',borderTop:'1px solid rgba(255,255,255,0.03)' }}>
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${btOk?'bg-[var(--alert-green)]':'bg-[#FF3D3D]'}`} />
          <span className="text-[7px] font-mono text-[var(--text-muted)] tracking-[0.15em]">{btOk?'WEB BLUETOOTH ACTIVE':'UNAVAILABLE'}</span>
        </div>
        <span className="text-[6px] font-mono text-[var(--text-muted)]/30 tracking-widest">OSIRIS · BLE</span>
      </div>
    </div>
  );
}
