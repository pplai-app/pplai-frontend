// Global state
let currentEvent = null;
let currentUser = null;

// Debug mode - set to false in production
const DEBUG = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// Logging helper - only logs in debug mode
function debugLog(...args) {
    if (DEBUG) console.log(...args);
}

function debugWarn(...args) {
    if (DEBUG) console.warn(...args);
}

function debugError(...args) {
    // Always log errors
    console.error(...args);
}

// Ensure loading screen is hidden after timeout (fallback)
setTimeout(() => {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen && !loadingScreen.classList.contains('hidden')) {
        debugWarn('⚠️ Loading screen timeout - forcing auth screen');
        showAuthScreen();
    }
}, 5000);

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    debugLog('🚀 Initializing pplai.app...');
    
    // Check if required functions exist
    if (typeof getCurrentUser === 'undefined' || typeof getAuthToken === 'undefined') {
        debugError('❌ API functions not loaded! Check if api.js is loaded before script.js');
        // Force show auth screen
        showAuthScreen();
        return;
    }
    
    // Initialize Google OAuth when Google SDK loads
    if (typeof google !== 'undefined' && google.accounts) {
        initializeGoogleSignIn();
    } else {
        // Wait for Google SDK to load
        window.addEventListener('load', () => {
            if (typeof google !== 'undefined' && google.accounts) {
                initializeGoogleSignIn();
            }
        });
    }
    
    try {
        // Check if user is authenticated
        const user = getCurrentUser();
        const token = getAuthToken();
        
        debugLog('User check:', { hasUser: !!user, hasToken: !!token });

        if (user && token) {
            currentUser = user;
            try {
                // Verify token is still valid
                debugLog('Verifying token...');
                await api.getProfile();
                debugLog('Token valid, showing app');
                showApp();
                await loadInitialData();
                // Check admin status and show/hide admin nav button
                await checkAdminStatus();
            } catch (error) {
                debugError('Auth error:', error);
                clearAuthToken();
                showAuthScreen();
            }
        } else {
            debugLog('No user/token, showing auth screen');
            showAuthScreen();
        }

        setupEventListeners();
        initializeEmailAuthForm();
        
        // Initialize offline sync
        if (typeof offlineQueue !== 'undefined' && offlineQueue.init) {
            offlineQueue.init();
        }
        
        debugLog('✅ Initialization complete');
    } catch (error) {
        debugError('❌ Initialization error:', error);
        debugError('Error details:', error.stack);
        // Always show auth screen if something goes wrong
        showAuthScreen();
    }
});

// Setup event listeners
function setupEventListeners() {
    // Auth - Google OAuth is handled by initializeGoogleSignIn
    // Only add fallback listener if Google OAuth not initialized
    if (typeof google === 'undefined' || !google.accounts) {
        document.getElementById('googleSignIn')?.addEventListener('click', handleGoogleSignIn);
    }
    document.getElementById('linkedinSignIn')?.addEventListener('click', handleLinkedInSignIn);
    document.getElementById('emailSignIn')?.addEventListener('click', handleEmailSignIn);
    document.getElementById('emailSignUp')?.addEventListener('click', handleEmailSignUp);
    document.getElementById('emailAuthToggle')?.addEventListener('click', toggleEmailAuthMode);
    document.getElementById('quickAuthBtn')?.addEventListener('click', () => {
        const user = getCurrentUser();
        if (user) {
            handleLogout();
        } else {
            showAuthScreen();
        }
    });

    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const view = e.currentTarget.dataset.view;
            switchView(view);
        });
    });

    // Profile
    document.getElementById('editProfileBtn')?.addEventListener('click', openProfileModal);
    document.getElementById('saveProfileBtn')?.addEventListener('click', saveProfile);
    document.getElementById('shareProfileBtn')?.addEventListener('click', shareProfile);
    document.getElementById('manageTagsBtn')?.addEventListener('click', () => switchView('tags'));
    document.getElementById('qrModeToggle')?.addEventListener('change', handleQRModeToggle);
    document.getElementById('closeCompletenessBtn')?.addEventListener('click', () => {
        const card = document.getElementById('profileCompletenessCard');
        if (card) {
            card.style.display = 'none';
            // Store preference in localStorage
            localStorage.setItem('hideProfileCompleteness', 'true');
        }
    });

    // Events
    document.getElementById('addEventBtn')?.addEventListener('click', openEventModal);
    document.getElementById('saveEventBtn')?.addEventListener('click', saveEvent);
    document.getElementById('eventsSearchInput')?.addEventListener('input', filterEvents);
    document.getElementById('clearEventsSearch')?.addEventListener('click', clearEventsSearch);
    
    // Contacts search
    document.getElementById('contactsSearchInput')?.addEventListener('input', filterContactsBySearch);
    document.getElementById('clearContactsSearch')?.addEventListener('click', clearContactsSearch);
    
    // Contacts
    document.getElementById('scanQRCard')?.addEventListener('click', openQRScanner);
    document.getElementById('scanCardCard')?.addEventListener('click', openBusinessCardScanner);
    document.getElementById('scanEventPassCard')?.addEventListener('click', openEventPassScanner);
    document.getElementById('manualEntryCard')?.addEventListener('click', openContactModal);
    document.getElementById('addContactBtn')?.addEventListener('click', () => switchView('home'));
    document.getElementById('filterContactsBtn')?.addEventListener('click', toggleContactsFilters);
    document.getElementById('selectContactsBtn')?.addEventListener('click', toggleSelectionMode);
    document.getElementById('selectAllContactsBtn')?.addEventListener('click', selectAllContacts);
    document.getElementById('deselectAllContactsBtn')?.addEventListener('click', deselectAllContacts);
    document.getElementById('bulkSaveBtn')?.addEventListener('click', bulkSaveContacts);
    document.getElementById('bulkExportBtn')?.addEventListener('click', bulkExportContacts);
    document.getElementById('bulkAddTagBtn')?.addEventListener('click', bulkAddTagToContacts);
    document.getElementById('bulkDeleteBtn')?.addEventListener('click', bulkDeleteContacts);
    document.getElementById('saveContactBtn')?.addEventListener('click', saveContact);
    document.getElementById('saveContactFromViewBtn')?.addEventListener('click', async () => {
        if (currentViewingContactId && currentViewingContact) {
            await saveContactFromView();
        }
    });
    document.getElementById('editContactBtn')?.addEventListener('click', () => {
        if (currentViewingContactId) {
            editContact(currentViewingContactId);
        }
    });
    
    document.getElementById('deleteContactBtn')?.addEventListener('click', () => {
        if (currentViewingContactId && currentViewingContact) {
            deleteContact(currentViewingContactId, currentViewingContact.name);
        }
    });
    
    // Contact action buttons
    document.getElementById('saveToContactsBtn')?.addEventListener('click', saveContactToDevice);
    document.getElementById('emailContactBtn')?.addEventListener('click', emailContact);
    document.getElementById('callContactBtn')?.addEventListener('click', callContact);
    document.getElementById('messageContactBtn')?.addEventListener('click', messageContact);
    document.getElementById('whatsappContactBtn')?.addEventListener('click', whatsappContact);
    
    // Chat button in contact view modal
    document.getElementById('chatContactBtn')?.addEventListener('click', () => {
        if (currentViewingContactId && currentViewingContact) {
            openChatView(currentViewingContactId, currentViewingContact.name);
        }
    });
    
    // Chat functionality (removed - using dedicated chat view instead)
    
    // Chat View functionality
    document.getElementById('chatBackBtn')?.addEventListener('click', () => {
        // Navigate back to contacts view
        switchView('contacts');
    });
    document.getElementById('chatViewSendBtn')?.addEventListener('click', sendChatViewMessage);
    document.getElementById('chatViewMessageInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatViewMessage();
        }
    });
    document.getElementById('chatViewPhotoBtn')?.addEventListener('click', () => {
        document.getElementById('chatViewPhotoInput')?.click();
    });
    document.getElementById('chatViewPhotoInput')?.addEventListener('change', handleChatViewPhotoSelect);
    document.getElementById('chatViewVoiceBtn')?.addEventListener('click', startVoiceRecording);
    document.getElementById('chatViewStopRecording')?.addEventListener('click', stopVoiceRecording);
    document.getElementById('createTagBtn')?.addEventListener('click', createNewTag);
    document.getElementById('newTagName')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            createNewTag();
        }
    });
    document.getElementById('eventFilter')?.addEventListener('change', filterContacts);
    document.getElementById('tagFilter')?.addEventListener('change', filterContacts);
    document.getElementById('dateFilter')?.addEventListener('change', handleDateFilterChange);
    document.getElementById('dateFrom')?.addEventListener('change', filterContacts);
    document.getElementById('dateTo')?.addEventListener('change', filterContacts);
    document.getElementById('unselectEventBtn')?.addEventListener('click', unselectEvent);
    document.getElementById('currentEventBanner')?.addEventListener('click', (e) => {
        // Don't navigate if clicking the unselect button
        if (e.target.closest('#unselectEventBtn')) {
            return;
        }
        // Always redirect to events page when clicking the banner
        switchView('events');
    });

    // Admin view
    document.getElementById('createUserBtn')?.addEventListener('click', openCreateUserModal);
    document.getElementById('saveAdminUserBtn')?.addEventListener('click', saveAdminUser);
    document.getElementById('adminSearchInput')?.addEventListener('input', filterAdminUsers);
    document.getElementById('clearAdminSearch')?.addEventListener('click', clearAdminSearch);

    // Contact form
    document.getElementById('contactContext')?.addEventListener('input', updateCharCount);
    document.getElementById('tagInput')?.addEventListener('keypress', handleTagInput);
    // Tag suggestions are loaded dynamically, so we don't need static listeners
    document.getElementById('addMediaBtn')?.addEventListener('click', () => {
        document.getElementById('mediaInput')?.click();
    });
    document.getElementById('mediaInput')?.addEventListener('change', handleMediaUpload);

    // Photo uploads
    setupPhotoUpload('profilePhotoUpload', 'profilePhotoInput', 'profilePhotoPreview');
    setupPhotoUpload('contactPhotoUpload', 'contactPhotoInput', 'contactPhotoPreview');

    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal && modal.id === 'qrScannerModal') {
                closeQRScanner();
            } else {
                closeModal();
            }
        });
    });

    // Close modal on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                if (modal.id === 'qrScannerModal') {
                    closeQRScanner();
                } else {
                    closeModal();
                }
            }
        });
    });
}

// Screen management
function showAuthScreen() {
    console.log('Showing auth screen');
    const loadingScreen = document.getElementById('loadingScreen');
    const authScreen = document.getElementById('authScreen');
    const appContainer = document.getElementById('appContainer');
    
    if (loadingScreen) loadingScreen.classList.add('hidden');
    if (authScreen) authScreen.classList.remove('hidden');
    if (appContainer) appContainer.classList.add('hidden');
    
    // Update auth button state
    updateAuthButton();
    
    console.log('Auth screen shown');
}

function showApp() {
    console.log('Showing app');
    const loadingScreen = document.getElementById('loadingScreen');
    const authScreen = document.getElementById('authScreen');
    const appContainer = document.getElementById('appContainer');
    
    if (loadingScreen) loadingScreen.classList.add('hidden');
    if (authScreen) authScreen.classList.add('hidden');
    if (appContainer) appContainer.classList.remove('hidden');
    
    // Update auth button state
    updateAuthButton();
    
    // Update current event banner to ensure it's visible if there's a current event
    updateCurrentEventBanner();
    
    console.log('App shown');
}

function updateAuthButton() {
    const btn = document.getElementById('quickAuthBtn');
    const icon = document.getElementById('authBtnIcon');
    const user = getCurrentUser();
    
    if (btn && icon) {
        if (user) {
            // User is logged in - show logout icon
            btn.title = 'Logout';
            icon.innerHTML = `
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
            `;
        } else {
            // User is not logged in - show login icon
            btn.title = 'Login';
            icon.innerHTML = `
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            `;
        }
    }
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        clearAuthToken();
        currentUser = null;
        currentEvent = null;
        localStorage.removeItem('currentEventId');
        updateAuthButton();
        showAuthScreen();
    }
}

function switchView(viewName) {
    // Close any open modals first
    closeModal();
    
    // Hide all views
    document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
    
    // Show selected view
    document.getElementById(`${viewName}View`)?.classList.remove('hidden');

    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Load view-specific data
    if (viewName === 'events') loadEvents();
    if (viewName === 'contacts') {
        loadContacts();
        loadTagFilter(); // Load tags for filter dropdown
    }
    if (viewName === 'profile') loadProfile();
    if (viewName === 'tags') loadTagsForManagement();
    if (viewName === 'admin') loadAllUsers();
    if (viewName === 'home') {
        // Ensure current event banner is visible when on home page
        updateCurrentEventBanner();
    }
    // Chat view is handled by openChatView function
}

// Initialize Google OAuth
function initializeGoogleSignIn() {
    // Check if Google OAuth is loaded
    if (typeof google !== 'undefined' && google.accounts) {
        // Get Client ID from window (injected from environment) or use default
        const clientId = window.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';
        
        if (clientId === 'YOUR_GOOGLE_CLIENT_ID' || !clientId) {
            // Client ID not configured, use fallback
            console.warn('Google OAuth Client ID not configured, using fallback');
            return;
        }
        
        google.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true
        });
        
        // Use promptOne for one-tap sign-in, or attach to existing button
        const googleBtn = document.getElementById('googleSignIn');
        if (googleBtn) {
            // Replace button content with Google's button
            googleBtn.innerHTML = '';
            google.accounts.id.renderButton(googleBtn, {
                theme: 'outline',
                size: 'large',
                width: '100%',
                text: 'signin_with',
                locale: 'en'
            });
        }
    }
}

// Handle Google OAuth response
async function handleGoogleCredentialResponse(response) {
    try {
        // Decode the JWT token (basic decode, in production verify on backend)
        const payload = JSON.parse(atob(response.credential.split('.')[1]));
        
        const email = payload.email;
        const name = payload.name;
        const picture = payload.picture;
        const sub = payload.sub; // Google user ID
        
        // Send to backend
        await api.oauthLogin('google', email, name, picture, sub);
        currentUser = getCurrentUser();
        showApp();
        await loadInitialData();
    } catch (error) {
        console.error('Google OAuth error:', error);
        alert('Google sign-in failed: ' + error.message);
    }
}

// Auth handlers
async function handleGoogleSignIn() {
    // If Google OAuth is initialized, it will handle the click
    // Otherwise, use fallback
    if (typeof google === 'undefined' || !google.accounts) {
        const email = prompt('Enter your email:');
        const name = prompt('Enter your name:');
        if (email && name) {
            try {
                await api.oauthLogin('google', email, name, null, null);
                currentUser = getCurrentUser();
                showApp();
                await loadInitialData();
            } catch (error) {
                alert('Login failed: ' + error.message);
            }
        }
    }
}

async function handleLinkedInSignIn() {
    // In production, use LinkedIn OAuth SDK
    const email = prompt('Enter your email:');
    const name = prompt('Enter your name:');
    if (email && name) {
        try {
            await api.oauthLogin('linkedin', email, name, null, null);
            currentUser = getCurrentUser();
            showApp();
            await loadInitialData();
        } catch (error) {
            alert('Login failed: ' + error.message);
        }
    }
}

let isSignUpMode = false;

function toggleEmailAuthMode() {
    isSignUpMode = !isSignUpMode;
    const nameInput = document.getElementById('nameInput');
    const signInBtn = document.getElementById('emailSignIn');
    const signUpBtn = document.getElementById('emailSignUp');
    const toggleText = document.getElementById('emailAuthToggle');
    
    if (isSignUpMode) {
        // Show name input for signup
        if (nameInput) {
            nameInput.style.display = 'block';
            nameInput.required = true;
        }
        if (signInBtn) signInBtn.style.display = 'none';
        if (signUpBtn) signUpBtn.style.display = 'block';
        if (toggleText) {
            toggleText.innerHTML = 'Already have an account? <span style="color: var(--primary);">Sign in</span>';
        }
    } else {
        // Hide name input for signin
        if (nameInput) {
            nameInput.style.display = 'none';
            nameInput.required = false;
        }
        if (signInBtn) signInBtn.style.display = 'block';
        if (signUpBtn) signUpBtn.style.display = 'none';
        if (toggleText) {
            toggleText.innerHTML = 'Don\'t have an account? <span style="color: var(--primary);">Sign up</span>';
        }
    }
}

// Initialize email auth form state
function initializeEmailAuthForm() {
    const nameInput = document.getElementById('nameInput');
    const signInBtn = document.getElementById('emailSignIn');
    const signUpBtn = document.getElementById('emailSignUp');
    
    // Start in sign-in mode
    isSignUpMode = false;
    if (nameInput) {
        nameInput.style.display = 'none';
        nameInput.required = false;
    }
    if (signInBtn) signInBtn.style.display = 'block';
    if (signUpBtn) signUpBtn.style.display = 'none';
}

async function handleEmailSignIn() {
    const email = document.getElementById('emailInput')?.value?.trim();
    const password = document.getElementById('passwordInput')?.value;
    const signInBtn = document.getElementById('emailSignIn');
    
    if (!email) {
        alert('Please enter your email');
        return;
    }
    
    if (!password) {
        alert('Please enter your password');
        return;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        alert('Please enter a valid email address');
        return;
    }
    
    // Disable button and show loading state
    if (signInBtn) {
        signInBtn.disabled = true;
        const originalText = signInBtn.textContent;
        signInBtn.textContent = 'Signing in...';
        
        try {
            debugLog('Attempting email login...');
            const response = await api.emailLogin(email, password);
            debugLog('Login successful');
            
            // Verify token was saved
            const savedToken = getAuthToken();
            if (!savedToken) {
                debugError('Token was not saved after login!');
                alert('Login succeeded but token was not saved. Please try again.');
                return;
            }
            
            currentUser = getCurrentUser();
            debugLog('Current user set:', currentUser?.email);
            
            showApp();
            await loadInitialData();
            await checkAdminStatus();
        } catch (error) {
            debugError('Login error:', error);
            alert('Login failed: ' + (error.message || 'Unknown error'));
        } finally {
            // Re-enable button
            if (signInBtn) {
                signInBtn.disabled = false;
                signInBtn.textContent = originalText;
            }
        }
    } else {
        // Fallback if button not found
        try {
            console.log('Attempting email login...');
            const response = await api.emailLogin(email, password);
            console.log('Login successful:', response);
            
            currentUser = getCurrentUser();
            showApp();
            await loadInitialData();
        } catch (error) {
            console.error('Login error:', error);
            alert('Login failed: ' + (error.message || 'Unknown error'));
        }
    }
}

async function handleEmailSignUp() {
    const email = document.getElementById('emailInput')?.value?.trim();
    const password = document.getElementById('passwordInput')?.value;
    const name = document.getElementById('nameInput')?.value?.trim();
    const signUpBtn = document.getElementById('emailSignUp');
    
    if (!email) {
        alert('Please enter your email');
        return;
    }
    
    if (!password) {
        alert('Please enter your password');
        return;
    }
    
    if (!name) {
        alert('Please enter your name');
        return;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        alert('Please enter a valid email address');
        return;
    }
    
    // Validate password strength
    if (password.length < 6) {
        alert('Password must be at least 6 characters long');
        return;
    }
    
    // Disable button and show loading state
    if (signUpBtn) {
        signUpBtn.disabled = true;
        const originalText = signUpBtn.textContent;
        signUpBtn.textContent = 'Signing up...';
        
        try {
            console.log('Attempting email signup...');
            const response = await api.emailLogin(email, password, name);
            console.log('Signup successful:', response);
            
            currentUser = getCurrentUser();
            console.log('Current user set:', currentUser);
            
            showApp();
            await loadInitialData();
        } catch (error) {
            console.error('Signup error:', error);
            alert('Sign up failed: ' + (error.message || 'Unknown error'));
        } finally {
            // Re-enable button
            if (signUpBtn) {
                signUpBtn.disabled = false;
                signUpBtn.textContent = originalText;
            }
        }
    } else {
        // Fallback if button not found
        try {
            console.log('Attempting email signup...');
            const response = await api.emailLogin(email, password, name);
            console.log('Signup successful:', response);
            
            currentUser = getCurrentUser();
            showApp();
            await loadInitialData();
        } catch (error) {
            console.error('Signup error:', error);
            alert('Sign up failed: ' + (error.message || 'Unknown error'));
        }
    }
}

