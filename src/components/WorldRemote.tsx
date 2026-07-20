'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bluetooth, BluetoothSearching, Tv, Speaker, X, WifiOff,
  Gamepad2, Lightbulb, Watch, Headphones, Mouse, Keyboard, Smartphone,
  BatteryMedium, Fan, Eye, Send, Bell, BellOff, ChevronRight, Copy, Check,
  AlertTriangle, Radio, Scan, Zap, Unplug, Terminal,
  Shield, Clock, Server, Layers, ChevronDown,
  Maximize2, Minimize2, Trash2, Pause, Play,
  Wifi, MapPin, Camera, Mic, Monitor, Cpu, HardDrive, Usb,
  Compass, Activity, Sun, Globe, Fingerprint, Lock, ScreenShare, Volume2,
  Navigation, Gauge, MemoryStick, Crosshair, ScanLine
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   BLE CONSTANTS (kept for BLE tab)
   ═══════════════════════════════════════════════════════════════ */
const BLE_SVC: Record<string,number> = { GA:0x1800,GATT:0x1801,DI:0x180A,BAT:0x180F,HR:0x180D,BP:0x1810,HT:0x1809,HID:0x1812,RS:0x1814,CS:0x1816,CP:0x1818,ENV:0x181A,BC:0x181B,UD:0x181C,WS:0x181D,GL:0x1808,TX:0x1804,LL:0x1803,IA:0x1802,CT:0x1805,PAS:0x180E,AN:0x1811,AIO:0x1815,MC:0x1848 };
const ALL_SVCS = Object.values(BLE_SVC);
const UUID_N: Record<number,string> = {0x1800:'Generic Access',0x1801:'Generic Attribute',0x180A:'Device Information',0x180F:'Battery',0x180D:'Heart Rate',0x1810:'Blood Pressure',0x1809:'Health Thermometer',0x1812:'HID',0x1814:'Running Speed',0x1816:'Cycling Speed',0x1818:'Cycling Power',0x181A:'Environmental',0x181B:'Body Composition',0x181C:'User Data',0x181D:'Weight Scale',0x1802:'Immediate Alert',0x1803:'Link Loss',0x1804:'TX Power',0x1805:'Current Time',0x180E:'Phone Alert',0x1811:'Alert Notification',0x1815:'Automation IO',0x1848:'Media Control',0x2A00:'Device Name',0x2A01:'Appearance',0x2A19:'Battery Level',0x2A24:'Model Number',0x2A25:'Serial Number',0x2A26:'Firmware Rev',0x2A27:'Hardware Rev',0x2A28:'Software Rev',0x2A29:'Manufacturer',0x2A23:'System ID',0x2A50:'PnP ID',0x2A37:'Heart Rate Measurement',0x2A6E:'Temperature',0x2A6F:'Humidity',0x2A6D:'Pressure'};

/* ═══════════════════════════════════════════════════════════════
   SHARED TYPES
   ═══════════════════════════════════════════════════════════════ */
type DType = 'tv'|'speaker'|'ac'|'light'|'wearable'|'headphones'|'gamepad'|'keyboard'|'mouse'|'phone'|'unknown';
type PktOp = 'SCAN'|'PROBE'|'READ'|'WRITE'|'NOTIFY'|'CONNECT'|'DISCONNECT'|'ENUM'|'ERROR'|'SUB'|'INFO'|'RECON'|'GPS'|'SENSOR'|'MEDIA'|'NET'|'USB'|'HID'|'SERIAL'|'NFC'|'MIDI'|'SYSTEM';
interface Pkt { id:number; ts:number; op:PktOp; src:string; msg:string; hex?:string; len?:number; }
interface DInfo { manufacturer?:string; model?:string; serial?:string; hardware?:string; firmware?:string; software?:string; appearance?:number; appearanceLabel?:string; services:string[]; classifiedBy:string; }
interface Dev { id:string; name:string; type:DType; connected:boolean; battery?:number; info?:DInfo; bt?:BluetoothDevice; srv?:BluetoothRemoteGATTServer; probing?:boolean; probeMs?:number; }
interface Svc { uuid:string; name:string; chars:Chr[]; }
interface Chr { uuid:string; name:string; value?:string; hex?:string; notifying?:boolean; char?:BluetoothRemoteGATTCharacteristic; p:{r:boolean;w:boolean;wn:boolean;n:boolean;i:boolean}; }

// Recon data
interface ReconResult { category:string; icon:typeof Bluetooth; color:string; items:{key:string;val:string;raw?:string}[]; ts:number; status:'ok'|'denied'|'unavailable'|'error'; ms:number; }

/* ═══════════════════════════════════════════════════════════════
   PURE HELPERS
   ═══════════════════════════════════════════════════════════════ */
function byApp(a:number):DType|null{const m:Record<number,DType>={0x0040:'phone',0x00C0:'wearable',0x00C1:'wearable',0x00C2:'wearable',0x0140:'tv',0x0300:'ac',0x03C1:'keyboard',0x03C2:'mouse',0x03C4:'gamepad',0x0840:'speaker',0x0841:'speaker',0x0842:'headphones',0x0843:'headphones'};if(m[a])return m[a];const c=a&0xFFC0;if(c>=0x40&&c<=0x7F)return'phone';if(c>=0xC0&&c<=0xFF)return'wearable';if(c>=0x140&&c<=0x17F)return'tv';if(c>=0x3C0&&c<=0x3FF){const s=a&0x3F;return s===1?'keyboard':s===2?'mouse':s===4?'gamepad':null;}if(c>=0x840&&c<=0x87F)return'speaker';return null;}
function bySvcs(u:number[]):DType|null{const h=(x:number)=>u.includes(x);if(h(0x1848))return'speaker';if(h(0x1812))return'gamepad';if(h(0x180D)||h(0x1814)||h(0x1816)||h(0x1818))return'wearable';if(h(0x181A)||h(0x1809))return'ac';if(h(0x180E))return'phone';return null;}
function byName(n:string):DType{const l=n.toLowerCase();if(/\btv\b|bravia|roku|chromecast|fire.?stick|apple.?tv|shield|vizio/i.test(l))return'tv';if(/speaker|soundbar|bose|jbl|sonos|marshall|echo|homepod|soundcore/i.test(l))return'speaker';if(/\bac\b|thermostat|nest|ecobee/i.test(l))return'ac';if(/bulb|light|hue|lifx|nanoleaf|govee/i.test(l))return'light';if(/watch|band|fitbit|garmin|amazfit|polar/i.test(l))return'wearable';if(/headphone|airpod|buds|earbud|wh-1000|wf-1000|qc|jabra|galaxy.?buds/i.test(l))return'headphones';if(/gamepad|controller|xbox|playstation|dualsense|joy.?con/i.test(l))return'gamepad';if(/keyboard|keychron/i.test(l))return'keyboard';if(/mouse|mx.?master|trackpad/i.test(l))return'mouse';if(/phone|iphone|galaxy.?[saz]|pixel/i.test(l))return'phone';return'unknown';}
function byMfr(m:string):DType|null{if(/bose|jbl|sonos|harman|marshall/i.test(m))return'speaker';if(/samsung|lg|sony|vizio/i.test(m))return'tv';if(/logitech|corsair|razer/i.test(m))return'mouse';if(/fitbit|garmin|polar/i.test(m))return'wearable';return null;}
function rUUID(u:string):string{const m=u.match(/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/i);if(m)return UUID_N[parseInt(m[1],16)]||`0x${m[1].toUpperCase()}`;return u.length>8?u.slice(0,8)+'…':u;}
async function rStr(s:BluetoothRemoteGATTService,u:number){try{const c=await s.getCharacteristic(u);const v=await c.readValue();return new TextDecoder().decode(v.buffer).replace(/\0+$/g,'')||undefined;}catch{return undefined;}}
function dec(dv:DataView){const b=new Uint8Array(dv.buffer);const hex=Array.from(b).map(x=>x.toString(16).padStart(2,'0')).join(' ');try{const t=new TextDecoder().decode(dv.buffer);if(/^[\x20-\x7E\n\r\t]+$/.test(t))return{text:t,hex};}catch{}return{text:hex,hex};}
function vHex(s:string){const h=s.replace(/[\s,:-]/g,'');return h.length>0&&h.length%2===0&&/^[0-9a-fA-F]+$/.test(h);}
function pHex(s:string){const h=s.replace(/[\s,:-]/g,'');return new Uint8Array((h.match(/.{1,2}/g)||[]).map(b=>parseInt(b,16)));}
async function wSafe(ch:BluetoothRemoteGATTCharacteristic,d:Uint8Array,resp:boolean){if(resp&&typeof ch.writeValueWithResponse==='function')await ch.writeValueWithResponse(d);else if(!resp&&typeof ch.writeValueWithoutResponse==='function')await ch.writeValueWithoutResponse(d);else await(ch as any).writeValue(d);}
function appLbl(a:number){const c=(a>>6)&0x3FF;const m:Record<number,string>={0:'Unknown',1:'Phone',2:'Computer',3:'Watch',5:'Display',6:'Remote',10:'Media Player',15:'HID',48:'Audio Sink'};return m[c]||`0x${a.toString(16)}`;}
function fts(t:number){const d=new Date(t);return d.toLocaleTimeString('en-US',{hour12:false})+'.'+d.getMilliseconds().toString().padStart(3,'0');}
function toHex(s:string){return Array.from(new TextEncoder().encode(s)).map(x=>x.toString(16).padStart(2,'0')).join(' ');}

