(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const TILE = 32, WORLD_W = 96, WORLD_H = 24;
  const $ = id => document.getElementById(id);
  const blockDefs = {
    wood: { color:'#9a6847', solid:true, count:24 }, stone:{ color:'#71818a',solid:true,count:18 },
    water:{ color:'#398da0',water:true,count:30 }, coral:{ color:'#d77d6e',solid:false,count:8 }
  };
  const initialFish = [
    {name:'River Minnow',rarity:'Common',weight:[.1,.8],value:8,color:'#a8d7c6',bias:'small'},
    {name:'Bluegill',rarity:'Common',weight:[.3,1.8],value:12,color:'#85b5d1'},
    {name:'Silver Perch',rarity:'Common',weight:[.5,2.4],value:15,color:'#d0d5c8'},
    {name:'Small Carp',rarity:'Common',weight:[.6,3.8],value:17,color:'#d49e72'},
    {name:'Catfish',rarity:'Uncommon',weight:[1.2,8],value:29,color:'#a2a3a5'},
    {name:'Rainbow Trout',rarity:'Uncommon',weight:[.8,5.5],value:34,color:'#e08d89'},
    {name:'Golden Koi',rarity:'Rare',weight:[1,9],value:90,color:'#ffca6c'},
    {name:'Crystal Perch',rarity:'Rare',weight:[.6,4],value:105,color:'#8de3e1'},
    {name:'Shadow Bass',rarity:'Epic',weight:[2,12],value:230,color:'#a78cd1'},
    {name:'Ancient Dragonfish',rarity:'Legendary',weight:[8,32],value:850,color:'#f0a870'}
  ];
  const storageKey='aquaria-stage1-v1';
  let saved={}; try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}')||{}}catch(_){saved={}};
  let state={coins:saved.coins??120, counts:{...Object.fromEntries(Object.entries(blockDefs).map(([k,v])=>[k,v.count])),...(saved.counts||{})}, inventory:saved.inventory||[], records:saved.records||{}, placed:saved.placed||{}, player:saved.player||{x:8*TILE,y:14*TILE-42}, facing:1, build:false, selected:'wood', cast:null, fishCaught:saved.fishCaught||0, day:0, cameraX:0, cameraY:0};
  const world = Array.from({length:WORLD_H},()=>Array(WORLD_W).fill(null));
  function setTile(x,y,type){if(x>=0&&x<WORLD_W&&y>=0&&y<WORLD_H)world[y][x]=type;}
  // A layered, hand-shaped cove with a broad custom-buildable pond.
  for(let x=0;x<WORLD_W;x++){
    const surface=14+(x>42?Math.min(4,Math.floor((x-42)/12)):0)+(x<4?1:0);
    for(let y=surface;y<WORLD_H;y++)setTile(x,y,y===surface?'grass':(y<surface+3?'dirt':'stone'));
  }
  for(let x=14;x<=31;x++)for(let y=10;y<14;y++)setTile(x,y,'water');
  for(let x=14;x<=31;x++){setTile(x,14,'mud');setTile(x,15,'stone');}
  // Small natural details and a starting pier.
  for(let x=7;x<=11;x++)setTile(x,13,'wood');
  const baseWorld=world.map(row=>row.slice());
  for(let x=0;x<WORLD_W;x++)for(let y=0;y<WORLD_H;y++){
    const key=`${x},${y}`,val=state.placed[key]; if(val)setTile(x,y,val);
  }
  (saved.removed||[]).forEach(key=>{const [x,y]=key.split(',').map(Number);setTile(x,y,null);});
  let W=800,H=480,dpr=1,last=0,elapsed=0,toastTimer=0,heldReel=false,keys={};
  const player=state.player; player.w=22;player.h=40;player.vx=0;player.vy=0;player.grounded=false;
  function save(){
    const placed={},removed=[];for(let y=0;y<WORLD_H;y++)for(let x=0;x<WORLD_W;x++){if(world[y][x]!==baseWorld[y][x]){const key=`${x},${y}`;if(world[y][x])placed[key]=world[y][x];else removed.push(key);}}
    try{localStorage.setItem(storageKey,JSON.stringify({coins:state.coins,counts:state.counts,inventory:state.inventory,records:state.records,placed,removed,player:{x:player.x,y:player.y},fishCaught:state.fishCaught}));}catch(_){ }
  }
  function resize(){const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;dpr=Math.min(window.devicePixelRatio||1,2);W=r.width;H=r.height;canvas.width=Math.floor(W*dpr);canvas.height=Math.floor(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;}
  window.addEventListener('resize',resize);new ResizeObserver(resize).observe(canvas);resize();
  function tileAt(px,py){const x=Math.floor(px/TILE),y=Math.floor(py/TILE);return x>=0&&x<WORLD_W&&y>=0&&y<WORLD_H?world[y][x]:null;}
  function isSolid(type){return !!type&&type!=='water'&&type!=='coral';}
  function rectHits(x,y,w,h){const pts=[[x,y],[x+w-1,y],[x,y+h-1],[x+w-1,y+h-1]];return pts.some(([a,b])=>isSolid(tileAt(a,b)));}
  function movePlayer(dt){
    const left=keys.ArrowLeft||keys.KeyA||keys.touchLeft,right=keys.ArrowRight||keys.KeyD||keys.touchRight;
    const speed=180;player.vx=(right?1:0)-(left?1:0);player.vx*=speed;if(player.vx)state.facing=Math.sign(player.vx);
    player.x+=player.vx*dt;
    if(rectHits(player.x,player.y,player.w,player.h)){player.x-=player.vx*dt;const dir=Math.sign(player.vx);for(let n=0;n<Math.ceil(Math.abs(player.vx*dt));n++){if(!rectHits(player.x+dir,player.y,player.w,player.h))player.x+=dir;else break;}}
    player.vy=Math.min(650,player.vy+1200*dt);player.y+=player.vy*dt;player.grounded=false;
    if(rectHits(player.x,player.y,player.w,player.h)){
      const dir=Math.sign(player.vy);player.y-=player.vy*dt;
      for(let n=0;n<Math.ceil(Math.abs(player.vy*dt))+2;n++){if(!rectHits(player.x,player.y+dir,player.w,player.h))player.y+=dir;else{if(dir>0)player.grounded=true;player.vy=0;break;}}
    }
    player.x=Math.max(0,Math.min(WORLD_W*TILE-player.w,player.x));
  }
  function surfaceAt(x){for(let y=0;y<WORLD_H;y++)if(world[y][x]==='water'&&(!world[y-1]||world[y-1][x]!=='water'))return y;return -1;}
  function nearbyWater(){const cx=(player.x+player.w/2)/TILE,cy=(player.y+player.h)/TILE;let best=null,dist=99;for(let x=Math.floor(cx)-10;x<=Math.floor(cx)+10;x++){if(x<0||x>=WORLD_W)continue;const sy=surfaceAt(x);if(sy<0)continue;const d=Math.abs(x+.5-cx);if(d<dist&&d<9&&Math.abs(sy-cy)<8){best={x,y:sy};dist=d;}}return best;}
  function showToast(message){const t=$('toast');t.textContent=message;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2100);}
  function updateHud(){ $('coins').textContent=state.coins.toLocaleString();for(const k of Object.keys(blockDefs)){const el=$(k+'Count');if(el)el.textContent=state.counts[k]??0;} }
  function castLine(){if(state.cast){if(state.cast.phase==='bite'){startFight();return;}showToast('Your line is already in the water.');return;}const water=nearbyWater();if(!water){showToast('Get closer to a water edge to cast.');return;}if(player.x<water.x*TILE)state.facing=1;else state.facing=-1;const targetX=Math.max(0,Math.min(WORLD_W*TILE,(water.x+.5)*TILE));state.cast={phase:'waiting',x:targetX,y:water.y*TILE+4,timer:3.2+Math.random()*3.5,elapsed:0,fish:null,progress:0,tension:35,pull:0};showToast('Line cast — watching the water…');}
  function chooseFish(){const roll=Math.random(),index=roll<.47?Math.floor(Math.random()*4):roll<.79?4+Math.floor(Math.random()*2):roll<.94?6+Math.floor(Math.random()*2):roll<.992?8:9;return initialFish[index];}
  function startFight(){if(!state.cast||state.cast.phase!=='bite')return;state.cast.phase='fight';state.cast.fish=chooseFish();state.cast.progress=0;state.cast.tension=40;state.cast.pull=Math.random()*6.28;$('fishKind').textContent=state.cast.fish.name.toUpperCase();$('fishAlert').classList.remove('show');$('fishingPanel').classList.add('active');showToast('Keep tension steady and reel in!');}
  function stopFishing(message){state.cast=null;$('fishAlert').classList.remove('show');$('fishingPanel').classList.remove('active');heldReel=false;if(message)showToast(message);}
  function catchFish(){const f=state.cast.fish,weight=f.weight[0]+Math.random()*(f.weight[1]-f.weight[0]),record=state.records[f.name]||{count:0,best:0};record.count++;record.best=Math.max(record.best,weight);state.records[f.name]=record;state.inventory.push({type:'fish',name:f.name,rarity:f.rarity,weight,value:Math.max(1,Math.round(f.value*(.7+weight/f.weight[1]*.8))),color:f.color});state.fishCaught++;state.coins+=Math.max(1,Math.round(f.value*.18));updateHud();save();showCatchModal(f,weight);stopFishing('Catch secured! Added to your bag.');}
  function showCatchModal(f,weight){openModal(`<div class="catch-spark">✦</div><h2>Beautiful catch!</h2><p class="subtitle">Your collection is growing.</p><div class="card catch-card"><b style="color:${f.color}">✧ &nbsp;${f.name}</b><p>${f.rarity} catch &nbsp;·&nbsp; ${weight.toFixed(2)} kg<br>Estimated value: <strong>${Math.max(1,Math.round(f.value*(.7+weight/f.weight[1]*.8)))} ◈</strong></p></div><button class="modal-action" id="catchOk">CONTINUE FISHING</button>`);$('catchOk').onclick=closeModal;}
  function updateFishing(dt){const c=state.cast;if(!c)return;c.elapsed+=dt;if(c.phase==='waiting'){c.timer-=dt;if(c.timer<=0){c.phase='bite';c.timer=1.8;$('fishAlert').classList.add('show');showToast('Something is nibbling! Press E or tap the bobber.');}}else if(c.phase==='bite'){c.timer-=dt;if(c.timer<=0)stopFishing('It got away — try again!');}else if(c.phase==='fight'){
      c.pull+=dt*(1.15+Math.random()*.15);const wave= Math.sin(c.pull)*20+Math.sin(c.pull*2.7)*7;c.tension+=(heldReel?19:-13)*dt+wave*dt;c.tension=Math.max(0,Math.min(110,c.tension));const needle=$('tensionNeedle');needle.style.left=`${Math.max(0,Math.min(97,c.tension))}%`;
      if(heldReel&&c.tension>34&&c.tension<70)c.progress+=dt*(9.3+(c.fish.rarity==='Common'?1:0));else if(!heldReel)c.progress=Math.max(0,c.progress-dt*1.1);
      $('catchProgress').style.width=`${Math.min(100,c.progress)}%`;
      if(c.tension>=99){stopFishing('The line snapped! Try a gentler reel.');return;}if(c.progress>=100){catchFish();}
    }}
  function screenPointer(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left+state.cameraX,y:e.clientY-r.top+state.cameraY};}
  function placeOrRemove(e,remove=false){const p=screenPointer(e),tx=Math.floor(p.x/TILE),ty=Math.floor(p.y/TILE);if(tx<0||tx>=WORLD_W||ty<0||ty>=WORLD_H)return;const key=`${tx},${ty}`;if(remove){const type=world[ty][tx];if(!type){showToast('Nothing to remove there.');return;}if(type==='water'){state.counts.water=(state.counts.water||0)+1;}else if(['wood','stone','coral'].includes(type)){state.counts[type]=(state.counts[type]||0)+1;}else{showToast('Natural terrain cannot be removed.');return;}setTile(tx,ty,null);save();updateHud();return;}
    if(!state.build){return;}const type=state.selected;if(world[ty][tx]){showToast('That space is occupied.');return;}if((state.counts[type]||0)<1){showToast('No '+type+' blocks left.');return;}if(type==='water'){
      const supported=[[tx+1,ty],[tx-1,ty],[tx,ty+1],[tx,ty-1]].some(([x,y])=>world[y]?.[x]&&world[y][x]!=='water');if(!supported){showToast('Water needs an edge or a solid base.');return;}
    }
    setTile(tx,ty,type);state.counts[type]--;save();updateHud();
  }
  canvas.addEventListener('pointerdown',e=>{if(e.button===2){e.preventDefault();placeOrRemove(e,true);return;}if(state.build){placeOrRemove(e,false);return;}if(state.cast?.phase==='bite'){startFight();return;}if(state.cast?.phase==='fight')heldReel=true;});
  canvas.addEventListener('pointerup',()=>heldReel=false);canvas.addEventListener('pointerleave',()=>heldReel=false);canvas.addEventListener('contextmenu',e=>e.preventDefault());
  function jump(){if(player.grounded){player.vy=-430;player.grounded=false;}}
  function keyDown(e){if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code))e.preventDefault();keys[e.code]=true;if(e.repeat)return;switch(e.code){case'Space':if(state.cast?.phase==='fight')heldReel=true;else jump();break;case'KeyW':case'ArrowUp':jump();break;case'KeyE':case'Enter':castLine();break;case'KeyB':toggleBuild();break;case'KeyI':openInventory();break;case'KeyJ':openJournal();break;case'Escape':closeModal();break;case'Digit1':state.selected='wood';selectBlock();break;}}
  function keyUp(e){keys[e.code]=false;if(e.code==='Space')heldReel=false;}
  window.addEventListener('keydown',keyDown);window.addEventListener('keyup',keyUp);window.addEventListener('blur',()=>{keys={};heldReel=false;});
  function toggleBuild(){state.build=!state.build;$('buildBtn').classList.toggle('on',state.build);$('buildState').textContent=state.build?'ON':'OFF';showToast(state.build?'Build mode on — click to place, right-click to remove.':'Build mode off.');}
  function selectBlock(){document.querySelectorAll('.block-tool').forEach(b=>b.classList.toggle('selected',b.dataset.block===state.selected));}
  document.querySelectorAll('.block-tool').forEach(b=>b.onclick=()=>{state.selected=b.dataset.block;selectBlock();if(!state.build)showToast(`${b.dataset.block.toUpperCase()} selected — turn on build mode to place.`);});
  $('buildBtn').onclick=toggleBuild;$('rodBtn').onclick=()=>showToast(state.cast?'Your line is out.':'Beginner Rod equipped · ready to cast.');$('baitBtn').onclick=()=>showToast('Worm bait equipped · 12 remaining.');
  $('reelBtn').addEventListener('pointerdown',e=>{e.preventDefault();heldReel=true;});$('reelBtn').addEventListener('pointerup',()=>heldReel=false);$('reelBtn').addEventListener('pointerleave',()=>heldReel=false);$('reelBtn').addEventListener('pointercancel',()=>heldReel=false);
  document.querySelectorAll('[data-move]').forEach(b=>{const key=b.dataset.move==='left'?'touchLeft':'touchRight';b.addEventListener('pointerdown',e=>{e.preventDefault();keys[key]=true;b.setPointerCapture(e.pointerId);});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>b.addEventListener(ev,()=>keys[key]=false));});
  $('mobileJump').addEventListener('pointerdown',e=>{e.preventDefault();if(state.cast?.phase==='fight')heldReel=true;else jump();});$('mobileJump').addEventListener('pointerup',()=>heldReel=false);
  $('mobileCast').onclick=castLine;$('mobileReel').addEventListener('pointerdown',e=>{e.preventDefault();if(state.cast?.phase==='bite')startFight();heldReel=true;});['pointerup','pointercancel','pointerleave'].forEach(ev=>$('mobileReel').addEventListener(ev,()=>heldReel=false));
  $('inventoryBtn').onclick=openInventory;$('journalBtn').onclick=openJournal;$('habitatBtn').onclick=openHabitat;$('mapBtn').onclick=openMap;$('questBtn').onclick=openQuests;$('craftBtn').onclick=openCraft;$('settingsBtn').onclick=openSettings;
  $('soundBtn').onclick=()=>showToast('Ambient sound is off in this preview.');$('closeModal').onclick=closeModal;$('modalBackdrop').addEventListener('click',e=>{if(e.target===$('modalBackdrop'))closeModal();});
  function openModal(html){$('modalContent').innerHTML=html;$('modalBackdrop').classList.add('open');}
  function closeModal(){$('modalBackdrop').classList.remove('open');}
  function openInventory(){const counts=state.inventory.reduce((a,i)=>{const label=i.type==='fish'?`${i.name} · ${i.weight.toFixed(1)} kg`:i.name;a[label]=(a[label]||0)+1;return a;},{});const extras=Object.entries(state.counts).map(([k,n])=>`<div class="inventory-item">${k==='water'?'≈':'▦'} ${k[0].toUpperCase()+k.slice(1)} blocks<small>Building material ×${n}</small></div>`).join('');const items=Object.entries(counts).map(([name,n])=>`<div class="inventory-item">✧ ${name}<small>Stack ×${n}</small></div>`).join('');openModal(`<h2>Adventurer's bag</h2><p class="subtitle">${state.inventory.length+Object.values(state.counts).reduce((a,b)=>a+b,0)} items · Starter backpack</p><div class="inventory-row">${items||'<div class="card">Your bag is ready for its first catch.</div>'}${extras}</div><button class="modal-action" id="sellFish">SELL ALL FISH · EARN COINS</button>`);$('sellFish').onclick=()=>{const fish=state.inventory.filter(i=>i.type==='fish');if(!fish.length){showToast('No fish to sell yet.');return;}const earned=fish.reduce((n,f)=>n+f.value,0);state.coins+=earned;state.inventory=state.inventory.filter(i=>i.type!=='fish');save();updateHud();closeModal();showToast(`Sold ${fish.length} fish for ${earned} coins.`);};}
  function openJournal(){const entries=initialFish.map(f=>{const r=state.records[f.name];return `<div class="fish-entry"><span>${r?`✧ ${f.name}`:'▧ Unknown species'}<small>${r?`Best ${r.best.toFixed(2)} kg · ${r.count} caught`:'A silhouette waits to be discovered'}</small></span><span class="rarity">${r?f.rarity:'???'}</span></div>`;}).join('');openModal(`<h2>Field journal</h2><p class="subtitle">FISH SPECIES · ${Object.keys(state.records).length} / ${initialFish.length} DISCOVERED</p>${entries}<p class="subtitle" style="margin-top:15px">Every new species is recorded automatically when caught.</p>`);}
  function openHabitat(){const waterCount=world.flat().filter(t=>t==='water').length,depth=Math.max(0,...Array.from({length:WORLD_W},(_,x)=>{let n=0;for(let y=0;y<WORLD_H&&world[y][x]==='water';y++)n++;return n;}));const nearby=nearbyWater();openModal(`<h2>Habitat scanner</h2><p class="subtitle">A living readout of the water around you.</p><div class="modal-grid"><div class="card"><b>◉ &nbsp;FRESHWATER COVE</b><p>Habitat type · calm inland waters</p></div><div class="card"><b>${nearby?'GOOD':'—'} &nbsp;${nearby?'WATER ACCESS':'NO WATER NEARBY'}</b><p>${waterCount} water tiles in this world</p></div><div class="card"><b>〰 &nbsp;DEPTH: ${depth} TILES</b><p>Current waters support small and medium fish.</p></div><div class="card"><b>✧ &nbsp;QUALITY: ${waterCount>45?'LIVELY':'PEACEFUL'}</b><p>Add aquatic plants and coral to attract new species.</p></div></div><button class="modal-action" id="habitatOk">BACK TO THE COVE</button>`);$('habitatOk').onclick=closeModal;}
  function openMap(){openModal(`<h2>Whispering Cove</h2><p class="subtitle">WORLD 01 · YOUR LITTLE CORNER OF AQUARIA</p><div class="map-box"><div class="map-water">≈ ≈ ≈ ≈ ≈ ≈ ≈ ≈</div><div class="map-land">✦ &nbsp; HOME PIER <span>● YOU</span></div><div class="map-water">≈ ≈ ≈ ≈ ≈ FISHING GROUNDS ≈ ≈</div></div><p class="subtitle" style="margin-top:14px">Explore the shoreline and build your own pond anywhere.</p>`);}
  function openQuests(){openModal(`<h2>Daily discoveries</h2><p class="subtitle">Small adventures make a big world.</p><div class="card"><b>First catch</b><p>Catch your first fish at Whispering Cove.<div class="progress-quest"><i style="width:${state.fishCaught?100:0}%"></i></div>${state.fishCaught?'Complete · Reward claimed':'Progress: '+Math.min(state.fishCaught,1)+' / 1'}</p></div><div class="card" style="margin-top:9px"><b>Make a little room</b><p>Place 5 blocks in build mode.<div class="progress-quest"><i style="width:${Math.min(100,(24-(state.counts.wood||0))*20)}%"></i></div>Wood placed: ${24-(state.counts.wood||0)} / 5</p></div><div class="card" style="margin-top:9px"><b>Journal keeper</b><p>Discover three fish species.<div class="progress-quest"><i style="width:${Math.min(100,Object.keys(state.records).length/3*100)}%"></i></div>${Object.keys(state.records).length} / 3 species</p></div>`);}
  function openCraft(){openModal(`<h2>Dockside workbench</h2><p class="subtitle">A few useful plans from the cove workshop.</p><div class="modal-grid"><div class="card"><b>🐛 Worm bait ×5</b><p>Easy to find, loved by freshwater fish.<br>Cost: <strong>15 ◈</strong></p><button class="modal-action craft-item" data-item="bait">CRAFT</button></div><div class="card"><b>▦ Driftwood ×5</b><p>Build a cozy dock or a custom home.<br>Cost: <strong>20 ◈</strong></p><button class="modal-action craft-item" data-item="wood">CRAFT</button></div><div class="card"><b>◉ Water blocks ×10</b><p>Shape a pond for your favorite fish.<br>Cost: <strong>18 ◈</strong></p><button class="modal-action craft-item" data-item="water">CRAFT</button></div></div>`);document.querySelectorAll('.craft-item').forEach(b=>b.onclick=()=>{const type=b.dataset.item,cost=type==='bait'?15:type==='wood'?20:18;if(state.coins<cost){showToast('Not enough coins yet.');return;}state.coins-=cost;if(type==='bait')showToast('Crafted 5 worm bait!');else{state.counts[type]+=type==='wood'?5:10;updateHud();showToast(`Crafted ${type} blocks!`);}save();});}
  function openSettings(){openModal(`<h2>World settings</h2><p class="subtitle">Your progress saves automatically on this device.</p><div class="card"><b>Local save · enabled</b><p>World edits, catches, records, and coins persist in this browser.</p></div><div class="card" style="margin-top:9px"><b>Online world · not connected</b><p>This build is a single-player playable preview. A real shared world requires an account service, authoritative game server, and persistent multiplayer database; other players are not simulated.</p></div><button class="modal-action" id="saveNow">SAVE NOW</button>`);$('saveNow').onclick=()=>{save();showToast('Progress saved to this device.');};}
  function showCatchModal(f,w){const value=Math.max(1,Math.round(f.value*(.7+w/f.weight[1]*.8)));openModal(`<div style="font-size:30px;color:#ffd47d;margin-bottom:8px">✧</div><h2>Beautiful catch!</h2><p class="subtitle">Your collection is growing.</p><div class="card"><b style="color:${f.color}">✧ &nbsp;${f.name}</b><p>${f.rarity} catch &nbsp;·&nbsp; ${w.toFixed(2)} kg<br>Estimated value: <strong>${value} ◈</strong></p></div><button class="modal-action" id="catchOk">CONTINUE FISHING</button>`);$('catchOk').onclick=closeModal;}
  function drawBackground(t){
    const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#1d4e63');sky.addColorStop(.52,'#75a99b');sky.addColorStop(1,'#e5b979');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    // high cloud wisps
    ctx.globalAlpha=.16;for(let i=0;i<7;i++){const x=((i*203-t*4)%(W+180)+W+180)%(W+180)-70,y=48+(i%3)*29;ctx.fillStyle=i%2?'#f0ebc8':'#c3eee0';ctx.fillRect(x,y,70,4);ctx.fillRect(x+12,y-4,38,4);ctx.fillRect(x+31,y+4,55,3);}ctx.globalAlpha=1;
    const sunX=W*.72,sunY=H*.25;ctx.fillStyle='#ffdc8d';ctx.globalAlpha=.24;ctx.beginPath();ctx.arc(sunX,sunY,48,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.88;ctx.fillStyle='#ffe2a1';ctx.beginPath();ctx.arc(sunX,sunY,22,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    // distant mountains and cypress silhouettes
    function hills(color,base,amp,offset){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,H);for(let x=0;x<=W+10;x+=10){const wx=x+state.cameraX*.18+offset;const y=base+Math.sin(wx*.008)*amp+Math.sin(wx*.019)*amp*.38;ctx.lineTo(x,y);}ctx.lineTo(W,H);ctx.closePath();ctx.fill();}
    hills('#315c62',H*.55,26,0);hills('#254e54',H*.61,20,190);
    for(let i=0;i<14;i++){const x=((i*139-state.cameraX*.3)%(W+80)+W+80)%(W+80)-30;const y=H*.48+(i%4)*15;ctx.fillStyle=i%2?'#285552':'#38695b';ctx.fillRect(x,y-30,7,70);ctx.fillRect(x-9,y-20,25,5);ctx.fillRect(x-7,y-31,20,5);ctx.fillRect(x-3,y-40,13,9);}
    const horizon=H*.68;ctx.fillStyle='#89bbaa';ctx.fillRect(0,horizon,W,H-horizon);
    // distant cove shore, reeds
    ctx.fillStyle='#466f5e';ctx.beginPath();ctx.moveTo(0,horizon+6);for(let x=0;x<=W;x+=16)ctx.lineTo(x,horizon+8+Math.sin((x+state.cameraX*.22)*.025)*8);ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.fill();
  }
  function drawTile(type,sx,sy,tx,ty,t){
    if(type==='water'){
      const wave=Math.sin(t*2.3+tx*.75)*1.6;ctx.fillStyle='#25859a';ctx.fillRect(sx,sy+wave,TILE,TILE-wave);ctx.fillStyle='#55c3c0';ctx.fillRect(sx,sy+wave,TILE,3);ctx.fillStyle='#77d4c6';ctx.fillRect(sx+((tx*7+Math.floor(t*13))%24),sy+7+Math.sin(t+tx)*2,6,2);ctx.fillStyle='#18657e';ctx.fillRect(sx,sy+TILE-3,TILE,3);return;
    }
    const colors={grass:'#6e9a5c',dirt:'#78543f',stone:'#596972',mud:'#665344',wood:'#93623f',coral:'#cb7667'};const color=blockDefs[type]?.color||colors[type]||'#777';ctx.fillStyle=color;ctx.fillRect(sx,sy,TILE,TILE);
    if(type==='grass'){ctx.fillStyle='#8eb66a';ctx.fillRect(sx,sy,TILE,6);ctx.fillStyle='#5e874f';for(let i=0;i<5;i++)ctx.fillRect(sx+i*7,sy+6,3,3);ctx.fillStyle='#614638';ctx.fillRect(sx,sy+9,TILE,TILE-9);ctx.fillStyle='#7d5941';ctx.fillRect(sx+5,sy+17,5,3);ctx.fillRect(sx+22,sy+25,6,3);}
    if(type==='dirt'||type==='mud'){ctx.fillStyle=type==='mud'?'#806a54':'#936847';ctx.fillRect(sx+4,sy+7,5,4);ctx.fillRect(sx+21,sy+19,7,4);ctx.fillStyle='#4b453d';ctx.fillRect(sx+12,sy+27,4,3);}
    if(type==='stone'){ctx.fillStyle='#829097';ctx.fillRect(sx+4,sy+5,9,3);ctx.fillRect(sx+19,sy+17,8,3);ctx.fillStyle='#45565d';ctx.fillRect(sx+8,sy+21,4,4);}
    if(type==='wood'){ctx.fillStyle='#c0915e';ctx.fillRect(sx,sy+4,TILE,3);ctx.fillStyle='#714a36';ctx.fillRect(sx+5,sy+12,22,2);ctx.fillRect(sx+17,sy+23,9,2);}
    if(type==='coral'){ctx.fillStyle='#f39b78';ctx.fillRect(sx+9,sy+9,6,15);ctx.fillRect(sx+17,sy+14,6,13);ctx.fillRect(sx+5,sy+16,6,6);ctx.fillRect(sx+22,sy+7,6,7);}
    ctx.strokeStyle='#091e23';ctx.globalAlpha=.15;ctx.strokeRect(sx+.5,sy+.5,TILE-1,TILE-1);ctx.globalAlpha=1;
  }
  function drawWorld(t){
    const firstX=Math.max(0,Math.floor(state.cameraX/TILE)-1),lastX=Math.min(WORLD_W,Math.ceil((state.cameraX+W)/TILE)+1);
    for(let y=0;y<WORLD_H;y++)for(let x=firstX;x<lastX;x++){const type=world[y][x];if(type)drawTile(type,x*TILE-state.cameraX,y*TILE-state.cameraY,x,y,t);}
    // soft water haze and underwater plants
    for(let x=14;x<=31;x+=3){const sy=surfaceAt(x);if(sy<0)continue;const sx=x*TILE-state.cameraX,base=sy*TILE-state.cameraY;ctx.fillStyle='#47b9a2';ctx.globalAlpha=.7;for(let n=0;n<3;n++){const h=7+Math.sin(t*2+x+n)*3;ctx.fillRect(sx+7+n*8,base-h,2,h);}ctx.globalAlpha=1;}
    // tiny shoreline reeds and flower flecks
    for(let x=3;x<WORLD_W;x+=7){const y=14+(x>42?Math.min(4,Math.floor((x-42)/12)):0)+(x<4?1:0);const sx=x*TILE-state.cameraX,sy=y*TILE-state.cameraY;if(sx>-20&&sx<W+20){ctx.fillStyle='#609468';ctx.fillRect(sx+8,sy-7,2,7);ctx.fillRect(sx+5,sy-8,4,2);if(x%3===0){ctx.fillStyle='#f2bd84';ctx.fillRect(sx+9,sy-10,3,3);}}}
    // hovering fireflies
    for(let i=0;i<10;i++){let x=((i*119+t*7)%(W+20))-10,y=H*.46+Math.sin(t*1.5+i*2)*16+i%4*11;ctx.fillStyle='#ffdc89';ctx.globalAlpha=.28+Math.sin(t*3+i)*.18;ctx.fillRect(x,y,2,2);}ctx.globalAlpha=1;
  }
  function drawPlayer(t){
    const x=Math.round(player.x-state.cameraX),y=Math.round(player.y-state.cameraY),dir=state.facing,walk=Math.abs(player.vx)>0?Math.sin(t*14):0;
    // shadow
    ctx.fillStyle='#102c2c75';ctx.fillRect(x-4,y+player.h-1,30,4);
    // legs, boots
    ctx.fillStyle='#263a42';ctx.fillRect(x+5,y+29,6,8+Math.max(0,walk*3));ctx.fillRect(x+13,y+29,6,8+Math.max(0,-walk*3));ctx.fillStyle='#d5a77c';ctx.fillRect(x+3,y+36+Math.max(0,walk*3),9,4);ctx.fillRect(x+12,y+36+Math.max(0,-walk*3),10,4);
    // coat body
    ctx.fillStyle='#dc815e';ctx.fillRect(x+4,y+15,15,16);ctx.fillStyle='#f0a06f';ctx.fillRect(x+5,y+14,13,5);ctx.fillStyle='#315d67';ctx.fillRect(x+8,y+18,7,12);ctx.fillStyle='#f2d293';ctx.fillRect(x+11,y+20,2,2);ctx.fillRect(x+11,y+25,2,2);
    // neck and face
    ctx.fillStyle='#e6b287';ctx.fillRect(x+8,y+10,8,6);ctx.fillStyle='#efc49a';ctx.fillRect(x+6,y+4,13,9);ctx.fillStyle='#563d39';ctx.fillRect(x+5,y+3,14,4);ctx.fillRect(x+4,y+6,3,5);ctx.fillStyle='#312d35';ctx.fillRect(x+(dir>0?15:7),y+7,2,2);ctx.fillStyle='#ba735d';ctx.fillRect(x+9,y+11,5,1);
    // scarf and arm
    ctx.fillStyle='#73d7bd';ctx.fillRect(x+5,y+15,14,3);ctx.fillRect(x+15,y+17,3,5);
    const armY=state.cast?y+18+(state.cast.phase==='fight'?Math.sin(t*9)*2:0):y+19;ctx.fillStyle='#e7b48b';ctx.fillRect(dir>0?x+17:x+1,armY,5,8);
    // rod, line and bobber
    if(state.cast){const handX=x+(dir>0?20:2),handY=y+20;ctx.strokeStyle='#563e32';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(handX,handY);ctx.lineTo(handX+dir*25,handY-27);ctx.stroke();ctx.strokeStyle='#d8d2ae';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(handX+dir*25,handY-27);ctx.quadraticCurveTo(handX+dir*42,handY+5,state.cast.x-state.cameraX,state.cast.y-state.cameraY);ctx.stroke();const bx=state.cast.x-state.cameraX,by=state.cast.y-state.cameraY;ctx.fillStyle='#e57661';ctx.fillRect(bx-3,by-4,6,5);ctx.fillStyle='#ffe29e';ctx.fillRect(bx-2,by-1,4,3);if(state.cast.phase==='bite'&&Math.sin(t*16)>0){ctx.fillStyle='#ffe18a';ctx.fillRect(bx-2,by-11,4,5);}}
    else{ctx.strokeStyle='#6b5138';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+(dir>0?20:2),y+22);ctx.lineTo(x+dir*31,y+2);ctx.stroke();ctx.fillStyle='#c2a576';ctx.fillRect(x+dir*29,y,3,4);}
  }
  function drawBuildPreview(){if(!state.build)return;const x=mouse.x-state.cameraX,y=mouse.y-state.cameraY,tx=Math.floor((x+state.cameraX)/TILE),ty=Math.floor((y+state.cameraY)/TILE);if(tx<0||ty<0||tx>=WORLD_W||ty>=WORLD_H)return;ctx.globalAlpha=.55;drawTile(state.selected,tx*TILE-state.cameraX,ty*TILE-state.cameraY,tx,ty,elapsed);ctx.globalAlpha=1;ctx.strokeStyle='#b9ffdc';ctx.lineWidth=2;ctx.strokeRect(tx*TILE-state.cameraX+1,ty*TILE-state.cameraY+1,TILE-2,TILE-2);}
  let mouse={x:0,y:0};canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();mouse.x=e.clientX-r.left;mouse.y=e.clientY-r.top;});
  function draw(){const t=elapsed;const targetX=player.x+player.w/2-W/2;state.cameraX=Math.max(0,Math.min(WORLD_W*TILE-W,targetX));const groundY=player.y+player.h-H*.66;state.cameraY=Math.max(0,Math.min(WORLD_H*TILE-H,groundY));
    drawBackground(t);drawWorld(t);if(state.cast){const x=player.x-state.cameraX,y=player.y-state.cameraY;ctx.fillStyle='#f7d785';ctx.globalAlpha=.17;ctx.beginPath();ctx.ellipse(state.cast.x-state.cameraX,state.cast.y-state.cameraY+5,20+Math.sin(t*4)*4,4,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}drawPlayer(t);drawBuildPreview();
  }
  function frame(now){const dt=Math.min(.04,(now-last)/1000||0);last=now;elapsed+=dt;movePlayer(dt);updateFishing(dt);draw();requestAnimationFrame(frame);}requestAnimationFrame(frame);
  updateHud();
})();
