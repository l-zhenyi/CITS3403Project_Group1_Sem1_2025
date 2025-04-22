// dataHandler.js
export let groupsData = [];
export let allEventsData = [];
export let eventsByDate = {};
export let eventNodes = [];

// Temporary default nodes
eventNodes.push({
    id: 'node_concerts',
    label: 'Concerts',
    x: 600,
    y: 300
});

/**
 * Loads group data embedded in the HTML and prepares event date objects.
 */
export function loadData() {
    const groupDataElement = document.getElementById('group-data');
    try {
        groupsData = JSON.parse(groupDataElement?.textContent || '[]');

        groupsData.forEach(group => {
            if (!Array.isArray(group.events)) group.events = [];

            group.events.forEach(event => {
                if (event.date_iso && !event.date) {
                    event.date = new Date(event.date_iso);
                }
            });
        });

        processAllEvents();
        console.log(`Loaded ${groupsData.length} groups.`);
    } catch (e) {
        console.error("Error parsing embedded group data:", e);
        groupsData = [];
    }
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