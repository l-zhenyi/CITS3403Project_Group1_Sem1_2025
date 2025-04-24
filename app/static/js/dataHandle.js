// dataHandler.js
export let groupsData = [];
export let allEventsData = [];
export let eventsByDate = {};

export function parseHash() {
    const hash = location.hash.slice(1); // Remove "#"
    const params = new URLSearchParams(hash);
    return {
        view: params.get("view") || "groups", // default view
        groupId: params.get("groupId") || null
    };
}

export function updateHash(view, groupId = null) {
    const params = new URLSearchParams();
    params.set("view", view);
    if (view === "groups" && groupId) {
        params.set("groupId", groupId);
    }
    location.hash = params.toString(); // replaces the current hash
}

export function attachGroupClickHandlers() {
    const groupItems = document.querySelectorAll('.group-item');

    groupItems.forEach(li => {
        li.addEventListener('click', () => {
            // Set active class
            document.querySelectorAll('.group-item').forEach(item => item.classList.remove('active'));
            li.classList.add('active');

            // Update header
            const name = li.querySelector('.group-name')?.textContent || 'Unnamed Group';
            const avatar = li.querySelector('img')?.src || '';

            document.getElementById('active-group-name').textContent = name;
            document.getElementById('active-group-avatar').src = avatar;

            // Render events for this group
            const groupId = li.dataset.groupId;
            if (groupId) {
                import('./eventRenderer.js').then(mod => {
                    mod.renderGroupEvents(groupId);
                });
            }
        });
    });
}

export async function loadGroups() {
    const res = await fetch('/api/groups');
    const groups = await res.json();

    // ✅ Update the shared state
    groupsData.length = 0;
    groupsData.push(...groups);

    const groupList = document.querySelector('.group-list-area ul');
    if (!groupList) return;

    groupList.innerHTML = '';

    groups.forEach(group => {
        const li = document.createElement('li');
        li.classList.add('group-item');
        li.dataset.groupId = group.id;
        li.dataset.groupName = group.name;
        li.dataset.groupAvatar = group.avatar_url;

        li.innerHTML = `
            <img src="${group.avatar_url}" class="group-avatar">
            <span class="group-name">${group.name}</span>
        `;
        groupList.appendChild(li);
    });

    attachGroupClickHandlers();

    processAllEvents();

    const firstLi = document.querySelector('.group-item');
    if (firstLi) firstLi.click();
}

/**
 * Flattens all group events into allEventsData and maps them by date for the calendar view.
 */
export function processAllEvents() {
    allEventsData = [];
    eventsByDate = {};

    groupsData.forEach(group => {
        if (!Array.isArray(group.events)) return;

        group.events.forEach(event => {
            if (!event.date || isNaN(event.date)) return;

            allEventsData.push({
                ...event,
                group_id: group.id,
                group_name: group.name,
                date: event.date
            });

            const dateKey = event.date.toISOString().split('T')[0];
            if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
            eventsByDate[dateKey].push({
                title: event.title,
                group: group.name
            });
        });
    });

    console.log(`Processed ${allEventsData.length} events for calendar and list views.`);
}