const META: Record<DType,{icon:typeof Bluetooth;color:string;label:string}> = {
  tv:{icon:Tv,color:'#00E6FF',label:'Television'},speaker:{icon:Speaker,color:'#FFB800',label:'Speaker'},
  ac:{icon:Fan,color:'#00FF88',label:'Climate'},light:{icon:Lightbulb,color:'#FFD700',label:'Light'},
  wearable:{icon:Watch,color:'#FF6BCD',label:'Wearable'},headphones:{icon:Headphones,color:'#B388FF',label:'Headphones'},
  gamepad:{icon:Gamepad2,color:'#FF6B6B',label:'Controller'},keyboard:{icon:Keyboard,color:'#64FFDA',label:'Keyboard'},
  mouse:{icon:Mouse,color:'#80DEEA',label:'Mouse'},phone:{icon:Smartphone,color:'#FFB74D',label:'Phone'},
  unknown:{icon:Bluetooth,color:'#90A4AE',label:'Device'},
};
const OP_CLR: Record<string,string> = {SCAN:'#00E6FF',PROBE:'#B388FF',READ:'#64FFDA',WRITE:'#FFB800',NOTIFY:'#00FF88',CONNECT:'#00E6FF',DISCONNECT:'#FF6B6B',ENUM:'#80DEEA',ERROR:'#FF3D3D',SUB:'#FF6BCD',INFO:'#90A4AE',RECON:'#00E6FF',GPS:'#FFB74D',SENSOR:'#FF6BCD',MEDIA:'#B388FF',NET:'#00FF88',USB:'#FFB800',HID:'#FF6B6B',SERIAL:'#64FFDA',NFC:'#80DEEA',MIDI:'#FFD700',SYSTEM:'#90A4AE'};

/* ═══════════════════════════════════════════════════════════════
   RECON ENGINE — probes every browser hardware API
   ═══════════════════════════════════════════════════════════════ */
async function probeSystem(log:(op:PktOp,src:string,msg:string,hex?:string,len?:number)=>void): Promise<ReconResult> {
  const t0=performance.now();const items:{key:string;val:string;raw?:string}[]=[];
  log('RECON','SYSTEM','Fingerprinting browser environment...');
  try {
    const n=navigator as any;
    items.push({key:'User Agent',val:n.userAgent||'?'});log('SYSTEM','SYSTEM',`UA: ${(n.userAgent||'').slice(0,80)}`);
    items.push({key:'Platform',val:n.platform||'?'});
    items.push({key:'Vendor',val:n.vendor||'?'});
    items.push({key:'Language',val:n.language||'?'});
    items.push({key:'Languages',val:(n.languages||[]).join(', ')});
    items.push({key:'CPU Cores',val:String(n.hardwareConcurrency||'?')});log('SYSTEM','SYSTEM',`CPU Cores: ${n.hardwareConcurrency}`);
    items.push({key:'Device Memory',val:n.deviceMemory?`${n.deviceMemory} GB`:'Unavailable'});
    items.push({key:'Max Touch Points',val:String(n.maxTouchPoints||0)});
    items.push({key:'Online',val:String(n.onLine)});
    items.push({key:'Cookies Enabled',val:String(n.cookieEnabled)});
    items.push({key:'PDF Viewer',val:String(n.pdfViewerEnabled||false)});
    items.push({key:'Do Not Track',val:n.doNotTrack||'unset'});
    // Timezone
    const tz=Intl.DateTimeFormat().resolvedOptions();
    items.push({key:'Timezone',val:tz.timeZone});
    items.push({key:'Locale',val:tz.locale});
    log('SYSTEM','SYSTEM',`Timezone: ${tz.timeZone}, Locale: ${tz.locale}`);
    // Screen
    items.push({key:'Screen',val:`${screen.width}×${screen.height} @ ${window.devicePixelRatio}x`});
    items.push({key:'Color Depth',val:`${screen.colorDepth}-bit`});
    items.push({key:'Avail Screen',val:`${screen.availWidth}×${screen.availHeight}`});
    items.push({key:'Orientation',val:(screen as any).orientation?.type||'?'});
    items.push({key:'Window Inner',val:`${window.innerWidth}×${window.innerHeight}`});
    log('SYSTEM','SYSTEM',`Screen: ${screen.width}×${screen.height} @ ${window.devicePixelRatio}x DPR`);
    // Storage
    if(n.storage?.estimate){const e=await n.storage.estimate();items.push({key:'Storage Quota',val:`${((e.quota||0)/1073741824).toFixed(1)} GB`});items.push({key:'Storage Used',val:`${((e.usage||0)/1048576).toFixed(1)} MB`});log('SYSTEM','SYSTEM',`Storage: ${((e.usage||0)/1048576).toFixed(1)}MB / ${((e.quota||0)/1073741824).toFixed(1)}GB`);}
    return{category:'System',icon:Monitor,color:'#90A4AE',items,ts:Date.now(),status:'ok',ms:Math.round(performance.now()-t0)};
  }catch(e:any){log('ERROR','SYSTEM',e.message);return{category:'System',icon:Monitor,color:'#90A4AE',items,ts:Date.now(),status:'error',ms:Math.round(performance.now()-t0)};}
}

async function probeGPU(log:(op:PktOp,src:string,msg:string)=>void): Promise<ReconResult> {
  const t0=performance.now();const items:{key:string;val:string}[]=[];
  log('RECON','GPU','Probing GPU via WebGL...');
  try {
    const c=document.createElement('canvas');const gl=c.getContext('webgl2')||c.getContext('webgl');
    if(!gl){log('ERROR','GPU','WebGL unavailable');return{category:'GPU',icon:Cpu,color:'#B388FF',items:[{key:'Status',val:'Unavailable'}],ts:Date.now(),status:'unavailable',ms:Math.round(performance.now()-t0)};}
    const ext=gl.getExtension('WEBGL_debug_renderer_info');
    const vendor=ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):'?';
    const renderer=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'?';
    items.push({key:'Renderer',val:renderer});log('RECON','GPU',`Renderer: ${renderer}`);
    items.push({key:'Vendor',val:vendor});log('RECON','GPU',`Vendor: ${vendor}`);
    items.push({key:'WebGL Version',val:gl instanceof WebGL2RenderingContext?'WebGL 2.0':'WebGL 1.0'});
    items.push({key:'Max Texture Size',val:String(gl.getParameter(gl.MAX_TEXTURE_SIZE))});
    items.push({key:'Max Viewport',val:gl.getParameter(gl.MAX_VIEWPORT_DIMS)?.join('×')||'?'});
    items.push({key:'Max Vertex Attribs',val:String(gl.getParameter(gl.MAX_VERTEX_ATTRIBS))});
    items.push({key:'MSAA Samples',val:String(gl.getParameter(gl.MAX_SAMPLES||0))});
    items.push({key:'Extensions',val:String(gl.getSupportedExtensions()?.length||0)});
    const glExts=gl.getSupportedExtensions()||[];
    items.push({key:'Float Textures',val:glExts.includes('OES_texture_float')?'Yes':'No'});
    items.push({key:'Anisotropic',val:glExts.some(e=>e.includes('anisotropic'))?'Yes':'No'});
    return{category:'GPU',icon:Cpu,color:'#B388FF',items,ts:Date.now(),status:'ok',ms:Math.round(performance.now()-t0)};
  }catch(e:any){log('ERROR','GPU',e.message);return{category:'GPU',icon:Cpu,color:'#B388FF',items,ts:Date.now(),status:'error',ms:Math.round(performance.now()-t0)};}
}

