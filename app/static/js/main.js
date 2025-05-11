// --- START OF FILE main.js ---

// --- Imports ---
import { loadGroups, groupsData, parseHash, updateHash, loadAllUserEventsAndProcess, allEventsData, eventsByDate } from './dataHandle.js';
import { renderGroupEvents, showContextMenu, openDayEventsModal, renderAllEventsList, renderCalendar } from './eventRenderer.js';
import { setupViewSwitching, switchView, hookCalendarNavigation, goBackToGroupList, getCalendarDate } from './viewManager.js';
import { hookEventFilterBar } from './eventActions.js';
import { setupModal as setupEventDetailsModal, openEventModal } from './modalManager.js';
import { setupCreateGroupModal } from './groupModalManager.js';
// --- MINIMAL ADDITION: Import for settings modal ---
import { setupGroupSettingsModal, openGroupSettingsModal } from './groupSettingsModalManager.js';
// --- END ADDITION ---
import { setupViewportInteractions, getTransformState, setTransformState, debounce } from './viewportManager.js';
import { setupSearchWidget } from './search.js';
import { initInsightsManager } from './insightsManager.js';

// --- Global Variables ---
window.draggingAllowed = true;
const groupViewStates = new Map();

let activeGroupNameEl, activeGroupAvatarEl, plannerPane, backButton, groupListUL,
    collageViewport, eventPanelsContainer, calendarGridEl, eventListFilterBar,
    // --- MINIMAL ADDITION: Variable for settings button ---
    activeGroupSettingsButton;
    // --- END ADDITION ---

