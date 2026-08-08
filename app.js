/* Marine Companion — zero-backend PWA MVP
 * Advisory coastal assistant: GPS, spots, anchoring context, route, satellite/ocean context and official-source alerts.
 * Never a substitute for official nautical charts, notices, regulations or the skipper's watch.
 */

const state = {
  screen: 'home',
  position: { lat: 43.5484, lng: 7.0302 },
  gps: { status: 'demo', speedKt: 0, heading: null, accuracy: null },
  destination: 'sainte-marguerite',
  conditions: {
    source: 'demo', updatedAt: new Date().toISOString(), windKt: 8, windDir: 45,
    visibilityKm: 10, weatherCode: 1, waveM: .3, waveDir: 150, wavePeriod: 4,
    seaTemp: 24.1, currentKt: .4, currentDir: 215
  },
  map: null,
  userMarker: null,
  navigationActive: false,
  wakeLock: null,
  installPrompt: null
};

const spots = [
  { id:'sainte-marguerite', name:'Île Sainte-Marguerite', area:'Îles de Lérins', lat:43.5236, lng:7.0435, tags:['Famille','Baignade','Calme'], base:96, photo:'island' },
  { id:'argent-faux', name:'Anse de l’Argent Faux', area:'Cap d’Antibes', lat:43.5482, lng:7.1368, tags:['Snorkeling','Eau claire','Couple'], base:91, photo:'cove' },
  { id:'theoule', name:'Théoule-sur-Mer', area:'Corniche d’Or', lat:43.5074, lng:6.9438, tags:['Criques','Déjeuner','Paysage'], base:87, photo:'cape' }
];

const regulations = [
  {
    level:'warning', title:'Festival d’art pyrotechnique — Cannes', ref:'AP 2026-176',
    text:'Dérogation temporaire aux règles de la bande littorale. Vérifier les horaires et périmètres officiels avant navigation ou mouillage.',
    until:'28 août 2026', authority:'Préfecture maritime de la Méditerranée',
    url:'https://www.premar-mediterranee.gouv.fr/arretes?envigueur=on&motcle=Cannes'
  },
  {
    level:'info', title:'Bande littorale des 300 mètres', ref:'AP 167/2024',
    text:'Navigation, mouillage, plongée et activités nautiques sont réglementés autour de Cannes. Les dérogations temporaires doivent être superposées.',
    authority:'Préfecture maritime / Ville de Cannes',
    url:'https://www.cannes.com/fr/cadre-de-vie/prevention-des-risques-majeurs-securite/securite/arretes-permanents.html'
  },
  {
    level:'good', title:'ZMEL Sainte-Anne', ref:'ZMEL / AP 238-2025',
    text:'Zone de mouillage équipée au nord de Sainte-Marguerite, pour navires de 6 à 20 m en saison. Le mouillage forain autour est réglementé.',
    until:'30 septembre', authority:'Ville de Cannes',
    url:'https://www.cannes.com/fr/cadre-de-vie/plages-mer-nautisme/zone-de-mouillage-et-d-equipements-legers-zmel.html'
  }
];

const sources = [
  ['SHOM · Réglementation Navigation','Mouillages, chenaux et restrictions','https://www.data.gouv.fr/datasets/reglementation-navigation-1'],
  ['CACEM','Réglementations environnementales marines','https://www.data.gouv.fr/datasets/zones-reglementaires-cacem'],
  ['AVURNAV','Avis urgents aux navigateurs en vigueur','https://www.data.gouv.fr/datasets/avis-urgents-aux-navigateurs-en-vigueur-eaux-francaises-metropolitaines'],
  ['Préfecture maritime','Arrêtés et dérogations temporaires','https://www.premar-mediterranee.gouv.fr/arretes'],
  ['Ville de Cannes','Balisage, ZMEL et règles locales','https://www.cannes.com/fr/cadre-de-vie/prevention-des-risques-majeurs-securite/securite/arretes-permanents.html'],
  ['Copernicus Marine','Vagues, courants, température et océan','https://data.marine.copernicus.eu/'],
  ['Copernicus Data Space','Sentinel-1 / Sentinel-2 / Sentinel-3','https://dataspace.copernicus.eu/']
];

