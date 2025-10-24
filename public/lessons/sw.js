/**
 * CalOS Lesson System - Service Worker
 * Enables offline functionality and caching for lessons
 */

const CACHE_NAME = 'calos-lessons-v1';
const OFFLINE_PAGE = '/lessons/index.html';

// Resources to cache immediately
const ESSENTIAL_RESOURCES = [
  '/lessons/',
  '/lessons/index.html',
  '/lessons/style.css',
  '/lessons/app.js',
  '/lessons/lessons.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install event - cache essential resources
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching essential resources');
        return cache.addAll(ESSENTIAL_RESOURCES);
      })
      .then(() => {
        console.log('[SW] Service worker installed successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Installation failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Network-first strategy for lessons.json (always get latest)
  if (url.pathname.includes('lessons.json')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first strategy for static assets (CSS, JS, images)
  if (url.pathname.match(/\.(css|js|png|jpg|jpeg|svg|gif|woff|woff2)$/)) {
    event.respondWith(
      caches.match(request)
        .then((response) => {
          if (response) {
            return response;
          }
          return fetch(request).then((response) => {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
            return response;
          });
        })
    );
    return;
  }

  // Network-first for lesson markdown files (prefer fresh content)
  if (url.pathname.includes('/docs/lessons/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Return offline page if no cache
            return caches.match(OFFLINE_PAGE);
          });
        })
    );
    return;
  }

  // Default: cache-first with network fallback
  event.respondWith(
    caches.match(request)
      .then((response) => {
        return response || fetch(request).then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        });
      })
      .catch(() => {
        // Return offline page if nothing else works
        if (request.destination === 'document') {
          return caches.match(OFFLINE_PAGE);
        }
      })
  );
});

// Background sync for progress tracking (if supported)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-progress') {
    console.log('[SW] Syncing progress data...');
    event.waitUntil(syncProgressData());
  }
});

// Sync progress data when back online
async function syncProgressData() {
  try {
    // Get progress from IndexedDB or localStorage
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: 'SYNC_PROGRESS',
        timestamp: Date.now()
      });
    });
    console.log('[SW] Progress data synced');
  } catch (error) {
    console.error('[SW] Failed to sync progress:', error);
  }
}

// Handle messages from clients
self.addEventListener('message', (event) => {
  const { type, data } = event.data;

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CACHE_LESSON':
      // Proactively cache a lesson
      if (data.url) {
        caches.open(CACHE_NAME).then((cache) => {
          cache.add(data.url);
        });
      }
      break;

    case 'CLEAR_CACHE':
      // Clear all caches
      caches.delete(CACHE_NAME).then(() => {
        event.ports[0].postMessage({ success: true });
      });
      break;
  }
});

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-lessons') {
    event.waitUntil(updateLessons());
  }
});

// Update lessons in background
async function updateLessons() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch('/lessons/lessons.json');
    await cache.put('/lessons/lessons.json', response);
    console.log('[SW] Lessons updated in background');
  } catch (error) {
    console.error('[SW] Failed to update lessons:', error);
  }
}

console.log('[SW] Service worker script loaded');
