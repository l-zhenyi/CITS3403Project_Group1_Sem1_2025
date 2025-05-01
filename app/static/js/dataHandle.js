// --- START OF FILE dataHandle.js ---

// dataHandler.js
import { renderGroupEvents } from './eventRenderer.js'; // Import needed for click handler

export let groupsData = [];
export let allEventsData = [];
export let eventsByDate = {};

// --- Utility Functions ---

// Parse hash for initial view state
export function parseHash() {
    const hash = window.location.hash.slice(1); // Remove "#"
    if (!hash) return { view: "groups", groupId: null }; // Default if no hash

    // Simple parsing assuming format like view=groups&groupId=1
    // More robust parsing might be needed if format is complex
    const params = new URLSearchParams(hash);
    const view = params.get("view") || "groups";
    const groupId = params.get("groupId") || null; // Get groupId if present

    // Specific logic for /groups/1 format if used instead of query params
    if (!params.has('view') && hash.startsWith('groups/')) {
         const parts = hash.split('/');
         if (parts.length === 2 && parts[0] === 'groups' && !isNaN(parseInt(parts[1], 10))) {
             return { view: 'groups', groupId: parts[1] };
         }
    }

    return { view, groupId };
}


// Update hash (example - adjust based on your desired format)
// Using query params is generally easier to parse reliably
export function updateHash(view, groupId = null) {
    const params = new URLSearchParams();
    params.set("view", view);
    if (view === "groups" && groupId) {
        params.set("groupId", groupId); // Keep groupId for groups view
    }
    // Don't set groupId for other views unless needed
    window.location.hash = params.toString();
}


// --- Data Loading & Processing ---

// Load groups from API and populate the list
export async function loadGroups() {
    try {
        const res = await fetch('/api/groups');
        if (!res.ok) throw new Error(`Failed to fetch groups: ${res.statusText}`);
        const groups = await res.json();

        // Update the shared state
        groupsData.length = 0; // Clear existing
        groupsData.push(...groups);

        const groupList = document.querySelector('.group-list-area ul');
        if (!groupList) {
            console.warn("Group list UL element not found.");
            return; // Cannot populate list
        }

        groupList.innerHTML = ''; // Clear previous items

        groups.forEach(group => {
            const li = document.createElement('li');
            li.classList.add('group-item');
            li.dataset.groupId = group.id;
            li.dataset.groupName = group.name;
            li.dataset.groupAvatar = group.avatar_url || ''; // Ensure dataset has value

            li.innerHTML = `
                <img src="${group.avatar_url || '/static/img/default-group-avatar.png'}" alt="${group.name || 'Group'} Avatar" class="group-avatar">
                <span class="group-name">${group.name || 'Unnamed Group'}</span>`;
            groupList.appendChild(li);
        });

        // Call handler attachment AFTER list is populated
        // NOTE: Click handling is now primarily done in main.js for better state management.
        // attachGroupClickHandlers(); // REMOVE this if main.js handles the clicks on the UL

        // Process events only if needed immediately (might be redundant if renderGroupEvents does it)
        // processAllEvents(); // Consider calling this only when switching to 'events' or 'calendar' view

        console.log("Groups loaded:", groupsData.length);

        // Don't automatically click firstLi here, let main.js handle initial activation logic

    } catch (error) {
        console.error("Error loading groups:", error);
        // Optionally display an error message to the user
    }
}


/**
 * Flattens all group events into allEventsData and maps them by date for the calendar view.
 * NOTE: This relies on `groupsData` having nested `events`. This is inefficient.
 * It's better to have a dedicated `/api/events` endpoint for the 'all events' list
 * and `/api/calendar-events` for calendar-specific data.
 * Keeping this structure as per the original file for now.
 */
export function processAllEvents() {
    console.warn("processAllEvents relies on groupsData containing nested events, which might be inefficient or outdated. Consider dedicated API endpoints.");
    allEventsData = [];
    eventsByDate = {};

    groupsData.forEach(group => {
        // This assumes the /api/groups response INCLUDES all events nested within each group.
        // This is generally NOT how it's structured with the /nodes?include=events approach.
        // The data for 'all events' list and 'calendar' likely needs separate fetching.
        const eventsToProcess = group.events || []; // Use events if available

        eventsToProcess.forEach(event => {
            // Ensure date is a Date object
            const eventDate = event.date instanceof Date ? event.date : (event.date ? new Date(event.date) : null);
            if (!eventDate || isNaN(eventDate)) return; // Skip if date is invalid

            allEventsData.push({
                ...event,
                group_id: group.id,
                group_name: group.name,
                date: eventDate // Store as Date object
            });

            const dateKey = eventDate.toISOString().split('T')[0]; // YYYY-MM-DD
            if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
            eventsByDate[dateKey].push({
                title: event.title,
                group: group.name,
                id: event.id // Include ID if needed for clicking calendar event
            });
        });
    });

    console.log(`Processed ${allEventsData.length} events for calendar/list based on groupsData.`);
}


// --- Redundant Click Handler (Keep ONLY if main.js doesn't handle it) ---
// It's generally better to have a single point of handling in main.js using event delegation.
/*
export function attachGroupClickHandlers() {
    const groupListUL = document.querySelector('.group-list-area ul');
    if (!groupListUL) return;

    // Remove previous listener if any (simple approach)
    // A more robust way involves storing the listener function reference
    // groupListUL.removeEventListener('click', handleGroupItemClick); // Needs named function

    const handleGroupItemClick = (e) => {
        const li = e.target.closest('.group-item');
        if (!li || li.classList.contains('active')) return; // Ignore if not on item or already active

        // Remove active from others
        document.querySelectorAll('.group-item.active').forEach(item => item.classList.remove('active'));
        // Add active to clicked
        li.classList.add('active');

        // Update header (example, adjust selectors/logic as needed)
        const name = li.dataset.groupName || 'Group Events';
        const avatar = li.dataset.groupAvatar || '/static/img/default-group-avatar.png';
        const activeGroupNameEl = document.getElementById('active-group-name');
        const activeGroupAvatarEl = document.getElementById('active-group-avatar');
        if (activeGroupNameEl) activeGroupNameEl.textContent = name;
        if (activeGroupAvatarEl) activeGroupAvatarEl.src = avatar;


        const groupId = li.dataset.groupId;
        console.log(`Group item clicked (dataHandle): ID ${groupId}`);
        if (groupId) {
            // Call renderGroupEvents from eventRenderer.js
            renderGroupEvents(groupId);
            // Update hash
            updateHash('groups', groupId);
        }
    };

    groupListUL.addEventListener('click', handleGroupItemClick);
}
*/
// --- END OF FILE dataHandle.js ---