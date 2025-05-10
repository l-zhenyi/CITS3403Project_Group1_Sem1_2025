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
 * Fetches all events accessible to the user and processes them for various views.
 */
export async function loadAllUserEventsAndProcess() {
    console.log("Loading all user events...");
    allEventsData = []; // Clear existing allEventsData
    eventsByDate = {}; // Clear existing eventsByDate

    try {
        const response = await fetch('/api/me/all_events'); // GET request, CSRF not strictly needed here
        if (!response.ok) {
            throw new Error(`Failed to fetch all user events: ${response.status} ${response.statusText}`);
        }
        const events = await response.json();

        events.forEach(event => {
            const eventDate = event.date ? new Date(event.date) : null;
            if (eventDate && isNaN(eventDate.getTime())) {
                 console.warn(`Invalid date for event ID ${event.id}: ${event.date}. Skipping this event for calendar/list.`);
                 return; // Skip if date is invalid
            }

            // Ensure group_name and group_id are directly on the event object for easy access
            const processedEvent = {
                ...event,
                date: eventDate, // Store as Date object
                // group_id and group_name should be part of event.to_dict()
                // If not, fallback might be needed or error logged
                group_id: event.group_id, // Will be null if not part of a group via node
                group_name: event.group_name || 'Direct Invite/Other', // Backend should send null if no group
            };
            allEventsData.push(processedEvent);

            if (eventDate) { // Only add to calendar if there's a valid date
                const dateKey = eventDate.toISOString().split('T')[0]; // YYYY-MM-DD
                if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
                eventsByDate[dateKey].push({
                    title: event.title,
                    group_name: processedEvent.group_name, // Use consistent name
                    id: event.id,
                    // Add any other minimal info needed for calendar popups/tooltips
                    status: event.current_user_rsvp_status
                });
            }
        });
        console.log(`Processed ${allEventsData.length} total events. Events by date keys: ${Object.keys(eventsByDate).length}`);

    } catch (error) {
        console.error("Error loading or processing all user events:", error);
        // Potentially update UI to show error
        const eventListContainer = document.getElementById('event-list-container');
        if (eventListContainer) eventListContainer.innerHTML = '<p class="error-message">Could not load events.</p>';
        const calendarGridEl = document.getElementById('calendar-grid');
        if (calendarGridEl) calendarGridEl.innerHTML = '<p class="error-message" style="text-align:center; grid-column: 1/-1;">Could not load calendar events.</p>';
    }
}


// --- END OF FILE dataHandle.js ---