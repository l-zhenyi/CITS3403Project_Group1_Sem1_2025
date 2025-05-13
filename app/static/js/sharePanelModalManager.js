// --- START OF FILE static/js/sharePanelModalManager.js ---
let modal, form, closeButtonX, cancelButton, submitButton,
    panelNameDisplay, originalPanelIdInput,
    friendSearchInput, friendsListContainer, errorMessageElement;

let allFriendsCacheForSharing = [];
let currentPanelElementForSharing = null;
let isShareModalInitialized = false;

async function fetchFriendsForSharing() {
    if (friendsListContainer) friendsListContainer.innerHTML = '<p class="loading-message">Loading friends...</p>';
    try {
        const response = await fetch('/api/me/friends');
        if (!response.ok) throw new Error('Failed to fetch friends list.');
        allFriendsCacheForSharing = await response.json();
        return allFriendsCacheForSharing;
    } catch (error) {
        console.error("Error fetching friends for sharing:", error);
        if (errorMessageElement) errorMessageElement.textContent = "Could not load friends list.";
        if (friendsListContainer) friendsListContainer.innerHTML = '<p class="error-text">Error loading friends.</p>';
        return [];
    }
}

function populateFriendsListForSharing(friendsToDisplay) {
    if (!friendsListContainer) return;
    friendsListContainer.innerHTML = '';

    if (friendsToDisplay.length === 0) {
        friendsListContainer.innerHTML = friendSearchInput.value.trim() !== ''
            ? '<p class="no-items-message">No friends match your search.</p>'
            : '<p class="no-items-message">You have no friends to share with yet.</p>';
        return;
    }

    const ul = document.createElement('ul');
    ul.className = 'modal-friends-list share-friends-list'; // Add specific class
    friendsToDisplay.forEach(friend => {
        const li = document.createElement('li');
        li.className = 'friend-item-to-add';
        li.innerHTML = `
            <input type="checkbox" id="share-friend-checkbox-${friend.id}" name="share_recipient_ids" value="${friend.id}" class="friend-checkbox-input modal-checkbox">
            <label for="share-friend-checkbox-${friend.id}">
                <img src="${friend.avatar_url || '/static/img/default-avatar.png'}" alt="${friend.username}" class="friend-avatar-small">
                <span>${friend.username}</span>
            </label>
        `;
        const labelElement = li.querySelector('label');
         if (labelElement) {
            labelElement.addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT') {
                    const checkbox = li.querySelector(`#share-friend-checkbox-${friend.id}`);
                    if (checkbox) checkbox.checked = !checkbox.checked;
                }
            });
        }
        ul.appendChild(li);
    });
    friendsListContainer.appendChild(ul);
}

function handleFriendSearchForSharing() {
    if (!friendSearchInput || !allFriendsCacheForSharing) return;
    const query = friendSearchInput.value.trim().toLowerCase();
    if (query === "") {
        populateFriendsListForSharing(allFriendsCacheForSharing);
        return;
    }
    const filteredFriends = allFriendsCacheForSharing.filter(friend =>
        friend.username.toLowerCase().includes(query)
    );
    populateFriendsListForSharing(filteredFriends);
}

function _resetShareModalForm() {
    if (form) form.reset();
    if (panelNameDisplay) panelNameDisplay.textContent = '';
    if (originalPanelIdInput) originalPanelIdInput.value = '';
    if (friendSearchInput) friendSearchInput.value = '';
    if (errorMessageElement) {
        errorMessageElement.textContent = '';
        errorMessageElement.style.display = 'none';
    }
    if (friendsListContainer) friendsListContainer.innerHTML = '<p class="loading-message">Loading friends...</p>';
    const dynamicRadio = document.getElementById('share-access-dynamic');
    if (dynamicRadio) dynamicRadio.checked = true;
    currentPanelElementForSharing = null;
}

