// --- START OF FILE main.js --- (REVISED based on other files)

// --- Imports ---
// Assuming these paths are correct relative to main.js
import { loadGroups, groupsData, parseHash, updateHash } from './dataHandle.js'; // Added updateHash
import { renderGroupEvents, showContextMenu } from './eventRenderer.js';
import { setupViewSwitching, switchView, hookCalendarNavigation, goBackToGroupList } from './viewManager.js';
import { hookEventFilterBar } from './eventActions.js';
import { setupModal, openEventModal } from './modalManager.js';
import { setupViewportInteractions, getTransformState, setTransformState, debounce } from './viewportManager.js';

// --- Global/Module Scope Variables ---
window.draggingAllowed = true; // Global flag for OrbitLayout compatibility
const groupViewStates = new Map(); // Stores {panX, panY, scale} for each groupId

// --- Core UI Elements ---
let activeGroupNameEl, activeGroupAvatarEl, plannerPane, backButton, groupListUL,
    collageViewport, eventPanelsContainer;


// --- MAIN EXECUTION ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM Content Loaded. Initializing application...");

    // --- Assign Core UI Elements ---
    activeGroupNameEl = document.getElementById('active-group-name');
    activeGroupAvatarEl = document.getElementById('active-group-avatar');
    plannerPane = document.getElementById('planner-pane');
    backButton = document.querySelector('.back-button');
    groupListUL = document.querySelector('.group-list-area ul');
    collageViewport = document.getElementById('collage-viewport');
    eventPanelsContainer = document.getElementById('event-panels-container');

    // --- Essential Elements Check ---
    if (!plannerPane || !groupListUL || !collageViewport || !eventPanelsContainer || !activeGroupNameEl || !activeGroupAvatarEl) {
        console.error("One or more essential elements (pane, group list, viewport, container, headers) not found. Aborting setup.");
        // Display error to user
        document.body.innerHTML = '<p style="color: red; padding: 20px;">Error: Critical UI elements missing. Application cannot start.</p>';
        return;
    }

    // --- Setup Systems ---
    console.log("Setting up core modules...");
    setupModal();
    setupViewportInteractions(collageViewport, eventPanelsContainer);
    setupViewSwitching(); // Sets up tab clicks -> switchView
    hookEventFilterBar();
    hookCalendarNavigation();

    // --- Load Initial Group Data ---
    console.log("Loading initial group data...");
    await loadGroups(); // Fetches groups, populates list, DOES NOT attach main click listeners anymore
    console.log("Initial group data loaded.");


    // --- Group Activation Function ---
    // Consolidates logic for activating a group view (used by initial load and clicks)
    async function activateGroup(groupListItem, groupId) {
        // Validate inputs
        if (!groupListItem || !groupId) {
            console.warn("activateGroup called with invalid arguments.");
            return false; // Indicate failure
        }
        const group = groupsData.find(g => String(g.id) === String(groupId));
        if (!group) {
            console.error(`Group data not found for ID: ${groupId}`);
            return false; // Indicate failure
        }

        console.log(`Activating group: ${group.name} (ID: ${groupId})`);
        const isMobile = window.innerWidth <= 768;

        // --- Save State of Previous Group ---
        const currentActiveGroupLi = groupListUL?.querySelector('.group-item.active');
        if (currentActiveGroupLi && currentActiveGroupLi !== groupListItem) {
            const currentGroupId = currentActiveGroupLi.dataset.groupId;
            if (currentGroupId) { // Ensure previous group ID exists
                const currentState = getTransformState();
                console.log(`Saving view state for previous group ${currentGroupId}:`, currentState);
                groupViewStates.set(currentGroupId, currentState);
            }
            currentActiveGroupLi.classList.remove('active');
        }

        // --- Restore State of New Group ---
        const savedView = groupViewStates.get(String(groupId)); // Use string ID consistently
        if (savedView) {
            console.log(`Restoring view state for group ${groupId}:`, savedView);
            setTransformState({ x: savedView.panX, y: savedView.panY, s: savedView.scale });
        } else {
            console.log(`No saved view state for group ${groupId}, resetting.`);
            setTransformState({ x: 0, y: 0, s: 1.0 });
        }

        // --- Update UI Elements ---
        groupListItem.classList.add('active');
        activeGroupNameEl.textContent = group.name || 'Group Events';
        activeGroupAvatarEl.src = group.avatar_url || '/static/img/default-group-avatar.png';

        // --- Render Group Content ---
        await renderGroupEvents(groupId); // THIS is where OrbitLayoutManager gets created/updated

        // --- Handle Mobile View Specifics ---
        if (isMobile) {
            console.log("Applying mobile event view state.");
            if (plannerPane) plannerPane.classList.add('mobile-event-view-active');
            const collageArea = document.getElementById('event-collage-area');
             if (collageArea) collageArea.scrollTop = 0;
        } else {
            // Ensure correct desktop view class is set
             if (plannerPane && !plannerPane.classList.contains('groups-view-active')) {
                 switchView('groups'); // Ensure main pane has correct class
             }
        }

        // Update URL hash - Use the function from dataHandle
        updateHash('groups', groupId);
        return true; // Indicate success
    } // --- End activateGroup ---


    // --- Apply Initial View Logic ---
    console.log("Applying initial view based on hash...");
    const { view: initialView, groupId: initialGroupId } = parseHash();
    console.log("Parsed hash on load:", { initialView, initialGroupId });

    if (initialView === "calendar") {
        switchView("calendar");
    } else if (initialView === "events") {
        switchView("events");
    } else { // Default to 'groups' view
        let activated = false;
        if (initialGroupId) {
            const li = groupListUL?.querySelector(`.group-item[data-group-id="${initialGroupId}"]`);
            if (li) {
                console.log(`Attempting to activate group ${initialGroupId} from hash.`);
                activated = await activateGroup(li, initialGroupId); // Await activation
            } else {
                console.warn(`Group ${initialGroupId} from hash not found in list, attempting fallback.`);
            }
        }

        // Fallback to first group if no group from hash or activation failed
        if (!activated) {
            const firstLi = groupListUL?.querySelector(".group-item");
            if (firstLi) {
                const firstGroupId = firstLi.dataset.groupId;
                console.log(`Activating first group (ID: ${firstGroupId}) as fallback.`);
                activated = await activateGroup(firstLi, firstGroupId); // Await activation
            }
        }

        // If still no group activated (e.g., list is empty)
        if (!activated) {
             console.warn("No groups found or failed to activate any group initially.");
             // Optionally display an "empty state" message in the main area
             if(eventPanelsContainer) eventPanelsContainer.innerHTML = '<p class="info-message">No groups available or selected.</p>';
             activeGroupNameEl.textContent = 'No Group Selected';
             activeGroupAvatarEl.src = '/static/img/default-group-avatar.png';
        }

        // Ensure the 'groups' view class is set on the main pane regardless
        switchView("groups"); // This primarily sets the class on plannerPane now

    } // --- End initial view logic ---


    // --- Centralized Group List Click Handling (Event Delegation) ---
    if (groupListUL) {
        groupListUL.addEventListener('click', (e) => {
            const li = e.target.closest('.group-item');
            if (!li) return; // Click wasn't on or inside a group item

            // Prevent re-activating the already active group unnecessarily
            if (li.classList.contains('active') && !window.innerWidth <= 768) { // Allow re-click on mobile to enter view
                 console.log("Clicked already active group on desktop, ignoring.");
                 return;
            }

            const groupId = li.dataset.groupId;
            if (groupId) {
                console.log(`Group list item clicked: ID ${groupId}`);
                activateGroup(li, groupId); // Use the central activation function
            } else {
                console.warn("Clicked group item missing data-group-id.");
            }
        });
        console.log("Centralized group list click listener attached.");
    } else {
        console.error("Group list UL not found, cannot attach click listener.");
    }

    // --- Back button listener (for mobile view) ---
    if (backButton) {
        backButton.addEventListener('click', goBackToGroupList);
    }

    // --- Resize Handler ---
    let isCurrentlyMobile = window.innerWidth <= 768;
    const handleResize = debounce(() => {
        const wasMobile = isCurrentlyMobile;
        isCurrentlyMobile = window.innerWidth <= 768;

        if (wasMobile !== isCurrentlyMobile) {
            console.log(`Resize detected: Transitioning from ${wasMobile ? 'Mobile' : 'Desktop'} to ${isCurrentlyMobile ? 'Mobile' : 'Desktop'}`);

            // Reset zoom/pan on transition
            console.log("Resetting zoom/pan due to layout transition.");
            setTransformState({ x: 0, y: 0, s: 1.0 });

            // Determine current logical view based on classes (more reliable)
            let currentView = 'groups';
            if (plannerPane?.classList.contains('calendar-view-active')) currentView = 'calendar';
            else if (plannerPane?.classList.contains('events-view-active')) currentView = 'events';
            // Note: mobile-event-view-active is a secondary state, not a primary view

            console.log(`Re-applying view logic for main view: ${currentView}`);
            switchView(currentView); // Re-apply common view logic (sets primary view classes)

            // Specific adjustments after main view is set
            if (isCurrentlyMobile) {
                // If transitioning TO mobile
                if (currentView === 'groups') {
                     // If desktop was showing groups, mobile should show list
                     console.log("Transition: Desktop Groups -> Mobile List");
                     plannerPane?.classList.remove('mobile-event-view-active'); // Ensure event view isn't shown
                     // No group should appear selected initially in mobile list view
                     groupListUL?.querySelectorAll('.group-item.active').forEach(item => item.classList.remove('active'));
                     activeGroupNameEl.textContent = `Select Group`;
                     activeGroupAvatarEl.src = '/static/img/default-group-avatar.png';
                } else {
                     // If was calendar/events on desktop, stay in that view on mobile
                     console.log(`Transition: Desktop ${currentView} -> Mobile ${currentView}`);
                     plannerPane?.classList.remove('mobile-event-view-active');
                }
            } else {
                // If transitioning TO desktop
                plannerPane?.classList.remove('mobile-event-view-active'); // Remove mobile state class
                if (currentView === 'groups') {
                    // Ensure a group is selected and rendered if switching to desktop groups view
                    let activeLi = groupListUL?.querySelector('.group-item.active');
                    if (!activeLi) { // If no group was active (e.g., from mobile list)
                        activeLi = groupListUL?.querySelector('.group-item'); // Select first
                        if(activeLi) {
                            console.log("No active group on transition to desktop, activating first.");
                            // Need to await here if activateGroup is async, but resize handler usually isn't async
                            activateGroup(activeLi, activeLi.dataset.groupId);
                        } else {
                             console.log("No groups to activate on transition to desktop.");
                              if(eventPanelsContainer) eventPanelsContainer.innerHTML = '<p class="info-message">No groups available.</p>';
                        }
                    } else {
                        // Group was already active, maybe re-render just in case? Or assume it's okay.
                        // Forcing a re-render might be disruptive if not needed.
                         console.log("Desktop groups view active, group already selected.");
                         // Optionally re-trigger render if needed: activateGroup(activeLi, activeLi.dataset.groupId);
                    }
                }
            }
        }
    }, 250);
    window.addEventListener('resize', handleResize);


    // --- Context Menu & Global Click Listener ---
    window.addEventListener('click', (e) => {
        const menu = document.getElementById('custom-context-menu');
        if (menu && menu.style.display !== 'none' && !e.target.closest('#custom-context-menu')) {
            menu.style.display = 'none';
        }
    });

    if (collageViewport) {
        collageViewport.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            let type = 'canvas'; let targetElement = null; let elementId = null;
            if (e.target.closest('.event-node')) { type = 'event-node'; targetElement = e.target.closest('.event-node'); elementId = targetElement.dataset.nodeId; }
            else if (e.target.closest('.event-panel')) { type = 'event-panel'; targetElement = e.target.closest('.event-panel'); elementId = targetElement.dataset.eventId; }
            console.log(`Context menu triggered on type: ${type}, ID: ${elementId}`);
            showContextMenu({ x: e.pageX, y: e.pageY, type: type, id: elementId });
        });
    } else {
        console.warn("Collage viewport not found, context menu on canvas disabled.");
    }

    // --- Listener for Modal Open Requests (from OrbitLayoutManager) ---
    document.addEventListener('openEventModalRequest', (event) => {
        const eventData = event.detail.eventData;
        if (eventData && eventData.id) {
            console.log("[App Listener] Caught 'openEventModalRequest', attempting to open modal for:", eventData.title);
            openEventModal(eventData); // Ensure openEventModal is imported correctly
        } else {
            console.warn("[App Listener] Caught 'openEventModalRequest' but eventData was missing or invalid:", event.detail);
        }
    });

    console.log("Application Initialization Complete.");

}); // --- END DOMContentLoaded ---

// --- END OF FILE main.js ---