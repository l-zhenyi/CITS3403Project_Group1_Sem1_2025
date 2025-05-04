// --- START OF FILE viewManager.js ---

// viewManager.js
import { renderGroupEvents, renderCalendar, renderAllEventsList } from './eventRenderer.js';
import { groupsData } from './dataHandle.js';

let calendarDate = new Date();
let currentEventFilter = 'upcoming';

export function switchView(viewName) {
    const plannerPane = document.getElementById('planner-pane');
    if (!plannerPane) return;

    console.log(`[ViewManager] Switching view to: ${viewName}`); // Debug

    // --- Reset Mobile State ---
    plannerPane.classList.remove('mobile-event-view-active');

    // Remove all primary view classes
    plannerPane.classList.remove(
        'calendar-view-active',
        'events-view-active',
        'insights-view-active' // <-- ADDED
    );
    // Note: Don't remove the base class 'planner-pane'

    // Deactivate all view tabs
    document.querySelectorAll('.view-tab').forEach(tab => tab.classList.remove('active'));
    const activeTab = document.getElementById(`${viewName}-tab`);
    if (activeTab) {
        activeTab.classList.add('active');
        console.log(`[ViewManager] Activated tab: #${activeTab.id}`); // Debug
    } else {
        console.warn(`[ViewManager] Tab not found for view: ${viewName}`); // Debug
    }


    // --- Get references to view sections ---
    const groupsListArea = plannerPane.querySelector('.group-list-area');
    const eventCollageArea = plannerPane.querySelector('.event-collage-area');
    const calendarView = plannerPane.querySelector('.calendar-view');
    const eventsView = plannerPane.querySelector('.events-view');
    const insightsView = plannerPane.querySelector('.insights-view'); // <-- ADDED

    // --- Hide all views initially ---
    [groupsListArea, eventCollageArea, calendarView, eventsView, insightsView].forEach(el => {
        if (el) el.style.display = 'none';
    });

    // --- Apply new view ---
    let scrollContainer = plannerPane; // Default scroll target

    if (viewName === 'calendar') {
        plannerPane.classList.add('calendar-view-active');
        if (calendarView) {
             calendarView.style.display = 'flex'; // Use flex for internal layout
             renderCalendar(calendarDate.getFullYear(), calendarDate.getMonth());
             scrollContainer = calendarView.querySelector('#calendar-grid')?.parentElement || calendarView;
        }
    } else if (viewName === 'events') {
        plannerPane.classList.add('events-view-active');
        if (eventsView) {
            eventsView.style.display = 'flex'; // Use flex for internal layout
            const activeFilterPill = document.querySelector('.filter-pill.active');
            currentEventFilter = activeFilterPill?.dataset.filter || 'upcoming';
            renderAllEventsList(currentEventFilter);
            scrollContainer = eventsView;
        }
    } else if (viewName === 'insights') { // <-- ADDED Block
        plannerPane.classList.add('insights-view-active');
        if (insightsView) {
            insightsView.style.display = 'flex'; // Use flex for internal layout
            // Optionally load/render insights data here if needed dynamically
            // renderInsights(); // Example function call
             console.log(`[ViewManager] Displaying insights view.`); // Debug
             scrollContainer = insightsView; // Scroll the insights view itself
        } else {
            console.warn(`[ViewManager] Insights view element not found.`); // Debug
        }
    } else { // Default to 'groups' view
        // No specific class needed for groups, it's the default state
        const isMobile = window.innerWidth <= 768;

        if (groupsListArea) groupsListArea.style.display = 'block';
        scrollContainer = groupsListArea; // Scroll group list

        if (!isMobile) {
            // --- Desktop: Show Group List AND Collage Area ---
            if (eventCollageArea) eventCollageArea.style.display = 'block'; // Show collage

             const activeGroupLi = document.querySelector('.group-item.active');
             const activeGroupId = activeGroupLi?.dataset.groupId || groupsData[0]?.id;

             if (activeGroupId) {
                 const group = groupsData.find(g => String(g.id) === String(activeGroupId)); // Use String comparison
                 if (group) {
                      const activeGroupNameEl = document.getElementById('active-group-name');
                      const activeGroupAvatarEl = document.getElementById('active-group-avatar');
                      if (activeGroupNameEl) activeGroupNameEl.textContent = `${group.name} Events`;
                      if (activeGroupAvatarEl) activeGroupAvatarEl.src = group.avatar_url || '/static/img/default-group-avatar.png';
                 }
                 renderGroupEvents(activeGroupId); // Render collage
             } else {
                 const container = document.getElementById('event-panels-container');
                 if (container) container.innerHTML = '<p class="info-message">Select a group.</p>';
                  const activeGroupNameEl = document.getElementById('active-group-name');
                  const activeGroupAvatarEl = document.getElementById('active-group-avatar');
                  if(activeGroupNameEl) activeGroupNameEl.textContent = 'No Group Selected';
                  if(activeGroupAvatarEl) activeGroupAvatarEl.src = '/static/img/default-group-avatar.png';
             }
        } else {
            // --- Mobile: Only Group List is visible by default ---
            // CSS '.mobile-event-view-active' handles hiding list / showing collage
            // Reset header on mobile when going back to list view
             const activeGroupNameEl = document.getElementById('active-group-name');
             const activeGroupAvatarEl = document.getElementById('active-group-avatar');
             if (activeGroupNameEl) activeGroupNameEl.textContent = 'Select a Group';
             if (activeGroupAvatarEl) activeGroupAvatarEl.src = '/static/img/default-group-avatar.png';
             // Ensure collage area is hidden if switching back to groups tab on mobile
             if (eventCollageArea) eventCollageArea.style.display = 'none';
        }
    }

    // Scroll the determined container to top
    if (scrollContainer) {
         // console.log(`[ViewManager] Scrolling container:`, scrollContainer); // Debug
         scrollContainer.scrollTop = 0;
    } else {
        // Fallback scroll
         console.warn(`[ViewManager] Scroll container not found for view ${viewName}.`); // Debug
         if (plannerPane) plannerPane.scrollTop = 0;
    }
}