// Load initial data
async function loadInitialData() {
    try {
        // Load current event from localStorage
        const savedEventId = localStorage.getItem('currentEventId');
        if (savedEventId) {
            try {
                currentEvent = await api.getEvent(savedEventId);
                updateCurrentEventBanner();
            } catch (error) {
                localStorage.removeItem('currentEventId');
            }
        }

        // Load profile QR code
        if (currentUser) {
            await loadProfileQR();
        }
    } catch (error) {
        console.error('Error loading initial data:', error);
    }
}

// Profile functions
// Add network status badge
function initNetworkStatus() {
    const badge = document.createElement('div');
    badge.id = 'networkStatusBadge';
    badge.className = 'network-status';
    badge.textContent = '🟢 Online';
    document.body.appendChild(badge);
    updateNetworkStatus();
}

function updateNetworkStatus() {
    const indicator = document.getElementById('offlineIndicator');
    const badge = document.getElementById('networkStatusBadge');
    
    if (navigator.onLine) {
        if (indicator) indicator.classList.add('hidden');
        if (badge) {
            badge.textContent = '🟢 Online';
            badge.classList.remove('offline');
        }
    } else {
        if (indicator) indicator.classList.remove('hidden');
        if (badge) {
            badge.textContent = '🔴 Offline';
            badge.classList.add('offline');
        }
    }
}

async function loadProfile() {
    // Check if user is authenticated before making request
    const user = getCurrentUser();
    const token = getAuthToken();
    
    if (!user || !token) {
        console.warn('No user or token, cannot load profile');
        // Don't redirect, just show empty state
const profileView = document.getElementById('profileView');
        if (profileView) {
            profileView.innerHTML = `
                <div class="view-header">
                    <h2>My Profile</h2>
                </div>
                <div class="empty-state">
                    <p>Please log in to view your profile</p>
                </div>
            `;
        }
        return;
    }

    try {
        const profile = await api.getProfile();
        displayProfile(profile);
        await loadProfileQR();
    } catch (error) {
        console.error('Error loading profile:', error);
        
        // If unauthorized, let the apiRequest handle redirect
        if (error.message === 'Unauthorized') {
            // This will be handled by apiRequest
            return;
        }
        
        // For other errors, show error message but stay on profile view
        const profileView = document.getElementById('profileView');
        if (profileView) {
            const existingContent = profileView.innerHTML;
            profileView.innerHTML = `
                <div class="view-header">
                    <h2>My Profile</h2>
                </div>
                <div class="empty-state">
                    <p>Error loading profile: ${error.message}</p>
                    <button class="btn btn-primary" onclick="loadProfile()">Retry</button>
                </div>
            `;
        }
    }
}

let qrMode = 'url'; // 'url' or 'vcard'

// QR Cache management
function getQRCacheKey(userId, mode) {
    return `qr_cache_${userId}_${mode}`;
}

function getUserProfileHash(user) {
    // Create a hash of user profile data to detect changes
    const profileData = `${user.id}_${user.name}_${user.email}_${user.mobile}_${user.role_company}_${user.linkedin_url}_${user.profile_photo_url}_${currentEvent?.id || 'none'}`;
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < profileData.length; i++) {
        const char = profileData.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
}

function getCachedQR(userId, mode) {
    try {
        const cacheKey = getQRCacheKey(userId, mode);
        const cached = localStorage.getItem(cacheKey);
        if (!cached) return null;
        
        const cacheData = JSON.parse(cached);
        const profileHash = getUserProfileHash(currentUser);
        
        // Check if profile has changed
        if (cacheData.profileHash !== profileHash) {
            console.log('Profile changed, invalidating QR cache');
            clearQRCache(userId, mode);
            return null;
        }
        
        // Check if cache is expired (24 hours)
        const cacheAge = Date.now() - cacheData.timestamp;
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        if (cacheAge > maxAge) {
            console.log('QR cache expired');
            clearQRCache(userId, mode);
            return null;
        }
        
        return cacheData;
    } catch (error) {
        console.warn('Error reading QR cache:', error);
        return null;
    }
}

function setCachedQR(userId, mode, data) {
    try {
        const cacheKey = getQRCacheKey(userId, mode);
        const profileHash = getUserProfileHash(currentUser);
        const cacheData = {
            data: data,
            profileHash: profileHash,
            timestamp: Date.now()
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
        console.warn('Error saving QR cache:', error);
        // If storage is full, try to clear old caches
        try {
            clearAllQRCache();
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        } catch (e) {
            console.warn('Could not save QR cache:', e);
        }
    }
}

function clearQRCache(userId, mode) {
    try {
        const cacheKey = getQRCacheKey(userId, mode);
        localStorage.removeItem(cacheKey);
    } catch (error) {
        console.warn('Error clearing QR cache:', error);
    }
}

function clearAllQRCache() {
    try {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith('qr_cache_')) {
                localStorage.removeItem(key);
            }
        });
    } catch (error) {
        console.warn('Error clearing all QR cache:', error);
    }
}

async function loadProfileQR() {
    // Use backend QR generation for better reliability
    const canvas = document.getElementById('profileQRCode');
    if (!canvas) {
        console.error('QR canvas not found');
        return;
    }
    
    if (!currentUser) {
        console.warn('No current user for QR');
        return;
    }
    
    try {
        // Get QR code from backend
        const mode = qrMode || 'url';
        const response = await api.getProfileQR(currentUser.id, mode);
        
        if (response.qr_code) {
            // Display the QR code image
            const img = new Image();
            img.onload = () => {
                const ctx = canvas.getContext('2d');
                canvas.width = 300;
                canvas.height = 300;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                console.log(`${mode} QR code loaded from backend`);
            };
            img.onerror = () => {
                debugError('Failed to load QR image from backend');
                showQRGenerationError(canvas, 'Failed to load QR code image');
            };
            img.src = response.qr_code;
            
            // Cache the response
            if (mode === 'vcard' && response.vcard) {
                setCachedQR(currentUser.id, 'vcard', {
                    vcard: response.vcard
                });
            }
        } else {
            debugWarn('No QR code in response from backend');
            showQRGenerationError(canvas, 'QR code generation failed');
        }
    } catch (error) {
        debugError('Backend QR generation failed:', error);
        showQRGenerationError(canvas, 'Failed to load QR code. Please try again.');
    }
}

function showQRGenerationError(canvas, message) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = 300;
    canvas.height = 300;
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ef4444';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(message, canvas.width / 2, canvas.height / 2 - 10);
    ctx.fillText('Please refresh the page', canvas.width / 2, canvas.height / 2 + 10);
}

// Client-side QR generation removed - using backend QR generation only

function generateVCard(user) {
    // vCard format (RFC 6350)
    let vcard = 'BEGIN:VCARD\n';
    vcard += 'VERSION:3.0\n';
    vcard += `FN:${escapeVCardValue(user.name || '')}\n`;
    vcard += `N:${escapeVCardValue(user.name || '')};;;;\n`;
    
    if (user.email) {
        vcard += `EMAIL:${escapeVCardValue(user.email)}\n`;
    }
    
    if (user.mobile) {
        vcard += `TEL;TYPE=CELL:${escapeVCardValue(user.mobile)}\n`;
    }
    
    if (user.whatsapp) {
        vcard += `TEL;TYPE=CELL,WA:${escapeVCardValue(user.whatsapp)}\n`;
    }
    
    if (user.linkedin_url) {
        vcard += `URL:${escapeVCardValue(user.linkedin_url)}\n`;
    }
    
    if (user.role_company) {
        vcard += `TITLE:${escapeVCardValue(user.role_company)}\n`;
    }
    
    if (user.about_me) {
        vcard += `NOTE:${escapeVCardValue(user.about_me)}\n`;
    }
    
    if (user.profile_photo_url) {
        vcard += `PHOTO;VALUE=URI:${escapeVCardValue(user.profile_photo_url)}\n`;
    }
    
    // Add pplai.app profile URL
    const frontendUrl = window.location.origin || 'http://localhost:8080';
    const pplaiProfileUrl = `${frontendUrl}/profile/${user.id}`;
    vcard += `URL;TYPE=PPLAI:${escapeVCardValue(pplaiProfileUrl)}\n`;
    
    // Add pplai.app custom fields
    const now = new Date();
    const dateConnected = now.toISOString().split('T')[0]; // YYYY-MM-DD format
    vcard += `X-PPLAI-DATE-CONNECTED:${escapeVCardValue(dateConnected)}\n`;
    
    // Add readable date format for "Date Connected on pplai.app"
    const dateConnectedReadable = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    vcard += `X-PPLAI-DATE-CONNECTED-READABLE:${escapeVCardValue(dateConnectedReadable)}\n`;
    
    // Add current event name if selected
    if (currentEvent && currentEvent.name) {
        vcard += `X-PPLAI-EVENT:${escapeVCardValue(currentEvent.name)}\n`;
    }
    
    // Add notes with date and event name
    let notes = `Connected via pplai.app on ${now.toLocaleDateString()}`;
    if (currentEvent && currentEvent.name) {
        notes += ` at ${currentEvent.name}`;
    }
    vcard += `X-PPLAI-NOTES:${escapeVCardValue(notes)}\n`;
    
    // Note: Tags would need to be passed separately or retrieved from user's profile
    // For now, we'll leave tags empty in the vCard
    
    vcard += 'END:VCARD';
    return vcard;
}

function escapeVCardValue(value) {
    if (!value) return '';
    // Escape special characters in vCard
    return value
        .replace(/\\/g, '\\\\')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;')
        .replace(/\n/g, '\\n');
}

function handleQRModeToggle(e) {
    qrMode = e.target.checked ? 'vcard' : 'url';
    console.log('QR Mode changed to:', qrMode);
    const description = document.getElementById('qrModeDescription');
    if (description) {
        description.textContent = qrMode === 'vcard' 
            ? 'Contains contact data (works offline)' 
            : 'Contains profile link (requires network)';
    }
    // Force reload QR with new mode
    loadProfileQR();
}

function handleOnline() {
    updateNetworkStatus();
    // Retry failed requests
    retryFailedRequests();
    // Sync offline queue
    if (typeof offlineQueue !== 'undefined' && offlineQueue.sync) {
        offlineQueue.sync();
    }
    // Reload data if needed
    if (currentUser) {
        loadProfileQR();
    }
}

function handleOffline() {
    updateNetworkStatus();
    // Switch to vCard QR if in URL mode
    if (qrMode === 'url') {
        const toggle = document.getElementById('qrModeToggle');
        if (toggle) {
            toggle.checked = true;
            handleQRModeToggle({ target: toggle });
        }
    }
}

// Store failed requests for retry
const failedRequests = [];

// Contact action functions
let currentViewingContact = null;

function updateContactActionButtons(contact) {
    currentViewingContact = contact;
    
    // Email button
    const emailBtn = document.getElementById('emailContactBtn');
    if (emailBtn) {
        emailBtn.style.display = contact.email ? 'flex' : 'none';
    }
    
    // Call button
    const callBtn = document.getElementById('callContactBtn');
    if (callBtn) {
        callBtn.style.display = contact.mobile ? 'flex' : 'none';
    }
    
    // Message button
    const messageBtn = document.getElementById('messageContactBtn');
    if (messageBtn) {
        messageBtn.style.display = contact.mobile ? 'flex' : 'none';
    }
    
    // WhatsApp button
    const whatsappBtn = document.getElementById('whatsappContactBtn');
    if (whatsappBtn) {
        whatsappBtn.style.display = (contact.mobile || contact.whatsapp) ? 'flex' : 'none';
    }
}

function saveContactToDevice() {
    if (!currentViewingContact) return;
    
    // Generate vCard
    const vcard = generateContactVCard(currentViewingContact);
    const blob = new Blob([vcard], { type: 'text/vcard' });
    const url = URL.createObjectURL(blob);
    
    // Try Web Share API first (works on mobile)
    if (navigator.share && navigator.canShare) {
        const file = new File([blob], `${currentViewingContact.name.replace(/\s+/g, '_')}.vcf`, { type: 'text/vcard' });
        if (navigator.canShare({ files: [file] })) {
            navigator.share({
                title: `Save ${currentViewingContact.name}`,
                text: `Contact card for ${currentViewingContact.name}`,
                files: [file]
            }).then(() => {
                URL.revokeObjectURL(url);
            }).catch(() => {
                // Fallback to download
                downloadVCard(url, currentViewingContact.name);
            });
            return;
        }
    }
    
    // Fallback to download
    downloadVCard(url, currentViewingContact.name);
}

function downloadVCard(url, name) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '_')}.vcf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function generateContactVCard(contact) {
    let vcard = 'BEGIN:VCARD\n';
    vcard += 'VERSION:3.0\n';
    vcard += `FN:${escapeVCardValue(contact.name || '')}\n`;
    vcard += `N:${escapeVCardValue(contact.name || '')};;;;\n`;
    
    if (contact.email) {
        vcard += `EMAIL:${escapeVCardValue(contact.email)}\n`;
    }
    
    if (contact.mobile) {
        vcard += `TEL;TYPE=CELL:${escapeVCardValue(contact.mobile)}\n`;
    }
    
    if (contact.whatsapp) {
        vcard += `TEL;TYPE=CELL,WA:${escapeVCardValue(contact.whatsapp)}\n`;
    }
    
    if (contact.linkedin_url) {
        vcard += `URL:${escapeVCardValue(contact.linkedin_url)}\n`;
    }
    
    if (contact.role_company) {
        vcard += `TITLE:${escapeVCardValue(contact.role_company)}\n`;
    }
    
    if (contact.meeting_context) {
        vcard += `NOTE:${escapeVCardValue(contact.meeting_context)}\n`;
    }
    
    if (contact.contact_photo_url) {
        vcard += `PHOTO;VALUE=URI:${escapeVCardValue(contact.contact_photo_url)}\n`;
    }
    
    vcard += 'END:VCARD';
    return vcard;
}

function emailContact() {
    if (!currentViewingContact || !currentViewingContact.email) return;
    
    const subject = encodeURIComponent(`Contact from pplai.app`);
    const body = encodeURIComponent(`Hello ${currentViewingContact.name},\n\n`);
    window.location.href = `mailto:${currentViewingContact.email}?subject=${subject}&body=${body}`;
}

function callContact() {
    if (!currentViewingContact || !currentViewingContact.mobile) return;
    
    // Clean phone number (remove spaces, dashes, etc.)
    const phone = currentViewingContact.mobile.replace(/[\s\-\(\)]/g, '');
    window.location.href = `tel:${phone}`;
}

function messageContact() {
    if (!currentViewingContact || !currentViewingContact.mobile) return;
    
    // Clean phone number
    const phone = currentViewingContact.mobile.replace(/[\s\-\(\)]/g, '');
    const body = encodeURIComponent(`Hello ${currentViewingContact.name},`);
    window.location.href = `sms:${phone}?body=${body}`;
}

function whatsappContact() {
    if (!currentViewingContact) return;
    
    // Use WhatsApp number if available, otherwise use mobile
    const phone = (currentViewingContact.whatsapp || currentViewingContact.mobile || '').replace(/[\s\-\(\)\+]/g, '');
    if (!phone) return;
    
    // Remove leading country code if it starts with + or 00
    let cleanPhone = phone.replace(/^\+/, '').replace(/^00/, '');
    
    // WhatsApp Web URL format: https://wa.me/[country code][phone number]
    const message = encodeURIComponent(`Hello ${currentViewingContact.name},`);
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
}

function retryFailedRequests() {
    if (failedRequests.length === 0) return;
    
    const requests = [...failedRequests];
    failedRequests.length = 0;
    
    requests.forEach(request => {
        request().catch(err => {
            console.warn('Retry failed:', err);
            failedRequests.push(request);
        });
    });
}

function displayProfile(profile) {
    // Use the unified contact/profile view modal
    displayContactProfile(profile, true);
    
    // Also update the profile view display for backward compatibility
    const photoEl = document.getElementById('profilePhotoDisplay');
    const nameEl = document.getElementById('profileNameDisplay');
    const roleEl = document.getElementById('profileRoleDisplay');

    if (photoEl && profile.profile_photo_url) {
        photoEl.src = profile.profile_photo_url;
        photoEl.style.display = 'block';
    }
    if (nameEl) nameEl.textContent = profile.name;
    if (roleEl) roleEl.textContent = profile.role_company || '';
    
    // Update profile completeness
    updateProfileCompleteness(profile);
}

function openProfileModal() {
    const modal = document.getElementById('profileModal');
    const profile = getCurrentUser();
    
    if (profile) {
        const nameEl = document.getElementById('profileName');
        const emailEl = document.getElementById('profileEmail');
        const roleEl = document.getElementById('profileRole');
        const mobileEl = document.getElementById('profileMobile');
        const whatsappEl = document.getElementById('profileWhatsApp');
        const linkedinEl = document.getElementById('profileLinkedIn');
        const aboutEl = document.getElementById('profileAbout');
        
        if (nameEl) nameEl.value = profile.name || '';
        if (emailEl) emailEl.value = profile.email || '';
        if (roleEl) roleEl.value = profile.role_company || '';
        if (mobileEl) mobileEl.value = profile.mobile || '';
        if (whatsappEl) whatsappEl.value = profile.whatsapp || '';
        if (linkedinEl) linkedinEl.value = profile.linkedin_url || '';
        if (aboutEl) aboutEl.value = profile.about_me || '';
        
        const preview = document.getElementById('profilePhotoPreview');
        if (preview && profile.profile_photo_url) {
            preview.src = profile.profile_photo_url;
            preview.classList.remove('hidden');
        }
    }
    
    if (modal) modal.classList.remove('hidden');
}

async function saveProfile() {
    const name = document.getElementById('profileName')?.value;
    const email = document.getElementById('profileEmail')?.value;
    const role = document.getElementById('profileRole')?.value;
    const mobile = document.getElementById('profileMobile')?.value;
    const whatsapp = document.getElementById('profileWhatsApp')?.value;
    const linkedin = document.getElementById('profileLinkedIn')?.value;
    const about = document.getElementById('profileAbout')?.value;
    const photoInput = document.getElementById('profilePhotoInput');
    let photoFile = photoInput?.files[0];
    
    // Compress profile photo if provided
    if (photoFile && photoFile.type.startsWith('image/')) {
        try {
            photoFile = await compressImage(photoFile);
        } catch (error) {
            console.warn('Failed to compress profile photo:', error);
            // Continue with original file
        }
    }

    if (!name || !email) {
        alert('Name and email are required');
        return;
    }

    try {
        const profileData = {
            name,
            role_company: role,
            mobile,
            whatsapp,
            linkedin_url: linkedin,
            about_me: about,
        };

        const updated = await api.updateProfile(profileData, photoFile);
        setCurrentUser(updated);
        currentUser = updated;
        
        // Clear QR cache when profile is updated
        clearQRCache(updated.id, 'url');
        clearQRCache(updated.id, 'vcard');
        
        displayProfile(updated);
        await loadProfileQR(); // Reload QR with new data
        closeModal();
        alert('Profile updated successfully');
    } catch (error) {
        alert('Failed to update profile: ' + error.message);
    }
}

