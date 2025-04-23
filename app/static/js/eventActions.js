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

export async function addEventToGroup(groupId, eventDetails) {
    const group = groupsData.find(g => g.id === groupId);
    if (!group) return null;

    const res = await fetch(`/api/groups/${groupId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventDetails)
    });

    if (!res.ok) {
        alert("Failed to create event.");
        return null;
    }

    const newEvent = await res.json();
    newEvent.date = new Date(newEvent.date_iso);
    newEvent.formatted_date = formatEventDateForDisplay(newEvent.date);

    group.events.push(newEvent);

    // Refresh views
    const now = new Date();
    const upcomingCount = group.events.filter(ev => ev.date >= now).length;
    group.upcoming_event_count = upcomingCount;

    const statsSpan = document.querySelector(`.group-item[data-group-id="${groupId}"] .group-stats`);
    if (statsSpan) {
        statsSpan.textContent = `${upcomingCount} upcoming event${upcomingCount !== 1 ? 's' : ''}`;
    }

    processAllEvents();

    const activeLi = document.querySelector(`.group-item.active`);
    if (activeLi?.dataset.groupId === groupId) {
        renderGroupEvents(groupId);
    }

    const plannerPane = document.getElementById('planner-pane');
    if (plannerPane?.classList.contains('calendar-view-active')) {
        renderCalendar(calendarDate.getFullYear(), calendarDate.getMonth());
    } else if (plannerPane?.classList.contains('events-view-active')) {
        renderAllEventsList(currentEventFilter);
    }

    return newEvent;
}

export async function hookDemoButtons() {
    const groupBtn = document.getElementById('add-group-btn');
    const eventBtn = document.getElementById('add-event-btn');

    groupBtn?.addEventListener('click', () => {
        const name = prompt("Enter group name:");
        if (!name) return;
        const group = addGroup(name, null, true);
        if (group) console.log("Added group:", group.name);
    });

    eventBtn?.addEventListener('click', () => {
        const activeLi = document.querySelector('.group-item.active');
        const activeGroupId = activeLi?.dataset.groupId;

        if (!activeGroupId) {
            alert("Please select a group before adding an event.");
            return;
        }
        console.log("Active group ID:", activeGroupId);
        console.log(groupsData.map(group => group.id));
        const group = groupsData.find(g => String(g.id) === activeGroupId);
        if (!group) {
            alert("Could not find the selected group.");
            return;
        }

        let title = prompt("Enter event title:");
        let dateStr = prompt("Enter event date (YYYY-MM-DD HH:mm):");
        if (!title || !dateStr) {
            title = "Sample Event";
            dateStr = "2023-10-01 12:00";
        }

        const dateIso = new Date(dateStr).toISOString();
        addEventToGroup(group.id, {
            title,
            date: dateIso,
            location: 'TBD',
            description: 'Sample event description',
            x: Math.random() * 100,
            y: Math.random() * 100,
        });
        renderGroupEvents(group.id);
    });
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

export async function createNodeAt(x, y, groupId) {
    const res = await fetch(`/api/groups/${groupId}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            label: "New Node",
            x: x,
            y: y
        })
    });

    const node = await res.json();

    const nodeEl = createNodeElement(node);
    document.getElementById('event-panels-container').appendChild(nodeEl);
}