const $ = s => document.querySelector(s);
const root = $('#app');
const I = (name,size=19) => `<i data-lucide="${name}" style="width:${size}px;height:${size}px"></i>`;
const rad = d => d*Math.PI/180;
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const currentSpot = () => spots.find(s=>s.id===state.destination)||spots[0];

function distanceNm(a,b){
  const R=6371,dLat=rad(b.lat-a.lat),dLon=rad(b.lng-a.lng),p1=rad(a.lat),p2=rad(b.lat);
  const h=Math.sin(dLat/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h))*.539957;
}
function bearing(a,b){
  const p1=rad(a.lat),p2=rad(b.lat),d=rad(b.lng-a.lng);
  return (Math.atan2(Math.sin(d)*Math.cos(p2),Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(d))*180/Math.PI+360)%360;
}
function compass(d=0){ return ['N','NE','E','SE','S','SO','O','NO'][Math.round(d/45)%8]; }
function seaScore(){
  const c=state.conditions; let score=100;
  score-=Math.max(0,c.windKt-8)*1.6;
  score-=Math.max(0,c.waveM-.25)*25;
  score-=Math.max(0,8-c.visibilityKm)*2;
  if(c.weatherCode>=80) score-=12;
  if(c.weatherCode>=95) score-=25;
  return Math.round(clamp(score,25,99));
}
function spotScore(s){ return Math.round(clamp(s.base*.62+seaScore()*.38,20,99)); }
function freshness(){ return new Date(state.conditions.updatedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}); }
function suggestedReturn(){
  const d=new Date(); let h=18,m=30;
  if(state.conditions.waveM>.8||state.conditions.windKt>16){h=16;m=45}
  else if(state.conditions.waveM>.5||state.conditions.windKt>12){h=17;m=30}
  d.setHours(h,m,0,0); return d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
}
function gpsLabel(){
  if(state.gps.status==='live') return `GPS ±${Math.round(state.gps.accuracy||0)} m`;
  if(state.gps.status==='denied') return 'GPS refusé · démo Cannes';
  return 'Position démo · Cannes';
}

function header(title='Marine Companion', subtitle='Baie de Cannes'){
  return `<header class="app-header"><div><div class="brand"><span class="brand-icon">M</span><h1>${title}</h1><span class="mvp">MVP</span></div><div class="place"><span class="pulse"></span>${subtitle}</div></div><div class="header-buttons"><button data-screen="alerts" class="round">${I('bell')}</button><button data-screen="profile" class="round">${I('user-round')}</button></div></header>`;
}
function subHeader(title,subtitle){ return `<header class="sub-header"><button data-screen="home" class="round plain">${I('chevron-left',22)}</button><div><h1>${title}</h1><p>${subtitle}</p></div><span class="source-pill ${state.conditions.source==='live'?'live':''}">${state.conditions.source==='live'?'LIVE':'DÉMO'}</span></header>`; }
function bottomNav(){
  const nav=[['home','Accueil','home'],['map','Carte','map'],['journal','Journal','book-open'],['favorites','Favoris','star'],['profile','Profil','user-round']];
  return `<nav class="bottom-nav">${nav.map(([screen,label,ico])=>`<button data-screen="${screen}" class="${state.screen===screen?'active':''}">${I(ico,20)}<span>${label}</span></button>`).join('')}</nav>`;
}
function photo(type){ return `<div class="spot-photo ${type}"><span>${I('waves',16)}</span></div>`; }
function disclaimer(){ return `<p class="disclaimer">Aide à la décision uniquement. Vérifiez toujours cartes nautiques, AVURNAV, arrêtés, balisage et conditions réelles.</p>`; }

