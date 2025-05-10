// static/js/groupSettingsModalManager.js
import { loadGroups, groupsData } from './dataHandle.js';

let settingsModal, settingsForm, settingsGroupIdInput,
    editGroupNameInput, editGroupDescriptionInput,
    currentMembersListContainer, settingsFriendSearchInput,
    friendsToAddListContainer, settingsSaveButton,
    settingsCancelButton, settingsModalCloseBtnX,
    settingsErrorMessageElement;

let currentActiveGroupIdForSettings = null;
let allFriendsForSettingsCache = [];

// --- API Helper (Consider moving to a shared utils.js if used elsewhere) ---
async function apiRequest(url, method = 'GET', body = null) {
    const headers = {
        'Accept': 'application/json'
    };
    if (method !== 'GET' && method !== 'HEAD') { // GET/HEAD should not have Content-Type or CSRF for body
        headers['Content-Type'] = 'application/json';
        const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
        if (csrfTokenMeta) {
            headers['X-CSRFToken'] = csrfTokenMeta.getAttribute('content');
        } else {
            console.warn(`CSRF token meta tag not found for ${method} ${url}. Request may fail.`);
        }
    }
    const options = { method, headers };
    if (body && (method !== 'GET' && method !== 'HEAD')) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { error: `API request failed (${response.status}) - ${response.statusText}` };
            }
            throw new Error(errorData.error || `HTTP error ${response.status}`);
        }
        if (response.status === 204) return null; // No content
        return response.json();
    } catch (error) {
        console.error(`API Request Error: ${method} ${url}`, error);
        throw error; // Re-throw to be caught by caller
    }
}

// --- Data Fetching ---
async function fetchGroupDetailsForSettings(groupId) {
    currentMembersListContainer.innerHTML = '<p class="loading-message">Loading group details...</p>';
    try {
        // Assuming your API endpoint for group details is /api/groups/<id>
        // And it can include member details with a query parameter
        return await apiRequest(`/api/groups/${groupId}?include_members=true`);
    } catch (error) {
        // Error already logged by apiRequest
        if (settingsErrorMessageElement) {
            settingsErrorMessageElement.textContent = `Could not load group details: ${error.message}`;
            settingsErrorMessageElement.style.display = 'block';
        }
        currentMembersListContainer.innerHTML = `<p class="loading-message" style="color:red;">Error loading members: ${error.message}</p>`;
        return null;
    }
}

async function fetchFriendsForAdding(existingMemberIds = []) {
    friendsToAddListContainer.innerHTML = '<p class="loading-message">Loading friends list...</p>';
    try {
        const friends = await apiRequest('/api/me/friends'); // Assuming this endpoint exists
        allFriendsForSettingsCache = friends.filter(friend => !existingMemberIds.includes(friend.id));
        return allFriendsForSettingsCache;
    } catch (error) {
        if (settingsErrorMessageElement && !settingsErrorMessageElement.textContent) { // Only set if not already showing a more critical error
            settingsErrorMessageElement.textContent = `Could not load friends list: ${error.message}`;
            settingsErrorMessageElement.style.display = 'block';
        }
        friendsToAddListContainer.innerHTML = `<p class="loading-message" style="color:red;">Error loading friends: ${error.message}</p>`;
        return [];
    }
}

// --- UI Population ---
function populateCurrentMembersList(members = []) {
    if (!currentMembersListContainer) return;
    currentMembersListContainer.innerHTML = '';

    if (members.length === 0) {
        currentMembersListContainer.innerHTML = '<p class="no-members-message">This group has no members.</p>';
        return;
    }

    const ul = document.createElement('ul');
    members.forEach(member => {
        const li = document.createElement('li');
        li.className = 'member-item';
        li.innerHTML = `
            <img src="${member.avatar_url || '/static/img/default-avatar.png'}" alt="${member.username}" class="member-avatar-small">
            <span class="member-name">${member.username}</span>
            ${member.is_owner ? '<span class="badge owner-badge">Owner</span>' : ''}
        `;
        ul.appendChild(li);
    });
    currentMembersListContainer.appendChild(ul);
}

function populateFriendsToAddList(friendsToDisplay) {
    if (!friendsToAddListContainer) return;
    friendsToAddListContainer.innerHTML = '';

    if (friendsToDisplay.length === 0) {
        if (settingsFriendSearchInput && settingsFriendSearchInput.value.trim() !== '') {
            friendsToAddListContainer.innerHTML = '<p class="no-friends-message">No friends match your search or all matching friends are already in this group.</p>';
        } else {
            friendsToAddListContainer.innerHTML = '<p class="no-friends-message">All your friends are already in this group, or you have no other friends to add.</p>';
        }
        return;
    }

    const ul = document.createElement('ul');
    friendsToDisplay.forEach(friend => {
        const li = document.createElement('li');
        li.className = 'friend-item-to-add';
        li.innerHTML = `
            <input type="checkbox" id="settings-friend-checkbox-${friend.id}" name="friend_ids_to_add" value="${friend.id}" class="friend-checkbox-input">
            <label for="settings-friend-checkbox-${friend.id}">
                <img src="${friend.avatar_url || '/static/img/default-avatar.png'}" alt="${friend.username}" class="friend-avatar-small">
                <span>${friend.username}</span>
            </label>
        `;
        const labelElement = li.querySelector('label');
        if (labelElement) {
            labelElement.addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT') { // Prevent double toggle
                    const checkbox = li.querySelector(`#settings-friend-checkbox-${friend.id}`);
                    if (checkbox) checkbox.checked = !checkbox.checked;
                }
            });
        }
        ul.appendChild(li);
    });
    friendsToAddListContainer.appendChild(ul);
}

