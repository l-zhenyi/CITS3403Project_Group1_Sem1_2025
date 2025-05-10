// --- START OF FILE eventActions.js ---

// eventActions.js
import { groupsData, loadAllUserEventsAndProcess } from './dataHandle.js';
import { renderGroupEvents, renderAllEventsList, renderCalendar, createNodeElement } from './eventRenderer.js';

// let calendarDate = new Date(); // This was in viewManager, probably not needed here
// let currentEventFilter = 'upcoming'; // This global var here might be the issue if not synced

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

// addGroup function seems fine, no changes needed for this issue.
export async function addGroup(name, avatarUrl, makeActive = false) {
    // ... (existing code) ...
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
    newGroup.events = [];

    groupsData.push(newGroup);

    const groupListUL = document.querySelector('.group-list-area ul');
    const li = document.createElement('li');
    li.classList.add('group-item');
    li.dataset.groupId = newGroup.id;
    li.dataset.groupName = newGroup.name;
    li.dataset.groupAvatar = newGroup.avatar_url;

    li.innerHTML = `
        <img src="${newGroup.avatar_url}" alt="${newGroup.name} Avatar" class="group-avatar">
        <div class="group-info">
            <span class="group-name">${newGroup.name}</span>
            <span class="group-stats">0 upcoming events</span>
        </div>
    `;
    // Click handling for new group items is best done by the main.js listener on groupListUL

    if(groupListUL) groupListUL.appendChild(li);
    // If makeActive is true, the new group LI should be clicked by the caller (e.g., groupModalManager)
    // to ensure consistent activation logic from main.js
    // if (makeActive && typeof li.click === 'function') li.click();


    return newGroup;
}


export function hookEventFilterBar() {
    const filterPillsContainer = document.querySelector('.event-filter-bar');
    if (!filterPillsContainer) {
        console.warn("Filter pills container (.event-filter-bar) not found.");
        return;
    }

    // Check if a filter is already active (e.g., from page load or previous state)
    let currentActiveFilter = filterPillsContainer.querySelector('.filter-pill.active')?.dataset.filter;
    if (!currentActiveFilter) {
        // If no filter is active, make 'upcoming' the default active one
        const upcomingPill = filterPillsContainer.querySelector('.filter-pill[data-filter="upcoming"]');
        if (upcomingPill) {
            upcomingPill.classList.add('active');
            currentActiveFilter = 'upcoming';
        }
    }
    // Initial render based on the determined active filter (or default 'upcoming')
    // renderAllEventsList(currentActiveFilter || 'upcoming'); // This call might be redundant if viewManager also calls it.

    filterPillsContainer.addEventListener('click', (e) => {
        const pill = e.target.closest('.filter-pill');
        if (!pill) return;

        const filter = pill.dataset.filter || 'upcoming';

        // Only update if the filter actually changed
        const previouslyActivePill = filterPillsContainer.querySelector('.filter-pill.active');
        if (previouslyActivePill === pill) return; // Clicked on already active pill

        if (previouslyActivePill) {
            previouslyActivePill.classList.remove('active');
        }
        pill.classList.add('active');

        // When a pill is clicked, render the list with the new filter
        renderAllEventsList(filter);
    });
}
// --- END OF FILE eventActions.js ---