async function probeNetwork(log:(op:PktOp,src:string,msg:string)=>void): Promise<ReconResult> {
  const t0=performance.now();const items:{key:string;val:string}[]=[];
  log('RECON','NETWORK','Probing network interfaces...');
  try {
    const conn=(navigator as any).connection;
    if(conn){items.push({key:'Type',val:conn.effectiveType||'?'});items.push({key:'Downlink',val:`${conn.downlink||'?'} Mbps`});items.push({key:'RTT',val:`${conn.rtt||'?'} ms`});items.push({key:'Save Data',val:String(conn.saveData||false)});log('NET','NETWORK',`${conn.effectiveType} — ${conn.downlink}Mbps, ${conn.rtt}ms RTT`);}
    items.push({key:'Online',val:String(navigator.onLine)});
    // WebRTC local IPs
    try {
      const ips = await new Promise<string[]>((resolve) => {
        const found: string[] = []; const pc = new RTCPeerConnection({iceServers:[]});
        pc.createDataChannel('');
        pc.createOffer().then(o=>pc.setLocalDescription(o)).catch(()=>{});
        const to = setTimeout(()=>{pc.close();resolve(found);},3000);
        pc.onicecandidate = e => {
          if(!e.candidate) return;
          const m=e.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
          if(m&&!found.includes(m[1])){found.push(m[1]);log('NET','NETWORK',`Local IP discovered: ${m[1]}`);}
          const m6=e.candidate.candidate.match(/([0-9a-f:]{6,})/i);
          if(m6&&!m&&!found.includes(m6[1])){found.push(m6[1]);log('NET','NETWORK',`IPv6: ${m6[1]}`);}
        };
        setTimeout(()=>{clearTimeout(to);pc.close();resolve(found);},2500);
      });
      ips.forEach((ip,i)=>items.push({key:`Local IP ${i+1}`,val:ip}));
    }catch{log('INFO','NETWORK','WebRTC IP detection blocked');}
    return{category:'Network',icon:Wifi,color:'#00FF88',items,ts:Date.now(),status:'ok',ms:Math.round(performance.now()-t0)};
  }catch(e:any){log('ERROR','NETWORK',e.message);return{category:'Network',icon:Wifi,color:'#00FF88',items,ts:Date.now(),status:'error',ms:Math.round(performance.now()-t0)};}
}

async function probeBattery(log:(op:PktOp,src:string,msg:string)=>void): Promise<ReconResult> {
  const t0=performance.now();const items:{key:string;val:string}[]=[];
  log('RECON','BATTERY','Reading battery status...');
  try {
    const bat=await(navigator as any).getBattery?.();
    if(!bat){items.push({key:'Status',val:'API unavailable'});return{category:'Battery',icon:BatteryMedium,color:'#00FF88',items,ts:Date.now(),status:'unavailable',ms:Math.round(performance.now()-t0)};}
    const pct=Math.round(bat.level*100);
    items.push({key:'Level',val:`${pct}%`});items.push({key:'Charging',val:String(bat.charging)});
    if(bat.chargingTime&&bat.chargingTime!==Infinity)items.push({key:'Time to Full',val:`${Math.round(bat.chargingTime/60)} min`});
    if(bat.dischargingTime&&bat.dischargingTime!==Infinity)items.push({key:'Time Remaining',val:`${Math.round(bat.dischargingTime/60)} min`});
    log('RECON','BATTERY',`${pct}% ${bat.charging?'⚡ charging':'🔋 discharging'}${bat.dischargingTime&&bat.dischargingTime!==Infinity?` — ${Math.round(bat.dischargingTime/60)}min left`:''}`);
    return{category:'Battery',icon:BatteryMedium,color:pct>50?'#00FF88':pct>20?'#FFB800':'#FF3D3D',items,ts:Date.now(),status:'ok',ms:Math.round(performance.now()-t0)};
  }catch(e:any){log('ERROR','BATTERY',e.message);return{category:'Battery',icon:BatteryMedium,color:'#00FF88',items:[{key:'Status',val:'Error'}],ts:Date.now(),status:'error',ms:Math.round(performance.now()-t0)};}
}

async function probeMedia(log:(op:PktOp,src:string,msg:string)=>void): Promise<ReconResult> {
  const t0=performance.now();const items:{key:string;val:string}[]=[];
  log('RECON','MEDIA','Enumerating media devices...');
  try {
    if(!navigator.mediaDevices?.enumerateDevices){return{category:'Media Devices',icon:Camera,color:'#B388FF',items:[{key:'Status',val:'Unavailable'}],ts:Date.now(),status:'unavailable',ms:Math.round(performance.now()-t0)};}
    const devs=await navigator.mediaDevices.enumerateDevices();
    const cams=devs.filter(d=>d.kind==='videoinput');const mics=devs.filter(d=>d.kind==='audioinput');const spks=devs.filter(d=>d.kind==='audiooutput');
    items.push({key:'Cameras',val:String(cams.length)});items.push({key:'Microphones',val:String(mics.length)});items.push({key:'Speakers',val:String(spks.length)});
    log('MEDIA','MEDIA',`${cams.length} cameras, ${mics.length} mics, ${spks.length} speakers`);
    cams.forEach((c,i)=>{const l=c.label||`Camera ${i+1}`;items.push({key:`Cam ${i+1}`,val:l});log('MEDIA','MEDIA',`📷 ${l}`);});
    mics.forEach((m,i)=>{const l=m.label||`Mic ${i+1}`;items.push({key:`Mic ${i+1}`,val:l});log('MEDIA','MEDIA',`🎙 ${l}`);});
    spks.forEach((s,i)=>{const l=s.label||`Speaker ${i+1}`;items.push({key:`Spk ${i+1}`,val:l});log('MEDIA','MEDIA',`🔊 ${l}`);});
    // Display capabilities
    items.push({key:'Screen Capture',val:'mediaDevices' in navigator&&'getDisplayMedia' in navigator.mediaDevices?'Supported':'No'});
    return{category:'Media Devices',icon:Camera,color:'#B388FF',items,ts:Date.now(),status:'ok',ms:Math.round(performance.now()-t0)};
  }catch(e:any){log('ERROR','MEDIA',e.message);return{category:'Media Devices',icon:Camera,color:'#B388FF',items,ts:Date.now(),status:'error',ms:Math.round(performance.now()-t0)};}
}

async function probeLocation(log:(op:PktOp,src:string,msg:string)=>void): Promise<ReconResult> {
  const t0=performance.now();const items:{key:string;val:string}[]=[];
  log('RECON','GPS','Requesting geolocation...');
  try {
    if(!navigator.geolocation){return{category:'Geolocation',icon:MapPin,color:'#FFB74D',items:[{key:'Status',val:'Unavailable'}],ts:Date.now(),status:'unavailable',ms:Math.round(performance.now()-t0)};}
    const pos = await new Promise<GeolocationPosition>((res,rej) => navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true,timeout:10000}));
    const c=pos.coords;
    items.push({key:'Latitude',val:c.latitude.toFixed(6)});items.push({key:'Longitude',val:c.longitude.toFixed(6)});
    items.push({key:'Accuracy',val:`±${Math.round(c.accuracy)}m`});
    if(c.altitude!=null)items.push({key:'Altitude',val:`${c.altitude.toFixed(1)}m`});
    if(c.altitudeAccuracy!=null)items.push({key:'Alt Accuracy',val:`±${Math.round(c.altitudeAccuracy)}m`});
    if(c.heading!=null&&!isNaN(c.heading))items.push({key:'Heading',val:`${c.heading.toFixed(1)}°`});
    if(c.speed!=null&&!isNaN(c.speed))items.push({key:'Speed',val:`${(c.speed*3.6).toFixed(1)} km/h`});
    log('GPS','GPS',`${c.latitude.toFixed(6)}, ${c.longitude.toFixed(6)} ±${Math.round(c.accuracy)}m${c.altitude!=null?` alt ${c.altitude.toFixed(0)}m`:''}`);
    return{category:'Geolocation',icon:MapPin,color:'#FFB74D',items,ts:Date.now(),status:'ok',ms:Math.round(performance.now()-t0)};
  }catch(e:any){
    const msg=e.code===1?'Permission denied':e.code===2?'Position unavailable':e.code===3?'Timeout':e.message;
    log('ERROR','GPS',msg);return{category:'Geolocation',icon:MapPin,color:'#FFB74D',items:[{key:'Status',val:msg}],ts:Date.now(),status:e.code===1?'denied':'error',ms:Math.round(performance.now()-t0)};
  }
}