async function shareProfile() {
    if (!currentUser) return;
    
    if (qrMode === 'vcard') {
        // Share vCard directly
        const vcard = generateVCard(currentUser);
        const blob = new Blob([vcard], { type: 'text/vcard' });
        const url = URL.createObjectURL(blob);
        
        if (navigator.share) {
            try {
                const file = new File([blob], `${currentUser.name.replace(/\s+/g, '_')}.vcf`, { type: 'text/vcard' });
                await navigator.share({
                    title: `${currentUser.name}'s Contact`,
                    text: `Contact card for ${currentUser.name}`,
                    files: [file]
                });
                URL.revokeObjectURL(url);
                return;
            } catch (error) {
                // Fallback to download
            }
        }
        
        // Download vCard
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentUser.name.replace(/\s+/g, '_')}.vcf`;
        a.click();
        URL.revokeObjectURL(url);
    } else {
        // Share URL
        try {
            const qrData = await api.getProfileQR(currentUser.id);
            const profileUrl = qrData.profile_url || `${window.location.origin}/profile/${currentUser.id}`;
            
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: `${currentUser.name}'s Profile`,
                        text: `Connect with ${currentUser.name} on pplai.app`,
                        url: profileUrl,
                    });
                } catch (error) {
                    // Fallback to copy
                    copyToClipboard(profileUrl);
                }
            } else {
                copyToClipboard(profileUrl);
            }
        } catch (error) {
            // If network fails, fallback to vCard
            console.warn('Failed to share URL, using vCard:', error);
            const vcard = generateVCard(currentUser);
            const blob = new Blob([vcard], { type: 'text/vcard' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${currentUser.name.replace(/\s+/g, '_')}.vcf`;
            a.click();
            URL.revokeObjectURL(url);
        }
    }
}

// Event functions
let allEvents = []; // Store all events for search filtering

async function loadEvents() {
    try {
        allEvents = await api.getEvents();
        displayEvents(allEvents);
        updateEventFilter(allEvents);
    } catch (error) {
        console.error('Error loading events:', error);
    }
}

function filterEvents() {
    const searchInput = document.getElementById('eventsSearchInput');
    const clearBtn = document.getElementById('clearEventsSearch');
    if (!searchInput) return;
    
    const searchTerm = searchInput.value.toLowerCase().trim();
    
    // Show/hide clear button
    if (clearBtn) {
        if (searchTerm.length > 0) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
    }
    
    if (searchTerm === '') {
        // Show all events if search is empty
        displayEvents(allEvents);
        return;
    }

    // Filter events by name, location, or description
    const filteredEvents = allEvents.filter(event => {
        const name = (event.name || '').toLowerCase();
        const location = (event.location || '').toLowerCase();
        const description = (event.description || '').toLowerCase();
        
        return name.includes(searchTerm) || 
               location.includes(searchTerm) || 
               description.includes(searchTerm);
    });
    
    displayEvents(filteredEvents);
}

function clearEventsSearch() {
    const searchInput = document.getElementById('eventsSearchInput');
    const clearBtn = document.getElementById('clearEventsSearch');
    
    if (searchInput) {
        searchInput.value = '';
    }
    if (clearBtn) {
        clearBtn.classList.add('hidden');
    }
    
    // Show all events
    displayEvents(allEvents);
}

async function loadEventsForContactForm() {
    try {
        const events = await api.getEvents();
        const eventSelect = document.getElementById('contactEvent');
        if (!eventSelect) return;
        
        // Clear existing options except the first one
        eventSelect.innerHTML = '<option value="">Select an event (optional)</option>';
        
        // Add events to dropdown
        events.forEach(event => {
            const option = document.createElement('option');
            option.value = event.id;
            option.textContent = `${event.name}${event.location ? ` - ${event.location}` : ''}${event.start_date ? ` (${new Date(event.start_date).toLocaleDateString()})` : ''}`;
            eventSelect.appendChild(option);
        });
        
        // Pre-select current event if one is selected
        if (currentEvent) {
            eventSelect.value = currentEvent.id;
        }
    } catch (error) {
        console.error('Error loading events for contact form:', error);
    }
}

function displayEvents(events) {
    const container = document.getElementById('eventsList');
    if (!container) return;

    if (events.length === 0) {
        const searchInput = document.getElementById('eventsSearchInput');
        const hasSearchTerm = searchInput && searchInput.value.trim().length > 0;
        const message = hasSearchTerm 
            ? '<p class="empty-state">No events match your search. Try a different term.</p>'
            : '<p class="empty-state">No events yet. Create your first event!</p>';
        container.innerHTML = message;
        return;
    }

    container.innerHTML = events.map(event => {
        const isSelected = currentEvent && currentEvent.id === event.id;
        return `
        <div class="event-card ${isSelected ? 'event-selected' : ''}" data-event-id="${event.id}">
            <h3>${event.name}${isSelected ? ' <span style="font-size: 14px; color: var(--primary);">(Selected)</span>' : ''}</h3>
            <p class="event-location">📍 ${event.location}</p>
            <p class="event-dates">${formatDateRange(event.start_date, event.end_date)}</p>
            ${event.description ? `<p class="event-description">${event.description}</p>` : ''}
            <div class="event-actions">
                ${isSelected 
                    ? `<button class="btn-small btn-secondary unselect-event" data-event-id="${event.id}">Unselect</button>`
                    : `<button class="btn-small btn-primary select-event" data-event-id="${event.id}">Select</button>`
                }
                <div class="export-buttons" style="display: flex; gap: 4px;">
                    <button class="btn-small btn-secondary export-pdf" data-event-id="${event.id}" title="Export PDF">📄 PDF</button>
                    <button class="btn-small btn-secondary export-csv" data-event-id="${event.id}" title="Export CSV">📊 CSV</button>
                </div>
                <button class="btn-small btn-secondary edit-event" data-event-id="${event.id}">Edit</button>
                <button class="btn-small btn-danger delete-event" data-event-id="${event.id}">Delete</button>
            </div>
        </div>
    `;
    }).join('');

    // Add event listeners
    container.querySelectorAll('.select-event').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const eventId = e.target.dataset.eventId;
            await selectEvent(eventId);
        });
    });

    container.querySelectorAll('.unselect-event').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            await unselectEvent();
        });
    });

    container.querySelectorAll('.export-pdf').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const eventId = e.target.dataset.eventId;
            try {
                await api.exportEventPDF(eventId);
            } catch (error) {
                alert('Failed to export PDF: ' + error.message);
            }
        });
    });

    container.querySelectorAll('.export-csv').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const eventId = e.target.dataset.eventId;
            try {
                await api.exportEventCSV(eventId);
            } catch (error) {
                alert('Failed to export CSV: ' + error.message);
            }
        });
    });

    container.querySelectorAll('.delete-event').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (confirm('Are you sure you want to delete this event?')) {
                const eventId = e.target.dataset.eventId;
                try {
                    await api.deleteEvent(eventId);
                    await loadEvents();
                    if (currentEvent && currentEvent.id === eventId) {
                        currentEvent = null;
                        localStorage.removeItem('currentEventId');
                        updateCurrentEventBanner();
                    }
                } catch (error) {
                    alert('Failed to delete event: ' + error.message);
                }
            }
        });
    });
}

function updateEventFilter(events) {
    const filter = document.getElementById('eventFilter');
    if (!filter) return;

    // Clear existing options except "All Events"
    filter.innerHTML = '<option value="all">All Events</option>';
    
    events.forEach(event => {
        const option = document.createElement('option');
        option.value = event.id;
        option.textContent = event.name;
        filter.appendChild(option);
    });
}

async function openEventModal(eventData = null) {
    const modal = document.getElementById('eventModal');
    if (!modal) return;
    
    editingEventId = eventData ? eventData.id : null;
    
    // Update modal title
    const modalTitle = document.getElementById('eventModalTitle');
    if (modalTitle) {
        modalTitle.textContent = editingEventId ? 'Edit Event' : 'Create Event';
    }
    
    // Clear or fill form
    if (eventData) {
        // Fill form with event data
        document.getElementById('eventName').value = eventData.name || '';
        document.getElementById('eventLocation').value = eventData.location || '';
        
        // Format dates for input (YYYY-MM-DD)
        if (eventData.start_date) {
            const startDate = new Date(eventData.start_date);
            document.getElementById('eventStartDate').value = startDate.toISOString().split('T')[0];
        }
        if (eventData.end_date) {
            const endDate = new Date(eventData.end_date);
            document.getElementById('eventEndDate').value = endDate.toISOString().split('T')[0];
        }
        
        document.getElementById('eventDescription').value = eventData.description || '';
    } else {
        // Clear form
        document.getElementById('eventName').value = '';
        document.getElementById('eventLocation').value = '';
        document.getElementById('eventStartDate').value = '';
        document.getElementById('eventEndDate').value = '';
        document.getElementById('eventDescription').value = '';
    }
    
    // Hide location suggestions
    const suggestions = document.getElementById('locationSuggestions');
    if (suggestions) {
        suggestions.classList.add('hidden');
        suggestions.innerHTML = '';
    }
    
    // Setup location autocomplete when modal opens
    setupLocationAutocomplete();
    
    // Add date validation listeners
    const startDateInput = document.getElementById('eventStartDate');
    const endDateInput = document.getElementById('eventEndDate');
    
    if (startDateInput && endDateInput) {
        // Auto-populate end date when start date is selected
        startDateInput.addEventListener('change', () => {
            if (startDateInput.value) {
                // Set minimum end date to start date
                endDateInput.min = startDateInput.value;
                
                // Auto-populate end date if it's empty or before start date
                if (!endDateInput.value || new Date(endDateInput.value) < new Date(startDateInput.value)) {
                    endDateInput.value = startDateInput.value;
                }
            }
        });
        
        // Set maximum start date to end date
        endDateInput.addEventListener('change', () => {
            if (endDateInput.value) {
                startDateInput.max = endDateInput.value;
                // If start date is after end date, adjust start date
                if (startDateInput.value && new Date(startDateInput.value) > new Date(endDateInput.value)) {
                    startDateInput.value = endDateInput.value;
                }
            }
        });
    }
    
    // Show modal
    modal.classList.remove('hidden');
}

async function editEvent(eventId) {
    try {
        const event = await api.getEvent(eventId);
        await openEventModal(event);
    } catch (error) {
        alert('Failed to load event for editing: ' + error.message);
    }
}

async function saveEvent() {
    const name = document.getElementById('eventName')?.value;
    const location = document.getElementById('eventLocation')?.value;
    const startDate = document.getElementById('eventStartDate')?.value;
    const endDate = document.getElementById('eventEndDate')?.value;
    const description = document.getElementById('eventDescription')?.value;

    if (!name || !location || !startDate || !endDate) {
        alert('Please fill in all required fields');
        return;
    }

    // Validate date range
    if (new Date(endDate) < new Date(startDate)) {
        alert('End date must be on or after the start date');
        return;
    }

    try {
        const eventData = {
            name,
            location,
            start_date: startDate,
            end_date: endDate,
            description: description || null,
        };
        
        if (editingEventId) {
            // Update existing event
            if (!navigator.onLine) {
                // Save to offline queue
                offlineQueue.addEvent(eventData, true, editingEventId);
                alert('Event update saved offline. It will sync when you\'re back online.');
                closeModal();
                editingEventId = null;
                await loadEvents(); // Reload from cache
                return;
            }
            await api.updateEvent(editingEventId, eventData);
            alert('Event updated successfully');
        } else {
            // Create new event
            if (!navigator.onLine) {
                // Save to offline queue
                offlineQueue.addEvent(eventData, false);
                alert('Event saved offline. It will sync when you\'re back online.');
                closeModal();
                editingEventId = null;
                await loadEvents(); // Reload from cache
                return;
            }
            await api.createEvent(eventData);
            alert('Event created successfully');
        }
        
        closeModal();
        editingEventId = null;
        await loadEvents();
    } catch (error) {
        // If API fails due to network, try offline queue
        if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
            console.warn('Network error, saving to offline queue:', error);
            if (editingEventId) {
                offlineQueue.addEvent(eventData, true, editingEventId);
                alert('Event update saved offline. It will sync when you\'re back online.');
            } else {
                offlineQueue.addEvent(eventData, false);
                alert('Event saved offline. It will sync when you\'re back online.');
            }
            closeModal();
            editingEventId = null;
            await loadEvents(); // Reload from cache
        } else {
            alert('Failed to save event: ' + error.message);
        }
    }
}

async function selectEvent(eventId) {
    try {
        currentEvent = await api.getEvent(eventId);
        localStorage.setItem('currentEventId', eventId);
        updateCurrentEventBanner();
        // Reload events to show updated selection state
        await loadEvents();
        switchView('home');
    } catch (error) {
        alert('Failed to select event: ' + error.message);
    }
}

function updateCurrentEventBanner() {
    const banner = document.getElementById('currentEventBanner');
    const nameEl = document.getElementById('currentEventName');
    const unselectBtn = document.getElementById('unselectEventBtn');
    
    if (currentEvent && banner && nameEl) {
        nameEl.textContent = currentEvent.name;
        banner.style.display = 'block';
        if (unselectBtn) {
            unselectBtn.style.display = 'block';
        }
    } else if (banner) {
        banner.style.display = 'none';
        if (unselectBtn) {
            unselectBtn.style.display = 'none';
        }
    }
}

async function unselectEvent() {
    currentEvent = null;
    localStorage.removeItem('currentEventId');
    updateCurrentEventBanner();
    // Reload events to show updated selection state
    await loadEvents();
    // Reload contacts to show all events
    loadContacts();
}

// Contact functions
let allContacts = []; // Store all contacts for search filtering
let selectionMode = false; // Track if selection mode is active

function toggleContactsFilters() {
    const filtersContainer = document.getElementById('contactsFilters');
    const filterBtn = document.getElementById('filterContactsBtn');
    if (filtersContainer && filterBtn) {
        const isHidden = filtersContainer.classList.contains('hidden');
        if (isHidden) {
            filtersContainer.classList.remove('hidden');
            filterBtn.classList.add('active');
        } else {
            filtersContainer.classList.add('hidden');
            filterBtn.classList.remove('active');
        }
    }
}

async function loadContacts() {
    try {
        const eventId = document.getElementById('eventFilter')?.value || 'all';
        const tagId = document.getElementById('tagFilter')?.value || 'all';
        const dateFilter = document.getElementById('dateFilter')?.value || 'all';
        
        // Build filter params
        const filters = {};
        if (eventId !== 'all') filters.event_id = eventId;
        if (tagId !== 'all') filters.tag_id = tagId;
        
        // Handle date filters
        if (dateFilter === 'custom') {
            const dateFrom = document.getElementById('dateFrom')?.value;
            const dateTo = document.getElementById('dateTo')?.value;
            if (dateFrom) filters.date_from = dateFrom;
            if (dateTo) filters.date_to = dateTo;
        } else if (dateFilter !== 'all') {
            filters.date_range = dateFilter; // 'today', 'week', 'month'
        }
        
        allContacts = await api.getContacts(filters);
        filterContactsBySearch(); // Apply search filter if any
    } catch (error) {
        console.error('Error loading contacts:', error);
    }
}

function filterContactsBySearch() {
    const searchInput = document.getElementById('contactsSearchInput');
    const clearBtn = document.getElementById('clearContactsSearch');
    if (!searchInput) {
        // If search input doesn't exist, just display all contacts
        displayContacts(allContacts);
        return;
    }
    
    const searchTerm = searchInput.value.toLowerCase().trim();
    
    // Show/hide clear button
    if (clearBtn) {
        if (searchTerm.length > 0) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
    }
    
    // Filter contacts by search term
    let filteredContacts = allContacts;
    if (searchTerm.length > 0) {
        filteredContacts = allContacts.filter(contact => {
            const name = (contact.name || '').toLowerCase();
            const email = (contact.email || '').toLowerCase();
            const mobile = (contact.mobile || '').toLowerCase();
            const roleCompany = (contact.role_company || '').toLowerCase();
            const tags = (contact.tags || []).map(t => (t.name || t).toLowerCase()).join(' ');
            
            return name.includes(searchTerm) ||
                   email.includes(searchTerm) ||
                   mobile.includes(searchTerm) ||
                   roleCompany.includes(searchTerm) ||
                   tags.includes(searchTerm);
        });
    }
    
    displayContacts(filteredContacts);
}

function clearContactsSearch() {
    const searchInput = document.getElementById('contactsSearchInput');
    const clearBtn = document.getElementById('clearContactsSearch');
    
    if (searchInput) {
        searchInput.value = '';
    }
    if (clearBtn) {
        clearBtn.classList.add('hidden');
    }
    
    // Show all contacts
    displayContacts(allContacts);
}

function handleDateFilterChange() {
    const dateFilter = document.getElementById('dateFilter')?.value;
    const customRange = document.getElementById('customDateRange');
    if (customRange) {
        if (dateFilter === 'custom') {
            customRange.classList.remove('hidden');
        } else {
            customRange.classList.add('hidden');
        }
    }
    filterContacts();
}

async function loadTagFilter() {
    try {
        const tags = await api.getTags(false);
        const tagFilter = document.getElementById('tagFilter');
        if (!tagFilter) return;
        
        // Clear existing options except "All Tags"
        tagFilter.innerHTML = '<option value="all">All Tags</option>';
        
        tags.forEach(tag => {
            const option = document.createElement('option');
            option.value = tag.id;
            option.textContent = tag.name;
            tagFilter.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading tags for filter:', error);
    }
}

function displayContacts(contacts) {
    const container = document.getElementById('contactsList');
    if (!container) return;

    if (contacts.length === 0) {
        const searchInput = document.getElementById('contactsSearchInput');
        const hasSearchTerm = searchInput && searchInput.value.trim().length > 0;
        const message = hasSearchTerm 
            ? '<p class="empty-state">No contacts match your search. Try a different term.</p>'
            : '<p class="empty-state">No contacts yet. Start scanning!</p>';
        container.innerHTML = message;
        return;
    }

    // Sort contacts by meeting_date in reverse chronological order (newest first)
    const sortedContacts = [...contacts].sort((a, b) => {
        const dateA = a.meeting_date ? new Date(a.meeting_date).getTime() : 0;
        const dateB = b.meeting_date ? new Date(b.meeting_date).getTime() : 0;
        return dateB - dateA; // Reverse order (newest first)
    });

    container.innerHTML = sortedContacts.map(contact => {
        const tagsHtml = contact.tags && contact.tags.length > 0 
            ? `<div class="contact-tags">${contact.tags.map(t => {
                const color = getTagColor(t.name || t);
                return `<span class="tag" style="background-color: ${color.bg}; color: ${color.text}; border-color: ${color.border};">
                    ${t.name || t}
                </span>`;
            }).join('')}</div>` 
            : '';
        
        return `
        <div class="contact-card ${selectionMode ? 'selectable' : ''}" data-contact-id="${contact.id}" style="position: relative; cursor: pointer;">
            <input type="checkbox" class="contact-checkbox" data-contact-id="${contact.id}" style="position: absolute; top: 12px; left: 12px; width: 20px; height: 20px; z-index: 10; ${selectionMode ? 'display: block;' : 'display: none;'}">
            ${contact.contact_photo_url ? `<img src="${contact.contact_photo_url}" alt="${contact.name}" class="contact-photo">` : ''}
            <div class="contact-info" style="flex: 1;">
                <h3>${contact.name}</h3>
                ${contact.role_company ? `<p class="contact-role">${contact.role_company}</p>` : ''}
                ${contact.email ? `<p class="contact-email">📧 ${contact.email}</p>` : ''}
                ${contact.mobile ? `<p class="contact-mobile">📱 ${contact.mobile}</p>` : ''}
                ${tagsHtml}
                <p class="contact-date">Met: ${new Date(contact.meeting_date).toLocaleString()}</p>
            </div>
            <div class="contact-actions-list" style="display: flex; gap: 8px; align-items: center;">
                <button class="icon-btn-action chat-contact-btn" data-contact-id="${contact.id}" data-contact-name="${contact.name}" onclick="event.stopPropagation();" title="Chat">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                </button>
                <button class="icon-btn-action icon-btn-danger delete-contact-btn" data-contact-id="${contact.id}" data-contact-name="${contact.name}" onclick="event.stopPropagation();" title="Delete">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        </div>
    `;
    }).join('');

    // Make contact cards clickable to view or select
    container.querySelectorAll('.contact-card').forEach(card => {
        card.addEventListener('click', async (e) => {
            // Don't trigger if clicking on buttons
            if (e.target.closest('button')) {
                return;
            }
            
            // In selection mode, toggle checkbox instead of viewing
            if (selectionMode) {
                const checkbox = card.querySelector('.contact-checkbox');
                if (checkbox && !e.target.closest('input[type="checkbox"]')) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                    return;
                }
            }
            
            // Don't trigger view if clicking on checkbox
            if (e.target.closest('input[type="checkbox"]')) {
                return;
            }
            
            // Normal mode: view contact
            const contactId = card.dataset.contactId;
            await viewContact(contactId);
        });
    });
    
    container.querySelectorAll('.chat-contact-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const contactId = e.target.dataset.contactId;
            const contactName = e.target.dataset.contactName;
            await openChatView(contactId, contactName);
        });
    });
    
    container.querySelectorAll('.delete-contact-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const contactId = e.target.dataset.contactId;
            const contactName = e.target.dataset.contactName;
            await deleteContact(contactId, contactName);
        });
    });
    
    // Checkbox change handlers
    container.querySelectorAll('.contact-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', updateBulkActionsBar);
    });
}

function filterContacts() {
    loadContacts();
}

// Selection mode functions
function toggleSelectionMode() {
    selectionMode = !selectionMode;
    const container = document.getElementById('contactsList');
    const bulkBar = document.getElementById('bulkActionsBar');
    const selectBtn = document.getElementById('selectContactsBtn');
    
    if (!container) return;
    
    const selectionBar = document.getElementById('bulkSelectionBar');
    
    if (selectionMode) {
        // Show checkboxes
        container.querySelectorAll('.contact-checkbox').forEach(checkbox => {
            checkbox.style.display = 'block';
        });
        container.querySelectorAll('.contact-card').forEach(card => {
            card.classList.add('selectable');
        });
        if (bulkBar) bulkBar.classList.remove('hidden');
        if (selectionBar) selectionBar.classList.remove('hidden');
        if (selectBtn) selectBtn.classList.add('active');
    } else {
        // Hide checkboxes and deselect all
        container.querySelectorAll('.contact-checkbox').forEach(checkbox => {
            checkbox.style.display = 'none';
            checkbox.checked = false;
        });
        container.querySelectorAll('.contact-card').forEach(card => {
            card.classList.remove('selectable');
        });
        if (bulkBar) bulkBar.classList.add('hidden');
        if (selectionBar) selectionBar.classList.add('hidden');
        if (selectBtn) selectBtn.classList.remove('active');
        updateBulkActionsBar();
    }
}

function selectAllContacts() {
    const container = document.getElementById('contactsList');
    if (!container) return;
    container.querySelectorAll('.contact-checkbox').forEach(checkbox => {
        checkbox.checked = true;
    });
    updateBulkActionsBar();
}

function deselectAllContacts() {
    const container = document.getElementById('contactsList');
    if (!container) return;
    container.querySelectorAll('.contact-checkbox').forEach(checkbox => {
        checkbox.checked = false;
    });
    updateBulkActionsBar();
}

function getSelectedContactIds() {
    const container = document.getElementById('contactsList');
    if (!container) return [];
    return Array.from(container.querySelectorAll('.contact-checkbox:checked'))
        .map(checkbox => checkbox.dataset.contactId);
}

function updateBulkActionsBar() {
    const selectedIds = getSelectedContactIds();
    const countEl = document.getElementById('selectedCount');
    if (countEl) {
        countEl.textContent = `${selectedIds.length} selected`;
    }
}

async function bulkSaveContacts() {
    const selectedIds = getSelectedContactIds();
    if (selectedIds.length === 0) {
        alert('Please select contacts to save');
        return;
    }
    
    try {
        const contacts = allContacts.filter(c => selectedIds.includes(c.id));
        let savedCount = 0;
        
        for (const contact of contacts) {
            try {
                const vcard = generateContactVCard(contact);
                const blob = new Blob([vcard], { type: 'text/vcard' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${contact.name.replace(/\s+/g, '_')}.vcf`;
                a.click();
                URL.revokeObjectURL(url);
                savedCount++;
                // Small delay to prevent browser blocking multiple downloads
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error(`Failed to save ${contact.name}:`, error);
            }
        }
        
        alert(`Saved ${savedCount} of ${selectedIds.length} contacts to device`);
    } catch (error) {
        alert('Failed to save contacts: ' + error.message);
    }
}

