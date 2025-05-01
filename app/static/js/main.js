// --- START OF FILE main.js --- (Complete & Unabbreviated)

// --- Imports ---
import { loadGroups, groupsData, parseHash } from './dataHandle.js';
import { renderGroupEvents, showContextMenu } from './eventRenderer.js';
import { setupViewSwitching, switchView, hookCalendarNavigation, goBackToGroupList } from './viewManager.js';
import { hookEventFilterBar } from './eventActions.js';
import { setupModal, openEventModal } from './modalManager.js';
import { setupViewportInteractions, getTransformState, setTransformState, debounce } from './viewportManager.js';

// --- Global/Module Scope Variables ---
window.draggingAllowed = true; // Global flag for OrbitLayout compatibility
const groupViewStates = new Map(); // Stores {panX, panY, scale} for each groupId

// --- Core UI Elements (Declare outside DOMContentLoaded for wider scope) ---
let activeGroupNameEl, activeGroupAvatarEl, plannerPane, backButton, groupListUL,
    collageViewport, eventPanelsContainer;


// --- MAIN EXECUTION ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM Content Loaded. Initializing application...");

    // --- Assign Core UI Elements ---
    // Assign references to DOM elements once the DOM is ready
    activeGroupNameEl = document.getElementById('active-group-name');
    activeGroupAvatarEl = document.getElementById('active-group-avatar'); // Ensure ID matches HTML ('active-group-avatar')
    plannerPane = document.getElementById('planner-pane');
    backButton = document.querySelector('.back-button');
    groupListUL = document.querySelector('.group-list-area ul');
    collageViewport = document.getElementById('collage-viewport');
    eventPanelsContainer = document.getElementById('event-panels-container'); // The element being panned/zoomed

    // --- Essential Elements Check ---
    // Verify that critical layout elements exist before proceeding
    if (!plannerPane || !groupListUL || !collageViewport || !eventPanelsContainer) {
        console.error("Essential planner elements (pane, group list, viewport, container) not found. Aborting setup.");
        // Optionally display a user-friendly error message on the page here
        return; // Stop execution if layout is broken
    }

    // --- Setup Systems ---
    // Initialize the different modules and features
    setupModal(); // Initialize modal elements and internal listeners (from modalManager.js)
    setupViewportInteractions(collageViewport, eventPanelsContainer); // Initialize panning/zooming (from viewportManager.js)
    await loadGroups(); // Fetch group data (essential for navigation)
    setupViewSwitching(); // Set up sidebar/tab view switching logic (from viewManager.js)
    hookEventFilterBar(); // Attach listeners for event list filters (from eventActions.js)
    hookCalendarNavigation(); // Attach listeners for calendar controls (from viewManager.js)


    // --- Initial View Logic ---
    // Determine the initial view based on the URL hash
    const { view, groupId } = parseHash(); // Get view type and optional groupId from URL
    console.log("Parsed hash on load:", { view, groupId });
    const firstLi = groupListUL?.querySelector(".group-item"); // Find the first group list item as a fallback

    // --- Group Activation Function ---
    // Encapsulates the logic for displaying a specific group's content
    async function activateGroup(groupListItem, groupId) {
        // Validate inputs
        if (!groupListItem || !groupId) {
            console.warn("activateGroup called with invalid arguments.");
            return;
        }
        // Find the corresponding group data object
        const group = groupsData.find(g => String(g.id) === String(groupId));
        if (!group) {
            console.error(`Group data not found for ID: ${groupId}`);
            return; // Cannot proceed without group data
        }

        console.log(`Activating group: ${group.name} (ID: ${groupId})`);
        const isMobile = window.innerWidth <= 768; // Check current screen size

        // --- Save State of Previous Group ---
        // Before switching, save the pan/zoom state of the currently active group
        const currentActiveGroupLi = groupListUL?.querySelector('.group-item.active');
        if (currentActiveGroupLi && currentActiveGroupLi !== groupListItem) {
            const currentGroupId = currentActiveGroupLi.dataset.groupId;
            const currentState = getTransformState(); // Get current pan/zoom from viewportManager
            console.log(`Saving view state for previous group ${currentGroupId}:`, currentState);
            groupViewStates.set(currentGroupId, currentState); // Store state in the map
            currentActiveGroupLi.classList.remove('active'); // Deactivate previous list item
        }

        // --- Restore State of New Group ---
        // Retrieve and apply the saved pan/zoom state for the group being activated
        const savedView = groupViewStates.get(groupId);
        if (savedView) {
            console.log(`Restoring view state for group ${groupId}:`, savedView);
            setTransformState({ x: savedView.panX, y: savedView.panY, s: savedView.scale }); // Apply saved state via viewportManager
        } else {
            console.log(`No saved view state for group ${groupId}, resetting.`);
            setTransformState({ x: 0, y: 0, s: 1.0 }); // Reset to default state via viewportManager
        }

        // --- Update UI Elements ---
        // Reflect the activated group in the UI
        groupListItem.classList.add('active'); // Highlight the selected group
        if (activeGroupNameEl) {
            activeGroupNameEl.textContent = group.name || 'Group Events'; // Set header title
        } else {
            console.warn("activeGroupNameEl not found when trying to set text content.");
        }
        if (activeGroupAvatarEl) {
            activeGroupAvatarEl.src = group.avatar_url || '/static/img/default-group-avatar.png'; // Set header avatar
        } else {
             console.warn("activeGroupAvatarEl not found when trying to set src.");
        }

        // --- Render Group Content ---
        // Fetch and display the events associated with this group
        await renderGroupEvents(groupId); // This function handles the core rendering (from eventRenderer.js)

        // --- Handle Mobile View Specifics ---
        // Adjust layout/classes for mobile view if necessary
        if (isMobile) {
            console.log("Applying mobile event view state.");
            if (plannerPane) plannerPane.classList.add('mobile-event-view-active'); // Add class to switch mobile panes
            const collageArea = document.getElementById('event-collage-area'); // Container for mobile scrolling
             if (collageArea) collageArea.scrollTop = 0; // Scroll mobile list view to top
        } else {
            // Ensure correct view class is set for desktop if switching from another view
             if (plannerPane && !plannerPane.classList.contains('groups-view-active')) {
                 switchView('groups'); // Make sure the main pane has the right class
             }
        }

        // Update URL hash to reflect the current state (allows bookmarking/sharing)
        window.location.hash = `groups/${groupId}`;
    } // --- End activateGroup ---


    // --- Apply Initial View Logic (Continued) ---
    // Decide which view to show based on the parsed hash
    if (view === "calendar") {
        switchView("calendar");
    } else if (view === "events") {
        switchView("events");
    } else { // Default to groups view
        let activated = false; // Flag to track if a group was successfully activated
        if (groupId) {
            // Try to activate the group specified in the hash
            const li = groupListUL?.querySelector(`.group-item[data-group-id="${groupId}"]`);
            if (li) {
                console.log(`Activating group ${groupId} from hash.`);
                await activateGroup(li, groupId); // Use the activation function
                activated = true;
            } else {
                console.warn(`Group ${groupId} from hash not found, attempting fallback.`);
            }
        }
        // If no group from hash or hash group not found, activate the first group
        if (!activated && firstLi) {
            console.log("Activating first group as fallback.");
            await activateGroup(firstLi, firstLi.dataset.groupId);
            activated = true;
        }
        // If still no group activated (e.g., no groups exist)
        if (!activated) {
             console.warn("No groups found to activate initially.");
             // Optionally display an "empty state" message here
             switchView("groups"); // Ensure the groups view container is visible
        }
        // Ensure the correct view class is applied if default hash handling occured
        if (!view || view === "groups") {
             switchView("groups");
        }
    }


    // --- Group List Click Handling ---
    // Add listener to the group list UL for efficient event handling
    if (groupListUL && plannerPane) {
        groupListUL.addEventListener('click', (e) => {
            // Find the clicked group item element
            const li = e.target.closest('.group-item');
            // Ignore clicks not on a group item or on the already active item
            if (!li || li.classList.contains('active')) return;
            const groupId = li.dataset.groupId;
            activateGroup(li, groupId); // Activate the clicked group
        });
    } else {
        // Should not happen based on initial checks, but good safety measure
        console.warn("Group list UL or planner pane not found, group click handling disabled.");
    }

    // --- Back button listener (for mobile view) ---
    if (backButton) {
        backButton.addEventListener('click', goBackToGroupList); // Use function from viewManager.js
    }

    // --- Resize Handler ---
    // Handles transitions between mobile and desktop layouts
    let isCurrentlyMobile = window.innerWidth <= 768; // Initial check
    const handleResize = debounce(() => { // Use imported debounce utility
        const wasMobile = isCurrentlyMobile; // Store previous state
        isCurrentlyMobile = window.innerWidth <= 768; // Check current state

        // Only run transition logic if the mobile/desktop state actually changed
        if (wasMobile !== isCurrentlyMobile) {
            console.log(`Resize detected: Transitioning from ${wasMobile ? 'Mobile' : 'Desktop'} to ${isCurrentlyMobile ? 'Mobile' : 'Desktop'}`);

            // Reset zoom/pan state on layout transitions for simplicity
            console.log("Resetting zoom/pan due to layout transition.");
            setTransformState({ x: 0, y: 0, s: 1.0 }); // Use viewportManager function

            // Re-evaluate the logical current view (groups, calendar, events)
            let currentView = 'groups'; // Default assumption
            if (plannerPane?.classList.contains('calendar-view-active')) currentView = 'calendar';
            else if (plannerPane?.classList.contains('events-view-active')) currentView = 'events';

            console.log(`Re-applying view logic for view: ${currentView}`);
            switchView(currentView); // Re-apply common view logic via viewManager

            // Apply specific adjustments based on the transition direction
            if (wasMobile && plannerPane?.classList.contains('mobile-event-view-active') && !isCurrentlyMobile) {
                // Transitioning Mobile Events -> Desktop Groups
                console.log("Transition: Mobile Events -> Desktop Groups");
                const activeMobileGroupLi = groupListUL?.querySelector('.group-item.active');
                if (!activeMobileGroupLi) {
                    // If somehow no group was active, activate the first one
                    const firstLiToActivate = groupListUL?.querySelector('.group-item');
                    if (firstLiToActivate) activateGroup(firstLiToActivate, firstLiToActivate.dataset.groupId);
                }
                 // Ensure the mobile-specific class is removed
                 if (plannerPane) plannerPane.classList.remove('mobile-event-view-active');
                 // Ensure the correct desktop view is active
                 if (!plannerPane?.classList.contains('groups-view-active')) {
                      switchView('groups');
                 }

            } else if (!wasMobile && currentView === 'groups' && isCurrentlyMobile) {
                // Transitioning Desktop Groups -> Mobile List (initial mobile state)
                console.log("Transition: Desktop Groups -> Mobile List");
                 // No group should appear "active" when showing the list on mobile
                groupListUL?.querySelectorAll('.group-item.active').forEach(item => item.classList.remove('active'));
                 if (activeGroupNameEl) activeGroupNameEl.textContent = `Select Group`; // Update header
                 if (activeGroupAvatarEl) activeGroupAvatarEl.src = ''; // Clear avatar
                 if (plannerPane) plannerPane.classList.remove('mobile-event-view-active'); // Ensure mobile view not active yet

            } else if (isCurrentlyMobile && plannerPane?.classList.contains('mobile-event-view-active')) {
                 // Resized while already viewing events on mobile - No specific action needed typically
                 console.log("Resized within mobile event view.");
            } else if (isCurrentlyMobile) {
                 // Resized while viewing the group list on mobile - No specific action needed typically
                 console.log("Resized within mobile group list view.");
                 if (plannerPane) plannerPane.classList.remove('mobile-event-view-active'); // Ensure correct state
            }
        } else {
           // Optional: Log if resize happened but didn't cross the mobile threshold
           // console.log("Resize detected, but no mobile/desktop transition.");
        }
    }, 250); // Debounce time in milliseconds

    window.addEventListener('resize', handleResize); // Attach the debounced handler


    // --- MODAL OPENER LISTENER ---
    // Listens for clicks on the "More Info" button within expanded event panels
    document.body.addEventListener('click', (event) => {
        // Target the anchor tag specifically for reliability
        const moreInfoButton = event.target.closest('a.info-button');
        // Ensure the button is within the specific expanded content container
        if (moreInfoButton && moreInfoButton.closest('.orbit-element-expanded-content')) {
            console.log("Modal 'More Info' button clicked."); // Debug log
            event.preventDefault(); // Prevent default anchor tag navigation
            // Find the parent event panel to get the associated data
            const eventPanel = moreInfoButton.closest('.event-panel');
            if (eventPanel && eventPanel._eventData) {
                // Call the imported function from modalManager.js to open the modal
                openEventModal(eventPanel._eventData);
            } else {
                // Log error and inform user if data is missing
                console.error("Could not find event panel or _eventData for clicked 'More Info'.", moreInfoButton);
                alert("Sorry, could not load event details at this time.");
            }
        }
    });


    // --- Context Menu & Global Click Listener ---
    // Handles hiding the custom context menu when clicking elsewhere
    window.addEventListener('click', (e) => {
        const menu = document.getElementById('custom-context-menu');
        // Hide context menu if visible and click wasn't inside it
        if (menu && menu.style.display !== 'none') {
            if (!e.target.closest('#custom-context-menu')) {
                menu.style.display = 'none';
            }
        }
        // Note: Modal backdrop click listener is handled internally by modalManager.js
    });

    // Handles showing the custom context menu on right-click within the viewport
    if (collageViewport) {
        collageViewport.addEventListener('contextmenu', (e) => {
            e.preventDefault(); // Prevent default browser menu

            // Determine what element type was right-clicked
            let type = 'canvas'; // Default to background
            let targetElement = null;
            let elementId = null;

            if (e.target.closest('.event-node')) {
                type = 'event-node';
                targetElement = e.target.closest('.event-node');
                elementId = targetElement.dataset.nodeId;
            } else if (e.target.closest('.event-panel')) {
                type = 'event-panel';
                targetElement = e.target.closest('.event-panel');
                elementId = targetElement.dataset.eventId; // Panels have eventId
            }
            // Add checks for other interactive elements here if needed

            console.log(`Context menu triggered on type: ${type}, ID: ${elementId}`);

            // Show the context menu (function from eventRenderer.js)
            showContextMenu({
                x: e.pageX, // Use page coordinates for positioning
                y: e.pageY,
                type: type,
                id: elementId, // Pass the specific ID (or null for canvas)
            });
        });
    } else {
        console.warn("Collage viewport not found, context menu on canvas disabled.");
    }

    console.log("Application Initialization Complete.");

}); // --- END DOMContentLoaded ---

// --- END OF FILE main.js ---