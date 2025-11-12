/**
 * Offline Queue Manager
 * Handles storing and syncing contacts, events, and tags when offline
 */

const OFFLINE_QUEUE_KEY = 'offline_queue';
const SYNC_IN_PROGRESS_KEY = 'sync_in_progress';

// Convert File/Blob to base64 for offline storage
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1]; // Remove data:image/...;base64, prefix
            resolve({
                data: base64,
                name: file.name,
                type: file.type,
                size: file.size
            });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Convert base64 back to File
function base64ToFile(base64Data, fileName, mimeType) {
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new File([byteArray], fileName, { type: mimeType });
}

// Get offline queue
function getOfflineQueue() {
    try {
        const queueStr = localStorage.getItem(OFFLINE_QUEUE_KEY);
        return queueStr ? JSON.parse(queueStr) : [];
    } catch (error) {
        console.error('Error reading offline queue:', error);
        return [];
    }
}

// Save offline queue
function saveOfflineQueue(queue) {
    try {
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
        updateSyncIndicator();
    } catch (error) {
        console.error('Error saving offline queue:', error);
    }
}

// Add contact to offline queue
async function addContactToQueue(contactData, photoFile, mediaFiles) {
    const queue = getOfflineQueue();
    
    // Convert files to base64 for storage
    let photoBase64 = null;
    if (photoFile) {
        photoBase64 = await fileToBase64(photoFile);
    }
    
    const mediaBase64 = [];
    if (mediaFiles && mediaFiles.length > 0) {
        for (const file of mediaFiles) {
            const base64 = await fileToBase64(file);
            mediaBase64.push(base64);
        }
    }
    
    const queueItem = {
        id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'contact',
        contactData: contactData,
        photo: photoBase64,
        media: mediaBase64,
        timestamp: new Date().toISOString(),
        retries: 0
    };
    
    queue.push(queueItem);
    saveOfflineQueue(queue);
    
    console.log('Contact saved to offline queue:', queueItem.id);
    return queueItem;
}

// Add event to offline queue
function addEventToQueue(eventData, isUpdate = false, eventId = null) {
    const queue = getOfflineQueue();
    
    const queueItem = {
        id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'event',
        eventData: eventData,
        isUpdate: isUpdate,
        eventId: eventId, // For updates
        timestamp: new Date().toISOString(),
        retries: 0
    };
    
    queue.push(queueItem);
    saveOfflineQueue(queue);
    
    console.log(`Event ${isUpdate ? 'update' : 'creation'} saved to offline queue:`, queueItem.id);
    return queueItem;
}

// Add tag to offline queue
function addTagToQueue(tagData, operation = 'create', tagId = null) {
    const queue = getOfflineQueue();
    
    const queueItem = {
        id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'tag',
        tagData: tagData,
        operation: operation, // 'create', 'update', 'delete', 'hide'
        tagId: tagId, // For updates/deletes
        timestamp: new Date().toISOString(),
        retries: 0
    };
    
    queue.push(queueItem);
    saveOfflineQueue(queue);
    
    console.log(`Tag ${operation} saved to offline queue:`, queueItem.id);
    return queueItem;
}

// Remove item from offline queue
function removeFromOfflineQueue(itemId) {
    const queue = getOfflineQueue();
    const filtered = queue.filter(item => item.id !== itemId);
    saveOfflineQueue(filtered);
}