async function bulkExportContacts() {
    const selectedIds = getSelectedContactIds();
    if (selectedIds.length === 0) {
        alert('Please select contacts to export');
        return;
    }
    
    // Show export format selection
    const format = confirm(
        `Export ${selectedIds.length} contact(s)?\n\n` +
        `Click OK for PDF\n` +
        `Click Cancel for CSV`
    );
    
    try {
        if (format) {
            // Export as PDF
            await api.exportContactsPDF(selectedIds);
            alert(`Exported ${selectedIds.length} contacts to PDF`);
        } else {
            // Export as CSV
            await api.exportContactsCSV(selectedIds);
            alert(`Exported ${selectedIds.length} contacts to CSV`);
        }
    } catch (error) {
        alert('Failed to export contacts: ' + error.message);
    }
}

async function bulkAddTagToContacts() {
    const selectedIds = getSelectedContactIds();
    if (selectedIds.length === 0) {
        alert('Please select contacts to tag');
        return;
    }
    
    try {
        // Load available tags
        const tags = await api.getTags(false);
        if (tags.length === 0) {
            alert('No tags available. Please create a tag first.');
            return;
        }
        
        // Ask user if they want to add or remove tags
        const isAdd = confirm(
            `Tag ${selectedIds.length} contact(s)?\n\n` +
            `Click OK to ADD a tag\n` +
            `Click Cancel to REMOVE a tag`
        );
        
        // Show tag selection dialog
        const tagNames = tags.map(t => t.name).join('\n');
        const action = isAdd ? 'add' : 'remove';
        const tagName = prompt(
            `Enter tag name to ${action} from ${selectedIds.length} contact(s):\n\nAvailable tags:\n${tagNames}`
        );
        
        if (!tagName || !tagName.trim()) return;
        
        const trimmedTag = tagName.trim();
        let tagId = tags.find(t => t.name.toLowerCase() === trimmedTag.toLowerCase())?.id;
        
        // For adding: create tag if it doesn't exist
        if (isAdd && !tagId) {
            try {
                const newTag = await api.createTag(trimmedTag);
                tagId = newTag.id;
            } catch (error) {
                alert('Failed to create tag: ' + error.message);
                return;
            }
        }
        
        // For removing: check if tag exists
        if (!isAdd && !tagId) {
            alert(`Tag "${trimmedTag}" not found.`);
            return;
        }
        
        // Add or remove tag from all selected contacts
        let successCount = 0;
        for (const contactId of selectedIds) {
            try {
                const contact = await api.getContact(contactId);
                const currentTags = contact.tags?.map(t => t.name || t) || [];
                
                if (isAdd) {
                    // Add tag if not already present
                    if (!currentTags.includes(trimmedTag)) {
                        const updatedTags = [...currentTags, trimmedTag];
                        await api.updateContact(contactId, { tags: updatedTags }, null, []);
                        successCount++;
                    }
                } else {
                    // Remove tag if present
                    if (currentTags.includes(trimmedTag)) {
                        const updatedTags = currentTags.filter(t => t !== trimmedTag);
                        await api.updateContact(contactId, { tags: updatedTags }, null, []);
                        successCount++;
                    }
                }
            } catch (error) {
                console.error(`Failed to ${action} tag from contact ${contactId}:`, error);
            }
        }
        
        const actionText = isAdd ? 'Added' : 'Removed';
        alert(`${actionText} tag "${trimmedTag}" from ${successCount} of ${selectedIds.length} contacts`);
        
        // Reload contacts
        await loadContacts();
    } catch (error) {
        alert('Failed to update tags: ' + error.message);
    }
}

async function bulkDeleteContacts() {
    const selectedIds = getSelectedContactIds();
    if (selectedIds.length === 0) {
        alert('Please select contacts to delete');
        return;
    }
    
    const confirmed = confirm(
        `⚠️ WARNING: Are you sure you want to delete ${selectedIds.length} contact(s)?\n\n` +
        `This action cannot be undone. All contact information, notes, media, and chat history will be permanently deleted.`
    );
    
    if (!confirmed) return;
    
    if (!navigator.onLine) {
        alert('Cannot delete contacts while offline. Please connect to the internet.');
        return;
    }
    
    try {
        let deletedCount = 0;
        for (const contactId of selectedIds) {
            try {
                await api.deleteContact(contactId);
                deletedCount++;
            } catch (error) {
                console.error(`Failed to delete contact ${contactId}:`, error);
            }
        }
        
        alert(`Deleted ${deletedCount} of ${selectedIds.length} contacts`);
        
        // Exit selection mode and reload
        selectionMode = false;
        toggleSelectionMode();
        await loadContacts();
    } catch (error) {
        alert('Failed to delete contacts: ' + error.message);
    }
}

// Tag management - defined before openContactModal
let availableTags = [];
let systemTags = [];
let customTags = [];

// Color coding for tags
function getTagColor(tagName) {
    // Generate a consistent color based on tag name
    const colors = [
        { bg: 'rgba(102, 126, 234, 0.15)', text: '#667eea', border: 'rgba(102, 126, 234, 0.3)' }, // Primary blue
        { bg: 'rgba(240, 147, 251, 0.15)', text: '#f093fb', border: 'rgba(240, 147, 251, 0.3)' }, // Accent purple
        { bg: 'rgba(255, 152, 0, 0.15)', text: '#ff9800', border: 'rgba(255, 152, 0, 0.3)' }, // Orange
        { bg: 'rgba(76, 175, 80, 0.15)', text: '#4caf50', border: 'rgba(76, 175, 80, 0.3)' }, // Green
        { bg: 'rgba(33, 150, 243, 0.15)', text: '#2196f3', border: 'rgba(33, 150, 243, 0.3)' }, // Light blue
        { bg: 'rgba(156, 39, 176, 0.15)', text: '#9c27b0', border: 'rgba(156, 39, 176, 0.3)' }, // Purple
        { bg: 'rgba(244, 67, 54, 0.15)', text: '#f44336', border: 'rgba(244, 67, 54, 0.3)' }, // Red
        { bg: 'rgba(255, 193, 7, 0.15)', text: '#ffc107', border: 'rgba(255, 193, 7, 0.3)' }, // Amber
        { bg: 'rgba(0, 188, 212, 0.15)', text: '#00bcd4', border: 'rgba(0, 188, 212, 0.3)' }, // Cyan
        { bg: 'rgba(121, 85, 72, 0.15)', text: '#795548', border: 'rgba(121, 85, 72, 0.3)' }, // Brown
    ];
    
    // Hash the tag name to get a consistent index
    let hash = 0;
    for (let i = 0; i < tagName.length; i++) {
        hash = tagName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
}

function createTagElement(tagName, isSystemTag = false) {
    const color = getTagColor(tagName);
    const tagEl = document.createElement('span');
    tagEl.className = 'tag';
    tagEl.textContent = tagName;
    tagEl.style.backgroundColor = color.bg;
    tagEl.style.color = color.text;
    tagEl.style.borderColor = color.border;
    if (isSystemTag) {
        tagEl.classList.add('tag-system');
    }
    return tagEl;
}

async function loadAvailableTags() {
    try {
        const tags = await api.getTags(false); // Don't include hidden tags
        availableTags = tags;
        systemTags = tags.filter(t => t.is_system_tag && !t.is_hidden);
        customTags = tags.filter(t => !t.is_system_tag && !t.is_hidden);
        
        // Update suggested tags display
        updateSuggestedTags();
    } catch (error) {
        console.error('Error loading tags:', error);
        // Fallback to hardcoded system tags
        systemTags = [
            { name: 'Potential Client', is_system_tag: true, is_hidden: false },
            { name: 'Partner', is_system_tag: true, is_hidden: false },
            { name: 'Speaker', is_system_tag: true, is_hidden: false },
            { name: 'Exhibitor', is_system_tag: true, is_hidden: false },
            { name: 'Follow Up', is_system_tag: true, is_hidden: false }
        ];
        updateSuggestedTags();
    }
}

function updateSuggestedTags() {
    const container = document.querySelector('.suggested-tags');
    if (!container) return;
    
    // Clear existing
    container.innerHTML = '';
    
    // Add system tags section
    if (systemTags.length > 0) {
        const systemHeader = document.createElement('div');
        systemHeader.className = 'tag-section-header';
        systemHeader.textContent = 'System Tags';
        systemHeader.style.cssText = 'font-size: 12px; font-weight: 600; color: #666; margin-bottom: 8px; margin-top: 8px;';
        container.appendChild(systemHeader);
        
        systemTags.forEach(tag => {
            const tagEl = document.createElement('span');
            tagEl.className = 'tag-suggestion';
            tagEl.dataset.tag = tag.name;
            tagEl.textContent = tag.name;
            const color = getTagColor(tag.name);
            tagEl.style.backgroundColor = color.bg;
            tagEl.style.color = color.text;
            tagEl.style.borderColor = color.border;
            tagEl.addEventListener('click', (e) => addTag(e.target.dataset.tag));
            container.appendChild(tagEl);
        });
    }
    
    // Add custom tags section (recently used)
    if (customTags.length > 0) {
        const customHeader = document.createElement('div');
        customHeader.className = 'tag-section-header';
        customHeader.textContent = 'Your Tags';
        customHeader.style.cssText = 'font-size: 12px; font-weight: 600; color: #666; margin-bottom: 8px; margin-top: 16px;';
        container.appendChild(customHeader);
        
        // Show up to 10 most recent custom tags
        customTags.slice(0, 10).forEach(tag => {
            const tagEl = document.createElement('span');
            tagEl.className = 'tag-suggestion tag-custom';
            tagEl.dataset.tag = tag.name;
            tagEl.textContent = tag.name;
            const color = getTagColor(tag.name);
            tagEl.style.backgroundColor = color.bg;
            tagEl.style.color = color.text;
            tagEl.style.borderColor = color.border;
            tagEl.addEventListener('click', (e) => addTag(e.target.dataset.tag));
            container.appendChild(tagEl);
        });
    }
}

let editingContactId = null;
let editingEventId = null;

async function openContactModal(contactData = null) {
    const modal = document.getElementById('contactModal');
    if (!modal) return;
    
    editingContactId = contactData ? contactData.id : null;
    
    // Update modal title
    const modalTitle = modal.querySelector('.modal-header h3');
    if (modalTitle) {
        modalTitle.textContent = editingContactId ? 'Edit Contact' : 'Add Contact';
    }
    
    // Clear or fill form
    if (contactData) {
        // Fill form with contact data
        document.getElementById('contactName').value = contactData.name || '';
        document.getElementById('contactEmail').value = contactData.email || '';
        document.getElementById('contactRole').value = contactData.role_company || '';
        
        // Parse mobile number to extract country code
        const mobileInput = document.getElementById('contactMobile');
        const countryCodeSelect = document.getElementById('contactCountryCode');
        if (mobileInput && countryCodeSelect && contactData.mobile) {
            const mobile = contactData.mobile.trim();
            // Check if it starts with a known country code
            const countryCodes = ['+1', '+44', '+91', '+86', '+81', '+49', '+33', '+39', '+34', '+61', '+55', '+52', '+971', '+966', '+65', '+60', '+62', '+66', '+84', '+82', '+27', '+20', '+234', '+254', '+212', '+7', '+90', '+92', '+880', '+94', '+977', '+95', '+855', '+856', '+673', '+670', '+64', '+679', '+678', '+685', '+676', '+687', '+689', '+691', '+692', '+850', '+886', '+852', '+853'];
            let foundCode = '+91'; // Default to India
            let phoneNumber = mobile;
            for (const code of countryCodes) {
                if (mobile.startsWith(code)) {
                    foundCode = code;
                    phoneNumber = mobile.substring(code.length).trim();
                    break;
                }
            }
            countryCodeSelect.value = foundCode;
            mobileInput.value = phoneNumber;
        } else if (mobileInput && countryCodeSelect) {
            mobileInput.value = '';
            countryCodeSelect.value = '+91'; // Default to India
        }
        
        document.getElementById('contactLinkedIn').value = contactData.linkedin_url || '';
        document.getElementById('contactContext').value = contactData.meeting_context || '';
        
        // Set event
        const eventSelect = document.getElementById('contactEvent');
        if (eventSelect && contactData.event_id) {
            eventSelect.value = contactData.event_id;
        }
        
        // Set meeting date/time
        const meetingDateInput = document.getElementById('contactMeetingDate');
        if (meetingDateInput && contactData.meeting_date) {
            // Convert ISO string to datetime-local format (YYYY-MM-DDTHH:mm)
            const date = new Date(contactData.meeting_date);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            meetingDateInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
        } else if (meetingDateInput && !contactData.meeting_date) {
            // If no meeting date in contact data, set to current time
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            meetingDateInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
        }
        
        // Load tags
        const tagsContainer = document.getElementById('contactTags');
        if (tagsContainer && contactData.tags) {
            tagsContainer.innerHTML = '';
            contactData.tags.forEach(tag => {
                const tagName = tag.name || tag;
                addTag(tagName);
            });
        }
        
        // Load photo preview if exists
        const photoPreview = document.getElementById('contactPhotoPreview');
        const photoPlaceholder = document.querySelector('#contactPhotoUpload .photo-placeholder');
        if (contactData.contact_photo_url && photoPreview && photoPlaceholder) {
            photoPreview.src = contactData.contact_photo_url;
            photoPreview.classList.remove('hidden');
            photoPlaceholder.style.display = 'none';
        }
        
        // Note: Media attachments are read-only in edit mode for now
        document.getElementById('mediaPreview').innerHTML = '';
        } else {
        // Clear form
        document.getElementById('contactName').value = '';
        document.getElementById('contactEmail').value = '';
        document.getElementById('contactRole').value = '';
        document.getElementById('contactMobile').value = '';
        document.getElementById('contactLinkedIn').value = '';
        document.getElementById('contactContext').value = '';
        document.getElementById('contactTags').innerHTML = '';
        document.getElementById('mediaPreview').innerHTML = '';
        const eventSelect = document.getElementById('contactEvent');
        if (eventSelect) {
            eventSelect.value = '';
        }
        
        // Set default meeting date/time to now for new contacts (always set if empty)
        const meetingDateInput = document.getElementById('contactMeetingDate');
        if (meetingDateInput && !editingContactId) {
            // Always set to current time for new contacts, even if field appears empty
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            meetingDateInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
        } else if (meetingDateInput && editingContactId && !meetingDateInput.value) {
            // If editing but no date set, default to current time
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            meetingDateInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
        }
        
        // Clear photo preview
        const photoPreview = document.getElementById('contactPhotoPreview');
        const photoPlaceholder = document.querySelector('#contactPhotoUpload .photo-placeholder');
        if (photoPreview && photoPlaceholder) {
            photoPreview.classList.add('hidden');
            photoPlaceholder.style.display = 'flex';
        }
    }

    updateCharCount();
    
    // Load available tags
    await loadAvailableTags();
    
    // Load events for dropdown
    await loadEventsForContactForm();
    
    // Show modal
    modal.classList.remove('hidden');
}

async function editContact() {
    if (!currentViewingContactId) return;
    
    try {
        // Close view modal
        document.getElementById('contactViewModal')?.classList.add('hidden');
        
        // Fetch full contact data
        const contact = await api.getContact(currentViewingContactId);
        
        // Open edit modal with contact data
        await openContactModal(contact);
    } catch (error) {
        alert('Failed to load contact for editing: ' + error.message);
    }
}

async function deleteContact(contactId, contactName) {
    if (!contactId) return;
    
    // Show confirmation dialog
    const confirmed = confirm(
        `⚠️ WARNING: Are you sure you want to delete "${contactName}"?\n\n` +
        `This action cannot be undone. All contact information, notes, media, and chat history will be permanently deleted.`
    );
    
    if (!confirmed) return;
    
    try {
        // Check if offline
        if (!navigator.onLine) {
            alert('Cannot delete contact while offline. Please connect to the internet.');
            return;
        }
        
        // Delete contact via API
        await api.deleteContact(contactId);
        
        // Close the view modal
        document.getElementById('contactViewModal')?.classList.add('hidden');
        
        // Clear current viewing contact
        currentViewingContactId = null;
        currentViewingContact = null;
        
        // Reload contacts list
        await loadContacts();
        
        // Show success message
        alert(`Contact "${contactName}" has been deleted successfully.`);
    } catch (error) {
        alert('Failed to delete contact: ' + error.message);
    }
}

async function getCurrentLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            resolve(null);
            return;
        }
        
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                
                // Try to get location name using reverse geocoding
                let locationName = null;
                try {
                    // Using OpenStreetMap Nominatim API (free, no key required)
                    const response = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
                        {
                            headers: {
                                'User-Agent': 'PPLAI/1.0'
                            }
                        }
                    );
                    const data = await response.json();
                    if (data && data.address) {
                        const addr = data.address;
                        locationName = [
                            addr.road,
                            addr.suburb || addr.neighbourhood,
                            addr.city || addr.town || addr.village,
                            addr.country
                        ].filter(Boolean).join(', ') || data.display_name;
                    }
                } catch (error) {
                    console.log('Could not get location name:', error);
                }
                
                resolve({
                    latitude: lat,
                    longitude: lng,
                    locationName: locationName
                });
            },
            (error) => {
                console.log('Geolocation error:', error);
                resolve(null);
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    });
}

async function checkExistingContact(email, mobile) {
    if (!email && !mobile) return null;
    
    try {
        const existingContact = await api.findContact(email, mobile);
        return existingContact;
    } catch (error) {
        // Contact not found or error
        return null;
    }
}