function handleSettingsFriendSearch() {
    if (!settingsFriendSearchInput || !allFriendsForSettingsCache) return;
    const query = settingsFriendSearchInput.value.trim().toLowerCase();
    if (query === "") {
        populateFriendsToAddList(allFriendsForSettingsCache);
        return;
    }
    const filteredFriends = allFriendsForSettingsCache.filter(friend =>
        friend.username.toLowerCase().includes(query)
    );
    populateFriendsToAddList(filteredFriends);
}

// --- Modal Lifecycle ---
export async function openGroupSettingsModal(groupId) {
    if (!settingsModal || !groupId) {
        console.error("Settings modal not initialized or groupId missing for open.");
        alert("Cannot open group settings at the moment.");
        return;
    }
    console.log(`Opening group settings modal for group ID: ${groupId}`);
    currentActiveGroupIdForSettings = groupId;

    if (settingsForm) settingsForm.reset(); // Clear previous form values
    if (settingsGroupIdInput) settingsGroupIdInput.value = groupId;
    if (settingsFriendSearchInput) settingsFriendSearchInput.value = '';
    if (settingsErrorMessageElement) {
        settingsErrorMessageElement.textContent = '';
        settingsErrorMessageElement.style.display = 'none';
    }
    
    settingsSaveButton.disabled = true;
    settingsSaveButton.textContent = 'Loading...';

    // Clear lists before fetching
    if (currentMembersListContainer) currentMembersListContainer.innerHTML = '<p class="loading-message">Loading members...</p>';
    if (friendsToAddListContainer) friendsToAddListContainer.innerHTML = '<p class="loading-message">Loading friends...</p>';


    const groupDetails = await fetchGroupDetailsForSettings(groupId);

    if (groupDetails) {
        if (editGroupNameInput) editGroupNameInput.value = groupDetails.name || '';
        if (editGroupDescriptionInput) editGroupDescriptionInput.value = groupDetails.description || '';
        populateCurrentMembersList(groupDetails.members || []);
        
        const existingMemberIds = (groupDetails.members || []).map(m => m.user_id); // Assuming member object has user_id
        await fetchFriendsForAdding(existingMemberIds).then(friends => {
            populateFriendsToAddList(friends);
        });
        settingsSaveButton.disabled = false;
        settingsSaveButton.textContent = 'Save Changes';
    } else {
        // Error messages are displayed by fetch functions
        // Keep save button disabled if group details failed to load
        settingsSaveButton.textContent = 'Save Changes'; // Reset text even on failure
        settingsSaveButton.disabled = true;
    }

    settingsModal.style.display = 'flex';
    requestAnimationFrame(() => {
        settingsModal.classList.add('visible');
        if (editGroupNameInput && groupDetails) editGroupNameInput.focus(); // Focus only if loaded
    });
}

function closeGroupSettingsModal() {
    if (!settingsModal) return;
    settingsModal.classList.remove('visible');

    // Explicitly clear fields and caches
    if (editGroupNameInput) editGroupNameInput.value = '';
    if (editGroupDescriptionInput) editGroupDescriptionInput.value = '';
    if (settingsFriendSearchInput) settingsFriendSearchInput.value = '';
    if (currentMembersListContainer) currentMembersListContainer.innerHTML = '';
    if (friendsToAddListContainer) friendsToAddListContainer.innerHTML = '';
    if (settingsErrorMessageElement) {
        settingsErrorMessageElement.textContent = '';
        settingsErrorMessageElement.style.display = 'none';
    }
    allFriendsForSettingsCache = [];
    currentActiveGroupIdForSettings = null;
    if (settingsForm) settingsForm.reset();


    const transitionDuration = parseFloat(getComputedStyle(settingsModal).transitionDuration) * 1000 || 300;
    setTimeout(() => {
        settingsModal.style.display = 'none';
    }, transitionDuration);
}

