// viewManager.js
import { renderGroupEvents, renderCalendar, renderAllEventsList } from './eventRenderer.js';
import { destroyParallax } from './parallax.js';
import { groupsData } from './dataHandle.js';

let calendarDate = new Date();
let currentEventFilter = 'upcoming';

export function switchView(viewName) {
    const plannerPane = document.getElementById('planner-pane');
    if (!plannerPane) return;

    // --- Reset Mobile State ---
    // Always remove mobile event view when switching main tabs
    plannerPane.classList.remove('mobile-event-view-active');

    // Remove all primary view classes
    plannerPane.classList.remove('calendar-view-active', 'events-view-active');
    // Note: Don't remove the base class 'planner-pane'

    // Deactivate all view tabs
    document.querySelectorAll('.view-tab').forEach(tab => tab.classList.remove('active'));
    const activeTab = document.getElementById(`${viewName}-tab`);
    activeTab?.classList.add('active');

    // Clear parallax if switching away from groups view potential state
    if (viewName !== 'groups') {
        destroyParallax();
    }

    // --- Apply new view ---
    if (viewName === 'calendar') {
        plannerPane.classList.add('calendar-view-active');
        renderCalendar(calendarDate.getFullYear(), calendarDate.getMonth());
    } else if (viewName === 'events') {
        plannerPane.classList.add('events-view-active');
        // Set default filter if needed, or use current
        const activeFilterPill = document.querySelector('.filter-pill.active');
        currentEventFilter = activeFilterPill?.dataset.filter || 'upcoming';
        renderAllEventsList(currentEventFilter);
    } else { // Default to 'groups' view
        // On Desktop: Find active group and render its events
        // On Mobile: This state just shows the group list (event rendering is triggered by click)
        const isMobile = window.innerWidth <= 768;
        if (!isMobile) {
             const activeGroupLi = document.querySelector('.group-item.active');
             // Fallback to first group if none active (might happen on initial load edge cases)
             const activeGroupId = activeGroupLi?.dataset.groupId || groupsData[0]?.id;

             if (activeGroupId) {
                 // Update header info (redundant if group click already did it, but safe)
                 const group = groupsData.find(g => g.id === activeGroupId);
                 if (group) {
                      const activeGroupNameEl = document.getElementById('active-group-name');
                      const activeGroupAvatarEl = document.getElementById('active-group-avatar');
                      if (activeGroupNameEl) activeGroupNameEl.textContent = `${group.name} Events`;
                      if (activeGroupAvatarEl) activeGroupAvatarEl.src = group.avatar_url;
                 }
                 renderGroupEvents(activeGroupId); // Render collage
             } else {
                 const container = document.getElementById('event-panels-container');
                 if (container) container.innerHTML = '<p class="no-events-message">Select a group.</p>';
             }
        } else {
             // Mobile 'groups' view: Just ensure the group list is visible.
             // CSS handles showing list / hiding events by default.
             // Optionally reset header:
             const activeGroupNameEl = document.getElementById('active-group-name');
             //if (activeGroupNameEl) activeGroupNameEl.textContent = 'Select a Group';
             // No event rendering needed here for mobile master view.
        }
    }

    // Scroll current *main* view area to top (use the container ID for each view)
    let activeViewElementId;
    if (viewName === 'calendar') activeViewElementId = 'calendar-view';
    else if (viewName === 'events') activeViewElementId = 'events-view';
    else activeViewElementId = 'planner-pane'; // Scroll the whole pane or specific areas if needed

    const activeViewElement = document.getElementById(activeViewElementId);
    if (activeViewElement) {
         // Scroll the specific scrolling container within the view
         let scrollContainer = activeViewElement;
         if(viewName === 'groups') scrollContainer = document.getElementById('group-list-area'); // scroll group list top
         if(viewName === 'calendar') scrollContainer = document.getElementById('calendar-grid')?.parentElement; // scroll calendar container
         if(viewName === 'events') scrollContainer = document.getElementById('events-view'); // scroll event list

         if (scrollContainer) scrollContainer.scrollTop = 0;
    } else {
        // Fallback scroll
         if (plannerPane) plannerPane.scrollTop = 0;
    }
}


// --- NEW FUNCTION for Mobile Back Button ---
export function goBackToGroupList() {
    const plannerPane = document.getElementById('planner-pane');
    if (plannerPane) {
        plannerPane.classList.remove('mobile-event-view-active');
        // Optional: scroll group list to top when going back
        const groupListArea = document.querySelector('.group-list-area');
        if (groupListArea) groupListArea.scrollTop = 0;
    }
     // Optional: De-select the active group item visually when going back
     document.querySelectorAll('.group-item.active').forEach(item => item.classList.remove('active'));
}

// --- Existing functions ---
export function setupViewSwitching() {
    document.getElementById('groups-tab')?.addEventListener('click', () => switchView('groups'));
    document.getElementById('calendar-tab')?.addEventListener('click', () => switchView('calendar'));
    document.getElementById('events-tab')?.addEventListener('click', () => switchView('events'));
}

export function hookCalendarNavigation() {
    document.getElementById('calendar-prev-month')?.addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() - 1);
        renderCalendar(calendarDate.getFullYear(), calendarDate.getMonth());
    });

    document.getElementById('calendar-next-month')?.addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() + 1);
        renderCalendar(calendarDate.getFullYear(), calendarDate.getMonth());
    });
}

export function getCalendarDate() {
    return calendarDate;
}