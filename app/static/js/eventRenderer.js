// --- START OF FILE eventRenderer.js ---
// REVISED: Export layoutInstances

// eventRenderer.js
import { groupsData, allEventsData, eventsByDate } from './dataHandle.js';
import { OrbitLayoutManager } from './orbitLayoutDOM.js';
import { getTransformState } from './viewportManager.js';

const eventPanelsContainer = document.getElementById('event-panels-container');
const calendarMonthYearEl = document.getElementById('calendar-month-year');
const calendarGridEl = document.getElementById('calendar-grid');
const eventListContainer = document.getElementById('event-list-container');
const collageViewport = document.getElementById('collage-viewport');

// Store layout instances (Node Element -> Layout Manager Instance)
export const layoutInstances = new Map();

const OVERFLOW_THRESHOLD = 4; // If more than this number of events, show fade and 'more' indicator

// --- Day Events Modal Elements ---
let dayEventsModalEl = null;
let dayEventsModalTitleEl = null;
let dayEventsModalListEl = null;
let dayEventsModalCloseBtn = null;

// --- Helper: Format Date for Day Events Modal (Time only or "All Day") ---
function formatEventTimeForDayModal(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return "Time TBD";
    // Check if time is midnight (could indicate an all-day event or just unspecified time)
    if (date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0) {
        // Could be more sophisticated if an 'all_day' flag exists on event
        return "All Day"; 
    }
    return date.toLocaleTimeString(undefined, {
        hour: 'numeric', minute: '2-digit', hour12: true
    });
}


// --- Create and Setup Day Events Modal ---
function setupDayEventsModal() {
    if (dayEventsModalEl) return; // Already initialized

    dayEventsModalEl = document.createElement('div');
    dayEventsModalEl.className = 'day-events-modal'; // Use the new class
    dayEventsModalEl.id = 'day-events-modal';
    dayEventsModalEl.innerHTML = `
        <div class="modal-content">
            <button class="modal-close-btn" id="day-events-modal-close-btn" aria-label="Close day events list">×</button>
            <h3 id="day-events-modal-title">Events for Date</h3>
            <ul class="day-event-list" id="day-events-modal-list">
                <!-- Event items will be populated here -->
            </ul>
        </div>
    `;
    document.body.appendChild(dayEventsModalEl);

    dayEventsModalTitleEl = dayEventsModalEl.querySelector('#day-events-modal-title');
    dayEventsModalListEl = dayEventsModalEl.querySelector('#day-events-modal-list');
    dayEventsModalCloseBtn = dayEventsModalEl.querySelector('#day-events-modal-close-btn');

    dayEventsModalCloseBtn.addEventListener('click', closeDayEventsModal);
    dayEventsModalEl.addEventListener('click', (event) => {
        if (event.target === dayEventsModalEl) {
            closeDayEventsModal();
        }
    });
}

