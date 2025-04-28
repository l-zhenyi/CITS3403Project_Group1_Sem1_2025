// --- START OF FILE main.js --- (REVISED Imports & Calls)

import { loadGroups, groupsData, parseHash } from './dataHandle.js';
import { renderGroupEvents, showContextMenu } from './eventRenderer.js';
import { setupViewSwitching, switchView, hookCalendarNavigation, goBackToGroupList } from './viewManager.js';
import { hookDemoButtons, hookEventFilterBar } from './eventActions.js';
import { setupModal, openEventModal } from './modalManager.js'; // <--- IMPORT

window.draggingAllowed = true;
let panX = 0, panY = 0, scale = 1;
const groupViewStates = new Map();
const container = document.getElementById('event-panels-container'); // Keep if needed for zoom/pan

// --- Core UI Elements (Declare outside) ---
// Keep these if they are needed by logic remaining in main.js
let activeGroupNameEl, activeGroupAvatarEl, plannerPane, backButton, groupListUL;

// --- Debounce Function ---
function debounce(func, wait, immediate) { /* ... keep debounce ... */ }

// --- applyTransform ---
function applyTransform() { /* ... keep applyTransform ... */ }

// --- setupZoomAndPan ---
function setupZoomAndPan() { /* ... keep setupZoomAndPan ... */ }


// --- MAIN EXECUTION ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM Content Loaded. Initializing application...");

    // --- Assign Core UI Elements needed by main.js ---
    activeGroupNameEl = document.getElementById('active-group-name');
    activeGroupAvatarEl = document.getElementById('active-group-avatar');
    plannerPane = document.getElementById('planner-pane');
    backButton = document.querySelector('.back-button');
    groupListUL = document.querySelector('.group-list-area ul');

    // --- Check for essential elements ---
    if (!plannerPane || !groupListUL) {
        console.error("Essential planner elements (pane, group list) not found. Aborting setup.");
        return;
    }

    // --- Setup Modal System ---
    setupModal(); // Initialize modal elements and internal listeners

    // --- Load Data & Setup UI ---
    await loadGroups();
    setupViewSwitching();
    hookDemoButtons();
    hookEventFilterBar();
    hookCalendarNavigation();
    setupZoomAndPan(); // Setup after container is known

    // --- Initial View Logic ---
    const { view, groupId } = parseHash();
    console.log("Parsed hash on load:", { view, groupId });
    const firstLi = groupListUL?.querySelector(".group-item");

    // --- Group Activation Function (Remains in main.js) ---
    async function activateGroup(groupListItem, groupId) {
        // ... (keep the logic inside activateGroup AS IS - it uses activeGroupNameEl etc.) ...
        if (!groupListItem || !groupId) { /*...*/ return; }
        const group = groupsData.find(g => String(g.id) === String(groupId));
        if (!group) { /*...*/ return; }
        console.log(`Activating group: ${group.name} (ID: ${groupId})`);
        const isMobile = window.innerWidth <= 768;
        // Save State
        const currentActiveGroupLi = groupListUL?.querySelector('.group-item.active');
        if (currentActiveGroupLi && currentActiveGroupLi !== groupListItem) { /*...*/ }
        // Restore State
        const savedView = groupViewStates.get(groupId);
        if (savedView) { /*...*/ } else { /*...*/ }
        applyTransform();
        // Update UI
        groupListItem.classList.add('active');
        if (activeGroupNameEl) activeGroupNameEl.textContent = group.name || 'Group Events';
        else console.warn("activeGroupNameEl not found when trying to set text content.");
        if (activeGroupAvatarEl) activeGroupAvatarEl.src = group.avatar_url || '/static/img/default-group-avatar.png';
        else console.warn("activeGroupAvatarEl not found when trying to set src.");
        // Render Content
        await renderGroupEvents(groupId);
        // Handle Mobile
        if (isMobile) { /*...*/ } else { /*...*/ }
        window.location.hash = `groups/${groupId}`;
    } // --- End activateGroup ---


    // --- Apply Initial View Logic ---
    if (view === "calendar") { /*...*/ }
    else if (view === "events") { /*...*/ }
    else { // Default to groups
        let activated = false;
        if (groupId) {
             const li = groupListUL?.querySelector(`.group-item[data-group-id="${groupId}"]`);
             if (li) { await activateGroup(li, groupId); activated = true; }
             else { console.warn(`Group ${groupId} from hash not found.`); }
        }
        if (!activated && firstLi) { await activateGroup(firstLi, firstLi.dataset.groupId); activated = true; }
        if (!activated) { console.warn("No groups found to activate initially."); switchView("groups"); }
         if (!view || view === "groups") { switchView("groups"); }
    }

    // --- Group List Click Handling ---
    if (groupListUL && plannerPane) {
        groupListUL.addEventListener('click', (e) => {
            const li = e.target.closest('.group-item');
            if (!li || li.classList.contains('active')) return;
            activateGroup(li, li.dataset.groupId); // Call async function
        });
    } else { /*...*/ }

    // --- Back button listener ---
    if (backButton) { /*...*/ }

    // --- Resize Handler ---
    let isCurrentlyMobile = window.innerWidth <= 768;
    const handleResize = debounce(() => { /* ... keep resize logic ... */ }, 250);
    window.addEventListener('resize', handleResize);


    // --- MODAL OPENER LISTENER (Stays in main.js) ---
    document.body.addEventListener('click', (event) => {
        const moreInfoButton = event.target.closest('a.info-button');
        if (moreInfoButton && moreInfoButton.closest('.orbit-element-expanded-content')) {
            event.preventDefault();
            const eventPanel = moreInfoButton.closest('.event-panel');
            if (eventPanel && eventPanel._eventData) {
                // Call the imported function to open the modal
                openEventModal(eventPanel._eventData);
            } else {
                console.error("Could not find event panel or _eventData for clicked 'More Info'.", moreInfoButton);
                alert("Sorry, could not load event details at this time.");
            }
        }
    });

    // --- Context Menu & Global Click Listener ---
    window.addEventListener('click', (e) => {
        const menu = document.getElementById('custom-context-menu');
        // Close context menu
        if (menu && menu.style.display !== 'none') {
            if (!e.target.closest('#custom-context-menu')) {
                menu.style.display = 'none';
            }
        }
        // NOTE: The logic to close the modal on backdrop click is now INSIDE modalManager.js
    });

    // Show context menu
    const collageViewport = document.getElementById('collage-viewport');
    if (collageViewport) {
        collageViewport.addEventListener('contextmenu', (e) => { /* ... keep context menu logic ... */ });
    } else { /*...*/ }

    console.log("Application Initialization Complete.");

}); // --- END DOMContentLoaded ---

// --- END OF FILE main.js ---