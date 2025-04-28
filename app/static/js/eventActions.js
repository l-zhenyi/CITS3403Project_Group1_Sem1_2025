// eventActions.js
import { groupsData, processAllEvents } from './dataHandle.js';
import { renderGroupEvents, renderAllEventsList, renderCalendar, createNodeElement } from './eventRenderer.js';

let calendarDate = new Date();
let currentEventFilter = 'upcoming';

function formatEventDateForDisplay(date) {
    return date.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

function generateUniqueId(prefix = 'item') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

export async function addGroup(name, avatarUrl, makeActive = false) {
    if (!name) return null;

    const defaultAvatar = avatarUrl || `https://via.placeholder.com/40/cccccc/FFFFFF?text=${name[0].toUpperCase()}`;
    
    // 🔁 Call your Flask API
    const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, avatar_url: defaultAvatar })
    });

    if (!res.ok) {
        alert("Failed to create group.");
        return null;
    }

    const newGroup = await res.json();
    newGroup.events = [];

    groupsData.push(newGroup);

    // --- DOM update ---
    const groupListUL = document.querySelector('.group-list-area ul');
    const li = document.createElement('li');
    li.classList.add('group-item');
    li.dataset.groupId = newGroup.id;
    li.dataset.groupName = newGroup.name;
    li.dataset.groupAvatar = newGroup.avatar_url;

    li.innerHTML = `
        <img src="${newGroup.avatar_url}" alt="${newGroup.name} Avatar" class="group-avatar">
        <div class="group-info">
            <span class="group-name">${newGroup.name}</span>
            <span class="group-stats">0 upcoming events</span>
        </div>
    `;

    li.addEventListener('click', () => {
        document.querySelectorAll('.group-item').forEach(item => item.classList.remove('active'));
        li.classList.add('active');

        document.getElementById('active-group-name').textContent = `${newGroup.name} Events`;
        document.getElementById('active-group-avatar').src = newGroup.avatar_url;

        renderGroupEvents(newGroup.id);
    });

    groupListUL.appendChild(li);
    if (makeActive) li.click();

    return newGroup;
}

export function hookEventFilterBar() {
    document.querySelectorAll('.filter-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const filter = pill.dataset.filter || 'upcoming';
    
            document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
    
            import('./eventRenderer.js').then(module => {
                module.renderAllEventsList(filter);
            });
        });
    });
}