// --- START OF FILE main.js ---

// --- Imports ---
import { loadGroups, groupsData, parseHash, updateHash, loadAllUserEventsAndProcess, eventsByDate } from './dataHandle.js'; // Added eventsByDate
import { renderGroupEvents, showContextMenu, openDayEventsModal } from './eventRenderer.js'; // Added openDayEventsModal
import { setupViewSwitching, switchView, hookCalendarNavigation, goBackToGroupList } from './viewManager.js';
import { hookEventFilterBar } from './eventActions.js';
import { setupModal as setupEventDetailsModal, openEventModal } from './modalManager.js'; 
import { setupCreateGroupModal } from './groupModalManager.js'; 
import { setupViewportInteractions, getTransformState, setTransformState, debounce } from './viewportManager.js';
import { setupSearchWidget } from './search.js';
import { initInsightsManager } from './insightsManager.js';

// --- Global Variables ---
window.draggingAllowed = true; 
const groupViewStates = new Map();

let activeGroupNameEl, activeGroupAvatarEl, plannerPane, backButton, groupListUL,
    collageViewport, eventPanelsContainer, calendarGridEl; // Added calendarGridEl

// --- Global Setup for All Views ---
function setupGlobalUI() {
    setupSearchWidget();

    const collageViewport = document.getElementById('collage-viewport');
    if (collageViewport) {
        collageViewport.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            let type = 'canvas', targetElement = null, elementId = null;
            const nodeTarget = e.target.closest('.event-node');
            const panelTarget = e.target.closest('.event-panel');

            if (nodeTarget) {
                type = 'event-node';
                targetElement = nodeTarget;
                elementId = targetElement.dataset.nodeId;
            } else if (panelTarget) {
                type = 'event-panel';
                targetElement = panelTarget;
                elementId = targetElement.dataset.eventId;
            }
            showContextMenu({ x: e.pageX, y: e.pageY, type, id: elementId });
        });
    } else {
         // console.log("Collage viewport not found for context menu setup.");
    }
}

// --- Planner-Specific Setup ---
async function setupPlannerView() {
    console.log("Planner view detected. Initializing planner setup...");

    activeGroupNameEl = document.getElementById('active-group-name');
    activeGroupAvatarEl = document.getElementById('active-group-avatar');
    plannerPane = document.getElementById('planner-pane');
    backButton = document.querySelector('.back-button');
    groupListUL = document.querySelector('.group-list-area ul');
    collageViewport = document.getElementById('collage-viewport');
    eventPanelsContainer = document.getElementById('event-panels-container');
    calendarGridEl = document.getElementById('calendar-grid'); // Get calendar grid


    if (!plannerPane) {
        console.warn("Planner pane element missing. Skipping planner view setup.");
        return;
    }
     if (!groupListUL) console.warn("Group list UL missing.");
     if (!collageViewport) console.warn("Collage viewport missing.");
     if (!eventPanelsContainer) console.warn("Event panels container missing.");
     if (!activeGroupNameEl) console.warn("Active group name element missing.");
     if (!activeGroupAvatarEl) console.warn("Active group avatar element missing.");
     if (!calendarGridEl) console.warn("Calendar grid element missing.");


    setupEventDetailsModal(); 
    setupCreateGroupModal(); 
    if (collageViewport && eventPanelsContainer) {
        setupViewportInteractions(collageViewport, eventPanelsContainer);
    }
    setupViewSwitching();
    hookEventFilterBar();
    hookCalendarNavigation();
    initInsightsManager(); 

    if(groupListUL) {
        await loadGroups();
    }
    await loadAllUserEventsAndProcess();


    const { view: initialView, groupId: initialGroupId } = parseHash();
    let currentView = initialView || 'groups'; 

    console.log(`Initial Hash State: view=${currentView}, groupId=${initialGroupId}`);

    if (currentView === "calendar") {
        switchView("calendar");
    } else if (currentView === "events") {
        switchView("events");
    } else if (currentView === "insights") {
         switchView("insights");
    } else { 
        currentView = 'groups'; 
        let activated = false;
        if (groupListUL && initialGroupId) {
            const li = groupListUL.querySelector(`.group-item[data-group-id="${initialGroupId}"]`);
            if (li) {
                 activated = await activateGroup(li, initialGroupId);
            }
        }

        const isMobile = window.innerWidth <= 768;
        if (!activated && !isMobile && groupListUL) {
            const firstLi = groupListUL.querySelector(".group-item:not(.add-new-group-item)"); 
            if (firstLi) {
                const firstGroupId = firstLi.dataset.groupId;
                activated = await activateGroup(firstLi, firstGroupId);
            }
        }

        if (!activated) {
             if(eventPanelsContainer) eventPanelsContainer.innerHTML = '<p class="info-message">No groups available or selected.</p>';
             if(activeGroupNameEl) activeGroupNameEl.textContent = 'No Group Selected';
             if(activeGroupAvatarEl) activeGroupAvatarEl.src = '/static/img/default-group-avatar.png';
        }
        switchView("groups");
    }

    // --- Event Listeners ---

    // Group list click
    groupListUL?.addEventListener('click', (e) => {
        const li = e.target.closest('.group-item');
        if (!li || li.classList.contains('add-new-group-item')) return; 
        
        if (li.classList.contains('active') && window.innerWidth > 768) return;
        const groupId = li.dataset.groupId;
        if (groupId) {
            activateGroup(li, groupId);
        }
    });

    // Calendar day cell click
    calendarGridEl?.addEventListener('click', (e) => {
        const cell = e.target.closest('.calendar-cell[data-action="open-day-events-modal"]');
        if (cell) {
            const dateStr = cell.dataset.date;
            if (dateStr && eventsByDate[dateStr]) {
                openDayEventsModal(dateStr, eventsByDate[dateStr]);
            } else if (dateStr) { // Date exists but no events
                openDayEventsModal(dateStr, []); // Open modal showing "no events"
            }
        }
    });


    backButton?.addEventListener('click', goBackToGroupList);

    let isCurrentlyMobile = window.innerWidth <= 768;
    window.addEventListener('resize', debounce(() => {
        const wasMobile = isCurrentlyMobile;
        isCurrentlyMobile = window.innerWidth <= 768;

        if (wasMobile !== isCurrentlyMobile) {
            let currentLogicalView = 'groups'; 
            if (plannerPane?.classList.contains('calendar-view-active')) currentLogicalView = 'calendar';
            else if (plannerPane?.classList.contains('events-view-active')) currentLogicalView = 'events';
            else if (plannerPane?.classList.contains('insights-view-active')) currentLogicalView = 'insights';

             if(collageViewport) setTransformState({ x: 0, y: 0, s: 1.0 });
            switchView(currentLogicalView);

            if (!isCurrentlyMobile) { 
                if (currentLogicalView === 'groups') {
                     const activeLi = groupListUL?.querySelector('.group-item.active:not(.add-new-group-item)') || groupListUL?.querySelector('.group-item:not(.add-new-group-item)');
                     if (activeLi) {
                         activateGroup(activeLi, activeLi.dataset.groupId); 
                     } else {
                         if(eventPanelsContainer) eventPanelsContainer.innerHTML = '<p class="info-message">No groups available.</p>';
                          if(activeGroupNameEl) activeGroupNameEl.textContent = 'No Group Selected';
                          if(activeGroupAvatarEl) activeGroupAvatarEl.src = '/static/img/default-group-avatar.png';
                     }
                }
            }
        }
    }, 250));

    document.addEventListener('openEventModalRequest', (event) => {
        const eventData = event.detail.eventData;
        if (eventData?.id) {
            openEventModal(eventData);
        } else {
            console.warn("Received openEventModalRequest without valid event data.");
        }
    });

    console.log("Planner setup complete.");
}

