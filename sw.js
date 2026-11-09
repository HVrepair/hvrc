/* HVRC業務：通知を受け取る裏の処理（GitHub の hvrc に index.html と同じ場所に置く） */
self.window = self;
try { importScripts('config.js'); } catch (e) { /* config.js がなくても通知の枠だけは出す */ }

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

// 画面（index.html）は毎回 GitHub に新しい版がないか確かめてから開く（古い画面のままにならないように）
self.addEventListener('fetch', function (e) {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).catch(function () { return fetch(e.request); }));
});

function idbGet(key) {
  return new Promise(function (resolve) {
    try {
      var req = indexedDB.open('hvrc', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
      req.onsuccess = function () {
        try {
          var g = req.result.transaction('kv', 'readonly').objectStore('kv').get(key);
          g.onsuccess = function () { resolve(g.result); };
          g.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      };
      req.onerror = function () { resolve(null); };
    } catch (e) { resolve(null); }
  });
}

self.addEventListener('push', function (e) {
  e.waitUntil(idbGet('pushSecret').then(function (secret) {
    var url = String(self.HV_API_URL || '');
    if (!url || !secret) return [];
    return fetch(url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'pushPull', token: '', payload: { secret: secret } }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { return (j && j.ok && j.data && j.data.notices) || []; })
      .catch(function () { return []; });
  }).then(function (list) {
    // iPhone は「届いたら必ず通知を出す」決まりなので、中身が取れなくても1件は出す
    if (!list.length) list = [{ id: 'hvrc', title: 'HVRC業務', body: '新しいお知らせがあります。アプリを開いて確認してください', url: './#/list' }];
    return Promise.all(list.map(function (n) {
      return self.registration.showNotification(n.title, { body: n.body, tag: n.id, data: { url: n.url }, icon: 'icon-192.png', badge: 'icon-192.png' });
    }));
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) {
        return c.focus().then(function (w) { return w && w.navigate ? w.navigate(url) : w; });
      }
    }
    return self.clients.openWindow(url);
  }));
});
