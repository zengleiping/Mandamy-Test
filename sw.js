/* 曼米中文 Mandamy — Service Worker（離線教課）
 *
 * 目標：第一次有網路時打開 practice.html 之後，沒有網路也能打開頁面、函式庫、字型。
 *  - 頁面（practice.html）：網路優先（有網路就永遠拿最新版，不會卡在舊版），網路慢或斷線就用快取。
 *  - vendor/ 函式庫與圖示：快取優先（檔名內容固定，更新函式庫時要改 CACHE_VERSION）。
 *  - 字型、筆順資料（hanzi-writer-data）、Firebase SDK：看過一次就存下來，之後沒網路也能用。
 *  - Firebase 資料庫／登入的連線（*.firebasedatabase.app、*.googleapis.com/identitytoolkit…）完全不攔截。
 *
 * 更新這個檔案或 vendor/ 內容時，把 CACHE_VERSION 加一號，舊快取會在新版啟用時自動清掉。
 */
var CACHE_VERSION = "v2";
var PRECACHE = "mandamy-precache-" + CACHE_VERSION;
var RUNTIME = "mandamy-runtime-" + CACHE_VERSION;

var PRECACHE_URLS = [
  "practice.html",
  "manifest.webmanifest",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "vendor/xlsx.full.min.js",
  "vendor/hanzi-writer.min.js",
  "vendor/pinyin-pro.js",
  "vendor/pdf.min.js",
  "vendor/pdf.worker.min.js",
  "vendor/html2canvas.min.js",
  "vendor/jszip.min.js"
];

// 跨網域、要在執行時快取的資源（看過一次就存）。
function isRuntimeCacheable(url){
  if(url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") return true;
  if(url.hostname === "www.gstatic.com" && url.pathname.indexOf("/firebasejs/") === 0) return true;
  if(url.hostname === "cdn.jsdelivr.net" && url.pathname.indexOf("/npm/hanzi-writer-data") === 0) return true;
  return false;
}

self.addEventListener("install", function(event){
  event.waitUntil(
    caches.open(PRECACHE).then(function(cache){
      // 逐一加入：其中一個失敗（例如網路瞬斷）不要讓整個安裝失敗，下次打開頁面會再補。
      return Promise.all(PRECACHE_URLS.map(function(u){
        return cache.add(new Request(u, { cache: "reload" })).catch(function(err){ console.warn("[sw] precache 失敗", u, err); });
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){
        return (k.indexOf("mandamy-precache-") === 0 && k !== PRECACHE) || (k.indexOf("mandamy-runtime-") === 0 && k !== RUNTIME);
      }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function fetchWithTimeout(request, ms){
  return new Promise(function(resolve, reject){
    var done = false;
    var timer = setTimeout(function(){ if(!done){ done = true; reject(new Error("timeout")); } }, ms);
    fetch(request).then(function(res){ if(!done){ done = true; clearTimeout(timer); resolve(res); } },
                        function(err){ if(!done){ done = true; clearTimeout(timer); reject(err); } });
  });
}

// 頁面：網路優先（最多等 4 秒），失敗或逾時就用快取（忽略網址後面的 ?room=… 參數）
function networkFirstPage(request){
  return fetchWithTimeout(request, 4000).then(function(res){
    if(res && res.ok){
      var copy = res.clone();
      caches.open(PRECACHE).then(function(c){ c.put("practice.html", copy); });
    }
    return res;
  }).catch(function(){
    return caches.match("practice.html", { ignoreSearch: true }).then(function(hit){
      return hit || new Response("目前沒有網路，而且這台裝置還沒有存過離線版本。請先連上網路打開一次這個頁面。\nOffline and no saved copy yet — open this page once while online.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    });
  });
}

function cacheFirst(request, cacheName){
  return caches.match(request).then(function(hit){
    if(hit) return hit;
    return fetch(request).then(function(res){
      if(res && (res.ok || res.type === "opaque")){
        var copy = res.clone();
        caches.open(cacheName).then(function(c){ c.put(request, copy); });
      }
      return res;
    });
  });
}

// 字型 CSS 這類偶爾會更新的資源：先給快取、同時背景更新
function staleWhileRevalidate(request){
  return caches.open(RUNTIME).then(function(cache){
    return cache.match(request).then(function(hit){
      var network = fetch(request).then(function(res){
        if(res && (res.ok || res.type === "opaque")) cache.put(request, res.clone());
        return res;
      }).catch(function(){ return hit; });
      return hit || network;
    });
  });
}

self.addEventListener("fetch", function(event){
  var request = event.request;
  if(request.method !== "GET") return;
  var url = new URL(request.url);

  if(url.origin === self.location.origin){
    var path = url.pathname;
    // 頁面本身（含 ?room=… 的學生連結、直接開資料夾網址）
    var isPage = request.mode === "navigate" || /\/practice\.html$/.test(path);
    if(isPage && (/\/practice\.html$/.test(path))){
      event.respondWith(networkFirstPage(request));
      return;
    }
    if(/\/vendor\//.test(path) || /\/icons\//.test(path) || /\/manifest\.webmanifest$/.test(path)){
      event.respondWith(cacheFirst(request, PRECACHE));
      return;
    }
    return; // 其他同網域請求（例如 index.html、rules.json）照常走網路
  }

  if(isRuntimeCacheable(url)){
    if(url.hostname === "fonts.googleapis.com"){
      event.respondWith(staleWhileRevalidate(request));
    } else {
      event.respondWith(cacheFirst(request, RUNTIME));
    }
  }
});

// 頁面可以叫 Service Worker 立刻啟用新版
self.addEventListener("message", function(event){
  if(event.data === "skipWaiting") self.skipWaiting();
});