async function saveContactFromView() {
    if (!currentViewingContactId || !currentViewingContact) {
        alert('No contact to save');
        return;
    }
    
    // Close the view modal
    document.getElementById('contactViewModal')?.classList.add('hidden');
    
    // Open the contact form with the current contact data
    await openContactModal(currentViewingContact);
}

async function saveContact() {
    const name = document.getElementById('contactName')?.value;
    const email = document.getElementById('contactEmail')?.value;
    const role = document.getElementById('contactRole')?.value;
    const mobileInput = document.getElementById('contactMobile')?.value;
    const countryCode = document.getElementById('contactCountryCode')?.value || '+91';
    // Combine country code with mobile number
    const mobile = mobileInput ? (mobileInput.startsWith('+') ? mobileInput : `${countryCode}${mobileInput}`) : null;
    const linkedin = document.getElementById('contactLinkedIn')?.value;
    const context = document.getElementById('contactContext')?.value;
    const eventSelect = document.getElementById('contactEvent');
    const selectedEventId = eventSelect?.value || null;
    const photoInput = document.getElementById('contactPhotoInput');
    const mediaInput = document.getElementById('mediaInput');
    let photoFile = photoInput?.files[0];
    let mediaFiles = mediaInput?.files ? Array.from(mediaInput.files) : [];
    
    // Compress contact photo if provided
    if (photoFile && photoFile.type.startsWith('image/')) {
        try {
            photoFile = await compressImage(photoFile);
        } catch (error) {
            console.warn('Failed to compress contact photo:', error);
            // Continue with original file
        }
    }
    
    // Compress media files if provided
    if (mediaFiles.length > 0) {
        try {
            mediaFiles = await compressImages(mediaFiles);
        } catch (error) {
            console.warn('Failed to compress media files:', error);
            // Continue with original files
        }
    }
    
    const tags = Array.from(document.querySelectorAll('#contactTags .tag')).map(t => t.textContent.replace('×', '').trim());

    if (!name) {
        alert('Name is required');
        return;
    }

    // Check if contact already exists (only for new contacts)
    if (!editingContactId && (email || mobile)) {
        const existingContact = await checkExistingContact(email, mobile);
        if (existingContact) {
            const confirmUpdate = confirm(
                `A contact with ${email ? 'this email' : 'this phone number'} already exists:\n\n` +
                `Name: ${existingContact.name}\n` +
                `Email: ${existingContact.email || 'N/A'}\n` +
                `Mobile: ${existingContact.mobile || 'N/A'}\n\n` +
                `Would you like to update the existing contact instead?`
            );
            
            if (confirmUpdate) {
                // Switch to edit mode
                editingContactId = existingContact.id;
                // Pre-fill the form with new data
                if (name) document.getElementById('contactName').value = name;
                if (email) document.getElementById('contactEmail').value = email;
                if (role) document.getElementById('contactRole').value = role;
                if (mobile) document.getElementById('contactMobile').value = mobile;
                if (linkedin) document.getElementById('contactLinkedIn').value = linkedin;
                if (context) {
                    const contextEl = document.getElementById('contactContext');
                    if (contextEl) {
                        // Append to existing context if any
                        const existingContext = existingContact.meeting_context || '';
                        contextEl.value = existingContext ? `${existingContext}\n\n${context}` : context;
                    }
                }
                // Update modal title
                const modalTitle = document.querySelector('#contactModal .modal-header h3');
                if (modalTitle) modalTitle.textContent = 'Edit Contact';
                // Continue with save (which will update)
                // Don't return, let it proceed to update
    } else {
                return; // User cancelled
            }
        }
    }

    try {
        // Check if we're online
        const isOnline = navigator.onLine;
        
        // Get current location
        const location = await getCurrentLocation();
        
        // Get meeting date/time - use vCard date if available, otherwise use current time if not set
        const meetingDateInput = document.getElementById('contactMeetingDate');
        let meetingDate = null;
        if (window.tempVCardDate) {
            // Use date from vCard QR scan
            meetingDate = new Date(window.tempVCardDate + 'T00:00:00').toISOString();
            delete window.tempVCardDate;
        } else if (meetingDateInput && meetingDateInput.value) {
            // Convert datetime-local value to ISO string
            meetingDate = new Date(meetingDateInput.value).toISOString();
        } else {
            // Default to current time if not set
            meetingDate = new Date().toISOString();
        }
        
        // Use vCard tags if available
        let finalTags = tags;
        if (window.tempVCardTags && window.tempVCardTags.length > 0) {
            // Merge vCard tags with manually added tags
            finalTags = [...new Set([...tags, ...window.tempVCardTags])];
            delete window.tempVCardTags;
        }
        
        // Ensure pplai.app profile URL is included in context if it was scanned from QR
        let finalContext = context || '';
        if (window.tempVCardProfileUrl) {
            const profileUrlText = `pplai.app Profile: ${window.tempVCardProfileUrl}`;
            // Only add if not already present (user might have removed it)
            if (!finalContext.includes(window.tempVCardProfileUrl)) {
                if (finalContext) {
                    finalContext = `${finalContext}\n\n${profileUrlText}`;
                } else {
                    finalContext = profileUrlText;
                }
            }
            delete window.tempVCardProfileUrl;
        }
        
        const contactData = {
            name,
            email: email || null,
            role_company: role || null,
            mobile: mobile || null,
            linkedin_url: linkedin || null,
            meeting_context: finalContext || null,
            meeting_date: meetingDate,
            event_id: selectedEventId || currentEvent?.id || null,
            tags: finalTags,
            meeting_latitude: location?.latitude || null,
            meeting_longitude: location?.longitude || null,
            meeting_location_name: location?.locationName || null,
        };

        const photoFile = photoInput?.files[0] || null;
        const mediaFiles = Array.from(mediaInput?.files || []);

        let savedContact;
        if (editingContactId) {
            // Update existing contact - always try API first
            try {
                savedContact = await api.updateContact(editingContactId, contactData, photoFile, mediaFiles);
                closeModal();
                editingContactId = null;
                await loadContacts();
                displayContactProfile(savedContact, false);
            } catch (error) {
                if (!isOnline) {
                    alert('Cannot update contact while offline. Please connect to the internet.');
                } else {
                    alert('Failed to update contact: ' + error.message);
                }
            }
        } else {
            // Create new contact
            if (!isOnline) {
                // Save to offline queue
                const queueItem = await offlineQueue.addContact(contactData, photoFile, mediaFiles);
                closeModal();
                editingContactId = null;
                
                // Show success message
                alert(`Contact "${contactData.name}" saved offline. It will be synced when you're back online.`);
                
                // Reload contacts to show the offline contact (if we display them)
                await loadContacts();
            } else {
                try {
                    savedContact = await api.createContact(contactData, photoFile, mediaFiles);
                    closeModal();
                    editingContactId = null;
                    await loadContacts();
                    displayContactProfile(savedContact, false);
                } catch (error) {
                    // If API fails, try to save offline as fallback
                    if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
                        console.warn('Network error, saving to offline queue:', error);
                        const queueItem = await offlineQueue.addContact(contactData, photoFile, mediaFiles);
                        closeModal();
                        editingContactId = null;
                        alert(`Contact "${contactData.name}" saved offline due to network error. It will be synced when connection is restored.`);
                        await loadContacts();
                    } else {
                        throw error; // Re-throw non-network errors
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error saving contact:', error);
        if (!error.message.includes('offline') && !error.message.includes('Network')) {
            alert('Failed to save contact: ' + error.message);
        }
    }
}

function calculateProfileCompleteness(profile) {
    // Define all profile fields with their weights
    const fields = [
        { key: 'name', label: 'Name', required: true, weight: 1 },
        { key: 'email', label: 'Email', required: true, weight: 1 },
        { key: 'profile_photo_url', label: 'Profile Photo', required: false, weight: 1 },
        { key: 'role_company', label: 'Role & Company', required: false, weight: 1 },
        { key: 'mobile', label: 'Mobile', required: false, weight: 0.8 },
        { key: 'whatsapp', label: 'WhatsApp', required: false, weight: 0.8 },
        { key: 'linkedin_url', label: 'LinkedIn', required: false, weight: 0.8 },
        { key: 'about_me', label: 'About Me', required: false, weight: 1 },
    ];
    
    let totalWeight = 0;
    let filledWeight = 0;
    const missingFields = [];
    const filledFields = [];
    
    fields.forEach(field => {
        const value = profile[field.key];
        const isFilled = value && value.toString().trim() !== '';
        
        totalWeight += field.weight;
        
        if (isFilled) {
            filledWeight += field.weight;
            filledFields.push(field.label);
        } else {
            missingFields.push(field.label);
        }
    });
    
    const percentage = totalWeight > 0 ? Math.round((filledWeight / totalWeight) * 100) : 0;
    
    return {
        percentage,
        filledWeight,
        totalWeight,
        missingFields,
        filledFields
    };
}

function updateProfileCompleteness(profile) {
    // Check if user has hidden the completeness card
    const isHidden = localStorage.getItem('hideProfileCompleteness') === 'true';
    const card = document.getElementById('profileCompletenessCard');
    if (card) {
        card.style.display = isHidden ? 'none' : 'block';
    }
    
    // If hidden, don't update the content
    if (isHidden) return;
    
    const completeness = calculateProfileCompleteness(profile);
    
    // Update percentage
    const percentageEl = document.getElementById('completenessPercentage');
    if (percentageEl) {
        percentageEl.textContent = `${completeness.percentage}%`;
        
        // Color code based on completeness
        if (completeness.percentage >= 80) {
            percentageEl.style.color = 'var(--success)';
        } else if (completeness.percentage >= 50) {
            percentageEl.style.color = 'var(--warning)';
        } else {
            percentageEl.style.color = 'var(--danger)';
        }
    }
    
    // Update progress bar
    const progressEl = document.getElementById('completenessProgress');
    if (progressEl) {
        progressEl.style.width = `${completeness.percentage}%`;
        
        // Color code progress bar
        if (completeness.percentage >= 80) {
            progressEl.style.backgroundColor = 'var(--success)';
        } else if (completeness.percentage >= 50) {
            progressEl.style.backgroundColor = 'var(--warning)';
        } else {
            progressEl.style.backgroundColor = 'var(--danger)';
        }
    }
    
    // Update details
    const detailsEl = document.getElementById('completenessDetails');
    if (detailsEl) {
        if (completeness.percentage === 100) {
            detailsEl.innerHTML = '<p class="completeness-message success">🎉 Your profile is complete!</p>';
        } else {
            const missingCount = completeness.missingFields.length;
            const missingText = completeness.missingFields.slice(0, 3).join(', ');
            const moreText = missingCount > 3 ? ` and ${missingCount - 3} more` : '';
            
            detailsEl.innerHTML = `
                <p class="completeness-message">
                    <strong>Missing:</strong> ${missingText}${moreText}
                </p>
                <button class="btn-small btn-primary" onclick="document.getElementById('editProfileBtn')?.click()">
                    Complete Profile
                </button>
            `;
        }
    }
}

async function viewContact(contactId) {
    try {
        const contact = await api.getContact(contactId);
        displayContactProfile(contact, false);
    } catch (error) {
        alert('Failed to load contact: ' + error.message);
    }
}

let currentViewingContactId = null;

function displayContactProfile(data, isOwnProfile = false) {
    const modal = document.getElementById('contactViewModal');
    if (!modal) return;
    
    // Store contact ID and data for editing
    currentViewingContactId = isOwnProfile ? null : (data.id || null);
    currentViewingContact = data;
    
    // Set title
    const titleEl = document.getElementById('contactViewTitle');
    if (titleEl) {
        titleEl.textContent = isOwnProfile ? 'My Profile' : 'Contact Details';
    }
    
    // Show/hide edit and delete buttons
    const editBtn = document.getElementById('editContactBtn');
    if (editBtn) {
        editBtn.style.display = isOwnProfile ? 'none' : 'block';
    }
    
    const deleteBtn = document.getElementById('deleteContactBtn');
    if (deleteBtn) {
        deleteBtn.style.display = isOwnProfile ? 'none' : 'block';
    }
    
    // Photo
    const photoEl = document.getElementById('contactViewPhoto');
    const photoPlaceholder = document.getElementById('contactViewPhotoPlaceholder');
    if (photoEl && photoPlaceholder) {
        if (data.contact_photo_url || data.profile_photo_url) {
            photoEl.src = data.contact_photo_url || data.profile_photo_url;
            photoEl.style.display = 'block';
            photoPlaceholder.style.display = 'none';
        } else {
            photoEl.style.display = 'none';
            photoPlaceholder.style.display = 'flex';
        }
    }

    // Name
    const nameEl = document.getElementById('contactViewName');
    if (nameEl) nameEl.textContent = data.name || '';
    
    // Role
    const roleEl = document.getElementById('contactViewRole');
    if (roleEl) {
        roleEl.textContent = data.role_company || '';
        roleEl.style.display = data.role_company ? 'block' : 'none';
    }
    
    // Email
    const emailItem = document.getElementById('contactViewEmailItem');
    const emailEl = document.getElementById('contactViewEmail');
    if (emailItem && emailEl) {
        if (data.email) {
            emailEl.textContent = data.email;
            emailItem.style.display = 'flex';
        } else {
            emailItem.style.display = 'none';
        }
    }
    
    // Mobile
    const mobileItem = document.getElementById('contactViewMobileItem');
    const mobileEl = document.getElementById('contactViewMobile');
    if (mobileItem && mobileEl) {
        if (data.mobile) {
            mobileEl.textContent = data.mobile;
            mobileItem.style.display = 'flex';
        } else {
            mobileItem.style.display = 'none';
        }
    }
    
    // LinkedIn
    const linkedInItem = document.getElementById('contactViewLinkedInItem');
    const linkedInEl = document.getElementById('contactViewLinkedIn');
    if (linkedInItem && linkedInEl) {
        if (data.linkedin_url) {
            linkedInEl.href = data.linkedin_url;
            linkedInEl.textContent = data.linkedin_url;
            linkedInItem.style.display = 'flex';
        } else {
            linkedInItem.style.display = 'none';
        }
    }
    
    // Event (only for contacts)
    const eventItem = document.getElementById('contactViewEventItem');
    const eventEl = document.getElementById('contactViewEvent');
    if (eventItem && eventEl && !isOwnProfile && data.event) {
        eventEl.textContent = data.event.name || 'N/A';
        eventItem.style.display = 'flex';
    } else if (eventItem) {
        eventItem.style.display = 'none';
    }
    
    // Meeting Date (only for contacts)
    const dateItem = document.getElementById('contactViewDateItem');
    const dateEl = document.getElementById('contactViewDate');
    if (dateItem && dateEl && !isOwnProfile && data.meeting_date) {
        dateEl.textContent = new Date(data.meeting_date).toLocaleString();
        dateItem.style.display = 'flex';
    } else if (dateItem) {
        dateItem.style.display = 'none';
    }
    
    // Location (only for contacts)
    const locationItem = document.getElementById('contactViewLocationItem');
    const locationEl = document.getElementById('contactViewLocation');
    if (locationItem && locationEl && !isOwnProfile) {
        if (data.meeting_location_name) {
            locationEl.textContent = data.meeting_location_name;
            locationItem.style.display = 'flex';
        } else if (data.meeting_latitude && data.meeting_longitude) {
            locationEl.textContent = `${data.meeting_latitude.toFixed(6)}, ${data.meeting_longitude.toFixed(6)}`;
            locationEl.style.cursor = 'pointer';
            locationEl.title = 'Click to view on map';
            locationEl.onclick = () => {
                window.open(`https://www.google.com/maps?q=${data.meeting_latitude},${data.meeting_longitude}`, '_blank');
            };
            locationItem.style.display = 'flex';
        } else {
            locationItem.style.display = 'none';
        }
    } else if (locationItem) {
        locationItem.style.display = 'none';
    }
    
    // Context (only for contacts)
    const contextItem = document.getElementById('contactViewContextItem');
    const contextEl = document.getElementById('contactViewContext');
    if (contextItem && contextEl && !isOwnProfile) {
        if (data.meeting_context) {
            contextEl.textContent = data.meeting_context;
            contextItem.style.display = 'block';
        } else {
            contextItem.style.display = 'none';
        }
    } else if (contextItem) {
        contextItem.style.display = 'none';
    }
    
    // Tags
    const tagsItem = document.getElementById('contactViewTagsItem');
    const tagsEl = document.getElementById('contactViewTags');
    if (tagsItem && tagsEl) {
        if (data.tags && data.tags.length > 0) {
            tagsEl.innerHTML = data.tags.map(tag => {
                const tagName = tag.name || tag;
                const color = getTagColor(tagName);
                return `<span class="tag" style="background-color: ${color.bg}; color: ${color.text}; border-color: ${color.border};">
                    ${tagName}
                </span>`;
            }).join('');
            tagsItem.style.display = 'block';
        } else {
            tagsItem.style.display = 'none';
        }
    }
    
    // Media (only for contacts)
    const mediaItem = document.getElementById('contactViewMediaItem');
    const mediaEl = document.getElementById('contactViewMedia');
    if (mediaItem && mediaEl && !isOwnProfile) {
        if (data.media && data.media.length > 0) {
            mediaEl.innerHTML = data.media.map(media => {
                if (media.file_type === 'image') {
                    return `<img src="${media.file_url}" alt="Media" style="max-width: 200px; border-radius: 8px; margin: 4px;">`;
                } else if (media.file_type === 'audio') {
                    return `<audio controls style="width: 100%; margin: 4px;"><source src="${media.file_url}"></audio>`;
                } else {
                    return `<a href="${media.file_url}" target="_blank" style="display: block; padding: 8px; background: var(--card-bg); border-radius: 8px; margin: 4px;">📄 ${media.file_name || 'Download'}</a>`;
                }
            }).join('');
            mediaItem.style.display = 'block';
        } else {
            mediaItem.style.display = 'none';
        }
    } else if (mediaItem) {
        mediaItem.style.display = 'none';
    }
    
    // Update contact action buttons visibility
    updateContactActionButtons(data);
    
    // Show/hide chat button (only for contacts, not own profile)
    const chatBtn = document.getElementById('chatContactBtn');
    if (chatBtn) {
        chatBtn.style.display = isOwnProfile ? 'none' : 'block';
    }
    
    // Show modal
    modal.classList.remove('hidden');
}

// Chat functionality
function loadChatMessages(contact) {
    const chatContainer = document.getElementById('contactChatMessages');
    if (!chatContainer) return;
    
    // Parse meeting_context to extract messages
    if (contact.meeting_context) {
        // Split by timestamp pattern [YYYY-MM-DD HH:MM]
        const messages = contact.meeting_context.split(/(\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\])/);
        chatContainer.innerHTML = '';
        
        let currentMessage = '';
        for (let i = 0; i < messages.length; i++) {
            if (messages[i].match(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\]/)) {
                // This is a timestamp
                if (currentMessage.trim()) {
                    // Save previous message
                    addMessageToChat(currentMessage.trim(), null);
                    currentMessage = '';
                }
                // Next item should be the message
                if (i + 1 < messages.length) {
                    currentMessage = messages[i + 1].trim();
                    const timestamp = messages[i];
                    addMessageToChat(currentMessage, timestamp);
                    i++; // Skip next as we've processed it
                    currentMessage = '';
                }
            } else if (messages[i].trim()) {
                currentMessage += messages[i];
            }
        }
        
        // Add any remaining message
        if (currentMessage.trim()) {
            addMessageToChat(currentMessage.trim(), null);
        }
        
        // Scroll to bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
    } else {
        chatContainer.innerHTML = '<div class="chat-empty-state" style="text-align: center; color: var(--text-secondary); padding: 20px;">No messages yet. Start a conversation!</div>';
    }
}

function addMessageToChat(message, timestamp) {
    const chatContainer = document.getElementById('contactChatMessages');
    if (!chatContainer) return;
    
    // Remove empty state if exists
    const emptyState = chatContainer.querySelector('.chat-empty-state');
    if (emptyState) emptyState.remove();
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    
    if (timestamp) {
        const timeText = timestamp.replace('[', '').replace(']', '');
        messageDiv.innerHTML = `
            <div class="chat-message-time">${timeText}</div>
            <div class="chat-message-text">${escapeHtml(message)}</div>
        `;
    } else {
        messageDiv.innerHTML = `
            <div class="chat-message-text">${escapeHtml(message)}</div>
        `;
    }
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function sendChatMessage() {
    if (!currentViewingContactId || !currentViewingContact) return;
    
    const input = document.getElementById('chatMessageInput');
    const message = input?.value.trim();
    
    if (!message) return;
    
    try {
        // Disable input while sending
        input.disabled = true;
        const sendBtn = document.getElementById('chatSendBtn');
        if (sendBtn) sendBtn.disabled = true;
        
        await api.addMessageToContact(currentViewingContactId, message);
        
        // Clear input
        input.value = '';
        
        // Reload contact to get updated context
        const updatedContact = await api.getContact(currentViewingContactId);
        currentViewingContact = updatedContact;
        loadChatMessages(updatedContact);
        
        // Re-enable input
        input.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        input.focus();
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message: ' + error.message);
        const input = document.getElementById('chatMessageInput');
        const sendBtn = document.getElementById('chatSendBtn');
        if (input) input.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
    }
}

function handleChatPhotoSelect(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const preview = document.getElementById('chatPhotoPreview');
    if (!preview) return;
    
    preview.innerHTML = '';
    preview.style.display = 'block';
    
    Array.from(files).forEach((file, index) => {
        if (!file.type.startsWith('image/')) {
            alert('Please select image files only');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = document.createElement('img');
            img.src = event.target.result;
            img.style.width = '80px';
            img.style.height = '80px';
            img.style.objectFit = 'cover';
            img.style.borderRadius = '8px';
            img.style.marginRight = '8px';
            img.style.marginBottom = '8px';
            
            const container = document.createElement('div');
            container.style.position = 'relative';
            container.style.display = 'inline-block';
            
            const removeBtn = document.createElement('button');
            removeBtn.innerHTML = '×';
            removeBtn.style.position = 'absolute';
            removeBtn.style.top = '-8px';
            removeBtn.style.right = '-8px';
            removeBtn.style.width = '24px';
            removeBtn.style.height = '24px';
            removeBtn.style.borderRadius = '50%';
            removeBtn.style.background = 'var(--danger)';
            removeBtn.style.color = 'white';
            removeBtn.style.border = 'none';
            removeBtn.style.cursor = 'pointer';
            removeBtn.style.fontSize = '16px';
            removeBtn.style.lineHeight = '1';
            removeBtn.onclick = () => {
                container.remove();
                if (preview.children.length === 0) {
                    preview.style.display = 'none';
                }
            };
            
            container.appendChild(img);
            container.appendChild(removeBtn);
            preview.appendChild(container);
        };
        reader.readAsDataURL(file);
    });
    
    // Upload photos
    uploadChatPhotos(files);
}

async function uploadChatPhotos(files) {
    if (!currentViewingContactId || !files || files.length === 0) return;
    
    try {
        // Compress images before uploading
        const fileArray = Array.from(files);
        const compressedFiles = await compressImages(fileArray);
        
        for (const file of compressedFiles) {
            if (!file.type.startsWith('image/')) continue;
            
            await api.addMediaToContact(currentViewingContactId, file);
        }
        
        // Reload contact to get updated media
        const updatedContact = await api.getContact(currentViewingContactId);
        currentViewingContact = updatedContact;
        
        // Update media display
        const mediaItem = document.getElementById('contactViewMediaItem');
        const mediaEl = document.getElementById('contactViewMedia');
        if (mediaItem && mediaEl && updatedContact.media && updatedContact.media.length > 0) {
            mediaEl.innerHTML = updatedContact.media.map(media => {
                if (media.file_type === 'image') {
                    return `<img src="${media.file_url}" alt="Media" style="max-width: 200px; border-radius: 8px; margin: 4px;">`;
                } else if (media.file_type === 'audio') {
                    return `<audio controls style="width: 100%; margin: 4px;"><source src="${media.file_url}"></audio>`;
                } else {
                    return `<a href="${media.file_url}" target="_blank" style="display: block; padding: 8px; background: var(--card-bg); border-radius: 8px; margin: 4px;">📄 ${media.file_name || 'Download'}</a>`;
                }
            }).join('');
            mediaItem.style.display = 'block';
        }
        
        // Clear preview
        const preview = document.getElementById('chatPhotoPreview');
        if (preview) {
            preview.innerHTML = '';
            preview.style.display = 'none';
        }
        
        // Clear file input
        const fileInput = document.getElementById('chatPhotoInput');
        if (fileInput) fileInput.value = '';
        
    } catch (error) {
        console.error('Error uploading photos:', error);
        alert('Failed to upload photos: ' + error.message);
    }
}

// Chat View Functions
let chatViewContactId = null;
let chatViewContact = null;
let mediaRecorder = null;
let recordingTimer = null;
let recordingStartTime = null;

async function openChatView(contactId, contactName) {
    chatViewContactId = contactId;
    
    // Close any modals
    closeModal();
    
    // Switch to chat view
    switchView('chat');
    
    // Update header
    const nameEl = document.getElementById('chatContactName');
    if (nameEl) {
        nameEl.textContent = contactName || 'Chat';
    }
    
    // Load contact data
    try {
        chatViewContact = await api.getContact(contactId);
        loadChatViewMessages(chatViewContact);
    } catch (error) {
        console.error('Error loading contact for chat:', error);
        alert('Failed to load contact: ' + error.message);
    }
}

function loadChatViewMessages(contact) {
    const chatContainer = document.getElementById('chatViewMessages');
    if (!chatContainer) return;
    
    chatContainer.innerHTML = '';
    
    // Parse meeting_context to extract messages
    if (contact.meeting_context) {
        const messages = contact.meeting_context.split(/(\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\])/);
        
        let currentMessage = '';
        for (let i = 0; i < messages.length; i++) {
            if (messages[i].match(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\]/)) {
                if (currentMessage.trim()) {
                    addMessageToChatView(currentMessage.trim(), messages[i]);
                    currentMessage = '';
                }
            } else if (messages[i].trim()) {
                currentMessage += messages[i];
            }
        }
        
        if (currentMessage.trim()) {
            addMessageToChatView(currentMessage.trim(), null);
        }
        
        chatContainer.scrollTop = chatContainer.scrollHeight;
    } else {
        chatContainer.innerHTML = '<div class="chat-empty-state" style="text-align: center; color: var(--text-secondary); padding: 40px 20px;">No messages yet. Start a conversation!</div>';
    }
    
    // Load media attachments as messages
    if (contact.media && contact.media.length > 0) {
        contact.media.forEach(media => {
            if (media.file_type === 'image') {
                addMediaToChatView('image', media.file_url);
            } else if (media.file_type === 'audio') {
                addMediaToChatView('audio', media.file_url);
            }
        });
    }
}