// Sync offline queue when online
async function syncOfflineQueue() {
    if (!navigator.onLine) {
        console.log('Still offline, cannot sync');
        return;
    }
    
    // Check if sync is already in progress
    if (localStorage.getItem(SYNC_IN_PROGRESS_KEY) === 'true') {
        console.log('Sync already in progress');
        return;
    }
    
    const queue = getOfflineQueue();
    if (queue.length === 0) {
        updateSyncIndicator();
        return;
    }
    
    localStorage.setItem(SYNC_IN_PROGRESS_KEY, 'true');
    updateSyncIndicator('Syncing...');
    
    const contacts = queue.filter(item => item.type === 'contact');
    const events = queue.filter(item => item.type === 'event');
    const tags = queue.filter(item => item.type === 'tag');
    
    console.log(`Syncing ${contacts.length} contacts, ${events.length} events, ${tags.length} tags...`);
    
    const failedItems = [];
    
    // Sync contacts
    for (const item of contacts) {
        try {
            // Convert base64 back to files
            let photoFile = null;
            if (item.photo) {
                photoFile = base64ToFile(item.photo.data, item.photo.name, item.photo.type);
            }
            
            const mediaFiles = [];
            if (item.media && item.media.length > 0) {
                for (const media of item.media) {
                    mediaFiles.push(base64ToFile(media.data, media.name, media.type));
                }
            }
            
            // Try to sync
            const result = await api.createContact(item.contactData, photoFile, mediaFiles);
            
            console.log('Successfully synced contact:', item.id, result.id);
            removeFromOfflineQueue(item.id);
            
        } catch (error) {
            console.error('Failed to sync contact:', item.id, error);
            item.retries++;
            
            // Remove after too many retries (10 attempts)
            if (item.retries >= 10) {
                console.warn('Removing contact after too many retries:', item.id);
                removeFromOfflineQueue(item.id);
            } else {
                failedItems.push(item);
            }
        }
    }
    
    // Sync events
    for (const item of events) {
        try {
            if (item.isUpdate && item.eventId) {
                // Update existing event
                await api.updateEvent(item.eventId, item.eventData);
                console.log('Successfully synced event update:', item.id);
            } else {
                // Create new event
                const result = await api.createEvent(item.eventData);
                console.log('Successfully synced event:', item.id, result.id);
            }
            removeFromOfflineQueue(item.id);
            
        } catch (error) {
            console.error('Failed to sync event:', item.id, error);
            item.retries++;
            
            if (item.retries >= 10) {
                console.warn('Removing event after too many retries:', item.id);
                removeFromOfflineQueue(item.id);
            } else {
                failedItems.push(item);
            }
        }
    }
    
    // Sync tags
    for (const item of tags) {
        try {
            if (item.operation === 'create') {
                const result = await api.createTag(item.tagData.name);
                console.log('Successfully synced tag creation:', item.id, result.id);
            } else if (item.operation === 'update' && item.tagId) {
                await api.updateTag(item.tagId, item.tagData.name, item.tagData.is_hidden);
                console.log('Successfully synced tag update:', item.id);
            } else if (item.operation === 'hide' && item.tagId) {
                await api.updateTag(item.tagId, null, item.tagData.is_hidden);
                console.log('Successfully synced tag hide/show:', item.id);
            } else if (item.operation === 'delete' && item.tagId) {
                await api.deleteTag(item.tagId);
                console.log('Successfully synced tag delete:', item.id);
            }
            removeFromOfflineQueue(item.id);
            
        } catch (error) {
            console.error('Failed to sync tag:', item.id, error);
            item.retries++;
            
            if (item.retries >= 10) {
                console.warn('Removing tag after too many retries:', item.id);
                removeFromOfflineQueue(item.id);
            } else {
                failedItems.push(item);
            }
        }
    }
    
    // Update queue with retry counts
    if (failedItems.length > 0) {
        const currentQueue = getOfflineQueue();
        const updatedQueue = currentQueue.map(item => {
            const failed = failedItems.find(f => f.id === item.id);
            return failed ? { ...item, retries: failed.retries } : item;
        });
        saveOfflineQueue(updatedQueue);
    }
    
    localStorage.removeItem(SYNC_IN_PROGRESS_KEY);
    updateSyncIndicator();
    
    const totalFailed = failedItems.length;
    const totalSynced = (contacts.length + events.length + tags.length) - totalFailed;
    
    if (totalFailed > 0) {
        console.warn(`${totalFailed} items failed to sync and will be retried`);
    } else {
        console.log(`All offline items synced successfully! (${totalSynced} items)`);
    }
    
    // Reload data after sync
    if (totalSynced > 0 && typeof loadEvents === 'function') {
        try {
            await loadEvents();
        } catch (e) {
            console.warn('Could not reload events after sync:', e);
        }
    }
    if (totalSynced > 0 && typeof loadTagsForManagement === 'function') {
        try {
            await loadTagsForManagement();
        } catch (e) {
            console.warn('Could not reload tags after sync:', e);
        }
    }
}