function home(){
  const c=state.conditions,s=seaScore(),best=spots[0];
  return `<main class="page">${header()}
    <section class="hero"><div id="hero-map" class="map hero-map"></div><div class="hero-shade"></div><div class="score-ring" style="--p:${s*3.6}deg"><div><small>SEA SCORE</small><b>${s}</b><span>/100</span></div></div><div class="hero-copy"><span class="source-pill ${c.source==='live'?'live':''}">${c.source==='live'?'DONNÉES LIVE':'MODE DÉMO'}</span><h2>${s>84?'Excellente sortie':s>69?'Bonne sortie':'Conditions à surveiller'}<br>aujourd’hui</h2><div class="conditions"><span>${I('wind',15)}${Math.round(c.windKt)} nds ${compass(c.windDir)}</span><span>${I('waves',15)}${c.waveM.toFixed(1)} m</span><span>${I('eye',15)}${Math.round(c.visibilityKm)} km</span></div></div></section>
    <button class="recommendation" data-destination="${best.id}">${photo(best.photo)}<div><small>MEILLEUR CHOIX</small><h3>${best.name}</h3><p>${distanceNm(state.position,best).toFixed(1)} NM · Score ${spotScore(best)}/100</p><strong>Retour conseillé avant ${suggestedReturn()}</strong></div>${I('chevron-right')}</button>
    <section class="action-grid">
      <button data-screen="nearby" class="action blue"><i>${I('compass',24)}</i><b>Autour de moi</b><span>Les meilleurs spots maintenant</span></button>
      <button data-screen="anchor" class="action green"><i>${I('anchor',24)}</i><b>Où mouiller</b><span>Zones et règles disponibles</span></button>
      <button data-screen="navigate" class="action mint"><i>${I('navigation',24)}</i><b>Y aller</b><span>GPS, route, ETA, conditions</span></button>
      <button data-screen="satellite" class="action purple"><i>${I('satellite',24)}</i><b>Satellite</b><span>Mer et observations</span></button>
    </section>
    <button data-screen="alerts" class="alert-entry"><i>${I('bell-ring',22)}</i><span><b>Alertes</b><small>Météo, AVURNAV, réglementation</small></span>${I('chevron-right')}</button>
    ${disclaimer()}
  </main>`;
}

function nearby(){
  return `<main class="page">${subHeader('Autour de moi','Spots classés selon les conditions actuelles')}<div class="chips"><span class="active">Calme</span><span>Famille</span><span>Snorkeling</span><span>Déjeuner</span></div><div id="nearby-map" class="map medium-map"></div><section class="spot-list">${spots.map(s=>`<button data-destination="${s.id}" class="spot-card">${photo(s.photo)}<div><div class="row"><h3>${s.name}</h3><span class="score-chip">${spotScore(s)}</span></div><p>${s.area} · ${distanceNm(state.position,s).toFixed(1)} NM</p><div class="tags">${s.tags.map(t=>`<span>${t}</span>`).join('')}</div></div>${I('chevron-right')}</button>`).join('')}</section>${disclaimer()}</main>`;
}

function anchor(){
  return `<main class="page map-page">${subHeader('Où mouiller','Règles + conditions + contexte de fond')}<div class="map-wrap"><div id="anchor-map" class="map tall-map"></div><div class="legend"><span><i class="dot green"></i>Zone suggérée</span><span><i class="dot red"></i>Précaution</span></div></div><section class="anchor-sheet"><div class="sheet-title"><span class="anchor-big">${I('anchor',24)}</span><div><small>SECTEUR SUGGÉRÉ</small><h2>Nord de Sainte-Marguerite</h2></div><span class="confidence">Confiance 78%</span></div><div class="metric-grid"><div><span>Profondeur</span><b>À vérifier</b></div><div><span>Fond</span><b>Donnée à intégrer</b></div><div><span>Vent</span><b>${Math.round(state.conditions.windKt)} nds ${compass(state.conditions.windDir)}</b></div></div><div class="notice warning">${I('triangle-alert',19)}<div><b>Géométrie indicative dans cette V0</b><p>Le polygone sert à valider l’UX. Il ne représente pas encore une délimitation réglementaire officielle.</p></div></div><a class="official-link" target="_blank" rel="noopener" href="${regulations[2].url}">${I('external-link',17)}Consulter la ZMEL officielle de Cannes</a></section>${disclaimer()}</main>`;
}

