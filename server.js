const http=require('http');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const WebSocket=require('ws');
const PORT=process.env.PORT||3000;
const html=fs.readFileSync(path.join(__dirname,'index.html'));
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/'||url.pathname==='/index.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(html)}else if(url.pathname==='/capily-icon.png'||url.pathname==='/apple-touch-icon.png'){const name=url.pathname.slice(1);res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'});res.end(fs.readFileSync(path.join(__dirname,name)))}else if(url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,rooms:rooms.size}))}else{res.writeHead(404);res.end('Not found')}});
const wss=new WebSocket.Server({server,maxPayload:4096});
const rooms=new Map();
// Referral rewards are granted only for a distinct new visitor, once per inviter/visitor pair per server lifetime.
const inviteRewards=new Set();
function validDevice(x){return typeof x==='string'&&/^[a-f0-9]{32}$/.test(x)}
function send(ws,obj){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj))}
function broadcast(room,obj,except){for(const p of room.players.values())if(p.ws!==except)send(p.ws,obj)}
function validRoom(x){return typeof x==='string'&&/^[A-Z0-9]{5,8}$/.test(x)}
function cleanName(x){return String(x||'Kapy').replace(/[<>\u0000-\u001f]/g,'').slice(0,22)}
function state(p){return {id:p.id,name:p.name,color:p.color,x:p.x,z:p.z,heading:p.heading,riding:p.riding,inside:p.inside,emote:p.emote||'',updated:Date.now()}}
function detach(ws){const p=ws.player;if(!p)return;const room=rooms.get(p.room);if(room){room.players.delete(p.id);broadcast(room,{type:'leave',id:p.id});if(!room.players.size)rooms.delete(p.room)}ws.player=null}
wss.on('connection',(ws)=>{ws.isAlive=true;ws.on('pong',()=>ws.isAlive=true);ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return}if(!m||typeof m!=='object')return;
if(m.type==='join'){detach(ws);const code=String(m.room||'').toUpperCase();if(!validRoom(code))return send(ws,{type:'error',message:'Neplatný kód miestnosti.'});let room=rooms.get(code);if(!room){room={players:new Map(),hearts:0,hostDevice:null};rooms.set(code,room)}if(room.players.size>=12)return send(ws,{type:'error',message:'Miestnosť je plná (max. 12 hráčov).'});const device=validDevice(m.device)?m.device:null;
if(!room.hostDevice&&device)room.hostDevice=device;
const id=crypto.randomBytes(6).toString('hex');const p={id,ws,room:code,device,name:cleanName(m.name),color:/^#[0-9a-fA-F]{6}$/.test(m.color)?m.color:'#8b6046',x:0,z:4,heading:0,riding:false,inside:false};ws.player=p;send(ws,{type:'joined',id,room:code,players:[...room.players.values()].map(state),hearts:room.hearts});room.players.set(id,p);
// Reward the room creator only when a different device actually joins, not on link copy or reconnect.
if(device&&room.hostDevice&&device!==room.hostDevice){
 const key=room.hostDevice+':'+device;
 if(!inviteRewards.has(key)){
  const host=[...room.players.values()].find(v=>v.device===room.hostDevice);
  if(host){inviteRewards.add(key);send(host.ws,{type:'inviteReward',amount:150,guest:p.name});}
 }
}
broadcast(room,{type:'player',player:state(p)},ws);return}
const p=ws.player;if(!p)return;const room=rooms.get(p.room);if(!room)return;
if(m.type==='move'){const x=Number(m.x),z=Number(m.z),heading=Number(m.heading);if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(heading)||Math.abs(x)>100||Math.abs(z)>100)return;p.x=x;p.z=z;p.heading=heading;p.riding=!!m.riding;p.inside=!!m.inside;p.name=cleanName(m.name);if(/^#[0-9a-fA-F]{6}$/.test(m.color))p.color=m.color;broadcast(room,{type:'player',player:state(p)},ws)}
if(m.type==='heart'){if(room.hearts>=1000)return;room.hearts++;broadcast(room,{type:'hearts',hearts:room.hearts});send(ws,{type:'hearts',hearts:room.hearts})}
if(m.type==='emote'){const allowed=['💗','👋','🦫','🚗','🏖️','🧋'];if(!allowed.includes(m.emote))return;p.emote=m.emote;broadcast(room,{type:'emote',id:p.id,emote:m.emote},ws)}
});ws.on('close',()=>detach(ws));ws.on('error',()=>detach(ws))});
setInterval(()=>{for(const ws of wss.clients){if(!ws.isAlive){ws.terminate();continue}ws.isAlive=false;ws.ping()}},30000);
server.listen(PORT,()=>console.log('Capily multiplayer on '+PORT));
