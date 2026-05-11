// ============================================================
//  sw.js — Service Worker for Classroom 72E
//  Web Push受信 + オフラインキャッシュ
// ============================================================

const CACHE_NAME = 'classroom72e-v1';
const OFFLINE_URLS = [
  './',
  './index.html',
  './manifest.json',
];

// ============================================================
//  インストール: オフラインキャッシュ
// ============================================================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

// ============================================================
//  アクティベート: 古いキャッシュを削除
// ============================================================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ============================================================
//  フェッチ: ネットワーク優先、失敗時キャッシュ
// ============================================================
self.addEventListener('fetch', event => {
  // GASへのPOSTはキャッシュしない
  if (event.request.method !== 'GET') return;
  // Chrome拡張など非http(s)はスキップ
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    fetch(event.request)
      .then(res => {
        // index.htmlはキャッシュ更新
        if (event.request.url.includes('index.html') || event.request.url.endsWith('/')) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

// ============================================================
//  Web Push受信
// ============================================================
self.addEventListener('push', event => {
  let data = { title: 'Classroom 72E', body: '新しい投稿があります' };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch(_) {
    try { data.body = event.data.text(); } catch(_) {}
  }

  const options = {
    body: data.body,
    icon: 'https://www.gstatic.com/classroom/logo_square_rounded.svg',
    badge: 'https://www.gstatic.com/classroom/logo_square_rounded.svg',
    tag: 'classroom72e-update',
    renotify: true,
    requireInteraction: false,
    data: { url: data.url || './' },
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ============================================================
//  通知クリック: アプリを開く
// ============================================================
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      // 既に開いているタブがあればフォーカス
      for (const win of wins) {
        if (win.url.includes('classroom') && 'focus' in win) {
          return win.focus();
        }
      }
      // なければ新規タブ
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ============================================================
//  Push購読更新（ブラウザがキーを回転させたとき）
// ============================================================
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: event.oldSubscription.options.applicationServerKey,
    }).then(sub => {
      // メインページに新しい購読情報を送る
      return clients.matchAll({ type: 'window' }).then(wins => {
        wins.forEach(win => win.postMessage({
          type: 'PUSH_SUBSCRIPTION_CHANGED',
          subscription: sub.toJSON(),
        }));
      });
    })
  );
});