function navigate(){
  const d=currentSpot(), nm=distanceNm(state.position,d), speed=state.gps.speedKt>2?state.gps.speedKt:11, eta=Math.max(1,Math.round(nm/speed*60)), brg=bearing(state.position,d);
  return `<main class="page map-page">${subHeader('Y aller',d.name)}<section class="route-summary"><div><small>DÉPART</small><b>${state.gps.status==='live'?'Votre position GPS':'Port Pierre Canto (démo)'}</b></div><span>${I('arrow-right')}</span><div><small>DESTINATION</small><b>${d.name}</b></div></section><div class="trip-metrics"><div><b id="nav-eta">${eta} min</b><span>ETA</span></div><div><b id="nav-distance">${nm.toFixed(1)} NM</b><span>Distance</span></div><div><b>${seaScore()}/100</b><span>Confort</span></div></div><div id="navigation-map" class="map nav-map"></div><section class="nav-panel"><div class="nav-heading"><span><small>CAP CIBLE</small><b id="nav-bearing">${Math.round(brg)}°</b></span><span><small>VITESSE GPS</small><b id="nav-speed">${state.gps.speedKt.toFixed(1)} nds</b></span><span><small>PRÉCISION</small><b id="nav-accuracy">${gpsLabel()}</b></span></div><div class="return-banner">${I('clock-3',20)}<span><small>RETOUR CONSEILLÉ</small><b>Avant ${suggestedReturn()}</b></span></div><button id="nav-toggle" class="primary">${I(state.navigationActive?'square':'navigation',20)}${state.navigationActive?'Arrêter le guidage':'Démarrer le guidage'}</button><p class="tiny">Le tracé est une route indicative directe de démonstration. La V1 doit intégrer un graphe côtier, la bathymétrie et les obstacles officiels.</p></section>${disclaimer()}</main>`;
}

function satellite(){
  const c=state.conditions;
  return `<main class="page">${subHeader('Satellite','SEA FUSION · capteurs + modèles')}<div class="sat-tabs"><span class="active">Observation</span><span>AIS futur</span><span>Prévision</span></div><section class="sat-hero"><div id="satellite-map" class="map sat-map"></div><div class="sat-label"><span>${I('satellite',18)}</span><div><small>COUCHE SATELLITE</small><b>Connecteur Copernicus préparé</b></div></div></section><section class="science-grid"><div>${I('thermometer-sun')}<span>Température mer</span><b>${c.seaTemp.toFixed(1)} °C</b><small>Marine provider · ${freshness()}</small></div><div>${I('waves')}<span>Vagues</span><b>${c.waveM.toFixed(1)} m</b><small>${Math.round(c.wavePeriod)} s · ${compass(c.waveDir)}</small></div><div>${I('wind')}<span>Vent</span><b>${Math.round(c.windKt)} nds</b><small>${compass(c.windDir)} · ${freshness()}</small></div><div>${I('move-right')}<span>Courant</span><b>${c.currentKt.toFixed(1)} nds</b><small>${compass(c.currentDir)}</small></div></section><section class="data-card"><div class="row"><div><small>PROCHAINE BRIQUE</small><h3>Sentinel-1 + 2 + 3</h3></div><span class="confidence">Open data</span></div><p>Radar jour/nuit, image optique, température/couleur de l’eau et métadonnées de fraîcheur. Aucune fausse image « live » n’est affichée tant que le pipeline n’est pas branché.</p><a target="_blank" rel="noopener" href="https://dataspace.copernicus.eu/">${I('external-link',16)}Copernicus Data Space</a></section>${disclaimer()}</main>`;
}

