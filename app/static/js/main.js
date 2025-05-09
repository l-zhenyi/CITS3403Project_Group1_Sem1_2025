// --- START OF FILE main.js ---

// --- Imports ---
import { loadGroups, groupsData, parseHash, updateHash, loadAllUserEventsAndProcess } from './dataHandle.js'; // Added loadAllUserEventsAndProcess
import { renderGroupEvents, showContextMenu } from './eventRenderer.js';
import { setupViewSwitching, switchView, hookCalendarNavigation, goBackToGroupList } from './viewManager.js';
import { hookEventFilterBar } from './eventActions.js';
import { setupModal as setupEventDetailsModal, openEventModal } from './modalManager.js'; // Renamed for clarity
import { setupCreateGroupModal } from './groupModalManager.js'; // <-- NEW IMPORT
import { setupViewportInteractions, getTransformState, setTransformState, debounce } from './viewportManager.js';
import { setupSearchWidget } from './search.js';
import { initInsightsManager } from './insightsManager.js';

// --- Global Variables ---
window.draggingAllowed = true; // Still needed for viewport panning
const groupViewStates = new Map();

let activeGroupNameEl, activeGroupAvatarEl, plannerPane, backButton, groupListUL,
    collageViewport, eventPanelsContainer;

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
            console.log(`Context menu triggered on type: ${type}, ID: ${elementId}`);
            showContextMenu({ x: e.pageX, y: e.pageY, type, id: elementId });
        });
    } else {
         console.log("Collage viewport not found for context menu setup.");
    }
}

