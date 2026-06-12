/* SunPath Service Worker — アプリ本体をキャッシュしてオフライン起動を可能にする
   （地図タイル・地点検索はネット接続が必要） */
var CACHE = 'sunpath-v14';
var ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/leaflet.js',
  'vendor/suncalc.js'
];

self.addEventListener('install', function(e){
  // HTTPキャッシュの古いファイルを取り込まないよう、必ずネットワークから取得する
  e.waitUntil(
    caches.open(CACHE).then(function(cache){
      return Promise.all(ASSETS.map(function(url){
        return fetch(url, { cache: 'no-cache' }).then(function(res){
          if (res.ok || res.type === 'opaque') return cache.put(url, res);
        });
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; })
        .map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var url = new URL(e.request.url);

  // 地図タイル・ジオコーディングはキャッシュしない（量が多い／鮮度が必要）
  if (/arcgisonline\.com|tile\.openstreetmap\.org|nominatim\.openstreetmap\.org/.test(url.hostname)) return;

  // HTML はネット優先（更新を確実に反映）、オフライン時はキャッシュ
  if (e.request.mode === 'navigate' || url.pathname.endsWith('index.html')){
    e.respondWith(
      fetch(e.request).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(cache){ cache.put(e.request, copy); });
        return res;
      }).catch(function(){
        return caches.match(e.request).then(function(m){ return m || caches.match('index.html'); });
      })
    );
    return;
  }

  // その他（JS/CSS/アイコン）はキャッシュ優先
  e.respondWith(
    caches.match(e.request).then(function(m){
      return m || fetch(e.request).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(cache){ cache.put(e.request, copy); });
        return res;
      });
    })
  );
});
