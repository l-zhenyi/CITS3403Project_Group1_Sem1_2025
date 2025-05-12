// --- START OF FILE static/js/groupSettingsModalManager.js ---
// static/js/groupSettingsModalManager.js
import { loadGroups, groupsData } from './dataHandle.js';

let settingsModal, settingsForm, settingsGroupIdInput,
    editGroupNameInput, editGroupDescriptionInput,
    currentMembersListContainer, settingsFriendSearchInput,
    friendsToAddListContainer, settingsSaveButton,
    settingsCancelButton, settingsModalCloseBtnX,
    settingsErrorMessageElement,
    // --- NEW: Permission Elements ---
    permissionsSectionElement,
    settingsAllowEditNameCheckbox,
    settingsAllowEditDescriptionCheckbox,
    settingsAllowManageMembersCheckbox,
    addMembersSectionWrapper; // Wrapper for the "Add Members" section

let currentActiveGroupIdForSettings = null;
let allFriendsForSettingsCache = [];
let currentGroupIsOwner = false; // Store if current user is owner of the group being edited

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
        // API now returns permission flags and is_current_user_owner
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
            <input type="checkbox" id="settings-friend-checkbox-${friend.id}" name="friend_ids_to_add" value="${friend.id}" class="friend-checkbox-input modal-checkbox">
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
    currentGroupIsOwner = false; // Reset owner status

    if (settingsForm) settingsForm.reset();
    if (settingsGroupIdInput) settingsGroupIdInput.value = groupId;
    if (settingsFriendSearchInput) settingsFriendSearchInput.value = '';
    if (settingsErrorMessageElement) {
        settingsErrorMessageElement.textContent = '';
        settingsErrorMessageElement.style.display = 'none';
    }
    
    settingsSaveButton.disabled = true;
    settingsSaveButton.textContent = 'Loading...';

    if (currentMembersListContainer) currentMembersListContainer.innerHTML = '<p class="loading-message">Loading members...</p>';
    if (friendsToAddListContainer) friendsToAddListContainer.innerHTML = '<p class="loading-message">Loading friends...</p>';
    if (permissionsSectionElement) permissionsSectionElement.style.display = 'none'; // Hide initially


    const groupDetails = await fetchGroupDetailsForSettings(groupId);

    if (groupDetails) {
        currentGroupIsOwner = groupDetails.is_current_user_owner || false;

        if (editGroupNameInput) editGroupNameInput.value = groupDetails.name || '';
        if (editGroupDescriptionInput) editGroupDescriptionInput.value = groupDetails.description || '';
        populateCurrentMembersList(groupDetails.members || []);
        
        // --- Populate Permission Checkboxes ---
        if (settingsAllowEditNameCheckbox) settingsAllowEditNameCheckbox.checked = groupDetails.allow_member_edit_name || false;
        if (settingsAllowEditDescriptionCheckbox) settingsAllowEditDescriptionCheckbox.checked = groupDetails.allow_member_edit_description || false;
        if (settingsAllowManageMembersCheckbox) settingsAllowManageMembersCheckbox.checked = groupDetails.allow_member_manage_members || false;

        // --- UI Element Disabling Logic ---
        if (permissionsSectionElement) {
            permissionsSectionElement.style.display = currentGroupIsOwner ? 'block' : 'none';
        }
        [settingsAllowEditNameCheckbox, settingsAllowEditDescriptionCheckbox, settingsAllowManageMembersCheckbox].forEach(cb => {
            if (cb) cb.disabled = !currentGroupIsOwner;
        });

        if (editGroupNameInput) {
            editGroupNameInput.disabled = !currentGroupIsOwner && !groupDetails.allow_member_edit_name;
        }
        if (editGroupDescriptionInput) {
            editGroupDescriptionInput.disabled = !currentGroupIsOwner && !groupDetails.allow_member_edit_description;
        }

        const canManageMembers = currentGroupIsOwner || groupDetails.allow_member_manage_members;
        if (addMembersSectionWrapper) {
            addMembersSectionWrapper.classList.toggle('section-disabled', !canManageMembers);
        }
        if (settingsFriendSearchInput) settingsFriendSearchInput.disabled = !canManageMembers;
        // If friendsToAddListContainer itself should be non-interactive, disable its children or use CSS pointer-events
        if (friendsToAddListContainer) {
             friendsToAddListContainer.querySelectorAll('input, label').forEach(el => {
                if (el.tagName === 'INPUT') el.disabled = !canManageMembers;
                else el.style.pointerEvents = canManageMembers ? 'auto' : 'none';
             });
        }
        // --- End UI Element Disabling Logic ---
        
        const existingMemberIds = (groupDetails.members || []).map(m => m.user_id);
        await fetchFriendsForAdding(existingMemberIds).then(friends => {
            populateFriendsToAddList(friends);
        });
        settingsSaveButton.disabled = false; // Enable save if details loaded, even if some fields are disabled for non-owner
        settingsSaveButton.textContent = 'Save Changes';
    } else {
        settingsSaveButton.textContent = 'Save Changes';
        settingsSaveButton.disabled = true; // Keep disabled if critical data failed
    }

    settingsModal.style.display = 'flex';
    requestAnimationFrame(() => {
        settingsModal.classList.add('visible');
        if (editGroupNameInput && groupDetails && !editGroupNameInput.disabled) editGroupNameInput.focus();
    });
}