function addMessageToChatView(message, timestamp) {
    const chatContainer = document.getElementById('chatViewMessages');
    if (!chatContainer) return;
    
    const emptyState = chatContainer.querySelector('.chat-empty-state');
    if (emptyState) emptyState.remove();
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    
    if (timestamp) {
        const timeText = timestamp.replace('[', '').replace(']', '');
        messageDiv.innerHTML = `
            <div class="chat-message-time">${timeText}</div>
            <div class="chat-message-text">${escapeHtml(message)}</div>
        `;
    } else {
        messageDiv.innerHTML = `
            <div class="chat-message-text">${escapeHtml(message)}</div>
        `;
    }
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function addMediaToChatView(type, url) {
    const chatContainer = document.getElementById('chatViewMessages');
    if (!chatContainer) return;
    
    const emptyState = chatContainer.querySelector('.chat-empty-state');
    if (emptyState) emptyState.remove();
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    
    if (type === 'image') {
        messageDiv.innerHTML = `<img src="${url}" alt="Photo" style="max-width: 100%; border-radius: 8px; margin-top: 8px;">`;
    } else if (type === 'audio') {
        messageDiv.innerHTML = `<audio controls style="width: 100%; margin-top: 8px;"><source src="${url}"></audio>`;
    }
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function sendChatViewMessage() {
    if (!chatViewContactId) return;
    
    const input = document.getElementById('chatViewMessageInput');
    const message = input?.value.trim();
    
    if (!message) return;
    
    try {
        input.disabled = true;
        const sendBtn = document.getElementById('chatViewSendBtn');
        if (sendBtn) sendBtn.disabled = true;
        
        await api.addMessageToContact(chatViewContactId, message);
        
        input.value = '';
        
        // Reload contact
        chatViewContact = await api.getContact(chatViewContactId);
        loadChatViewMessages(chatViewContact);
        
        input.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
        input.focus();
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message: ' + error.message);
        const input = document.getElementById('chatViewMessageInput');
        const sendBtn = document.getElementById('chatViewSendBtn');
        if (input) input.disabled = false;
        if (sendBtn) sendBtn.disabled = false;
    }
}

async function handleChatViewPhotoSelect(e) {
    const files = e.target.files;
    if (!files || files.length === 0 || !chatViewContactId) return;
    
    try {
        const fileArray = Array.from(files);
        const compressedFiles = await compressImages(fileArray);
        
        for (const file of compressedFiles) {
            if (!file.type.startsWith('image/')) continue;
            await api.addMediaToContact(chatViewContactId, file);
        }
        
        // Reload contact
        chatViewContact = await api.getContact(chatViewContactId);
        loadChatViewMessages(chatViewContact);
        
        // Clear input
        const fileInput = document.getElementById('chatViewPhotoInput');
        if (fileInput) fileInput.value = '';
    } catch (error) {
        console.error('Error uploading photos:', error);
        alert('Failed to upload photos: ' + error.message);
    }
}

// Voice Recording Functions
async function startVoiceRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') return;
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        const audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioFile = new File([audioBlob], `voice_note_${Date.now()}.webm`, { type: 'audio/webm' });
            
            // Upload voice note
            if (chatViewContactId) {
                try {
                    await api.addMediaToContact(chatViewContactId, audioFile);
                    chatViewContact = await api.getContact(chatViewContactId);
                    loadChatViewMessages(chatViewContact);
                } catch (error) {
                    console.error('Error uploading voice note:', error);
                    alert('Failed to upload voice note: ' + error.message);
                }
            }
            
            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        recordingStartTime = Date.now();
        
        // Show recording UI
        const recordingEl = document.getElementById('chatViewVoiceRecording');
        if (recordingEl) {
            recordingEl.style.display = 'block';
        }
        
        // Start timer
        recordingTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            const timeEl = document.getElementById('chatViewRecordingTime');
            if (timeEl) {
                timeEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            }
        }, 1000);
        
    } catch (error) {
        console.error('Error starting recording:', error);
        alert('Failed to start recording. Please allow microphone access.');
    }
}

function stopVoiceRecording() {
    if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
    
    mediaRecorder.stop();
    
    // Hide recording UI
    const recordingEl = document.getElementById('chatViewVoiceRecording');
    if (recordingEl) {
        recordingEl.style.display = 'none';
    }
    
    // Clear timer
    if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
    }
    
    const timeEl = document.getElementById('chatViewRecordingTime');
    if (timeEl) {
        timeEl.textContent = '00:00';
    }
}

// QR Scanner
let qrScannerStream = null;
let qrScannerInterval = null;

function openQRScanner() {
    const modal = document.getElementById('qrScannerModal');
    const video = document.getElementById('qrVideo');
    const canvas = document.getElementById('qrCanvas');
    
    if (!modal || !video || !canvas) {
        alert('QR Scanner elements not found');
        return;
    }
    
    modal.classList.remove('hidden');
    
    // Request camera access
    navigator.mediaDevices.getUserMedia({ 
        video: { 
            facingMode: 'environment', // Use back camera on mobile
            width: { ideal: 1280 },
            height: { ideal: 720 }
        } 
    })
    .then(stream => {
        qrScannerStream = stream;
        video.srcObject = stream;
        video.play();
        
        // Start scanning
        qrScannerInterval = setInterval(() => {
            scanQRCode(video, canvas);
        }, 500); // Scan every 500ms
    })
    .catch(error => {
        console.error('Error accessing camera:', error);
        alert('Unable to access camera. Please allow camera permissions.');
        closeQRScanner();
    });
}

function closeQRScanner() {
    const modal = document.getElementById('qrScannerModal');
    const video = document.getElementById('qrVideo');
    
    // Stop scanning
    if (qrScannerInterval) {
        clearInterval(qrScannerInterval);
        qrScannerInterval = null;
    }
    
    // Stop camera stream
    if (qrScannerStream) {
        qrScannerStream.getTracks().forEach(track => track.stop());
        qrScannerStream = null;
    }
    
    if (video) {
        video.srcObject = null;
    }
    
    if (modal) {
        modal.classList.add('hidden');
    }
}

function scanQRCode(video, canvas) {
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA || typeof jsQR === 'undefined') {
        return;
    }
    
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    
    if (code) {
        // Found a QR code
        console.log('QR Code detected:', code.data);
        handleQRCodeScanned(code.data);
    }
}

async function handleQRCodeScanned(data) {
    // Close scanner
    closeQRScanner();
    
    // Check if it's a vCard
    if (data.startsWith('BEGIN:VCARD')) {
        try {
            const contact = parseVCard(data);
            await createContactFromVCard(contact);
        } catch (error) {
            console.error('Error parsing vCard:', error);
            alert('Error parsing contact card: ' + error.message);
        }
    } else if (data.startsWith('http://') || data.startsWith('https://')) {
        // It's a URL - could be a profile link
        alert('URL QR code detected: ' + data + '\n\nProfile links are not yet supported for automatic contact creation.');
    } else {
        // Unknown format
        alert('QR code detected but format not recognized:\n' + data);
    }
}

function parseVCard(vcardData) {
    const lines = vcardData.split(/\r?\n/);
    const contact = {};
    
    for (let line of lines) {
        if (!line || line.startsWith('BEGIN:') || line.startsWith('END:')) continue;
        
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;
        
        const field = line.substring(0, colonIndex).toUpperCase();
        const value = line.substring(colonIndex + 1);
        
        // Parse standard vCard fields
        if (field.startsWith('FN')) {
            contact.name = unescapeVCardValue(value);
        } else if (field.startsWith('EMAIL')) {
            contact.email = unescapeVCardValue(value);
        } else if (field.startsWith('TEL')) {
            if (!contact.mobile) {
                contact.mobile = unescapeVCardValue(value);
            }
            if (field.includes('WA')) {
                contact.whatsapp = unescapeVCardValue(value);
            }
        } else if (field.startsWith('URL')) {
            if (field.includes('PPLAI')) {
                contact.pplai_profile_url = unescapeVCardValue(value);
            } else if (field.includes('LINKEDIN') || value.includes('linkedin.com')) {
                contact.linkedin_url = unescapeVCardValue(value);
            }
        } else if (field.startsWith('TITLE')) {
            contact.role_company = unescapeVCardValue(value);
        } else if (field.startsWith('NOTE') && !field.includes('PPLAI')) {
            contact.about_me = unescapeVCardValue(value);
        } else if (field.startsWith('X-PPLAI-DATE-CONNECTED')) {
            if (field.includes('READABLE')) {
                contact.pplai_date_connected_readable = unescapeVCardValue(value);
            } else {
                contact.pplai_date_connected = unescapeVCardValue(value);
            }
        } else if (field.startsWith('X-PPLAI-EVENT')) {
            contact.pplai_event = unescapeVCardValue(value);
        } else if (field.startsWith('X-PPLAI-NOTES')) {
            contact.pplai_notes = unescapeVCardValue(value);
        } else if (field.startsWith('X-PPLAI-TAGS')) {
            contact.pplai_tags = unescapeVCardValue(value);
        }
    }
    
    return contact;
}

function unescapeVCardValue(value) {
    if (!value) return '';
    return value
        .replace(/\\n/g, '\n')
        .replace(/\\,/g, ',')
        .replace(/\\;/g, ';')
        .replace(/\\\\/g, '\\');
}

async function createContactFromVCard(vcardContact) {
    try {
        // Check if contact already exists
        const existing = await api.findContact(vcardContact.email, vcardContact.mobile);
        
        if (existing) {
            const update = confirm(
                `Contact "${existing.name}" already exists.\n\n` +
                `Would you like to update it with the new information?`
            );
            if (!update) return;
        }
        
        // Open contact modal with pre-filled data
        openContactModal();
        
        // Pre-fill form
        const nameEl = document.getElementById('contactName');
        if (nameEl && vcardContact.name) nameEl.value = vcardContact.name;
        
        const emailEl = document.getElementById('contactEmail');
        if (emailEl && vcardContact.email) emailEl.value = vcardContact.email;
        
        const mobileEl = document.getElementById('contactMobile');
        if (mobileEl && vcardContact.mobile) mobileEl.value = vcardContact.mobile;
        
        const whatsappEl = document.getElementById('contactWhatsApp');
        if (whatsappEl && vcardContact.whatsapp) whatsappEl.value = vcardContact.whatsapp;
        
        const linkedinEl = document.getElementById('contactLinkedIn');
        if (linkedinEl && vcardContact.linkedin_url) linkedinEl.value = vcardContact.linkedin_url;
        
        const roleEl = document.getElementById('contactRole');
        if (roleEl && vcardContact.role_company) roleEl.value = vcardContact.role_company;
        
        // Set meeting context with pplai.app metadata
        let meetingContext = '';
        if (vcardContact.pplai_notes) {
            meetingContext = vcardContact.pplai_notes;
        }
        
        // Add date connected on pplai.app
        if (vcardContact.pplai_date_connected) {
            const dateConnected = vcardContact.pplai_date_connected;
            const dateConnectedReadable = vcardContact.pplai_date_connected_readable || dateConnected;
            if (meetingContext) {
                meetingContext += `\n\nDate Connected on pplai.app: ${dateConnectedReadable} (${dateConnected})`;
            } else {
                meetingContext = `Date Connected on pplai.app: ${dateConnectedReadable} (${dateConnected})`;
            }
        }
        
        // Add pplai.app profile URL if available
        if (vcardContact.pplai_profile_url) {
            if (meetingContext) {
                meetingContext += `\n\npplai.app Profile: ${vcardContact.pplai_profile_url}`;
            } else {
                meetingContext = `pplai.app Profile: ${vcardContact.pplai_profile_url}`;
            }
        }
        
        const contextEl = document.getElementById('contactContext');
        if (contextEl && meetingContext) {
            contextEl.value = meetingContext.trim();
        }
        
        // Try to find and select the event if event name is provided
        if (vcardContact.pplai_event) {
            try {
                const events = await api.getEvents();
                const matchingEvent = events.find(e => 
                    e.name.toLowerCase() === vcardContact.pplai_event.toLowerCase()
                );
                if (matchingEvent) {
                    const eventSelect = document.getElementById('contactEvent');
                    if (eventSelect) {
                        eventSelect.value = matchingEvent.id;
                    }
                }
            } catch (error) {
                console.warn('Could not load events for matching:', error);
            }
        }
        
        // Add tags if provided
        if (vcardContact.pplai_tags) {
            const tags = vcardContact.pplai_tags.split(',').map(t => t.trim()).filter(t => t);
            // Tags will be added when the form is saved
            // Store them temporarily
            window.tempVCardTags = tags;
            
            // Also try to add them to the UI immediately
            setTimeout(() => {
                const tagsContainer = document.getElementById('contactTags');
                if (tagsContainer) {
                    tags.forEach(tagName => {
                        // Check if tag already exists
                        const existingTags = Array.from(tagsContainer.querySelectorAll('.tag')).map(t => t.textContent.replace('×', '').trim());
                        if (!existingTags.includes(tagName)) {
                            // Create tag element
                            const tagEl = document.createElement('span');
                            tagEl.className = 'tag';
                            tagEl.textContent = tagName;
                            tagEl.style.cursor = 'pointer';
                            tagEl.onclick = () => tagEl.remove();
                            tagsContainer.appendChild(tagEl);
                        }
                    });
                }
            }, 100);
        }
        
        // Set meeting date if provided
        if (vcardContact.pplai_date_connected) {
            // Store for use when saving
            window.tempVCardDate = vcardContact.pplai_date_connected;
        }
        
        // Store pplai.app profile URL for use when saving
        if (vcardContact.pplai_profile_url) {
            window.tempVCardProfileUrl = vcardContact.pplai_profile_url;
        }
        
        // Show success message
        setTimeout(() => {
            alert('Contact information loaded from QR code!\n\nPlease review and save the contact.');
        }, 300);
        
    } catch (error) {
        console.error('Error creating contact from vCard:', error);
        alert('Error creating contact: ' + error.message);
    }
}

