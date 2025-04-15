// main.js
import { loadData, groupsData } from './dataHandle.js';
import { renderGroupEvents } from './eventRenderer.js';
// Import the new function and viewManager
import { setupViewSwitching, switchView, hookCalendarNavigation, goBackToGroupList } from './viewManager.js';
import { hookDemoButtons, hookEventFilterBar } from './eventActions.js';

// --- Debounce Function ---
function debounce(func, wait, immediate) {
	var timeout;
	return function() {
		var context = this, args = arguments;
		var later = function() {
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


document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupViewSwitching();
    hookDemoButtons();
    hookEventFilterBar();
    hookCalendarNavigation();

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

            const groupId = li.dataset.groupId;
            const group = groupsData.find(g => g.id === groupId);
            if (!group) return;

            // Use the tracked state
            const isMobile = isCurrentlyMobile; // window.innerWidth <= 768;

            if (isMobile) {
                // Mobile Logic (existing) ...
                groupListUL.querySelectorAll('.group-item').forEach(item => item.classList.remove('active'));
                li.classList.add('active');
                if (activeGroupNameEl) activeGroupNameEl.textContent = `${group.name} Events`;
                if (activeGroupAvatarEl) activeGroupAvatarEl.src = group.avatar_url;
                renderGroupEvents(groupId); // Render stacked
                plannerPane.classList.add('mobile-event-view-active');
                const collageArea = document.getElementById('event-collage');
                if (collageArea) collageArea.scrollTop = 0;

            } else {
                // Desktop Logic (existing) ...
                groupListUL.querySelectorAll('.group-item').forEach(item => item.classList.remove('active'));
                li.classList.add('active');
                if (activeGroupNameEl) activeGroupNameEl.textContent = `${group.name} Events`;
                if (activeGroupAvatarEl) activeGroupAvatarEl.src = group.avatar_url;
                // switchView handles rendering the collage on desktop
                switchView('groups');
            }
        });
    }

    // Back button listener (existing)
    if (backButton) {
        backButton.addEventListener('click', () => {
            goBackToGroupList();
        });
    }

    // --- Auto-render first group on load (existing) ---
    const firstGroup = groupsData[0];
    if (firstGroup) {
        const li = groupListUL?.querySelector(`.group-item[data-group-id="${firstGroup.id}"]`);
        const isMobileOnLoad = window.innerWidth <= 768; // Check current width

        if (!isMobileOnLoad) {
             if (li) li.classList.add('active');
             if (activeGroupNameEl) activeGroupNameEl.textContent = `${firstGroup.name} Events`;
             if (activeGroupAvatarEl) activeGroupAvatarEl.src = firstGroup.avatar_url;
             switchView('groups');
        } else {
             switchView('groups'); // Show group list
             // No group selected initially on mobile
             if (activeGroupNameEl) activeGroupNameEl.textContent = `Select a Group`;
             if (activeGroupAvatarEl) activeGroupAvatarEl.src = ''; // Clear avatar or use placeholder
        }

    } else {
        // Handle no groups (existing) ...
        const container = document.getElementById('event-panels-container');
        if (container) container.innerHTML = '<p class="no-events-message">No groups available.</p>';
        if (activeGroupNameEl) activeGroupNameEl.textContent = 'No Groups';
    }

    // --- Resize Handler ---
    const handleResize = debounce(() => {
        const wasMobile = isCurrentlyMobile;
        isCurrentlyMobile = window.innerWidth <= 768;

        // If the state changed (crossed the breakpoint)
        if (wasMobile !== isCurrentlyMobile) {
            console.log(`Resized from ${wasMobile ? 'Mobile' : 'Desktop'} to ${isCurrentlyMobile ? 'Mobile' : 'Desktop'}`);

            // Determine the currently active *main* view (groups, calendar, events)
            let currentView = 'groups'; // Default
            if (plannerPane?.classList.contains('calendar-view-active')) {
                currentView = 'calendar';
            } else if (plannerPane?.classList.contains('events-view-active')) {
                currentView = 'events';
            }

            // Re-switch to the current view to apply correct rendering
            // switchView will handle removing mobile-event-view-active if needed
            // and will call the appropriate render function
            switchView(currentView);

            // Special handling if we were in mobile event view and go to desktop
             if (wasMobile && plannerPane?.classList.contains('mobile-event-view-active') && !isCurrentlyMobile) {
                 // Ensure the group list item is marked active again for desktop context
                 const activeMobileGroupLi = groupListUL?.querySelector('.group-item.active');
                 if (!activeMobileGroupLi) {
                     // If somehow no item was active, maybe select the first?
                     const firstLi = groupListUL?.querySelector('.group-item');
                     firstLi?.classList.add('active');
                 }
                 // Re-run switchView for groups to be sure desktop collage renders
                 switchView('groups');
             }
             // Special handling if we were on desktop group view and go to mobile
             else if (!wasMobile && currentView === 'groups' && isCurrentlyMobile) {
                  // Ensure no group is 'active' visually in the list initially on mobile
                 groupListUL?.querySelectorAll('.group-item.active').forEach(item => item.classList.remove('active'));
                 if (activeGroupNameEl) activeGroupNameEl.textContent = `Select a Group`;
                 if (activeGroupAvatarEl) activeGroupAvatarEl.src = '';
                 // Clear the event panel container
                  const container = document.getElementById('event-panels-container');
                  if (container) container.innerHTML = '';
             }
        }
    }, 250); // Debounce resize checks

    window.addEventListener('resize', handleResize);

}); // End DOMContentLoaded