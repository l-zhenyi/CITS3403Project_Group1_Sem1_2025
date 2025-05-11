// --- START OF FILE viewManager.js ---

// viewManager.js
import { renderGroupEvents, renderCalendar, renderAllEventsList } from './eventRenderer.js';
import { groupsData, allEventsData } from './dataHandle.js';

let calendarDate = new Date();
// Removed: let currentEventFilter = 'upcoming'; // State should be derived from UI or passed

export function switchView(viewName) {
    const plannerPane = document.getElementById('planner-pane');
    if (!plannerPane) {
        console.error("[ViewManager] Planner pane not found.");
        return;
    }

    console.log(`[ViewManager] Switching view to: ${viewName}`);

    plannerPane.classList.remove('mobile-event-view-active');
    plannerPane.classList.remove(
        'calendar-view-active',
        'events-view-active',
        'insights-view-active'
    );

    document.querySelectorAll('.view-tab').forEach(tab => tab.classList.remove('active'));
    const activeTab = document.getElementById(`${viewName}-tab`);
    if (activeTab) {
        activeTab.classList.add('active');
    } else {
        console.warn(`[ViewManager] Tab not found for view: ${viewName}`);
    }

    const groupsListArea = plannerPane.querySelector('.group-list-area');
    const eventCollageArea = plannerPane.querySelector('.event-collage-area');
    const calendarView = plannerPane.querySelector('.calendar-view');
    const eventsView = plannerPane.querySelector('.events-view');
    const insightsView = plannerPane.querySelector('.insights-view');
    const eventListFilterBar = plannerPane.querySelector('.event-filter-bar'); // Get filter bar

    [groupsListArea, eventCollageArea, calendarView, eventsView, insightsView].forEach(el => {
        if (el) el.style.display = 'none';
    });

    let scrollContainer = plannerPane;

    if (viewName === 'calendar') {
        plannerPane.classList.add('calendar-view-active');
        if (calendarView) {
             calendarView.style.display = 'flex';
             renderCalendar(calendarDate.getFullYear(), calendarDate.getMonth());
             scrollContainer = calendarView.querySelector('#calendar-grid')?.parentElement || calendarView;
        }
    } else if (viewName === 'events') {
        plannerPane.classList.add('events-view-active');
        if (eventsView) {
            eventsView.style.display = 'flex';
            // --- MODIFIED: Determine active filter or set default ---
            let activeFilter = 'upcoming'; // Default
            if (eventListFilterBar) {
                const activePill = eventListFilterBar.querySelector('.filter-pill.active');
                if (activePill && activePill.dataset.filter) {
                    activeFilter = activePill.dataset.filter;
                } else {
                    // If no pill is active, make 'upcoming' active
                    const upcomingPill = eventListFilterBar.querySelector('.filter-pill[data-filter="upcoming"]');
                    if (upcomingPill) {
                        // Deactivate any other potentially active pill first (belt and suspenders)
                        eventListFilterBar.querySelectorAll('.filter-pill.active').forEach(p => p.classList.remove('active'));
                        upcomingPill.classList.add('active');
                    }
                }
            }
            renderAllEventsList(activeFilter);
            // --- END MODIFICATION ---
            scrollContainer = eventsView;
        }
    } else if (viewName === 'insights') {
        plannerPane.classList.add('insights-view-active');
        if (insightsView) {
            insightsView.style.display = 'flex';
            console.log(`[ViewManager] Displaying insights view.`);
            scrollContainer = insightsView;
        } else {
            console.warn(`[ViewManager] Insights view element not found.`);
        }
    } else { // Default to 'groups' view
        const isMobile = window.innerWidth <= 768;
        if (groupsListArea) groupsListArea.style.display = 'block';
        scrollContainer = groupsListArea;
        if (!isMobile) {
            if (eventCollageArea) eventCollageArea.style.display = 'block';
            const activeGroupLi = document.querySelector('.group-list-area .group-item.active:not(.add-new-group-item)');
            const activeGroupId = activeGroupLi?.dataset.groupId;
            const firstGroupIdFallback = !activeGroupId && groupsData.length > 0 ? groupsData[0].id : null;
            const targetGroupId = activeGroupId || firstGroupIdFallback;
            if (targetGroupId) {
                 const group = groupsData.find(g => String(g.id) === String(targetGroupId));
                 if (group) {
                      const activeGroupNameEl = document.getElementById('active-group-name');
                      const activeGroupAvatarEl = document.getElementById('active-group-avatar');
                      if (activeGroupNameEl) activeGroupNameEl.textContent = group.name;
                      if (activeGroupAvatarEl) activeGroupAvatarEl.src = group.avatar_url || '/static/img/default-group-avatar.png';
                 }
                 renderGroupEvents(targetGroupId);
            } else {
                 const container = document.getElementById('event-panels-container');
                 if (container) container.innerHTML = '<p class="info-message">Select a group or create one.</p>';
                  const activeGroupNameEl = document.getElementById('active-group-name');
                  const activeGroupAvatarEl = document.getElementById('active-group-avatar');
                  if(activeGroupNameEl) activeGroupNameEl.textContent = 'No Group Selected';
                  if(activeGroupAvatarEl) activeGroupAvatarEl.src = '/static/img/default-group-avatar.png';
            }
        } else {
             const activeGroupNameEl = document.getElementById('active-group-name');
             const activeGroupAvatarEl = document.getElementById('active-group-avatar');
             if (activeGroupNameEl) activeGroupNameEl.textContent = 'Select a Group';
             if (activeGroupAvatarEl) activeGroupAvatarEl.src = '/static/img/default-group-avatar.png';
             if (eventCollageArea) eventCollageArea.style.display = 'none';
        }
    }

    if (scrollContainer) {
         scrollContainer.scrollTop = 0;
    } else {
         if (plannerPane) plannerPane.scrollTop = 0;
    }
}


// --- goBackToGroupList, setupViewSwitching, hookCalendarNavigation, getCalendarDate remain the same ---
export function goBackToGroupList() {
    const plannerPane = document.getElementById('planner-pane');
    const groupListArea = plannerPane?.querySelector('.group-list-area');
    const eventCollageArea = plannerPane?.querySelector('.event-collage-area');

    if (plannerPane) {
        plannerPane.classList.remove('mobile-event-view-active');
        if(groupListArea) groupListArea.style.display = 'block';
        if(eventCollageArea) eventCollageArea.style.display = 'none';
        if (groupListArea) groupListArea.scrollTop = 0;
    }
     document.querySelectorAll('.group-item.active').forEach(item => item.classList.remove('active'));
     const activeGroupNameEl = document.getElementById('active-group-name');
     const activeGroupAvatarEl = document.getElementById('active-group-avatar');
     if (activeGroupNameEl) activeGroupNameEl.textContent = 'Select a Group';
     if (activeGroupAvatarEl) activeGroupAvatarEl.src = '/static/img/default-group-avatar.png';

     document.querySelectorAll('.view-tab').forEach(tab => tab.classList.remove('active'));
     const groupsTab = document.getElementById('groups-tab');
     if(groupsTab) groupsTab.classList.add('active');
}

export function setupViewSwitching() {
    document.getElementById('groups-tab')?.addEventListener('click', () => switchView('groups'));
    document.getElementById('calendar-tab')?.addEventListener('click', () => switchView('calendar'));
    document.getElementById('events-tab')?.addEventListener('click', () => switchView('events'));
    document.getElementById('insights-tab')?.addEventListener('click', () => switchView('insights'));
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
    return new Date(calendarDate.getTime());
}
// --- END OF FILE viewManager.js ---