// --- Global Setup for All Views ---
function setupGlobalUI() {
    setupSearchWidget();

    const collageViewportElement = document.getElementById('collage-viewport');
    if (collageViewportElement) {
        collageViewportElement.addEventListener('contextmenu', (e) => {
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
    // --- MINIMAL ADDITION: Get settings button element ---
    activeGroupSettingsButton = document.getElementById('active-group-settings-button');
    // --- END ADDITION ---
    plannerPane = document.getElementById('planner-pane');
    backButton = document.querySelector('.back-button');
    groupListUL = document.querySelector('.group-list-area ul');
    collageViewport = document.getElementById('collage-viewport');
    eventPanelsContainer = document.getElementById('event-panels-container');
    calendarGridEl = document.getElementById('calendar-grid');
    eventListFilterBar = document.querySelector('.event-filter-bar');


    if (!plannerPane) {
        console.warn("Planner pane element missing. Skipping planner view setup.");
        return;
    }
     if (!groupListUL) console.warn("Group list UL missing.");
     if (!collageViewport) console.warn("Collage viewport missing.");
     if (!eventPanelsContainer) console.warn("Event panels container missing.");
     if (!activeGroupNameEl) console.warn("Active group name element missing.");
     if (!activeGroupAvatarEl) console.warn("Active group avatar element missing.");
     // --- MINIMAL ADDITION: Check settings button element ---
     if (!activeGroupSettingsButton) console.warn("Active group settings button missing.");
     // --- END ADDITION ---
     if (!calendarGridEl) console.warn("Calendar grid element missing.");
     if (!eventListFilterBar) console.warn("Event list filter bar missing.");


    setupEventDetailsModal();
    setupCreateGroupModal();
    // --- MINIMAL ADDITION: Setup settings modal ---
    setupGroupSettingsModal();
    // --- END ADDITION ---
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
                 activated = await activateGroup(li, initialGroupId); // activateGroup will handle settings button visibility
            }
        }

        const isMobile = window.innerWidth <= 768;
        if (!activated && !isMobile && groupListUL) {
            const firstLi = groupListUL.querySelector(".group-item:not(.add-new-group-item)");
            if (firstLi) {
                const firstGroupId = firstLi.dataset.groupId;
                activated = await activateGroup(firstLi, firstGroupId); // activateGroup will handle settings button visibility
            }
        }

        if (!activated) {
             if(eventPanelsContainer) eventPanelsContainer.innerHTML = '<p class="info-message">No groups available or selected.</p>';
             if(activeGroupNameEl) activeGroupNameEl.textContent = 'No Group Selected';
             if(activeGroupAvatarEl) activeGroupAvatarEl.src = '/static/img/default-group-avatar.png';
             // --- MINIMAL ADDITION: Hide settings button if no group active ---
             if(activeGroupSettingsButton) activeGroupSettingsButton.style.display = 'none';
             // --- END ADDITION ---
        }
        // If 'activated' is true, activateGroup already handled showing the settings button.
        switchView("groups");
    }

    // --- Event Listeners ---

    groupListUL?.addEventListener('click', (e) => {
        const li = e.target.closest('.group-item');
        if (!li || li.classList.contains('add-new-group-item')) return;

        if (li.classList.contains('active') && window.innerWidth > 768) return;
        const groupId = li.dataset.groupId;
        if (groupId) {
            activateGroup(li, groupId);
        }
    });


    backButton?.addEventListener('click', goBackToGroupList);

    // --- MINIMAL ADDITION: Event listener for settings button ---
    activeGroupSettingsButton?.addEventListener('click', () => {
        const activeLi = groupListUL?.querySelector('.group-item.active:not(.add-new-group-item)');
        if (activeLi && activeLi.dataset.groupId) {
            openGroupSettingsModal(activeLi.dataset.groupId);
        } else {
            alert("Please select an active group first to change its settings.");
        }
    });
    // --- END ADDITION ---

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
                         activateGroup(activeLi, activeLi.dataset.groupId); // activateGroup handles settings button
                     } else {
                         if(eventPanelsContainer) eventPanelsContainer.innerHTML = '<p class="info-message">No groups available.</p>';
                          if(activeGroupNameEl) activeGroupNameEl.textContent = 'No Group Selected';
                          if(activeGroupAvatarEl) activeGroupAvatarEl.src = '/static/img/default-group-avatar.png';
                          // --- MINIMAL ADDITION: Hide settings button on resize if no group active ---
                          if(activeGroupSettingsButton) activeGroupSettingsButton.style.display = 'none';
                          // --- END ADDITION ---
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

    // ========================================================================
    // THIS IS YOUR WORKING eventDataUpdated LISTENER - UNCHANGED CORE LOGIC
    // Only made async because activateGroup (called within) is async.
    // ========================================================================
    document.addEventListener('eventDataUpdated', (event) => {
        const { eventId, updatedEvent } = event.detail;

        if (!updatedEvent || (typeof updatedEvent.id === 'undefined' && !updatedEvent._deleted)) {
            console.warn('[MainJS] Received eventDataUpdated with invalid updatedEvent data or missing ID for non-deleted event.');
            return;
        }
        console.log(`[MainJS] Event data updated for ID ${eventId}:`, updatedEvent);


        const indexInAllEvents = allEventsData.findIndex(e => String(e.id) === String(eventId));

        if (updatedEvent._deleted) {
            if (indexInAllEvents !== -1) {
                allEventsData.splice(indexInAllEvents, 1);
            }
        } else {
            const processedUpdatedEvent = {
                ...updatedEvent,
                date: updatedEvent.date ? new Date(updatedEvent.date) : null,
                group_name: updatedEvent.group_name || 'Direct Invite/Other',
            };

            if (indexInAllEvents !== -1) {
                allEventsData[indexInAllEvents] = { ...allEventsData[indexInAllEvents], ...processedUpdatedEvent };
            } else {
                allEventsData.push(processedUpdatedEvent);
            }
        }

        for (const dateKey in eventsByDate) {
            eventsByDate[dateKey] = eventsByDate[dateKey].filter(e => String(e.id) !== String(eventId));
            if (eventsByDate[dateKey].length === 0) {
                delete eventsByDate[dateKey];
            }
        }

        if (!updatedEvent._deleted && updatedEvent.date) {
            const eventDateObj = new Date(updatedEvent.date);
            if (!isNaN(eventDateObj.getTime())) {
                const newDateKey = eventDateObj.toISOString().split('T')[0];
                if (!eventsByDate[newDateKey]) {
                    eventsByDate[newDateKey] = [];
                }
                eventsByDate[newDateKey].push({
                    title: updatedEvent.title,
                    group_name: updatedEvent.group_name || 'Direct Invite/Other',
                    id: updatedEvent.id,
                    status: updatedEvent.current_user_rsvp_status
                });
                eventsByDate[newDateKey].sort((a,b) => (a.title || '').localeCompare(b.title || ''));
            }
        }

        if (plannerPane?.classList.contains('events-view-active')) {
            let currentFilter = 'upcoming';
            if (eventListFilterBar) {
                const activeFilterPill = eventListFilterBar.querySelector('.filter-pill.active');
                if (activeFilterPill && activeFilterPill.dataset.filter) {
                    currentFilter = activeFilterPill.dataset.filter;
                }
            }
            console.log(`[MainJS] Refreshing event list with filter: ${currentFilter}`);
            renderAllEventsList(currentFilter);
        }
        if (plannerPane?.classList.contains('calendar-view-active')) {
            const calDate = getCalendarDate();
            renderCalendar(calDate.getFullYear(), calDate.getMonth());
        }

        const activeGroupLi = groupListUL?.querySelector('.group-item.active');
        if (activeGroupLi &&
            plannerPane?.offsetParent !== null && // Check if plannerPane is actually visible
            !plannerPane.classList.contains('events-view-active') &&
            !plannerPane.classList.contains('calendar-view-active') &&
            !plannerPane.classList.contains('insights-view-active')) { // i.e., groups view is active
            const activeGroupId = activeGroupLi.dataset.groupId;

            const eventBelongsOrDidBelongToGroup = String(updatedEvent.group_id) === String(activeGroupId) ||
                                                (indexInAllEvents !== -1 && String(allEventsData[indexInAllEvents]?.group_id) === String(activeGroupId));

            if (eventBelongsOrDidBelongToGroup || updatedEvent._deleted) {
                 console.log(`[MainJS] Re-rendering group events for group ${activeGroupId} due to event update/delete.`);
                 // Calling activateGroup will re-render, no need to call renderGroupEvents directly here
                 // as activateGroup handles other state changes too.
                 activateGroup(activeGroupLi, activeGroupId);
            }
        }
        console.log("[MainJS] UI refresh logic executed after eventDataUpdated.");
    });
    // ========================================================================
    // END OF YOUR WORKING eventDataUpdated LISTENER
    // ========================================================================


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
     // --- MINIMAL ADDITION: Check settings button ---
     if (!groupListUL || !activeGroupNameEl || !activeGroupAvatarEl || !plannerPane || !eventPanelsContainer || !activeGroupSettingsButton) {
         console.error("Cannot activate group: Required UI elements missing.");
         return false;
     }
     // --- END ADDITION ---

    const group = groupsData.find(g => String(g.id) === String(groupId));
    if (!group) {
        console.warn(`Group with ID ${groupId} not found in groupsData.`);
        // --- MINIMAL ADDITION: Hide settings button if group not found ---
        if(activeGroupSettingsButton) activeGroupSettingsButton.style.display = 'none';
        // --- END ADDITION ---
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
    // --- MINIMAL ADDITION: Show settings button when group is active ---
    if(activeGroupSettingsButton) activeGroupSettingsButton.style.display = 'inline-flex';
    // --- END ADDITION ---

    await renderGroupEvents(groupId); 

    if (isMobile) {
        plannerPane.classList.add('mobile-event-view-active');
        const collageArea = document.getElementById('event-collage-area'); 
        if (collageArea) {
            collageArea.style.display = 'block';
            collageArea.scrollTop = 0;
        }
         if (groupListUL.parentElement) groupListUL.parentElement.style.display = 'none';

    } else { 
        if (plannerPane.classList.contains('calendar-view-active') ||
            plannerPane.classList.contains('events-view-active') ||
            plannerPane.classList.contains('insights-view-active')) {
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