async function handleShareSubmit(event) {
    event.preventDefault();
    if (!submitButton || !errorMessageElement || !currentPanelElementForSharing || !originalPanelIdInput.value) return;

    const selectedFriendCheckboxes = friendsListContainer.querySelectorAll('input[name="share_recipient_ids"]:checked');
    const recipient_user_ids = Array.from(selectedFriendCheckboxes).map(cb => parseInt(cb.value, 10));

    if (recipient_user_ids.length === 0) {
        errorMessageElement.textContent = 'Please select at least one friend to share with.';
        errorMessageElement.style.display = 'block';
        return;
    }

    const access_mode = form.elements.share_access_mode.value;
    let current_config_for_fixed_share = null;

    // Always get current panel's config for `shared_config` context
    // For 'fixed' mode, this full config is used directly.
    // For 'dynamic' mode, backend extracts 'group_id' from this for the shared context.
    try {
        current_config_for_fixed_share = JSON.parse(currentPanelElementForSharing.dataset.configuration || '{}');
    } catch (e) {
        console.error("Error parsing panel configuration for sharing:", e);
        errorMessageElement.textContent = 'Error reading panel configuration.';
        errorMessageElement.style.display = 'block';
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Sharing...';
    errorMessageElement.style.display = 'none';

    try {
        const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
        const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        if (csrfTokenMeta) headers['X-CSRFToken'] = csrfTokenMeta.getAttribute('content');

        const response = await fetch(`/api/insights/panels/${originalPanelIdInput.value}/share`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ 
                recipient_user_ids, 
                access_mode,
                current_config_for_fixed_share // Send this for both modes
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || result.message || `Failed to share panel (${response.status})`);
        }
        
        // Optionally show a success message from result.message
        alert(result.message || `Panel shared with ${result.shared_count} friend(s).`);
        closeSharePanelModal();

    } catch (error) {
        console.error("Error sharing panel:", error);
        errorMessageElement.textContent = `Error: ${error.message}`;
        errorMessageElement.style.display = 'block';
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Share';
    }
}

export function openSharePanelModal(panelElement) {
    if (!isShareModalInitialized || !modal || !panelElement) {
        console.error("Share modal not ready or panelElement missing.");
        alert("Share feature is not available at the moment.");
        return;
    }
    currentPanelElementForSharing = panelElement;
    _resetShareModalForm();

    const panelId = panelElement.dataset.panelId;
    const panelTitle = panelElement.querySelector('.panel-dynamic-title')?.textContent || 'this panel';
    
    if (originalPanelIdInput) originalPanelIdInput.value = panelId;
    if (panelNameDisplay) panelNameDisplay.textContent = panelTitle;

    fetchFriendsForSharing().then(friends => {
        populateFriendsListForSharing(friends);
    });

    modal.style.display = 'flex';
    requestAnimationFrame(() => {
        modal.classList.add('visible');
        if (friendSearchInput) friendSearchInput.focus();
    });
}

export function closeSharePanelModal() {
    if (!modal) return;
    modal.classList.remove('visible');
    setTimeout(() => {
        if (modal) modal.style.display = 'none';
         _resetShareModalForm();
    }, 300);
}

export function setupSharePanelModal() {
    if (isShareModalInitialized) return;

    modal = document.getElementById('share-panel-modal');
    if (!modal) {
        console.warn("Share Panel Modal element (#share-panel-modal) not found.");
        return;
    }

    form = modal.querySelector('#share-panel-form');
    panelNameDisplay = modal.querySelector('#share-panel-modal-panel-name');
    originalPanelIdInput = modal.querySelector('#share-panel-original-id-input');
    closeButtonX = modal.querySelector('#share-panel-modal-close-btn-x');
    cancelButton = modal.querySelector('#share-panel-cancel-btn');
    submitButton = modal.querySelector('#share-panel-submit-btn');
    friendSearchInput = modal.querySelector('#share-panel-friend-search');
    friendsListContainer = modal.querySelector('#share-panel-friends-list-container');
    errorMessageElement = modal.querySelector('#share-panel-error-message');

    if (!form || !panelNameDisplay || !originalPanelIdInput || !closeButtonX || !cancelButton || !submitButton || !friendSearchInput || !friendsListContainer || !errorMessageElement) {
        console.error("One or more essential elements for Share Panel Modal are missing.");
        modal = null; // Prevent usage
        return;
    }

    closeButtonX.addEventListener('click', closeSharePanelModal);
    cancelButton.addEventListener('click', closeSharePanelModal);
    form.addEventListener('submit', handleShareSubmit);
    friendSearchInput.addEventListener('input', handleFriendSearchForSharing);

    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeSharePanelModal();
    });

    isShareModalInitialized = true;
    console.log("Share Panel Modal setup complete.");
}

// Auto-setup
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupSharePanelModal);
} else {
    setupSharePanelModal();
}
// --- END OF FILE static/js/sharePanelModalManager.js ---