function alerts(){
  const live=[];
  if(state.conditions.windKt>15) live.push(['warning','Vent soutenu',`${Math.round(state.conditions.windKt)} nds actuellement`]);
  if(state.conditions.waveM>.8) live.push(['warning','Mer formée',`${state.conditions.waveM.toFixed(1)} m de vagues`]);
  if(!live.length) live.push(['good','Conditions immédiates','Aucun seuil météo du prototype n’est dépassé.']);
  return `<main class="page">${subHeader('Alertes','Météo + textes officiels + sécurité')}<section class="alerts-list">${live.map(a=>`<div class="alert-card ${a[0]}">${I(a[0]==='good'?'circle-check':'triangle-alert',20)}<div><small>CONDITIONS LIVE</small><h3>${a[1]}</h3><p>${a[2]}</p></div></div>`).join('')}${regulations.map(r=>`<a target="_blank" rel="noopener" href="${r.url}" class="alert-card ${r.level}">${I(r.level==='warning'?'triangle-alert':r.level==='good'?'anchor':'info',20)}<div><small>${r.ref}</small><h3>${r.title}</h3><p>${r.text}</p><span>${r.authority}${r.until?' · jusqu’au '+r.until:''}</span></div>${I('external-link',16)}</a>`).join('')}</section><h2 class="section-title">Sources officielles prévues</h2><section class="source-list">${sources.map(s=>`<a target="_blank" rel="noopener" href="${s[2]}"><div><b>${s[0]}</b><span>${s[1]}</span></div>${I('external-link',16)}</a>`).join('')}</section>${disclaimer()}</main>`;
}

function fullMap(){ return `<main class="page map-page">${subHeader('Carte','Cannes · Antibes · Îles de Lérins')}<div id="full-map" class="map full-map"></div><section class="floating-card"><b>${gpsLabel()}</b><span>Position affichée sur le téléphone, sans tracking serveur dans la V0.</span></section></main>`; }
function journal(){ return `<main class="page">${header('Journal','Sorties et observations')}<section class="empty"><span>${I('book-open',30)}</span><h2>Votre journal de bord</h2><p>La V1 enregistrera localement les sorties, spots, conditions et notes. Aucune création de compte n’est nécessaire pour le MVP.</p></section></main>`; }
function favorites(){ return `<main class="page">${header('Favoris','Vos coins sauvegardés')}<section class="spot-list">${spots.slice(0,2).map(s=>`<button data-destination="${s.id}" class="spot-card">${photo(s.photo)}<div><h3>${s.name}</h3><p>${s.area}</p><div class="tags">${s.tags.slice(0,2).map(t=>`<span>${t}</span>`).join('')}</div></div>${I('chevron-right')}</button>`).join('')}</section></main>`; }
function profile(){ return `<main class="page">${header('Profil','Local-first')}<section class="profile-card"><div class="boat-avatar">${I('ship-wheel',30)}</div><div><small>PROFIL BATEAU DÉMO</small><h2>Open 7,5 m</h2><p>Le profil et les préférences resteront d’abord sur le téléphone.</p></div></section><section class="settings"><div>${I('shield-check')}<span><b>Vie privée</b><small>Pas de trace GPS permanente côté serveur</small></span></div><div>${I('database')}<span><b>Local-first</b><small>Cache PWA et données essentielles hors ligne</small></span></div><button id="install-app">${I('smartphone')}<span><b>Installer l’application</b><small>Ajouter cette PWA à l’écran d’accueil</small></span>${I('chevron-right')}</button></section></main>`; }

const pages={home,nearby,anchor,navigate,satellite,alerts,map:fullMap,journal,favorites,profile};
function render(){
  cleanupMap(); root.innerHTML=(pages[state.screen]||home)()+(state.screen==='alerts'?'':bottomNav());
  if(window.lucide) lucide.createIcons();
  bind(); setTimeout(initMap,0); window.scrollTo(0,0);
}
function bind(){
  document.querySelectorAll('[data-screen]').forEach(el=>el.onclick=()=>{state.screen=el.dataset.screen;render()});
  document.querySelectorAll('[data-destination]').forEach(el=>el.onclick=()=>{state.destination=el.dataset.destination;state.screen='navigate';render()});
  $('#nav-toggle')?.addEventListener('click',toggleNavigation);
  $('#install-app')?.addEventListener('click',installApp);
}

