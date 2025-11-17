// Service Worker for Push Notifications
// This handles background push notifications when the app is closed

const CACHE_NAME = 'pplai-app-v1';

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
    console.log('Push notification received:', event);
    
    let notificationData = {
        title: 'pplai.app',
        body: 'You have a new notification',
        icon: '/icon-192x192.png',
        badge: '/icon-96x96.png',
        tag: 'pplai-notification',
        requireInteraction: false,
        data: {}
    };
    
    // Parse push data if available
    if (event.data) {
        try {
            const data = event.data.json();
            notificationData = {
                title: data.title || notificationData.title,
                body: data.body || notificationData.body,
                icon: data.icon || notificationData.icon,
                badge: data.badge || notificationData.badge,
                image: data.image, // QR code image
                tag: data.tag || notificationData.tag,
                requireInteraction: data.requireInteraction || false,
                data: data.data || {},
                actions: data.actions || []
            };
        } catch (e) {
            // If JSON parsing fails, try text
            const text = event.data.text();
            if (text) {
                notificationData.body = text;
            }
        }
    }
    
    // Show notification
    event.waitUntil(
        self.registration.showNotification(notificationData.title, {
            body: notificationData.body,
            icon: notificationData.icon,
            badge: notificationData.badge,
            image: notificationData.image, // QR code will be shown here
            tag: notificationData.tag,
            requireInteraction: notificationData.requireInteraction,
            data: notificationData.data,
            actions: notificationData.actions,
            vibrate: [200, 100, 200],
            timestamp: Date.now()
        })
    );
});

// Notification click event - handle when user clicks notification
self.addEventListener('notificationclick', (event) => {
    console.log('Notification clicked:', event);
    
    event.notification.close();
    
    const data = event.notification.data || {};
    const urlToOpen = data.url || '/';
    
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            // If app is already open, focus it
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise, open a new window
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

// Message event - handle messages from the app
self.addEventListener('message', (event) => {
    console.log('Service Worker received message:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

