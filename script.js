// Global state
let currentEvent = null;
let currentUser = null;
let currentPublicProfile = null;
let currentPublicProfileId = null;
let publicProfileListenersBound = false;

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
    
    // Initialize push notifications after user is authenticated
    // (Will be called after successful login)
    
    // Set up MutationObserver to prevent unauthorized view access
    // This helps prevent direct DOM manipulation from showing protected views
    const protectedViewIds = ['contactsView', 'eventsView', 'tagsView', 'profileView', 'adminView', 'chatView', 'homeView'];
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1 && node.classList) {
                    // Check if a protected view is being shown
                    protectedViewIds.forEach(viewId => {
                        if (node.id === viewId || node.querySelector(`#${viewId}`)) {
                            const view = document.getElementById(viewId);
                            if (view && !view.classList.contains('hidden')) {
                                const currentUser = getCurrentUser();
                                const token = getAuthToken();
                                if (!currentUser || !token) {
                                    // Hide the view and show auth screen
                                    view.classList.add('hidden');
                                    showAuthScreen();
                                }
                            }
                        }
                    });
                }
            });
            
            // Check for class changes (removing 'hidden' class)
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const target = mutation.target;
                if (protectedViewIds.includes(target.id)) {
                    if (!target.classList.contains('hidden')) {
                        const currentUser = getCurrentUser();
                        const token = getAuthToken();
                        if (!currentUser || !token) {
                            target.classList.add('hidden');
                            showAuthScreen();
                        }
                    }
                }
            }
        });
    });
    
    // Observe the app container for changes
    const appContainer = document.getElementById('appContainer');
    if (appContainer) {
        observer.observe(appContainer, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
    }
    
    // Check if URL is a shared profile link
    const urlPath = window.location.pathname;
    const profileMatch = urlPath.match(/\/profile\/([a-f0-9-]+)/i);
    const profileUserId = profileMatch ? profileMatch[1] : null;
    
    // Check if required functions exist (only for authenticated app)
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
                // Initialize push notifications
                await initializePushNotifications();
                
                // Check if there's a profile ID from URL (logged-in user viewing shared profile)
                if (profileUserId) {
                    debugLog('📋 Logged-in user viewing public profile, opening in-app modal...');
                    await loadPublicProfile(profileUserId);
                    // Clear the URL to show home path
                    window.history.replaceState({}, '', '/');
                } else {
                    // Check if there's a pending profile view from a shared link
                    const pendingProfileId = sessionStorage.getItem('pendingProfileView');
                    if (pendingProfileId) {
                        sessionStorage.removeItem('pendingProfileView');
                        await loadPublicProfile(pendingProfileId);
                    }
                
                // Check if there's a pending contact save action
                const pendingContactSave = sessionStorage.getItem('pendingContactSave');
                if (pendingContactSave) {
                    try {
                        const contactData = JSON.parse(pendingContactSave);
                        sessionStorage.removeItem('pendingContactSave');
                        // Small delay to ensure UI is ready
                        setTimeout(async () => {
                            await openContactModal(contactData);
                        }, 500);
                    } catch (error) {
                        console.error('Error parsing pending contact save:', error);
                        sessionStorage.removeItem('pendingContactSave');
                    }
                    }
                }
            } catch (error) {
                debugError('Auth error:', error);
                clearAuthToken();
                showAuthScreen();
            }
        } else {
            // User not logged in - check if this is a public profile URL
            if (profileUserId) {
                debugLog('📋 Public profile URL detected (no auth), rendering standalone view...');
                await renderStandalonePublicProfile(profileUserId);
                return;
            }
            
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
    document.getElementById('saveProfileToContactsBtn')?.addEventListener('click', saveProfileToContacts);
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
    document.getElementById('importLumaBtn')?.addEventListener('click', () => {
        document.getElementById('lumaImportModal')?.classList.remove('hidden');
    });
    document.getElementById('importLumaUrlBtn')?.addEventListener('click', importLumaEventFromUrl);
    document.getElementById('importLumaApiBtn')?.addEventListener('click', importLumaEventsFromApi);
    
    // Close Luma import modal
    document.getElementById('lumaImportModal')?.querySelector('.modal-close')?.addEventListener('click', () => {
        document.getElementById('lumaImportModal')?.classList.add('hidden');
    });
    document.getElementById('saveEventBtn')?.addEventListener('click', saveEvent);
    document.getElementById('eventsSearchInput')?.addEventListener('input', filterEvents);
    document.getElementById('clearEventsSearch')?.addEventListener('click', clearEventsSearch);
    document.getElementById('eventsDateFilter')?.addEventListener('change', () => {
        const dateFilter = document.getElementById('eventsDateFilter');
        const customRange = document.getElementById('eventsCustomDateRange');
        if (dateFilter && customRange) {
            if (dateFilter.value === 'custom') {
                customRange.classList.remove('hidden');
            } else {
                customRange.classList.add('hidden');
            }
        }
        filterEvents();
        updateEventsClearFiltersButton();
    });
    document.getElementById('eventsDateFrom')?.addEventListener('change', () => {
        filterEvents();
        updateEventsClearFiltersButton();
    });
    document.getElementById('eventsDateTo')?.addEventListener('change', () => {
        filterEvents();
        updateEventsClearFiltersButton();
    });
    document.getElementById('clearEventsFiltersBtn')?.addEventListener('click', clearEventsFilters);
    
    // Contacts search
    document.getElementById('contactsSearchInput')?.addEventListener('input', filterContactsBySearch);
    document.getElementById('clearContactsSearch')?.addEventListener('click', clearContactsSearch);
    
    // Contacts
    document.getElementById('scanQRCard')?.addEventListener('click', openQRScanner);
    document.getElementById('scanCardCard')?.addEventListener('click', openBusinessCardScanner);
    document.getElementById('scanEventPassCard')?.addEventListener('click', openEventPassScanner);
    document.getElementById('manualEntryCard')?.addEventListener('click', openContactModal);
    
    // Business Card Scanner
    document.getElementById('businessCardCaptureBtn')?.addEventListener('click', captureBusinessCard);
    document.getElementById('businessCardUploadBtn')?.addEventListener('click', () => {
        document.getElementById('businessCardFileInput')?.click();
    });
    document.getElementById('businessCardFileInput')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            closeBusinessCardScanner();
            processBusinessCardFile(file);
        }
    });
    
    // Event Pass Scanner
    document.getElementById('eventPassCaptureBtn')?.addEventListener('click', captureEventPass);
    document.getElementById('eventPassUploadBtn')?.addEventListener('click', () => {
        document.getElementById('eventPassFileInput')?.click();
    });
    document.getElementById('eventPassFileInput')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            closeEventPassScanner();
            processEventPassFile(file);
        }
    });
    
    // Close modals on close button
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) {
                if (modal.id === 'qrScannerModal') {
                    closeQRScanner();
                } else if (modal.id === 'businessCardScannerModal') {
                    closeBusinessCardScanner();
                } else if (modal.id === 'eventPassScannerModal') {
                    closeEventPassScanner();
                }
            }
        });
    });
    document.getElementById('addContactBtn')?.addEventListener('click', () => switchView('home'));
    document.getElementById('filterContactsBtn')?.addEventListener('click', toggleContactsFilters);
    document.getElementById('selectContactsBtn')?.addEventListener('click', toggleSelectionMode);
    document.getElementById('selectAllContactsBtn')?.addEventListener('click', selectAllContacts);
    document.getElementById('deselectAllContactsBtn')?.addEventListener('click', deselectAllContacts);
    document.getElementById('bulkSaveBtn')?.addEventListener('click', bulkSaveContacts);
    document.getElementById('bulkExportBtn')?.addEventListener('click', bulkExportContacts);
    document.getElementById('bulkAddTagBtn')?.addEventListener('click', bulkAddTagToContacts);
    document.getElementById('addBulkTagsBtn')?.addEventListener('click', addBulkTags);
    document.getElementById('removeBulkTagsBtn')?.addEventListener('click', removeBulkTags);
    document.getElementById('bulkAddEventBtn')?.addEventListener('click', bulkAddEventToContacts);
    document.getElementById('bulkDeleteBtn')?.addEventListener('click', bulkDeleteContacts);
    
    // Export modal
    document.getElementById('exportPDFBtn')?.addEventListener('click', () => handleExportFormat('pdf'));
    document.getElementById('exportCSVBtn')?.addEventListener('click', () => handleExportFormat('csv'));
    document.getElementById('saveContactBtn')?.addEventListener('click', saveContact);
    document.getElementById('addPhoneBtn')?.addEventListener('click', () => addPhoneNumberField());
    document.getElementById('addEmailBtn')?.addEventListener('click', () => addEmailField());
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
    
    // AI Follow-up buttons
    document.getElementById('aiEmailBtn')?.addEventListener('click', async () => {
        if (currentViewingContact) {
            await handleAiFollowup(currentViewingContactId, currentViewingContact, 'email');
        }
    });
    
    document.getElementById('aiWhatsAppBtn')?.addEventListener('click', async () => {
        if (currentViewingContact) {
            await handleAiFollowup(currentViewingContactId, currentViewingContact, 'whatsapp');
        }
    });
    
    document.getElementById('aiSmsBtn')?.addEventListener('click', async () => {
        if (currentViewingContact) {
            await handleAiFollowup(currentViewingContactId, currentViewingContact, 'sms');
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
        if (currentViewingContact) {
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
    document.getElementById('eventFilter')?.addEventListener('change', () => {
        filterContacts();
        updateClearFiltersButton();
    });
    document.getElementById('tagFilter')?.addEventListener('change', () => {
        filterContacts();
        updateClearFiltersButton();
    });
    document.getElementById('dateFilter')?.addEventListener('change', () => {
        handleDateFilterChange();
        updateClearFiltersButton();
    });
    document.getElementById('dateFrom')?.addEventListener('change', () => {
        filterContacts();
        updateClearFiltersButton();
    });
    document.getElementById('dateTo')?.addEventListener('change', () => {
        filterContacts();
        updateClearFiltersButton();
    });
    document.getElementById('favoriteFilter')?.addEventListener('change', () => {
        filterContacts();
        updateClearFiltersButton();
    });
    document.getElementById('clearAllFiltersBtn')?.addEventListener('click', clearAllFilters);
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
    // Modal close handlers are set up earlier in setupEventListeners
    // This section handles other modals that use closeModal()
    document.querySelectorAll('.modal-close').forEach(btn => {
        // Skip if already handled by scanner modals
        if (btn.closest('#qrScannerModal') || btn.closest('#businessCardScannerModal') || btn.closest('#eventPassScannerModal')) {
            return;
        }
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) {
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
                } else if (modal.id === 'businessCardScannerModal') {
                    closeBusinessCardScanner();
                } else if (modal.id === 'eventPassScannerModal') {
                    closeEventPassScanner();
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
    const publicProfileScreen = document.getElementById('publicProfileScreen');
    
    if (loadingScreen) loadingScreen.classList.add('hidden');
    if (authScreen) authScreen.classList.add('hidden');
    if (appContainer) appContainer.classList.remove('hidden');
    if (publicProfileScreen) publicProfileScreen.classList.add('hidden');
    
    // Update auth button state
    updateAuthButton();
    
    // Update current event banner to ensure it's visible if there's a current event
    updateCurrentEventBanner();
    
    console.log('App shown');
}

function showPublicProfileScreen() {
    const loadingScreen = document.getElementById('loadingScreen');
    const authScreen = document.getElementById('authScreen');
    const appContainer = document.getElementById('appContainer');
    const publicProfileScreen = document.getElementById('publicProfileScreen');
    
    if (loadingScreen) loadingScreen.classList.add('hidden');
    if (authScreen) authScreen.classList.add('hidden');
    if (appContainer) appContainer.classList.add('hidden');
    if (publicProfileScreen) publicProfileScreen.classList.remove('hidden');
}

function bindPublicProfileListeners() {
    if (publicProfileListenersBound) return;
    
    document.getElementById('publicProfileBackBtn')?.addEventListener('click', () => {
        window.location.href = '/';
    });
    
    document.getElementById('publicProfileOpenAppBtn')?.addEventListener('click', () => {
        window.location.href = '/';
    });
    
    document.getElementById('publicProfileSaveBtn')?.addEventListener('click', handlePublicProfileSave);
    publicProfileListenersBound = true;
}

function togglePublicProfileLoading(isLoading) {
    const loadingEl = document.getElementById('publicProfileLoading');
    const contentEl = document.getElementById('publicProfileContent');
    
    if (!loadingEl || !contentEl) return;
    
    if (isLoading) {
        loadingEl.classList.remove('hidden');
        contentEl.classList.add('hidden');
    } else {
        loadingEl.classList.add('hidden');
        if (!document.getElementById('publicProfileError')?.classList.contains('hidden')) {
            contentEl.classList.add('hidden');
        } else {
            contentEl.classList.remove('hidden');
        }
    }
}

function showPublicProfileError(message) {
    const errorEl = document.getElementById('publicProfileError');
    const contentEl = document.getElementById('publicProfileContent');
    if (!errorEl) return;
    
    if (message) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
        contentEl?.classList.add('hidden');
    } else {
        errorEl.classList.add('hidden');
    }
}

function setPublicProfileAction(elementId, href, labelElementId, labelText) {
    const actionEl = document.getElementById(elementId);
    const labelEl = labelElementId ? document.getElementById(labelElementId) : null;
    if (!actionEl) return false;
    
    if (href) {
        actionEl.href = href;
        actionEl.style.display = 'flex';
        actionEl.setAttribute('target', '_blank');
        actionEl.setAttribute('rel', 'noopener');
        if (labelEl && labelText) {
            labelEl.textContent = labelText;
        }
        return true;
    } else {
        actionEl.style.display = 'none';
        return false;
    }
}

// Wrapper function to check login and saved contact before allowing chat actions
function createChatActionHandler(originalHandler, actionType) {
    return function(e) {
        e.preventDefault();
        
        // Check if user is logged in
        const currentUser = getCurrentUser();
        if (!currentUser) {
            showToast('🔐 Please login first to use chat features', 'error');
            setTimeout(() => {
                if (typeof showAuthScreen === 'function') {
                    showAuthScreen();
                }
            }, 1500);
            return;
        }
        
        // Check if contact is saved (has contactId)
        // For public profiles, we need to check if the contact exists in the app
        // Since we don't have contactId on public profile, we'll prompt to save first
        if (!currentPublicProfileId || !currentViewingContactId) {
            showToast('💾 Please save this contact first to use chat features', 'error');
            const saveBtn = document.getElementById('publicProfileSaveBtn');
            if (saveBtn) {
                saveBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Highlight the button briefly
                saveBtn.style.transform = 'scale(1.05)';
                setTimeout(() => {
                    saveBtn.style.transform = '';
                }, 500);
            }
            return;
        }
        
        // If all checks pass, execute the original handler
        if (originalHandler) {
            originalHandler(e);
        }
    };
}

function populatePublicProfileView(profile) {
    const nameEl = document.getElementById('publicProfileName');
    const roleEl = document.getElementById('publicProfileRole');
    const aboutEl = document.getElementById('publicProfileAbout');
    const emailValueEl = document.getElementById('publicProfileEmailValue');
    const mobileValueEl = document.getElementById('publicProfileMobileValue');
    const linkedInValueEl = document.getElementById('publicProfileLinkedInValue');
    const photoEl = document.getElementById('publicProfilePhoto');
    const photoPlaceholder = document.getElementById('publicProfilePhotoPlaceholder');
    
    document.title = profile.name ? `${profile.name} | pplai.app` : 'pplai.app Profile';
    
    if (nameEl) nameEl.textContent = profile.name || 'Shared profile';
    
    if (roleEl) {
        if (profile.role_company) {
            roleEl.textContent = profile.role_company;
            roleEl.style.display = 'block';
        } else {
            roleEl.style.display = 'none';
        }
    }
    
    if (aboutEl) {
        if (profile.about_me) {
            aboutEl.textContent = profile.about_me;
            aboutEl.style.display = 'block';
        } else {
            aboutEl.style.display = 'none';
        }
    }
    
    if (photoEl && photoPlaceholder) {
        if (profile.profile_photo_url) {
            photoEl.src = profile.profile_photo_url;
            photoEl.style.display = 'block';
            photoPlaceholder.style.display = 'none';
        } else {
            photoEl.style.display = 'none';
            photoPlaceholder.style.display = 'flex';
        }
    }
    
    const emailLink = profile.email ? `mailto:${profile.email}` : null;
    const phoneLink = profile.mobile ? `tel:${formatPhoneForLink(profile.mobile)}` : null;
    const whatsappLink = profile.whatsapp || profile.mobile ? buildWhatsappLink(profile.whatsapp || profile.mobile) : null;
    const linkedinLink = profile.linkedin_url ? formatExternalUrl(profile.linkedin_url) : null;
    
    const hasCall = setPublicProfileAction('publicProfileCall', phoneLink, 'publicProfileCallText', profile.mobile || 'Call');
    const hasEmail = setPublicProfileAction('publicProfileEmail', emailLink, 'publicProfileEmailText', profile.email || 'Email');
    const hasLinkedIn = setPublicProfileAction('publicProfileLinkedIn', linkedinLink);
    const hasWhatsapp = setPublicProfileAction('publicProfileWhatsapp', whatsappLink);
    
    const actionsContainer = document.getElementById('publicProfileActions');
    if (actionsContainer) {
        const hasAction = hasCall || hasEmail || hasLinkedIn || hasWhatsapp;
        actionsContainer.style.display = hasAction ? 'grid' : 'none';
    }
    
    if (emailValueEl) {
        emailValueEl.textContent = profile.email || 'Not shared';
    }
    if (mobileValueEl) {
        mobileValueEl.textContent = profile.mobile || 'Not shared';
    }
    if (linkedInValueEl) {
        linkedInValueEl.textContent = profile.linkedin_url || 'Not shared';
    }
    
    const contentEl = document.getElementById('publicProfileContent');
    contentEl?.classList.remove('hidden');
}

async function handlePublicProfileSave() {
    if (!currentPublicProfileId || !currentPublicProfile) return;
    
    try {
        // Convert profile to contact format for vCard generation
        const contactData = {
            name: currentPublicProfile.name || '',
            email: currentPublicProfile.email || null,
            email_addresses: currentPublicProfile.email ? [{ address: currentPublicProfile.email }] : [],
            mobile: currentPublicProfile.mobile || null,
            whatsapp: currentPublicProfile.whatsapp || null,
            phone_numbers: [],
            role_company: currentPublicProfile.role_company || null,
            company: null,
            website: null,
            linkedin_url: currentPublicProfile.linkedin_url || null,
            contact_photo_url: currentPublicProfile.profile_photo_url || null,
            meeting_context: currentPublicProfile.about_me || null,
            tags: [],
            event: null
        };
        
        // Add phone numbers
        if (currentPublicProfile.mobile) {
            contactData.phone_numbers.push({
                number: currentPublicProfile.mobile,
                is_whatsapp: false
            });
        }
        if (currentPublicProfile.whatsapp && currentPublicProfile.whatsapp !== currentPublicProfile.mobile) {
            contactData.phone_numbers.push({
                number: currentPublicProfile.whatsapp,
                is_whatsapp: true
            });
        }
        
        // Generate vCard with embedded photo
        const vcard = await generateContactVCardWithPhoto(contactData);
        const blob = new Blob([vcard], { type: 'text/vcard' });
        const url = URL.createObjectURL(blob);
        
        // Try Web Share API first (works on mobile)
        if (navigator.share && navigator.canShare) {
            const file = new File([blob], `${contactData.name.replace(/\s+/g, '_')}.vcf`, { type: 'text/vcard' });
            if (navigator.canShare({ files: [file] })) {
                navigator.share({
                    title: `Save ${contactData.name}`,
                    text: `Contact card for ${contactData.name}`,
                    files: [file]
                }).then(() => {
                    URL.revokeObjectURL(url);
                }).catch(() => {
                    // Fallback to download
                    downloadVCard(url, contactData.name);
                });
                return;
            }
        }
        
        // Fallback: Download vCard
        downloadVCard(url, contactData.name);
    } catch (error) {
        console.error('Error saving contact to phone:', error);
        showToast('Failed to save contact to phone: ' + error.message, 'error');
    }
}

function formatPhoneForLink(number) {
    if (!number) return '';
    return number.replace(/[^+\d]/g, '');
}

function buildWhatsappLink(number) {
    if (!number) return null;
    const digits = number.replace(/[^+\d]/g, '');
    if (!digits) return null;
    const normalized = digits.startsWith('+') ? digits.substring(1) : digits;
    return `https://wa.me/${normalized}`;
}

function formatExternalUrl(url) {
    if (!url) return null;
    if (!/^https?:\/\//i.test(url)) {
        return `https://${url}`;
    }
    return url;
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

async function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = (error) => {
            URL.revokeObjectURL(url);
            reject(error);
        };
        img.src = url;
    });
}

async function preprocessCardImage(file) {
    try {
        const img = await loadImageFromFile(file);
        
        // Check if image loaded with valid dimensions
        if (!img.width || !img.height || img.width < 10 || img.height < 10) {
            debugWarn('Image loaded but has invalid dimensions:', img.width, 'x', img.height);
            return null;
        }
        
        const maxDimension = 1600;
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const targetWidth = Math.max(1, Math.round(img.width * scale));
        const targetHeight = Math.max(1, Math.round(img.height * scale));

        // Simple resize without rotation - rotation can fail on some HEIC files
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        // Verify canvas has actual image data
        try {
            const testPixel = ctx.getImageData(0, 0, 1, 1);
            if (!testPixel || testPixel.data.every(v => v === 0)) {
                debugWarn('Canvas drawn but contains no pixel data');
                return null;
            }
        } catch (e) {
            debugWarn('Cannot read canvas pixel data:', e);
            return null;
        }

        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
        if (!blob || blob.size === 0) {
            debugWarn('Canvas toBlob returned empty result');
            return null;
        }

        const processedFile = new File([blob], file.name.replace(/\.[^.]+$/, '') + '-processed.jpg', { type: 'image/jpeg' });
        return { file: processedFile };
    } catch (error) {
        debugWarn('Card preprocessing failed:', error);
        return null;
    }
}

function base64ToFile(base64, filename, mime = 'image/jpeg') {
    const byteString = atob(base64);
    const arrayBuffer = new ArrayBuffer(byteString.length);
    const uint8Array = new Uint8Array(arrayBuffer);
    for (let i = 0; i < byteString.length; i++) {
        uint8Array[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([uint8Array], { type: mime });
    return new File([blob], filename, { type: mime });
}

async function populateContactForm(contactInfo, options = {}) {
    if (!contactInfo) return;
    const { portraitFile = null, cardFile = null } = options;

    await openContactModal();

    const nameEl = document.getElementById('contactName');
    if (nameEl && contactInfo.name) nameEl.value = contactInfo.name;

    const emailEl = document.getElementById('contactEmail');
    if (emailEl && contactInfo.email) emailEl.value = contactInfo.email;

    applyPhoneToForm(contactInfo.phone);

    const linkedinEl = document.getElementById('contactLinkedIn');
    if (linkedinEl && contactInfo.linkedin) linkedinEl.value = contactInfo.linkedin;

    const websiteEl = document.getElementById('contactWebsite');
    if (websiteEl && contactInfo.website) websiteEl.value = contactInfo.website;

    const companyEl = document.getElementById('contactCompany');
    if (companyEl && contactInfo.company) companyEl.value = contactInfo.company;

    const roleEl = document.getElementById('contactRole');
    const jobTitle = contactInfo.title || contactInfo.role || '';
    if (roleEl && jobTitle) {
        roleEl.value = jobTitle;
    }

    if (cardFile) {
        const mediaInput = document.getElementById('mediaInput');
        if (mediaInput) {
            const mediaDataTransfer = new DataTransfer();
            if (mediaInput.files) {
                Array.from(mediaInput.files).forEach(existingFile => mediaDataTransfer.items.add(existingFile));
            }
            mediaDataTransfer.items.add(cardFile);
            mediaInput.files = mediaDataTransfer.files;
        }
    }

    const photoInput = document.getElementById('contactPhotoInput');
    if (photoInput && portraitFile) {
        const preview = document.getElementById('contactPhotoPreview');
        const placeholder = document.querySelector('#contactPhotoUpload .photo-placeholder');
        const photoDataTransfer = new DataTransfer();
        photoDataTransfer.items.add(portraitFile);
        photoInput.files = photoDataTransfer.files;

        if (preview) {
            const reader = new FileReader();
            reader.onload = (event) => {
                preview.src = event.target.result;
                preview.classList.remove('hidden');
                placeholder?.classList.add('hidden');
            };
            reader.readAsDataURL(portraitFile);
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

async function switchView(viewName) {
    // Check authentication for protected views (everything except public profile)
    const protectedViews = ['contacts', 'events', 'tags', 'profile', 'admin', 'chat', 'home'];
    
    if (protectedViews.includes(viewName)) {
        const currentUser = getCurrentUser();
        const token = getAuthToken();
        
        if (!currentUser || !token) {
            // User not authenticated - redirect to auth screen
            showToast('🔐 Please login to access this feature', 'error');
            showAuthScreen();
            return;
        }
        
        // Verify token is still valid by checking if we can access the API
        // This prevents simple DOM manipulation from bypassing auth
        try {
            await api.getProfile();
        } catch (error) {
            // Token invalid or expired
            clearAuthToken();
            showToast('🔐 Session expired. Please login again', 'error');
            showAuthScreen();
            return;
        }
    }
    
    // Close any open modals first
    closeModal();
    
    // Hide all views
    document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
    
    // Show selected view
    const targetView = document.getElementById(`${viewName}View`);
    if (!targetView) {
        console.error(`View ${viewName}View not found`);
        return;
    }
    targetView.classList.remove('hidden');

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
    // Get Client ID from window (injected from environment)
    const clientId = window.GOOGLE_CLIENT_ID || '';
    
    // Skip if client ID not configured (local development without OAuth)
    if (!clientId || clientId === 'YOUR_GOOGLE_CLIENT_ID') {
        debugLog('⚠️ Google OAuth Client ID not configured - OAuth sign-in disabled');
        debugLog('💡 Use email/password login or configure GOOGLE_CLIENT_ID for OAuth');
            return;
        }
        
    // Check if Google OAuth SDK is loaded
    if (typeof google === 'undefined' || !google.accounts) {
        debugWarn('Google OAuth SDK not loaded');
        return;
    }
    
    try {
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
        
        debugLog('✅ Google OAuth initialized successfully');
    } catch (error) {
        debugError('❌ Failed to initialize Google OAuth:', error);
        debugLog('💡 Use email/password login instead');
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
        await checkAdminStatus();
        
        // Initialize push notifications
        await initializePushNotifications();
        
        // Check if there's a pending contact save action
        const pendingContactSave = sessionStorage.getItem('pendingContactSave');
        if (pendingContactSave) {
            try {
                const contactData = JSON.parse(pendingContactSave);
                sessionStorage.removeItem('pendingContactSave');
                // Small delay to ensure UI is ready
                setTimeout(async () => {
                    await openContactModal(contactData);
                }, 500);
            } catch (error) {
                console.error('Error parsing pending contact save:', error);
                sessionStorage.removeItem('pendingContactSave');
            }
        }
    } catch (error) {
        console.error('Google OAuth error:', error);
        showToast('Google sign-in failed: ' + error.message, 'error');
    }
}

// Push Notification Functions
let pushSubscriptionEndpoint = null;

async function initializePushNotifications() {
    // Check if browser supports push notifications
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('⚠️ Push notifications not supported in this browser');
        debugLog('⚠️ Push notifications not supported in this browser');
        return;
    }
    
    // Check if user is authenticated
    const currentUser = getCurrentUser();
    if (!currentUser) {
        console.log('ℹ️ User not authenticated, skipping push notification setup');
        return;
    }
    
    try {
        console.log('🔔 Initializing push notifications...');
        
        // Register service worker
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('✅ Service Worker registered:', registration.scope);
        debugLog('✅ Service Worker registered');
        
        // Wait for service worker to be ready
        await navigator.serviceWorker.ready;
        console.log('✅ Service Worker ready');
        
        // Check if already subscribed
        const existingSubscription = await registration.pushManager.getSubscription();
        if (existingSubscription) {
            pushSubscriptionEndpoint = existingSubscription.endpoint;
            console.log('✅ Already subscribed to push notifications');
            console.log('   Endpoint:', existingSubscription.endpoint.substring(0, 50) + '...');
            debugLog('✅ Already subscribed to push notifications');
            // Update subscription in backend (in case user logged in from different device)
            await updatePushSubscription(existingSubscription);
            setupAppExitDetection();
            return;
        }
        
        // Check current permission
        const currentPermission = Notification.permission;
        console.log('📋 Current notification permission:', currentPermission);
        
        // Request notification permission
        let permission = currentPermission;
        if (permission === 'default') {
            console.log('📋 Requesting notification permission...');
            permission = await Notification.requestPermission();
            console.log('📋 Permission result:', permission);
        }
        
        if (permission !== 'granted') {
            console.warn('⚠️ Notification permission denied:', permission);
            debugLog('⚠️ Notification permission denied');
            return;
        }
        
        // Get VAPID public key from backend
        console.log('🔑 Getting VAPID public key from backend...');
        const vapidKeyResponse = await api.getVapidPublicKey();
        const vapidPublicKey = vapidKeyResponse.publicKey;
        
        if (!vapidPublicKey) {
            console.error('❌ VAPID public key not available');
            debugLog('⚠️ VAPID public key not available');
            return;
        }
        
        console.log('✅ Got VAPID public key');
        
        // Convert VAPID key to Uint8Array
        const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
        
        // Subscribe to push service
        console.log('📝 Subscribing to push service...');
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
        });
        
        pushSubscriptionEndpoint = subscription.endpoint;
        console.log('✅ Subscribed to push notifications');
        console.log('   Endpoint:', subscription.endpoint.substring(0, 50) + '...');
        
        // Send subscription to backend
        await updatePushSubscription(subscription);
        console.log('✅ Subscription saved to backend');
        
        debugLog('✅ Subscribed to push notifications');
        
        // Set up app exit detection
        setupAppExitDetection();
        console.log('✅ App exit detection set up');
        
    } catch (error) {
        console.error('❌ Error initializing push notifications:', error);
        debugError('❌ Error initializing push notifications:', error);
    }
}

async function updatePushSubscription(subscription) {
    try {
        const subscriptionData = {
            endpoint: subscription.endpoint,
            keys: {
                p256dh: arrayBufferToBase64(subscription.getKey('p256dh')),
                auth: arrayBufferToBase64(subscription.getKey('auth'))
            },
            user_agent: navigator.userAgent
        };
        
        console.log('📤 Sending subscription to backend...');
        await api.subscribePush(subscriptionData);
        console.log('✅ Subscription updated in backend');
    } catch (error) {
        console.error('❌ Error updating push subscription:', error);
        debugError('❌ Error updating push subscription:', error);
    }
}

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

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function setupAppExitDetection() {
    // Send notification when app is closed/exited
    let isExiting = false;
    let exitTimeout = null;
    
    // Handle visibility change (tab switch, minimize, etc.)
    document.addEventListener('visibilitychange', async () => {
        if (document.hidden && !isExiting) {
            isExiting = true;
            // Clear any existing timeout
            if (exitTimeout) {
                clearTimeout(exitTimeout);
            }
            // Small delay to avoid sending on every tab switch
            exitTimeout = setTimeout(async () => {
                if (document.hidden) {
                    await sendProfileNotification();
                }
                isExiting = false;
            }, 2000); // Only send if still hidden after 2 seconds
        } else if (!document.hidden) {
            // Clear timeout if user comes back
            if (exitTimeout) {
                clearTimeout(exitTimeout);
                exitTimeout = null;
            }
            isExiting = false;
        }
    });
    
    // Handle beforeunload (browser close, refresh)
    window.addEventListener('beforeunload', async () => {
        // Use sendBeacon for reliability during page unload
        await sendProfileNotification();
    });
}

async function sendProfileNotification() {
    try {
        const currentUser = getCurrentUser();
        if (!currentUser) {
            console.warn('⚠️ Cannot send notification: User not logged in');
            return;
        }
        
        if (!pushSubscriptionEndpoint) {
            console.warn('⚠️ Cannot send notification: No push subscription endpoint');
            // Try to get subscription
            try {
                const registration = await navigator.serviceWorker.ready;
                const subscription = await registration.pushManager.getSubscription();
                if (subscription) {
                    pushSubscriptionEndpoint = subscription.endpoint;
                    console.log('✅ Found push subscription endpoint');
                } else {
                    console.warn('⚠️ No push subscription found. User may need to grant permission.');
                    return;
                }
            } catch (error) {
                console.error('❌ Error checking push subscription:', error);
                return;
            }
        }
        
        // Send notification request to backend
        console.log('📤 Sending profile notification...');
        const result = await api.sendProfileNotification();
        console.log('✅ Profile notification sent:', result);
        debugLog('✅ Profile notification sent');
    } catch (error) {
        console.error('❌ Error sending profile notification:', error);
        debugError('❌ Error sending profile notification:', error);
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
            
            // Initialize push notifications
            await initializePushNotifications();
            
            // Check if there's a pending contact save action
            const pendingContactSave = sessionStorage.getItem('pendingContactSave');
            if (pendingContactSave) {
                try {
                    const contactData = JSON.parse(pendingContactSave);
                    sessionStorage.removeItem('pendingContactSave');
                    // Small delay to ensure UI is ready
                    setTimeout(async () => {
                        await openContactModal(contactData);
                    }, 500);
                } catch (error) {
                    console.error('Error parsing pending contact save:', error);
                    sessionStorage.removeItem('pendingContactSave');
                }
            }
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
            await checkAdminStatus();
            
            // Check if there's a pending contact save action
            const pendingContactSave = sessionStorage.getItem('pendingContactSave');
            if (pendingContactSave) {
                try {
                    const contactData = JSON.parse(pendingContactSave);
                    sessionStorage.removeItem('pendingContactSave');
                    // Small delay to ensure UI is ready
                    setTimeout(async () => {
                        await openContactModal(contactData);
                    }, 500);
                } catch (error) {
                    console.error('Error parsing pending contact save:', error);
                    sessionStorage.removeItem('pendingContactSave');
                }
            }
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
            await checkAdminStatus();
            
            // Check if there's a pending contact save action
            const pendingContactSave = sessionStorage.getItem('pendingContactSave');
            if (pendingContactSave) {
                try {
                    const contactData = JSON.parse(pendingContactSave);
                    sessionStorage.removeItem('pendingContactSave');
                    // Small delay to ensure UI is ready
                    setTimeout(async () => {
                        await openContactModal(contactData);
                    }, 500);
                } catch (error) {
                    console.error('Error parsing pending contact save:', error);
                    sessionStorage.removeItem('pendingContactSave');
                }
            }
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
        if (savedEventId && savedEventId !== 'undefined' && savedEventId !== 'null') {
            try {
                currentEvent = await api.getEvent(savedEventId);
                updateCurrentEventBanner();
            } catch (error) {
                console.error('Failed to load saved event:', error);
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
        showAuthScreen();
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
    
    // Role/Title
    if (user.role_company) {
        vcard += `TITLE:${escapeVCardValue(user.role_company)}\n`;
    }
    
    // Website (if user has website field)
    if (user.website) {
        let websiteUrl = user.website;
        if (!websiteUrl.startsWith('http://') && !websiteUrl.startsWith('https://')) {
            websiteUrl = 'https://' + websiteUrl;
        }
        vcard += `URL:${escapeVCardValue(websiteUrl)}\n`;
    }
    
    // LinkedIn
    if (user.linkedin_url) {
        let linkedInUrl = user.linkedin_url;
        if (!linkedInUrl.startsWith('http://') && !linkedInUrl.startsWith('https://')) {
            linkedInUrl = 'https://' + linkedInUrl;
        }
        vcard += `URL;TYPE=LinkedIn:${escapeVCardValue(linkedInUrl)}\n`;
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
    
    // Email button (now inline with email field, handled by displayContactProfile)
    const emailBtn = document.getElementById('emailContactBtn');
    if (emailBtn) {
        emailBtn.style.display = contact.email ? 'inline-flex' : 'none';
    }
    
    // Call button (now inline with mobile field, handled by displayContactProfile)
    const callBtn = document.getElementById('callContactBtn');
    if (callBtn) {
        callBtn.style.display = contact.mobile ? 'inline-flex' : 'none';
    }
    
    // Message button (now inline with mobile field, handled by displayContactProfile)
    const messageBtn = document.getElementById('messageContactBtn');
    if (messageBtn) {
        messageBtn.style.display = contact.mobile ? 'inline-flex' : 'none';
    }
    
    // WhatsApp button (now inline with mobile field, handled by displayContactProfile)
    const whatsappBtn = document.getElementById('whatsappContactBtn');
    if (whatsappBtn) {
        whatsappBtn.style.display = (contact.mobile || contact.whatsapp) ? 'inline-flex' : 'none';
    }
}

async function saveContactToDevice() {
    if (!currentViewingContact) return;
    
    // Generate vCard with embedded photo
    const vcard = await generateContactVCardWithPhoto(currentViewingContact);
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
    
    // Handle multiple email addresses - merge single and multiple
    const emailAddresses = [];
    if (contact.email_addresses && Array.isArray(contact.email_addresses) && contact.email_addresses.length > 0) {
        contact.email_addresses.forEach(email => {
            const emailAddr = email.address || email;
            if (emailAddr) {
                emailAddresses.push(emailAddr);
            }
        });
    }
    // Add single email if not already in the list
    if (contact.email && !emailAddresses.includes(contact.email)) {
        emailAddresses.unshift(contact.email);
    }
    // Add all emails to vCard
    emailAddresses.forEach(email => {
        vcard += `EMAIL:${escapeVCardValue(email)}\n`;
    });
    
    // Handle multiple phone numbers - merge single and multiple
    const phoneNumbers = [];
    if (contact.phone_numbers && Array.isArray(contact.phone_numbers) && contact.phone_numbers.length > 0) {
        contact.phone_numbers.forEach(phone => {
            const phoneNumber = phone.number || phone;
            if (phoneNumber) {
                phoneNumbers.push({
                    number: phoneNumber,
                    is_whatsapp: phone.is_whatsapp !== false
                });
            }
        });
    }
    // Add single mobile if not already in the list
    if (contact.mobile) {
        const mobileExists = phoneNumbers.some(pn => pn.number === contact.mobile);
        if (!mobileExists) {
            phoneNumbers.unshift({
                number: contact.mobile,
                is_whatsapp: false
            });
        }
    }
    // Add single whatsapp if not already in the list
    if (contact.whatsapp && contact.whatsapp !== contact.mobile) {
        const whatsappExists = phoneNumbers.some(pn => pn.number === contact.whatsapp);
        if (!whatsappExists) {
            phoneNumbers.push({
                number: contact.whatsapp,
                is_whatsapp: true
            });
        }
    }
    // Add all phone numbers to vCard
    phoneNumbers.forEach(phone => {
        if (phone.is_whatsapp) {
            vcard += `TEL;TYPE=CELL,WA:${escapeVCardValue(phone.number)}\n`;
        } else {
            vcard += `TEL;TYPE=CELL:${escapeVCardValue(phone.number)}\n`;
        }
    });
    
    // Company
    if (contact.company) {
        vcard += `ORG:${escapeVCardValue(contact.company)}\n`;
    }
    
    // Role/Title
    if (contact.role_company) {
        vcard += `TITLE:${escapeVCardValue(contact.role_company)}\n`;
    }
    
    // Website
    if (contact.website) {
        let websiteUrl = contact.website;
        if (!websiteUrl.startsWith('http://') && !websiteUrl.startsWith('https://')) {
            websiteUrl = 'https://' + websiteUrl;
        }
        vcard += `URL:${escapeVCardValue(websiteUrl)}\n`;
    }
    
    // LinkedIn
    if (contact.linkedin_url) {
        let linkedInUrl = contact.linkedin_url;
        if (!linkedInUrl.startsWith('http://') && !linkedInUrl.startsWith('https://')) {
            linkedInUrl = 'https://' + linkedInUrl;
        }
        vcard += `URL;TYPE=LinkedIn:${escapeVCardValue(linkedInUrl)}\n`;
    }
    
    // Custom pplai.app fields
    // Tags as custom field
    if (contact.tags && contact.tags.length > 0) {
        const tagNames = contact.tags.map(t => t.name || t).join(', ');
        vcard += `X-PPLAI-TAGS:${escapeVCardValue(tagNames)}\n`;
    }
    
    // Date met on pplai.app as custom field (ISO format: YYYY-MM-DD)
    if (contact.meeting_date) {
        const meetingDate = new Date(contact.meeting_date);
        const dateMetISO = meetingDate.toISOString().split('T')[0]; // YYYY-MM-DD format
        vcard += `X-PPLAI-DATE-MET:${escapeVCardValue(dateMetISO)}\n`;
    }
    
    // Event as custom field
    if (contact.event && contact.event.name) {
        vcard += `X-PPLAI-EVENT:${escapeVCardValue(contact.event.name)}\n`;
    }
    
    // Location as custom field
    if (contact.meeting_location_name) {
        vcard += `X-PPLAI-LOCATION:${escapeVCardValue(contact.meeting_location_name)}\n`;
    } else if (contact.meeting_latitude && contact.meeting_longitude) {
        vcard += `X-PPLAI-LOCATION:${escapeVCardValue(`${contact.meeting_latitude}, ${contact.meeting_longitude}`)}\n`;
    }
    
    // Notes - combine all contact information
    let notes = [];
    
    // Add tags if available (also in notes for compatibility)
    if (contact.tags && contact.tags.length > 0) {
        const tagNames = contact.tags.map(t => t.name || t).join(', ');
        notes.push(`Tags: ${tagNames}`);
    }
    
    // Add event if available (also in notes for compatibility)
    if (contact.event && contact.event.name) {
        notes.push(`Event: ${contact.event.name}`);
    }
    
    // Add location if available (also in notes for compatibility)
    if (contact.meeting_location_name) {
        notes.push(`Location: ${contact.meeting_location_name}`);
    } else if (contact.meeting_latitude && contact.meeting_longitude) {
        notes.push(`Location: ${contact.meeting_latitude}, ${contact.meeting_longitude}`);
    }
    
    // Add meeting date if available (also in notes for compatibility)
    if (contact.meeting_date) {
        const meetingDate = new Date(contact.meeting_date);
        const dateStr = meetingDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        notes.push(`Met on: ${dateStr}`);
    }
    
    // Add AI summary if available
    if (contact.ai_summary) {
        notes.push(`\nAI Summary:\n${contact.ai_summary}`);
    }
    
    // Add meeting context (chat messages/notes)
    if (contact.meeting_context) {
        if (notes.length > 0) {
            notes.push(`\nNotes:\n${contact.meeting_context}`);
        } else {
            notes.push(contact.meeting_context);
        }
    }
    
    // Add combined notes to vCard
    if (notes.length > 0) {
        vcard += `NOTE:${escapeVCardValue(notes.join('\n'))}\n`;
    }
    
    // Photo - will be added asynchronously if available
    // (Photo is handled separately to embed as base64)
    
    vcard += 'END:VCARD';
    return vcard;
}

async function generateContactVCardWithPhoto(contact) {
    // Generate base vCard without photo
    let vcard = generateContactVCard(contact);
    
    // Try to embed photo as base64 if available
    if (contact.contact_photo_url) {
        try {
            const photoData = await fetchPhotoAsBase64(contact.contact_photo_url);
            if (photoData && photoData.base64) {
                // Insert photo before END:VCARD
                const photoLine = `PHOTO;ENCODING=b;TYPE=${photoData.imageType}:${photoData.base64}\n`;
                vcard = vcard.replace('END:VCARD', photoLine + 'END:VCARD');
            }
        } catch (error) {
            console.warn('Failed to embed photo in vCard:', error);
            // Don't include photo URL if we can't embed it
        }
    }
    
    return vcard;
}

async function fetchPhotoAsBase64(imageUrl) {
    try {
        // Fetch the image
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
        }
        
        const blob = await response.blob();
        
        // Convert blob to base64 and return both base64 and content type
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                // Remove data:image/...;base64, prefix
                const base64 = reader.result.split(',')[1];
                // Determine image type from blob type
                let imageType = 'JPEG'; // Default
                if (blob.type) {
                    if (blob.type.includes('png')) imageType = 'PNG';
                    else if (blob.type.includes('gif')) imageType = 'GIF';
                    else if (blob.type.includes('webp')) imageType = 'WEBP';
                    else if (blob.type.includes('jpeg') || blob.type.includes('jpg')) imageType = 'JPEG';
                }
                resolve({ base64, imageType });
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.warn('Error fetching photo for vCard:', error);
        return null;
    }
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
    const photoContainer = photoEl?.parentElement; // Get the profile-photo-large container
    const nameEl = document.getElementById('profileNameDisplay');
    const roleEl = document.getElementById('profileRoleDisplay');

    if (photoEl && photoContainer) {
        if (profile.profile_photo_url) {
        photoEl.src = profile.profile_photo_url;
        photoEl.style.display = 'block';
            photoContainer.style.display = 'block'; // Show container when photo exists
        } else {
            photoEl.style.display = 'none';
            photoContainer.style.display = 'none'; // Hide container when no photo
        }
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
        showToast('Profile updated successfully', 'success');
    } catch (error) {
        showToast('Failed to update profile: ' + error.message, 'error');
    }
}

async function saveProfileToContacts() {
    const profile = getCurrentUser();
    if (!profile) {
        showToast('Unable to load profile', 'error');
        return;
    }
    
    // Convert profile to contact data format
    // Handle phone numbers - use phone_numbers array if available, otherwise create from mobile
    let phoneNumbers = [];
    if (profile.phone_numbers && Array.isArray(profile.phone_numbers) && profile.phone_numbers.length > 0) {
        phoneNumbers = profile.phone_numbers;
    } else if (profile.mobile) {
        phoneNumbers = [{
            number: profile.mobile,
            is_whatsapp: profile.whatsapp ? true : false
        }];
    }
    
    // Handle email addresses - use email_addresses array if available, otherwise create from email
    let emailAddresses = [];
    if (profile.email_addresses && Array.isArray(profile.email_addresses) && profile.email_addresses.length > 0) {
        emailAddresses = profile.email_addresses;
    } else if (profile.email) {
        emailAddresses = [{
            address: profile.email
        }];
    }
    
    // Map about_me to meeting_context for the contact form
    const contactData = {
        name: profile.name || '',
        role_company: profile.role_company || '',
        phone_numbers: phoneNumbers,
        email_addresses: emailAddresses,
        mobile: profile.mobile || '', // Keep for backward compatibility
        email: profile.email || '', // Keep for backward compatibility
        linkedin_url: profile.linkedin_url || '',
        meeting_context: profile.about_me || '', // Map about_me to meeting_context
        contact_photo_url: profile.profile_photo_url || ''
    };
    
    // Open contact modal with profile data
    await openContactModal(contactData);
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

async function importLumaEventFromUrl() {
    const urlInput = document.getElementById('lumaUrlInput');
    const url = urlInput?.value?.trim();
    
    if (!url || (!url.includes('lu.ma') && !url.includes('luma.com'))) {
        showToast('Please enter a valid Luma event URL (lu.ma or luma.com)', 'error');
        return;
    }
    
    const btn = document.getElementById('importLumaUrlBtn');
    const originalText = btn?.textContent;
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Importing...';
    }
    
    try {
        const event = await api.importLumaEventFromUrl(url);
        showToast(`✅ Successfully imported "${event.name}"`, 'success');
        document.getElementById('lumaImportModal')?.classList.add('hidden');
        if (urlInput) urlInput.value = '';
        // Refresh events list - ensure we're on events view and reload
        await loadEvents();
        // Force display update if events view is visible
        const eventsView = document.getElementById('eventsView');
        if (eventsView && !eventsView.classList.contains('hidden')) {
            displayEvents(allEvents);
        }
    } catch (error) {
        console.error('Error importing Luma event:', error);
        showToast(error.message || 'Failed to import event from Luma', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

async function importLumaEventsFromApi() {
    const apiKeyInput = document.getElementById('lumaApiKeyInput');
    const calendarIdInput = document.getElementById('lumaCalendarIdInput');
    const apiKey = apiKeyInput?.value?.trim();
    const calendarId = calendarIdInput?.value?.trim() || null;
    
    if (!apiKey) {
        showToast('Please enter your Luma API key', 'error');
        return;
    }
    
    const btn = document.getElementById('importLumaApiBtn');
    const originalText = btn?.textContent;
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Importing...';
    }
    
    try {
        const events = await api.importLumaEventsFromApi(apiKey, calendarId);
        showToast(`✅ Successfully imported ${events.length} event(s)`, 'success');
        document.getElementById('lumaImportModal')?.classList.add('hidden');
        if (apiKeyInput) apiKeyInput.value = '';
        if (calendarIdInput) calendarIdInput.value = '';
        // Refresh events list - ensure we're on events view and reload
        await loadEvents();
        // Force display update if events view is visible
        const eventsView = document.getElementById('eventsView');
        if (eventsView && !eventsView.classList.contains('hidden')) {
            displayEvents(allEvents);
        }
    } catch (error) {
        console.error('Error importing Luma events:', error);
        showToast(error.message || 'Failed to import events from Luma', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

async function loadEvents() {
    // Check authentication
    const currentUser = getCurrentUser();
    const token = getAuthToken();
    if (!currentUser || !token) {
        showAuthScreen();
        return;
    }
    
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
    const dateFilter = document.getElementById('eventsDateFilter');
    const dateFrom = document.getElementById('eventsDateFrom');
    const dateTo = document.getElementById('eventsDateTo');
    
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
    
    let filteredEvents = [...allEvents];
    
    // Apply search filter
    if (searchTerm !== '') {
        filteredEvents = filteredEvents.filter(event => {
            const name = (event.name || '').toLowerCase();
            const location = (event.location || '').toLowerCase();
            const description = (event.description || '').toLowerCase();
            
            return name.includes(searchTerm) || 
                   location.includes(searchTerm) || 
                   description.includes(searchTerm);
        });
    }
    
    // Apply date filter
    if (dateFilter && dateFilter.value !== 'all') {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        filteredEvents = filteredEvents.filter(event => {
            const startDate = new Date(event.start_date);
            const endDate = new Date(event.end_date);
            
            if (dateFilter.value === 'today') {
                return startDate <= today && endDate >= today;
            } else if (dateFilter.value === 'week') {
                const weekStart = new Date(today);
                weekStart.setDate(today.getDate() - today.getDay());
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekStart.getDate() + 6);
                return (startDate >= weekStart && startDate <= weekEnd) || 
                       (endDate >= weekStart && endDate <= weekEnd) ||
                       (startDate <= weekStart && endDate >= weekEnd);
            } else if (dateFilter.value === 'month') {
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                return (startDate >= monthStart && startDate <= monthEnd) || 
                       (endDate >= monthStart && endDate <= monthEnd) ||
                       (startDate <= monthStart && endDate >= monthEnd);
            } else if (dateFilter.value === 'upcoming') {
                return startDate > today;
            } else if (dateFilter.value === 'past') {
                return endDate < today;
            } else if (dateFilter.value === 'custom') {
                if (dateFrom && dateFrom.value) {
                    const fromDate = new Date(dateFrom.value);
                    if (endDate < fromDate) return false;
                }
                if (dateTo && dateTo.value) {
                    const toDate = new Date(dateTo.value);
                    toDate.setHours(23, 59, 59, 999);
                    if (startDate > toDate) return false;
                }
                return true;
            }
            return true;
        });
    }
    
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
    filterEvents();
}

function clearEventsFilters() {
    const searchInput = document.getElementById('eventsSearchInput');
    const dateFilter = document.getElementById('eventsDateFilter');
    const customRange = document.getElementById('eventsCustomDateRange');
    const dateFrom = document.getElementById('eventsDateFrom');
    const dateTo = document.getElementById('eventsDateTo');
    
    if (searchInput) searchInput.value = '';
    if (dateFilter) dateFilter.value = 'all';
    if (customRange) customRange.classList.add('hidden');
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    
    filterEvents();
    updateEventsClearFiltersButton();
}

function updateEventsClearFiltersButton() {
    const clearBtn = document.getElementById('clearEventsFiltersBtn');
    const searchInput = document.getElementById('eventsSearchInput');
    const dateFilter = document.getElementById('eventsDateFilter');
    const dateFrom = document.getElementById('eventsDateFrom');
    const dateTo = document.getElementById('eventsDateTo');
    
    if (!clearBtn) return;
    
    const hasSearch = searchInput && searchInput.value.trim().length > 0;
    const hasDateFilter = dateFilter && dateFilter.value !== 'all';
    const hasCustomDates = dateFrom && dateFrom.value || dateTo && dateTo.value;
    
    if (hasSearch || hasDateFilter || hasCustomDates) {
        clearBtn.style.display = 'flex';
        clearBtn.style.alignItems = 'center';
        clearBtn.style.gap = '6px';
    } else {
        clearBtn.style.display = 'none';
    }
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
            option.textContent = `${event.name}${event.location ? ` - ${event.location}` : ''}${event.start_date ? ` (${formatDate(event.start_date)})` : ''}`;
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
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                <h3 style="margin: 0; flex: 1;">${event.name}${isSelected ? ' <span style="font-size: 14px; color: var(--primary);">(Selected)</span>' : ''}</h3>
                <div style="display: flex; gap: 4px; flex-shrink: 0; margin-left: 12px;">
                    <button class="btn-small btn-secondary edit-event" data-event-id="${event.id}" title="Edit" style="display: flex; align-items: center; justify-content: center; padding: 6px 8px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="btn-small btn-secondary delete-event" data-event-id="${event.id}" title="Delete" style="display: flex; align-items: center; justify-content: center; padding: 6px 8px; color: var(--danger); border-color: var(--danger);">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
            <p class="event-location">📍 ${event.location}</p>
            <p class="event-dates">${formatDateRange(event.start_date, event.end_date)}</p>
            ${event.description ? `<p class="event-description">${event.description}</p>` : ''}
            <div class="event-actions">
                ${isSelected 
                    ? `<button class="btn-small btn-secondary unselect-event" data-event-id="${event.id}" title="Unselect" style="display: flex; align-items: center; justify-content: center; padding: 6px 8px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>`
                    : `<button class="btn-small btn-secondary select-event" data-event-id="${event.id}" title="Select" style="display: flex; align-items: center; gap: 6px; padding: 6px 10px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span>Select</span>
                    </button>`
                }
                <div style="display: flex; gap: 4px; flex-shrink: 0;">
                    <button class="btn-small btn-secondary view-contacts" data-event-id="${event.id}" data-event-name="${event.name}" title="View Contacts" style="display: flex; align-items: center; gap: 6px; padding: 6px 10px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                        <span>Contacts</span>
                    </button>
                    <button class="btn-small btn-secondary export-pdf" data-event-id="${event.id}" title="Export PDF" style="display: flex; align-items: center; gap: 6px; padding: 6px 10px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                        <span>PDF</span>
                    </button>
                    <button class="btn-small btn-secondary export-csv" data-event-id="${event.id}" title="Export CSV" style="display: flex; align-items: center; gap: 6px; padding: 6px 10px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        <span>CSV</span>
                    </button>
                </div>
            </div>
        </div>
    `;
    }).join('');

    // Add event listeners
    container.querySelectorAll('.select-event').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const eventId = e.currentTarget.dataset.eventId || e.target.closest('.select-event')?.dataset.eventId;
            if (!eventId) {
                console.error('Event ID not found for select event');
                return;
            }
            await selectEvent(eventId);
        });
    });

    container.querySelectorAll('.unselect-event').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            await unselectEvent();
        });
    });

    // Combined export handler - show modal instead of direct export
    const showEventExportModal = (eventId, eventName) => {
        // Get event contacts count
        const eventCard = container.querySelector(`[data-event-id="${eventId}"]`)?.closest('.event-card');
        const contactCount = eventCard?.querySelector('.event-contact-count')?.textContent?.match(/\d+/)?.[0] || '0';
        
        exportModalData.eventId = eventId;
        exportModalData.type = 'event';
        exportModalData.ids = [];
        showExportModal(contactCount, `Event: ${eventName}`);
    };
    
    container.querySelectorAll('.export-pdf, .export-csv').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const button = e.currentTarget || e.target.closest('.export-pdf, .export-csv');
            const eventId = button?.dataset.eventId;
            if (!eventId) {
                console.error('Event ID not found for export');
                return;
            }
            // Find event name from the card
            const eventCard = button.closest('.event-card');
            const eventName = eventCard?.querySelector('h3')?.textContent || 'Event';
            showEventExportModal(eventId, eventName);
        });
    });

    container.querySelectorAll('.view-contacts').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const button = e.currentTarget || e.target.closest('.view-contacts');
            const eventId = button?.dataset.eventId;
            const eventName = button?.dataset.eventName;
            if (!eventId) {
                console.error('Event ID not found for view contacts');
                return;
            }
            viewEventContacts(eventId, eventName);
        });
    });

    container.querySelectorAll('.edit-event').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const button = e.currentTarget || e.target.closest('.edit-event');
            const eventId = button?.dataset.eventId;
            if (!eventId) {
                console.error('Event ID not found for edit event');
                return;
            }
            await editEvent(eventId);
        });
    });

    container.querySelectorAll('.delete-event').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const button = e.currentTarget || e.target.closest('.delete-event');
            const eventId = button?.dataset.eventId;
            if (!eventId) {
                console.error('Event ID not found for delete event');
                return;
            }
            if (confirm('Are you sure you want to delete this event?')) {
                try {
                    await api.deleteEvent(eventId);
                    await loadEvents();
                    if (currentEvent && currentEvent.id === eventId) {
                        currentEvent = null;
                        localStorage.removeItem('currentEventId');
                        updateCurrentEventBanner();
                    }
                } catch (error) {
                    showToast('Failed to delete event: ' + error.message, 'error');
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
        showToast('Failed to load event for editing: ' + error.message, 'error');
    }
}

async function saveEvent() {
    const name = document.getElementById('eventName')?.value;
    const location = document.getElementById('eventLocation')?.value;
    const startDate = document.getElementById('eventStartDate')?.value;
    const endDate = document.getElementById('eventEndDate')?.value;
    const description = document.getElementById('eventDescription')?.value;

    if (!name || !location || !startDate || !endDate) {
        showToast('Please fill in all required fields', 'warning');
        return;
    }

    // Validate date range
    if (new Date(endDate) < new Date(startDate)) {
        showToast('End date must be on or after the start date', 'warning');
        return;
    }

        const eventData = {
            name,
            location,
            start_date: startDate,
            end_date: endDate,
            description: description || null,
        };
        
    try {
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
            showToast('Event updated successfully', 'success');
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
            showToast('Event created successfully', 'success');
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
            showToast('Failed to save event: ' + error.message, 'error');
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
    
    if (banner && nameEl) {
        // Always show the banner
        banner.style.display = 'block';
        
        if (currentEvent) {
            // Event is selected
            nameEl.textContent = currentEvent.name;
        if (unselectBtn) {
            unselectBtn.style.display = 'block';
        }
        } else {
            // No event selected
            nameEl.textContent = 'No event selected';
        if (unselectBtn) {
            unselectBtn.style.display = 'none';
            }
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

function viewEventContacts(eventId, eventName) {
    // Switch to contacts view
    switchView('contacts');
    
    // Set the event filter
    const eventFilter = document.getElementById('eventFilter');
    if (eventFilter) {
        eventFilter.value = eventId;
        updateClearFiltersButton();
    }
    
    // Load contacts with the filter applied
    loadContacts();
    
    // Show a toast notification
    showToast(`Showing contacts for "${eventName}"`, 'info', 3000);
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
    // Check authentication
    const currentUser = getCurrentUser();
    const token = getAuthToken();
    if (!currentUser || !token) {
        showAuthScreen();
        return;
    }
    
    try {
        const eventId = document.getElementById('eventFilter')?.value || 'all';
        const tagId = document.getElementById('tagFilter')?.value || 'all';
        const dateFilter = document.getElementById('dateFilter')?.value || 'all';
        const favoriteFilter = document.getElementById('favoriteFilter')?.checked || false;
        
        // Build filter params
        const filters = {};
        if (eventId !== 'all') filters.event_id = eventId;
        if (tagId !== 'all') filters.tag_id = tagId;
        
        // Handle favorite filter
        if (favoriteFilter) {
            filters.is_favorite = true;
        }
        
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
                <p class="contact-date">Met: ${formatDateTime(contact.meeting_date)}</p>
            </div>
            <div class="contact-actions-list" style="display: flex; gap: 8px; align-items: center;">
                <button class="icon-btn-action favorite-contact-btn ${contact.is_favorite ? 'favorite-active' : ''}" data-contact-id="${contact.id}" onclick="event.stopPropagation();" title="${contact.is_favorite ? 'Remove from favorites' : 'Add to favorites'}">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="${contact.is_favorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                </button>
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
            // Use currentTarget to get the button, not the SVG child
            const button = e.currentTarget;
            const contactId = button.dataset.contactId;
            const contactName = button.dataset.contactName;
            await openChatView(contactId, contactName);
        });
    });
    
    container.querySelectorAll('.favorite-contact-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const button = e.currentTarget;
            const contactId = button.dataset.contactId;
            
            try {
                const updatedContact = await api.toggleContactFavorite(contactId);
                // Update the button state
                if (updatedContact.is_favorite) {
                    button.classList.add('favorite-active');
                    button.querySelector('svg').setAttribute('fill', 'currentColor');
                    button.title = 'Remove from favorites';
                } else {
                    button.classList.remove('favorite-active');
                    button.querySelector('svg').setAttribute('fill', 'none');
                    button.title = 'Add to favorites';
                }
                // Reload contacts to reflect the change
                await loadContacts();
            } catch (error) {
                console.error('Error toggling favorite:', error);
                showToast('Failed to update favorite status', 'error');
            }
        });
    });
    
    container.querySelectorAll('.delete-contact-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            // Use currentTarget to get the button, not the SVG child
            const button = e.currentTarget;
            const contactId = button.dataset.contactId;
            const contactName = button.dataset.contactName;
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

function clearAllFilters() {
    // Reset all filter dropdowns to default
    const eventFilter = document.getElementById('eventFilter');
    const tagFilter = document.getElementById('tagFilter');
    const dateFilter = document.getElementById('dateFilter');
    const favoriteFilter = document.getElementById('favoriteFilter');
    const customDateRange = document.getElementById('customDateRange');
    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');
    
    if (eventFilter) eventFilter.value = 'all';
    if (tagFilter) tagFilter.value = 'all';
    if (dateFilter) dateFilter.value = 'all';
    if (favoriteFilter) favoriteFilter.checked = false;
    if (customDateRange) customDateRange.classList.add('hidden');
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    
    // Hide the clear button
    updateClearFiltersButton();
    
    // Reload contacts with no filters
    loadContacts();
}

function updateClearFiltersButton() {
    const clearBtn = document.getElementById('clearAllFiltersBtn');
    if (!clearBtn) return;
    
    const eventFilter = document.getElementById('eventFilter');
    const tagFilter = document.getElementById('tagFilter');
    const dateFilter = document.getElementById('dateFilter');
    const favoriteFilter = document.getElementById('favoriteFilter');
    
    // Show button if any filter is not set to 'all' or favorite is checked
    const hasFilters = 
        (eventFilter && eventFilter.value !== 'all') ||
        (tagFilter && tagFilter.value !== 'all') ||
        (dateFilter && dateFilter.value !== 'all') ||
        (favoriteFilter && favoriteFilter.checked);
    
    clearBtn.style.display = hasFilters ? 'block' : 'none';
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
                const vcard = await generateContactVCardWithPhoto(contact);
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

// Export modal state
let exportModalData = {
    ids: [],
    type: 'contacts', // 'contacts' or 'event'
    eventId: null
};

async function bulkExportContacts() {
    const selectedIds = getSelectedContactIds();
    if (selectedIds.length === 0) {
        showToast('Please select contacts to export', 'warning');
        return;
    }
    
    // Show export modal
    exportModalData.ids = selectedIds;
    exportModalData.type = 'contacts';
    showExportModal(selectedIds.length, 'Contacts');
}

function showExportModal(count, type) {
    const modal = document.getElementById('exportModal');
    const exportCount = document.getElementById('exportCount');
    const exportType = document.getElementById('exportType');
    const selectionDiv = document.querySelector('#exportModal .modal-body > div:first-child');
    const progressDiv = document.getElementById('exportProgress');
    const successDiv = document.getElementById('exportSuccess');
    const errorDiv = document.getElementById('exportError');
    
    // Reset state
    exportCount.textContent = count;
    exportType.textContent = type;
    selectionDiv.classList.remove('hidden');
    progressDiv.classList.add('hidden');
    successDiv.classList.add('hidden');
    errorDiv.classList.add('hidden');
    
    modal.classList.remove('hidden');
}

async function handleExportFormat(format) {
    const selectionDiv = document.querySelector('#exportModal .modal-body > div:first-child');
    const progressDiv = document.getElementById('exportProgress');
    const successDiv = document.getElementById('exportSuccess');
    const errorDiv = document.getElementById('exportError');
    const errorMessage = document.getElementById('exportErrorMessage');
    
    // Show progress
    selectionDiv.classList.add('hidden');
    progressDiv.classList.remove('hidden');
    
    try {
        if (exportModalData.type === 'contacts') {
            // Export contacts
            if (format === 'pdf') {
                await api.exportContactsPDF(exportModalData.ids);
            } else {
                await api.exportContactsCSV(exportModalData.ids);
            }
        } else {
            // Export event
            if (format === 'pdf') {
                await api.exportEventPDF(exportModalData.eventId);
            } else {
                await api.exportEventCSV(exportModalData.eventId);
            }
        }
        
        // Show success
        progressDiv.classList.add('hidden');
        successDiv.classList.remove('hidden');
        
    } catch (error) {
        console.error('Export error:', error);
        // Show error
        progressDiv.classList.add('hidden');
        errorDiv.classList.remove('hidden');
        errorMessage.textContent = error.message || 'Failed to generate export. Please try again.';
    }
}

async function bulkAddTagToContacts() {
    const selectedIds = getSelectedContactIds();
    if (selectedIds.length === 0) {
        showToast('Please select contacts to tag', 'warning');
        return;
    }
    
    try {
        // Load available tags
        const tags = await api.getTags(false);
        
        // Show bulk tag modal
        const modal = document.getElementById('bulkTagModal');
        const countEl = document.getElementById('bulkTagCount');
        const tagsList = document.getElementById('bulkTagsList');
        const newTagInput = document.getElementById('bulkNewTagInput');
        
        if (!modal || !countEl || !tagsList || !newTagInput) return;
        
        countEl.textContent = selectedIds.length;
        newTagInput.value = '';
        
        // Populate tags as clickable badges (inline, wrapping across lines)
        tagsList.innerHTML = '';
        
        if (tags.length > 0) {
            // Create a flex container for inline tags that wrap
            const flexContainer = document.createElement('div');
            flexContainer.className = 'bulk-tags-flex';
            flexContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 6px; align-items: center;';
            
            for (const tag of tags) {
                const color = getTagColor(tag.name);
                
                // Create clickable tag badge
                const tagBadge = document.createElement('button');
                tagBadge.type = 'button';
                tagBadge.className = 'bulk-tag-badge-clickable';
                tagBadge.dataset.tagId = tag.id;
                tagBadge.dataset.tagName = tag.name;
                tagBadge.textContent = tag.name;
                tagBadge.style.cssText = `
                    padding: 2px 6px;
                    border-radius: 8px;
                    border: 1px solid ${color.border};
                    background: ${color.bg};
                    color: ${color.text};
                    font-size: 10px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    white-space: nowrap;
                    position: relative;
                `;
                
                // Track selected state
                tagBadge.dataset.selected = 'false';
                
                // Click handler to toggle selection
                tagBadge.addEventListener('click', () => {
                    const isSelected = tagBadge.dataset.selected === 'true';
                    tagBadge.dataset.selected = isSelected ? 'false' : 'true';
                    
                    if (isSelected) {
                        // Deselect - restore original styling
                        tagBadge.style.background = color.bg;
                        tagBadge.style.borderColor = color.border;
                        tagBadge.style.color = color.text;
                        tagBadge.style.transform = 'scale(1)';
                        tagBadge.style.boxShadow = 'none';
                    } else {
                        // Select - use darker border and shadow, keep text visible
                        tagBadge.style.background = color.bg;
                        tagBadge.style.borderColor = color.text;
                        tagBadge.style.borderWidth = '2px';
                        tagBadge.style.color = color.text;
                        tagBadge.style.transform = 'scale(1.05)';
                        tagBadge.style.boxShadow = `0 2px 6px ${color.text}40`;
                    }
                });
                
                // Hover effects
                tagBadge.addEventListener('mouseenter', () => {
                    if (tagBadge.dataset.selected !== 'true') {
                        tagBadge.style.transform = 'scale(1.05)';
                        tagBadge.style.boxShadow = '0 2px 6px rgba(0,0,0,0.1)';
                    }
                });
                
                tagBadge.addEventListener('mouseleave', () => {
                    if (tagBadge.dataset.selected !== 'true') {
                        tagBadge.style.transform = 'scale(1)';
                        tagBadge.style.boxShadow = 'none';
                    }
                });
                
                flexContainer.appendChild(tagBadge);
            }
            
            tagsList.appendChild(flexContainer);
        } else {
            tagsList.innerHTML = '<p style="color: #666; font-size: 14px; padding: 12px; text-align: center;">No tags available. Create a new tag below.</p>';
        }
        
        modal.classList.remove('hidden');
    } catch (error) {
        showToast('Failed to load tags: ' + error.message, 'error');
    }
}

async function addBulkTags() {
    const selectedIds = getSelectedContactIds();
    const tagsList = document.getElementById('bulkTagsList');
    const newTagInput = document.getElementById('bulkNewTagInput');
    
    if (!tagsList || !newTagInput) {
        showToast('Error: Tag management elements not found', 'error');
        return;
    }
    
    if (selectedIds.length === 0) {
        showToast('Please select contacts first', 'warning');
        return;
    }
    
    try {
        // Get selected tags from clickable badges
        const selectedBadges = tagsList.querySelectorAll('.bulk-tag-badge-clickable[data-selected="true"]');
        const selectedTagNames = Array.from(selectedBadges).map(badge => badge.dataset.tagName);
        
        // Add new tag if provided
        const newTagName = newTagInput.value.trim();
        if (newTagName) {
            try {
                await api.createTag(newTagName);
                selectedTagNames.push(newTagName);
            } catch (error) {
                showToast('Failed to create new tag: ' + error.message, 'error');
                return;
            }
        }
        
        if (selectedTagNames.length === 0) {
            showToast('Please select or create at least one tag', 'warning');
            return;
        }
        
        // Disable button and show loading
        const addBtn = document.getElementById('addBulkTagsBtn');
        const originalText = addBtn?.textContent || 'Add Tags';
        if (addBtn) {
            addBtn.disabled = true;
            addBtn.textContent = 'Adding...';
        }
        
        // Add tags to all selected contacts
        let successCount = 0;
        let errorCount = 0;
        
        for (const contactId of selectedIds) {
            try {
                const contact = await api.getContact(contactId);
                const currentTags = contact.tags?.map(t => t.name || t) || [];
                
                // Merge selected tags with existing tags (no duplicates)
                const mergedTags = [...new Set([...currentTags, ...selectedTagNames])];
                
                await api.updateContact(contactId, { tags: mergedTags }, null, []);
                        successCount++;
            } catch (error) {
                console.error(`Failed to add tags to contact ${contactId}:`, error);
                errorCount++;
            }
        }
        
        // Re-enable button
        if (addBtn) {
            addBtn.disabled = false;
            addBtn.textContent = originalText;
        }
        
        if (errorCount > 0) {
            showToast(`Added tags to ${successCount} of ${selectedIds.length} contacts. ${errorCount} failed.`, 'warning');
        } else {
            showToast(`Successfully added tags to ${successCount} contact${successCount !== 1 ? 's' : ''}`, 'success');
        }
        
        // Close modal and reload contacts
        document.getElementById('bulkTagModal')?.classList.add('hidden');
        await loadContacts();
    } catch (error) {
        console.error('Error adding bulk tags:', error);
        showToast('Failed to add tags: ' + (error.message || 'Unknown error'), 'error');
        
        // Re-enable button on error
        const addBtn = document.getElementById('addBulkTagsBtn');
        if (addBtn) {
            addBtn.disabled = false;
            addBtn.textContent = 'Add Tags';
        }
    }
}

async function removeBulkTags() {
    const selectedIds = getSelectedContactIds();
    const tagsList = document.getElementById('bulkTagsList');
    
    if (!tagsList) {
        showToast('Error: Tag management elements not found', 'error');
        return;
    }
    
    if (selectedIds.length === 0) {
        showToast('Please select contacts first', 'warning');
        return;
    }
    
    try {
        // Get selected tags from clickable badges
        const selectedBadges = tagsList.querySelectorAll('.bulk-tag-badge-clickable[data-selected="true"]');
        const selectedTagNames = Array.from(selectedBadges).map(badge => badge.dataset.tagName);
        
        if (selectedTagNames.length === 0) {
            showToast('Please select at least one tag to remove', 'warning');
            return;
        }
        
        // Disable button and show loading
        const removeBtn = document.getElementById('removeBulkTagsBtn');
        const originalText = removeBtn?.textContent || 'Remove Tags';
        if (removeBtn) {
            removeBtn.disabled = true;
            removeBtn.textContent = 'Removing...';
        }
        
        // Remove tags from all selected contacts
        let successCount = 0;
        let errorCount = 0;
        
        for (const contactId of selectedIds) {
            try {
                const contact = await api.getContact(contactId);
                const currentTags = contact.tags?.map(t => t.name || t) || [];
                
                // Remove selected tags from existing tags
                const remainingTags = currentTags.filter(tag => !selectedTagNames.includes(tag));
                
                await api.updateContact(contactId, { tags: remainingTags }, null, []);
                successCount++;
            } catch (error) {
                console.error(`Failed to remove tags from contact ${contactId}:`, error);
                errorCount++;
            }
        }
        
        // Re-enable button
        if (removeBtn) {
            removeBtn.disabled = false;
            removeBtn.textContent = originalText;
        }
        
        if (errorCount > 0) {
            showToast(`Removed tags from ${successCount} of ${selectedIds.length} contacts. ${errorCount} failed.`, 'warning');
        } else {
            showToast(`Successfully removed tags from ${successCount} contact${successCount !== 1 ? 's' : ''}`, 'success');
        }
        
        // Close modal and reload contacts
        document.getElementById('bulkTagModal')?.classList.add('hidden');
        await loadContacts();
    } catch (error) {
        console.error('Error removing bulk tags:', error);
        showToast('Failed to remove tags: ' + (error.message || 'Unknown error'), 'error');
        
        // Re-enable button on error
        const removeBtn = document.getElementById('removeBulkTagsBtn');
        if (removeBtn) {
            removeBtn.disabled = false;
            removeBtn.textContent = 'Remove Tags';
        }
    }
}

async function bulkAddEventToContacts() {
    const selectedIds = getSelectedContactIds();
    if (selectedIds.length === 0) {
        showToast('Please select contacts first', 'warning');
        return;
    }
    
    try {
        // Load available events
        const events = await api.getEvents();
        if (events.length === 0) {
            showToast('No events available. Please create an event first.', 'warning');
            return;
        }
        
        // Show event selection dialog
        const eventNames = events.map(e => `${e.name} (${e.location})`).join('\n');
        const eventName = prompt(
            `Select an event to assign to ${selectedIds.length} contact(s):\n\nAvailable events:\n${eventNames}\n\nEnter event name:`
        );
        
        if (!eventName || !eventName.trim()) return;
        
        const trimmedName = eventName.trim();
        const selectedEvent = events.find(e => e.name.toLowerCase() === trimmedName.toLowerCase());
        
        if (!selectedEvent) {
            showToast(`Event "${trimmedName}" not found.`, 'error');
            return;
        }
        
        // Update all selected contacts
        let successCount = 0;
        for (const contactId of selectedIds) {
            try {
                await api.updateContact(contactId, { event_id: selectedEvent.id }, null, []);
                successCount++;
            } catch (error) {
                console.error(`Failed to add event to contact ${contactId}:`, error);
            }
        }
        
        showToast(`Added event "${selectedEvent.name}" to ${successCount} of ${selectedIds.length} contacts`, 'success');
        
        // Reload contacts
        await loadContacts();
    } catch (error) {
        showToast('Failed to update events: ' + error.message, 'error');
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

// Helper function to get country code select HTML
function getCountryCodeSelectHTML(selectedCode = '+91', index = 0) {
    const countryCodes = [
        {value: '+1', flag: '🇺🇸', name: 'US'}, {value: '+44', flag: '🇬🇧', name: 'UK'},
        {value: '+91', flag: '🇮🇳', name: 'IN'}, {value: '+86', flag: '🇨🇳', name: 'CN'},
        {value: '+81', flag: '🇯🇵', name: 'JP'}, {value: '+49', flag: '🇩🇪', name: 'DE'},
        {value: '+33', flag: '🇫🇷', name: 'FR'}, {value: '+39', flag: '🇮🇹', name: 'IT'},
        {value: '+34', flag: '🇪🇸', name: 'ES'}, {value: '+61', flag: '🇦🇺', name: 'AU'},
        {value: '+55', flag: '🇧🇷', name: 'BR'}, {value: '+52', flag: '🇲🇽', name: 'MX'},
        {value: '+971', flag: '🇦🇪', name: 'AE'}, {value: '+966', flag: '🇸🇦', name: 'SA'},
        {value: '+65', flag: '🇸🇬', name: 'SG'}, {value: '+60', flag: '🇲🇾', name: 'MY'},
        {value: '+62', flag: '🇮🇩', name: 'ID'}, {value: '+66', flag: '🇹🇭', name: 'TH'},
        {value: '+84', flag: '🇻🇳', name: 'VN'}, {value: '+82', flag: '🇰🇷', name: 'KR'},
        {value: '+27', flag: '🇿🇦', name: 'ZA'}, {value: '+20', flag: '🇪🇬', name: 'EG'},
        {value: '+234', flag: '🇳🇬', name: 'NG'}, {value: '+254', flag: '🇰🇪', name: 'KE'},
        {value: '+212', flag: '🇲🇦', name: 'MA'}, {value: '+7', flag: '🇷🇺', name: 'RU'},
        {value: '+90', flag: '🇹🇷', name: 'TR'}, {value: '+92', flag: '🇵🇰', name: 'PK'},
        {value: '+880', flag: '🇧🇩', name: 'BD'}, {value: '+94', flag: '🇱🇰', name: 'LK'},
        {value: '+977', flag: '🇳🇵', name: 'NP'}, {value: '+95', flag: '🇲🇲', name: 'MM'},
        {value: '+855', flag: '🇰🇭', name: 'KH'}, {value: '+856', flag: '🇱🇦', name: 'LA'},
        {value: '+673', flag: '🇧🇳', name: 'BN'}, {value: '+670', flag: '🇹🇱', name: 'TL'},
        {value: '+64', flag: '🇳🇿', name: 'NZ'}, {value: '+886', flag: '🇹🇼', name: 'TW'},
        {value: '+852', flag: '🇭🇰', name: 'HK'}, {value: '+853', flag: '🇲🇴', name: 'MO'}
    ];
    
    let optionsHTML = countryCodes.map(cc => 
        `<option value="${cc.value}" ${cc.value === selectedCode ? 'selected' : ''}>${cc.flag} ${cc.value}</option>`
    ).join('');
    
    return `<select class="contact-country-code input-field" style="width: 120px; flex-shrink: 0;" data-index="${index}">${optionsHTML}</select>`;
}

// Add a phone number field
function addPhoneNumberField(number = '', isWhatsapp = true, index = null) {
    const container = document.getElementById('phoneNumbersContainer');
    if (!container) return;
    
    const currentCount = container.querySelectorAll('.phone-number-row').length;
    if (currentCount >= 3) {
        showToast('Maximum 3 phone numbers allowed', 'error');
        return;
    }
    
    const idx = index !== null ? index : currentCount;
    const row = document.createElement('div');
    row.className = 'phone-number-row';
    row.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-bottom: 8px;';
    
    // Parse number to extract country code if it starts with +
    let countryCode = '+91';
    let phoneNumber = number;
    if (number && number.startsWith('+')) {
        const codes = ['+1', '+44', '+91', '+86', '+81', '+49', '+33', '+39', '+34', '+61', '+55', '+52', '+971', '+966', '+65', '+60', '+62', '+66', '+84', '+82', '+27', '+20', '+234', '+254', '+212', '+7', '+90', '+92', '+880', '+94', '+977', '+95', '+855', '+856', '+673', '+670', '+64', '+679', '+678', '+685', '+676', '+687', '+689', '+691', '+692', '+850', '+886', '+852', '+853'];
        for (const code of codes) {
            if (number.startsWith(code)) {
                countryCode = code;
                phoneNumber = number.substring(code.length).trim();
                break;
            }
        }
    }
    
    row.innerHTML = `
        ${getCountryCodeSelectHTML(countryCode, idx)}
        <input type="tel" class="contact-phone-number input-field" style="flex: 1;" placeholder="Phone number" data-index="${idx}" value="${phoneNumber}">
        <label style="display: flex; align-items: center; gap: 4px; white-space: nowrap; font-size: 13px; cursor: pointer;">
            <input type="checkbox" class="contact-phone-whatsapp" data-index="${idx}" ${isWhatsapp ? 'checked' : ''}>
            <span>WhatsApp</span>
        </label>
        <button type="button" class="remove-phone-btn icon-btn-action" data-index="${idx}" style="flex-shrink: 0;" title="Remove">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;
    
    container.appendChild(row);
    updateAddPhoneButton();
    
    // Add remove button handler
    row.querySelector('.remove-phone-btn')?.addEventListener('click', () => {
        row.remove();
        updateAddPhoneButton();
    });
}

// Add an email field
function addEmailField(address = '', index = null) {
    const container = document.getElementById('emailAddressesContainer');
    if (!container) return;
    
    const currentCount = container.querySelectorAll('.email-address-row').length;
    if (currentCount >= 3) {
        showToast('Maximum 3 email addresses allowed', 'error');
        return;
    }
    
    const idx = index !== null ? index : currentCount;
    const row = document.createElement('div');
    row.className = 'email-address-row';
    row.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-bottom: 8px;';
    
    row.innerHTML = `
        <input type="email" class="contact-email-address input-field" style="flex: 1;" placeholder="Email address" data-index="${idx}" value="${address}">
        <button type="button" class="remove-email-btn icon-btn-action" data-index="${idx}" style="flex-shrink: 0;" title="Remove">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;
    
    container.appendChild(row);
    updateAddEmailButton();
    
    // Add remove button handler
    row.querySelector('.remove-email-btn')?.addEventListener('click', () => {
        row.remove();
        updateAddEmailButton();
    });
}

// Update add phone button visibility
function updateAddPhoneButton() {
    const container = document.getElementById('phoneNumbersContainer');
    const addBtn = document.getElementById('addPhoneBtn');
    if (container && addBtn) {
        const count = container.querySelectorAll('.phone-number-row').length;
        addBtn.style.display = count < 3 ? 'block' : 'none';
    }
}

// Update add email button visibility
function updateAddEmailButton() {
    const container = document.getElementById('emailAddressesContainer');
    const addBtn = document.getElementById('addEmailBtn');
    if (container && addBtn) {
        const count = container.querySelectorAll('.email-address-row').length;
        addBtn.style.display = count < 3 ? 'block' : 'none';
    }
}

// Clear phone numbers and emails
function clearPhoneNumbersAndEmails() {
    const phoneContainer = document.getElementById('phoneNumbersContainer');
    const emailContainer = document.getElementById('emailAddressesContainer');
    if (phoneContainer) phoneContainer.innerHTML = '';
    if (emailContainer) emailContainer.innerHTML = '';
    updateAddPhoneButton();
    updateAddEmailButton();
}

// Initialize form with empty phone/email fields
function initializeContactForm() {
    clearPhoneNumbersAndEmails();
    // Add one empty phone number field and one empty email field
    addPhoneNumberField('', true, 0);
    addEmailField('', 0);
}

async function openContactModal(contactData = null) {
    const modal = document.getElementById('contactModal');
    if (!modal) return;
    
    editingContactId = contactData ? contactData.id : null;
    
    // Update modal title
    const modalTitle = modal.querySelector('.modal-header h3');
    if (modalTitle) {
        modalTitle.textContent = editingContactId ? 'Edit Contact' : 'Add Contact';
    }
    
    // Initialize form
    initializeContactForm();
    
    // Clear or fill form
    if (contactData) {
        // Fill form with contact data
        document.getElementById('contactName').value = contactData.name || '';
        document.getElementById('contactRole').value = contactData.role_company || '';
        
        // Fill phone numbers
        clearPhoneNumbersAndEmails();
        const phoneNumbers = contactData.phone_numbers || [];
        if (phoneNumbers.length > 0) {
            phoneNumbers.forEach((phone, idx) => {
                addPhoneNumberField(phone.number || '', phone.is_whatsapp !== false, idx);
            });
        } else if (contactData.mobile) {
            // Fallback to deprecated mobile field
            addPhoneNumberField(contactData.mobile, true, 0);
        } else {
            addPhoneNumberField('', true, 0);
        }
        
        // Fill email addresses
        const emailAddresses = contactData.email_addresses || [];
        if (emailAddresses.length > 0) {
            emailAddresses.forEach((email, idx) => {
                addEmailField(email.address || email, idx);
            });
        } else if (contactData.email) {
            // Fallback to deprecated email field
            addEmailField(contactData.email, 0);
        } else {
            addEmailField('', 0);
        }
        
        document.getElementById('contactLinkedIn').value = contactData.linkedin_url || '';
        document.getElementById('contactWebsite').value = contactData.website || '';
        
        // Handle meeting context - add pplai.app metadata if from QR/shared profile
        let meetingContext = contactData.meeting_context || contactData.about_me || '';
        
        // Check if this contact is from a QR scan or shared profile
        if (contactData.fromPplaiProfile && contactData.pplaiProfileUrl) {
            // Format current date
            const now = new Date();
            const dateMet = now.toISOString().split('T')[0]; // YYYY-MM-DD
            const dateMetReadable = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            
            // Build pplai.app metadata
            const pplaiMetadata = `Met on pplai.app: ${dateMetReadable} (${dateMet})\npplai.app Profile: ${contactData.pplaiProfileUrl}`;
            
            // Add to meeting context if not already present
            if (!meetingContext.includes('Met on pplai.app') && !meetingContext.includes('pplai.app Profile:')) {
                if (meetingContext) {
                    meetingContext = `${meetingContext}\n\n${pplaiMetadata}`;
                } else {
                    meetingContext = pplaiMetadata;
                }
            } else if (!meetingContext.includes('Met on pplai.app')) {
                // Add date if profile link exists but date doesn't
                const dateLine = `Met on pplai.app: ${dateMetReadable} (${dateMet})`;
                if (meetingContext) {
                    meetingContext = `${meetingContext}\n\n${dateLine}`;
                } else {
                    meetingContext = dateLine;
                }
            } else if (!meetingContext.includes('pplai.app Profile:')) {
                // Add profile link if date exists but link doesn't
                const profileLine = `pplai.app Profile: ${contactData.pplaiProfileUrl}`;
                if (meetingContext) {
                    meetingContext = `${meetingContext}\n\n${profileLine}`;
                } else {
                    meetingContext = profileLine;
                }
            }
        }
        
        document.getElementById('contactContext').value = meetingContext;
        
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
        document.getElementById('contactWebsite').value = '';
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

// Handle AI-powered follow-up actions (email, WhatsApp, SMS)
async function handleAiFollowup(contactId, contact, type) {
    try {
        // Check if contact is saved (has contactId)
        if (!contactId) {
            // Check if user is logged in
            const currentUser = getCurrentUser();
            if (!currentUser) {
                showToast('🔐 Please login first to use AI follow-up features', 'error');
                // Show auth screen after a short delay
                setTimeout(() => {
                    if (typeof showAuthScreen === 'function') {
                        showAuthScreen();
                    }
                }, 1500);
                return;
            }
            
            // User is logged in but contact not saved
            showToast('💾 Please save this contact first to use AI follow-up', 'error');
            // Show save button if available
            const saveBtn = document.getElementById('saveContactFromViewBtn');
            if (saveBtn) {
                saveBtn.style.display = 'block';
                // Scroll to save button
                saveBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
        }
        
        showToast('✨ Generating AI follow-up...', 'info');
        
        // Fetch AI-generated follow-ups (also invalidates contact cache)
        const followupData = await api.getContactFollowups(contactId);
        
        if (!followupData || !followupData.followups) {
            showToast('❌ No AI suggestions available', 'error');
            return;
        }

        // Update current contact summary in UI/cache if new summary provided
        if (followupData.summary) {
            currentViewingContact.ai_summary = followupData.summary;
            
            // Update contacts array so list reflects fresh summary
            if (Array.isArray(allContacts) && allContacts.length) {
                const idx = allContacts.findIndex(c => c.id === contactId);
                if (idx !== -1) {
                    allContacts[idx] = {
                        ...allContacts[idx],
                        ai_summary: followupData.summary
                    };
                    // Re-render list with updated summary
                    filterContactsBySearch();
                }
            }
            
            const aiSummaryItem = document.getElementById('contactViewAiSummaryItem');
            const aiSummaryEl = document.getElementById('contactViewAiSummary');
            if (aiSummaryItem && aiSummaryEl) {
                aiSummaryEl.textContent = followupData.summary;
                aiSummaryItem.style.display = 'block';
            }
        }
        
        const followup = followupData.followups[type];
        
        if (!followup) {
            showToast(`❌ No ${type} template available`, 'error');
            return;
        }
        
        // Handle different follow-up types
        switch(type) {
            case 'email':
                handleAiEmail(contact, followup);
                break;
            case 'whatsapp':
                handleAiWhatsApp(contact, followup);
                break;
            case 'sms':
                handleAiSms(contact, followup);
                break;
        }
        
        showToast(`✨ AI ${type} ready!`, 'success');
        
    } catch (error) {
        console.error('Error getting AI follow-up:', error);
        
        // Handle 404 error - contact not found
        if (error.message && (error.message.includes('404') || error.message.includes('Not Found') || error.message.includes('not found'))) {
            const currentUser = getCurrentUser();
            if (!currentUser) {
                showToast('🔐 Please login first to use AI follow-up features', 'error');
                setTimeout(() => {
                    if (typeof showAuthScreen === 'function') {
                        showAuthScreen();
                    }
                }, 1500);
            } else {
                showToast('💾 Please save this contact first to use AI follow-up', 'error');
                const saveBtn = document.getElementById('saveContactFromViewBtn');
                if (saveBtn) {
                    saveBtn.style.display = 'block';
                    saveBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        } else {
        showToast(`❌ Failed to generate ${type}`, 'error');
        }
    }
}

// Handle AI-generated email
function handleAiEmail(contact, emailTemplate) {
    // Extract subject and body from template
    let subject = 'Follow-up';
    let body = emailTemplate;
    
    // Parse subject if present
    const subjectMatch = emailTemplate.match(/Subject:\s*(.+?)(\n|$)/i);
    if (subjectMatch) {
        subject = subjectMatch[1].trim();
        body = emailTemplate.replace(/Subject:\s*(.+?)(\n|$)/i, '').trim();
    }
    
    // Create mailto link
    const mailtoUrl = `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    // Open email client
    window.open(mailtoUrl, '_blank');
}

// Handle AI-generated WhatsApp message
function handleAiWhatsApp(contact, message) {
    // Format phone number (remove spaces, dashes, etc.)
    const phone = contact.mobile.replace(/[^\d+]/g, '');
    
    // Create WhatsApp URL
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    
    // Open WhatsApp
    window.open(whatsappUrl, '_blank');
}

// Handle AI-generated SMS
function handleAiSms(contact, message) {
    // Format phone number
    const phone = contact.mobile.replace(/[^\d+]/g, '');
    
    // Create SMS URL (works on mobile devices)
    const smsUrl = `sms:${phone}?body=${encodeURIComponent(message)}`;
    
    // Open SMS app
    window.open(smsUrl, '_blank');
}

async function saveContactFromView() {
    if (!currentViewingContact) {
        alert('No contact to save');
        return;
    }
    
    // Check if user is logged in
    const currentUser = getCurrentUser();
    if (!currentUser) {
        // Store contact data to resume after login
        sessionStorage.setItem('pendingContactSave', JSON.stringify(currentViewingContact));
        showToast('🔐 Please login first to save contacts', 'error');
        setTimeout(() => {
            if (typeof showAuthScreen === 'function') {
                showAuthScreen();
            }
        }, 1500);
        return;
    }
    
    // Close the view modal
    document.getElementById('contactViewModal')?.classList.add('hidden');
    
    // Open the contact form with the current contact data
    await openContactModal(currentViewingContact);
}

async function saveContact() {
    const name = document.getElementById('contactName')?.value;
    const role = document.getElementById('contactRole')?.value;
    const company = document.getElementById('contactCompany')?.value;
    const website = document.getElementById('contactWebsite')?.value;
    const linkedin = document.getElementById('contactLinkedIn')?.value;
    const context = document.getElementById('contactContext')?.value;
    
    // Collect phone numbers from form
    const phoneNumberRows = document.querySelectorAll('.phone-number-row');
    const phoneNumbers = [];
    phoneNumberRows.forEach(row => {
        const countryCodeSelect = row.querySelector('.contact-country-code');
        const phoneInput = row.querySelector('.contact-phone-number');
        const whatsappCheckbox = row.querySelector('.contact-phone-whatsapp');
        
        if (phoneInput && phoneInput.value.trim()) {
            const countryCode = countryCodeSelect?.value || '+91';
            const phoneNumber = phoneInput.value.trim();
            const fullNumber = phoneNumber.startsWith('+') ? phoneNumber : `${countryCode}${phoneNumber}`;
            phoneNumbers.push({
                number: fullNumber,
                is_whatsapp: whatsappCheckbox ? whatsappCheckbox.checked : true
            });
        }
    });
    
    // Collect email addresses from form
    const emailRows = document.querySelectorAll('.email-address-row');
    const emailAddresses = [];
    emailRows.forEach(row => {
        const emailInput = row.querySelector('.contact-email-address');
        if (emailInput && emailInput.value.trim()) {
            emailAddresses.push({
                address: emailInput.value.trim()
            });
        }
    });
    
    // For backward compatibility and duplicate checking, keep first phone/email
    const mobile = phoneNumbers.length > 0 ? phoneNumbers[0].number : null;
    const email = emailAddresses.length > 0 ? emailAddresses[0].address : null;
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
            email: email || null,  // Deprecated field for backward compatibility
            email_addresses: JSON.stringify(emailAddresses),
            role_company: role || null,
            company: company || null,
            website: website || null,
            mobile: mobile || null,  // Deprecated field for backward compatibility
            phone_numbers: JSON.stringify(phoneNumbers),
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
    
    // Show/hide action buttons
    const editBtn = document.getElementById('editContactBtn');
    if (editBtn) {
        editBtn.style.display = isOwnProfile ? 'none' : 'block';
    }
    
    const deleteBtn = document.getElementById('deleteContactBtn');
    if (deleteBtn) {
        deleteBtn.style.display = isOwnProfile ? 'none' : 'block';
    }
    
    // Show AI follow-up buttons only for contacts (not own profile)
    const emailActionsItem = document.getElementById('contactViewEmailActionsItem');
    const aiEmailBtn = document.getElementById('aiEmailBtn');
    const aiWhatsAppBtn = document.getElementById('aiWhatsAppBtn');
    const aiSmsBtn = document.getElementById('aiSmsBtn');
    
    if (emailActionsItem && aiEmailBtn && aiWhatsAppBtn && aiSmsBtn) {
        // Check for email and phone in both old and new formats
        const hasEmail = data.email || (data.email_addresses && data.email_addresses.length > 0);
        const hasPhone = data.mobile || (data.phone_numbers && data.phone_numbers.length > 0);
        
        // Show container if contact has email or phone (and not own profile)
        const showAiButtons = !isOwnProfile && (hasEmail || hasPhone);
        
        if (showAiButtons) {
            emailActionsItem.style.display = 'block';
            // Show AI Email only if contact has email
            aiEmailBtn.style.display = hasEmail ? 'inline-flex' : 'none';
            // Show AI WhatsApp and SMS if contact has phone
            aiWhatsAppBtn.style.display = hasPhone ? 'inline-flex' : 'none';
            aiSmsBtn.style.display = hasPhone ? 'inline-flex' : 'none';
        } else {
            emailActionsItem.style.display = 'none';
            aiEmailBtn.style.display = 'none';
            aiWhatsAppBtn.style.display = 'none';
            aiSmsBtn.style.display = 'none';
        }
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
    
    // Email Addresses (multiple)
    const emailsItem = document.getElementById('contactViewEmailsItem');
    const emailAddresses = data.email_addresses || [];
    const hasEmails = emailAddresses.length > 0 || data.email;
    
    if (emailsItem) {
        const emailsContainer = document.getElementById('contactViewEmailsList');
        if (!emailsContainer) {
            console.error('contactViewEmailsList container not found');
        }
        if (emailsContainer) {
            emailsContainer.innerHTML = '';
            
            if (emailAddresses.length > 0) {
                emailAddresses.forEach((email) => {
                    const emailAddr = email.address || email;
                    if (emailAddr) {
                        const emailRow = document.createElement('div');
                        emailRow.style.cssText = 'display: flex; align-items: center; gap: 8px; justify-content: space-between;';
                        emailRow.innerHTML = `
                            <span class="detail-value">${emailAddr}</span>
                            ${!isOwnProfile ? `
                                <button class="email-action-btn contact-action-btn-small" data-email="${emailAddr}" title="Email">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                        <polyline points="22,6 12,13 2,6"></polyline>
                                    </svg>
                                </button>
                            ` : ''}
                        `;
                        emailsContainer.appendChild(emailRow);
                        
                        const emailBtn = emailRow.querySelector('.email-action-btn');
                        if (emailBtn) {
                            emailBtn.addEventListener('click', () => {
                                window.location.href = `mailto:${emailAddr}`;
                            });
                        }
                    }
                });
            } else if (data.email) {
                // Fallback to deprecated email field
                const emailRow = document.createElement('div');
                emailRow.style.cssText = 'display: flex; align-items: center; gap: 8px; justify-content: space-between;';
                emailRow.innerHTML = `
                    <span class="detail-value">${data.email}</span>
                    ${!isOwnProfile ? `
                        <button class="email-action-btn contact-action-btn-small" data-email="${data.email}" title="Email">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                <polyline points="22,6 12,13 2,6"></polyline>
                            </svg>
                        </button>
                    ` : ''}
                `;
                emailsContainer.appendChild(emailRow);
                
                const emailBtn = emailRow.querySelector('.email-action-btn');
                if (emailBtn) {
                    emailBtn.addEventListener('click', () => {
                        window.location.href = `mailto:${data.email}`;
                    });
                }
            }
            
            emailsItem.style.display = hasEmails ? 'flex' : 'none';
        }
    }
    
    // Phone Numbers (multiple)
    const phonesItem = document.getElementById('contactViewPhonesItem');
    const phoneNumbers = data.phone_numbers || [];
    const hasPhones = phoneNumbers.length > 0 || data.mobile;
    
    if (phonesItem) {
        const phonesContainer = document.getElementById('contactViewPhonesList');
        if (phonesContainer) {
            phonesContainer.innerHTML = '';
            
            if (phoneNumbers.length > 0) {
                phoneNumbers.forEach((phone) => {
                    const phoneNumber = phone.number || phone;
                    if (phoneNumber) {
                        const phoneRow = document.createElement('div');
                        phoneRow.style.cssText = 'display: flex; align-items: center; gap: 8px; justify-content: space-between;';
                        
                        const isWhatsapp = phone.is_whatsapp !== false;
                        
                        phoneRow.innerHTML = `
                            <span class="detail-value">${phoneNumber}</span>
                            ${!isOwnProfile ? `
                                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                                    <button class="call-action-btn contact-action-btn-small" data-phone="${phoneNumber}" title="Call">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                                        </svg>
                                    </button>
                                    <button class="message-action-btn contact-action-btn-small" data-phone="${phoneNumber}" title="Message">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                        </svg>
                                    </button>
                                    ${isWhatsapp ? `
                                        <button class="whatsapp-action-btn contact-action-btn-small" data-phone="${phoneNumber}" title="WhatsApp">
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                                        </svg>
                                    </button>
                                    ` : ''}
                                </div>
                            ` : ''}
                        `;
                        phonesContainer.appendChild(phoneRow);
                        
                        const callBtn = phoneRow.querySelector('.call-action-btn');
                        const messageBtn = phoneRow.querySelector('.message-action-btn');
                        const whatsappBtn = phoneRow.querySelector('.whatsapp-action-btn');
                        
                        if (callBtn) {
                            callBtn.addEventListener('click', () => {
                                window.location.href = `tel:${phoneNumber}`;
                            });
                        }
                        if (messageBtn) {
                            messageBtn.addEventListener('click', () => {
                                window.location.href = `sms:${phoneNumber}`;
                            });
                        }
                        if (whatsappBtn) {
                            whatsappBtn.style.color = '#25D366';
                            whatsappBtn.addEventListener('click', () => {
                                const cleanPhone = phoneNumber.replace(/[^\d+]/g, '');
                                window.open(`https://wa.me/${cleanPhone}`, '_blank');
                            });
                        }
                    }
                });
            } else if (data.mobile) {
                // Fallback to deprecated mobile field (assume WhatsApp by default for backward compatibility)
                const phoneRow = document.createElement('div');
                phoneRow.style.cssText = 'display: flex; align-items: center; gap: 8px; justify-content: space-between;';
                phoneRow.innerHTML = `
                    <span class="detail-value">${data.mobile}</span>
                    ${!isOwnProfile ? `
                        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                            <button class="call-action-btn contact-action-btn-small" data-phone="${data.mobile}" title="Call">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                                </svg>
                            </button>
                            <button class="message-action-btn contact-action-btn-small" data-phone="${data.mobile}" title="Message">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                </svg>
                            </button>
                            <button class="whatsapp-action-btn contact-action-btn-small" data-phone="${data.mobile}" title="WhatsApp">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                                </svg>
                            </button>
                        </div>
                    ` : ''}
                `;
                phonesContainer.appendChild(phoneRow);
                
                const callBtn = phoneRow.querySelector('.call-action-btn');
                const messageBtn = phoneRow.querySelector('.message-action-btn');
                const whatsappBtn = phoneRow.querySelector('.whatsapp-action-btn');
                
                if (callBtn) callBtn.addEventListener('click', () => window.location.href = `tel:${data.mobile}`);
                if (messageBtn) messageBtn.addEventListener('click', () => window.location.href = `sms:${data.mobile}`);
                if (whatsappBtn) {
                    whatsappBtn.style.color = '#25D366';
                    const cleanPhone = data.mobile.replace(/[^\d+]/g, '');
                    whatsappBtn.addEventListener('click', () => window.open(`https://wa.me/${cleanPhone}`, '_blank'));
                }
            }
            
            phonesItem.style.display = hasPhones ? 'flex' : 'none';
        }
    }
    
    // LinkedIn
    const linkedInItem = document.getElementById('contactViewLinkedInItem');
    const linkedInEl = document.getElementById('contactViewLinkedIn');
    const linkedInTextEl = document.getElementById('contactViewLinkedInText');
    if (linkedInItem && linkedInEl) {
        if (data.linkedin_url) {
            // Ensure URL has protocol
            let linkedInUrl = data.linkedin_url;
            if (!linkedInUrl.startsWith('http://') && !linkedInUrl.startsWith('https://')) {
                linkedInUrl = 'https://' + linkedInUrl;
            }
            linkedInEl.href = linkedInUrl;
            if (linkedInTextEl) {
                linkedInTextEl.textContent = data.linkedin_url; // Show original text
            }
            linkedInItem.style.display = 'flex';
        } else {
            linkedInItem.style.display = 'none';
        }
    }
    
    // Website
    const websiteItem = document.getElementById('contactViewWebsiteItem');
    const websiteEl = document.getElementById('contactViewWebsite');
    const websiteTextEl = document.getElementById('contactViewWebsiteText');
    if (websiteItem && websiteEl) {
        if (data.website) {
            // Ensure URL has protocol
            let websiteUrl = data.website;
            if (!websiteUrl.startsWith('http://') && !websiteUrl.startsWith('https://')) {
                websiteUrl = 'https://' + websiteUrl;
            }
            websiteEl.href = websiteUrl;
            if (websiteTextEl) {
                websiteTextEl.textContent = data.website; // Show original text
            }
            websiteItem.style.display = 'flex';
        } else {
            websiteItem.style.display = 'none';
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
        dateEl.textContent = formatDateTime(data.meeting_date);
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
    
    // AI Summary (only for contacts) - displayed prominently
    const aiSummaryItem = document.getElementById('contactViewAiSummaryItem');
    const aiSummaryEl = document.getElementById('contactViewAiSummary');
    if (aiSummaryItem && aiSummaryEl && !isOwnProfile) {
        if (data.ai_summary) {
            aiSummaryEl.textContent = data.ai_summary;
            aiSummaryItem.style.display = 'block';
        } else {
            aiSummaryItem.style.display = 'none';
        }
    } else if (aiSummaryItem) {
        aiSummaryItem.style.display = 'none';
    }
    
    // Context (only for contacts) - original notes
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
    // Check if contactId exists (contact is saved)
    if (!contactId) {
        // Check if user is logged in
        const currentUser = getCurrentUser();
        if (!currentUser) {
            showToast('🔐 Please login first to use chat features', 'error');
            setTimeout(() => {
                if (typeof showAuthScreen === 'function') {
                    showAuthScreen();
                }
            }, 1500);
            return;
        }
        
        // User is logged in but contact not saved
        showToast('💾 Please save this contact first to use chat features', 'error');
        const saveBtn = document.getElementById('saveContactFromViewBtn');
        if (saveBtn) {
            saveBtn.style.display = 'block';
            saveBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
    }
    
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
        
        // Handle 404 error - contact not found
        if (error.message && (error.message.includes('404') || error.message.includes('Not Found') || error.message.includes('not found'))) {
            const currentUser = getCurrentUser();
            if (!currentUser) {
                showToast('🔐 Please login first to use chat features', 'error');
                setTimeout(() => {
                    if (typeof showAuthScreen === 'function') {
                        showAuthScreen();
                    }
                }, 1500);
            } else {
                showToast('💾 Please save this contact first to use chat features', 'error');
                const saveBtn = document.getElementById('saveContactFromViewBtn');
                if (saveBtn) {
                    saveBtn.style.display = 'block';
                    saveBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
            // Switch back to contacts view
            switchView('contacts');
        } else {
        alert('Failed to load contact: ' + error.message);
        }
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
let businessCardScannerStream = null;
let eventPassScannerStream = null;

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
        // It's a URL - check if it's a profile link
        const urlMatch = data.match(/\/profile\/([a-f0-9-]+)/i);
        if (urlMatch && urlMatch[1]) {
            const userId = urlMatch[1];
            try {
                await loadPublicProfile(userId);
            } catch (error) {
                console.error('Error loading profile:', error);
                showToast('Failed to load profile: ' + error.message, 'error');
            }
        } else {
            showToast('URL QR code detected but not a pplai profile link', 'warning');
        }
    } else {
        // Unknown format
        alert('QR code detected but format not recognized:\n' + data);
    }
}

// Standalone public profile renderer (for /profile/{id} URLs without auth)
async function renderStandalonePublicProfile(userId) {
    const loadingScreen = document.getElementById('loadingScreen');
    const authScreen = document.getElementById('authScreen');
    const appContainer = document.getElementById('appContainer');
    const publicScreen = document.getElementById('publicProfileScreen');
    
    // Hide all other screens
    if (loadingScreen) loadingScreen.classList.add('hidden');
    if (authScreen) authScreen.classList.add('hidden');
    if (appContainer) appContainer.classList.add('hidden');
    
    // Show public profile screen
    if (publicScreen) {
        publicScreen.classList.remove('hidden');
        
        // Show loading state
        togglePublicProfileLoading(true);
        
        try {
            // Fetch public profile without auth
            const profile = await api.getPublicProfile(userId);
            
            // Populate the standalone view
            const photoEl = document.getElementById('publicProfilePhoto');
            const photoPlaceholderEl = document.getElementById('publicProfilePhotoPlaceholder');
            const nameEl = document.getElementById('publicProfileName');
            const roleEl = document.getElementById('publicProfileRole');
            const aboutEl = document.getElementById('publicProfileAbout');
            
            if (photoEl) {
                photoEl.src = profile.profile_photo_url || '';
                photoEl.style.display = profile.profile_photo_url ? 'block' : 'none';
            }
            if (photoPlaceholderEl) {
                photoPlaceholderEl.style.display = profile.profile_photo_url ? 'none' : 'flex';
            }
            
            if (nameEl) nameEl.textContent = profile.name || '';
            if (roleEl) {
                roleEl.textContent = profile.role_company || '';
                roleEl.style.display = profile.role_company ? 'block' : 'none';
            }
            if (aboutEl) aboutEl.textContent = profile.about_me || 'No bio available';
            
            // Contact actions (using correct IDs from HTML)
            // Call action - no restrictions
            setPublicProfileAction('publicProfileCall', profile.mobile, () => window.location.href = `tel:${profile.mobile}`);
            
            // Email action - requires login and saved contact
            const emailAction = document.getElementById('publicProfileEmail');
            if (emailAction && profile.email) {
                emailAction.style.display = 'flex';
                emailAction.onclick = createChatActionHandler(() => {
                    window.location.href = `mailto:${profile.email}`;
                }, 'email');
            }
            
            // LinkedIn - no restrictions (external link)
            setPublicProfileAction('publicProfileLinkedIn', profile.linkedin_url, () => window.open(ensureHttps(profile.linkedin_url), '_blank'));
            
            // WhatsApp action - requires login and saved contact
            const whatsappAction = document.getElementById('publicProfileWhatsapp');
            if (whatsappAction && (profile.whatsapp || profile.mobile)) {
                whatsappAction.style.display = 'flex';
                whatsappAction.onclick = createChatActionHandler(() => {
                    window.open(`https://wa.me/${(profile.whatsapp || profile.mobile).replace(/\D/g, '')}`, '_blank');
                }, 'whatsapp');
            }
            
            // Meta info (using correct IDs from HTML)
            const emailValueEl = document.getElementById('publicProfileEmailValue');
            const mobileValueEl = document.getElementById('publicProfileMobileValue');
            const linkedinValueEl = document.getElementById('publicProfileLinkedInValue');
            
            if (emailValueEl) emailValueEl.textContent = profile.email || 'Not shared';
            if (mobileValueEl) mobileValueEl.textContent = profile.mobile || 'Not shared';
            if (linkedinValueEl) linkedinValueEl.textContent = profile.linkedin_url || 'Not shared';
            
            // Open in app button - requires login, then stores the profile ID and redirects to home
            const openInAppBtn = document.getElementById('publicProfileOpenAppBtn');
            if (openInAppBtn) {
                openInAppBtn.onclick = () => {
                    const currentUser = getCurrentUser();
                    if (!currentUser) {
                        // Store profile ID for after login
                    sessionStorage.setItem('pendingProfileView', userId);
                        showToast('🔐 Please login to open in app', 'info');
                        // Redirect to home where login screen will be shown
                        setTimeout(() => {
                    window.location.href = '/';
                        }, 1500);
                    } else {
                        // Already logged in, proceed
                        sessionStorage.setItem('pendingProfileView', userId);
                        window.location.href = '/';
                    }
                };
            }
            
            // Save to phone contacts button - works without login (saves directly to phone)
            const saveBtn = document.getElementById('publicProfileSaveBtn');
            if (saveBtn) {
                saveBtn.onclick = async () => {
                    try {
                        // Convert profile to contact format for vCard generation
                        const contactData = {
                            name: profile.name || '',
                            email: profile.email || null,
                            email_addresses: profile.email ? [{ address: profile.email }] : [],
                            mobile: profile.mobile || null,
                            whatsapp: profile.whatsapp || null,
                            phone_numbers: [],
                            role_company: profile.role_company || null,
                            company: null,
                            website: null,
                            linkedin_url: profile.linkedin_url || null,
                            contact_photo_url: profile.profile_photo_url || null,
                            meeting_context: profile.about_me || null,
                            tags: [],
                            event: null
                        };
                        
                        // Add phone numbers
                        if (profile.mobile) {
                            contactData.phone_numbers.push({
                                number: profile.mobile,
                                is_whatsapp: false
                            });
                        }
                        if (profile.whatsapp && profile.whatsapp !== profile.mobile) {
                            contactData.phone_numbers.push({
                                number: profile.whatsapp,
                                is_whatsapp: true
                            });
                        }
                        
                        // Generate vCard with embedded photo
                        const vcard = await generateContactVCardWithPhoto(contactData);
                        const blob = new Blob([vcard], { type: 'text/vcard' });
                        const url = URL.createObjectURL(blob);
                        
                        // Try Web Share API first (works on mobile)
                        if (navigator.share && navigator.canShare) {
                            const file = new File([blob], `${contactData.name.replace(/\s+/g, '_')}.vcf`, { type: 'text/vcard' });
                            if (navigator.canShare({ files: [file] })) {
                                navigator.share({
                                    title: `Save ${contactData.name}`,
                                    text: `Contact card for ${contactData.name}`,
                                    files: [file]
                                }).then(() => {
                                    URL.revokeObjectURL(url);
                                }).catch(() => {
                                    // Fallback to download
                                    downloadVCard(url, contactData.name);
                                });
                                return;
                            }
                        }
                        
                        // Fallback: Download vCard
                        downloadVCard(url, contactData.name);
                    } catch (error) {
                        console.error('Error saving contact to phone:', error);
                        alert('Failed to save contact to phone: ' + (error.message || 'Unknown error'));
                    }
                };
            }
            
            // Back button
            const backBtn = document.getElementById('publicProfileBackBtn');
            if (backBtn) {
                backBtn.onclick = () => {
                    window.location.href = '/';
                };
            }
            
            console.log('✅ Profile fields populated, hiding loader...');
            togglePublicProfileLoading(false);
            console.log('✅ Profile rendering complete!');
        } catch (error) {
            console.error('Error loading public profile:', error);
            showPublicProfileError(error.message || 'Failed to load profile');
        }
    }
}

// Helper to ensure URLs have https://
function ensureHttps(url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }
    return `https://${url}`;
}

// Helper to set action button visibility and handler
function setPublicProfileAction(btnId, value, handler) {
    const btn = document.getElementById(btnId);
    if (btn) {
        if (value) {
            btn.style.display = 'flex';
            btn.onclick = handler;
        } else {
            btn.style.display = 'none';
        }
    }
}

// Toggle loading state for public profile
function togglePublicProfileLoading(isLoading) {
    const loader = document.getElementById('publicProfileLoading');
    const content = document.getElementById('publicProfileContent');
    const error = document.getElementById('publicProfileError');
    
    if (loader) {
        loader.style.display = isLoading ? 'flex' : 'none';
    }
    if (content) {
        if (isLoading) {
            content.classList.add('hidden');
        } else {
            content.classList.remove('hidden');
        }
    }
    if (error) {
        error.classList.add('hidden');
    }
}

// Show error state for public profile
function showPublicProfileError(message) {
    const loader = document.getElementById('publicProfileLoading');
    const content = document.getElementById('publicProfileContent');
    const error = document.getElementById('publicProfileError');
    
    if (loader) loader.style.display = 'none';
    if (content) content.classList.add('hidden');
    if (error) {
        error.classList.remove('hidden');
        error.innerHTML = `
            <div style="text-align: center; padding: 40px 20px;">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 20px; color: #ef4444;">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <h3 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 600; color: #1f2937;">Profile not found</h3>
                <p style="margin: 0 0 24px 0; color: #6b7280; font-size: 15px;">${message}</p>
                <button onclick="window.location.href='/'" class="btn-primary">Go to pplai</button>
            </div>
        `;
    }
}

async function loadPublicProfile(userId) {
    try {
        // Fetch public profile from API
        const profile = await api.getPublicProfile(userId);
        
        // Display the profile in contact view modal
        displayContactProfile(profile, false);
        
        // Show save button for this public profile
        const saveBtn = document.getElementById('saveContactFromViewBtn');
        if (saveBtn) {
            saveBtn.style.display = 'block';
        }
        
        // Store the profile data for saving
        const profileUrl = `${window.location.origin}/profile/${userId}`;
        currentViewingContact = {
            name: profile.name,
            email: profile.email,
            role_company: profile.role_company,
            mobile: profile.mobile,
            whatsapp: profile.whatsapp,
            linkedin_url: profile.linkedin_url,
            about_me: profile.about_me,
            contact_photo_url: profile.profile_photo_url,
            // Mark as from QR/shared profile and include profile URL
            fromPplaiProfile: true,
            pplaiProfileUrl: profileUrl
        };
        
        showToast('Profile loaded successfully', 'success');
    } catch (error) {
        console.error('Error loading public profile:', error);
        throw error;
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
    const modal = document.getElementById('businessCardScannerModal');
    const video = document.getElementById('businessCardVideo');
    
    if (!modal || !video) {
        alert('Business Card Scanner elements not found');
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
        businessCardScannerStream = stream;
        video.srcObject = stream;
        video.play();
    })
    .catch(error => {
        console.error('Error accessing camera:', error);
        alert('Unable to access camera. Please allow camera permissions or use the upload option.');
    });
}

function closeBusinessCardScanner() {
    const modal = document.getElementById('businessCardScannerModal');
    const video = document.getElementById('businessCardVideo');
    
    // Stop camera stream
    if (businessCardScannerStream) {
        businessCardScannerStream.getTracks().forEach(track => track.stop());
        businessCardScannerStream = null;
    }
    
    if (video) {
        video.srcObject = null;
    }
    
    if (modal) {
        modal.classList.add('hidden');
    }
}

function captureBusinessCard() {
    const video = document.getElementById('businessCardVideo');
    const canvas = document.getElementById('businessCardCanvas');
    
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        alert('Camera not ready. Please wait a moment.');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob((blob) => {
        if (blob) {
            const file = new File([blob], `business-card-${Date.now()}.jpg`, { type: 'image/jpeg' });
            closeBusinessCardScanner();
            processBusinessCardFile(file);
        }
    }, 'image/jpeg', 0.9);
}

async function processBusinessCardFile(file) {
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
    
    const updateProgress = (message) => {
        const statusEl = loadingModal.querySelector('p');
        if (statusEl) statusEl.textContent = message;
    };
        
    const removeLoadingModal = () => {
        if (loadingModal.parentNode) {
            document.body.removeChild(loadingModal);
        }
    };

    let contactInfo = null;
    let portraitFile = null;
    let cardFileForMedia = null;

    try {
        updateProgress('Preparing image...');
        
        // Always preprocess - converts HEIC to JPEG which is universally supported
        const preprocessResult = await preprocessCardImage(file);
        const processedFile = preprocessResult?.file || file;
        cardFileForMedia = preprocessResult?.file || file;

        let cloudErrorDetail = null;

        if (navigator.onLine) {
            // Only try files that are valid (not null/undefined and have size)
            const backendFileCandidates = [];
            if (processedFile && processedFile.size > 0) {
                backendFileCandidates.push(processedFile);
            }
            if (file && file.size > 0 && processedFile !== file) {
                backendFileCandidates.push(file);
            }
            if (backendFileCandidates.length === 0) {
                backendFileCandidates.push(file); // Last resort
            }

            for (const candidate of backendFileCandidates) {
                try {
                    updateProgress('Scanning card (cloud)...');
                    const result = await api.analyzeBusinessCard(candidate);
                    if (result) {
                        contactInfo = result.fields || null;
                        if (result.portrait_image) {
                            portraitFile = base64ToFile(result.portrait_image, `portrait-${Date.now()}.png`, 'image/png');
                        }
                        // Always use the original file for media, not the processed/cropped version
                        cardFileForMedia = file;
                    }
                    break;
                } catch (cloudError) {
                    console.warn('Cloud OCR attempt failed:', cloudError);
                    cloudErrorDetail = cloudError?.message || cloudError;
                }
            }
        }

        if (!contactInfo) {
            updateProgress('Scanning card (offline mode)...');
            const localSource = processedFile || file;
            const { data: { text } } = await Tesseract.recognize(localSource, 'eng', {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        const progress = Math.round(m.progress * 100);
                        updateProgress(`Scanning locally... ${progress}%`);
                    }
                }
            });
            contactInfo = parseBusinessCardText(text);
            cardFileForMedia = localSource;
        }

        removeLoadingModal();

        if (!contactInfo) {
            const extraMessage = cloudErrorDetail
                ? `\n\nCloud OCR error: ${cloudErrorDetail}`
                : '';
            alert(`We could not extract information from this card. Please enter details manually.${extraMessage}`);
            return;
        }

        cardFileForMedia = cardFileForMedia || processedFile || file;
        await populateContactForm(contactInfo, { portraitFile, cardFile: cardFileForMedia });
    } catch (error) {
        console.error('OCR Error:', error);
        removeLoadingModal();
        alert('Failed to scan business card. Please try again or enter manually.\n\n' + (error.message || error));
    }
}

function openEventPassScanner() {
    const modal = document.getElementById('eventPassScannerModal');
    const video = document.getElementById('eventPassVideo');
    
    if (!modal || !video) {
        alert('Event Pass Scanner elements not found');
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
        eventPassScannerStream = stream;
        video.srcObject = stream;
        video.play();
    })
    .catch(error => {
        console.error('Error accessing camera:', error);
        alert('Unable to access camera. Please allow camera permissions or use the upload option.');
    });
}

function closeEventPassScanner() {
    const modal = document.getElementById('eventPassScannerModal');
    const video = document.getElementById('eventPassVideo');
    
    // Stop camera stream
    if (eventPassScannerStream) {
        eventPassScannerStream.getTracks().forEach(track => track.stop());
        eventPassScannerStream = null;
    }
    
    if (video) {
        video.srcObject = null;
    }
    
    if (modal) {
        modal.classList.add('hidden');
    }
}

function captureEventPass() {
    const video = document.getElementById('eventPassVideo');
    const canvas = document.getElementById('eventPassCanvas');
    
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        alert('Camera not ready. Please wait a moment.');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob((blob) => {
        if (blob) {
            const file = new File([blob], `event-pass-${Date.now()}.jpg`, { type: 'image/jpeg' });
            closeEventPassScanner();
            processEventPassFile(file);
        }
    }, 'image/jpeg', 0.9);
}

async function processEventPassFile(file) {
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
        // Check if it's HEIC - Tesseract can't handle HEIC
        const isHeic = file.type && file.type.toLowerCase().includes('heic') || 
                      file.name && file.name.toLowerCase().match(/\.(heic|heif)$/);
        
        if (isHeic) {
            document.body.removeChild(loadingModal);
            alert('HEIC images are not supported for event pass scanning.\n\nPlease:\n1. Take a new photo in JPG/PNG format, or\n2. Convert the HEIC to JPG first, or\n3. Use the Business Card scanner instead (it supports HEIC)');
            return;
        }
        
        loadingModal.querySelector('p').textContent = 'Preparing image...';
        const preprocessResult = await preprocessCardImage(file);
        const processedFile = preprocessResult?.file || file;

        const { data: { text } } = await Tesseract.recognize(processedFile, 'eng', {
            logger: m => {
                if (m.status === 'recognizing text') {
                    const progress = Math.round(m.progress * 100);
                    loadingModal.querySelector('p').textContent = `Scanning... ${progress}%`;
                }
            }
        });
        
        const contactInfo = parseEventPassText(text);
        
        document.body.removeChild(loadingModal);
        
        if (!contactInfo) {
            alert('We could not extract information from this pass. Please enter details manually.');
            return;
        }

        await populateContactForm(contactInfo, { cardFile: processedFile });

        if (contactInfo.eventName) {
            const context = document.getElementById('contactContext');
            if (context) {
                context.value = context.value
                    ? `${context.value}\nMet at: ${contactInfo.eventName}`
                    : `Met at: ${contactInfo.eventName}`;
            }
        }
        
    } catch (error) {
        console.error('OCR Error:', error);
        document.body.removeChild(loadingModal);
        alert('Failed to scan event pass/ID card. Please try again or enter manually.');
    }
}

const JOB_TITLE_KEYWORDS = [
    'manager','director','engineer','developer','designer','consultant','specialist','lead','head','officer','executive',
    'chief','founder','co-founder','president','vice','vp','chair','partner','analyst','architect','strategist','scientist',
    'advisor','associate','assistant','coordinator','administrator','representative','supervisor','professor',
    'teacher','doctor','lawyer','attorney','marketing','sales','product','research','growth','recruiter','hr','talent',
    'operations','finance','digital','brand','customer','support','agent','broker','realtor','estate','property'
];

function normalizeOcrText(rawText) {
    if (!rawText) return '';
    return rawText
        .replace(/\r\n?/g, '\n')
        .replace(/\u00A0/g, ' ')
        .replace(/[•·●▪■]/g, ' ')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, '\'')
        .replace(/\u2013|\u2014|\u2212/g, '-')
        .replace(/[|¦]/g, 'I')
        .split('\n')
        .map(line => line.replace(/\s{2,}/g, ' ').trimEnd())
        .join('\n');
}

function toTitleCase(value) {
    if (!value) return '';
    return value
        .split(/\s+/)
        .map(word => {
            if (!word) return '';
            if (word.toUpperCase() === word) {
                return word.charAt(0) + word.slice(1).toLowerCase();
            }
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ')
        .trim();
}

function normalizePhoneCandidate(candidate) {
    if (!candidate) return '';
    let cleaned = candidate.replace(/[^\d+]/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('00')) {
        cleaned = '+' + cleaned.slice(2);
    }
    if (!cleaned.startsWith('+') && cleaned.length > 10) {
        cleaned = '+' + cleaned;
    }
    return cleaned;
}

function cleanLinkedInUrl(url) {
    if (!url) return '';
    let cleaned = url.trim();
    cleaned = cleaned.replace(/[),.;]+$/, '');
    if (!/^https?:\/\//i.test(cleaned)) {
        cleaned = 'https://' + cleaned.replace(/^www\./i, '');
    }
    return cleaned;
}

function deriveCompanyFromEmail(email) {
    if (!email || !email.includes('@')) return '';
    const domain = email.split('@')[1];
    if (!domain) return '';
    const companyPart = domain.split('.')[0];
    if (!companyPart) return '';
    return toTitleCase(companyPart.replace(/[-_]/g, ' '));
}

function applyPhoneToForm(phone) {
    const countrySelect = document.getElementById('contactCountryCode');
    const mobileEl = document.getElementById('contactMobile');
    if (!mobileEl || !countrySelect) return;

    if (!phone) {
        mobileEl.value = '';
        return;
    }

    const trimmed = phone.trim();
    const match = trimmed.match(/^(\+\d{1,4})([\s\-().]*)(.*)$/);

    if (match) {
        const countryCode = match[1];
        const number = (match[3] || match[2] || '').replace(/[^\d]/g, '') || trimmed.replace(/[^\d]/g, '');

        const option = Array.from(countrySelect.options).find(opt => opt.value === countryCode);
        if (option) {
            countrySelect.value = countryCode;
        }
        mobileEl.value = number || trimmed.replace(/^\+/, '');
    } else {
        mobileEl.value = trimmed.replace(/[^\d+]/g, '');
    }
}

function isLikelyJobTitle(line) {
    if (!line) return false;
    const lower = line.toLowerCase();
    return JOB_TITLE_KEYWORDS.some(keyword => lower.includes(keyword));
}

function extractCommonContactInfo(rawText) {
    const info = {
        name: '',
        email: '',
        phone: '',
        company: '',
        linkedin: '',
        website: '',
        title: ''
    };
    
    const normalizedText = normalizeOcrText(rawText);
    const sanitizedForEmail = normalizedText
        .replace(/\s@\s/g, '@')
        .replace(/\s\.\s/g, '.')
        .replace(/\sDOT\s/gi, '.')
        .replace(/\sAT\s/gi, '@');
    
    const lines = normalizedText.split('\n').map(line => line.trim()).filter(Boolean);
    const labelRegex = /^(name|contact|email|e-mail|mail|phone|mobile|cell|tel|linkedin|website|url|company|organisation|organization|org|title|position|designation|role)\s*[:\-]\s*/i;
    
    const lineData = lines.map((line, index) => {
        const stripped = line.replace(labelRegex, '').trim();
        return {
            raw: line,
            stripped,
            lower: stripped.toLowerCase(),
            originalLower: line.toLowerCase(),
            index
        };
    });
    
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    for (const entry of lineData) {
        const match = entry.raw.match(emailRegex);
        if (match && match.length) {
            info.email = match[0];
            break;
        }
    }
    if (!info.email) {
        const emails = sanitizedForEmail.match(emailRegex);
        if (emails && emails.length) {
        info.email = emails[0];
    }
    }
    
    const phoneRegex = /(\+?\d{1,3}[\s().-]*)?(?:\d[\s().-]*){7,}\d/g;
    const phoneLabelRegex = /^(?:phone|mobile|cell|tel|ph|p|m|t)\b/i;
    const phoneCandidates = [];
    for (const entry of lineData) {
        const source = phoneLabelRegex.test(entry.raw) ? entry.raw : entry.stripped;
        const match = source.match(phoneRegex);
        if (match && match.length) {
            phoneCandidates.push({
                raw: match[0],
                priority: phoneLabelRegex.test(entry.raw) ? 1 : 2
            });
        }
    }
    if (!phoneCandidates.length) {
        const match = sanitizedForEmail.match(phoneRegex);
        if (match && match.length) {
            phoneCandidates.push({ raw: match[0], priority: 3 });
        }
    }
    if (phoneCandidates.length) {
        phoneCandidates.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return normalizePhoneCandidate(b.raw).length - normalizePhoneCandidate(a.raw).length;
        });
        info.phone = normalizePhoneCandidate(phoneCandidates[0].raw);
        }
    
    const linkedinRegex = /(https?:\/\/)?(www\.)?linkedin\.com\/[^\s,;]+/i;
    for (const entry of lineData) {
        if (entry.lower.includes('linkedin')) {
            const match = entry.raw.match(linkedinRegex) || entry.stripped.match(linkedinRegex);
            if (match && match.length) {
                info.linkedin = cleanLinkedInUrl(match[0]);
                break;
            }
        }
    }
    if (!info.linkedin) {
        const match = sanitizedForEmail.match(linkedinRegex);
        if (match && match.length) {
            info.linkedin = cleanLinkedInUrl(match[0]);
    }
    }
    
    const websiteRegex = /(https?:\/\/)?(www\.)?[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}(?:\/[^\s,;]*)?/g;
    for (const entry of lineData) {
        const match = entry.raw.match(websiteRegex);
        if (match && match.length) {
            const candidate = match[0];
            if (!candidate.toLowerCase().includes('linkedin')) {
                info.website = candidate.startsWith('http') ? candidate : `https://${candidate.replace(/^www\./i, '')}`;
                break;
    }
        }
    }
    
    const labelledName = lineData.find(entry => /^name\b/i.test(entry.raw) && entry.stripped);
    if (labelledName) {
        info.name = toTitleCase(labelledName.stripped);
    }
    if (!info.name) {
        for (const entry of lineData) {
            if (entry.stripped.length < 2 || entry.stripped.length > 60) continue;
            if (/\d/.test(entry.stripped)) continue;
            if (entry.lower.includes('@') || entry.lower.includes('www.') || entry.lower.includes('http')) continue;
            if (isLikelyJobTitle(entry.stripped)) {
                if (!info.title) info.title = toTitleCase(entry.stripped);
                continue;
            }
            const words = entry.stripped.split(/\s+/).filter(Boolean);
            if (words.length < 2 || words.length > 4) continue;
            const capitalized = words.filter(word => /^[A-Z][a-zA-Z'’.-]*$/.test(word) || /^[A-Z]{2,}$/.test(word));
            if (capitalized.length >= Math.max(2, Math.floor(words.length * 0.6))) {
                info.name = toTitleCase(entry.stripped);
                    break;
                }
            }
        }
    if (!info.name && info.email) {
        const localPart = info.email.split('@')[0];
        if (localPart.includes('.')) {
            const words = localPart.split(/[._-]/).filter(Boolean);
            if (words.length >= 2) {
                info.name = toTitleCase(words.join(' '));
            }
        }
    }
    
    const labelledCompany = lineData.find(entry => /^(company|organisation|organization|org)\b/i.test(entry.raw) && entry.stripped);
    if (labelledCompany) {
        info.company = toTitleCase(labelledCompany.stripped);
    }
    if (!info.company) {
        for (const entry of lineData) {
            const lower = entry.lower;
            if (lower.includes('inc') || lower.includes('llc') || lower.includes('ltd') || lower.includes('corp') ||
                lower.includes('company') || lower.includes('gmbh') || lower.includes('plc') || lower.includes('pty') ||
                lower.includes('pvt') || lower.includes('limited')) {
                info.company = toTitleCase(entry.stripped || entry.raw);
            break;
            }
        }
    }
    if (!info.company) {
        for (const entry of lineData) {
            if (entry.index === 0) continue;
            if (entry.stripped.length < 3 || entry.stripped.length > 60) continue;
            if (/\d/.test(entry.stripped)) continue;
            const words = entry.stripped.split(/\s+/).filter(Boolean);
            if (words.length >= 2 && words.length <= 5) {
                const uppercaseCount = words.filter(word => /^[A-Z][A-Za-z'’.-]*$/.test(word) || /^[A-Z]{2,}$/.test(word)).length;
                if (uppercaseCount >= Math.floor(words.length * 0.6) && !isLikelyJobTitle(entry.stripped)) {
                    info.company = toTitleCase(entry.stripped);
                    break;
                }
            }
        }
    }
    if (!info.company) {
        info.company = deriveCompanyFromEmail(info.email);
    }
    
    if (!info.title) {
        const titleEntry = lineData.find(entry => isLikelyJobTitle(entry.stripped));
        if (titleEntry) {
            info.title = toTitleCase(titleEntry.stripped);
        }
    }
    
    return { info, lines: lineData };
}

// Parse event pass/ID card text to extract contact information
function parseEventPassText(text) {
    const { info, lines } = extractCommonContactInfo(text);
    const eventInfo = {
        name: info.name,
        email: info.email,
        phone: info.phone,
        company: info.company,
        linkedin: info.linkedin,
        eventName: '',
        role: info.title
    };
    
    const eventKeywords = ['conference', 'summit', 'expo', 'exhibition', 'forum', 'meetup', 'event', 'gitex', 'tech', 'trade show', 'symposium', 'fair', 'festival'];
    const eventRegex = new RegExp(eventKeywords.join('|'), 'i');
    
    for (const entry of lines) {
        if (!eventInfo.eventName && eventRegex.test(entry.lower)) {
            eventInfo.eventName = entry.raw;
        }
        if (!eventInfo.role && isLikelyJobTitle(entry.stripped)) {
            eventInfo.role = toTitleCase(entry.stripped);
                }
            }
    
    return eventInfo;
    }
    
// Parse business card text to extract contact information
function parseBusinessCardText(text) {
    const { info } = extractCommonContactInfo(text);
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
    // Check authentication
    const currentUser = getCurrentUser();
    const token = getAuthToken();
    if (!currentUser || !token) {
        showAuthScreen();
        return;
    }
    
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
                <span class="tag-name" id="tag-name-${tag.id}" style="background-color: ${color.bg}; color: ${color.text}; border: 1px solid ${color.border}; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; display: inline-block; max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${tag.name}</span>
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    ${tag.is_hidden ? '<span class="tag-badge tag-badge-hidden">Hidden</span>' : ''}
                    ${isSystem ? '<span class="tag-badge tag-badge-system">System</span>' : ''}
                </div>
            </div>
            <div class="tag-item-actions">
                <button class="btn-small btn-primary tag-view-contacts-btn" data-tag-id="${tag.id}" data-tag-name="${tag.name}" title="View contacts with this tag" style="display: flex; align-items: center; gap: 6px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    <span>View</span>
                </button>
                ${!isSystem ? `
                    <button class="btn-small btn-secondary tag-edit-btn" data-tag-id="${tag.id}" data-tag-name="${tag.name}" title="Edit" style="display: flex; align-items: center; justify-content: center;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="btn-small btn-secondary tag-hide-btn" data-tag-id="${tag.id}" data-tag-name="${tag.name}" data-is-hidden="${tag.is_hidden}" title="${tag.is_hidden ? 'Show' : 'Hide'}" style="display: flex; align-items: center; justify-content: center;">
                        ${tag.is_hidden ? `
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                                <line x1="1" y1="1" x2="23" y2="23"></line>
                            </svg>
                        ` : `
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                        `}
                    </button>
                    <button class="btn-small btn-danger tag-delete-btn" data-tag-id="${tag.id}" data-tag-name="${tag.name}" title="Delete" style="display: flex; align-items: center; justify-content: center;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
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

// Toast Notification System
function showToast(message, type = 'info', duration = 5000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <div class="toast-content">
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(toast);
    
    // Auto-remove after duration
    if (duration > 0) {
        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
    
    return toast;
}

function updateCharCount() {
    const textarea = document.getElementById('contactContext');
    const counter = document.getElementById('contextCharCount');
    if (textarea && counter) {
        counter.textContent = textarea.value.length;
    }
}

function formatDate(date) {
    // Format date as "26-Nov-2025"
    const d = new Date(date);
    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
}

function formatDateTime(date) {
    // Format date and time as "26-Nov-2025 14:30"
    const d = new Date(date);
    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${day}-${month}-${year} ${hours}:${minutes}`;
}

function formatDateRange(start, end) {
    return `${formatDate(start)} - ${formatDate(end)}`;
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
    // Check authentication
    const currentUser = getCurrentUser();
    const token = getAuthToken();
    if (!currentUser || !token) {
        showAuthScreen();
        return;
    }
    
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
        const createdDate = formatDate(user.created_at);
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
            showToast('User updated successfully', 'success');
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
            showToast('User created successfully', 'success');
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

// Unified Business Card and Visiting Card Camera Functions
function startUnifiedBusinessCardCamera() {
    console.log('Starting unified business card camera...');
    const video = document.getElementById('unifiedBusinessCardVideo');
    const canvas = document.getElementById('unifiedBusinessCardCanvas');
    
    if (!video || !canvas) {
        console.error('Business card camera elements not found');
        return;
    }
    
    // Stop any existing stream first
    if (unifiedScannerStream) {
        unifiedScannerStream.getTracks().forEach(track => track.stop());
        unifiedScannerStream = null;
    }
    
    // Reset video element
    video.srcObject = null;
    video.load();
    
    navigator.mediaDevices.getUserMedia({ 
        video: { 
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
        } 
    })
    .then(stream => {
        console.log('Business card camera access granted');
        unifiedScannerStream = stream;
        video.srcObject = stream;
        video.play().catch(err => {
            console.error('Error playing business card video:', err);
        });
    })
    .catch(error => {
        console.error('Error accessing business card camera:', error);
        showToast('Unable to access camera. Please allow camera permissions.', 'error');
    });
}

function startUnifiedVisitingCardCamera() {
    console.log('Starting unified visiting card camera...');
    const video = document.getElementById('unifiedVisitingCardVideo');
    const canvas = document.getElementById('unifiedVisitingCardCanvas');
    
    if (!video || !canvas) {
        console.error('Visiting card camera elements not found');
        return;
    }
    
    // Stop any existing stream first
    if (unifiedScannerStream) {
        unifiedScannerStream.getTracks().forEach(track => track.stop());
        unifiedScannerStream = null;
    }
    
    // Reset video element
    video.srcObject = null;
    video.load();
    
    navigator.mediaDevices.getUserMedia({ 
        video: { 
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
        } 
    })
    .then(stream => {
        console.log('Visiting card camera access granted');
        unifiedScannerStream = stream;
        video.srcObject = stream;
        video.play().catch(err => {
            console.error('Error playing visiting card video:', err);
        });
    })
    .catch(error => {
        console.error('Error accessing visiting card camera:', error);
        showToast('Unable to access camera. Please allow camera permissions.', 'error');
    });
}

// Update reset functions to start camera automatically
if (typeof resetUnifiedBusinessCardView !== 'undefined') {
    const originalResetBusiness = resetUnifiedBusinessCardView;
    resetUnifiedBusinessCardView = function() {
        originalResetBusiness();
        document.getElementById('unifiedBusinessCardCameraView')?.classList.remove('hidden');
        setTimeout(() => startUnifiedBusinessCardCamera(), 100);
    };
}

if (typeof resetUnifiedVisitingCardView !== 'undefined') {
    const originalResetVisiting = resetUnifiedVisitingCardView;
    resetUnifiedVisitingCardView = function() {
        originalResetVisiting();
        document.getElementById('unifiedVisitingCardCameraView')?.classList.remove('hidden');
        setTimeout(() => startUnifiedVisitingCardCamera(), 100);
    };
}

// Add upload button handlers
document.addEventListener('DOMContentLoaded', () => {
    // Business card upload
    document.getElementById('unifiedBusinessCardUploadBtn')?.addEventListener('click', () => {
        document.getElementById('unifiedBusinessCardFileInput')?.click();
    });
    
    document.getElementById('unifiedBusinessCardFileInput')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleUnifiedBusinessCardFile(file);
        }
    });
    
    // Visiting card upload
    document.getElementById('unifiedVisitingCardUploadBtn')?.addEventListener('click', () => {
        document.getElementById('unifiedVisitingCardFileInput')?.click();
    });
    
    document.getElementById('unifiedVisitingCardFileInput')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleUnifiedVisitingCardFile(file);
        }
    });
});

function handleUnifiedBusinessCardFile(file) {
    // Use existing business card processing logic
    if (typeof processBusinessCard === 'function') {
        // Set the file and show preview
        const preview = document.getElementById('unifiedBusinessCardPreview');
        const previewView = document.getElementById('unifiedBusinessCardPreviewView');
        const cameraView = document.getElementById('unifiedBusinessCardCameraView');
        
        if (preview && previewView && cameraView) {
            const url = URL.createObjectURL(file);
            preview.src = url;
            cameraView.classList.add('hidden');
            previewView.classList.remove('hidden');
            
            // Store file for processing
            window.unifiedBusinessCardFile = file;
        }
    }
}

function handleUnifiedVisitingCardFile(file) {
    // Similar to business card
    const preview = document.getElementById('unifiedVisitingCardPreview');
    const previewView = document.getElementById('unifiedVisitingCardPreviewView');
    const cameraView = document.getElementById('unifiedVisitingCardCameraView');
    
    if (preview && previewView && cameraView) {
        const url = URL.createObjectURL(file);
        preview.src = url;
        cameraView.classList.add('hidden');
        previewView.classList.remove('hidden');
        
        window.unifiedVisitingCardFile = file;
    }
}