function cleanupMap(){ if(state.map){try{state.map.remove()}catch{} state.map=null} state.userMarker=null; }
function mapPin(kind='spot'){
  const el=document.createElement('div'); el.className=`map-pin ${kind}`; el.innerHTML=kind==='anchor'?'⚓':kind==='user'?'<span></span>':'•'; return el;
}
function makeMap(id,center,zoom=12,interactive=true){
  if(!window.maplibregl||!document.getElementById(id)) return null;
  const map=new maplibregl.Map({container:id,style:'https://tiles.openfreemap.org/styles/liberty',center:[center.lng,center.lat],zoom,interactive,attributionControl:{compact:true}});
  if(interactive) map.addControl(new maplibregl.NavigationControl(),'top-right');
  state.map=map; return map;
}
function addUser(map){ state.userMarker=new maplibregl.Marker({element:mapPin('user')}).setLngLat([state.position.lng,state.position.lat]).addTo(map); }
function addSpots(map,list=spots){ list.forEach(s=>new maplibregl.Marker({element:mapPin('spot')}).setLngLat([s.lng,s.lat]).setPopup(new maplibregl.Popup({offset:18}).setHTML(`<b>${s.name}</b><br><small>${s.area}</small>`)).addTo(map)); }
function circle(center,km,n=48){ const out=[];for(let i=0;i<=n;i++){const a=i/n*Math.PI*2;out.push([center.lng+(km/(111*Math.cos(rad(center.lat))))*Math.cos(a),center.lat+(km/111)*Math.sin(a)])}return out; }
function initMap(){
  if(state.screen==='home'){const m=makeMap('hero-map',{lat:43.536,lng:7.043},12.1,false);if(m)addUser(m)}
  if(state.screen==='nearby'){const m=makeMap('nearby-map',{lat:43.535,lng:7.045},11.2,true);if(m){addUser(m);addSpots(m)}}
  if(state.screen==='map'){const m=makeMap('full-map',state.position,11.4,true);if(m){addUser(m);addSpots(m)}}
  if(state.screen==='satellite'){const m=makeMap('satellite-map',{lat:43.535,lng:7.045},12,false);if(m)addUser(m)}
  if(state.screen==='anchor') initAnchorMap();
  if(state.screen==='navigate') initRouteMap();
}
function initAnchorMap(){
  const m=makeMap('anchor-map',{lat:43.536,lng:7.052},14,true); if(!m)return; addUser(m);
  new maplibregl.Marker({element:mapPin('anchor')}).setLngLat([7.052,43.537]).addTo(m);
  m.on('load',()=>{
    m.addSource('zones',{type:'geojson',data:{type:'FeatureCollection',features:[
      {type:'Feature',properties:{status:'suggested'},geometry:{type:'Polygon',coordinates:[circle({lat:43.537,lng:7.052},.34)]}},
      {type:'Feature',properties:{status:'caution'},geometry:{type:'Polygon',coordinates:[circle({lat:43.531,lng:7.048},.38)]}}
    ]}});
    m.addLayer({id:'zone-fill',type:'fill',source:'zones',paint:{'fill-color':['match',['get','status'],'suggested','#20a776','#e75a67'],'fill-opacity':.25}});
    m.addLayer({id:'zone-line',type:'line',source:'zones',paint:{'line-color':['match',['get','status'],'suggested','#0c8559','#c53d4a'],'line-width':2,'line-dasharray':[2,2]}});
  });
}
function initRouteMap(){
  const d=currentSpot(),center={lat:(state.position.lat+d.lat)/2,lng:(state.position.lng+d.lng)/2};
  const m=makeMap('navigation-map',center,12,true); if(!m)return; addUser(m);
  new maplibregl.Marker({element:mapPin('spot')}).setLngLat([d.lng,d.lat]).addTo(m);
  m.on('load',()=>{
    m.addSource('route',{type:'geojson',data:routeGeoJSON()});
    m.addLayer({id:'route-bg',type:'line',source:'route',paint:{'line-color':'#fff','line-width':8,'line-opacity':.9}});
    m.addLayer({id:'route',type:'line',source:'route',paint:{'line-color':'#0879ff','line-width':4.5}});
  });
}
function routeGeoJSON(){ const d=currentSpot();return {type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[[state.position.lng,state.position.lat],[d.lng,d.lat]]}}; }

