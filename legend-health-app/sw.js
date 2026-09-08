const CACHE='legend-health-v8';
const ASSETS=['./','./index.html','./style.css','./app.js','./manifest.webmanifest','./assets/logo.jpeg'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate',e=>e.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(url.pathname.startsWith('/api/')) return;
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy));return r}).catch(()=>caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
self.addEventListener('push',e=>{
  let data={};
  try{data=e.data?e.data.json():{}}catch{data={body:e.data?.text()||'喝水時間到了'}}
  const title=data.title||'💧 喝水提醒';
  const options={
    body:data.body||'補充水分囉！',
    icon:'./assets/logo.jpeg',
    badge:'./assets/logo.jpeg',
    tag:data.tag||'legend-water-reminder',
    renotify:true,
    data:{url:data.url||'/?view=lifestyle'},
    actions:[{action:'open',title:'開啟紀錄'}]
  };
  e.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const target=new URL(e.notification.data?.url||'/?view=lifestyle',self.location.origin).href;
  e.waitUntil((async()=>{
    const list=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const c of list){if('focus'in c){await c.focus();if('navigate'in c)await c.navigate(target);return}}
    if(clients.openWindow)await clients.openWindow(target);
  })());
});
