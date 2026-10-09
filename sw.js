/* 曼米中文：這個網址已搬到新平台（Mandamy-Class）。
 * 舊版的離線快取不再使用：這個檔案會清掉舊快取並把自己取消註冊，之後頁面就只是一個跳轉頁。 */
self.addEventListener("install", function(){ self.skipWaiting(); });
self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.map(function(k){ return caches.delete(k); })); }).then(function(){ return self.registration.unregister(); }));
});
