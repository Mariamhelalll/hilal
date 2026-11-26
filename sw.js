const CACHE='hilal-v43';
const FILES=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);if(u.origin!==location.origin&&!/gstatic\.com$/.test(u.hostname))return;
  e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();if(new URL(e.request.url).origin===location.origin)caches.open(CACHE).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request).then(m=>m||caches.match('./index.html'))));
});
self.addEventListener('push',e=>{let d={};try{d=e.data?e.data.json():{}}catch(_){d={body:e.data&&e.data.text()}}
  e.waitUntil(Promise.all([self.registration.showNotification(d.title||'Hilal',{body:d.body||'',icon:'./icon-192.png',badge:'./icon-192.png',tag:d.tag||undefined,vibrate:[60,80,60,80,140],data:{url:d.url||'./'}}),
    clients.matchAll({type:'window',includeUncontrolled:true}).then(ws=>ws.forEach(w=>w.postMessage({type:'hilal-push',title:d.title||'',tag:d.tag||''})))]))});
self.addEventListener('notificationclick',e=>{e.notification.close();const u=new URL((e.notification.data&&e.notification.data.url)||'./',self.registration.scope).href;
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(ws=>{for(const w of ws){if('focus' in w){w.navigate&&w.navigate(u);return w.focus()}}return clients.openWindow(u)}))});
