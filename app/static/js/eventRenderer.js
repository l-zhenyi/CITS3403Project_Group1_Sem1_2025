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

const OVERFLOW_THRESHOLD = 3; // If more than this number of events, show fade and 'more' indicator

// --- Day Events Modal Elements ---
let dayEventsModalEl = null;
let dayEventsModalTitleEl = null;
let dayEventsModalListEl = null;
let dayEventsModalCloseBtn = null;

// --- Helper: Format Event Time for Day Modal ---
/**
 * Formats the time portion of a Date object for display in the Day Events Modal.
 * If the date's time is midnight (00:00:00 local time), it's displayed as "All Day".
 *
 * @param {Date | null} date - The Date object representing the event's date and time, or null.
 * @returns {string} A formatted time string (e.g., "10:30 AM", "All Day", "Time TBD").
 */
function formatEventTimeForDayModal(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        return 'Time TBD'; // Or "No Time Specified"
    }

    // Check if the time is exactly midnight (00:00:00.000) in the local timezone.
    // This is a common convention for events where only a date is specified (parsed as local midnight)
    // or for events explicitly marked as all-day starting at midnight.
    if (date.getHours() === 0 &&
        date.getMinutes() === 0 &&
        date.getSeconds() === 0 &&
        date.getMilliseconds() === 0) {
        return 'All Day';
    }

    // If there's a specific time other than midnight, format it.
    try {
        return date.toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    } catch (e) {
        console.error("Error formatting time for day modal:", date, e);
        return 'Invalid Time'; // Fallback for unexpected errors
    }
}

function setupDayEventsModal() {
    // Try to find the modal elements that should now be in the HTML
    dayEventsModalEl = document.getElementById('day-events-modal');

    if (!dayEventsModalEl) {
        // If the modal element is not found, we're likely not on the planner page
        // or something went wrong with the HTML.
        // console.warn("Day Events Modal (#day-events-modal) not found in DOM. Cannot initialize.");
        return; // Do nothing further
    }

    // If dayEventsModalEl exists, proceed to find its children and attach listeners
    // Check if already "initialized" (listeners attached) by checking one of its children
    if (dayEventsModalTitleEl) {
        // console.log("Day Events Modal already initialized (listeners attached).");
        return; // Already set up
    }

    dayEventsModalTitleEl = dayEventsModalEl.querySelector('#day-events-modal-title');
    dayEventsModalListEl = dayEventsModalEl.querySelector('#day-events-modal-list');
    dayEventsModalCloseBtn = dayEventsModalEl.querySelector('#day-events-modal-close-btn');

    // Double-check if children were found before attaching listeners
    if (!dayEventsModalTitleEl || !dayEventsModalListEl || !dayEventsModalCloseBtn) {
        console.error("Could not find all required child elements within #day-events-modal.");
        dayEventsModalEl = null; // Nullify to prevent usage
        return;
    }

    dayEventsModalCloseBtn.addEventListener('click', closeDayEventsModal);
    dayEventsModalEl.addEventListener('click', (event) => {
        if (event.target === dayEventsModalEl) {
            closeDayEventsModal();
        }
    });
    // console.log("Day Events Modal initialized from existing DOM.");
}