// --- NEW FUNCTION for Mobile Back Button ---
export function goBackToGroupList() {
    const plannerPane = document.getElementById('planner-pane');
    const groupListArea = plannerPane?.querySelector('.group-list-area');
    const eventCollageArea = plannerPane?.querySelector('.event-collage-area');

    if (plannerPane) {
        plannerPane.classList.remove('mobile-event-view-active');

        // Explicitly show group list and hide collage
        if(groupListArea) groupListArea.style.display = 'block';
        if(eventCollageArea) eventCollageArea.style.display = 'none';

        // Optional: scroll group list to top when going back
        if (groupListArea) groupListArea.scrollTop = 0;
    }
     // Optional: De-select the active group item visually when going back
     document.querySelectorAll('.group-item.active').forEach(item => item.classList.remove('active'));
      // Reset header
     const activeGroupNameEl = document.getElementById('active-group-name');
     const activeGroupAvatarEl = document.getElementById('active-group-avatar');
     if (activeGroupNameEl) activeGroupNameEl.textContent = 'Select a Group';
     if (activeGroupAvatarEl) activeGroupAvatarEl.src = '/static/img/default-group-avatar.png';
}

// --- Existing functions ---
export function setupViewSwitching() {
    document.getElementById('groups-tab')?.addEventListener('click', () => switchView('groups'));
    document.getElementById('calendar-tab')?.addEventListener('click', () => switchView('calendar'));
    document.getElementById('events-tab')?.addEventListener('click', () => switchView('events'));
    document.getElementById('insights-tab')?.addEventListener('click', () => switchView('insights')); // <-- ADDED
}

// ... (rest of viewManager.js remains the same) ...

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
// --- END OF FILE viewManager.js ---