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

        const groupListUL = document.querySelector('.group-list-area .groups-ul'); // Target specific UL
        if (!groupListUL) {
            console.warn("Group list UL element (.groups-ul) not found.");
            return; // Cannot populate list
        }

        // REMOVED: Logic for detaching/re-attaching the "Add New Group" button
        // as it's now outside this UL.

        groupListUL.innerHTML = ''; // Clear previous dynamic items

        groups.forEach(group => {
            const li = document.createElement('li');
            li.classList.add('group-item');
            li.dataset.groupId = group.id;
            li.dataset.groupName = group.name;
            li.dataset.groupAvatar = group.avatar_url || ''; // Ensure dataset has value

            li.innerHTML = `
                <img src="${group.avatar_url || '/static/img/default-group-avatar.png'}" alt="${group.name || 'Group'} Avatar" class="group-avatar">
                <span class="group-name">${group.name || 'Unnamed Group'}</span>`;
            groupListUL.appendChild(li);
        });

        // Call handler attachment AFTER list is populated
        // NOTE: Click handling is now primarily done in main.js for better state management.

        console.log("Groups loaded:", groupsData.length);

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

// --- END OF FILE dataHandle.js ---