function closeGroupSettingsModal() {
    if (!settingsModal) return;
    settingsModal.classList.remove('visible');

    if (editGroupNameInput) editGroupNameInput.value = '';
    if (editGroupDescriptionInput) editGroupDescriptionInput.value = '';
    if (settingsFriendSearchInput) settingsFriendSearchInput.value = '';
    if (currentMembersListContainer) currentMembersListContainer.innerHTML = '';
    if (friendsToAddListContainer) friendsToAddListContainer.innerHTML = '';
    if (settingsErrorMessageElement) {
        settingsErrorMessageElement.textContent = '';
        settingsErrorMessageElement.style.display = 'none';
    }
    // Reset permission checkboxes
    [settingsAllowEditNameCheckbox, settingsAllowEditDescriptionCheckbox, settingsAllowManageMembersCheckbox].forEach(cb => {
        if(cb) cb.checked = false;
    });

    allFriendsForSettingsCache = [];
    currentActiveGroupIdForSettings = null;
    currentGroupIsOwner = false;
    if (settingsForm) settingsForm.reset();


    const transitionDuration = parseFloat(getComputedStyle(settingsModal).transitionDuration) * 1000 || 300;
    setTimeout(() => {
        settingsModal.style.display = 'none';
    }, transitionDuration);
}

