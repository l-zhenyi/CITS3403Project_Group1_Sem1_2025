// viewManager.js
import { renderGroupEvents, renderCalendar, renderAllEventsList } from './eventRenderer.js';
import { destroyParallax } from './parallax.js';
import { groupsData } from './dataHandle.js';

let calendarDate = new Date();
let currentEventFilter = 'upcoming';

export function switchView(viewName) {
    const plannerPane = document.getElementById('planner-pane');
    if (!plannerPane) return;

    // Remove all view classes
    plannerPane.classList.remove('calendar-view-active', 'events-view-active', 'mobile-event-view-active');

    // Deactivate all view tabs
    document.querySelectorAll('.view-tab').forEach(tab => tab.classList.remove('active'));
    const activeTab = document.getElementById(`${viewName}-tab`);
    activeTab?.classList.add('active');

    if (viewName === 'calendar') {
        plannerPane.classList.add('calendar-view-active');
        renderCalendar(calendarDate.getFullYear(), calendarDate.getMonth());
        destroyParallax();
    } else if (viewName === 'events') {
        plannerPane.classList.add('events-view-active');
        renderAllEventsList(currentEventFilter);
        destroyParallax();
    } else {
        // Default to 'groups'
        const activeGroupLi = document.querySelector('.group-item.active');
        const activeGroupId = activeGroupLi?.dataset.groupId || groupsData[0]?.id;

        if (activeGroupId) {
            renderGroupEvents(activeGroupId);
        } else {
            const container = document.getElementById('event-panels-container');
            if (container) container.innerHTML = '<p class="no-events-message">No groups available.</p>';
        }
    }

    // Scroll current view to top
    const activeViewId = viewName === 'groups' ? 'event-collage' : `${viewName}-view`;
    const activeView = document.getElementById(activeViewId);
    if (activeView) activeView.scrollTop = 0;
}

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