async function handleUpdateGroupSubmit(event) {
    event.preventDefault();
    if (!editGroupNameInput || !editGroupDescriptionInput || !settingsSaveButton || !settingsErrorMessageElement || !friendsToAddListContainer || !currentActiveGroupIdForSettings) {
        console.error("Group settings form submission aborted: Critical elements missing.");
        return;
    }

    const name = editGroupNameInput.value.trim();
    const description = editGroupDescriptionInput.value.trim(); // Description can be empty
    const selectedFriendCheckboxes = friendsToAddListContainer.querySelectorAll('input[name="friend_ids_to_add"]:checked');
    const add_member_ids = Array.from(selectedFriendCheckboxes).map(cb => parseInt(cb.value, 10));

    if (!name) {
        settingsErrorMessageElement.textContent = 'Group name is required.';
        settingsErrorMessageElement.style.display = 'block';
        editGroupNameInput.focus();
        return;
    }

    settingsSaveButton.disabled = true;
    settingsSaveButton.textContent = 'Saving...';
    settingsErrorMessageElement.textContent = '';
    settingsErrorMessageElement.style.display = 'none';

    try {
        const payload = { name, description };
        if (add_member_ids.length > 0) {
            payload.add_member_ids = add_member_ids;
        }
        
        // API endpoint needs to be created: PATCH /api/groups/<groupId>
        const updatedGroup = await apiRequest(`/api/groups/${currentActiveGroupIdForSettings}`, 'PATCH', payload);

        closeGroupSettingsModal();
        await loadGroups(); // Refresh the group list in the sidebar

        // Update active group header if the edited group is currently active
        const activeGroupLi = document.querySelector('.group-list-area .group-item.active');
        if (activeGroupLi && activeGroupLi.dataset.groupId === String(currentActiveGroupIdForSettings)) {
            const activeGroupNameEl = document.getElementById('active-group-name');
            // const activeGroupAvatarEl = document.getElementById('active-group-avatar'); // Avatar not changed here

            if (activeGroupNameEl) activeGroupNameEl.textContent = updatedGroup.name;
            // Update data attributes on the LI element for consistency
            activeGroupLi.dataset.groupName = updatedGroup.name;
             // If avatar could change, update it:
             // activeGroupLi.dataset.groupAvatar = updatedGroup.avatar_url;
             // activeGroupAvatarEl.src = updatedGroup.avatar_url || '/static/img/default-group-avatar.png';
        }
        
        // Optionally, inform other parts of the app that group data changed
        document.dispatchEvent(new CustomEvent('groupDataUpdated', { detail: { groupId: currentActiveGroupIdForSettings, updatedGroup } }));


    } catch (error) {
        console.error("Error updating group:", error);
        settingsErrorMessageElement.textContent = error.message || 'An unexpected error occurred.';
        settingsErrorMessageElement.style.display = 'block';
    } finally {
        settingsSaveButton.disabled = false;
        settingsSaveButton.textContent = 'Save Changes';
    }
}

export function setupGroupSettingsModal() {
    settingsModal = document.getElementById('group-settings-modal');
    if (!settingsModal) {
        console.warn("Group Settings Modal element (#group-settings-modal) not found. Feature unavailable.");
        return;
    }

    settingsForm = settingsModal.querySelector('#group-settings-form');
    settingsGroupIdInput = settingsModal.querySelector('#settings-group-id'); // Hidden input
    editGroupNameInput = settingsModal.querySelector('#edit-group-name');
    editGroupDescriptionInput = settingsModal.querySelector('#edit-group-description');
    currentMembersListContainer = settingsModal.querySelector('#current-members-list-container');
    settingsFriendSearchInput = settingsModal.querySelector('#settings-modal-friend-search');
    friendsToAddListContainer = settingsModal.querySelector('#settings-modal-friends-to-add-list-container');
    settingsSaveButton = settingsModal.querySelector('#group-settings-save-btn');
    settingsCancelButton = settingsModal.querySelector('#group-settings-cancel-btn');
    settingsModalCloseBtnX = settingsModal.querySelector('#group-settings-modal-close-btn-x');
    settingsErrorMessageElement = settingsModal.querySelector('#group-settings-error-message');

    // Basic check for essential elements
    if (!settingsForm || !editGroupNameInput || !settingsSaveButton || !settingsCancelButton || !settingsModalCloseBtnX) {
        console.error("Essential elements for Group Settings Modal are missing. Aborting setup.");
        settingsModal = null; // Prevent usage
        return;
    }


    if (settingsForm && settingsSaveButton) {
        settingsForm.addEventListener('submit', handleUpdateGroupSubmit);
    }

    if (settingsCancelButton) settingsCancelButton.addEventListener('click', closeGroupSettingsModal);
    if (settingsModalCloseBtnX) settingsModalCloseBtnX.addEventListener('click', closeGroupSettingsModal);
    
    if (settingsFriendSearchInput) {
        settingsFriendSearchInput.addEventListener('input', handleSettingsFriendSearch);
    }

    settingsModal.addEventListener('click', (event) => {
        if (event.target === settingsModal) { // Click on backdrop
            closeGroupSettingsModal();
        }
    });

    console.log("Group Settings Modal setup complete.");
}