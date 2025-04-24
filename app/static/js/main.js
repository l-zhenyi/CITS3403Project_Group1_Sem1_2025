// main.js
import { loadGroups, groupsData, parseHash } from './dataHandle.js';
import { renderGroupEvents, showContextMenu } from './eventRenderer.js';
import { setupViewSwitching, switchView, hookCalendarNavigation, goBackToGroupList } from './viewManager.js';
import { hookDemoButtons, hookEventFilterBar } from './eventActions.js';

let panX = 0, panY = 0, scale = 1;
const groupViewStates = new Map(); // key = groupId, value = { panX, panY, scale }
const container = document.getElementById('event-panels-container');

// --- Debounce Function ---
function debounce(func, wait, immediate) {
    var timeout;
    return function () {
        var context = this, args = arguments;
        var later = function () {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        var callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
};
// --- End Debounce ---


function applyTransform() {
    container.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
}

function setupZoomAndPan() {
    const viewport = document.getElementById('collage-viewport');
    if (!viewport || !container) return;

    const minScale = 0.3;
    const maxScale = 2.5;
    const zoomFactor = 0.1;
    let isDragging = false;
    let startX, startY;

    container.style.transformOrigin = '0 0';

    viewport.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        viewport.style.cursor = 'grabbing';
        document.body.classList.add('dragging');
    });

    let lastMove = 0;
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const now = performance.now();
        if (now - lastMove < 16) return; // ~60fps
        lastMove = now;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        panX += dx;
        panY += dy;
        startX = e.clientX;
        startY = e.clientY;
        applyTransform();
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        viewport.style.cursor = 'default';
        document.body.classList.remove('dragging');
    });

    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();

        const rect = viewport.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const worldX = (mouseX - panX) / scale;
        const worldY = (mouseY - panY) / scale;

        const delta = e.deltaY < 0 ? 1 : -1;
        const zoom = 1 + delta * zoomFactor;
        const newScale = Math.min(maxScale, Math.max(minScale, scale * zoom));

        if (newScale !== scale) {
            panX = mouseX - worldX * newScale;
            panY = mouseY - worldY * newScale;
            scale = newScale;
            applyTransform();
        }
    }, { passive: false });
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadGroups(); // Must complete before group selection works
    setupViewSwitching();
    hookDemoButtons();
    hookEventFilterBar();
    hookCalendarNavigation();
    setupZoomAndPan();

    const { view, groupId } = parseHash();
    console.log("Parsed hash:", view, groupId);

    if (view === "calendar") {
        switchView("calendar");
    } else if (view === "events") {
        switchView("events");
    } else {
        // groups view
        if (groupId) {
            const li = document.querySelector(`.group-item[data-group-id="${groupId}"]`);
            if (li) li.click();
        } else {
            const firstLi = document.querySelector(".group-item");
            if (firstLi) firstLi.click(); // fallback
        }
        switchView("groups");
    }

    const groupListUL = document.querySelector('.group-list-area ul');
    const activeGroupNameEl = document.getElementById('active-group-name');
    const activeGroupAvatarEl = document.getElementById('active-group-avatar');
    const plannerPane = document.getElementById('planner-pane');
    const backButton = document.querySelector('.back-button');

    // --- Mobile/Desktop State Tracking ---
    let isCurrentlyMobile = window.innerWidth <= 768;

    // Delegate click handling on group items
    if (groupListUL && plannerPane) {
        groupListUL.addEventListener('click', (e) => {
            const li = e.target.closest('.group-item');
            if (!li) return;
            console.log("lol");

            const groupId = li.dataset.groupId;
            const group = groupsData.find(g => g.id === groupId);
            if (!group) return;

            const isMobile = isCurrentlyMobile;

            // Clear zoom/pan state when switching groups
            const container = document.getElementById('event-panels-container');
            const viewport = document.getElementById('collage-viewport');
            const currentActiveGroup = groupListUL.querySelector('.group-item.active');
            if (currentActiveGroup) {
                const currentGroupId = currentActiveGroup.dataset.groupId;
                groupViewStates.set(currentGroupId, { panX, panY, scale });
            }
            const savedView = groupViewStates.get(groupId);
            if (savedView) {
                panX = savedView.panX;
                panY = savedView.panY;
                scale = savedView.scale;
            } else {
                panX = 0;
                panY = 0;
                scale = 1.0;
            }
            applyTransform();


            if (isMobile) {
                // Mobile Logic ... (keep existing)
                groupListUL.querySelectorAll('.group-item').forEach(item => item.classList.remove('active'));
                li.classList.add('active');
                if (activeGroupNameEl) activeGroupNameEl.textContent = `${group.name} Events`;
                if (activeGroupAvatarEl) activeGroupAvatarEl.src = group.avatar_url;
                renderGroupEvents(groupId); // Render stacked
                plannerPane.classList.add('mobile-event-view-active');
                const collageArea = document.getElementById('event-collage');
                if (collageArea) collageArea.scrollTop = 0; // Scroll mobile view top
            } else {
                // Desktop Logic ... (keep existing)
                groupListUL.querySelectorAll('.group-item').forEach(item => item.classList.remove('active'));
                li.classList.add('active');
                if (activeGroupNameEl) activeGroupNameEl.textContent = `${group.name} Events`;
                if (activeGroupAvatarEl) activeGroupAvatarEl.src = group.avatar_url;
                // switchView handles rendering the collage on desktop
                switchView('groups'); // Will call renderGroupEvents internally
            }
        });
    }

    // Back button listener (existing)
    if (backButton) {
        backButton.addEventListener('click', () => {
            goBackToGroupList();
        });
    }

    // --- Resize Handler ---
    // ... (keep existing resize handler logic) ...
    const handleResize = debounce(() => {
        const wasMobile = isCurrentlyMobile;
        isCurrentlyMobile = window.innerWidth <= 768;

        if (wasMobile !== isCurrentlyMobile) {
            console.log(`Resized from ${wasMobile ? 'Mobile' : 'Desktop'} to ${isCurrentlyMobile ? 'Mobile' : 'Desktop'}`);

            // Reset zoom on resize transition
            const container = document.getElementById('event-panels-container');
            if (container) {
                container.style.transform = 'scale(1.0)';
                scale = 1.0; // Reset scale variable
            }

            let currentView = 'groups';
            if (plannerPane?.classList.contains('calendar-view-active')) currentView = 'calendar';
            else if (plannerPane?.classList.contains('events-view-active')) currentView = 'events';

            switchView(currentView); // Re-apply view logic

            // Additional logic from previous steps for view transitions...
            if (wasMobile && plannerPane?.classList.contains('mobile-event-view-active') && !isCurrentlyMobile) {
                const activeMobileGroupLi = groupListUL?.querySelector('.group-item.active');
                if (!activeMobileGroupLi) {
                    const firstLi = groupListUL?.querySelector('.group-item');
                    firstLi?.classList.add('active');
                }
                switchView('groups'); // Ensure desktop collage renders
            } else if (!wasMobile && currentView === 'groups' && isCurrentlyMobile) {
                groupListUL?.querySelectorAll('.group-item.active').forEach(item => item.classList.remove('active'));
                if (activeGroupNameEl) activeGroupNameEl.textContent = `Select a Group`;
                if (activeGroupAvatarEl) activeGroupAvatarEl.src = '';
                const container = document.getElementById('event-panels-container');
                if (container) container.innerHTML = ''; // Clear collage area for mobile list view
            }
        }
    }, 250);

    window.addEventListener('click', () => {
        const menu = document.getElementById('custom-context-menu');
        if (menu) menu.style.display = 'none';
    });

    document.getElementById('event-panels-container')?.addEventListener('contextmenu', (e) => {
        e.preventDefault();

        const types = ['event-node', 'event-panel', 'group-card']; // Add more types here as needed

        const target = types
            .map(type => ({ type, element: e.target.closest(`.${type}`) }))
            .find(({ element }) => element);

        if (target && target.element) {
            const { type, element } = target;
            const idAttr = type === 'event-panel' ? 'eventId' : 'nodeId'; // Customize per type if needed
            const id = element.dataset[idAttr];

            showContextMenu({
                x: e.pageX,
                y: e.pageY,
                type, // string like 'event-node'
                id,
            });
        }
    });

}); // End DOMContentLoaded