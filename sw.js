const VERSION='zhijiao-pwa-v6-orders';
const CORE=VERSION+'-core',MEDIA=VERSION+'-media';
const BASE=new URL('./',self.location.href);
const FILES=['./','./index.html','./checkout-config.js','./crowd3d.css','./crowd3d.js','./pwa.js','./vendor/styles.css','./vendor/lucide.min.js','./manifest.webmanifest','./offline.html','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png','./icons/favicon.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CORE).then(cache=>cache.addAll(FILES.map(path=>new URL(path,BASE).href)))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith('zhijiao-pwa-')&&![CORE,MEDIA].includes(key)).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET')return;
  const local=url.origin===BASE.origin&&url.pathname.startsWith(BASE.pathname);
  if(request.mode==='navigate'&&local){
    event.respondWith((async()=>{
      try{const response=await fetch(request);if(response.ok){const cache=await caches.open(CORE);await cache.put(new URL('./index.html',BASE).href,response.clone());return response;}}
      catch{}
      return (await caches.match(new URL('./index.html',BASE).href))||(await caches.match(new URL('./offline.html',BASE).href));
    })());return;
  }
  if(local&&url.pathname.endsWith('/checkout-config.js')){
    // 設定檔優先取最新版本，更換訂單網址後不必等快取更新。
    event.respondWith((async()=>{try{const response=await fetch(request);if(response.ok){const cache=await caches.open(CORE);await cache.put(request,response.clone());return response;}}catch{}return (await caches.match(request))||Response.error();})());return;
  }
  if(local){
    event.respondWith((async()=>{const cached=await caches.match(request);if(cached)return cached;return fetch(request)})());return;
  }
  // Save only public images and fonts visited by the user; never cache maps or bookings.
  if(!['image','font','style'].includes(request.destination)||!['images.unsplash.com','i.postimg.cc','fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))return;
  event.respondWith((async()=>{
    const cache=await caches.open(MEDIA),cached=await cache.match(request);if(cached)return cached;
    const response=await fetch(request);
    if(response.ok||response.type==='opaque'){await cache.put(request,response.clone());const keys=await cache.keys();if(keys.length>40)await cache.delete(keys[0]);}
    return response;
  })());
});
