// --- Imports ---
import { loadGroups, groupsData, parseHash, updateHash } from './dataHandle.js';
import { renderGroupEvents, showContextMenu } from './eventRenderer.js';
import { setupViewSwitching, switchView, hookCalendarNavigation, goBackToGroupList } from './viewManager.js';
import { hookEventFilterBar } from './eventActions.js';
import { setupModal, openEventModal } from './modalManager.js';
import { setupViewportInteractions, getTransformState, setTransformState, debounce } from './viewportManager.js';
import { setupSearchWidget } from './search.js';

// --- Global Variables ---
window.draggingAllowed = true;
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
            if (e.target.closest('.event-node')) {
                type = 'event-node';
                targetElement = e.target.closest('.event-node');
                elementId = targetElement.dataset.nodeId;
            } else if (e.target.closest('.event-panel')) {
                type = 'event-panel';
                targetElement = e.target.closest('.event-panel');
                elementId = targetElement.dataset.eventId;
            }
            console.log(`Context menu triggered on type: ${type}, ID: ${elementId}`);
            showContextMenu({ x: e.pageX, y: e.pageY, type, id: elementId });
        });
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

    if (!plannerPane || !groupListUL || !collageViewport || !eventPanelsContainer || !activeGroupNameEl || !activeGroupAvatarEl) {
        console.warn("Planner-specific elements missing. Skipping planner view setup.");
        return;
    }

    setupModal();
    setupViewportInteractions(collageViewport, eventPanelsContainer);
    setupViewSwitching();
    hookEventFilterBar();
    hookCalendarNavigation();

    await loadGroups();

    // Activate view based on hash
    const { view: initialView, groupId: initialGroupId } = parseHash();

    if (initialView === "calendar") {
        switchView("calendar");
    } else if (initialView === "events") {
        switchView("events");
    } else {
        let activated = false;
        if (initialGroupId) {
            const li = groupListUL?.querySelector(`.group-item[data-group-id="${initialGroupId}"]`);
            if (li) {
                activated = await activateGroup(li, initialGroupId);
            }
        }
        if (!activated) {
            const firstLi = groupListUL?.querySelector(".group-item");
            if (firstLi) {
                const firstGroupId = firstLi.dataset.groupId;
                activated = await activateGroup(firstLi, firstGroupId);
            }
        }
        if (!activated) {
            eventPanelsContainer.innerHTML = '<p class="info-message">No groups available or selected.</p>';
            activeGroupNameEl.textContent = 'No Group Selected';
            activeGroupAvatarEl.src = '/static/img/default-group-avatar.png';
        }

        switchView("groups");
    }

    // Group list click
    groupListUL?.addEventListener('click', (e) => {
        const li = e.target.closest('.group-item');
        if (!li) return;
        if (li.classList.contains('active') && !window.innerWidth <= 768) return;
        const groupId = li.dataset.groupId;
        if (groupId) activateGroup(li, groupId);
    });

    backButton?.addEventListener('click', goBackToGroupList);

    // Resize logic
    let isCurrentlyMobile = window.innerWidth <= 768;
    window.addEventListener('resize', debounce(() => {
        const wasMobile = isCurrentlyMobile;
        isCurrentlyMobile = window.innerWidth <= 768;

        if (wasMobile !== isCurrentlyMobile) {
            console.log(`View transition: ${wasMobile ? 'Mobile' : 'Desktop'} → ${isCurrentlyMobile ? 'Mobile' : 'Desktop'}`);
            setTransformState({ x: 0, y: 0, s: 1.0 });

            let currentView = 'groups';
            if (plannerPane?.classList.contains('calendar-view-active')) currentView = 'calendar';
            else if (plannerPane?.classList.contains('events-view-active')) currentView = 'events';

            switchView(currentView);

            if (isCurrentlyMobile) {
                if (currentView === 'groups') {
                    plannerPane?.classList.remove('mobile-event-view-active');
                    groupListUL?.querySelectorAll('.group-item.active').forEach(item => item.classList.remove('active'));
                    activeGroupNameEl.textContent = `Select Group`;
                    activeGroupAvatarEl.src = '/static/img/default-group-avatar.png';
                } else {
                    plannerPane?.classList.remove('mobile-event-view-active');
                }
            } else {
                plannerPane?.classList.remove('mobile-event-view-active');
                const activeLi = groupListUL?.querySelector('.group-item.active') || groupListUL?.querySelector('.group-item');
                if (activeLi) activateGroup(activeLi, activeLi.dataset.groupId);
                else eventPanelsContainer.innerHTML = '<p class="info-message">No groups available.</p>';
            }
        }
    }, 250));

    // Modal listener
    document.addEventListener('openEventModalRequest', (event) => {
        const eventData = event.detail.eventData;
        if (eventData?.id) openEventModal(eventData);
    });

    console.log("Planner setup complete.");
}

// --- Group Activation (moved outside main setup) ---
async function activateGroup(groupListItem, groupId) {
    if (!groupListItem || !groupId) return false;
    const group = groupsData.find(g => String(g.id) === String(groupId));
    if (!group) return false;

    const isMobile = window.innerWidth <= 768;
    const currentActiveGroupLi = groupListUL?.querySelector('.group-item.active');
    if (currentActiveGroupLi && currentActiveGroupLi !== groupListItem) {
        const currentGroupId = currentActiveGroupLi.dataset.groupId;
        if (currentGroupId) {
            const currentState = getTransformState();
            groupViewStates.set(currentGroupId, currentState);
        }
        currentActiveGroupLi.classList.remove('active');
    }

    const savedView = groupViewStates.get(String(groupId));
    if (savedView) setTransformState({ x: savedView.panX, y: savedView.panY, s: savedView.scale });
    else setTransformState({ x: 0, y: 0, s: 1.0 });

    groupListItem.classList.add('active');
    activeGroupNameEl.textContent = group.name || 'Group Events';
    activeGroupAvatarEl.src = group.avatar_url || '/static/img/default-group-avatar.png';

    await renderGroupEvents(groupId);

    if (isMobile) {
        plannerPane?.classList.add('mobile-event-view-active');
        document.getElementById('event-collage-area')?.scrollTo({ top: 0 });
    } else {
        if (plannerPane && !plannerPane.classList.contains('groups-view-active')) {
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