// --- START OF FILE groupModalManager.js ---
import { loadGroups } from './dataHandle.js'; // For refreshing group list

let createGroupModal, createGroupForm, groupNameInput, groupDescriptionInput,
    friendsListContainer, createGroupSaveButton, createGroupCancelButton,
    createGroupModalCloseBtnX, // For the 'X' button
    errorMessageElement,
    friendSearchInput; // <-- NEW: For friend search

let allFriendsCache = []; // Cache friends list

async function fetchFriends() {
    // For simplicity, we'll refetch each time modal opens for now.
    // A more robust cache would involve expiry or checking for new friends.

    if (friendsListContainer) friendsListContainer.innerHTML = '<p class="loading-friends-message">Loading friends...</p>';

    try {
        const response = await fetch('/api/me/friends'); // GET, no CSRF needed
        if (!response.ok) throw new Error('Failed to fetch friends list.');
        allFriendsCache = await response.json();
        return allFriendsCache;
    } catch (error) {
        console.error("Error fetching friends:", error);
        if (errorMessageElement) errorMessageElement.textContent = "Could not load friends list.";
        if (friendsListContainer) friendsListContainer.innerHTML = '<p class="no-friends-message">Error loading friends.</p>';
        return []; // Return empty on error
    }
}

function populateFriendsList(friendsToDisplay) { // Renamed parameter
    if (!friendsListContainer) return;
    friendsListContainer.innerHTML = ''; // Clear previous list (or loading/empty message)

    if (friendsToDisplay.length === 0) {
        if (friendSearchInput && friendSearchInput.value.trim() !== '') {
             friendsListContainer.innerHTML = '<p class="no-friends-message">No friends match your search.</p>';
        } else {
             friendsListContainer.innerHTML = '<p class="no-friends-message">You have no friends to add yet. Add some on the Friends page!</p>';
        }
        return;
    }

    const ul = document.createElement('ul');
    ul.className = 'modal-friends-list';
    friendsToDisplay.forEach(friend => {
        const li = document.createElement('li');
        li.className = 'friend-item-to-add';
        // Make label clickable for checkbox
        li.innerHTML = `
            <input type="checkbox" id="friend-checkbox-${friend.id}" name="friend_ids" value="${friend.id}" class="friend-checkbox-input">
            <label for="friend-checkbox-${friend.id}">
                <img src="${friend.avatar_url || '/static/img/default-avatar.png'}" alt="${friend.username}" class="friend-avatar-small">
                <span>${friend.username}</span>
            </label>
        `;
        // Manually toggle checkbox if label (excluding checkbox itself) is clicked
        const labelElement = li.querySelector('label');
        if (labelElement) {
            labelElement.addEventListener('click', (e) => {
                // Prevent double toggle if the click was directly on the checkbox input
                if (e.target.tagName !== 'INPUT') {
                    const checkbox = li.querySelector(`#friend-checkbox-${friend.id}`);
                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;
                    }
                }
            });
        }
        ul.appendChild(li);
    });
    friendsListContainer.appendChild(ul);
}

function handleFriendSearch() {
    if (!friendSearchInput || !allFriendsCache) return;
    const query = friendSearchInput.value.trim().toLowerCase();
    if (query === "") {
        populateFriendsList(allFriendsCache); // Show all if search is empty
        return;
    }
    const filteredFriends = allFriendsCache.filter(friend =>
        friend.username.toLowerCase().includes(query)
    );
    populateFriendsList(filteredFriends);
}
let isCreateGroupModalInitialized = false;
export function openCreateGroupModal() {
     if (isCreateGroupModalInitialized) return; // Prevent reinitialization
    isCreateGroupModalInitialized = true;

    if (createGroupForm) createGroupForm.reset(); // Resets input fields
    if (groupNameInput) groupNameInput.value = ''; // Explicit clear
    if (groupDescriptionInput) groupDescriptionInput.value = ''; // Explicit clear
    if (friendSearchInput) friendSearchInput.value = ''; // Clear search input
    if (errorMessageElement) {
         errorMessageElement.textContent = '';
         errorMessageElement.style.display = 'none';
    }

    // Fetch friends and populate list
    fetchFriends().then(friends => {
        populateFriendsList(friends); // Initially populate with all friends
    });

    createGroupModal.style.display = 'flex';
    requestAnimationFrame(() => {
        createGroupModal.classList.add('visible');
        if (groupNameInput) groupNameInput.focus();
    });
}

function closeCreateGroupModal() {
    if (!createGroupModal) return;
    createGroupModal.classList.remove('visible');

    // Explicitly clear fields again on close
    if (groupNameInput) groupNameInput.value = '';
    if (groupDescriptionInput) groupDescriptionInput.value = '';
    if (friendSearchInput) friendSearchInput.value = '';
    if (friendsListContainer) friendsListContainer.innerHTML = '';
    if (errorMessageElement) {
        errorMessageElement.textContent = '';
        errorMessageElement.style.display = 'none';
    }
    allFriendsCache = []; // Clear cache on close

    const transitionDuration = parseFloat(getComputedStyle(createGroupModal).transitionDuration) * 1000 || 300;
    setTimeout(() => {
        createGroupModal.style.display = 'none';
    }, transitionDuration);
}