async function probeSensors(log:(op:PktOp,src:string,msg:string)=>void): Promise<ReconResult> {
  const t0=performance.now();const items:{key:string;val:string}[]=[];
  log('RECON','SENSORS','Probing device sensors...');
  // Motion
  const hasMotion='DeviceMotionEvent' in window;const hasOrient='DeviceOrientationEvent' in window;
  items.push({key:'Motion Events',val:hasMotion?'Available':'No'});
  items.push({key:'Orientation Events',val:hasOrient?'Available':'No'});
  // Ambient Light
  const hasALS='AmbientLightSensor' in window;
  items.push({key:'Ambient Light',val:hasALS?'Available':'No'});
  if(hasALS){try{const s=new(window as any).AmbientLightSensor();s.start();await new Promise(r=>setTimeout(r,500));if(s.illuminance!=null){items.push({key:'Illuminance',val:`${s.illuminance} lux`});log('SENSOR','SENSORS',`Ambient Light: ${s.illuminance} lux`);}s.stop();}catch{}}
  // Accelerometer
  if('Accelerometer' in window){items.push({key:'Accelerometer',val:'Available'});try{const s=new(window as any).Accelerometer({frequency:10});s.start();await new Promise(r=>setTimeout(r,300));if(s.x!=null){items.push({key:'Accel X/Y/Z',val:`${s.x?.toFixed(2)} / ${s.y?.toFixed(2)} / ${s.z?.toFixed(2)}`});log('SENSOR','SENSORS',`Accel: X=${s.x?.toFixed(2)} Y=${s.y?.toFixed(2)} Z=${s.z?.toFixed(2)}`);}s.stop();}catch{}}else{items.push({key:'Accelerometer',val:'No'});}
  // Gyroscope
  if('Gyroscope' in window){items.push({key:'Gyroscope',val:'Available'});try{const s=new(window as any).Gyroscope({frequency:10});s.start();await new Promise(r=>setTimeout(r,300));if(s.x!=null){items.push({key:'Gyro X/Y/Z',val:`${s.x?.toFixed(3)} / ${s.y?.toFixed(3)} / ${s.z?.toFixed(3)}`});log('SENSOR','SENSORS',`Gyro: X=${s.x?.toFixed(3)} Y=${s.y?.toFixed(3)} Z=${s.z?.toFixed(3)}`);}s.stop();}catch{}}else{items.push({key:'Gyroscope',val:'No'});}
  // Magnetometer
  if('Magnetometer' in window){items.push({key:'Magnetometer',val:'Available'});try{const s=new(window as any).Magnetometer({frequency:10});s.start();await new Promise(r=>setTimeout(r,300));if(s.x!=null){items.push({key:'Mag X/Y/Z',val:`${s.x?.toFixed(1)} / ${s.y?.toFixed(1)} / ${s.z?.toFixed(1)}`});log('SENSOR','SENSORS',`Mag: X=${s.x?.toFixed(1)} Y=${s.y?.toFixed(1)} Z=${s.z?.toFixed(1)}`);}s.stop();}catch{}}else{items.push({key:'Magnetometer',val:'No'});}
  // Gamepad
  const pads=navigator.getGamepads?navigator.getGamepads().filter(Boolean):[];
  items.push({key:'Gamepads',val:String(pads.length)});
  pads.forEach((g:any)=>{if(g)log('SENSOR','SENSORS',`🎮 ${g.id} (${g.buttons.length} btns, ${g.axes.length} axes)`);});
  log('SENSOR','SENSORS',`Sensors probed: motion=${hasMotion} orient=${hasOrient} light=${hasALS}`);
  return{category:'Sensors',icon:Activity,color:'#FF6BCD',items,ts:Date.now(),status:'ok',ms:Math.round(performance.now()-t0)};
}

async function probePeripherals(log:(op:PktOp,src:string,msg:string)=>void): Promise<ReconResult> {
  const t0=performance.now();const items:{key:string;val:string}[]=[];
  log('RECON','I/O','Probing USB / HID / Serial / NFC / MIDI...');
  // WebUSB
  const hasUSB='usb' in navigator;items.push({key:'WebUSB',val:hasUSB?'Available':'No'});
  if(hasUSB){try{const devs=await(navigator as any).usb.getDevices();items.push({key:'USB Devices',val:String(devs.length)});devs.forEach((d:any)=>{const n=d.productName||`VID:${d.vendorId?.toString(16)} PID:${d.productId?.toString(16)}`;items.push({key:'USB',val:n});log('USB','I/O',`🔌 ${n}`);});}catch{}}
  // WebHID
  const hasHID='hid' in navigator;items.push({key:'WebHID',val:hasHID?'Available':'No'});
  if(hasHID){try{const devs=await(navigator as any).hid.getDevices();items.push({key:'HID Devices',val:String(devs.length)});devs.forEach((d:any)=>{const n=d.productName||`VID:${d.vendorId?.toString(16)}`;items.push({key:'HID',val:n});log('HID','I/O',`🖱 ${n}`);});}catch{}}
  // Web Serial
  const hasSer='serial' in navigator;items.push({key:'Web Serial',val:hasSer?'Available':'No'});
  if(hasSer){try{const ports=await(navigator as any).serial.getPorts();items.push({key:'Serial Ports',val:String(ports.length)});ports.forEach((_:any,i:number)=>log('SERIAL','I/O',`Serial port ${i+1}`));}catch{}}
  // Web NFC
  const hasNFC='NDEFReader' in window;items.push({key:'Web NFC',val:hasNFC?'Available':'No'});
  if(hasNFC)log('NFC','I/O','NFC reader available');
  // Web MIDI
  const hasMIDI='requestMIDIAccess' in navigator;items.push({key:'Web MIDI',val:hasMIDI?'Available':'No'});
  if(hasMIDI){try{const midi=await(navigator as any).requestMIDIAccess({sysex:false});const ins=Array.from(midi.inputs.values());const outs=Array.from(midi.outputs.values());items.push({key:'MIDI Inputs',val:String(ins.length)});items.push({key:'MIDI Outputs',val:String(outs.length)});ins.forEach((d:any)=>{items.push({key:'MIDI In',val:d.name||'?'});log('MIDI','I/O',`🎹 IN: ${d.name}`);});outs.forEach((d:any)=>{items.push({key:'MIDI Out',val:d.name||'?'});log('MIDI','I/O',`🎹 OUT: ${d.name}`);});}catch{}}
  // Bluetooth
  const hasBT='bluetooth' in navigator;items.push({key:'Web Bluetooth',val:hasBT?'Available':'No'});
  log('RECON','I/O',`USB=${hasUSB} HID=${hasHID} Serial=${hasSer} NFC=${hasNFC} MIDI=${hasMIDI} BT=${hasBT}`);
  return{category:'Peripherals',icon:Usb,color:'#FFB800',items,ts:Date.now(),status:'ok',ms:Math.round(performance.now()-t0)};
}

