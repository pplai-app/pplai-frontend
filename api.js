// API Configuration
// Update this to your backend URL in production
// For production, set this via environment variable or build-time replacement
let API_BASE_URL = window.API_BASE_URL || 'http://localhost:8000/api';

// Force HTTPS if we're on HTTPS (fix at initialization time)
// This MUST happen before any API calls are made
(function() {
    if (!API_BASE_URL || API_BASE_URL.includes('${API_BASE_URL}')) {
        API_BASE_URL = 'http://localhost:8000/api';
    }
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
        if (API_BASE_URL.startsWith('http://')) {
            API_BASE_URL = API_BASE_URL.replace('http://', 'https://');
            console.warn('🔒 Mixed content prevention: Converted API_BASE_URL from HTTP to HTTPS:', API_BASE_URL);
            // Also update window.API_BASE_URL for consistency
            if (window.API_BASE_URL) {
                window.API_BASE_URL = API_BASE_URL;
            }
        }
        // Double-check: if still HTTP after conversion, force it
        if (API_BASE_URL.startsWith('http://')) {
            console.error('❌ ERROR: API_BASE_URL is still HTTP after conversion!', API_BASE_URL);
            API_BASE_URL = API_BASE_URL.replace('http://', 'https://');
            console.warn('🔒 Force-converted to HTTPS:', API_BASE_URL);
        }
    }
})();

// Helper to normalize API URLs and ensure HTTPS
function normalizeApiUrl(endpoint) {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    let cleanBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    
    // Force HTTPS if we're on HTTPS (mixed content prevention) - double check
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && cleanBaseUrl.startsWith('http://')) {
        cleanBaseUrl = cleanBaseUrl.replace('http://', 'https://');
        console.warn('Mixed content detected: Converting HTTP API URL to HTTPS:', cleanBaseUrl);
    }
    
    return `${cleanBaseUrl}${cleanEndpoint}`;
}

// Get auth token from localStorage
function getAuthToken() {
    return localStorage.getItem('authToken');
}

// Set auth token
function setAuthToken(token) {
    localStorage.setItem('authToken', token);
}

// Clear auth token
function clearAuthToken() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    // Clear all cache on logout
    if (typeof cacheInvalidation !== 'undefined') {
        cacheInvalidation.invalidateAll();
    }
}

// Get current user from localStorage
function getCurrentUser() {
    const userStr = localStorage.getItem('currentUser');
    return userStr ? JSON.parse(userStr) : null;
}

// Set current user
function setCurrentUser(user) {
    localStorage.setItem('currentUser', JSON.stringify(user));
}

// Cache for API responses (persistent localStorage cache)
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const CACHE_PREFIX = 'api_cache_';

// Get user ID for cache key scoping
function getUserIdForCache() {
    const user = getCurrentUser();
    return user ? user.id : 'anonymous';
}

// Generate cache key with user context
function getCacheKey(endpoint) {
    const userId = getUserIdForCache();
    return `${CACHE_PREFIX}${userId}_${endpoint}`;
}

// Check if response should be cached
function shouldCache(endpoint, method) {
    if (method && method !== 'GET') return false;
    const cacheableEndpoints = ['/profile', '/events', '/contacts', '/tags'];
    return cacheableEndpoints.some(ep => endpoint.includes(ep));
}

// Get cached response from localStorage
function getCachedResponse(endpoint) {
    try {
        const cacheKey = getCacheKey(endpoint);
        const cachedStr = localStorage.getItem(cacheKey);
        if (!cachedStr) return null;
        
        const cached = JSON.parse(cachedStr);
        const age = Date.now() - cached.timestamp;
        
        // Check if cache is expired
        if (age > CACHE_DURATION) {
            localStorage.removeItem(cacheKey);
            return null;
        }
        
        // Check if user changed (cache belongs to different user)
        const currentUserId = getUserIdForCache();
        if (cached.userId !== currentUserId) {
            // Clear old user's cache entries
            clearAllCache();
            return null;
        }
        
        return cached.data;
    } catch (error) {
        console.warn('Error reading cache:', error);
        return null;
    }
}

