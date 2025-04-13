// main.js
import { loadData, groupsData } from './dataHandle.js';
import { renderGroupEvents } from './eventRenderer.js';
import { setupViewSwitching, switchView, hookCalendarNavigation } from './viewManager.js';
import { hookDemoButtons, hookEventFilterBar } from './eventActions.js';

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupViewSwitching();
    hookDemoButtons();
    hookEventFilterBar();
    hookCalendarNavigation();

    const groupListUL = document.querySelector('.group-list-area ul');
    const activeGroupNameEl = document.getElementById('active-group-name');
    const activeGroupAvatarEl = document.getElementById('active-group-avatar');

    // Delegate click handling on group items
    if (groupListUL) {
        groupListUL.addEventListener('click', (e) => {
            const li = e.target.closest('.group-item');
            if (!li) return;

            // Deselect all, activate clicked
            groupListUL.querySelectorAll('.group-item').forEach(item => item.classList.remove('active'));
            li.classList.add('active');

            const groupId = li.dataset.groupId;
            const group = groupsData.find(g => g.id === groupId);
            if (!group) return;

            if (activeGroupNameEl) activeGroupNameEl.textContent = `${group.name} Events`;
            if (activeGroupAvatarEl) activeGroupAvatarEl.src = group.avatar_url;

            switchView('groups');
            renderGroupEvents(groupId);
        });
    }

    // Auto-render first group on load
    const firstGroup = groupsData[0];
    if (firstGroup) {
        const li = groupListUL?.querySelector(`.group-item[data-group-id="${firstGroup.id}"]`);
        if (li) li.classList.add('active');

        if (activeGroupNameEl) activeGroupNameEl.textContent = `${firstGroup.name} Events`;
        if (activeGroupAvatarEl) activeGroupAvatarEl.src = firstGroup.avatar_url;

        switchView('groups');
        renderGroupEvents(firstGroup.id);
    } else {
        const container = document.getElementById('event-panels-container');
        if (container) container.innerHTML = '<p class="no-events-message">No groups available.</p>';
    }
});