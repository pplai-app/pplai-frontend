// Debug script for push notifications
// Run this in browser console to diagnose push notification issues

async function debugPushNotifications() {
    console.log('🔍 Starting Push Notification Debug...\n');
    
    // 1. Check browser support
    console.log('1️⃣ Browser Support Check:');
    const hasServiceWorker = 'serviceWorker' in navigator;
    const hasPushManager = 'PushManager' in window;
    const hasNotifications = 'Notification' in window;
    
    console.log(`   Service Worker: ${hasServiceWorker ? '✅' : '❌'}`);
    console.log(`   Push Manager: ${hasPushManager ? '✅' : '❌'}`);
    console.log(`   Notifications API: ${hasNotifications ? '✅' : '❌'}`);
    
    if (!hasServiceWorker || !hasPushManager || !hasNotifications) {
        console.error('❌ Browser does not support push notifications');
        return;
    }
    
    // 2. Check notification permission
    console.log('\n2️⃣ Notification Permission:');
    const permission = Notification.permission;
    console.log(`   Permission: ${permission}`);
    if (permission === 'denied') {
        console.error('❌ Notifications are blocked. Please enable in browser settings.');
        return;
    }
    if (permission === 'default') {
        console.warn('⚠️ Permission not yet requested. Will request now...');
        const newPermission = await Notification.requestPermission();
        console.log(`   New permission: ${newPermission}`);
        if (newPermission !== 'granted') {
            console.error('❌ Permission denied');
            return;
        }
    }
    
    // 3. Check service worker registration
    console.log('\n3️⃣ Service Worker Registration:');
    try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
            console.log('✅ Service Worker registered');
            console.log(`   Scope: ${registration.scope}`);
            console.log(`   Active: ${registration.active ? '✅' : '❌'}`);
            console.log(`   Waiting: ${registration.waiting ? '✅' : '❌'}`);
            console.log(`   Installing: ${registration.installing ? '✅' : '❌'}`);
        } else {
            console.error('❌ No service worker registered');
            console.log('   Attempting to register...');
            try {
                const newRegistration = await navigator.serviceWorker.register('/sw.js');
                console.log('✅ Service Worker registered successfully');
            } catch (error) {
                console.error('❌ Failed to register service worker:', error);
                return;
            }
        }
    } catch (error) {
        console.error('❌ Error checking service worker:', error);
        return;
    }
    
    // 4. Check push subscription
    console.log('\n4️⃣ Push Subscription:');
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        
        if (subscription) {
            console.log('✅ Push subscription exists');
            console.log(`   Endpoint: ${subscription.endpoint.substring(0, 50)}...`);
            
            // Get keys
            const p256dh = subscription.getKey('p256dh');
            const auth = subscription.getKey('auth');
            console.log(`   p256dh key: ${p256dh ? '✅' : '❌'}`);
            console.log(`   auth key: ${auth ? '✅' : '❌'}`);
        } else {
            console.warn('⚠️ No push subscription found');
            console.log('   Attempting to subscribe...');
            
            // Get VAPID public key from backend
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    console.error('❌ Not logged in. Please log in first.');
                    return;
                }
                
                const vapidResponse = await fetch('https://api.pplai.app/api/push/vapid-public-key', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (!vapidResponse.ok) {
                    console.error(`❌ Failed to get VAPID key: ${vapidResponse.status} ${vapidResponse.statusText}`);
                    const errorText = await vapidResponse.text();
                    console.error(`   Error: ${errorText}`);
                    return;
                }
                
                const vapidData = await vapidResponse.json();
                const vapidPublicKey = vapidData.publicKey;
                
                if (!vapidPublicKey) {
                    console.error('❌ VAPID public key not available');
                    return;
                }
                
                console.log('✅ Got VAPID public key');
                
                // Convert to Uint8Array
                function urlBase64ToUint8Array(base64String) {
                    const padding = '='.repeat((4 - base64String.length % 4) % 4);
                    const base64 = (base64String + padding)
                        .replace(/\-/g, '+')
                        .replace(/_/g, '/');
                    
                    const rawData = window.atob(base64);
                    const outputArray = new Uint8Array(rawData.length);
                    
                    for (let i = 0; i < rawData.length; ++i) {
                        outputArray[i] = rawData.charCodeAt(i);
                    }
                    return outputArray;
                }
                
                const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
                
                // Subscribe
                const newSubscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: applicationServerKey
                });
                
                console.log('✅ Subscribed to push notifications');
                console.log(`   Endpoint: ${newSubscription.endpoint.substring(0, 50)}...`);
                
                // Send subscription to backend
                function arrayBufferToBase64(buffer) {
                    const bytes = new Uint8Array(buffer);
                    let binary = '';
                    for (let i = 0; i < bytes.byteLength; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }
                    return window.btoa(binary);
                }
                
                const subscriptionData = {
                    endpoint: newSubscription.endpoint,
                    keys: {
                        p256dh: arrayBufferToBase64(newSubscription.getKey('p256dh')),
                        auth: arrayBufferToBase64(newSubscription.getKey('auth'))
                    },
                    user_agent: navigator.userAgent
                };
                
                const subscribeResponse = await fetch('https://api.pplai.app/api/push/subscribe', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(subscriptionData)
                });
                
                if (subscribeResponse.ok) {
                    console.log('✅ Subscription saved to backend');
                } else {
                    console.error(`❌ Failed to save subscription: ${subscribeResponse.status}`);
                    const errorText = await subscribeResponse.text();
                    console.error(`   Error: ${errorText}`);
                }
                
            } catch (error) {
                console.error('❌ Error subscribing:', error);
                return;
            }
        }
    } catch (error) {
        console.error('❌ Error checking push subscription:', error);
        return;
    }
    
    // 5. Test sending notification
    console.log('\n5️⃣ Testing Notification:');
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('❌ Not logged in. Cannot test notification.');
            return;
        }
        
        console.log('   Sending test notification request...');
        const response = await fetch('https://api.pplai.app/api/push/send-profile', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            console.log('✅ Notification request sent successfully');
            console.log(`   Sent to ${result.sent_count} device(s)`);
            console.log(`   Failed: ${result.failed_count}`);
            
            if (result.sent_count > 0) {
                console.log('✅ Check your notifications! You should see a notification.');
            } else {
                console.warn('⚠️ No notifications were sent. Check backend logs.');
            }
        } else {
            console.error(`❌ Failed to send notification: ${response.status}`);
            console.error(`   Error: ${JSON.stringify(result)}`);
        }
    } catch (error) {
        console.error('❌ Error testing notification:', error);
    }
    
    // 6. Check HTTPS
    console.log('\n6️⃣ Connection Security:');
    const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
    console.log(`   Protocol: ${window.location.protocol}`);
    console.log(`   Hostname: ${window.location.hostname}`);
    console.log(`   Secure: ${isSecure ? '✅' : '❌'}`);
    if (!isSecure) {
        console.error('❌ Push notifications require HTTPS (or localhost)');
    }
    
    console.log('\n✅ Debug complete!');
    console.log('\n📋 Summary:');
    console.log('   - Check the results above');
    console.log('   - If subscription exists, notifications should work');
    console.log('   - If test notification was sent, check your notification center');
    console.log('   - Check browser console for any errors');
}

// Run the debug function
debugPushNotifications();