async function getConditions(){
  const {lat,lng}=state.position;
  try{
    const weather=`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=wind_speed_10m,wind_direction_10m,visibility,weather_code&wind_speed_unit=kn&timezone=auto`;
    const marine=`https://marine-api.open-meteo.com/v1/marine?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=wave_height,wave_direction,wave_period,sea_surface_temperature,ocean_current_velocity,ocean_current_direction&wind_speed_unit=kn&timezone=auto`;
    const [wr,mr]=await Promise.all([fetch(weather),fetch(marine)]); if(!wr.ok||!mr.ok)throw new Error('provider');
    const w=await wr.json(),m=await mr.json();
    state.conditions={source:'live',updatedAt:m.current?.time||w.current?.time||new Date().toISOString(),windKt:w.current?.wind_speed_10m??8,windDir:w.current?.wind_direction_10m??45,visibilityKm:(w.current?.visibility??10000)/1000,weatherCode:w.current?.weather_code??1,waveM:m.current?.wave_height??.3,waveDir:m.current?.wave_direction??150,wavePeriod:m.current?.wave_period??4,seaTemp:m.current?.sea_surface_temperature??24.1,currentKt:m.current?.ocean_current_velocity??.4,currentDir:m.current?.ocean_current_direction??215};
    if(['home','nearby','navigate','satellite','alerts'].includes(state.screen)) render();
  }catch{ state.conditions.source='demo'; }
}

let weatherCell='';
function startGPS(){
  if(!navigator.geolocation){state.gps.status='unsupported';getConditions();return}
  navigator.geolocation.watchPosition(p=>{
    state.position={lat:p.coords.latitude,lng:p.coords.longitude};
    state.gps={status:'live',speedKt:Math.max(0,(p.coords.speed||0)*1.94384),heading:p.coords.heading,accuracy:p.coords.accuracy};
    state.userMarker?.setLngLat([state.position.lng,state.position.lat]); updateNavigation();
    const cell=state.position.lat.toFixed(2)+','+state.position.lng.toFixed(2); if(cell!==weatherCell){weatherCell=cell;getConditions()}
  },err=>{state.gps.status=err.code===1?'denied':'demo';getConditions()},{enableHighAccuracy:true,maximumAge:5000,timeout:12000});
}
function updateNavigation(){
  if(state.screen!=='navigate')return; const d=currentSpot(),nm=distanceNm(state.position,d),speed=state.gps.speedKt>2?state.gps.speedKt:11,eta=Math.max(1,Math.round(nm/speed*60)),brg=bearing(state.position,d);
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};
  set('nav-eta',`${eta} min`);set('nav-distance',`${nm.toFixed(1)} NM`);set('nav-bearing',`${Math.round(brg)}°`);set('nav-speed',`${state.gps.speedKt.toFixed(1)} nds`);set('nav-accuracy',gpsLabel());
  if(state.map?.getSource('route')) state.map.getSource('route').setData(routeGeoJSON());
}
async function toggleNavigation(){
  state.navigationActive=!state.navigationActive;
  if(state.navigationActive&&'wakeLock'in navigator){try{state.wakeLock=await navigator.wakeLock.request('screen')}catch{}}
  if(!state.navigationActive&&state.wakeLock){try{await state.wakeLock.release()}catch{}state.wakeLock=null}
  render();
}
async function installApp(){
  if(state.installPrompt){state.installPrompt.prompt();await state.installPrompt.userChoice;state.installPrompt=null;return}
  alert('iPhone : Safari → Partager → « Sur l’écran d’accueil ». Android/Chrome : menu → « Installer l’application ».');
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.installPrompt=e});
document.addEventListener('visibilitychange',async()=>{if(document.visibilityState==='visible'&&state.navigationActive&&'wakeLock'in navigator){try{state.wakeLock=await navigator.wakeLock.request('screen')}catch{}}});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));

render(); startGPS(); getConditions();