export function openDayEventsModal(dateString, eventsForDay) {
    if (!dayEventsModalEl) {
        // Attempt to set it up if it hasn't been (e.g., if openDayEventsModal is called before DOMContentLoaded)
        setupDayEventsModal();
        if (!dayEventsModalEl) { // Still not found after setup attempt
            console.warn("Day Events Modal could not be initialized or found. Cannot open.");
            return;
        }
    }

    const dateObj = new Date(dateString + 'T00:00:00'); // Ensure local interpretation of date string for display
    dayEventsModalTitleEl.textContent = `Events on ${dateObj.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;

    dayEventsModalListEl.innerHTML = ''; // Clear previous events

    if (!eventsForDay || eventsForDay.length === 0) {
        dayEventsModalListEl.innerHTML = '<li>No events scheduled for this day.</li>';
    } else {
        eventsForDay.forEach(event => {
            const li = document.createElement('li');
            li.className = 'day-event-item';
            li.dataset.eventId = event.id;

            const titleSpan = document.createElement('span');
            titleSpan.className = 'day-event-title';
            titleSpan.textContent = event.title || 'Untitled Event';

            const groupSpan = document.createElement('span');
            groupSpan.className = 'day-event-group';
            groupSpan.textContent = event.group_name || 'Personal'; // Will use 'Direct Invite/Other' if applicable

            const timeSpan = document.createElement('span');
            timeSpan.className = 'day-event-time';
            let eventDateForTime = null;
            // Find the full event data from allEventsData because eventsForDay might be minimal
            const fullEventData = allEventsData.find(e => String(e.id) === String(event.id));
            if (fullEventData && fullEventData.date instanceof Date) {
                eventDateForTime = fullEventData.date;
            }
            timeSpan.textContent = formatEventTimeForDayModal(eventDateForTime);

            li.appendChild(titleSpan);
            li.appendChild(groupSpan);
            li.appendChild(timeSpan);

            li.addEventListener('click', () => {
                const fullEvent = allEventsData.find(e => String(e.id) === String(event.id));
                if (fullEvent) {
                    document.dispatchEvent(new CustomEvent('openEventModalRequest', {
                        detail: { eventData: fullEvent },
                        bubbles: true, composed: true
                    }));
                    closeDayEventsModal();
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
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupDayEventsModal);
} else {
    setupDayEventsModal();
}



// --- Helper: Format Date ---
function formatEventDateForDisplay(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return 'No Date';
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

// --- Create Event Panel DOM Element ---
function createEventPanel(event) {
    if (!event || typeof event.id === 'undefined') {
        console.error("createEventPanel called with invalid event data:", event);
        return null;
    }
    const panel = document.createElement('div');
    panel.className = 'event-panel';
    panel.id = `event-panel-${event.id}`;
    panel.dataset.eventId = event.id;

    if (event.node_id !== null && event.node_id !== undefined && String(event.node_id).trim() !== '') {
        panel.dataset.snappedToNode = String(event.node_id);
    }

    panel._eventData = event; // Attach full event data (CRITICAL)

    const dateText = formatEventDateForDisplay(event.date); // event.date is now a Date object
    const imageUrl = event.image_url || '/static/img/default-event-logo.png';

    const originalContentWrapper = document.createElement('div');
    originalContentWrapper.className = 'orbit-element-original-content';

    originalContentWrapper.innerHTML = `
        <img src="${imageUrl}" alt="${event.title || 'Event'}" class="event-image">
        <div class="event-info-overlay">
            <div class="event-panel-title" title="${event.title || ''}">${event.title || 'Untitled Event'}</div>
            <div class="event-panel-date">${dateText}</div>
        </div>
    `;
    panel.appendChild(originalContentWrapper);

    // Expanded content is created by OrbitLayoutManager._ensureExpandedContentDiv when layout occurs

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
        e.stopPropagation();
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
            instance.updateLayout();
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
            instance.updateLayout();
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
        const { scale: viewportScale } = getTransformState(); // Renamed to avoid conflict
        if (viewportScale) return viewportScale;
    } catch (e) { /* ignore if getTransformState not available */ }
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
    if (!eventListContainer) {
        console.warn("Event list container not found for renderAllEventsList.");
        return;
    }
    const now = new Date();
    let filtered = [];

    // Ensure allEventsData contains Date objects for dates
    const eventsWithValidDates = allEventsData.map(event => ({
        ...event,
        date: event.date instanceof Date ? event.date : (event.date ? new Date(event.date) : null)
    })).filter(event => event.date && !isNaN(event.date.getTime()));


    try {
        filtered = eventsWithValidDates.filter(event => {
            if (filter === 'upcoming') return event.date >= now;
            if (filter === 'past') return event.date < now;
            return true; // 'all'
        });
        filtered.sort((a, b) => {
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
            const dateDisplay = formatEventDateForDisplay(event.date);
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

        if (!eventListContainer._eventTileClickListenerAttached) {
            eventListContainer.addEventListener('click', (e) => {
                const tile = e.target.closest('.event-tile');
                if (tile) {
                    const eventId = tile.dataset.eventId;
                    if (eventId) {
                        const fullEvent = allEventsData.find(evt => String(evt.id) === String(eventId));
                        if (fullEvent) {
                            document.dispatchEvent(new CustomEvent('openEventModalRequest', {
                                detail: { eventData: fullEvent },
                                bubbles: true, composed: true
                            }));
                        } else {
                            console.warn(`Event data not found for ID ${eventId} in allEventsData when clicking event tile.`);
                        }
                    }
                }
            });
            eventListContainer._eventTileClickListenerAttached = true;
        }
    }
}


// --- Render Group Events (Collage/Orbit View) ---
export async function renderGroupEvents(groupId) {
    if (!eventPanelsContainer || !collageViewport) {
        console.error("Cannot render group events: Event panels container or viewport not found.");
        return;
    }
    if (!groupId) {
        console.warn("renderGroupEvents called without groupId.");
        eventPanelsContainer.innerHTML = '<p class="info-message">Select a group to view events.</p>';
        layoutInstances.forEach(instance => instance.destroy());
        layoutInstances.clear();
        removeOutsideClickListener();
        return;
    }

    eventPanelsContainer.innerHTML = '<div class="loading-indicator">Loading events...</div>';

    try {
        // Fetch nodes and their associated events for the group
        const res = await fetch(`/api/groups/${groupId}/nodes?include=events`);
        if (!res.ok) throw new Error(`Failed to fetch group nodes/events: ${res.status} ${res.statusText}`);
        const groupNodesData = await res.json(); // This is an array of node objects, each potentially with an 'events' array

        layoutInstances.forEach((instance, nodeEl) => {
            try { instance.destroy(); }
            catch(e) { console.error(`Error destroying layout instance for node ${nodeEl.id}:`, e); }
        });
        layoutInstances.clear();
        eventPanelsContainer.innerHTML = ''; // Clear loading

        const renderedNodes = {};
        if (groupNodesData.length === 0) {
            // console.log(`[renderGroupEvents] No nodes for group ${groupId}.`);
        }
        groupNodesData.forEach(nodeData => {
            const nodeEl = createNodeElement(nodeData);
            if (nodeEl) {
                eventPanelsContainer.appendChild(nodeEl);
                renderedNodes[nodeData.id] = nodeEl;
            }
        });

        const allGroupEvents = groupNodesData.flatMap(node => node.events || []);

        if (allGroupEvents.length === 0 && groupNodesData.length === 0) {
            eventPanelsContainer.innerHTML = '<p class="info-message">This group has no nodes or events yet.</p>';
        }

        allGroupEvents.forEach(eventDataFromNode => {
            // Find the corresponding full event data from allEventsData to ensure consistency
            // (especially for RSVP status and any other global properties not in node.events payload)
            let eventToRender = allEventsData.find(e => String(e.id) === String(eventDataFromNode.id));

            if (eventToRender) {
                // Ensure date is a Date object
                eventToRender.date = eventToRender.date instanceof Date ? eventToRender.date : (eventToRender.date ? new Date(eventToRender.date) : null);
            } else {
                // Fallback if not found in allEventsData (should be rare if loadAllUserEventsAndProcess ran)
                console.warn(`[renderGroupEvents] Event ID ${eventDataFromNode.id} from group nodes not found in allEventsData. Using node data as fallback.`);
                eventToRender = {
                    ...eventDataFromNode,
                    date: eventDataFromNode.date ? new Date(eventDataFromNode.date) : null,
                };
            }

            if (eventToRender.date && isNaN(eventToRender.date.getTime())) {
                console.warn(`[renderGroupEvents] Invalid date format for event ID ${eventToRender.id}:`, eventToRender.date);
                eventToRender.date = null;
            }
            const panel = createEventPanel(eventToRender);
            if (panel) {
                eventPanelsContainer.appendChild(panel);
            }
        });

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

        addOutsideClickListener();

    } catch (error) {
        console.error(`Error rendering group events for group ID ${groupId}:`, error);
        eventPanelsContainer.innerHTML = `<p class="error-message">Could not load events. ${error.message}</p>`;
        layoutInstances.forEach(instance => instance.destroy());
        layoutInstances.clear();
        removeOutsideClickListener();
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
    const firstDayWeekday = firstDayOfMonth.getDay();
    const numDays = lastDayOfCurrentMonth.getDate();
    const prevMonthDays = lastDayOfPrevMonth.getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);

    calendarMonthYearEl.textContent = `${monthNames[month]} ${year}`;
    calendarGridEl.innerHTML = '';

    const createOtherMonthCellElement = (dayNum) => {
        const cell = document.createElement('div');
        cell.className = "calendar-cell other-month";
        cell.innerHTML = `<span class="day-number">${dayNum}</span><div class="calendar-events-preview-list"></div>`;
        return cell;
    };

    for (let i = 0; i < firstDayWeekday; i++) {
        const dayNum = prevMonthDays - firstDayWeekday + 1 + i;
        calendarGridEl.appendChild(createOtherMonthCellElement(dayNum));
    }

    for (let i = 1; i <= numDays; i++) {
        const currentDate = new Date(year, month, i); currentDate.setHours(0,0,0,0);
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const isToday = currentDate.getTime() === today.getTime();
        const eventsOnThisDay = eventsByDate[dateStr] || []; // Use globally managed eventsByDate

        const cell = document.createElement('div');
        cell.className = "calendar-cell";
        if (isToday) cell.classList.add("today");
        if (eventsOnThisDay.length > 0) cell.classList.add("has-events");
        cell.dataset.date = dateStr;

        const dayNumberEl = document.createElement('span');
        dayNumberEl.className = 'day-number';
        dayNumberEl.textContent = i;
        cell.appendChild(dayNumberEl);

        const previewListContainer = document.createElement('div');
        previewListContainer.className = 'calendar-events-preview-list';

        eventsOnThisDay.forEach((event, j) => { // event here is minimal {title, group_name, id, status}
            const eventItemEl = document.createElement('div');
            eventItemEl.className = 'calendar-event-item-preview';

            const eventDot = document.createElement('span');
            eventDot.className = 'event-dot';
            eventDot.classList.add(`color-${(j % 6) + 1}`); // Cycle colors based on index in day's list

            const eventTitlePreview = document.createElement('span');
            eventTitlePreview.className = 'event-title-preview';
            eventTitlePreview.textContent = event.title || 'Untitled Event';

            eventItemEl.appendChild(eventDot);
            eventItemEl.appendChild(eventTitlePreview);
            eventItemEl.title = `${event.title || 'Untitled Event'} (${event.group_name || 'Personal'})`;

            previewListContainer.appendChild(eventItemEl);
        });
        cell.appendChild(previewListContainer);

        if (eventsOnThisDay.length > OVERFLOW_THRESHOLD) {
            const moreIndicator = document.createElement('div');
            moreIndicator.className = 'more-events-indicator';
            moreIndicator.textContent = `+${eventsOnThisDay.length - OVERFLOW_THRESHOLD} more`;
            cell.appendChild(moreIndicator);
            previewListContainer.classList.add('has-overflow');
        }

        if (eventsOnThisDay.length > 0) {
            cell.addEventListener('click', () => {
                // Pass the minimal eventsOnThisDay from eventsByDate; openDayEventsModal will
                // use allEventsData to find full details if a specific event is clicked from the modal.
                openDayEventsModal(dateStr, eventsOnThisDay);
            });
        }
        calendarGridEl.appendChild(cell);
    }

    const totalCellsRendered = firstDayWeekday + numDays;
    const remainingCells = totalCellsRendered % 7 === 0 ? 0 : 7 - (totalCellsRendered % 7);
    for (let i = 1; i <= remainingCells; i++) {
        calendarGridEl.appendChild(createOtherMonthCellElement(i));
    }

    const totalCellsInGrid = firstDayWeekday + numDays + remainingCells;
    const numRows = Math.ceil(totalCellsInGrid / 7);
    calendarGridEl.style.gridTemplateRows = `repeat(${numRows}, minmax(90px, 1fr))`;
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

    // After CRUD that affects the collage, always re-render group events if a group is active
    const activeGroupId = getActiveGroupId();
    if (activeGroupId && ['Create Node', 'Delete Node', 'Create Event on Node', 'Delete Event', 'Rename Event', 'Rename Node'].includes(label)) {
        // Re-fetch and re-render all user events to update caches, then render group events
        // This ensures that if an event was deleted/renamed, allEventsData is fresh
        // before renderGroupEvents tries to use it.
        // await loadAllUserEventsAndProcess(); // This is handled by main.js's 'eventDataUpdated' listener for most cases
        // For node creation/deletion, a direct refresh of group events is good.
        // For event creation/deletion/rename, the 'eventDataUpdated' listener in main.js should handle UI updates.
        // However, to be absolutely sure for node changes or if main.js listener doesn't cover a specific case:
        if (['Create Node', 'Delete Node', 'Rename Node'].includes(label)){
             renderGroupEvents(activeGroupId);
        }
        // For event changes, main.js's listener should trigger appropriate renders.
        // If an event that was part of a node is deleted, renderGroupEvents will be called by main.js.
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
        const updatedEventFromServer = await response.json();

        // Dispatch eventDataUpdated for global state update
        document.dispatchEvent(new CustomEvent('eventDataUpdated', {
            detail: { eventId: updatedEventFromServer.id, updatedEvent: updatedEventFromServer },
            bubbles: true, composed: true
        }));
        // Note: UI update for this specific panel (title text) will be handled by main.js re-rendering
        // or if OrbitLayoutManager has a mechanism to update its individual panels upon this event.
        // For now, relying on main.js to refresh views.

    } catch (error) { console.error("Error renaming event:", error); alert(`Rename failed: ${error.message}`); }
}
async function deleteEvent(eventId) {
    const panel = document.querySelector(`.event-panel[data-event-id="${eventId}"]`);
    if (!panel) return;
    const eventDataToDelete = panel._eventData; // Get data before removing

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
            // Dispatch eventDataUpdated with a "deleted" flag or handle differently in main.js
            // For simplicity, we can use the existing updatedEvent structure, but mark it conceptually.
            // Or, main.js could just remove it from its caches.
            document.dispatchEvent(new CustomEvent('eventDataUpdated', {
                detail: { eventId: parseInt(eventId, 10), updatedEvent: { ...eventDataToDelete, _deleted: true } }, // Mark as deleted
                bubbles: true, composed: true
            }));
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
        // const data = await response.json(); // data is the updated node
        // Node label itself is updated via renderGroupEvents called by handleContextAction.
        // No need to dispatch eventDataUpdated for node rename as it doesn't change event properties directly.
        // The handleContextAction will call renderGroupEvents if group is active.
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
            // Deleting a node might unassign events.
            // The handleContextAction will call renderGroupEvents.
            // We also need to ensure allEventsData and eventsByDate are updated for any events
            // that were associated with this node and are now unassigned (node_id becomes null).
            // The safest is to reload all user events after node deletion.
            // This will be handled by the renderGroupEvents in handleContextAction if it refetches.
            // Or, dispatch a generic "dataChanged" event that main.js uses to reload all.
            // For now, rely on handleContextAction's renderGroupEvents.
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
        // const node = await response.json();
        // Node element is added via renderGroupEvents called by handleContextAction.
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
    catch(e) { const style = window.getComputedStyle(eventPanelsContainer); try { const matrix = new DOMMatrixReadOnly(style.transform); transformState = { panX: matrix.m41, panY: matrix.m42, scale: matrix.a }; } catch { /* fallback */ } }
    const { panX, panY, scale } = transformState;
    const mouseX_rel_viewport = pageX - rect.left;
    const mouseY_rel_viewport = pageY - rect.top;
    const relX = (mouseX_rel_viewport - panX) / scale;
    const relY = (mouseY_rel_viewport - panY) / scale;
    return { x: relX, y: relY };
}

async function createEvent(groupId, nodeId = null) {
    if (!groupId) throw new Error("Cannot create event without active group ID.");
    if (!nodeId) {
        alert("Please right-click on a Node to create an event attached to it.");
        return;
    }

    const eventData = {
        title: "New Event",
        date: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
        location: "TBD",
        description: "",
        node_id: nodeId,
        location_coordinates: "TBD",
        cost_display: null,
        cost_value: null,
        image_url: null
    };

    const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
    if (csrfTokenMeta) {
        headers['X-CSRFToken'] = csrfTokenMeta.getAttribute('content');
    }

    try {
        const response = await fetch(`/api/groups/${groupId}/events`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(eventData)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Unknown error during event creation.' }));
            throw new Error(`Event creation failed: ${errorData.detail || response.statusText}`);
        }

        const newEventFromServer = await response.json();

        // Dispatch eventDataUpdated for global state update
        document.dispatchEvent(new CustomEvent('eventDataUpdated', {
            detail: { eventId: newEventFromServer.id, updatedEvent: newEventFromServer }, // updatedEvent is the new event
            bubbles: true, composed: true
        }));
        // UI update (adding panel) will be handled by main.js re-rendering views.

    } catch (error) {
        console.error("Error creating event:", error);
        alert(`Event creation failed: ${error.message}`);
    }
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