function openBusinessCardScanner() {
    // Create file input for business card photo
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment'; // Use back camera on mobile
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Show loading modal
        const loadingModal = document.createElement('div');
        loadingModal.className = 'modal';
        loadingModal.innerHTML = `
            <div class="modal-content" style="max-width: 300px;">
                <div class="modal-body" style="text-align: center; padding: 40px 20px;">
                    <div class="loading-spinner" style="margin: 0 auto 20px;"></div>
                    <p>Scanning business card...</p>
                    <p style="font-size: 12px; color: #666; margin-top: 10px;">This may take a few seconds</p>
                </div>
            </div>
        `;
        document.body.appendChild(loadingModal);
        
        try {
            // Use Tesseract.js for OCR
            const { data: { text } } = await Tesseract.recognize(file, 'eng', {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        const progress = Math.round(m.progress * 100);
                        loadingModal.querySelector('p').textContent = `Scanning... ${progress}%`;
                    }
                }
            });
            
            // Parse extracted text
            const contactInfo = parseBusinessCardText(text);
            
            // Remove loading modal
            document.body.removeChild(loadingModal);
            
            // Open contact modal with pre-filled data
            openContactModal();
            
            // Pre-fill form with extracted data
            if (contactInfo.name) {
                const nameEl = document.getElementById('contactName');
                if (nameEl) nameEl.value = contactInfo.name;
            }
            if (contactInfo.email) {
                const emailEl = document.getElementById('contactEmail');
                if (emailEl) emailEl.value = contactInfo.email;
            }
            if (contactInfo.phone) {
                const mobileEl = document.getElementById('contactMobile');
                if (mobileEl) mobileEl.value = contactInfo.phone;
            }
            if (contactInfo.company) {
                const roleEl = document.getElementById('contactRole');
                if (roleEl) roleEl.value = contactInfo.company;
            }
            if (contactInfo.linkedin) {
                const linkedinEl = document.getElementById('contactLinkedIn');
                if (linkedinEl) linkedinEl.value = contactInfo.linkedin;
            }
            
            // Set the uploaded image as contact photo
            const photoInput = document.getElementById('contactPhotoInput');
            if (photoInput) {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                photoInput.files = dataTransfer.files;
                
                // Trigger preview
                const preview = document.getElementById('contactPhotoPreview');
                if (preview) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        preview.src = e.target.result;
                        preview.classList.remove('hidden');
                        document.querySelector('#contactPhotoUpload .photo-placeholder')?.classList.add('hidden');
                    };
                    reader.readAsDataURL(file);
                }
            }
            
            // Show success message
            setTimeout(() => {
                alert('Business card scanned! Please review and complete the contact information.');
            }, 300);
            
        } catch (error) {
            console.error('OCR Error:', error);
            document.body.removeChild(loadingModal);
            alert('Failed to scan business card. Please try again or enter manually.');
        }
    };
    
    input.click();
}

function openEventPassScanner() {
    // Create file input for event pass/ID card photo
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment'; // Use back camera on mobile
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Show loading modal
        const loadingModal = document.createElement('div');
        loadingModal.className = 'modal';
        loadingModal.innerHTML = `
            <div class="modal-content" style="max-width: 300px;">
                <div class="modal-body" style="text-align: center; padding: 40px 20px;">
                    <div class="loading-spinner" style="margin: 0 auto 20px;"></div>
                    <p>Scanning event pass/ID card...</p>
                    <p style="font-size: 12px; color: #666; margin-top: 10px;">This may take a few seconds</p>
                </div>
            </div>
        `;
        document.body.appendChild(loadingModal);
        
        try {
            // Use Tesseract.js for OCR
            const { data: { text } } = await Tesseract.recognize(file, 'eng', {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        const progress = Math.round(m.progress * 100);
                        loadingModal.querySelector('p').textContent = `Scanning... ${progress}%`;
                    }
                }
            });
            
            // Parse extracted text
            const contactInfo = parseEventPassText(text);
            
            // Remove loading modal
            document.body.removeChild(loadingModal);
            
            // Open contact modal with pre-filled data
            openContactModal();
            
            // Pre-fill form with extracted data
            if (contactInfo.name) {
                const nameEl = document.getElementById('contactName');
                if (nameEl) nameEl.value = contactInfo.name;
            }
            if (contactInfo.email) {
                const emailEl = document.getElementById('contactEmail');
                if (emailEl) emailEl.value = contactInfo.email;
            }
            if (contactInfo.phone) {
                const mobileEl = document.getElementById('contactMobile');
                if (mobileEl) mobileEl.value = contactInfo.phone;
            }
            if (contactInfo.company) {
                const roleEl = document.getElementById('contactRole');
                if (roleEl) roleEl.value = contactInfo.company;
            }
            if (contactInfo.linkedin) {
                const linkedinEl = document.getElementById('contactLinkedIn');
                if (linkedinEl) linkedinEl.value = contactInfo.linkedin;
            }
            if (contactInfo.eventName) {
                // Add event name to meeting context
                const context = document.getElementById('contactContext');
                if (context) {
                    context.value = `Met at: ${contactInfo.eventName}`;
                }
            }
            
            // Set the uploaded image as contact photo
            const photoInput = document.getElementById('contactPhotoInput');
            if (photoInput) {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                photoInput.files = dataTransfer.files;
                
                // Trigger preview
                const preview = document.getElementById('contactPhotoPreview');
                if (preview) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        preview.src = e.target.result;
                        preview.classList.remove('hidden');
                        document.querySelector('#contactPhotoUpload .photo-placeholder')?.classList.add('hidden');
                    };
                    reader.readAsDataURL(file);
                }
            }
            
            // Show success message
            setTimeout(() => {
                alert('Event pass/ID card scanned! Please review and complete the contact information.');
            }, 300);
            
        } catch (error) {
            console.error('OCR Error:', error);
            document.body.removeChild(loadingModal);
            alert('Failed to scan event pass/ID card. Please try again or enter manually.');
        }
    };
    
    input.click();
}

// Parse event pass/ID card text to extract contact information
function parseEventPassText(text) {
    const info = {
        name: '',
        email: '',
        phone: '',
        company: '',
        linkedin: '',
        eventName: '',
        role: ''
    };
    
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Email pattern
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = text.match(emailRegex);
    if (emails && emails.length > 0) {
        info.email = emails[0];
    }
    
    // Phone patterns (various formats)
    const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\d{10,}/g;
    const phones = text.match(phoneRegex);
    if (phones && phones.length > 0) {
        // Clean up phone number
        info.phone = phones[0].replace(/[-.\s()]/g, '');
        if (info.phone.length > 10) {
            info.phone = '+' + info.phone;
        }
    }
    
    // LinkedIn URL
    const linkedinRegex = /(?:linkedin\.com\/in\/|linkedin\.com\/pub\/)[\w-]+/gi;
    const linkedinMatch = text.match(linkedinRegex);
    if (linkedinMatch && linkedinMatch.length > 0) {
        info.linkedin = 'https://' + linkedinMatch[0];
    }
    
    // Event name patterns (common keywords)
    const eventKeywords = ['conference', 'summit', 'expo', 'exhibition', 'forum', 'meetup', 'event', 'gitex', 'tech', 'trade show', 'symposium'];
    const eventRegex = new RegExp(eventKeywords.join('|'), 'i');
    
    // Name - usually first line or first two words of first substantial line
    for (let i = 0; i < Math.min(5, lines.length); i++) {
        const line = lines[i];
        const lowerLine = line.toLowerCase();
        
        // Skip if it looks like email, phone, or URL
        if (emailRegex.test(line) || phoneRegex.test(line) || line.includes('http') || line.includes('www.')) {
            continue;
        }
        
        // Extract name (usually first or second line, 2-50 chars, not all caps unless short)
        if (!info.name && i < 3 && line.length >= 2 && line.length <= 50) {
            const words = line.split(/\s+/);
            if (words.length <= 4 && !line.match(/^\d+$/)) {
                info.name = line;
            }
        }
        
        // Extract company (look for company indicators or after name)
        if (!info.company && (i > 0 && i < 5)) {
            if (lowerLine.includes('inc') || lowerLine.includes('ltd') || lowerLine.includes('corp') || 
                lowerLine.includes('company') || lowerLine.includes('llc') || lowerLine.includes('gmbh')) {
                info.company = line;
            } else if (i === 1 || i === 2) {
                // Second or third line might be company
                const potentialCompany = line;
                if (potentialCompany.length > 2 && potentialCompany.length < 100 && !emailRegex.test(potentialCompany)) {
                    info.company = potentialCompany;
                }
            }
        }
        
        // Extract event name
        if (!info.eventName && eventRegex.test(lowerLine)) {
            info.eventName = line;
        }
    }
    
    return info;
}

// Parse business card text to extract contact information
function parseBusinessCardText(text) {
    const info = {
        name: '',
        email: '',
        phone: '',
        company: '',
        linkedin: '',
        website: ''
    };
    
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Email pattern
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = text.match(emailRegex);
    if (emails && emails.length > 0) {
        info.email = emails[0];
    }
    
    // Phone patterns (various formats)
    const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\d{10,}/g;
    const phones = text.match(phoneRegex);
    if (phones && phones.length > 0) {
        // Clean up phone number
        info.phone = phones[0].replace(/[-.\s()]/g, '');
        if (info.phone.length > 10) {
            info.phone = '+' + info.phone;
        }
    }
    
    // LinkedIn URL
    const linkedinRegex = /(?:linkedin\.com\/in\/|linkedin\.com\/pub\/)[\w-]+/gi;
    const linkedinMatch = text.match(linkedinRegex);
    if (linkedinMatch && linkedinMatch.length > 0) {
        info.linkedin = 'https://' + linkedinMatch[0];
    }
    
    // Website URL
    const websiteRegex = /(?:www\.)?[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}/g;
    const websites = text.match(websiteRegex);
    if (websites && websites.length > 0 && !websites[0].includes('linkedin')) {
        info.website = websites[0].startsWith('www.') ? 'https://' + websites[0] : websites[0];
    }
    
    // Name - usually first line or first two words of first substantial line
    for (let i = 0; i < Math.min(3, lines.length); i++) {
        const line = lines[i];
        // Skip if it looks like email, phone, or URL
        if (!emailRegex.test(line) && !phoneRegex.test(line) && !websiteRegex.test(line)) {
            // Check if it looks like a name (2-4 words, capitalized)
            const words = line.split(/\s+/);
            if (words.length >= 2 && words.length <= 4) {
                const isNameLike = words.every(word => 
                    word.length > 0 && 
                    (word[0] === word[0].toUpperCase() || /^[A-Z]/.test(word))
                );
                if (isNameLike && !info.name) {
                    info.name = line;
                    break;
                }
            }
        }
    }
    
    // Company - look for common company indicators or capitalized multi-word phrases
    for (const line of lines) {
        if (line.toLowerCase().includes('inc') || 
            line.toLowerCase().includes('llc') || 
            line.toLowerCase().includes('ltd') ||
            line.toLowerCase().includes('corp') ||
            line.toLowerCase().includes('company')) {
            info.company = line;
            break;
        } else if (!info.company && line.length > 3 && line.length < 50) {
            const words = line.split(/\s+/);
            if (words.length >= 2 && words.length <= 5) {
                const isCompanyLike = words.every(word => 
                    word.length > 0 && 
                    (word[0] === word[0].toUpperCase() || /^[A-Z]/.test(word))
                );
                if (isCompanyLike && line !== info.name) {
                    info.company = line;
                }
            }
        }
    }
    
    return info;
}

// Tag management functions (addTag and handleTagInput) are defined below

function handleTagInput(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const tag = e.target.value.trim();
        if (tag) {
            addTag(tag);
            e.target.value = '';
        }
    }
}

function addTag(tagName) {
    const container = document.getElementById('contactTags');
    if (!container) return;

    // Check if tag already exists
    const existing = Array.from(container.querySelectorAll('.tag')).some(t => {
        const tagText = t.textContent.replace('×', '').trim();
        return tagText === tagName;
    });
    if (existing) return;

    const tagEl = document.createElement('span');
    tagEl.className = 'tag';
    const color = getTagColor(tagName);
    tagEl.style.backgroundColor = color.bg;
    tagEl.style.color = color.text;
    tagEl.style.borderColor = color.border;
    tagEl.innerHTML = `${tagName} <span class="tag-remove">&times;</span>`;
    tagEl.querySelector('.tag-remove').addEventListener('click', () => tagEl.remove());
    container.appendChild(tagEl);
    
    // If it's a new custom tag, add to custom tags list
    const isSystemTag = systemTags.some(t => t.name === tagName);
    if (!isSystemTag && !customTags.some(t => t.name === tagName)) {
        customTags.push({ name: tagName, is_system_tag: false });
        updateSuggestedTags();
    }
}

// Tag Management
async function createNewTag() {
    const nameInput = document.getElementById('newTagName');
    if (!nameInput) return;
    
    const tagName = nameInput.value.trim();
    if (!tagName) {
        alert('Please enter a tag name');
        return;
    }
    
    // Disable button and show loading
    const createBtn = document.getElementById('createTagBtn');
    const originalText = createBtn?.textContent;
    if (createBtn) {
        createBtn.disabled = true;
        createBtn.textContent = 'Creating...';
    }
    
    try {
        const newTag = await api.createTag(tagName);
        
        // Clear input
        nameInput.value = '';
        
        // Reload tags list
        await loadTagsForManagement();
        
        // Show success message
        if (createBtn) {
            createBtn.textContent = '✓ Created!';
            setTimeout(() => {
                createBtn.textContent = originalText;
                createBtn.disabled = false;
            }, 2000);
        }
    } catch (error) {
        console.error('Error creating tag:', error);
        alert('Failed to create tag: ' + (error.message || 'Unknown error'));
        if (createBtn) {
            createBtn.textContent = originalText;
            createBtn.disabled = false;
        }
    }
}

async function loadTagsForManagement() {
    try {
        const tags = await api.getTagsForManagement();
        displayTagsForManagement(tags);
    } catch (error) {
        console.error('Error loading tags for management:', error);
        // Show empty state with helpful message
        const container = document.getElementById('tagsList');
        if (container) {
            if (error.message && error.message.includes('Network error')) {
                container.innerHTML = `
                    <div class="empty-state" style="text-align: center; padding: 40px 20px;">
                        <p style="margin-bottom: 12px; color: var(--text-secondary);">
                            Unable to connect to backend server.
                        </p>
                        <p style="font-size: 14px; color: var(--text-secondary);">
                            Please ensure the backend server is running on port 8000.
                        </p>
                    </div>
                `;
            } else {
                container.innerHTML = `
                    <div class="empty-state" style="text-align: center; padding: 40px 20px;">
                        <p style="margin-bottom: 12px; color: var(--text-secondary);">
                            Failed to load tags.
                        </p>
                        <p style="font-size: 14px; color: var(--text-secondary);">
                            ${error.message || 'Unknown error'}
                        </p>
                    </div>
                `;
            }
        }
    }
}

function displayTagsForManagement(tags) {
    const container = document.getElementById('tagsList');
    if (!container) return;
    
    if (tags.length === 0) {
        container.innerHTML = '<p class="empty-state">No tags yet. Create tags when adding contacts!</p>';
        return;
    }
    
    // Separate system and custom tags
    const systemTagsList = tags.filter(t => t.is_system_tag);
    const customTagsList = tags.filter(t => !t.is_system_tag);
    
    let html = '';
    
    // System Tags Section
    if (systemTagsList.length > 0) {
        html += '<div class="tag-section" style="margin-bottom: 24px;">';
        html += '<h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px; color: var(--text-primary);">System Tags</h3>';
        html += '<div class="tags-grid">';
        systemTagsList.forEach(tag => {
            html += createTagManagementItem(tag, true);
        });
        html += '</div></div>';
    }
    
    // Custom Tags Section
    if (customTagsList.length > 0) {
        html += '<div class="tag-section">';
        html += '<h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px; color: var(--text-primary);">Your Custom Tags</h3>';
        html += '<div class="tags-grid">';
        customTagsList.forEach(tag => {
            html += createTagManagementItem(tag, false);
        });
        html += '</div></div>';
    }
    
    container.innerHTML = html;
    
    // Add event listeners
    container.querySelectorAll('.tag-view-contacts-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tagId = e.target.closest('.tag-view-contacts-btn').dataset.tagId;
            const tagName = e.target.closest('.tag-view-contacts-btn').dataset.tagName;
            viewContactsWithTag(tagId, tagName);
        });
    });
    
    container.querySelectorAll('.tag-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tagId = e.target.dataset.tagId;
            const tagName = e.target.dataset.tagName;
            editTag(tagId, tagName);
        });
    });
    
    container.querySelectorAll('.tag-hide-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const tagId = e.target.dataset.tagId;
            const tagName = e.target.dataset.tagName;
            const isHidden = e.target.dataset.isHidden === 'true';
            const action = isHidden ? 'show' : 'hide';
            
            if (confirm(`Are you sure you want to ${action} the tag "${tagName}"?`)) {
                await toggleTagVisibility(tagId, !isHidden);
            }
        });
    });
    
    container.querySelectorAll('.tag-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const tagId = e.target.dataset.tagId;
            const tagName = e.target.dataset.tagName;
            
            if (confirm(`⚠️ WARNING: Are you sure you want to delete the tag "${tagName}"?\n\nThis action cannot be undone. If this tag is used by contacts, you'll need to hide it instead of deleting.`)) {
                await deleteTag(tagId);
            }
        });
    });
}

function createTagManagementItem(tag, isSystem) {
    const hiddenClass = tag.is_hidden ? 'tag-hidden' : '';
    const color = getTagColor(tag.name);
    return `
        <div class="tag-item ${hiddenClass}" data-tag-id="${tag.id}" data-tag-name="${tag.name}" data-is-hidden="${tag.is_hidden}">
            <div class="tag-item-content">
                <span class="tag-name" id="tag-name-${tag.id}" style="background-color: ${color.bg}; color: ${color.text}; border: 1px solid ${color.border}; padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 500; display: inline-block; max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${tag.name}</span>
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    ${tag.is_hidden ? '<span class="tag-badge tag-badge-hidden">Hidden</span>' : ''}
                    ${isSystem ? '<span class="tag-badge tag-badge-system">System</span>' : ''}
                </div>
            </div>
            <div class="tag-item-actions">
                <button class="btn-small btn-primary tag-view-contacts-btn" data-tag-id="${tag.id}" data-tag-name="${tag.name}" title="View contacts with this tag">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle; margin-right: 4px;">
                        <path d="M5 12h14M12 5l7 7-7 7"></path>
                    </svg>
                    View
                </button>
                ${!isSystem ? `
                    <button class="btn-small btn-secondary tag-edit-btn" data-tag-id="${tag.id}" data-tag-name="${tag.name}" title="Edit">✏️</button>
                    <button class="btn-small btn-secondary tag-hide-btn" data-tag-id="${tag.id}" data-tag-name="${tag.name}" data-is-hidden="${tag.is_hidden}" title="${tag.is_hidden ? 'Show' : 'Hide'}">
                        ${tag.is_hidden ? '👁️' : '🙈'}
                    </button>
                    <button class="btn-small btn-danger tag-delete-btn" data-tag-id="${tag.id}" data-tag-name="${tag.name}" title="Delete">🗑️</button>
                ` : '<span class="tag-badge" style="opacity: 0.5; font-size: 10px;">Read-only</span>'}
            </div>
        </div>
    `;
}

function viewContactsWithTag(tagId, tagName) {
    // Switch to contacts view
    switchView('contacts');
    
    // Wait for view to load, then set the tag filter
    setTimeout(() => {
        const tagFilter = document.getElementById('tagFilter');
        if (tagFilter) {
            // Load tags into filter if not already loaded
            loadTagFilter().then(() => {
                // Set the selected tag
                tagFilter.value = tagId;
                
                // Show filters if hidden
                const filtersContainer = document.getElementById('contactsFilters');
                const filterBtn = document.getElementById('filterContactsBtn');
                if (filtersContainer && filterBtn) {
                    if (filtersContainer.classList.contains('hidden')) {
                        filtersContainer.classList.remove('hidden');
                        filterBtn.classList.add('active');
                    }
                }
                
                // Filter contacts
                filterContacts();
            });
        } else {
            // If tagFilter doesn't exist yet, try again after a short delay
            setTimeout(() => {
                const tagFilter = document.getElementById('tagFilter');
                if (tagFilter) {
                    loadTagsForFilter().then(() => {
                        tagFilter.value = tagId;
                        filterContacts();
                    });
                }
            }, 500);
        }
    }, 100);
}

function editTag(tagId, currentName) {
    const newName = prompt(`Edit tag name:`, currentName);
    if (newName === null) return; // User cancelled
    if (newName.trim() === '') {
        alert('Tag name cannot be empty');
        return;
    }
    if (newName.trim() === currentName) return; // No change
    
    updateTagName(tagId, newName.trim());
}

