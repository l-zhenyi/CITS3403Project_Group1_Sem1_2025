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
// *** EXPORT this map ***
export const layoutInstances = new Map();

// ... (rest of the file: formatEventDateForDisplay, createEventPanel, makeDraggableNode, getCurrentZoomScale, createNodeElement, renderAllEventsList, renderGroupEvents, renderCalendar, createContextMenuElement, handleContextAction, showContextMenu, CRUD actions, getActiveGroupId, getRelativeCoordsToContainer, createEvent) ...

// --- Helper: Format Date ---
// Keep consistent formatting logic
function formatEventDateForDisplay(date) {
    if (!date || !(date instanceof Date) || isNaN(date)) return 'No Date';
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
    let gridHtml = '';

    // Previous month's trailing days
    for (let i = 0; i < firstDayWeekday; i++) {
        const dayNum = prevMonthDays - firstDayWeekday + 1 + i;
        gridHtml += `<div class="calendar-cell other-month"><span class="day-number">${dayNum}</span><div class="event-markers"></div></div>`;
    }

    // Current month's days
    for (let i = 1; i <= numDays; i++) {
        const currentDate = new Date(year, month, i); currentDate.setHours(0,0,0,0);
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const isToday = currentDate.getTime() === today.getTime();
        
        const eventsOnThisDay = eventsByDate[dateStr] || [];
        
        let cellClasses = "calendar-cell";
        if (isToday) cellClasses += " today";
        if (eventsOnThisDay.length > 0) cellClasses += " has-events";

        gridHtml += `<div class="${cellClasses}" data-date="${dateStr}">`;
        gridHtml += `<span class="day-number">${i}</span>`;
        gridHtml += `<div class="event-markers">`;
        
        // Display up to 3 distinct event markers (e.g., colored dots or small icons)
        // For simplicity, just showing generic markers based on count for now
        eventsOnThisDay.slice(0, 3).forEach(() => { 
            gridHtml += `<div class="event-marker"></div>`; 
        });
        if (eventsOnThisDay.length > 3) {
            gridHtml += `<div class="event-marker more-events">+</div>`;
        }
        gridHtml += `</div>`; // Close event-markers

        // Add a list of event titles (tooltip or expandable on click)
        if (eventsOnThisDay.length > 0) {
            gridHtml += `<div class="calendar-event-titles-tooltip">`;
            eventsOnThisDay.forEach(event => {
                // Make sure event.title and event.group_name exist
                const title = event.title || 'Untitled Event';
                const groupName = event.group_name || 'No Group';
                gridHtml += `<p><strong>${title}</strong> (${groupName})</p>`;
            });
            gridHtml += `</div>`;
        }
        gridHtml += `</div>`; // Close calendar-cell
    }

    // Next month's leading days
    const totalCellsRendered = firstDayWeekday + numDays;
    const remainingCells = totalCellsRendered % 7 === 0 ? 0 : 7 - (totalCellsRendered % 7);
    for (let i = 1; i <= remainingCells; i++) {
        gridHtml += `<div class="calendar-cell other-month"><span class="day-number">${i}</span><div class="event-markers"></div></div>`;
    }

    calendarGridEl.innerHTML = gridHtml;
    const totalCellsInGrid = firstDayWeekday + numDays + remainingCells;
    const numRows = Math.ceil(totalCellsInGrid / 7); // Use Math.ceil for safety
    calendarGridEl.style.gridTemplateRows = `repeat(${numRows}, minmax(80px, 1fr))`; // minmax for responsive height
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
            case 'Delete Node': if (elementType !== 'event-node') return; if(confirm('Are you sure you want to delete this node? Events will be unassigned.')) await deleteNode(id); break; // MODIFIED confirm message
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
        'canvas': ['Create Node'] // Target canvas via event.target check in main listener
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
async function renameEvent(eventId) { /* ... logic ... */
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
        currentData.title = updatedEvent.title; // Update local data
        panel._eventData.title = updatedEvent.title; // Ensure main _eventData is also updated
        const expandedTitle = panel.querySelector('.orbit-element-expanded-content .title-scroll');
        if(expandedTitle) expandedTitle.textContent = updatedEvent.title;
        if (document.getElementById('event-list-container')?.offsetParent !== null) renderAllEventsList();
    } catch (error) { console.error("Error renaming event:", error); alert(`Rename failed: ${error.message}`); }
}
async function deleteEvent(eventId) { /* ... logic ... */
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
async function renameNode(nodeId) { /* ... logic ... */
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
async function deleteNode(nodeId) { /* ... logic ... */
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
            // Events are unassigned by backend if node is deleted. Refresh current group view.
            const instance = layoutInstances.get(nodeEl);
            if (instance) { instance.destroy(); layoutInstances.delete(nodeEl); }
            nodeEl.remove();

            const activeGroupId = getActiveGroupId();
            if (activeGroupId) {
                renderGroupEvents(activeGroupId); // Refresh to show unassigned events if any
            }
            if (document.getElementById('event-list-container')?.offsetParent !== null) renderAllEventsList();
        } else { throw new Error(data.message || "Server reported node delete failed."); }
    } catch(error) { console.error("Error deleting node:", error); alert(`Delete failed: ${error.message}`); }
}
async function createNodeAt(x, y, groupId) { /* ... logic ... */
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
function getActiveGroupId() { /* ... logic ... */
    const activeLi = document.querySelector('.group-list-area ul .group-item.active');
    return activeLi?.dataset.groupId;
}

// Get coordinates relative to the pannable container
function getRelativeCoordsToContainer(pageX, pageY) { /* ... logic ... */
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

async function createEvent(groupId, nodeId = null) { /* ... logic ... */
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
        event.current_user_rsvp_status = null; // New events don't have RSVP status yet for current user
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
    // Check if the click was inside *any* panel or node managed by any instance
    // Also ignore clicks on context menu
    const clickedPanel = event.target.closest('.event-panel');
    const clickedNode = event.target.closest('.event-node');
    const clickedContextMenu = event.target.closest('.context-menu'); // Check for context menu

    if (!clickedPanel && !clickedNode && !clickedContextMenu) {
        // console.log("Outside click detected."); // Debug
        let panelUnclicked = false;
        // Iterate through all active layout instances
        layoutInstances.forEach(instance => {
            // Ask the instance to unclick its active panel, if any
            if (instance.unclickActivePanel()) {
                panelUnclicked = true;
            }
        });
        // if (panelUnclicked) { // Dragging is enabled within unclickActivePanel
        //     console.log("An expanded panel was collapsed."); // Debug
        // }
    }
}

function addOutsideClickListener() {
    if (!isOutsideClickListenerActive && collageViewport) {
        // Use the viewport as the listener target for better focus
        // Use 'pointerdown' instead of 'click' to potentially catch drag starts earlier
        // and ensure it fires before the panel's 'click' if bubbling isn't stopped.
        // Or stick with 'click' and rely on the panel's stopPropagation. 'click' is safer.
        // console.log("Adding outside click listener to document."); // Debug
        document.addEventListener('click', handleOutsideClick, { capture: false }); // Use non-capture phase
        isOutsideClickListenerActive = true;
    }
}

function removeOutsideClickListener() {
    if (isOutsideClickListenerActive) {
        // console.log("Removing outside click listener from document."); // Debug
        document.removeEventListener('click', handleOutsideClick, { capture: false });
        isOutsideClickListenerActive = false;
    }
}


// --- END OF FILE eventRenderer.js ---