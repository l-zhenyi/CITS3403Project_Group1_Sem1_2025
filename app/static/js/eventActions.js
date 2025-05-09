// --- START OF FILE eventActions.js ---

// eventActions.js
import { groupsData, loadAllUserEventsAndProcess } from './dataHandle.js'; // MODIFIED: Removed processAllEvents, using loadAllUserEventsAndProcess
import { renderGroupEvents, renderAllEventsList, renderCalendar, createNodeElement } from './eventRenderer.js';

let calendarDate = new Date();
let currentEventFilter = 'upcoming';

// Ensure this helper function is available or imported if needed elsewhere
function formatEventDateForDisplay(date) {
    if (!date || !(date instanceof Date)) return 'Date not specified';
    try {
        if (isNaN(date.getTime())) return 'Invalid Date';
        return date.toLocaleString(undefined, {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true
        });
    } catch (e) {
        console.error("Error formatting date:", date, e);
        return 'Error displaying date';
    }
}


function generateUniqueId(prefix = 'item') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

export async function addGroup(name, avatarUrl, makeActive = false) {
    if (!name) return null;

    const defaultAvatar = avatarUrl || `https://via.placeholder.com/40/cccccc/FFFFFF?text=${name[0].toUpperCase()}`;

    const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
    const headers = { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
    if (csrfTokenMeta) {
        headers['X-CSRFToken'] = csrfTokenMeta.getAttribute('content');
    } else {
        console.warn("CSRF token meta tag not found. addGroup POST request may fail.");
    }

    // 🔁 Call your Flask API
    const res = await fetch('/api/groups', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ name, avatar_url: defaultAvatar })
    });

    if (!res.ok) {
        alert("Failed to create group.");
        return null;
    }

    const newGroup = await res.json();
    newGroup.events = []; // Initialize events if API doesn't return them

    groupsData.push(newGroup); // Update shared state

    // --- DOM update ---
    const groupListUL = document.querySelector('.group-list-area ul');
    const li = document.createElement('li');
    li.classList.add('group-item');
    li.dataset.groupId = newGroup.id;
    li.dataset.groupName = newGroup.name;
    // Use newGroup.avatar_url which should be the URL returned/confirmed by the API
    li.dataset.groupAvatar = newGroup.avatar_url;

    li.innerHTML = `
        <img src="${newGroup.avatar_url}" alt="${newGroup.name} Avatar" class="group-avatar">
        <div class="group-info">
            <span class="group-name">${newGroup.name}</span>
            <span class="group-stats">0 upcoming events</span>
        </div>
    `;

    // Re-attach click listener to the *new* li element
    li.addEventListener('click', () => {
        // Using main.js's activateGroup logic might be better for consistency
        // For now, direct implementation:
        document.querySelectorAll('.group-item').forEach(item => item.classList.remove('active'));
        li.classList.add('active');

        const groupNameEl = document.getElementById('active-group-name');
        const groupAvatarEl = document.getElementById('active-group-avatar');

        if (groupNameEl) groupNameEl.textContent = `${newGroup.name} Events`;
        if (groupAvatarEl) groupAvatarEl.src = newGroup.avatar_url;

        renderGroupEvents(newGroup.id); // Render events for the newly added group
    });


    if(groupListUL) groupListUL.appendChild(li);
    if (makeActive) li.click(); // Trigger the click to activate

    return newGroup;
}

export function hookEventFilterBar() {
    document.querySelectorAll('.filter-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const filter = pill.dataset.filter || 'upcoming';

            document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');

            // Assuming renderAllEventsList is correctly imported and uses shared data
            renderAllEventsList(filter);
        });
    });
}
// --- END OF FILE eventActions.js ---