// Update sync indicator in UI
function updateSyncIndicator(status = null) {
    const queue = getOfflineQueue();
    const pendingCount = queue.length;
    const isSyncing = localStorage.getItem(SYNC_IN_PROGRESS_KEY) === 'true';
    
    // Count by type
    const contactsCount = queue.filter(item => item.type === 'contact').length;
    const eventsCount = queue.filter(item => item.type === 'event').length;
    const tagsCount = queue.filter(item => item.type === 'tag').length;
    
    // Update sync badge if it exists
    let syncBadge = document.getElementById('syncBadge');
    if (!syncBadge && pendingCount > 0) {
        // Create sync badge
        syncBadge = document.createElement('div');
        syncBadge.id = 'syncBadge';
        syncBadge.className = 'sync-badge';
        syncBadge.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: var(--primary, #667eea);
            color: white;
            padding: 12px 20px;
            border-radius: 25px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
        `;
        document.body.appendChild(syncBadge);
    }
    
    if (syncBadge) {
        if (pendingCount === 0 && !isSyncing) {
            syncBadge.remove();
            return;
        }
        
        if (isSyncing) {
            const typeBreakdown = [];
            if (contactsCount > 0) typeBreakdown.push(`${contactsCount} contact${contactsCount !== 1 ? 's' : ''}`);
            if (eventsCount > 0) typeBreakdown.push(`${eventsCount} event${eventsCount !== 1 ? 's' : ''}`);
            if (tagsCount > 0) typeBreakdown.push(`${tagsCount} tag${tagsCount !== 1 ? 's' : ''}`);
            
            syncBadge.innerHTML = `
                <span style="animation: spin 1s linear infinite;">⏳</span>
                <span>Syncing ${pendingCount} item${pendingCount !== 1 ? 's' : ''}...</span>
            `;
        } else {
            const typeBreakdown = [];
            if (contactsCount > 0) typeBreakdown.push(`${contactsCount} contact${contactsCount !== 1 ? 's' : ''}`);
            if (eventsCount > 0) typeBreakdown.push(`${eventsCount} event${eventsCount !== 1 ? 's' : ''}`);
            if (tagsCount > 0) typeBreakdown.push(`${tagsCount} tag${tagsCount !== 1 ? 's' : ''}`);
            
            syncBadge.innerHTML = `
                <span>📤</span>
                <span>${pendingCount} pending (${typeBreakdown.join(', ')})</span>
            `;
            syncBadge.onclick = () => syncOfflineQueue();
        }
    }
    
    // Add spin animation if not exists
    if (!document.getElementById('syncSpinStyle')) {
        const style = document.createElement('style');
        style.id = 'syncSpinStyle';
        style.textContent = `
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
}

// Initialize offline queue sync
function initOfflineSync() {
    // Sync when coming online
    window.addEventListener('online', () => {
        console.log('Network online, syncing offline queue...');
        syncOfflineQueue();
    });
    
    // Check for pending items on load
    if (navigator.onLine) {
        setTimeout(() => syncOfflineQueue(), 2000); // Wait 2 seconds after page load
    }
    
    // Update indicator
    updateSyncIndicator();
    
    // Periodic sync check (every 30 seconds when online)
    setInterval(() => {
        if (navigator.onLine && getOfflineQueue().length > 0) {
            syncOfflineQueue();
        }
    }, 30000);
}

// Export functions
window.offlineQueue = {
    addContact: addContactToQueue,
    addEvent: addEventToQueue,
    addTag: addTagToQueue,
    sync: syncOfflineQueue,
    getQueue: getOfflineQueue,
    clear: () => saveOfflineQueue([]),
    init: initOfflineSync
};

