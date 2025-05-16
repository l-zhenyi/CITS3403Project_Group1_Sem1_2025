// --- START OF FILE static/js/main.js ---

// --- Imports ---
import { loadGroups, groupsData, parseHash, updateHash, loadAllUserEventsAndProcess, allEventsData, eventsByDate } from './dataHandle.js';
import { renderGroupEvents, showContextMenu, openDayEventsModal, renderAllEventsList, renderCalendar, hideContextMenu, adjustEventTileSizesIfNeeded } from './eventRenderer.js'; // Added hideContextMenu and adjustEventTileSizesIfNeeded
import { setupViewSwitching, switchView, hookCalendarNavigation, goBackToGroupList, getCalendarDate } from './viewManager.js';
import { hookEventFilterBar } from './eventActions.js';
import { setupModal as setupEventDetailsModal, openEventModal } from './modalManager.js';
import { setupCreateGroupModal } from './groupModalManager.js';
import { setupGroupSettingsModal, openGroupSettingsModal } from './groupSettingsModalManager.js';
// Event Creation Modal self-initializes. We don't need to explicitly call a setup function from main.
// import { setupEventCreationModal } from './eventCreationModalManager.js'; 
import { setupViewportInteractions, getTransformState, setTransformState, debounce } from './viewportManager.js';
import { setupSearchWidget } from './search.js';
import { initInsightsManager } from './insightsManager.js';
import { setupMobileNav } from './navManager.js'; // NEW: Import navManager

// --- Global Variables ---
window.draggingAllowed = true;
const groupViewStates = new Map();

let activeGroupNameEl, activeGroupAvatarEl, plannerPane, backButton, groupListUL,
    collageViewport, eventPanelsContainer, calendarGridEl, eventListFilterBar,
    activeGroupSettingsButton;

let mainJSInitialized = false; // Flag to prevent re-initialization