export function openDayEventsModal(dateString, eventsForDay) {
    if (!dayEventsModalEl) setupDayEventsModal(); // Ensure modal is created

    const dateObj = new Date(dateString + 'T00:00:00'); // Ensure correct date parsing
    dayEventsModalTitleEl.textContent = `Events on ${dateObj.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
    
    dayEventsModalListEl.innerHTML = ''; // Clear previous events

    if (!eventsForDay || eventsForDay.length === 0) {
        dayEventsModalListEl.innerHTML = '<li>No events scheduled for this day.</li>';
    } else {
        eventsForDay.forEach(event => {
            const li = document.createElement('li');
            li.className = 'day-event-item';
            li.dataset.eventId = event.id; // Store event ID

            const titleSpan = document.createElement('span');
            titleSpan.className = 'day-event-title';
            titleSpan.textContent = event.title || 'Untitled Event';

            const groupSpan = document.createElement('span');
            groupSpan.className = 'day-event-group';
            groupSpan.textContent = event.group_name || 'Personal';
            
            const timeSpan = document.createElement('span');
            timeSpan.className = 'day-event-time';
            // eventsByDate stores the full date object, which might not be readily available here.
            // We need to ensure eventsForDay items have the date object or parse it.
            // For now, assuming event.date is the full date object from allEventsData processing
            let eventDateForTime = null;
            const fullEventData = allEventsData.find(e => e.id === event.id);
            if (fullEventData && fullEventData.date instanceof Date) {
                eventDateForTime = fullEventData.date;
            }
            timeSpan.textContent = formatEventTimeForDayModal(eventDateForTime);


            li.appendChild(titleSpan);
            li.appendChild(groupSpan);
            li.appendChild(timeSpan);

            li.addEventListener('click', () => {
                // Find the full event data from allEventsData to pass to the main modal
                const fullEvent = allEventsData.find(e => e.id === event.id);
                if (fullEvent) {
                    document.dispatchEvent(new CustomEvent('openEventModalRequest', {
                        detail: { eventData: fullEvent },
                        bubbles: true, composed: true
                    }));
                    closeDayEventsModal(); // Close this small modal after requesting main one
                } else {
                    console.warn(`Full event data not found for ID ${event.id} to open main modal.`);
                }
            });
            dayEventsModalListEl.appendChild(li);
        });
    }

    dayEventsModalEl.classList.add('visible');
}

function closeDayEventsModal() {
    if (dayEventsModalEl) {
        dayEventsModalEl.classList.remove('visible');
    }
}

// --- Initialize Day Events Modal when eventRenderer is loaded ---
// (or call setupDayEventsModal() from main.js after DOMContentLoaded)
// For simplicity, calling it here.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupDayEventsModal);
} else {
    setupDayEventsModal();
}


// --- Helper: Format Date ---
// Keep consistent formatting logic
function formatEventDateForDisplay(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return 'No Date'; // ensure date is valid
    try {
        return date.toLocaleString(undefined, {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true
        });
    } catch (e) {
        console.error("Error formatting date:", date, e);
        return 'Invalid Date';
    }
}

// --- Create Event Panel DOM Element (REVISED for hover structure) ---
function createEventPanel(event) {
    if (!event || typeof event.id === 'undefined') {
        console.error("createEventPanel called with invalid event data:", event);
        return null; // Return null if event data is bad
    }
    const panel = document.createElement('div');
    panel.className = 'event-panel';
    panel.id = `event-panel-${event.id}`; // Add specific ID
    panel.dataset.eventId = event.id;

    // Set node linkage if available
    if (event.node_id !== null && event.node_id !== undefined && String(event.node_id).trim() !== '') {
        panel.dataset.snappedToNode = String(event.node_id);
    }

    // --- CRITICAL: Attach full event data ---
    panel._eventData = event;

    // --- Build Inner HTML for the *original* content view ---
    const dateText = formatEventDateForDisplay(event.date); // event.date is now a Date object
    const imageUrl = event.image_url || '/static/img/default-event-logo.png';

    const originalContentWrapper = document.createElement('div');
    originalContentWrapper.className = 'orbit-element-original-content';

    // *** UPDATED STRUCTURE for hover effect ***
    originalContentWrapper.innerHTML = `
        <img src="${imageUrl}" alt="${event.title || 'Event'}" class="event-image">
        <div class="event-info-overlay">
            <div class="event-panel-title" title="${event.title || ''}">${event.title || 'Untitled Event'}</div>
            <div class="event-panel-date">${dateText}</div>
        </div>
    `;
    panel.appendChild(originalContentWrapper);

    // Expanded content created by OrbitLayoutManager._ensureExpandedContentDiv

    panel.style.position = 'absolute';
    if (!panel.dataset.snappedToNode) {
        panel.style.left = `${Number(event.x || 0)}px`;
        panel.style.top = `${Number(event.y || 0)}px`;
    }

    return panel;
}


// --- Node Dragging Logic ---
function makeDraggableNode(element) {
    let isDragging = false;
    let startX, startY, initialNodeLeft, initialNodeTop;

    function onPointerDown(e) {
        if (e.target !== element || e.button !== 0 || !window.draggingAllowed) return;
        e.stopPropagation(); // Prevent viewport drag
        isDragging = true;
        element.classList.add('dragging');
        element.style.zIndex = 1000;
        element.style.cursor = 'grabbing';
        startX = e.clientX;
        startY = e.clientY;
        initialNodeLeft = parseFloat(element.style.left) || 0;
        initialNodeTop = parseFloat(element.style.top) || 0;
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);
    }

    function onPointerMove(e) {
        if (!isDragging) return;
        const scale = getCurrentZoomScale();
        const dx = (e.clientX - startX) / scale;
        const dy = (e.clientY - startY) / scale;
        const newX = initialNodeLeft + dx;
        const newY = initialNodeTop + dy;
        element.style.left = `${newX}px`;
        element.style.top = `${newY}px`;
        const instance = layoutInstances.get(element);
        if (instance) {
            instance.updateLayout(); // Let instance recalc positions based on node move
        }
    }

    function onPointerUp() {
        if (!isDragging) return;
        isDragging = false;
        element.classList.remove('dragging');
        element.style.zIndex = '';
        element.style.cursor = '';
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);

        const instance = layoutInstances.get(element);
        if (instance) {
            instance.updateLayout(); // Final update
        }

        const nodeId = element.dataset.nodeId;
        if (nodeId) {
            const x = parseFloat(element.style.left) || 0;
            const y = parseFloat(element.style.top) || 0;

            const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
            const headers = { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };
            if (csrfTokenMeta) {
                headers['X-CSRFToken'] = csrfTokenMeta.getAttribute('content');
            } else {
                console.warn("CSRF token meta tag not found. Node update PATCH request may fail.");
            }

            fetch(`/api/nodes/${nodeId}`, {
                method: 'PATCH',
                headers: headers,
                body: JSON.stringify({ x, y })
            })
            .then(res => { if (!res.ok) console.error(`Failed to update node ${nodeId} pos.`); })
            .catch(err => console.error(`Error updating node ${nodeId}:`, err));
        }
    }
    element.addEventListener('pointerdown', onPointerDown);
}

// Get current zoom scale from viewport manager
function getCurrentZoomScale() {
    if (!eventPanelsContainer) return 1;
    try {
        const { scale } = getTransformState();
        if (scale) return scale;
    } catch (e) { /* ignore */ }
    const transform = eventPanelsContainer.style.transform;
    const match = transform?.match(/scale\(([\d.]+)\)/);
    return match ? parseFloat(match[1]) : 1;
}


// Create Node DOM Element
export function createNodeElement(node) {
    if (!node || typeof node.id === 'undefined') {
        console.error("createNodeElement called with invalid node data:", node);
        return null;
    }
    const el = document.createElement('div');
    el.className = 'event-node';
    el.id = `node-${node.id}`;
    el.dataset.nodeId = node.id;
    el.style.left = `${Number(node.x || 0)}px`;
    el.style.top = `${Number(node.y || 0)}px`;
    el.style.position = 'absolute';
    el.textContent = node.label || 'Untitled';
    makeDraggableNode(el);
    return el;
}

// --- Render List of All Events ---
export function renderAllEventsList(filter = 'upcoming') {
    if (!eventListContainer) return;
    const now = new Date();
    let filtered = [];

    // Ensure allEventsData contains Date objects for dates
    const eventsWithValidDates = allEventsData.map(event => ({
        ...event,
        date: event.date instanceof Date ? event.date : (event.date ? new Date(event.date) : null)
    })).filter(event => event.date && !isNaN(event.date.getTime()));


    try {
        filtered = eventsWithValidDates.filter(event => {
            // event.date is already a Date object here or null (filtered out by .filter above)
            if (filter === 'upcoming') return event.date >= now;
            if (filter === 'past') return event.date < now;
            return true; // 'all'
        });
        filtered.sort((a, b) => {
            // No need for .getTime() if they are Date objects
            return filter === 'past' ? b.date - a.date : a.date - b.date;
        });
    } catch (error) {
        console.error("Error filtering/sorting events:", error, allEventsData);
        eventListContainer.innerHTML = '<p class="error-message">Error loading event list.</p>';
        return;
    }

    if (filtered.length === 0) {
        eventListContainer.innerHTML = `<p class="no-events-message">No ${filter} events found.</p>`;
    } else {
        eventListContainer.innerHTML = filtered.map(event => {
            const dateDisplay = formatEventDateForDisplay(event.date); // event.date is a Date object
            let rsvpText = 'Not RSVP\'d';
            if (event.current_user_rsvp_status === 'attending') rsvpText = 'Attending';
            else if (event.current_user_rsvp_status === 'maybe') rsvpText = 'Maybe';
            else if (event.current_user_rsvp_status === 'declined') rsvpText = 'Declined';
            return `
            <div class="event-tile" data-event-id="${event.id}">
                <h4>${event.title || 'Untitled Event'}</h4>
                <p class="tile-detail">📅 ${dateDisplay}</p>
                <p class="tile-detail">👥 ${event.group_name || 'Unknown Group'}</p>
                <p class="tile-detail">📍 ${event.location || 'TBD'}</p>
                <p class="tile-detail">✔️ ${rsvpText}</p>
            </div>`;
        }).join('');
    }
}


// --- Render Group Events (Collage/Orbit View) ---
export async function renderGroupEvents(groupId) {
    if (!eventPanelsContainer || !collageViewport) { // Added check for viewport
        console.error("Cannot render group events: Event panels container or viewport not found.");
        return;
    }
    if (!groupId) {
        console.warn("renderGroupEvents called without groupId.");
        eventPanelsContainer.innerHTML = '<p class="info-message">Select a group to view events.</p>';
        layoutInstances.forEach(instance => instance.destroy());
        layoutInstances.clear();
        // Remove outside click listener if no group selected
        removeOutsideClickListener();
        return;
    }

    // console.log(`[renderGroupEvents] Rendering events for Group ID: ${groupId}`); // Less verbose
    eventPanelsContainer.innerHTML = '<div class="loading-indicator">Loading events...</div>';

    try {
        const res = await fetch(`/api/groups/${groupId}/nodes?include=events`); // GET, no CSRF needed
        if (!res.ok) throw new Error(`Failed to fetch group nodes/events: ${res.status} ${res.statusText}`);
        const nodes = await res.json();

        // --- Destroy Old Layout Instances FIRST ---
        layoutInstances.forEach((instance, nodeEl) => {
            try { instance.destroy(); }
            catch(e) { console.error(`Error destroying layout instance for node ${nodeEl.id}:`, e); }
        });
        layoutInstances.clear();
        // --- End Cleanup ---

        eventPanelsContainer.innerHTML = ''; // Clear loading

        const renderedNodes = {};
        if (nodes.length === 0) { /* console.log(`[renderGroupEvents] No nodes...`); */ }
        nodes.forEach(node => {
            const nodeEl = createNodeElement(node);
            if (nodeEl) {
                eventPanelsContainer.appendChild(nodeEl);
                renderedNodes[node.id] = nodeEl;
            }
        });

        const events = nodes.flatMap(node => node.events || []);
        if (events.length === 0 && nodes.length === 0) {
            eventPanelsContainer.innerHTML = '<p class="info-message">This group has no nodes or events yet.</p>';
        }

        events.forEach(event => {
            event.date = event.date ? new Date(event.date) : null;
            if (event.date && isNaN(event.date.getTime())) { // Check for invalid Date object
                console.warn(`[renderGroupEvents] Invalid date format for event ID ${event.id}:`, event.date);
                event.date = null; // Set to null if invalid
            }
            const panel = createEventPanel(event);
            if (panel) {
                eventPanelsContainer.appendChild(panel);
            }
        });

        // --- Initialize Layout Instances ---
        Object.entries(renderedNodes).forEach(([nodeId, nodeEl]) => {
            const panelsForNode = Array.from(
                eventPanelsContainer.querySelectorAll(`.event-panel[data-snapped-to-node="${nodeId}"]`)
            );
            if (panelsForNode.length > 0) {
                try {
                    const newInstance = new OrbitLayoutManager(nodeEl, panelsForNode);
                    layoutInstances.set(nodeEl, newInstance);
                } catch (error) {
                    console.error(`Error creating OrbitLayoutManager for node ${nodeId}:`, error);
                }
            }
        });

        // *** ADD the outside click listener AFTER rendering ***
        addOutsideClickListener();

    } catch (error) {
        console.error(`Error rendering group events for group ID ${groupId}:`, error);
        eventPanelsContainer.innerHTML = `<p class="error-message">Could not load events. ${error.message}</p>`;
        layoutInstances.forEach(instance => instance.destroy());
        layoutInstances.clear();
        removeOutsideClickListener(); // Clean up listener on error
    }
}

// --- Render Calendar Grid ---
export function renderCalendar(year, month) {
    if (!calendarGridEl || !calendarMonthYearEl) {
        console.error("Calendar grid or month/year element not found.");
        return;
    }
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfPrevMonth = new Date(year, month, 0);
    const lastDayOfCurrentMonth = new Date(year, month + 1, 0);
    const firstDayWeekday = firstDayOfMonth.getDay(); // 0 (Sun) - 6 (Sat)
    const numDays = lastDayOfCurrentMonth.getDate();
    const prevMonthDays = lastDayOfPrevMonth.getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);

    calendarMonthYearEl.textContent = `${monthNames[month]} ${year}`;
    calendarGridEl.innerHTML = ''; // Clear previous grid content

    // Helper to create a basic cell structure (used for other months)
    const createOtherMonthCellElement = (dayNum) => {
        const cell = document.createElement('div');
        cell.className = "calendar-cell other-month";
        cell.innerHTML = `<span class="day-number">${dayNum}</span><div class="calendar-events-preview-list"></div>`; // Include empty list
        return cell;
    };

    // Previous month's trailing days
    for (let i = 0; i < firstDayWeekday; i++) {
        const dayNum = prevMonthDays - firstDayWeekday + 1 + i;
        calendarGridEl.appendChild(createOtherMonthCellElement(dayNum));
    }

    // Current month's days
    for (let i = 1; i <= numDays; i++) {
        const currentDate = new Date(year, month, i); currentDate.setHours(0,0,0,0);
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const isToday = currentDate.getTime() === today.getTime();
        const eventsOnThisDay = eventsByDate[dateStr] || [];

        const cell = document.createElement('div');
        cell.className = "calendar-cell";
        if (isToday) cell.classList.add("today");
        if (eventsOnThisDay.length > 0) cell.classList.add("has-events");
        cell.dataset.date = dateStr;

        // Day Number
        const dayNumberEl = document.createElement('span');
        dayNumberEl.className = 'day-number';
        dayNumberEl.textContent = i;
        cell.appendChild(dayNumberEl);

        // Event Previews List Container
        const previewListContainer = document.createElement('div');
        previewListContainer.className = 'calendar-events-preview-list';

        // Render *all* events for the day into the preview list container
        eventsOnThisDay.forEach(event => { // REMOVED .slice()
            const eventItemEl = document.createElement('div');
            eventItemEl.className = 'calendar-event-item-preview';

            const eventDot = document.createElement('span');
            eventDot.className = 'event-dot';
            // Cycle through 6 color classes
            eventDot.classList.add(`color-${(event.id % 6) + 1}`); // Use event ID for potentially consistent color per event type? Or just index j above. Index j might be better as it cycles evenly. Let's use a stable property like event ID if available, or just index for variety. Using index of this loop `eventsOnThisDay.forEach((event, j) => ... eventDot.classList.add(`color-${(j % 6) + 1}`))` is simpler. Let's stick with index:
            // To use index: change forEach to: `eventsOnThisDay.forEach((event, j) => { ... eventDot.classList.add(`color-${(j % 6) + 1}`); ... });`

            const eventTitlePreview = document.createElement('span');
            eventTitlePreview.className = 'event-title-preview';
            eventTitlePreview.textContent = event.title || 'Untitled Event';

            eventItemEl.appendChild(eventDot);
            eventItemEl.appendChild(eventTitlePreview);
            eventItemEl.title = `${event.title || 'Untitled Event'} (${event.group_name || 'Personal'})`; // Tooltip

            // REMOVED: is-fading-out class logic here

            previewListContainer.appendChild(eventItemEl);
        });
        cell.appendChild(previewListContainer);

        // "More Events" Indicator and .has-overflow class
        // Apply these if the total number of events exceeds a threshold
        if (eventsOnThisDay.length > OVERFLOW_THRESHOLD) { // Check total count
            const remainingCount = eventsOnThisDay.length - OVERFLOW_THRESHOLD; // This count is less relevant now, the pill just means "more exist"
            const moreIndicator = document.createElement('div');
            moreIndicator.className = 'more-events-indicator';
            moreIndicator.textContent = `+${eventsOnThisDay.length - OVERFLOW_THRESHOLD} more`; // Show actual count

            cell.appendChild(moreIndicator);

            // Add class to preview list container to enable its mask
            previewListContainer.classList.add('has-overflow');
        }

        // Click listener for the cell to open day events modal
        if (eventsOnThisDay.length > 0) {
            cell.addEventListener('click', () => {
                openDayEventsModal(dateStr, eventsOnThisDay);
            });
        }
        calendarGridEl.appendChild(cell);
    }

    // Next month's leading days
    const totalCellsRendered = firstDayWeekday + numDays;
    const remainingCells = totalCellsRendered % 7 === 0 ? 0 : 7 - (totalCellsRendered % 7);
    for (let i = 1; i <= remainingCells; i++) {
        calendarGridEl.appendChild(createOtherMonthCellElement(i));
    }

    // Dynamically set grid rows for proper filling of space
    const totalCellsInGrid = firstDayWeekday + numDays + remainingCells;
    const numRows = Math.ceil(totalCellsInGrid / 7);
    // Now, minmax height is more about the grid structure itself, not pushed by content
    // The content (event list) is constrained by its max-height
    // Keeping 1fr still ensures rows distribute remaining space evenly
    calendarGridEl.style.gridTemplateRows = `repeat(${numRows}, minmax(90px, 1fr))`; // Keep base min-height
}


// --- Context Menu Logic ---
function createContextMenuElement() {
    let menu = document.getElementById('custom-context-menu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'custom-context-menu';
        menu.className = 'context-menu';
        document.body.appendChild(menu);
    }
    return menu;
}

async function handleContextAction(label, x, y, id, elementType) {
    const groupId = getActiveGroupId();
    if (!groupId && (label === 'Create Node' || label === 'Create Event on Node')) {
        alert("Please select an active group first."); return;
    }
    const { x: relX, y: relY } = getRelativeCoordsToContainer(x, y);

    try {
        switch (label) {
            case 'Create Node': await createNodeAt(relX, relY, groupId); break;
            case 'Create Event on Node': if (elementType !== 'event-node') return; await createEvent(groupId, id); break;
            case 'Rename Event': if (elementType !== 'event-panel') return; await renameEvent(id); break;
            case 'Delete Event': if (elementType !== 'event-panel') return; if(confirm('Are you sure you want to delete this event?')) await deleteEvent(id); break;
            case 'Rename Node': if (elementType !== 'event-node') return; await renameNode(id); break;
            case 'Delete Node': if (elementType !== 'event-node') return; if(confirm('Are you sure you want to delete this node? Associated events will be unassigned.')) await deleteNode(id); break; 
            default: console.warn("Unknown context menu action:", label);
        }
    } catch (error) {
        console.error(`Error executing context action "${label}":`, error);
        alert(`Action failed: ${error.message}`);
    }

    if (groupId && ['Create Node', 'Delete Node', 'Create Event on Node', 'Delete Event'].includes(label)) {
        renderGroupEvents(groupId); // Refresh the view
    }
}

export function showContextMenu({ x, y, type, id }) {
    const menu = createContextMenuElement();
    menu.innerHTML = '';
    const optionsMap = {
        'event-panel': ['Rename Event', 'Delete Event'],
        'event-node': ['Create Event on Node', 'Rename Node', 'Delete Node'],
        'canvas': ['Create Node'] 
    };
    const options = optionsMap[type] || [];
    if (options.length === 0) { menu.style.display = 'none'; return; }
    options.forEach(label => {
        const option = document.createElement('div');
        option.className = 'context-menu-option';
        option.textContent = label;
        option.onclick = (e) => {
            e.stopPropagation(); menu.style.display = 'none';
            handleContextAction(label, x, y, id, type);
        };
        menu.appendChild(option);
    });
    menu.style.left = `${x + 2}px`; menu.style.top = `${y + 2}px`; menu.style.display = 'block';
}

// --- CRUD Actions (Called by Context Menu Handler) ---
async function renameEvent(eventId) { 
    const panel = document.querySelector(`.event-panel[data-event-id="${eventId}"]`);
    const currentData = panel?._eventData;
    if (!panel || !currentData) return;
    const newName = prompt('Rename event:', currentData.title);
    if (newName === null || newName.trim() === '' || newName === currentData.title) return;

    const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
    const headers = { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
    if (csrfTokenMeta) {
        headers['X-CSRFToken'] = csrfTokenMeta.getAttribute('content');
    }

    try {
        const response = await fetch(`/api/events/${eventId}`, { method: 'PATCH', headers: headers, body: JSON.stringify({ title: newName }) });
        if (!response.ok) throw new Error(`Failed to rename event (${response.status})`);
        const updatedEvent = await response.json();
        const originalTitleEl = panel.querySelector('.orbit-element-original-content .event-panel-title');
        if (originalTitleEl) originalTitleEl.textContent = updatedEvent.title;
        currentData.title = updatedEvent.title; 
        panel._eventData.title = updatedEvent.title; 
        const expandedTitle = panel.querySelector('.orbit-element-expanded-content .title-scroll');
        if(expandedTitle) expandedTitle.textContent = updatedEvent.title;
        if (document.getElementById('event-list-container')?.offsetParent !== null) renderAllEventsList();
    } catch (error) { console.error("Error renaming event:", error); alert(`Rename failed: ${error.message}`); }
}
async function deleteEvent(eventId) { 
    const panel = document.querySelector(`.event-panel[data-event-id="${eventId}"]`);
    if (!panel) return;

    const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
    const headers = { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
    if (csrfTokenMeta) {
        headers['X-CSRFToken'] = csrfTokenMeta.getAttribute('content');
    }

    try {
        const response = await fetch(`/api/events/${eventId}`, { method: 'DELETE', headers: headers });
        if (!response.ok) throw new Error(`Failed to delete event (${response.status})`);
        const data = await response.json();
        if (data.success) {
            const nodeId = panel.dataset.snappedToNode;
            panel.remove();
            if (nodeId) {
                const nodeEl = document.querySelector(`.event-node[data-node-id="${nodeId}"]`);
                const instance = nodeEl ? layoutInstances.get(nodeEl) : null;
                if (instance) {
                    const remainingPanels = Array.from(eventPanelsContainer.querySelectorAll(`.event-panel[data-snapped-to-node="${nodeId}"]`));
                    instance.updateLayout(remainingPanels);
                }
            }
            if (document.getElementById('event-list-container')?.offsetParent !== null) renderAllEventsList();
        } else { throw new Error(data.message || "Server reported delete failed."); }
    } catch (error) { console.error("Error deleting event:", error); alert(`Delete failed: ${error.message}`); }
}
async function renameNode(nodeId) { 
    const nodeEl = document.querySelector(`.event-node[data-node-id="${nodeId}"]`);
    if (!nodeEl) return;
    const currentLabel = nodeEl.textContent || '';
    const newLabel = prompt('Rename node:', currentLabel);
    if (newLabel === null || newLabel.trim() === '' || newLabel === currentLabel) return;

    const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
    const headers = { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
    if (csrfTokenMeta) {
        headers['X-CSRFToken'] = csrfTokenMeta.getAttribute('content');
    }

    try {
        const response = await fetch(`/api/nodes/${nodeId}`, { method: 'PATCH', headers: headers, body: JSON.stringify({ label: newLabel }) });
        if (!response.ok) throw new Error(`Failed to rename node (${response.status})`);
        const data = await response.json();
        nodeEl.textContent = data.label;
        const instance = layoutInstances.get(nodeEl);
        if (instance?.nodeInfo) instance.nodeInfo.label = data.label;
    } catch (error) { console.error("Error renaming node:", error); alert(`Rename failed: ${error.message}`); }
}
async function deleteNode(nodeId) { 
    const nodeEl = document.querySelector(`.event-node[data-node-id="${nodeId}"]`);
    if (!nodeEl) return;

    const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
    const headers = { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
    if (csrfTokenMeta) {
        headers['X-CSRFToken'] = csrfTokenMeta.getAttribute('content');
    }

    try {
        const response = await fetch(`/api/nodes/${nodeId}`, { method: 'DELETE', headers: headers });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({error: "Unknown error"}));
            throw new Error(errorData.error || `Failed to delete node (${response.status})`);
        }
        const data = await response.json();
        if (data.success) {
            const instance = layoutInstances.get(nodeEl);
            if (instance) { instance.destroy(); layoutInstances.delete(nodeEl); }
            nodeEl.remove();

            const activeGroupId = getActiveGroupId();
            if (activeGroupId) {
                renderGroupEvents(activeGroupId); 
            }
            if (document.getElementById('event-list-container')?.offsetParent !== null) renderAllEventsList();
        } else { throw new Error(data.message || "Server reported node delete failed."); }
    } catch(error) { console.error("Error deleting node:", error); alert(`Delete failed: ${error.message}`); }
}
async function createNodeAt(x, y, groupId) { 
    if (!groupId) throw new Error("Cannot create node without active group ID.");

    const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
    const headers = { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
    if (csrfTokenMeta) {
        headers['X-CSRFToken'] = csrfTokenMeta.getAttribute('content');
    }
    
    try {
        const response = await fetch(`/api/groups/${groupId}/nodes`, { method: 'POST', headers: headers, body: JSON.stringify({ label: "New Node", x: x, y: y }) });
        if (!response.ok) throw new Error(`Node creation failed (${response.status})`);
        const node = await response.json();
        const el = createNodeElement(node);
        if (el && eventPanelsContainer) { eventPanelsContainer.appendChild(el); }
        else { console.error("Failed to create node element or container not found."); }
    } catch (error) { console.error("Error creating node:", error); alert(`Node creation failed: ${error.message}`); }
}

// Get active group ID (helper)
function getActiveGroupId() { 
    const activeLi = document.querySelector('.group-list-area ul .group-item.active');
    return activeLi?.dataset.groupId;
}

// Get coordinates relative to the pannable container
function getRelativeCoordsToContainer(pageX, pageY) { 
    if (!eventPanelsContainer) return { x: 0, y: 0 };
    const rect = eventPanelsContainer.getBoundingClientRect();
    let transformState = { panX: 0, panY: 0, scale: 1 };
    try { transformState = getTransformState(); }
    catch(e) { console.warn("getTransformState not available, using fallback."); const style = window.getComputedStyle(eventPanelsContainer); try { const matrix = new DOMMatrixReadOnly(style.transform); transformState = { panX: matrix.m41, panY: matrix.m42, scale: matrix.a }; } catch { /* fallback failed */ } }
    const { panX, panY, scale } = transformState;
    const mouseX_rel_viewport = pageX - rect.left;
    const mouseY_rel_viewport = pageY - rect.top;
    const relX = (mouseX_rel_viewport - panX) / scale;
    const relY = (mouseY_rel_viewport - panY) / scale;
    return { x: relX, y: relY };
}

async function createEvent(groupId, nodeId = null) { 
    if (!groupId) throw new Error("Cannot create event without active group ID.");
    if (!nodeId) { alert("Please right-click on a Node to create an event attached to it."); return; }
    const eventData = { title: "New Event", date: new Date(Date.now() + 3600000).toISOString(), location: "TBD", description: "", node_id: nodeId };
    
    const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
    const headers = { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
    if (csrfTokenMeta) {
        headers['X-CSRFToken'] = csrfTokenMeta.getAttribute('content');
    }

    try {
        const response = await fetch(`/api/groups/${groupId}/events`, { method: 'POST', headers: headers, body: JSON.stringify(eventData) });
        if (!response.ok) { const errorData = await response.json().catch(() => ({ detail: 'Unknown error' })); throw new Error(`Event creation failed: ${errorData.detail || response.statusText}`); }
        const event = await response.json();
        event.date = event.date ? new Date(event.date) : null;
        event.current_user_rsvp_status = null; 
        const newPanel = createEventPanel(event);
        if (!newPanel) throw new Error("Failed to create event panel element.");
        if (!eventPanelsContainer) throw new Error("Event container not found");
        eventPanelsContainer.appendChild(newPanel);
        const nodeEl = eventPanelsContainer.querySelector(`.event-node[data-node-id="${nodeId}"]`);
        if (nodeEl) {
            const instance = layoutInstances.get(nodeEl);
            const updatedPanelsArray = Array.from(eventPanelsContainer.querySelectorAll(`.event-panel[data-snapped-to-node="${nodeId}"]`));
            if (instance) { instance.updateLayout(updatedPanelsArray); }
            else { const newInstance = new OrbitLayoutManager(nodeEl, updatedPanelsArray); layoutInstances.set(nodeEl, newInstance); }
        } else { console.warn(`Node element ${nodeId} not found for layout update.`); }
        if (document.getElementById('event-list-container')?.offsetParent !== null) renderAllEventsList();
    } catch (error) { console.error("Error creating event:", error); alert(`Event creation failed: ${error.message}`); }
}

// --- Outside Click Handling ---
let isOutsideClickListenerActive = false;

function handleOutsideClick(event) {
    const clickedPanel = event.target.closest('.event-panel');
    const clickedNode = event.target.closest('.event-node');
    const clickedContextMenu = event.target.closest('.context-menu'); 

    if (!clickedPanel && !clickedNode && !clickedContextMenu) {
        let panelUnclicked = false;
        layoutInstances.forEach(instance => {
            if (instance.unclickActivePanel()) {
                panelUnclicked = true;
            }
        });
    }
}

function addOutsideClickListener() {
    if (!isOutsideClickListenerActive && collageViewport) {
        document.addEventListener('click', handleOutsideClick, { capture: false }); 
        isOutsideClickListenerActive = true;
    }
}

function removeOutsideClickListener() {
    if (isOutsideClickListenerActive) {
        document.removeEventListener('click', handleOutsideClick, { capture: false });
        isOutsideClickListenerActive = false;
    }
}


// --- END OF FILE eventRenderer.js ---