async function handleCreateGroupSubmit(event) {
    event.preventDefault();
    if (!groupNameInput || !groupDescriptionInput || !createGroupSaveButton || !errorMessageElement || !friendsListContainer) return;

    const name = groupNameInput.value.trim();
    const description = groupDescriptionInput.value.trim();
    // Get selected checkboxes from the currently VISIBLE list (after potential filtering)
    // OR, if we want to respect selections even if filtered out, we'd need to manage selected IDs separately.
    // For simplicity, current approach gets visible checked items.
    const selectedFriendCheckboxes = friendsListContainer.querySelectorAll('input[name="friend_ids"]:checked');
    const member_ids = Array.from(selectedFriendCheckboxes).map(cb => cb.value);

    if (!name) {
        errorMessageElement.textContent = 'Group name is required.';
        errorMessageElement.style.display = 'block';
        groupNameInput.focus();
        return;
    }

    createGroupSaveButton.disabled = true;
    createGroupSaveButton.textContent = 'Creating...';
    errorMessageElement.textContent = '';
    errorMessageElement.style.display = 'none';

    try {
        const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        if (csrfTokenMeta) {
            headers['X-CSRFToken'] = csrfTokenMeta.getAttribute('content');
        } else {
            console.warn("CSRF token meta tag not found for Create Group. Request may fail.");
        }

        const response = await fetch('/api/groups', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ name, description, member_ids })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `Failed to create group (${response.status})` }));
            throw new Error(errorData.error || `HTTP error ${response.status}`);
        }

        const newGroup = await response.json();
        closeCreateGroupModal();
        await loadGroups(); // Refresh the group list in the sidebar

        // Find the newly added group in the list and click it to make it active
        const groupListUL = document.querySelector('.group-list-area .groups-ul');
        if (groupListUL) {
            const newGroupLi = groupListUL.querySelector(`.group-item[data-group-id="${newGroup.id}"]`);
            if (newGroupLi) {
                newGroupLi.click(); // This will trigger activateGroup in main.js
            }
        }

    } catch (error) {
        console.error("Error creating group:", error);
        errorMessageElement.textContent = error.message || 'An unexpected error occurred.';
        errorMessageElement.style.display = 'block';
    } finally {
        createGroupSaveButton.disabled = false;
        createGroupSaveButton.textContent = 'Create Group';
    }
}

export function setupCreateGroupModal() {
    createGroupModal = document.getElementById('create-group-modal');
    if (!createGroupModal) {
        console.warn("Create Group Modal element (#create-group-modal) not found. Feature unavailable.");
        return;
    }

    createGroupForm = createGroupModal.querySelector('#create-group-form');
    groupNameInput = createGroupModal.querySelector('#new-group-name');
    groupDescriptionInput = createGroupModal.querySelector('#new-group-description');
    friendSearchInput = createGroupModal.querySelector('#modal-friend-search'); // <-- Get search input
    friendsListContainer = createGroupModal.querySelector('#modal-friends-list-container');
    createGroupSaveButton = createGroupModal.querySelector('#create-group-save-btn');
    createGroupCancelButton = createGroupModal.querySelector('#create-group-cancel-btn');
    createGroupModalCloseBtnX = createGroupModal.querySelector('#create-group-modal-close-btn-x');
    errorMessageElement = createGroupModal.querySelector('#create-group-error-message');

    const addNewGroupButton = document.getElementById('add-new-group-button');
    if (addNewGroupButton) {
        addNewGroupButton.addEventListener('click', openCreateGroupModal);
    } else {
        console.warn("Add New Group button (#add-new-group-button) in group list area not found.");
    }

    if (createGroupForm && createGroupSaveButton) {
        createGroupForm.addEventListener('submit', handleCreateGroupSubmit);
    } else {
         console.warn("Create group form or save button not found in modal.");
    }

    if (createGroupCancelButton) {
        createGroupCancelButton.addEventListener('click', closeCreateGroupModal);
    }
    if (createGroupModalCloseBtnX) {
        createGroupModalCloseBtnX.addEventListener('click', closeCreateGroupModal);
    }

    // Add event listener for friend search
    if (friendSearchInput) {
        friendSearchInput.addEventListener('input', handleFriendSearch);
    }

    createGroupModal.addEventListener('click', (event) => {
        if (event.target === createGroupModal) {
            closeCreateGroupModal();
        }
    });

    document.querySelectorAll('.group-avatar').forEach(avatar => {
    console.log('Avatar src before:', avatar.src);
    if (!avatar.src || avatar.src.includes('default-group-avatar.png')) {
        avatar.src = avatar.dataset.groupAvatar || avatar.src;
    }
    console.log('Avatar src after:', avatar.src);
});

    console.log("Create Group Modal setup complete.");
}
// --- END OF FILE groupModalManager.js ---