// Store response in localStorage cache
function setCachedResponse(endpoint, data) {
    try {
        const cacheKey = getCacheKey(endpoint);
        const cacheData = {
            data: data,
            timestamp: Date.now(),
            userId: getUserIdForCache()
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
        console.warn('Error saving cache:', error);
        // If storage is full, try to clear old caches
        if (error.name === 'QuotaExceededError') {
            clearOldCache();
            try {
                localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            } catch (e) {
                console.warn('Could not save cache after cleanup:', e);
            }
        }
    }
}

// Clear cache for specific endpoint pattern
function clearCachePattern(pattern) {
    try {
        const userId = getUserIdForCache();
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith(`${CACHE_PREFIX}${userId}_`) && key.includes(pattern)) {
                localStorage.removeItem(key);
            }
        });
    } catch (error) {
        console.warn('Error clearing cache pattern:', error);
    }
}

// Clear all cache for current user
function clearAllCache() {
    try {
        const userId = getUserIdForCache();
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith(`${CACHE_PREFIX}${userId}_`)) {
                localStorage.removeItem(key);
            }
        });
    } catch (error) {
        console.warn('Error clearing all cache:', error);
    }
}

// Clear old cache entries (older than 1 hour)
function clearOldCache() {
    try {
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith(CACHE_PREFIX)) {
                try {
                    const cached = JSON.parse(localStorage.getItem(key));
                    if (cached && cached.timestamp < oneHourAgo) {
                        localStorage.removeItem(key);
                    }
                } catch (e) {
                    // Invalid cache entry, remove it
                    localStorage.removeItem(key);
                }
            }
        });
    } catch (error) {
        console.warn('Error clearing old cache:', error);
    }
}

// Cache invalidation functions
const cacheInvalidation = {
    // Invalidate profile cache
    invalidateProfile() {
        clearCachePattern('/profile');
        // Also clear current user cache
        const user = getCurrentUser();
        if (user && user.id) {
            clearCachePattern(`/profile/${user.id}`);
        }
        console.log('Profile cache invalidated');
    },
    
    // Invalidate contacts cache (all contact-related endpoints)
    invalidateContacts() {
        clearCachePattern('/contacts');
        console.log('Contacts cache invalidated');
    },
    
    // Invalidate events cache
    invalidateEvents() {
        clearCachePattern('/events');
        console.log('Events cache invalidated');
    },
    
    // Invalidate tags cache
    invalidateTags() {
        clearCachePattern('/tags');
        console.log('Tags cache invalidated');
    },
    
    // Invalidate all cache
    invalidateAll() {
        clearAllCache();
        console.log('All cache invalidated');
    }
};