// --- Planner-Specific Setup ---
async function setupPlannerView() {
    console.log("Planner view detected. Initializing planner setup...");

    // Re-select DOM elements
    activeGroupNameEl = document.getElementById('active-group-name');
    activeGroupAvatarEl = document.getElementById('active-group-avatar');
    plannerPane = document.getElementById('planner-pane');
    backButton = document.querySelector('.back-button');
    groupListUL = document.querySelector('.group-list-area ul');
    collageViewport = document.getElementById('collage-viewport');
    eventPanelsContainer = document.getElementById('event-panels-container');

    if (!plannerPane) {
        console.warn("Planner pane element missing. Skipping planner view setup.");
        return;
    }
     // Check for other potentially missing elements and warn
     if (!groupListUL) console.warn("Group list UL missing.");
     if (!collageViewport) console.warn("Collage viewport missing.");
     if (!eventPanelsContainer) console.warn("Event panels container missing.");
     if (!activeGroupNameEl) console.warn("Active group name element missing.");
     if (!activeGroupAvatarEl) console.warn("Active group avatar element missing.");


    setupEventDetailsModal(); // Setup event details modal
    setupCreateGroupModal(); // <-- SETUP NEW CREATE GROUP MODAL
    // Only setup viewport interactions if the collage exists
    if (collageViewport && eventPanelsContainer) {
        setupViewportInteractions(collageViewport, eventPanelsContainer);
    }
    setupViewSwitching();
    hookEventFilterBar();
    hookCalendarNavigation();
    initInsightsManager(); 

    // Load groups only if group list exists
    if(groupListUL) {
        await loadGroups();
    }
    // Load all events data for calendar and list views
    await loadAllUserEventsAndProcess();


    // Activate view based on hash
    const { view: initialView, groupId: initialGroupId } = parseHash();
    let currentView = initialView || 'groups'; // Default to groups

    console.log(`Initial Hash State: view=${currentView}, groupId=${initialGroupId}`);

    // --- Revised View Activation Logic ---
    if (currentView === "calendar") {
        switchView("calendar");
    } else if (currentView === "events") {
        switchView("events");
    } else if (currentView === "insights") {
         switchView("insights");
    } else { // Default or Groups view
        currentView = 'groups'; // Ensure currentView is 'groups'
        let activated = false;
        if (groupListUL && initialGroupId) {
            const li = groupListUL.querySelector(`.group-item[data-group-id="${initialGroupId}"]`);
            if (li) {
                 console.log(`Activating group from hash: ${initialGroupId}`);
                 activated = await activateGroup(li, initialGroupId);
            } else {
                console.log(`Group ${initialGroupId} from hash not found in list.`);
            }
        }

        // If no group activated from hash, try the first group (on desktop)
        const isMobile = window.innerWidth <= 768;
        if (!activated && !isMobile && groupListUL) {
            const firstLi = groupListUL.querySelector(".group-item:not(.add-new-group-item)"); // Exclude create button
            if (firstLi) {
                const firstGroupId = firstLi.dataset.groupId;
                 console.log(`Activating first group: ${firstGroupId}`);
                activated = await activateGroup(firstLi, firstGroupId);
            } else {
                console.log("No groups found in list to activate.");
            }
        }

        // If still no group activated (e.g., no groups, mobile load)
        if (!activated) {
             console.log("No group activated, setting default state for groups view.");
             if(eventPanelsContainer) eventPanelsContainer.innerHTML = '<p class="info-message">No groups available or selected.</p>';
             if(activeGroupNameEl) activeGroupNameEl.textContent = 'No Group Selected';
             if(activeGroupAvatarEl) activeGroupAvatarEl.src = '/static/img/default-group-avatar.png';
        }
        // Ensure the groups view itself is displayed correctly
        switchView("groups");
    }


    // Group list click
    groupListUL?.addEventListener('click', (e) => {
        const li = e.target.closest('.group-item');
        if (!li || li.classList.contains('add-new-group-item')) return; // Ignore clicks on the "Add Group" button here
        
        // Allow re-clicking active on mobile to show view, but not on desktop
        if (li.classList.contains('active') && window.innerWidth > 768) return;
        const groupId = li.dataset.groupId;
        if (groupId) {
            console.log(`Group list item clicked: ID ${groupId}`);
            activateGroup(li, groupId);
        }
    });

    // Back button click (for mobile)
    backButton?.addEventListener('click', goBackToGroupList);

    // Resize logic
    let isCurrentlyMobile = window.innerWidth <= 768;
    window.addEventListener('resize', debounce(() => {
        const wasMobile = isCurrentlyMobile;
        isCurrentlyMobile = window.innerWidth <= 768;

        if (wasMobile !== isCurrentlyMobile) {
             console.log(`Resize detected: Viewport changed from ${wasMobile ? 'Mobile' : 'Desktop'} to ${isCurrentlyMobile ? 'Mobile' : 'Desktop'}`);

             // Determine the currently active *logical* view (ignoring mobile specifics)
            let currentLogicalView = 'groups'; // Default
            if (plannerPane?.classList.contains('calendar-view-active')) currentLogicalView = 'calendar';
            else if (plannerPane?.classList.contains('events-view-active')) currentLogicalView = 'events';
            else if (plannerPane?.classList.contains('insights-view-active')) currentLogicalView = 'insights';

            console.log(`Switching view based on resize. Current logical view: ${currentLogicalView}`);

             // Reset transform state on resize to avoid weird panning/zooming issues
             if(collageViewport) setTransformState({ x: 0, y: 0, s: 1.0 });

            // Re-apply the current logical view to fix layout
            switchView(currentLogicalView);

            // Additional adjustments based on the *new* size
            if (!isCurrentlyMobile) { // Transitioning TO Desktop
                // Ensure a group is active if we are in the groups view
                if (currentLogicalView === 'groups') {
                     const activeLi = groupListUL?.querySelector('.group-item.active:not(.add-new-group-item)') || groupListUL?.querySelector('.group-item:not(.add-new-group-item)');
                     if (activeLi) {
                         console.log("Resize to Desktop: Re-activating group:", activeLi.dataset.groupId);
                         activateGroup(activeLi, activeLi.dataset.groupId); // Re-activate to ensure collage shows
                     } else {
                         console.log("Resize to Desktop: No group to activate in groups view.");
                         if(eventPanelsContainer) eventPanelsContainer.innerHTML = '<p class="info-message">No groups available.</p>';
                          if(activeGroupNameEl) activeGroupNameEl.textContent = 'No Group Selected';
                          if(activeGroupAvatarEl) activeGroupAvatarEl.src = '/static/img/default-group-avatar.png';
                     }
                }
            }
            // No specific action needed when transitioning TO mobile here,
            // switchView handles showing the correct primary content area.
            // The mobile-event-view-active class is removed by switchView.
        }
    }, 250));

    // Modal listener
    document.addEventListener('openEventModalRequest', (event) => {
        const eventData = event.detail.eventData;
        if (eventData?.id) {
            console.log(`Received request to open modal for event ID: ${eventData.id}`);
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
         console.warn("activateGroup called with invalid item or groupId:", groupListItem, groupId);
         return false;
    }
    if (groupListItem.classList.contains('add-new-group-item')) { // Prevent activating the "Create Group" button
        return false;
    }
     // Ensure elements exist before proceeding
     if (!groupListUL || !activeGroupNameEl || !activeGroupAvatarEl || !plannerPane || !eventPanelsContainer) {
         console.error("Cannot activate group: Required UI elements missing.");
         return false;
     }

    const group = groupsData.find(g => String(g.id) === String(groupId));
    if (!group) {
        console.warn(`Group data not found for ID: ${groupId}`);
        return false;
    }

     console.log(`Activating Group: ${group.name} (ID: ${groupId})`);

    const isMobile = window.innerWidth <= 768;
    const currentActiveGroupLi = groupListUL.querySelector('.group-item.active:not(.add-new-group-item)');

    // Save state of the previously active group
    if (currentActiveGroupLi && currentActiveGroupLi !== groupListItem) {
        const currentGroupId = currentActiveGroupLi.dataset.groupId;
        if (currentGroupId) {
            try {
                const currentState = getTransformState();
                if(currentState) { // Check if state is valid
                     groupViewStates.set(String(currentGroupId), currentState);
                     console.log(`Saved view state for group ${currentGroupId}:`, currentState);
                 }
            } catch (e) {
                 console.warn("Could not get transform state for saving:", e);
             }
        }
        currentActiveGroupLi.classList.remove('active');
    }

    // Restore state or reset for the new group
     try {
         const savedView = groupViewStates.get(String(groupId));
         if (savedView) {
             console.log(`Restoring view state for group ${groupId}:`, savedView);
             setTransformState({ x: savedView.panX, y: savedView.panY, s: savedView.scale });
         } else {
             console.log(`No saved state for group ${groupId}, resetting transform.`);
             setTransformState({ x: 0, y: 0, s: 1.0 });
         }
     } catch (e) {
         console.warn("Could not set transform state:", e);
         // Ensure transform is reset even on error
          if(eventPanelsContainer) eventPanelsContainer.style.transform = 'translate(0px, 0px) scale(1)';
     }


    // Update UI
    groupListItem.classList.add('active');
    activeGroupNameEl.textContent = group.name || 'Group Events';
    activeGroupAvatarEl.src = group.avatar_url || '/static/img/default-group-avatar.png';

    // Render events (awaiting this is important)
    await renderGroupEvents(groupId);

    // Handle mobile view switching
    if (isMobile) {
        plannerPane.classList.add('mobile-event-view-active');
        // Ensure collage area is displayed
        const collageArea = document.getElementById('event-collage');
        if (collageArea) {
            collageArea.style.display = 'block'; // Make sure it's visible
            collageArea.scrollTop = 0; // Scroll to top
        }
         // Ensure group list is hidden
         if (groupListUL.parentElement) groupListUL.parentElement.style.display = 'none';

    } else {
        // On desktop, ensure we are actually in the 'groups' tab view
        if (!plannerPane.classList.contains('calendar-view-active') &&
            !plannerPane.classList.contains('events-view-active') &&
             !plannerPane.classList.contains('insights-view-active')) {
            // If not in other views, ensure the group view structure is correct
            // (switchView('groups') handles this implicitly if needed)
        } else {
            // If another tab (Calendar/Events/Insights) is active, switch back to Groups view
            console.log("Switching back to Groups view as a group was activated.");
            switchView('groups');
        }
    }

    // Update URL hash
    updateHash('groups', groupId);
    return true;
}

// --- DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOMContentLoaded event fired.");
    setupGlobalUI();

    const plannerEl = document.getElementById('planner-pane');
    if (plannerEl) {
         console.log("Planner pane found, setting up planner view...");
        await setupPlannerView();
    } else {
        console.log("Planner pane not found on this page.");
    }
});
// --- END OF FILE main.js ---