// --- Group Activation ---
async function activateGroup(groupListItem, groupId) {
    if (!groupListItem || !groupId) {
         return false;
    }
    if (groupListItem.classList.contains('add-new-group-item')) { 
        return false;
    }
     if (!groupListUL || !activeGroupNameEl || !activeGroupAvatarEl || !plannerPane || !eventPanelsContainer) {
         console.error("Cannot activate group: Required UI elements missing.");
         return false;
     }

    const group = groupsData.find(g => String(g.id) === String(groupId));
    if (!group) {
        return false;
    }

    const isMobile = window.innerWidth <= 768;
    const currentActiveGroupLi = groupListUL.querySelector('.group-item.active:not(.add-new-group-item)');

    if (currentActiveGroupLi && currentActiveGroupLi !== groupListItem) {
        const currentGroupId = currentActiveGroupLi.dataset.groupId;
        if (currentGroupId) {
            try {
                const currentState = getTransformState();
                if(currentState) { 
                     groupViewStates.set(String(currentGroupId), currentState);
                 }
            } catch (e) {
                 console.warn("Could not get transform state for saving:", e);
             }
        }
        currentActiveGroupLi.classList.remove('active');
    }

     try {
         const savedView = groupViewStates.get(String(groupId));
         if (savedView) {
             setTransformState({ x: savedView.panX, y: savedView.panY, s: savedView.scale });
         } else {
             setTransformState({ x: 0, y: 0, s: 1.0 });
         }
     } catch (e) {
         console.warn("Could not set transform state:", e);
          if(eventPanelsContainer) eventPanelsContainer.style.transform = 'translate(0px, 0px) scale(1)';
     }

    groupListItem.classList.add('active');
    activeGroupNameEl.textContent = group.name || 'Group Events';
    activeGroupAvatarEl.src = group.avatar_url || '/static/img/default-group-avatar.png';

    await renderGroupEvents(groupId);

    if (isMobile) {
        plannerPane.classList.add('mobile-event-view-active');
        const collageArea = document.getElementById('event-collage');
        if (collageArea) {
            collageArea.style.display = 'block'; 
            collageArea.scrollTop = 0; 
        }
         if (groupListUL.parentElement) groupListUL.parentElement.style.display = 'none';

    } else {
        if (!plannerPane.classList.contains('calendar-view-active') &&
            !plannerPane.classList.contains('events-view-active') &&
             !plannerPane.classList.contains('insights-view-active')) {
        } else {
            switchView('groups');
        }
    }
    updateHash('groups', groupId);
    return true;
}

// --- DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', async () => {
    setupGlobalUI();
    const plannerEl = document.getElementById('planner-pane');
    if (plannerEl) {
        await setupPlannerView();
    }
});
// --- END OF FILE main.js ---