async function handleUpdateGroupSubmit(event) {
    event.preventDefault();
    if (!settingsSaveButton || !settingsErrorMessageElement || !currentActiveGroupIdForSettings) {
        console.error("Group settings form submission aborted: Critical elements missing.");
        return;
    }

    const payload = {};
    let changesMade = false;

    // Only include fields if they are not disabled (i.e., user has permission or is owner)
    if (editGroupNameInput && !editGroupNameInput.disabled) {
        const name = editGroupNameInput.value.trim();
        if (!name) {
            settingsErrorMessageElement.textContent = 'Group name is required.';
            settingsErrorMessageElement.style.display = 'block';
            editGroupNameInput.focus();
            return;
        }
        payload.name = name;
        changesMade = true; // Assume name can always be changed if field is enabled
    }
    if (editGroupDescriptionInput && !editGroupDescriptionInput.disabled) {
        payload.description = editGroupDescriptionInput.value.trim();
        changesMade = true; // Assume description can always be changed if field is enabled
    }
    
    // Include permission flags only if user is owner (checkboxes would be enabled)
    if (currentGroupIsOwner) {
        if (settingsAllowEditNameCheckbox) payload.allow_member_edit_name = settingsAllowEditNameCheckbox.checked;
        if (settingsAllowEditDescriptionCheckbox) payload.allow_member_edit_description = settingsAllowEditDescriptionCheckbox.checked;
        if (settingsAllowManageMembersCheckbox) payload.allow_member_manage_members = settingsAllowManageMembersCheckbox.checked;
        changesMade = true; // Changing permissions is a change
    }

    // Check if "Add Members" section is enabled for the current user
    const canManageMembersSubmit = currentGroupIsOwner || (settingsAllowManageMembersCheckbox && settingsAllowManageMembersCheckbox.checked);

    if (friendsToAddListContainer && canManageMembersSubmit) { 
        const selectedFriendCheckboxes = friendsToAddListContainer.querySelectorAll('input[name="friend_ids_to_add"]:checked');
        if (selectedFriendCheckboxes.length > 0) {
            payload.add_member_ids = Array.from(selectedFriendCheckboxes).map(cb => parseInt(cb.value, 10));
            changesMade = true;
        }
    }
    
    settingsSaveButton.disabled = true;
    settingsSaveButton.textContent = 'Saving...';
    settingsErrorMessageElement.textContent = '';
    settingsErrorMessageElement.style.display = 'none';

    try {
        const updatedGroup = await apiRequest(`/api/groups/${currentActiveGroupIdForSettings}`, 'PATCH', payload);

        closeGroupSettingsModal(); 
        await loadGroups(); 

        const editedGroupId = updatedGroup.id; 

        const groupListUL = document.querySelector('.group-list-area .groups-ul');
        if (groupListUL && editedGroupId) {
            const groupLiToMakeActive = groupListUL.querySelector(`.group-item[data-group-id="${editedGroupId}"]`);
            if (groupLiToMakeActive) {
                // Clicking the LI will trigger main.js's activateGroup,
                // which will use the fresh name from the updated groupsData to update the header.
                groupLiToMakeActive.click();
            }
        }
        
        document.dispatchEvent(new CustomEvent('groupDataUpdated', { detail: { groupId: editedGroupId, updatedGroup } }));

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
    settingsGroupIdInput = settingsModal.querySelector('#settings-group-id');
    editGroupNameInput = settingsModal.querySelector('#edit-group-name');
    editGroupDescriptionInput = settingsModal.querySelector('#edit-group-description');
    currentMembersListContainer = settingsModal.querySelector('#current-members-list-container');
    settingsFriendSearchInput = settingsModal.querySelector('#settings-modal-friend-search');
    friendsToAddListContainer = settingsModal.querySelector('#settings-modal-friends-to-add-list-container');
    addMembersSectionWrapper = settingsModal.querySelector('#add-members-section-wrapper'); // Get wrapper
    settingsSaveButton = settingsModal.querySelector('#group-settings-save-btn');
    settingsCancelButton = settingsModal.querySelector('#group-settings-cancel-btn');
    settingsModalCloseBtnX = settingsModal.querySelector('#group-settings-modal-close-btn-x');
    settingsErrorMessageElement = settingsModal.querySelector('#group-settings-error-message');

    // --- Get Permission Checkbox Elements ---
    permissionsSectionElement = settingsModal.querySelector('.permissions-section');
    settingsAllowEditNameCheckbox = settingsModal.querySelector('#settings-allow-edit-name');
    settingsAllowEditDescriptionCheckbox = settingsModal.querySelector('#settings-allow-edit-description');
    settingsAllowManageMembersCheckbox = settingsModal.querySelector('#settings-allow-manage-members');


    if (!settingsForm || !editGroupNameInput || !settingsSaveButton || !settingsCancelButton || !settingsModalCloseBtnX || !permissionsSectionElement || !addMembersSectionWrapper) {
        console.error("Essential elements for Group Settings Modal (including permissions section and add members wrapper) are missing. Aborting setup.");
        settingsModal = null; 
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
        if (event.target === settingsModal) { 
            closeGroupSettingsModal();
        }
    });

    console.log("Group Settings Modal setup complete (with permissions).");
}
// --- END OF FILE static/js/groupSettingsModalManager.js ---