async function updateTagName(tagId, newName) {
    try {
        if (!navigator.onLine) {
            offlineQueue.addTag({ name: newName }, 'update', tagId);
            await loadTagsForManagement(); // Reload from cache
            alert('Tag update saved offline. It will sync when you\'re back online.');
            return;
        }
        
        await api.updateTag(tagId, newName, null);
        await loadTagsForManagement();
        // Reload tags in contact form if modal is open
        const contactModal = document.getElementById('contactModal');
        if (contactModal && !contactModal.classList.contains('hidden')) {
            await loadAvailableTags();
        }
    } catch (error) {
        if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
            offlineQueue.addTag({ name: newName }, 'update', tagId);
            await loadTagsForManagement(); // Reload from cache
            alert('Tag update saved offline. It will sync when you\'re back online.');
        } else {
            alert('Failed to update tag: ' + error.message);
        }
    }
}

async function toggleTagVisibility(tagId, isHidden) {
    try {
        if (!navigator.onLine) {
            offlineQueue.addTag({ is_hidden: isHidden }, 'hide', tagId);
            await loadTagsForManagement(); // Reload from cache
            alert('Tag visibility change saved offline. It will sync when you\'re back online.');
            return;
        }
        
        await api.updateTag(tagId, null, isHidden);
        await loadTagsForManagement();
        // Reload tags in contact form if modal is open
        const contactModal = document.getElementById('contactModal');
        if (contactModal && !contactModal.classList.contains('hidden')) {
            await loadAvailableTags();
        }
    } catch (error) {
        if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
            offlineQueue.addTag({ is_hidden: isHidden }, 'hide', tagId);
            await loadTagsForManagement(); // Reload from cache
            alert('Tag visibility change saved offline. It will sync when you\'re back online.');
        } else {
            alert('Failed to update tag: ' + error.message);
        }
    }
}

async function deleteTag(tagId) {
    try {
        if (!navigator.onLine) {
            offlineQueue.addTag({}, 'delete', tagId);
            await loadTagsForManagement(); // Reload from cache
            alert('Tag deletion saved offline. It will sync when you\'re back online.');
            return;
        }
        
        await api.deleteTag(tagId);
        await loadTagsForManagement();
        // Reload tags in contact form if modal is open
        const contactModal = document.getElementById('contactModal');
        if (contactModal && !contactModal.classList.contains('hidden')) {
            await loadAvailableTags();
        }
    } catch (error) {
        if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
            offlineQueue.addTag({}, 'delete', tagId);
            await loadTagsForManagement(); // Reload from cache
            alert('Tag deletion saved offline. It will sync when you\'re back online.');
        } else {
            alert('Failed to delete tag: ' + error.message);
        }
    }
}

// Media handling
async function handleMediaUpload(e) {
    const files = Array.from(e.target.files);
    const preview = document.getElementById('mediaPreview');
    if (!preview) return;

    // Compress images before displaying
    let processedFiles = files;
    try {
        processedFiles = await compressImages(files);
    } catch (error) {
        console.warn('Failed to compress some media files:', error);
        // Continue with original files
    }

    processedFiles.forEach(file => {
        const div = document.createElement('div');
        div.className = 'media-item';
        if (file.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            div.appendChild(img);
        } else if (file.type.startsWith('audio/')) {
            div.innerHTML = `🎵 ${file.name}`;
        }
        preview.appendChild(div);
    });
    
    // Store compressed files for later use in saveContact
    // We'll need to update the file input with compressed files
    // This is a bit tricky, so we'll store them in a data attribute or global variable
    window.compressedMediaFiles = processedFiles;
}

// Photo upload setup
function setupPhotoUpload(containerId, inputId, previewId) {
    const container = document.getElementById(containerId);
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);

    if (!container || !input || !preview) return;

    container.addEventListener('click', () => input.click());
    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            // Compress image before preview
            let displayFile = file;
            if (file.type.startsWith('image/')) {
                try {
                    displayFile = await compressImage(file);
                    // Update the input with compressed file
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(displayFile);
                    input.files = dataTransfer.files;
                } catch (error) {
                    console.warn('Failed to compress image for preview:', error);
                    // Continue with original file
                }
            }
            
            const reader = new FileReader();
            reader.onload = (event) => {
                preview.src = event.target.result;
                preview.classList.remove('hidden');
                container.querySelector('.photo-placeholder')?.classList.add('hidden');
            };
            reader.readAsDataURL(displayFile);
        }
    });
}

// Image compression utility
async function compressImage(file, maxWidth = 1920, maxHeight = 1920, quality = 0.8) {
    // Only compress image files
    if (!file.type.startsWith('image/')) {
        return file;
    }
    
    // Skip compression for very small files (< 100KB) to avoid unnecessary processing
    if (file.size < 100 * 1024) {
        return file;
    }
    
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Calculate new dimensions
                let width = img.width;
                let height = img.height;
                
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = width * ratio;
                    height = height * ratio;
                }
                
                // Create canvas and compress
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Convert to blob
                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(new Error('Compression failed'));
                            return;
                        }
                        
                        // Create a new File object with the same name and type
                        const compressedFile = new File([blob], file.name, {
                            type: file.type,
                            lastModified: Date.now()
                        });
                        
                        console.log(`Image compressed: ${(file.size / 1024).toFixed(2)}KB → ${(compressedFile.size / 1024).toFixed(2)}KB (${((1 - compressedFile.size / file.size) * 100).toFixed(1)}% reduction)`);
                        resolve(compressedFile);
                    },
                    file.type,
                    quality
                );
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

// Compress multiple images
async function compressImages(files) {
    const compressedFiles = [];
    for (const file of files) {
        if (file.type.startsWith('image/')) {
            try {
                const compressed = await compressImage(file);
                compressedFiles.push(compressed);
            } catch (error) {
                console.warn('Failed to compress image, using original:', error);
                compressedFiles.push(file); // Fallback to original
            }
        } else {
            compressedFiles.push(file); // Non-image files pass through
        }
    }
    return compressedFiles;
}

// Utility functions
function closeModal() {
    document.querySelectorAll('.modal').forEach(modal => modal.classList.add('hidden'));
}

function updateCharCount() {
    const textarea = document.getElementById('contactContext');
    const counter = document.getElementById('contextCharCount');
    if (textarea && counter) {
        counter.textContent = textarea.value.length;
    }
}

function formatDateRange(start, end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('Link copied to clipboard!');
    }).catch(() => {
        alert('Failed to copy link');
    });
}

// Location autocomplete
let locationSearchTimeout = null;
let selectedLocationIndex = -1;

function setupLocationAutocomplete() {
    const input = document.getElementById('eventLocation');
    const suggestions = document.getElementById('locationSuggestions');
    
    if (!input || !suggestions) return;
    
    // Clear any existing listeners by cloning and replacing
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    const newSuggestions = suggestions.cloneNode(false);
    suggestions.parentNode.replaceChild(newSuggestions, suggestions);
    
    // Re-get references after cloning
    const locationInput = document.getElementById('eventLocation');
    const locationSuggestions = document.getElementById('locationSuggestions');
    
    locationInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        
        // Clear previous timeout
        if (locationSearchTimeout) {
            clearTimeout(locationSearchTimeout);
        }
        
        // Hide suggestions if input is empty
        if (query.length < 2) {
            locationSuggestions.classList.add('hidden');
            locationSuggestions.innerHTML = '';
            selectedLocationIndex = -1;
            return;
        }
        
        // Debounce search
        locationSearchTimeout = setTimeout(async () => {
            await searchLocations(query, locationInput, locationSuggestions);
        }, 300);
    });
    
    locationInput.addEventListener('keydown', (e) => {
        const items = locationSuggestions.querySelectorAll('.location-suggestion');
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedLocationIndex = Math.min(selectedLocationIndex + 1, items.length - 1);
            updateSelectedLocation(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedLocationIndex = Math.max(selectedLocationIndex - 1, -1);
            updateSelectedLocation(items);
        } else if (e.key === 'Enter' && selectedLocationIndex >= 0) {
            e.preventDefault();
            items[selectedLocationIndex]?.click();
        } else if (e.key === 'Escape') {
            locationSuggestions.classList.add('hidden');
            selectedLocationIndex = -1;
        }
    });
    
    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!locationInput.contains(e.target) && !locationSuggestions.contains(e.target)) {
            locationSuggestions.classList.add('hidden');
            selectedLocationIndex = -1;
        }
    });
}

async function searchLocations(query, input, suggestionsContainer) {
    if (!query || query.trim().length < 2) {
        suggestionsContainer.classList.add('hidden');
        return;
    }
    
    try {
        suggestionsContainer.innerHTML = '<div class="location-suggestion loading">Searching...</div>';
        suggestionsContainer.classList.remove('hidden');
        
        // Use backend proxy to avoid CORS issues
        const data = await apiRequest(
            `/events/search/locations?q=${encodeURIComponent(query)}&limit=8`
        );
        
        if (!Array.isArray(data)) {
            throw new Error('Invalid response format');
        }
        
        if (data.length === 0) {
            suggestionsContainer.innerHTML = '<div class="location-suggestion">No locations found</div>';
            return;
        }
        
        suggestionsContainer.innerHTML = data.map((item, index) => {
            const displayName = item.display_name || item.name || 'Unknown location';
            return `
                <div class="location-suggestion" data-index="${index}" data-name="${displayName}">
                    <span class="location-icon">📍</span>
                    <span class="location-text">${displayName}</span>
                </div>
            `;
        }).join('');
        
        // Add click listeners
        suggestionsContainer.querySelectorAll('.location-suggestion').forEach(item => {
            item.addEventListener('click', () => {
                const locationName = item.dataset.name;
                input.value = locationName;
                suggestionsContainer.classList.add('hidden');
                suggestionsContainer.innerHTML = '';
                selectedLocationIndex = -1;
            });
        });
        
    } catch (error) {
        // Only log if it's not an abort (timeout) or network error
        if (error.name !== 'AbortError' && error.name !== 'TypeError') {
            console.warn('Location search error:', error.message);
        }
        
        // Show user-friendly message
        if (error.name === 'AbortError') {
            suggestionsContainer.innerHTML = '<div class="location-suggestion">Search timed out. Please try again.</div>';
        } else if (!navigator.onLine) {
            suggestionsContainer.innerHTML = '<div class="location-suggestion">No internet connection</div>';
        } else if (error.message && error.message.includes('403')) {
            // 403 Forbidden - API rate limit or User-Agent issue
            suggestionsContainer.innerHTML = '<div class="location-suggestion">Location service temporarily unavailable. Please type location manually.</div>';
        } else {
            suggestionsContainer.innerHTML = '<div class="location-suggestion">Unable to search locations. Please type location manually.</div>';
        }
        
        // Hide suggestions after a delay
        setTimeout(() => {
            if (suggestionsContainer.innerHTML.includes('Unable to search') || 
                suggestionsContainer.innerHTML.includes('timed out') ||
                suggestionsContainer.innerHTML.includes('No internet') ||
                suggestionsContainer.innerHTML.includes('temporarily unavailable')) {
                suggestionsContainer.classList.add('hidden');
            }
        }, 3000);
    }
}

function updateSelectedLocation(items) {
    items.forEach((item, index) => {
        if (index === selectedLocationIndex) {
            item.classList.add('active');
            item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
            item.classList.remove('active');
        }
    });
}

// Admin functions
let allUsers = [];
let editingUserId = null;

async function loadAllUsers() {
    const usersList = document.getElementById('usersList');
    if (!usersList) return;

    try {
        usersList.innerHTML = '<div class="empty-state"><p>Loading users...</p></div>';
        const users = await api.listAllUsers(0, 1000); // Get all users
        allUsers = users;
        displayUsers(users);
    } catch (error) {
        console.error('Error loading users:', error);
        usersList.innerHTML = `
            <div class="empty-state">
                <p>Error loading users: ${error.message}</p>
                <button class="btn btn-primary" onclick="loadAllUsers()">Retry</button>
            </div>
        `;
    }
}

function displayUsers(users) {
    const usersList = document.getElementById('usersList');
    if (!usersList) return;

    if (users.length === 0) {
        usersList.innerHTML = '<div class="empty-state"><p>No users found</p></div>';
        return;
    }

    usersList.innerHTML = users.map(user => {
        const createdDate = new Date(user.created_at).toLocaleDateString();
        const adminBadge = user.is_admin ? '<span class="admin-badge" style="background: #ef4444; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; margin-left: 8px;">ADMIN</span>' : '';
        
        return `
            <div class="user-card" style="background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="display: flex; justify-content: space-between; align-items: start; gap: 16px;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; margin-bottom: 8px;">
                            <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-primary);">${escapeHtml(user.name)}</h3>
                            ${adminBadge}
                        </div>
                        <p style="margin: 4px 0; color: var(--text-secondary); font-size: 14px;">📧 ${escapeHtml(user.email || 'No email')}</p>
                        ${user.role_company ? `<p style="margin: 4px 0; color: var(--text-secondary); font-size: 14px;">💼 ${escapeHtml(user.role_company)}</p>` : ''}
                        ${user.mobile ? `<p style="margin: 4px 0; color: var(--text-secondary); font-size: 14px;">📱 ${escapeHtml(user.mobile)}</p>` : ''}
                        <p style="margin: 8px 0 0 0; color: var(--text-secondary); font-size: 12px;">Joined: ${createdDate}</p>
                    </div>
                    <div style="display: flex; gap: 8px; flex-direction: column; flex-shrink: 0;">
                        <button class="btn-small btn-primary login-as-user-btn" data-user-id="${user.id}" data-user-name="${user.name}" title="Login as this user">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                                <polyline points="10 17 15 12 10 7"></polyline>
                                <line x1="15" y1="12" x2="3" y2="12"></line>
                            </svg>
                            Login As
                        </button>
                        <button class="btn-small btn-secondary edit-user-btn" data-user-id="${user.id}" title="Edit user">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                            Edit
                        </button>
                        <button class="btn-small btn-danger delete-user-btn" data-user-id="${user.id}" data-user-name="${user.name}" title="Delete user">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Add event listeners
    usersList.querySelectorAll('.login-as-user-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const userId = e.target.closest('.login-as-user-btn').dataset.userId;
            const userName = e.target.closest('.login-as-user-btn').dataset.userName;
            await loginAsUser(userId, userName);
        });
    });

    usersList.querySelectorAll('.edit-user-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const userId = e.target.closest('.edit-user-btn').dataset.userId;
            openEditUserModal(userId);
        });
    });

    usersList.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const userId = e.target.closest('.delete-user-btn').dataset.userId;
            const userName = e.target.closest('.delete-user-btn').dataset.userName;
            deleteUser(userId, userName);
        });
    });
}

function filterAdminUsers() {
    const searchInput = document.getElementById('adminSearchInput');
    const clearBtn = document.getElementById('clearAdminSearch');
    if (!searchInput) return;

    const query = searchInput.value.toLowerCase().trim();
    
    if (query) {
        clearBtn?.classList.remove('hidden');
        const filtered = allUsers.filter(user => 
            user.name.toLowerCase().includes(query) ||
            (user.email && user.email.toLowerCase().includes(query)) ||
            (user.role_company && user.role_company.toLowerCase().includes(query))
        );
        displayUsers(filtered);
    } else {
        clearBtn?.classList.add('hidden');
        displayUsers(allUsers);
    }
}

function clearAdminSearch() {
    const searchInput = document.getElementById('adminSearchInput');
    const clearBtn = document.getElementById('clearAdminSearch');
    if (searchInput) searchInput.value = '';
    if (clearBtn) clearBtn.classList.add('hidden');
    displayUsers(allUsers);
}

function openCreateUserModal() {
    editingUserId = null;
    document.getElementById('adminUserModalTitle').textContent = 'Create User';
    document.getElementById('adminUserName').value = '';
    document.getElementById('adminUserEmail').value = '';
    document.getElementById('adminUserRole').value = '';
    document.getElementById('adminUserMobile').value = '';
    document.getElementById('adminUserWhatsApp').value = '';
    document.getElementById('adminUserLinkedIn').value = '';
    document.getElementById('adminUserAbout').value = '';
    document.getElementById('adminUserIsAdmin').checked = false;
    document.getElementById('adminUserModal').classList.remove('hidden');
}

async function openEditUserModal(userId) {
    try {
        const user = await api.getUser(userId);
        editingUserId = userId;
        document.getElementById('adminUserModalTitle').textContent = 'Edit User';
        document.getElementById('adminUserName').value = user.name || '';
        document.getElementById('adminUserEmail').value = user.email || '';
        document.getElementById('adminUserRole').value = user.role_company || '';
        document.getElementById('adminUserMobile').value = user.mobile || '';
        document.getElementById('adminUserWhatsApp').value = user.whatsapp || '';
        document.getElementById('adminUserLinkedIn').value = user.linkedin_url || '';
        document.getElementById('adminUserAbout').value = user.about_me || '';
        document.getElementById('adminUserIsAdmin').checked = user.is_admin || false;
        document.getElementById('adminUserModal').classList.remove('hidden');
    } catch (error) {
        alert('Failed to load user: ' + error.message);
    }
}

async function saveAdminUser() {
    const name = document.getElementById('adminUserName')?.value.trim();
    const email = document.getElementById('adminUserEmail')?.value.trim();
    const role = document.getElementById('adminUserRole')?.value.trim();
    const mobile = document.getElementById('adminUserMobile')?.value.trim();
    const whatsapp = document.getElementById('adminUserWhatsApp')?.value.trim();
    const linkedin = document.getElementById('adminUserLinkedIn')?.value.trim();
    const about = document.getElementById('adminUserAbout')?.value.trim();
    const isAdmin = document.getElementById('adminUserIsAdmin')?.checked || false;

    if (!name || !email) {
        alert('Name and email are required');
        return;
    }

    const saveBtn = document.getElementById('saveAdminUserBtn');
    const originalText = saveBtn?.textContent;
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
    }

    try {
        const userData = {
            name,
            email,
            role_company: role || null,
            mobile: mobile || null,
            whatsapp: whatsapp || null,
            linkedin_url: linkedin || null,
            about_me: about || null,
            is_admin: isAdmin
        };

        if (editingUserId) {
            await api.updateUser(editingUserId, userData);
            alert('User updated successfully');
        } else {
            // For new users, we need to provide a password
            const password = prompt('Enter password for new user (minimum 6 characters):');
            if (!password || password.length < 6) {
                alert('Password is required and must be at least 6 characters');
                return;
            }
            await api.createUser({ 
                email: email,
                name: name,
                password: password,
                role_company: role || null,
                mobile: mobile || null,
                whatsapp: whatsapp || null,
                linkedin_url: linkedin || null,
                about_me: about || null,
                is_admin: isAdmin
            });
            alert('User created successfully');
        }

        document.getElementById('adminUserModal').classList.add('hidden');
        await loadAllUsers();
    } catch (error) {
        alert('Failed to save user: ' + error.message);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
        }
    }
}

async function deleteUser(userId, userName) {
    if (!confirm(`Are you sure you want to delete user "${userName}"?\n\nThis action cannot be undone. All user data, events, contacts, and related information will be permanently deleted.`)) {
        return;
    }

    try {
        await api.deleteUser(userId);
        alert('User deleted successfully');
        await loadAllUsers();
    } catch (error) {
        alert('Failed to delete user: ' + error.message);
    }
}

async function loginAsUser(userId, userName) {
    if (!confirm(`Login as "${userName}"?\n\nYou will be logged in as this user and can access their account.`)) {
        return;
    }

    try {
        await api.loginAsUser(userId);
        alert(`Logged in as ${userName}. Redirecting...`);
        // Reload the app with the new user context
        location.reload();
    } catch (error) {
        alert('Failed to login as user: ' + error.message);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Check if user is admin and show/hide admin nav button
async function checkAdminStatus() {
    try {
        const profile = await api.getProfile();
        const adminNavBtn = document.getElementById('adminNavBtn');
        if (adminNavBtn) {
            // Only show admin button if is_admin is explicitly true (not null/undefined)
            adminNavBtn.style.display = (profile.is_admin === true) ? 'flex' : 'none';
        }
    } catch (error) {
        // User not logged in or error - hide admin button
        const adminNavBtn = document.getElementById('adminNavBtn');
        if (adminNavBtn) {
            adminNavBtn.style.display = 'none';
        }
    }
}