async function probePermissions(log:(op:PktOp,src:string,msg:string)=>void): Promise<ReconResult> {
  const t0=performance.now();const items:{key:string;val:string}[]=[];
  log('RECON','PERMS','Querying permission states...');
  const perms=['geolocation','notifications','camera','microphone','clipboard-read','clipboard-write','accelerometer','gyroscope','magnetometer','ambient-light-sensor','midi','screen-wake-lock','storage-access','persistent-storage'];
  for(const p of perms){
    try{const s=await navigator.permissions.query({name:p as PermissionName});items.push({key:p,val:s.state});if(s.state==='granted')log('RECON','PERMS',`✓ ${p}: granted`);else if(s.state==='denied')log('RECON','PERMS',`✗ ${p}: denied`);
    }catch{items.push({key:p,val:'unsupported'});}
  }
  return{category:'Permissions',icon:Lock,color:'#64FFDA',items,ts:Date.now(),status:'ok',ms:Math.round(performance.now()-t0)};
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function WorldRemote({ onClose }: { onClose?: () => void }) {
  const [devices, setDevices] = useState<Dev[]>([]);
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
  const [view, setView] = useState<'recon'|'bluetooth'|'packets'>('recon');
  const [autoScr, setAutoScr] = useState(true);
  const [exDev, setExDev] = useState<string|null>(null);
  const [full, setFull] = useState(false);
  const [paused, setPaused] = useState(false);
  const [recon, setRecon] = useState<ReconResult[]>([]);
  const [reconRunning, setReconRunning] = useState(false);
  const [exRecon, setExRecon] = useState<string|null>(null);

  const mtd = useRef(true);
  const errT = useRef<ReturnType<typeof setTimeout>|null>(null);
  const nL = useRef<Map<string,(e:Event)=>void>>(new Map());
  const pid = useRef(0);
  const logEl = useRef<HTMLDivElement>(null);
  const t0 = useRef(Date.now());
  const [tick, setTick] = useState(0);

  useEffect(() => { if(typeof navigator!=='undefined'&&!navigator.bluetooth)setBtOk(false);mtd.current=true;t0.current=Date.now();const iv=setInterval(()=>{if(mtd.current)setTick(t=>t+1);},1000);return()=>{mtd.current=false;clearInterval(iv);if(errT.current)clearTimeout(errT.current);nL.current.clear();}; }, []);
  useEffect(() => { if(autoScr&&logEl.current)logEl.current.scrollTop=logEl.current.scrollHeight; }, [pkts,autoScr]);
  useEffect(() => { if(full)document.body.style.overflow='hidden';else document.body.style.overflow='';return()=>{document.body.style.overflow='';}; }, [full]);

  const setErr = useCallback((m:string|null)=>{if(!mtd.current)return;setError(m);if(errT.current)clearTimeout(errT.current);if(m)errT.current=setTimeout(()=>{if(mtd.current)setError(null);},6000);},[]);
  const log = useCallback((op:PktOp,src:string,msg:string,hex?:string,len?:number)=>{if(!mtd.current||paused)return;const p:Pkt={id:++pid.current,ts:Date.now(),op,src,msg,hex,len};setPkts(prev=>{const next=[...prev,p];return next.length>2000?next.slice(-2000):next;});if(len)setBytes(b=>b+len);},[paused]);

  // ── FULL RECON ──
  const runRecon = useCallback(async()=>{
    if(reconRunning)return;setReconRunning(true);setRecon([]);
    log('RECON','ENGINE','═══ FULL HARDWARE RECON INITIATED ═══');
    const results:ReconResult[]=[];
    const probes=[probeSystem,probeGPU,probeNetwork,probeBattery,probeMedia,probeLocation,probeSensors,probePeripherals,probePermissions];
    for(const fn of probes){
      if(!mtd.current)break;
      const r=await fn(log);results.push(r);if(mtd.current)setRecon([...results]);
    }
    log('RECON','ENGINE',`═══ RECON COMPLETE: ${results.length} modules, ${results.filter(r=>r.status==='ok').length} OK, ${results.reduce((a,r)=>a+r.items.length,0)} data points ═══`);
    if(mtd.current)setReconRunning(false);
  },[reconRunning,log]);

  const onDC = useCallback((e:Event)=>{if(!mtd.current)return;const d=e.target as BluetoothDevice;setDevices(p=>p.map(x=>x.bt===d?{...x,connected:false,srv:undefined}:x));log('DISCONNECT',d.name||'?','GATT disconnected');},[log]);

  // ── BLE PROBE ──
  const probe = useCallback(async(dev:Dev):Promise<Dev>=>{
    if(!dev.bt?.gatt)return{...dev,type:byName(dev.name),probing:false};
    const info:DInfo={services:[],classifiedBy:'name'};let type:DType|null=null;let batt:number|undefined;let name=dev.name;const p0=performance.now();
    log('PROBE',dev.name,'Deep GATT probe...');
    try{const s=await dev.bt.gatt.connect();if(!s)return{...dev,type:byName(dev.name),probing:false};log('CONNECT',dev.name,'GATT connected');
      try{const g=await s.getPrimaryService(0x1800);info.services.push('Generic Access');try{const c=await g.getCharacteristic(0x2A01);const v=await c.readValue();const a=v.getUint16(0,true);info.appearance=a;info.appearanceLabel=appLbl(a);log('READ',dev.name,`Appearance: ${appLbl(a)} (0x${a.toString(16).padStart(4,'0')})`);const t=byApp(a);if(t&&t!=='unknown'){type=t;info.classifiedBy='appearance';}}catch{}
        try{const c=await g.getCharacteristic(0x2A00);const v=await c.readValue();const n=new TextDecoder().decode(v.buffer).replace(/\0+$/g,'');if(n)name=n;log('READ',dev.name,`Name: "${name}"`);}catch{}
      }catch{}
      try{const d=await s.getPrimaryService(0x180A);info.services.push('Device Information');
        const flds:[string,number,keyof DInfo][]=[['Manufacturer',0x2A29,'manufacturer'],['Model',0x2A24,'model'],['Serial',0x2A25,'serial'],['Hardware',0x2A27,'hardware'],['Firmware',0x2A26,'firmware'],['Software',0x2A28,'software']];
        for(const[lbl,uuid,key]of flds){const val=await rStr(d,uuid);if(val){(info as any)[key]=val;log('READ',name,`${lbl}: "${val}"`,toHex(val),val.length);}}
        if(!type&&info.manufacturer){const mt=byMfr(info.manufacturer);if(mt){type=mt;info.classifiedBy='pnp';}}
      }catch{}
      const found:number[]=[];for(const svc of[0x180F,0x180D,0x1812,0x1814,0x1816,0x181A,0x1809,0x1810,0x1808,0x181B,0x181D,0x180E,0x1848,0x1815]){try{await s.getPrimaryService(svc);found.push(svc);const sn=Object.entries(BLE_SVC).find(([,v])=>v===svc)?.[0]?.replace(/_/g,' ')||`0x${svc.toString(16)}`;info.services.push(sn);log('ENUM',name,`Service: ${sn}`);if(svc===0x180F){try{const sv=await s.getPrimaryService(svc);const bc=await sv.getCharacteristic(0x2A19);batt=(await bc.readValue()).getUint8(0);log('READ',name,`Battery: ${batt}%`);}catch{}}}catch{}}
      if(!type||type==='unknown'){const st=bySvcs(found);if(st){type=st;info.classifiedBy='service';}}
      if(!type||type==='unknown'){type=byName(name);if(type!=='unknown')info.classifiedBy='name';}
      try{s.disconnect();}catch{}log('INFO',name,`✓ ${type?.toUpperCase()} via ${info.classifiedBy} (${Math.round(performance.now()-p0)}ms)`);
    }catch(e:any){log('ERROR',dev.name,e.message);if(!type)type=byName(dev.name);}
    return{...dev,name,type:type||'unknown',info,battery:batt,connected:false,probing:false,probeMs:Math.round(performance.now()-p0)};
  },[log]);

  const scan = useCallback(async()=>{if(!navigator.bluetooth||scanning)return;setScanning(true);setErr(null);log('SCAN','BLE','Device picker...');try{const d=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:ALL_SVCS});if(d){if(devices.find(x=>x.id===d.id)){setScanning(false);return;}d.addEventListener('gattserverdisconnected',onDC);const raw:Dev={id:d.id,name:d.name||`Device-${d.id.slice(0,6)}`,type:'unknown',connected:false,bt:d,probing:true};setDevices(p=>[...p,raw]);const probed=await probe(raw);if(mtd.current)setDevices(p=>p.map(x=>x.id===d.id?probed:x));}}catch(e:any){if(e.name!=='NotFoundError')setErr(e.message);}finally{if(mtd.current)setScanning(false);}
  },[devices,scanning,probe,onDC,setErr,log]);

  const connect = useCallback(async(dev:Dev)=>{if(!dev.bt?.gatt||connecting)return;setConnecting(dev.id);try{const s=await dev.bt.gatt.connect();if(!s)throw new Error('fail');let b=dev.battery;try{const bs=await s.getPrimaryService(0x180F);const bc=await bs.getCharacteristic(0x2A19);b=(await bc.readValue()).getUint8(0);}catch{}setDevices(p=>p.map(d=>d.id===dev.id?{...d,connected:true,srv:s,battery:b}:d));log('CONNECT',dev.name,'✓ Connected');}catch(e:any){setErr(e.message);}finally{if(mtd.current)setConnecting(null);}
  },[connecting,setErr,log]);
  const disconnect = useCallback((dev:Dev)=>{try{dev.bt?.gatt?.connected&&dev.bt.gatt.disconnect();}catch{}setDevices(p=>p.map(d=>d.id===dev.id?{...d,connected:false,srv:undefined}:d));if(gattTarget===dev.id){setGattTarget(null);setGattSvcs([]);}log('DISCONNECT',dev.name,'Dropped');},[gattTarget,log]);

  const explore = useCallback(async(dev:Dev)=>{if(!dev.bt?.gatt)return;if(!dev.bt.gatt.connected){try{await dev.bt.gatt.connect();}catch{return;}}setGattTarget(dev.id);setGattLoading(true);setGattSvcs([]);setExSvc(null);log('ENUM',dev.name,'GATT tree...');try{const svcs=await dev.bt.gatt.getPrimaryServices();const result:Svc[]=[];for(const s of svcs){const sn=rUUID(s.uuid);const chars:Chr[]=[];try{for(const ch of await s.getCharacteristics()){let value:string|undefined,hex:string|undefined;if(ch.properties.read){try{const v=await ch.readValue();const d=dec(v);value=d.text;hex=d.hex;log('READ',dev.name,`${rUUID(ch.uuid)}: ${d.text.slice(0,50)}`,d.hex,v.byteLength);}catch{}}chars.push({uuid:ch.uuid,name:rUUID(ch.uuid),p:{r:ch.properties.read,w:ch.properties.write,wn:ch.properties.writeWithoutResponse,n:ch.properties.notify,i:ch.properties.indicate},value,hex,char:ch});}}catch{}result.push({uuid:s.uuid,name:sn,chars});}if(mtd.current){setGattSvcs(result);if(result.length>0)setExSvc(result[0].uuid);}log('INFO',dev.name,`✓ ${result.length} services`);}catch(e:any){log('ERROR',dev.name,e.message);}finally{if(mtd.current)setGattLoading(false);}
  },[log]);

  const toggleN = useCallback(async(su:string,ch:Chr,dn:string)=>{if(!ch.char)return;const key=`${su}/${ch.uuid}`;try{if(ch.notifying){await ch.char.stopNotifications();const l=nL.current.get(key);if(l){ch.char.removeEventListener('characteristicvaluechanged',l);nL.current.delete(key);}setGattSvcs(p=>p.map(s=>s.uuid===su?{...s,chars:s.chars.map(c=>c.uuid===ch.uuid?{...c,notifying:false}:c)}:s));log('SUB',dn,`✗ ${ch.name}`);}else{await ch.char.startNotifications();const listener=(e:Event)=>{if(!mtd.current)return;const t=(e.target as BluetoothRemoteGATTCharacteristic).value;if(!t)return;const d=dec(t);setGattSvcs(p=>p.map(s=>s.uuid===su?{...s,chars:s.chars.map(c=>c.uuid===ch.uuid?{...c,value:d.text,hex:d.hex}:c)}:s));log('NOTIFY',dn,`${ch.name}: ${d.text.slice(0,50)}`,d.hex,t.byteLength);};ch.char.addEventListener('characteristicvaluechanged',listener);nL.current.set(key,listener);setGattSvcs(p=>p.map(s=>s.uuid===su?{...s,chars:s.chars.map(c=>c.uuid===ch.uuid?{...c,notifying:true}:c)}:s));log('SUB',dn,`✓ ${ch.name}`);}}catch(e:any){log('ERROR',dn,(e.message||'').slice(0,40));}
  },[log]);

  const nConn=devices.filter(d=>d.connected).length;
  const upSec=Math.floor((Date.now()-t0.current)/1000);
  const upStr=`${Math.floor(upSec/3600).toString().padStart(2,'0')}:${Math.floor((upSec%3600)/60).toString().padStart(2,'0')}:${(upSec%60).toString().padStart(2,'0')}`;
  const reconOk=recon.filter(r=>r.status==='ok').length;
  const reconPts=recon.reduce((a,r)=>a+r.items.length,0);

  /* ═══ RENDER ═══ */
  const inner = (
    <div className={`flex flex-col overflow-hidden ${full?'w-full h-full':''}`} style={{...(!full&&{minWidth:340,maxHeight:700}),background:'#060810',borderRadius:full?0:14,border:full?'none':'1px solid rgba(0,230,255,0.06)',boxShadow:full?'none':'0 8px 40px rgba(0,0,0,0.6)'}}>
      {/* HEADER */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{background:'linear-gradient(180deg,rgba(0,230,255,0.04),transparent)',borderBottom:'1px solid rgba(0,230,255,0.06)'}}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center relative shrink-0" style={{background:'rgba(0,230,255,0.06)',border:'1px solid rgba(0,230,255,0.1)'}}>
          <ScanLine className="w-4 h-4 text-[var(--cyan-primary)]"/>
          {(scanning||reconRunning) && <motion.div className="absolute inset-0 rounded-lg" animate={{boxShadow:['0 0 0px rgba(0,230,255,0.2)','0 0 12px rgba(0,230,255,0.4)','0 0 0px rgba(0,230,255,0.2)']}} transition={{duration:1.5,repeat:Infinity}}/>}
        </div>
        <div className="mr-auto"><h3 className="text-[11px] font-mono font-bold tracking-[0.25em] text-[var(--text-primary)]">RECON ENGINE</h3><span className={`text-[7px] font-mono tracking-widest ${reconRunning||scanning?'text-[var(--cyan-primary)] animate-pulse':'text-[var(--text-muted)]'}`}>{reconRunning?'● PROBING HARDWARE':scanning?'● BLE SCANNING':nConn>0?`● ${nConn} LIVE`:'○ IDLE'}</span></div>
        <div className="flex items-center gap-4">
          <div className="text-center"><div className="text-[5px] font-mono text-[var(--text-muted)] tracking-[0.2em]">PKTS</div><div className="text-[10px] font-mono font-bold text-[var(--cyan-primary)] tabular-nums">{pkts.length}</div></div>
          <div className="text-center"><div className="text-[5px] font-mono text-[var(--text-muted)] tracking-[0.2em]">DATA</div><div className="text-[10px] font-mono font-bold text-[#00FF88] tabular-nums">{bytes>1024?`${(bytes/1024).toFixed(1)}K`:bytes}B</div></div>
          <div className="text-center"><div className="text-[5px] font-mono text-[var(--text-muted)] tracking-[0.2em]">UP</div><div className="text-[10px] font-mono font-bold text-[var(--text-muted)] tabular-nums">{upStr}</div></div>
        </div>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          <button onClick={()=>setFull(!full)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5" title={full?'Minimize':'Fullscreen'}>{full?<Minimize2 className="w-3.5 h-3.5 text-[var(--text-muted)]"/>:<Maximize2 className="w-3.5 h-3.5 text-[var(--text-muted)]"/>}</button>
          {onClose && <button onClick={()=>{if(full)setFull(false);else onClose();}} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5"><X className="w-3.5 h-3.5 text-[var(--text-muted)]"/></button>}
        </div>
      </div>

      {/* TAB BAR */}
      <div className="flex items-center px-2 shrink-0" style={{borderBottom:'1px solid rgba(255,255,255,0.03)',background:'rgba(0,0,0,0.3)'}}>
        {(['recon','bluetooth','packets'] as const).map(tab=>(
          <button key={tab} onClick={()=>setView(tab)} className="relative px-3 py-2.5 text-[7px] font-mono font-bold tracking-[0.2em] uppercase transition-colors" style={{color:view===tab?'var(--cyan-primary)':'var(--text-muted)'}}>
            {tab==='recon'?`RECON${recon.length>0?` (${reconPts})`:''}`
              :tab==='bluetooth'?`BLE ${devices.length}`
              :`LOG ${pkts.length}`}
            {view===tab && <motion.div layoutId="stab" className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full" style={{background:'var(--cyan-primary)'}}/>}
          </button>
        ))}
        <div className="flex-1"/>
        {view==='bluetooth' && <motion.button whileTap={{scale:0.95}} onClick={scan} disabled={scanning||!btOk} className="px-2.5 py-1 my-1 rounded-lg text-[6px] font-mono font-bold tracking-[0.15em] flex items-center gap-1 disabled:opacity-30" style={{background:'rgba(0,230,255,0.06)',color:'var(--cyan-primary)',border:'1px solid rgba(0,230,255,0.08)'}}>{scanning?<BluetoothSearching className="w-2.5 h-2.5 animate-pulse"/>:<Bluetooth className="w-2.5 h-2.5"/>}{scanning?'...':'SCAN'}</motion.button>}
        {view==='recon' && <motion.button whileTap={{scale:0.95}} onClick={runRecon} disabled={reconRunning} className="px-2.5 py-1 my-1 rounded-lg text-[6px] font-mono font-bold tracking-[0.15em] flex items-center gap-1 disabled:opacity-30" style={{background:'linear-gradient(135deg,rgba(0,230,255,0.08),rgba(0,255,136,0.04))',color:'var(--cyan-primary)',border:'1px solid rgba(0,230,255,0.08)'}}><Crosshair className={`w-2.5 h-2.5 ${reconRunning?'animate-spin':''}`}/>{reconRunning?'RUNNING':'RUN RECON'}</motion.button>}
      </div>

      {/* ERROR */}
      <AnimatePresence>{error && <motion.div initial={{height:0}} animate={{height:'auto'}} exit={{height:0}} className="overflow-hidden shrink-0"><div className="mx-3 mt-2 p-2 rounded-lg flex items-center gap-2" style={{background:'rgba(255,61,61,0.04)',border:'1px solid rgba(255,61,61,0.1)'}}><AlertTriangle className="w-3 h-3 text-[#FF3D3D] shrink-0"/><span className="text-[7px] font-mono text-[#FF3D3D] flex-1 truncate">{error}</span><button onClick={()=>setError(null)}><X className="w-2.5 h-2.5 text-[#FF3D3D]/50"/></button></div></motion.div>}</AnimatePresence>

      {/* BODY */}
      <div className="flex-1 overflow-hidden flex">

        {/* ═══ RECON VIEW ═══ */}
        {view==='recon' && (
          <div className={`flex-1 overflow-y-auto styled-scrollbar ${full?'p-4':'px-3 py-3'}`}>
            {recon.length===0 && !reconRunning && (
              <div className="flex flex-col items-center justify-center py-12 opacity-40">
                <Crosshair className="w-12 h-12 text-[var(--cyan-primary)]/20 mb-4"/>
                <p className="text-[10px] font-mono text-[var(--text-muted)] text-center tracking-wider mb-1">HARDWARE RECON ENGINE</p>
                <p className="text-[7px] font-mono text-[var(--text-muted)] text-center tracking-wider opacity-60 leading-relaxed max-w-[280px]">
                  Probes every hardware API: GPU, Network, Battery, Cameras,<br/>Microphones, GPS, Gyroscope, Accelerometer, Magnetometer,<br/>USB, HID, Serial, NFC, MIDI, and all permissions.
                </p>
              </div>
            )}
            <div className={`${full?'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3':'space-y-2'}`}>
              {recon.map((r,i) => {
                const Icon=r.icon;const isE=exRecon===r.category;
                return (
                  <motion.div key={r.category} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}}>
                    <div className="rounded-xl overflow-hidden" style={{background:'rgba(255,255,255,0.015)',border:`1px solid ${r.color}10`}}>
                      <button className="w-full p-3 flex items-center gap-3 text-left" onClick={()=>setExRecon(isE?null:r.category)}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{background:`${r.color}10`,border:`1px solid ${r.color}15`}}>
                          <Icon className="w-4 h-4" style={{color:r.color}}/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2"><span className="text-[9px] font-mono font-bold text-[var(--text-primary)] tracking-wider">{r.category.toUpperCase()}</span><span className="text-[5px] font-mono px-1 py-0.5 rounded tracking-wider" style={{background:r.status==='ok'?'rgba(0,255,136,0.08)':r.status==='denied'?'rgba(255,61,61,0.08)':'rgba(255,255,255,0.04)',color:r.status==='ok'?'#00FF88':r.status==='denied'?'#FF3D3D':'var(--text-muted)'}}>{r.status.toUpperCase()}</span></div>
                          <span className="text-[6px] font-mono text-[var(--text-muted)] tracking-wider">{r.items.length} data points · {r.ms}ms</span>
                        </div>
                        <ChevronDown className={`w-3 h-3 text-[var(--text-muted)] transition-transform ${isE?'rotate-180':''}`}/>
                      </button>
                      <AnimatePresence>{isE && (
                        <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden">
                          <div className="px-3 pb-3" style={{borderTop:'1px solid rgba(255,255,255,0.03)'}}>
                            <div className="mt-2 space-y-0.5">
                              {r.items.map((item,j)=>(
                                <div key={j} className="flex items-start py-1 gap-2" style={{borderBottom:'1px solid rgba(255,255,255,0.02)'}}>
                                  <span className="text-[6px] font-mono text-[var(--text-muted)] tracking-wider shrink-0 w-[90px] pt-0.5">{item.key}</span>
                                  <span className="text-[7px] font-mono text-[var(--text-primary)] flex-1 break-all leading-relaxed">{item.val}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}</AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}
              {reconRunning && (
                <motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex items-center justify-center py-6 gap-2">
                  <div className="w-4 h-4 border-2 border-[var(--cyan-primary)] border-t-transparent rounded-full animate-spin"/>
                  <span className="text-[8px] font-mono text-[var(--cyan-primary)] tracking-wider animate-pulse">PROBING HARDWARE...</span>
                </motion.div>
              )}
            </div>
          </div>
        )}

        {/* ═══ BLUETOOTH VIEW ═══ */}
        {view==='bluetooth' && (
          <div className={`flex-1 overflow-y-auto styled-scrollbar ${full?'flex flex-wrap content-start gap-3 p-4':'px-3 py-3 space-y-2'}`}>
            {devices.length===0&&!scanning&&btOk && <div className={`flex flex-col items-center opacity-30 ${full?'w-full py-16':'py-8'}`}><Radio className="w-8 h-8 text-[var(--cyan-primary)]/20 mb-3"/><p className="text-[8px] font-mono text-[var(--text-muted)] text-center tracking-wider">Tap SCAN to discover BLE devices.</p></div>}
            {devices.map(dev=>{const m=META[dev.type];const Icon=m.icon;const isC=connecting===dev.id;const isG=gattTarget===dev.id;const isE=exDev===dev.id;
              return(<motion.div key={dev.id} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} layout className={full?'w-full sm:w-[calc(50%-6px)] lg:w-[calc(33.33%-8px)]':'w-full'}><div className="rounded-xl overflow-hidden" style={{background:dev.connected?`linear-gradient(135deg,${m.color}06,${m.color}02)`:'rgba(255,255,255,0.015)',border:`1px solid ${dev.connected?m.color+'15':'rgba(255,255,255,0.04)'}`}}>
                <button className="w-full p-3.5 flex items-start gap-3 text-left" onClick={()=>setExDev(isE?null:dev.id)}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 relative" style={{background:`linear-gradient(135deg,${m.color}12,${m.color}05)`,border:`1px solid ${m.color}18`}}>{dev.probing||isC?<div className="w-4 h-4 border-2 rounded-full animate-spin" style={{borderColor:m.color,borderTopColor:'transparent'}}/>:<Icon className="w-5 h-5" style={{color:m.color}}/>}{dev.connected&&<div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--alert-green)] border-2 animate-pulse" style={{borderColor:'#060810'}}/>}</div>
                  <div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-1"><span className="text-[10px] font-mono font-bold text-[var(--text-primary)] truncate">{dev.name}</span>{dev.connected&&<span className="text-[5px] font-mono px-1 py-0.5 rounded bg-[var(--alert-green)]/10 text-[var(--alert-green)] tracking-widest font-bold">LIVE</span>}</div>
                    {dev.probing?<div className="flex items-center gap-2"><motion.div className="h-1 rounded-full flex-1" style={{background:`${m.color}10`}}><motion.div className="h-full rounded-full" style={{background:m.color}} animate={{width:['0%','60%','100%']}} transition={{duration:3}}/></motion.div><span className="text-[6px] font-mono tracking-wider" style={{color:m.color}}>PROBING</span></div>
                    :<div className="flex items-center gap-1.5 flex-wrap"><span className="text-[7px] font-mono px-1.5 py-0.5 rounded-md tracking-wider font-bold" style={{background:`${m.color}10`,color:m.color}}>{m.label.toUpperCase()}</span>{dev.info?.classifiedBy&&<span className="text-[5px] font-mono px-1 py-0.5 rounded bg-white/4 text-[var(--text-muted)] tracking-[0.15em]">{dev.info.classifiedBy.toUpperCase()}</span>}{dev.battery!=null&&<span className="text-[6px] font-mono" style={{color:dev.battery>50?'var(--alert-green)':'#FFB800'}}>{dev.battery}%</span>}{dev.probeMs!=null&&<span className="text-[5px] font-mono text-[var(--text-muted)]">{dev.probeMs}ms</span>}{dev.info&&dev.info.services.length>0&&<span className="text-[5px] font-mono text-[var(--text-muted)]">{dev.info.services.length} svcs</span>}</div>}
                  </div><ChevronDown className={`w-3 h-3 text-[var(--text-muted)] transition-transform mt-1 shrink-0 ${isE?'rotate-180':''}`}/>
                </button>
                <AnimatePresence>{isE&&!dev.probing&&(<motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden"><div className="px-3.5 pb-3.5" style={{borderTop:'1px solid rgba(255,255,255,0.03)'}}>
                  {dev.info&&(dev.info.manufacturer||dev.info.model)&&<div className="flex flex-wrap gap-1.5 mt-2.5 mb-2">{dev.info.manufacturer&&<span className="text-[6px] font-mono px-2 py-1 rounded-lg bg-white/3 text-[var(--text-secondary)] tracking-wider">{dev.info.manufacturer}</span>}{dev.info.model&&<span className="text-[6px] font-mono px-2 py-1 rounded-lg bg-white/3 text-[var(--text-secondary)] tracking-wider">{dev.info.model}</span>}{dev.info.firmware&&<span className="text-[6px] font-mono px-2 py-1 rounded-lg bg-white/3 text-[var(--text-muted)] tracking-wider">FW {dev.info.firmware}</span>}</div>}
                  {dev.info&&dev.info.services.length>0&&<div className="flex flex-wrap gap-1 mb-2.5">{dev.info.services.map((s,i)=><span key={i} className="text-[5px] font-mono px-1.5 py-0.5 rounded tracking-wider" style={{background:`${m.color}06`,color:`${m.color}70`}}>{s}</span>)}</div>}
                  <div className="text-[5px] font-mono text-[var(--text-muted)] mb-3 opacity-40">{dev.id}</div>
                  <div className="flex gap-2">{dev.connected?<><motion.button whileTap={{scale:0.95}} onClick={()=>explore(dev)} className="flex-1 py-2 rounded-lg text-[7px] font-mono font-bold tracking-[0.15em] flex items-center justify-center gap-1.5" style={{background:`${m.color}08`,color:m.color,border:`1px solid ${m.color}10`}}><Layers className="w-3 h-3"/>GATT</motion.button><motion.button whileTap={{scale:0.95}} onClick={()=>disconnect(dev)} className="py-2 px-3 rounded-lg text-[7px] font-mono font-bold tracking-[0.15em]" style={{background:'rgba(255,61,61,0.05)',color:'#FF6B6B'}}><Unplug className="w-3 h-3"/></motion.button></>:<motion.button whileTap={{scale:0.95}} onClick={()=>connect(dev)} disabled={!!connecting} className="flex-1 py-2.5 rounded-lg text-[8px] font-mono font-bold tracking-[0.15em] flex items-center justify-center gap-2 disabled:opacity-30" style={{background:`${m.color}08`,color:m.color,border:`1px solid ${m.color}10`}}><Zap className="w-3.5 h-3.5"/>{isC?'...':'CONNECT'}</motion.button>}</div>
                  <AnimatePresence>{isG&&(<motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden"><div className="mt-3 pt-3" style={{borderTop:`1px solid ${m.color}08`}}><div className="flex items-center justify-between mb-2"><span className="text-[7px] font-mono font-bold tracking-[0.15em]" style={{color:m.color}}>GATT TREE</span><button onClick={()=>{setGattTarget(null);setGattSvcs([]);}}><X className="w-2.5 h-2.5 text-[var(--text-muted)]"/></button></div>
                    {gattLoading?<div className="flex items-center justify-center py-4 gap-2"><div className="w-4 h-4 border-2 rounded-full animate-spin" style={{borderColor:m.color,borderTopColor:'transparent'}}/><span className="text-[7px] font-mono animate-pulse" style={{color:m.color}}>ENUM...</span></div>
                    :gattSvcs.map(svc=>(<div key={svc.uuid}><button onClick={()=>setExSvc(exSvc===svc.uuid?null:svc.uuid)} className="w-full p-2 rounded-lg flex items-center gap-2 text-left hover:bg-white/[0.02]"><Bluetooth className="w-2.5 h-2.5 shrink-0" style={{color:m.color}}/><span className="text-[7px] font-mono font-bold text-[var(--text-primary)] truncate flex-1">{svc.name}</span><span className="text-[6px] font-mono" style={{color:`${m.color}80`}}>{svc.chars.length}</span><ChevronRight className={`w-2.5 h-2.5 text-[var(--text-muted)] transition-transform ${exSvc===svc.uuid?'rotate-90':''}`}/></button>
                      <AnimatePresence>{exSvc===svc.uuid&&(<motion.div initial={{height:0}} animate={{height:'auto'}} exit={{height:0}} className="overflow-hidden"><div className="pl-4 pr-1 py-1 space-y-1">{svc.chars.map(ch=>{const ck=`${svc.uuid}/${ch.uuid}`;const fl=[ch.p.r&&'R',ch.p.w&&'W',ch.p.wn&&'Wn',ch.p.n&&'N',ch.p.i&&'I'].filter(Boolean).join('·');const wV=wIn[ck]||'';const wOk=!wV||vHex(wV);return(<div key={ch.uuid} className="p-2 rounded-lg" style={{background:'rgba(0,0,0,0.25)',borderLeft:`2px solid ${m.color}12`}}><div className="flex items-center gap-1 mb-1"><span className="text-[6px] font-mono font-bold text-[var(--text-primary)] truncate flex-1">{ch.name}</span><span className="text-[5px] font-mono px-1 py-0.5 rounded" style={{background:`${m.color}06`,color:`${m.color}80`}}>{fl}</span></div>{ch.value&&<div className="flex items-center gap-1 mb-1.5"><div className="flex-1 rounded px-2 py-1 min-w-0" style={{background:'rgba(0,0,0,0.3)'}}><div className="text-[7px] font-mono text-[var(--alert-green)] truncate">{ch.value}</div>{ch.hex&&ch.hex!==ch.value&&<div className="text-[5px] font-mono text-[var(--text-muted)] truncate mt-0.5 opacity-50">{ch.hex}</div>}</div><button onClick={()=>{navigator.clipboard?.writeText(ch.value||'');setCopied(ck);setTimeout(()=>setCopied(null),1500);}} className="p-1 rounded hover:bg-white/5 shrink-0">{copied===ck?<Check className="w-2 h-2 text-[var(--alert-green)]"/>:<Copy className="w-2 h-2 text-[var(--text-muted)]"/>}</button></div>}<div className="flex items-center gap-1 flex-wrap">{ch.p.r&&<button onClick={async()=>{if(!ch.char)return;try{const v=await ch.char.readValue();const d=dec(v);setGattSvcs(p=>p.map(s=>s.uuid===svc.uuid?{...s,chars:s.chars.map(c=>c.uuid===ch.uuid?{...c,value:d.text,hex:d.hex}:c)}:s));log('READ',dev.name,`${ch.name}: ${d.text.slice(0,50)}`,d.hex,v.byteLength);}catch{log('ERROR',dev.name,`Read: ${ch.name}`);}}} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[5px] font-mono" style={{background:`${m.color}06`,color:m.color}}><Eye className="w-2 h-2"/>READ</button>}{ch.p.n&&<button onClick={()=>toggleN(svc.uuid,ch,dev.name)} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[5px] font-mono" style={{background:ch.notifying?'rgba(0,255,136,0.06)':'rgba(255,255,255,0.02)',color:ch.notifying?'#00FF88':'var(--text-muted)'}}>{ch.notifying?<Bell className="w-2 h-2"/>:<BellOff className="w-2 h-2"/>}{ch.notifying?'LIVE':'SUB'}</button>}{(ch.p.w||ch.p.wn)&&<div className="flex items-center gap-0.5 flex-1"><input type="text" placeholder="FF 01" value={wV} onChange={e=>setWIn(p=>({...p,[ck]:e.target.value}))} className="flex-1 rounded px-1.5 py-0.5 text-[6px] font-mono text-[var(--text-primary)] outline-none min-w-0" style={{background:'rgba(0,0,0,0.3)',border:`1px solid ${wOk?'transparent':'rgba(255,61,61,0.3)'}`}}/><button onClick={async()=>{if(!ch.char||!wV||!vHex(wV))return;try{await wSafe(ch.char,pHex(wV),ch.p.w);log('WRITE',dev.name,`${ch.name} ← ${wV}`);setWIn(p=>({...p,[ck]:''}));}catch{log('ERROR',dev.name,`Write: ${ch.name}`);}}} disabled={!wV||!wOk} className="p-0.5 rounded shrink-0 disabled:opacity-30" style={{color:'#FFB800'}}><Send className="w-2 h-2"/></button></div>}</div></div>);})}</div></motion.div>)}</AnimatePresence>
                    </div>))}
                  </div></motion.div>)}</AnimatePresence>
                </div></motion.div>)}</AnimatePresence>
              </div></motion.div>);
            })}
          </div>
        )}

        {/* ═══ PACKETS ═══ */}
        {view==='packets' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-1.5 shrink-0" style={{background:'rgba(0,0,0,0.3)',borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
              <span className="text-[5px] font-mono text-[var(--text-muted)] tracking-[0.15em]"># · TIME · OP · SRC · DETAIL · HEX · LEN</span>
              <div className="flex items-center gap-2">
                <button onClick={()=>setPaused(!paused)} className={`text-[6px] font-mono tracking-wider px-1.5 py-0.5 rounded flex items-center gap-1 ${paused?'text-[#FFB800]':'text-[var(--text-muted)]'}`}>{paused?<><Pause className="w-2 h-2"/>PAUSED</>:<><Play className="w-2 h-2"/>LIVE</>}</button>
                <button onClick={()=>setAutoScr(!autoScr)} className={`text-[6px] font-mono tracking-wider px-1.5 py-0.5 rounded ${autoScr?'text-[var(--alert-green)]':'text-[var(--text-muted)]'}`}>{autoScr?'▼ AUTO':'⏸ HOLD'}</button>
                <button onClick={()=>{setPkts([]);setBytes(0);pid.current=0;}} className="text-[6px] font-mono text-[var(--text-muted)] tracking-wider px-1.5 py-0.5 rounded hover:bg-white/5 flex items-center gap-1"><Trash2 className="w-2 h-2"/>CLR</button>
              </div>
            </div>
            <div ref={logEl} className="flex-1 overflow-y-auto styled-scrollbar font-mono" style={{background:'#020406'}}>
              {pkts.length===0?<div className="flex items-center justify-center h-full opacity-20"><span className="text-[9px] font-mono text-[var(--text-muted)] tracking-wider">Waiting for activity...</span></div>
              :<div className="py-0.5">{pkts.map(p=>{const oc=OP_CLR[p.op]||'#90A4AE';return(<div key={p.id} className="px-3 py-[3px] flex items-start hover:bg-white/[0.015] border-b border-white/[0.01] group" style={{fontSize:11,lineHeight:'18px'}}><span className="text-white/10 shrink-0 w-[28px] tabular-nums text-right pr-2">{p.id}</span><span className="text-[var(--text-muted)]/40 shrink-0 w-[72px] tabular-nums">{fts(p.ts)}</span><span className="shrink-0 font-bold tracking-wider" style={{color:oc,width:full?70:55}}>{p.op}</span><span className="text-[var(--cyan-primary)]/50 shrink-0 truncate" style={{width:full?110:70}}>{p.src}</span><span className="text-[var(--text-secondary)] flex-1 truncate">{p.msg}</span>{p.hex&&<span className="text-[var(--text-muted)]/20 ml-2 truncate group-hover:text-[var(--text-muted)]/50" style={{maxWidth:full?200:80}}>{p.hex}</span>}{p.len!=null&&<span className="text-[var(--text-muted)]/15 ml-1 shrink-0 tabular-nums group-hover:text-[var(--text-muted)]/40">{p.len}B</span>}</div>);})}</div>}
            </div>
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{background:'rgba(0,0,0,0.4)',borderTop:'1px solid rgba(255,255,255,0.03)'}}>
        <div className="flex items-center gap-2"><div className={`w-1.5 h-1.5 rounded-full ${btOk?'bg-[var(--alert-green)]':'bg-[#FF3D3D]'} ${scanning||reconRunning?'animate-pulse':''}`}/><span className="text-[6px] font-mono text-[var(--text-muted)] tracking-[0.15em]">{reconRunning?'RECON ACTIVE':scanning?'SCANNING':'IDLE'}</span></div>
        <div className="flex items-center gap-3">{nConn>0&&<span className="text-[6px] font-mono text-[var(--alert-green)] tracking-wider">● {nConn} BLE</span>}{reconOk>0&&<span className="text-[6px] font-mono text-[var(--text-muted)] tracking-wider">{reconOk}/{recon.length} modules</span>}<span className="text-[5px] font-mono text-[var(--text-muted)]/25 tracking-widest">OSIRIS</span></div>
      </div>
    </div>
  );

  if(full)return createPortal(<motion.div initial={{opacity:0}} animate={{opacity:1}} className="fixed inset-0 z-[9999] flex" style={{background:'rgba(0,0,0,0.9)',backdropFilter:'blur(8px)'}}><div className="w-full h-full p-3 flex">{inner}</div></motion.div>,document.body);
  return inner;
}
