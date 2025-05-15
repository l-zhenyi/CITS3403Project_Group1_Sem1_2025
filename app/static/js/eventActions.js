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