// API request helper with offline support
async function apiRequest(endpoint, options = {}) {
    const token = getAuthToken();
    const method = options.method || 'GET';
    
    // Don't set Content-Type for FormData, let browser set it with boundary
    const isFormData = options.body instanceof FormData;
    const headers = isFormData ? {} : {
        'Content-Type': 'application/json',
    };
    
    // Merge any additional headers
    if (options.headers) {
        Object.assign(headers, options.headers);
    }

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        debugLog('Token found, adding to headers');
    } else {
        debugWarn('No token found for request to:', endpoint);
    }

    // Initialize timeout controller early
    const timeout = 30000; // 30 seconds timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Check cache for GET requests (use cache even when online for performance)
    if (shouldCache(endpoint, method)) {
        const cached = getCachedResponse(endpoint);
        if (cached) {
            // Return cached data immediately, but also fetch fresh data in background
            if (navigator.onLine) {
                // Create a separate controller for background fetch (don't use timeout controller)
                const bgController = new AbortController();
                // Fetch fresh data in background (don't await)
                fetch(normalizeApiUrl(endpoint), {
                    ...options,
                    headers,
                    signal: bgController.signal,
                }).then(response => {
                    if (response.ok) {
                        return response.json();
                    }
                }).then(data => {
                    if (data) {
                        setCachedResponse(endpoint, data);
                    }
                }).catch(() => {
                    // Ignore background fetch errors
                });
            }
            clearTimeout(timeoutId); // Clear timeout since we're returning cached data
            console.log('Using cached data:', endpoint);
            return cached;
        }
    }

    let response;
    
    try {
        const fullUrl = normalizeApiUrl(endpoint);
        console.log(`Making ${method} request to: ${fullUrl}`);
        response = await fetch(fullUrl, {
            ...options,
            headers,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        console.log(`Response status: ${response.status} ${response.statusText}`);
        
        // Handle redirects (307, 308)
        if (response.status === 307 || response.status === 308) {
            const redirectUrl = response.headers.get('Location');
            console.log(`Redirect detected (${response.status}), following to: ${redirectUrl}`);
            // Follow redirect
            response = await fetch(redirectUrl, {
                ...options,
                headers,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            console.log(`After redirect - Response status: ${response.status} ${response.statusText}`);
        }
    } catch (fetchError) {
        clearTimeout(timeoutId);
        
        // Handle timeout
        if (fetchError.name === 'AbortError') {
            console.error('Request timeout:', endpoint);
            throw new Error(`Request timeout. The server took too long to respond.\n\nPossible causes:\n1. Database connection is hanging\n2. Backend server is stuck\n3. Network issues\n\nTry:\n1. Check backend terminal/logs for errors\n2. Verify database is running: ./check_setup.sh\n3. Restart the backend server`);
        }
        
        // Check if it's a CORS or network error
        if (fetchError.message.includes('Failed to fetch') || fetchError.message.includes('NetworkError')) {
            console.error('Network/CORS error:', fetchError);
            console.error('Request URL:', `${API_BASE_URL}${endpoint}`);
            console.error('Is server running? Check: http://localhost:8000/api/health');
            throw new Error(`Cannot connect to server. Please check:\n1. Backend server is running (http://localhost:8000/api/health)\n2. No CORS errors in browser console\n3. Network connection is active\n4. Database is running and accessible`);
        }
        
        // Try to return cached data if offline
        if (!navigator.onLine && shouldCache(endpoint, method)) {
            const cached = getCachedResponse(endpoint);
            if (cached) {
                console.warn('Using cached data (offline):', endpoint);
                return cached;
            }
        }
        
        console.error('Fetch error:', fetchError);
        throw new Error(`Network error: ${fetchError.message}. Please check if the backend server is running.`);
    }

    if (response.status === 401) {
        // Unauthorized - clear auth and redirect to login
        // Only redirect if we're not already on auth screen
        const authScreen = document.getElementById('authScreen');
        if (!authScreen || !authScreen.classList.contains('hidden')) {
            // Already on auth screen, don't redirect
            clearAuthToken();
            throw new Error('Unauthorized');
        }
        clearAuthToken();
        if (typeof showAuthScreen === 'function') {
            showAuthScreen();
        }
        throw new Error('Unauthorized');
    }

    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch (e) {
            errorData = { error: `Request failed with status ${response.status}` };
        }
        console.error('API error response:', errorData);
        throw new Error(errorData.error || errorData.detail || `Request failed with status ${response.status}`);
    }

    let data;
    try {
        data = await response.json();
        console.log('API response data:', data);
    } catch (e) {
        console.error('Failed to parse JSON response:', e);
        throw new Error('Invalid response from server');
    }
    
    // Cache successful GET responses
    if (response.ok && shouldCache(endpoint, method)) {
        setCachedResponse(endpoint, data);
    }
    
    return data;
}

// API methods
const api = {
    // Auth
    async oauthLogin(provider, email, name, photo, oauthId) {
        const data = await apiRequest('/auth/oauth', {
            method: 'POST',
            body: JSON.stringify({ provider, email, name, photo, oauth_id: oauthId }),
        });
        setAuthToken(data.token);
        setCurrentUser(data.user);
        // Clear all cache on login (new user session)
        cacheInvalidation.invalidateAll();
        return data;
    },

    async emailLogin(email, password, name = null) {
        const body = { email, password };
        if (name) {
            body.name = name;
        }
        const data = await apiRequest('/auth/email', {
            method: 'POST',
            body: JSON.stringify(body),
        });
        setAuthToken(data.token);
        setCurrentUser(data.user);
        // Clear all cache on login (new user session)
        cacheInvalidation.invalidateAll();
        return data;
    },

    // Profile
    async getProfile() {
        return apiRequest('/profile');
    },

    async updateProfile(profileData, photoFile) {
        const formData = new FormData();
        if (photoFile) formData.append('photo', photoFile);
        // Always send required fields
        if (profileData.name !== undefined) formData.append('name', profileData.name);
        if (profileData.email !== undefined) formData.append('email', profileData.email);
        // Send optional fields even if empty (so backend can clear them)
        if (profileData.role_company !== undefined) formData.append('role_company', profileData.role_company || '');
        if (profileData.mobile !== undefined) formData.append('mobile', profileData.mobile || '');
        if (profileData.whatsapp !== undefined) formData.append('whatsapp', profileData.whatsapp || '');
        if (profileData.linkedin_url !== undefined) formData.append('linkedin_url', profileData.linkedin_url || '');
        if (profileData.about_me !== undefined) formData.append('about_me', profileData.about_me || '');

        const token = getAuthToken();
        const response = await fetch(normalizeApiUrl('/profile'), {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(error.error || error.detail || 'Request failed');
        }

        const data = await response.json();
        setCurrentUser(data);
        
        // Invalidate profile cache (both current user and public profile)
        cacheInvalidation.invalidateProfile();
        // Also invalidate public profile cache for this user
        clearCachePattern(`/profile/${data.id}`);
        // Clear QR cache when profile is updated
        if (typeof clearQRCache === 'function') {
            clearQRCache(data.id, 'url');
            clearQRCache(data.id, 'vcard');
        }
        
        return data;
    },

    async getProfileQR(userId, mode = 'url') {
        return apiRequest(`/profile/qr/${userId}?mode=${mode}`);
    },

    async getPublicProfile(userId) {
        return apiRequest(`/profile/${userId}`);
    },

    // Events
    async getEvents() {
        return apiRequest('/events');
    },

    async getEvent(eventId) {
        return apiRequest(`/events/${eventId}`);
    },

    async createEvent(eventData) {
        const result = await apiRequest('/events', {
            method: 'POST',
            body: JSON.stringify(eventData),
        });
        cacheInvalidation.invalidateEvents();
        return result;
    },

    async updateEvent(eventId, eventData) {
        const result = await apiRequest(`/events/${eventId}`, {
            method: 'PUT',
            body: JSON.stringify(eventData),
        });
        cacheInvalidation.invalidateEvents();
        return result;
    },

    async importLumaEventFromUrl(url) {
        const result = await apiRequest('/luma/import-event', {
            method: 'POST',
            body: JSON.stringify({ url }),
        });
        cacheInvalidation.invalidateEvents();
        return result;
    },

    async importLumaEventsFromApi(apiKey, calendarId = null) {
        const result = await apiRequest('/luma/import-events', {
            method: 'POST',
            body: JSON.stringify({ api_key: apiKey, calendar_id: calendarId }),
        });
        cacheInvalidation.invalidateEvents();
        return result;
    },

    async deleteEvent(eventId) {
        const result = await apiRequest(`/events/${eventId}`, {
            method: 'DELETE',
        });
        cacheInvalidation.invalidateEvents();
        return result;
    },

    // Luma Integration
    async fetchLumaEventFromUrl(lumaUrl) {
        return apiRequest('/luma/fetch-from-url', {
            method: 'POST',
            body: JSON.stringify({ url: lumaUrl }),
        });
    },

    async fetchLumaEvents(apiKey, calendarId = null) {
        const body = { api_key: apiKey };
        if (calendarId) {
            body.calendar_id = calendarId;
        }
        return apiRequest('/luma/fetch-events', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    },

    // Contacts
    async getContacts(filters = {}) {
        const params = new URLSearchParams();
        if (filters.event_id) params.append('event_id', filters.event_id);
        if (filters.tag_id) params.append('tag_id', filters.tag_id);
        if (filters.date_range) params.append('date_range', filters.date_range);
        if (filters.date_from) params.append('date_from', filters.date_from);
        if (filters.date_to) params.append('date_to', filters.date_to);
        if (filters.is_favorite !== undefined) params.append('is_favorite', filters.is_favorite);
        
        const queryString = params.toString();
        const endpoint = queryString ? `/contacts?${queryString}` : '/contacts';
        return apiRequest(endpoint);
    },

    async getContact(contactId) {
        return apiRequest(`/contacts/${contactId}`);
    },

    async getContactFollowups(contactId) {
        const data = await apiRequest(`/contacts/${contactId}/followups`);
        // Contact intelligence may have been regenerated - invalidate cached contacts
        cacheInvalidation.invalidateContacts();
        return data;
    },

    async analyzeBusinessCard(file) {
        const formData = new FormData();
        formData.append('file', file, file.name || 'business-card.jpg');

        const token = getAuthToken();
        const response = await fetch(normalizeApiUrl('/ocr/business-card'), {
            method: 'POST',
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'OCR request failed' }));
            throw new Error(error.error || error.detail || 'OCR request failed');
        }

        return response.json();
    },

    async createContact(contactData, photoFile, mediaFiles) {
        const formData = new FormData();
        formData.append('name', contactData.name);
        if (contactData.email) formData.append('email', contactData.email);
        if (contactData.email_addresses) formData.append('email_addresses', contactData.email_addresses);
        if (contactData.role_company) formData.append('role_company', contactData.role_company);
        if (contactData.company) formData.append('company', contactData.company);
        if (contactData.website) formData.append('website', contactData.website);
        if (contactData.mobile) formData.append('mobile', contactData.mobile);
        if (contactData.phone_numbers) formData.append('phone_numbers', contactData.phone_numbers);
        if (contactData.linkedin_url) formData.append('linkedin_url', contactData.linkedin_url);
        if (contactData.meeting_context) formData.append('meeting_context', contactData.meeting_context);
        if (contactData.meeting_date) formData.append('meeting_date', contactData.meeting_date);
        if (contactData.event_id) formData.append('event_id', contactData.event_id);
        if (contactData.tags && contactData.tags.length > 0) {
            formData.append('tags', JSON.stringify(contactData.tags));
        }
        if (photoFile) formData.append('photo', photoFile);
        if (mediaFiles) {
            mediaFiles.forEach(file => formData.append('media', file));
        }

        const token = getAuthToken();
        const response = await fetch(normalizeApiUrl('/contacts'), {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(error.error || error.detail || 'Request failed');
        }

        const result = await response.json();
        cacheInvalidation.invalidateContacts();
        return result;
    },

    async updateContact(contactId, contactData, photoFile, mediaFiles) {
        const formData = new FormData();
        if (contactData.name) formData.append('name', contactData.name);
        if (contactData.email !== undefined) formData.append('email', contactData.email);
        if (contactData.email_addresses !== undefined) formData.append('email_addresses', contactData.email_addresses);
        if (contactData.role_company !== undefined) formData.append('role_company', contactData.role_company);
        if (contactData.company !== undefined) formData.append('company', contactData.company);
        if (contactData.website !== undefined) formData.append('website', contactData.website);
        if (contactData.mobile !== undefined) formData.append('mobile', contactData.mobile);
        if (contactData.phone_numbers !== undefined) formData.append('phone_numbers', contactData.phone_numbers);
        if (contactData.linkedin_url !== undefined) formData.append('linkedin_url', contactData.linkedin_url);
        if (contactData.meeting_context !== undefined) formData.append('meeting_context', contactData.meeting_context);
        if (contactData.meeting_date !== undefined && contactData.meeting_date !== null) {
            formData.append('meeting_date', contactData.meeting_date);
        }
        if (contactData.event_id !== undefined) formData.append('event_id', contactData.event_id);
        if (contactData.tags) {
            formData.append('tags', JSON.stringify(contactData.tags));
        }
        if (contactData.meeting_latitude !== null && contactData.meeting_latitude !== undefined) {
            formData.append('meeting_latitude', contactData.meeting_latitude.toString());
        }
        if (contactData.meeting_longitude !== null && contactData.meeting_longitude !== undefined) {
            formData.append('meeting_longitude', contactData.meeting_longitude.toString());
        }
        if (contactData.meeting_location_name !== undefined) {
            formData.append('meeting_location_name', contactData.meeting_location_name || '');
        }
        if (photoFile) formData.append('photo', photoFile);
        if (mediaFiles) {
            mediaFiles.forEach(file => formData.append('media', file));
        }

        const token = getAuthToken();
        const response = await fetch(normalizeApiUrl(`/contacts/${contactId}`), {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(error.error || error.detail || 'Request failed');
        }

        const result = await response.json();
        cacheInvalidation.invalidateContacts();
        return result;
    },

    async deleteContact(contactId) {
        const result = await apiRequest(`/contacts/${contactId}`, {
            method: 'DELETE',
        });
        cacheInvalidation.invalidateContacts();
        return result;
    },

    async toggleContactFavorite(contactId) {
        const result = await apiRequest(`/contacts/${contactId}/favorite`, {
            method: 'PATCH',
        });
        cacheInvalidation.invalidateContacts();
        return result;
    },

    async findContact(email, mobile) {
        const params = new URLSearchParams();
        if (email) params.append('email', email);
        if (mobile) params.append('mobile', mobile);
        try {
            return await apiRequest(`/contacts/find?${params.toString()}`);
        } catch (error) {
            // 404 means contact not found, return null
            if (error.message.includes('404') || error.message.includes('not found')) {
                return null;
            }
            throw error;
        }
    },

    async addMessageToContact(contactId, message) {
        const formData = new FormData();
        formData.append('message', message);
        const token = getAuthToken();
        const response = await fetch(normalizeApiUrl(`/contacts/${contactId}/message`), {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(error.error || error.detail || 'Request failed');
        }

        const result = await response.json();
        cacheInvalidation.invalidateContacts();
        return result;
    },

    async addMediaToContact(contactId, file) {
        const formData = new FormData();
        formData.append('file', file);
        const token = getAuthToken();
        const response = await fetch(normalizeApiUrl(`/contacts/${contactId}/media`), {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(error.error || error.detail || 'Request failed');
        }

        const result = await response.json();
        cacheInvalidation.invalidateContacts();
        return result;
    },

    // Follow-ups
    async getFollowups(contactId) {
        return apiRequest(`/followups/contact/${contactId}`);
    },

    async createFollowup(followupData) {
        const result = await apiRequest('/followups', {
            method: 'POST',
            body: JSON.stringify(followupData),
        });
        // Follow-ups are part of contacts, invalidate contacts cache
        cacheInvalidation.invalidateContacts();
        return result;
    },

    async updateFollowup(followupId, followupData) {
        const result = await apiRequest(`/followups/${followupId}`, {
            method: 'PUT',
            body: JSON.stringify(followupData),
        });
        // Follow-ups are part of contacts, invalidate contacts cache
        cacheInvalidation.invalidateContacts();
        return result;
    },

    async deleteFollowup(followupId) {
        const result = await apiRequest(`/followups/${followupId}`, {
            method: 'DELETE',
        });
        // Follow-ups are part of contacts, invalidate contacts cache
        cacheInvalidation.invalidateContacts();
        return result;
    },

    // Export
    async exportEventPDF(eventId) {
        const token = getAuthToken();
        const response = await fetch(normalizeApiUrl(`/export/event/${eventId}/pdf`), {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            throw new Error('Failed to export PDF');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `event_${eventId}_contacts.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    },

    async exportEventCSV(eventId) {
        const token = getAuthToken();
        const response = await fetch(normalizeApiUrl(`/export/event/${eventId}/csv`), {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            throw new Error('Failed to export CSV');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `event_${eventId}_contacts.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    },

    async exportContactsPDF(contactIds) {
        const token = getAuthToken();
        const response = await fetch(normalizeApiUrl('/export/contacts/pdf'), {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ contact_ids: contactIds }),
        });

        if (!response.ok) {
            throw new Error('Failed to export PDF');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `contacts_export_${contactIds.length}_contacts.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    },

    async exportContactsCSV(contactIds) {
        const token = getAuthToken();
        const response = await fetch(normalizeApiUrl('/export/contacts/csv'), {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ contact_ids: contactIds }),
        });

        if (!response.ok) {
            throw new Error('Failed to export CSV');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `contacts_export_${contactIds.length}_contacts.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    },

    // Tags
    async getTags(includeHidden = false) {
        return apiRequest(`/tags/?include_hidden=${includeHidden}`);
    },

    async getSystemTags() {
        return apiRequest('/tags/system');
    },

    async getTagsForManagement() {
        return apiRequest('/tags/manage/');
    },

    async createTag(name) {
        const result = await apiRequest('/tags/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name }),
        });
        cacheInvalidation.invalidateTags();
        return result;
    },

    async updateTag(tagId, name = null, isHidden = null) {
        const body = {};
        if (name !== null) body.name = name;
        if (isHidden !== null) body.is_hidden = isHidden;
        const result = await apiRequest(`/tags/${tagId}`, {
            method: 'PUT',
            body: JSON.stringify(body),
        });
        cacheInvalidation.invalidateTags();
        return result;
    },

    async deleteTag(tagId) {
        const result = await apiRequest(`/tags/${tagId}`, {
            method: 'DELETE',
        });
        cacheInvalidation.invalidateTags();
        return result;
    },

    // Admin
    async listAllUsers(skip = 0, limit = 100) {
        return apiRequest(`/admins/users?skip=${skip}&limit=${limit}`);
    },

    async getUser(userId) {
        return apiRequest(`/admins/users/${userId}`);
    },

    async createUser(userData) {
        const result = await apiRequest('/admins/users', {
            method: 'POST',
            body: JSON.stringify(userData),
        });
        // Admin operations might affect profile cache
        cacheInvalidation.invalidateProfile();
        return result;
    },

    async updateUser(userId, userData) {
        const result = await apiRequest(`/admins/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify(userData),
        });
        // Admin operations might affect profile cache
        cacheInvalidation.invalidateProfile();
        // Also invalidate public profile cache for this user
        clearCachePattern(`/profile/${userId}`);
        return result;
    },

    async deleteUser(userId) {
        const result = await apiRequest(`/admins/users/${userId}`, {
            method: 'DELETE',
        });
        // Admin operations might affect profile cache
        cacheInvalidation.invalidateProfile();
        // Also invalidate public profile cache for this user
        clearCachePattern(`/profile/${userId}`);
        return result;
    },

    async loginAsUser(userId) {
        const data = await apiRequest(`/admins/login-as/${userId}`, {
            method: 'POST',
        });
        setAuthToken(data.token);
        setCurrentUser(data.user);
        cacheInvalidation.invalidateAll();
        return data;
    },

    // Push Notifications
    async getVapidPublicKey() {
        return apiRequest('/push/vapid-public-key');
    },

    async subscribePush(subscription) {
        return apiRequest('/push/subscribe', {
            method: 'POST',
            body: JSON.stringify(subscription),
        });
    },

    async unsubscribePush(endpoint) {
        return apiRequest('/push/unsubscribe', {
            method: 'POST',
            body: JSON.stringify({ endpoint }),
        });
    },

    async sendProfileNotification() {
        return apiRequest('/push/send-profile', {
            method: 'POST',
        });
    },
};

