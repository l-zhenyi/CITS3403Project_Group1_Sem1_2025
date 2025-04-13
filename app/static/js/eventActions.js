// eventActions.js
import { groupsData, processAllEvents } from './dataHandle.js';
import { renderGroupEvents, renderAllEventsList, renderCalendar } from './eventRenderer.js';

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

export function addGroup(name, avatarUrl, makeActive = false) {
    if (!name) return null;

    const groupListUL = document.querySelector('.group-list-area ul');
    if (!groupListUL) return null;

    const newGroupId = generateUniqueId('group');
    const defaultAvatar = `https://via.placeholder.com/40/cccccc/FFFFFF?text=${name[0].toUpperCase()}`;

    const newGroup = {
        id: newGroupId,
        name,
        avatar_url: avatarUrl || defaultAvatar,
        events: [],
        upcoming_event_count: 0
    };

    groupsData.push(newGroup);

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

export function addEventToGroup(groupId, eventDetails) {
    if (!groupId || !eventDetails?.title || !eventDetails?.date_iso) return null;

    const group = groupsData.find(g => g.id === groupId);
    if (!group) return null;

    const newEventId = generateUniqueId('event');
    const eventDate = new Date(eventDetails.date_iso);
    if (isNaN(eventDate)) return null;

    const newEvent = {
        id: newEventId,
        title: eventDetails.title,
        date_iso: eventDetails.date_iso,
        date: eventDate,
        formatted_date: formatEventDateForDisplay(eventDate),
        image_url: eventDetails.image_url || 'https://via.placeholder.com/150/eeeeee/333333?text=Event',
        cost_display: eventDetails.cost_display || 'Free',
        location: eventDetails.location || 'TBD',
        rsvp_status: eventDetails.rsvp_status || 'Invited',
        ...eventDetails
    };

    group.events.push(newEvent);

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

export function hookDemoButtons() {
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

        const group = groupsData.find(g => g.id === activeGroupId);
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
            date_iso: dateIso,
            location: 'TBD',
            rsvp_status: 'Invited'
        });
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