// --- Global Setup for All Views ---
function setupGlobalUI() {
    setupSearchWidget();
    setupMobileNav(); // NEW: Initialize mobile navigation

    const collageViewportElement = document.getElementById('collage-viewport');
    if (collageViewportElement) {
        collageViewportElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            hideContextMenu(); // Hide any existing context menu first
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
    if (mainJSInitialized) {
        console.warn("Main.js: Planner view setup already initialized. Skipping.");
        return;
    }
    console.log("Main.js: Planner view detected. Initializing planner setup...");

    activeGroupNameEl = document.getElementById('active-group-name');
    activeGroupAvatarEl = document.getElementById('active-group-avatar');
    activeGroupSettingsButton = document.getElementById('active-group-settings-button');
    plannerPane = document.getElementById('planner-pane');
    backButton = document.querySelector('.back-button');
    groupListUL = document.querySelector('.group-list-area ul.groups-ul'); // More specific selector
    collageViewport = document.getElementById('collage-viewport');
    eventPanelsContainer = document.getElementById('event-panels-container');
    calendarGridEl = document.getElementById('calendar-grid');
    eventListFilterBar = document.querySelector('.event-filter-bar');

    // Check for critical elements
    if (!plannerPane) { console.warn("Main.js: Planner pane element missing. Skipping planner view setup."); return; }
    if (!groupListUL) console.warn("Main.js: Group list UL missing.");
    if (!collageViewport) console.warn("Main.js: Collage viewport missing.");
    if (!eventPanelsContainer) console.warn("Main.js: Event panels container missing.");
    if (!activeGroupNameEl) console.warn("Main.js: Active group name element missing.");
    if (!activeGroupAvatarEl) console.warn("Main.js: Active group avatar element missing.");
    if (!activeGroupSettingsButton) console.warn("Main.js: Active group settings button missing.");
    if (!calendarGridEl) console.warn("Main.js: Calendar grid element missing.");
    if (!eventListFilterBar) console.warn("Main.js: Event list filter bar missing.");

    // Initialize Modals and UI Components
    setupEventDetailsModal();
    setupCreateGroupModal();
    setupGroupSettingsModal();
    // setupEventCreationModal(); // Not needed here as it self-initializes
    if (collageViewport && eventPanelsContainer) {
        setupViewportInteractions(collageViewport, eventPanelsContainer);
    }
    setupViewSwitching();
    hookEventFilterBar();
    hookCalendarNavigation();
    initInsightsManager();

    // Load initial data
    if(groupListUL) { // Only load if the UL exists (to prevent errors if planner-pane is not fully loaded)
        await loadGroups();
    }
    await loadAllUserEventsAndProcess();

    // Handle initial view based on hash
    const { view: initialView, groupId: initialGroupId } = parseHash();
    let currentView = initialView || 'groups';
    console.log(`Main.js: Initial Hash State: view=${currentView}, groupId=${initialGroupId}`);

    if (currentView === "calendar") {
        switchView("calendar");
    } else if (currentView === "events") {
        switchView("events");
    } else if (currentView === "insights") {
         switchView("insights");
    } else { // Default to 'groups'
        currentView = 'groups';
        let activated = false;
        if (groupListUL && initialGroupId) {
            const li = groupListUL.querySelector(`.group-item[data-group-id="${initialGroupId}"]`);
            if (li) {
                 activated = await activateGroup(li, initialGroupId); 
            }
        }

        const isMobile = window.innerWidth <= 768;
        if (!activated && !isMobile && groupListUL && groupsData.length > 0) {
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
             if(activeGroupSettingsButton) activeGroupSettingsButton.style.display = 'none';
        }
        switchView("groups"); // Ensure groups view is active
    }

    // --- Event Listeners (Attached only once) ---
    if (groupListUL) {
        groupListUL.addEventListener('click', (e) => {
            const li = e.target.closest('.group-item');
            if (!li || li.classList.contains('add-new-group-item')) return;
            if (li.classList.contains('active') && window.innerWidth > 768) return; // Don't re-activate on desktop if already active
            const groupId = li.dataset.groupId;
            if (groupId) {
                activateGroup(li, groupId);
            }
        });
    }

    if (backButton) {
        backButton.addEventListener('click', goBackToGroupList);
    }

    if (activeGroupSettingsButton) {
        activeGroupSettingsButton.addEventListener('click', () => {
            const activeLi = groupListUL?.querySelector('.group-item.active:not(.add-new-group-item)');
            if (activeLi && activeLi.dataset.groupId) {
                openGroupSettingsModal(activeLi.dataset.groupId);
            } else {
                alert("Please select an active group first to change its settings.");
            }
        });
    }

    let isCurrentlyMobile = window.innerWidth <= 768;
    window.addEventListener('resize', debounce(() => {
        const wasMobile = isCurrentlyMobile;
        isCurrentlyMobile = window.innerWidth <= 768;

        if (wasMobile !== isCurrentlyMobile) {
            let currentLogicalView = 'groups'; // Default
            if (plannerPane?.classList.contains('calendar-view-active')) currentLogicalView = 'calendar';
            else if (plannerPane?.classList.contains('events-view-active')) currentLogicalView = 'events';
            else if (plannerPane?.classList.contains('insights-view-active')) currentLogicalView = 'insights';

             if(collageViewport) setTransformState({ x: 0, y: 0, s: 1.0 }); // Reset viewport on resize
            switchView(currentLogicalView); // Refresh view for new screen size

            if (!isCurrentlyMobile && currentLogicalView === 'groups') { // If switched to desktop and in groups view
                 const activeLi = groupListUL?.querySelector('.group-item.active:not(.add-new-group-item)') || 
                                groupListUL?.querySelector('.group-item:not(.add-new-group-item)'); // Fallback to first group
                 if (activeLi && activeLi.dataset.groupId) {
                     activateGroup(activeLi, activeLi.dataset.groupId);
                 } else {
                     if(eventPanelsContainer) eventPanelsContainer.innerHTML = '<p class="info-message">No groups available.</p>';
                     if(activeGroupNameEl) activeGroupNameEl.textContent = 'No Group Selected';
                     if(activeGroupAvatarEl) activeGroupAvatarEl.src = '/static/img/default-group-avatar.png';
                     if(activeGroupSettingsButton) activeGroupSettingsButton.style.display = 'none';
                 }
            }
        } else if (plannerPane?.classList.contains('events-view-active')) {
            // If not a mobile/desktop switch, but still a resize, and events view is active
            adjustEventTileSizesIfNeeded();
        }
         // If any other view needs resize adjustments, add them here
    }, 250));

    document.addEventListener('openEventModalRequest', (event) => {
        const eventData = event.detail.eventData;
        if (eventData?.id) {
            openEventModal(eventData);
        } else {
            console.warn("Main.js: Received openEventModalRequest without valid event data.");
        }
    });

    document.addEventListener('eventDataUpdated', async (event) => {
        const { eventId, updatedEvent } = event.detail;

        if (!updatedEvent || (typeof updatedEvent.id === 'undefined' && !updatedEvent._deleted)) {
            console.warn('[MainJS] Received eventDataUpdated with invalid updatedEvent data or missing ID for non-deleted event.');
            return;
        }
        console.log(`[MainJS] Event data updated for ID ${eventId}:`, updatedEvent);

        // Update allEventsData
        const indexInAllEvents = allEventsData.findIndex(e => String(e.id) === String(eventId));
        if (updatedEvent._deleted) {
            if (indexInAllEvents !== -1) allEventsData.splice(indexInAllEvents, 1);
        } else {
            const processedUpdatedEvent = {
                ...updatedEvent,
                date: updatedEvent.date ? new Date(updatedEvent.date) : null,
                group_name: updatedEvent.group_name || 'Direct Invite/Other', // Ensure group_name consistency
            };
            if (indexInAllEvents !== -1) {
                allEventsData[indexInAllEvents] = { ...allEventsData[indexInAllEvents], ...processedUpdatedEvent };
            } else {
                allEventsData.push(processedUpdatedEvent); // Add if new event
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
            let currentFilter = eventListFilterBar?.querySelector('.filter-pill.active')?.dataset.filter || 'upcoming';
            renderAllEventsList(currentFilter); // This will also call adjustEventTileSizesIfNeeded
        }
        if (plannerPane?.classList.contains('calendar-view-active')) {
            const calDate = getCalendarDate();
            renderCalendar(calDate.getFullYear(), calDate.getMonth());
        }

        const activeGroupLi = groupListUL?.querySelector('.group-item.active');
        if (activeGroupLi && plannerPane?.offsetParent !== null && 
            !plannerPane.classList.contains('events-view-active') && 
            !plannerPane.classList.contains('calendar-view-active') && 
            !plannerPane.classList.contains('insights-view-active')) {
            
            const activeGroupId = activeGroupLi.dataset.groupId;
            let eventIsRelevantToActiveGroup = String(updatedEvent.group_id) === String(activeGroupId);
            if (updatedEvent._deleted && indexInAllEvents !== -1) { 
                 // Check original data if available and not yet spliced from a temporary allEventsData copy
                 // This part can be tricky if allEventsData is mutated directly before this check.
                 // A robust way is to check if the original event (before update/delete) belonged to the group.
                 // For now, this relies on the group_id provided in the deleted event marker.
                 const originalGroupIdIfDeleted = event.detail.originalGroupId; // If eventRenderer.js provided it
                 if (originalGroupIdIfDeleted && String(originalGroupIdIfDeleted) === String(activeGroupId)) {
                    eventIsRelevantToActiveGroup = true;
                 } else if (updatedEvent.group_id && String(updatedEvent.group_id) === String(activeGroupId)){
                    // If deleted event still has group_id from payload
                    eventIsRelevantToActiveGroup = true;
                 }
            } else if (!updatedEvent._deleted && updatedEvent.node_id === null && indexInAllEvents !== -1) {
                // Logic for unassigned events, assuming they were previously in this group
                const previousEventData = allEventsData[indexInAllEvents]; 
                if (previousEventData && String(previousEventData.group_id) === String(activeGroupId)) {
                    eventIsRelevantToActiveGroup = true;
                }
            }

            if (eventIsRelevantToActiveGroup) {
                 console.log(`[MainJS] Re-rendering group events for group ${activeGroupId} due to relevant event update/delete.`);
                 await activateGroup(activeGroupLi, activeGroupId);
            }
        }
        console.log("[MainJS] UI refresh logic executed after eventDataUpdated.");
    });

    mainJSInitialized = true; // Set initialization flag
    console.log("Main.js: Planner setup complete.");
}

// --- Group Activation ---
async function activateGroup(groupListItem, groupId) {
    if (!groupListItem || !groupId) return false;
    if (groupListItem.classList.contains('add-new-group-item')) return false;
    
    // Ensure critical elements are available (could be put in a checkInitialized function)
    if (!groupListUL || !activeGroupNameEl || !activeGroupAvatarEl || !plannerPane || !eventPanelsContainer || !activeGroupSettingsButton) {
         console.error("Main.js: Cannot activate group - Required UI elements missing.");
         return false;
    }

    const group = groupsData.find(g => String(g.id) === String(groupId));
    if (!group) {
        console.warn(`Main.js: Group with ID ${groupId} not found in groupsData.`);
        if(activeGroupSettingsButton) activeGroupSettingsButton.style.display = 'none';
        return false;
    }

    const isMobile = window.innerWidth <= 768;
    const currentActiveGroupLi = groupListUL.querySelector('.group-item.active:not(.add-new-group-item)');

    if (currentActiveGroupLi && currentActiveGroupLi !== groupListItem) {
        const currentGroupId = currentActiveGroupLi.dataset.groupId;
        if (currentGroupId) {
            try {
                const currentState = getTransformState();
                if(currentState) groupViewStates.set(String(currentGroupId), currentState);
            } catch (e) { console.warn("Main.js: Could not get transform state for saving:", e); }
        }
        currentActiveGroupLi.classList.remove('active');
    }

    try {
        const savedView = groupViewStates.get(String(groupId));
        setTransformState(savedView || { x: 0, y: 0, s: 1.0 });
    } catch (e) {
        console.warn("Main.js: Could not set transform state:", e);
        if(eventPanelsContainer) eventPanelsContainer.style.transform = 'translate(0px, 0px) scale(1)';
    }

    groupListItem.classList.add('active');
    activeGroupNameEl.textContent = group.name || 'Group Events';
    activeGroupAvatarEl.src = group.avatar_url || '/static/img/default-group-avatar.png';
    if(activeGroupSettingsButton) activeGroupSettingsButton.style.display = 'inline-flex';

    await renderGroupEvents(groupId); 

    if (isMobile) {
        plannerPane.classList.add('mobile-event-view-active');
        const collageArea = document.getElementById('event-collage-area'); 
        if (collageArea) {
            collageArea.style.display = 'flex'; // MODIFIED: Ensure it's flex for its children
            collageArea.scrollTop = 0;
        }
        const groupListAreaEl = document.querySelector('.group-list-area'); // Get the group list area
        if(groupListAreaEl) groupListAreaEl.style.display = 'none'; // Hide the group list area itself
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
    if (!mainJSInitialized) { // Check flag before running setup
        setupGlobalUI(); // Global UI can be setup regardless of planner
        const plannerEl = document.getElementById('planner-pane');
        if (plannerEl) {
            await setupPlannerView();
        }
    } else {
        console.log("Main.js: DOMContentLoaded fired, but mainJSInitialized is true. Skipping setup.");
    }
});
// --- END OF FILE static/js/main.js ---