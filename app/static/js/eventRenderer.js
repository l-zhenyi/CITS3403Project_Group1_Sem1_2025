// --- START OF FILE eventRenderer.js ---

// eventRenderer.js
import { groupsData, allEventsData, eventsByDate } from './dataHandle.js';
// 1. Import the class
import { OrbitLayoutManager } from './orbitLayoutDOM.js'; // Adjust path if needed

const eventPanelsContainer = document.getElementById('event-panels-container');
const calendarMonthYearEl = document.getElementById('calendar-month-year');
const calendarGridEl = document.getElementById('calendar-grid');
const eventListContainer = document.getElementById('event-list-container');
const collageViewport = document.getElementById('collage-viewport');

// 2. Store layout instances (Node Element -> Layout Manager Instance)
const layoutInstances = new Map();


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

// --- Create Event Panel DOM Element ---
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
    // Log the attached data for debugging
    // console.log(`[createEventPanel] Attached _eventData to panel ${panel.id}:`, event);


    // --- Build Inner HTML for the *original* content view ---
    // This is what shows when the circle is small/not clicked
    const dateText = formatEventDateForDisplay(event.date); // event.date should be Date object now
    const imageUrl = event.image_url || '/static/img/default-event-logo.png'; // Use default

    // Create the original content wrapper dynamically
    const originalContentWrapper = document.createElement('div');
    originalContentWrapper.className = 'orbit-element-original-content'; // Matches OrbitLayoutManager
    originalContentWrapper.innerHTML = `
        <img src="${imageUrl}" alt="${event.title || 'Event'}" class="event-panel-thumbnail">
        <div class="event-panel-info">
            <div class="event-panel-title" title="${event.title || ''}">${event.title || 'Untitled Event'}</div>
            <div class="event-panel-date">${dateText}</div>
        </div>
    `;
    panel.appendChild(originalContentWrapper);

    // NOTE: The 'expanded' content (orbit-element-expanded-content)
    // is created dynamically by OrbitLayoutManager's _ensureExpandedContentDiv

    // Set position: absolute for layout calculations
    panel.style.position = 'absolute';
    // Set initial rough position only if NOT snapped (OrbitLayout will override)
    if (!panel.dataset.snappedToNode) {
        panel.style.left = `${Number(event.x || 0)}px`; // Use x/y if event has them (for non-snapped)
        panel.style.top = `${Number(event.y || 0)}px`;
    }

    return panel;
}


// --- Node Dragging Logic ---
function makeDraggableNode(element) {
    let isDragging = false;
    let startX, startY, initialNodeLeft, initialNodeTop;

    function onPointerDown(e) {
         // Only drag if directly clicking the node, not content inside (if any)
        if (e.target !== element || e.button !== 0 || !window.draggingAllowed) return;

        e.stopPropagation(); // Prevent viewport drag
        isDragging = true;
        element.classList.add('dragging');
        element.style.zIndex = 1000; // Bring to front
        element.style.cursor = 'grabbing'; // Indicate dragging
        startX = e.clientX;
        startY = e.clientY;
        initialNodeLeft = parseFloat(element.style.left) || 0;
        initialNodeTop = parseFloat(element.style.top) || 0;

        // Use pointer events for better compatibility (touch + mouse)
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp); // Handle cancellation
    }

    function onPointerMove(e) {
        if (!isDragging) return;
        // No explicit preventDefault needed for pointermove typically

        const scale = getCurrentZoomScale(); // Get current zoom from viewport
        const dx = (e.clientX - startX) / scale; // Adjust movement by scale
        const dy = (e.clientY - startY) / scale;
        const newX = initialNodeLeft + dx;
        const newY = initialNodeTop + dy;
        element.style.left = `${newX}px`;
        element.style.top = `${newY}px`;

        // --- Trigger layout update for associated instance ---
        const instance = layoutInstances.get(element);
        if (instance) {
            // We don't pass panels here; updateLayout should use its internal list
            instance.updateLayout();
        }
    }

    function onPointerUp() {
        if (!isDragging) return;
        isDragging = false;
        element.classList.remove('dragging');
        element.style.zIndex = ''; // Reset z-index
        element.style.cursor = ''; // Reset cursor

        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);

        // --- Trigger final layout update ---
        const instance = layoutInstances.get(element);
        if (instance) {
            instance.updateLayout();
        }

        // --- Save new position to backend ---
        const nodeId = element.dataset.nodeId;
        if (nodeId) {
            const x = parseFloat(element.style.left) || 0;
            const y = parseFloat(element.style.top) || 0;
             console.log(`Node ${nodeId} drag end. Saving position: x=${x}, y=${y}`);
            fetch(`/api/nodes/${nodeId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ x, y })
            })
            .then(res => {
                if (!res.ok) console.error(`Failed to update node ${nodeId} position.`);
                return res.json();
            })
            .then(data => {
                // console.log(`Node ${nodeId} position updated on server`, data);
            })
            .catch(err => console.error(`Error updating node ${nodeId}:`, err));
        }
    }

    // Use pointerdown instead of mousedown
    element.addEventListener('pointerdown', onPointerDown);

    // Add cleanup function if needed later
    // element._dragCleanup = () => element.removeEventListener('pointerdown', onPointerDown);
}

// Get current zoom scale from viewport manager
function getCurrentZoomScale() {
    if (!eventPanelsContainer) return 1;
    // Use viewportManager's state if possible for consistency
    // Assuming viewportManager is accessible or provides a way to get scale
    // Otherwise, fallback to parsing style
    try {
         // If viewportManager exports getTransformState
         const { scale } = import('./viewportManager.js').then(m => m.getTransformState());
         if(scale) return scale;
    } catch(e) { /* ignore if module/function doesn't exist */ }

    // Fallback: Parse from style attribute
    const transform = eventPanelsContainer.style.transform;
    const match = transform.match(/scale\(([\d.]+)\)/);
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
    el.dataset.nodeId = node.id; // Use camelCase consistently if possible, but dataset converts anyway
    el.style.left = `${Number(node.x || 0)}px`;
    el.style.top = `${Number(node.y || 0)}px`;
    el.style.position = 'absolute'; // Nodes also need absolute positioning
    el.textContent = node.label || 'Untitled';
    makeDraggableNode(el); // Attach drag handler
    return el;
}

// --- Render List of All Events ---
// Requires allEventsData to be populated correctly
export function renderAllEventsList(filter = 'upcoming') {
    if (!eventListContainer) {
        console.error("Event list container not found.");
        return;
    }
    const now = new Date();
    let filtered = [];

    // Ensure dates are Date objects for comparison
    const eventsWithDates = allEventsData.map(event => ({
         ...event,
         date: event.date instanceof Date ? event.date : (event.date ? new Date(event.date) : null)
    }));


    try {
         filtered = eventsWithDates.filter(event => {
            if (!event.date || isNaN(event.date)) return false; // Skip invalid dates
            if (filter === 'upcoming') return event.date >= now;
            if (filter === 'past') return event.date < now;
            return true; // 'all' filter
        });

        // Sort appropriately
        filtered.sort((a, b) => {
            // Handle potential null dates defensively, though filtered above
            const dateA = a.date?.getTime() || 0;
            const dateB = b.date?.getTime() || 0;
            return filter === 'past' ? dateB - dateA : dateA - dateB;
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
            // Use the same consistent date formatting
            const dateDisplay = formatEventDateForDisplay(event.date);
            // Determine RSVP display string
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
                 <!-- Display user's RSVP status if available -->
                <p class="tile-detail">✔️ ${rsvpText}</p>
            </div>
            `;
        }).join('');
    }
}


// --- Render Group Events (Collage/Orbit View) ---
export async function renderGroupEvents(groupId) {
    if (!eventPanelsContainer) {
        console.error("Cannot render group events: Event panels container not found.");
        return;
    }
     if (!groupId) {
         console.warn("renderGroupEvents called without groupId.");
         eventPanelsContainer.innerHTML = '<p class="info-message">Select a group to view events.</p>';
          // Clear layout instances if no group is selected
          layoutInstances.forEach(instance => instance.destroy());
          layoutInstances.clear();
         return;
     }

    console.log(`[renderGroupEvents] Rendering events for Group ID: ${groupId}`);
    eventPanelsContainer.innerHTML = '<div class="loading-indicator">Loading events...</div>'; // Show loading state

    try {
        // Fetch nodes and nested events (includes current_user_rsvp_status)
        const res = await fetch(`/api/groups/${groupId}/nodes?include=events`);
        if (!res.ok) {
            throw new Error(`Failed to fetch group nodes/events: ${res.status} ${res.statusText}`);
        }
        const nodes = await res.json();
        console.log(`[renderGroupEvents] Fetched ${nodes.length} nodes for group ${groupId}.`);

        // --- Destroy Old Layout Instances FIRST ---
        console.log("[renderGroupEvents] Cleaning up previous layout instances...");
        layoutInstances.forEach((instance, nodeEl) => {
            console.log(` -> Destroying instance ID: ${instance.instanceId} for node:`, nodeEl.id || nodeEl);
            try {
                instance.destroy();
            } catch(e) {
                console.error(`Error destroying layout instance for node ${nodeEl.id}:`, e);
            }
        });
        layoutInstances.clear();
        console.log("[renderGroupEvents] Previous instances destroyed and map cleared.");
        // --- End Cleanup ---

        eventPanelsContainer.innerHTML = ''; // Clear loading indicator/previous content

        const renderedNodes = {}; // Track rendered node elements for layout init

        // --- Render Nodes ---
        if (nodes.length === 0) {
             console.log(`[renderGroupEvents] No nodes found for group ${groupId}.`);
        }
        nodes.forEach(node => {
            const nodeEl = createNodeElement(node);
            if(nodeEl) { // createNodeElement might return null on bad data
                eventPanelsContainer.appendChild(nodeEl);
                renderedNodes[node.id] = nodeEl;
            }
        });

        // --- Render Events ---
        const events = nodes.flatMap(node => node.events || []); // Extract all events
        console.log(`[renderGroupEvents] Found ${events.length} total events across nodes.`);
        if (events.length === 0 && nodes.length > 0) {
            console.log(`[renderGroupEvents] Nodes exist but have no events attached.`);
             // Optionally display message if nodes exist but no events
            // eventPanelsContainer.innerHTML += '<p class="info-message">No events found for the nodes in this group.</p>';
        } else if (events.length === 0 && nodes.length === 0) {
            eventPanelsContainer.innerHTML = '<p class="info-message">This group has no nodes or events yet.</p>';
        }

        events.forEach(event => {
             // Ensure date is a Date object before creating panel
             event.date = event.date ? new Date(event.date) : null;
             if (event.date && isNaN(event.date)) { // Check if date parsing failed
                 console.warn(`[renderGroupEvents] Invalid date format for event ID ${event.id}:`, event.date);
                 event.date = null; // Set to null if invalid
             }
            const panel = createEventPanel(event); // createEventPanel attaches _eventData
            if(panel) { // Only append if panel creation succeeded
                eventPanelsContainer.appendChild(panel);
            }
        });


        // --- Initialize Layout Instances for Nodes with Events ---
        console.log("[renderGroupEvents] Initializing NEW layout instances...");
        Object.entries(renderedNodes).forEach(([nodeId, nodeEl]) => {
            // Find panels specifically snapped to *this* node
            const panelsForNode = Array.from(
                eventPanelsContainer.querySelectorAll(`.event-panel[data-snapped-to-node="${nodeId}"]`)
            );

            if (panelsForNode.length > 0) {
                console.log(` -> Found ${panelsForNode.length} panels for node ${nodeId}. Creating NEW layout instance.`);
                try {
                    const newInstance = new OrbitLayoutManager(nodeEl, panelsForNode);
                    layoutInstances.set(nodeEl, newInstance); // Store the NEW instance, mapping Node Element -> Instance
                    console.log(`[renderGroupEvents] -> Created Instance ID: ${newInstance.instanceId} for node ${nodeId}`);
                } catch(error) {
                     console.error(`Error creating OrbitLayoutManager for node ${nodeId}:`, error);
                }
            } else {
                // console.log(` -> No panels found snapped to node ${nodeId}. Skipping layout instance.`);
            }
        });
        console.log(`[renderGroupEvents] Layout initialization complete. ${layoutInstances.size} instances active.`);


    } catch (error) {
        console.error(`Error rendering group events for group ID ${groupId}:`, error);
        eventPanelsContainer.innerHTML = `<p class="error-message">Could not load events. ${error.message}</p>`;
        // Ensure cleanup happens on error too
        layoutInstances.forEach(instance => instance.destroy());
        layoutInstances.clear();
    }
}

// --- Render Calendar Grid ---
// Requires eventsByDate to be populated
export function renderCalendar(year, month) {
    if (!calendarGridEl || !calendarMonthYearEl) {
        console.error("Calendar grid or month/year element not found.");
        return;
    }
    // console.log(`Rendering calendar for ${year}-${month + 1}`); // DEBUG

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfPrevMonth = new Date(year, month, 0);
    const lastDayOfCurrentMonth = new Date(year, month + 1, 0);
    const firstDayWeekday = firstDayOfMonth.getDay(); // 0=Sunday, 6=Saturday
    const numDays = lastDayOfCurrentMonth.getDate();
    const prevMonthDays = lastDayOfPrevMonth.getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0); const todayTimestamp = today.getTime();

    calendarMonthYearEl.textContent = `${monthNames[month]} ${year}`;

    let gridHtml = '';
    // Previous month's days
    for (let i = 0; i < firstDayWeekday; i++) {
        const dayNum = prevMonthDays - firstDayWeekday + 1 + i;
        gridHtml += `<div class="calendar-cell other-month"><span class="day-number">${dayNum}</span><div class="event-markers"></div></div>`;
    }
    // Current month's days
    for (let i = 1; i <= numDays; i++) {
        const currentDate = new Date(year, month, i); currentDate.setHours(0, 0, 0, 0);
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const isToday = currentDate.getTime() === todayTimestamp;
        // Use the globally populated eventsByDate
        const events = eventsByDate[dateStr] || [];
        let cellClasses = "calendar-cell"; if (isToday) cellClasses += " today";

        gridHtml += `<div class="${cellClasses}" data-date="${dateStr}">`;
        gridHtml += `<span class="day-number">${i}</span>`;
        gridHtml += `<div class="event-markers">`;
        events.slice(0, 3).forEach(() => { gridHtml += `<div class="event-marker"></div>`; });
        if (events.length > 3) gridHtml += `<div class="event-marker more-events">+</div>`;
        gridHtml += `</div></div>`;
    }
    // Next month's days
    const totalCellsRendered = firstDayWeekday + numDays;
    const remainingCells = totalCellsRendered % 7 === 0 ? 0 : 7 - (totalCellsRendered % 7);
    for (let i = 1; i <= remainingCells; i++) {
        gridHtml += `<div class="calendar-cell other-month"><span class="day-number">${i}</span><div class="event-markers"></div></div>`;
    }
    calendarGridEl.innerHTML = gridHtml;

    // Apply dynamic row sizing
    const totalCellsInGrid = firstDayWeekday + numDays + remainingCells;
    const numRows = totalCellsInGrid / 7;
    calendarGridEl.style.gridTemplateRows = `repeat(${numRows}, 1fr)`;
    // calendarGridEl.style.minHeight = ''; // May not be needed
}

// --- Context Menu Logic ---

// Create context menu element if it doesn't exist
function createContextMenuElement() {
    let menu = document.getElementById('custom-context-menu');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'custom-context-menu';
        menu.className = 'context-menu'; // Ensure CSS targets this
        document.body.appendChild(menu);
         console.log("Context menu element created.");
    }
    return menu;
}

// Handle actions selected from the context menu
async function handleContextAction(label, x, y, id, elementType) {
    console.log(`Context action: ${label}, Type: ${elementType}, ID: ${id}, Coords: (${x},${y})`);
    const groupId = getActiveGroupId(); // Need the current group context
    if (!groupId && (label === 'Create Node' || label === 'Create Event on Node')) {
         alert("Please select an active group first.");
         return;
    }
    const { x: relX, y: relY } = getRelativeCoordsToContainer(x, y); // Coords relative to the pannable container

    try {
        switch (label) {
            case 'Create Node':
                await createNodeAt(relX, relY, groupId);
                break;
            case 'Create Event on Node':
                 if (elementType !== 'event-node') {
                     console.warn("Attempted to create event on non-node element.");
                     return;
                 }
                await createEvent(groupId, id); // Pass node ID
                break;
            case 'Rename Event':
                 if (elementType !== 'event-panel') return;
                await renameEvent(id);
                break;
            case 'Delete Event':
                 if (elementType !== 'event-panel') return;
                if(confirm('Are you sure you want to delete this event?')) {
                    await deleteEvent(id);
                }
                break;
            case 'Rename Node':
                 if (elementType !== 'event-node') return;
                await renameNode(id);
                break;
            case 'Delete Node':
                 if (elementType !== 'event-node') return;
                if(confirm('Are you sure you want to delete this node and ALL its events?')) {
                    await deleteNode(id);
                }
                break;
            default:
                console.warn("Unknown context menu action:", label);
        }
    } catch (error) {
        console.error(`Error executing context action "${label}":`, error);
        alert(`Action failed: ${error.message}`);
    }

    // Optional: Refresh the view after an action
    // Be careful not to trigger too many refreshes
    if (groupId && ['Create Node', 'Delete Node', 'Create Event on Node', 'Delete Event'].includes(label)) {
        console.log("Refreshing group view after context action.");
        renderGroupEvents(groupId);
    }
}


// Show the context menu
export function showContextMenu({ x, y, type, id }) {
    const menu = createContextMenuElement(); // Ensure it exists
    menu.innerHTML = ''; // Clear previous options

    const optionsMap = {
        'event-panel': ['Rename Event', 'Delete Event'],
        'event-node': ['Create Event on Node', 'Rename Node', 'Delete Node'],
        'canvas': ['Create Node']
    };
    const options = optionsMap[type] || [];

    if (options.length === 0) {
        console.log("No context menu options for type:", type);
        menu.style.display = 'none'; // Hide if no options
        return;
    }

    options.forEach(label => {
        const option = document.createElement('div');
        option.className = 'context-menu-option';
        option.textContent = label;
        option.onclick = (e) => {
            e.stopPropagation(); // Prevent triggering window click listener immediately
            menu.style.display = 'none'; // Hide menu on click
            handleContextAction(label, x, y, id, type); // Pass type for validation
        };
        menu.appendChild(option);
    });

    // Position and display the menu
    // Adjust positioning slightly to avoid cursor overlap
    menu.style.left = `${x + 2}px`;
    menu.style.top = `${y + 2}px`;
    menu.style.display = 'block';
     console.log(`Showing context menu at (${x},${y}) for type: ${type}, id: ${id}`);
}

// --- CRUD Actions (Called by Context Menu Handler) ---

async function renameEvent(eventId) {
    const panel = document.querySelector(`.event-panel[data-event-id="${eventId}"]`);
    const currentData = panel?._eventData; // Use attached data
    if (!panel || !currentData) return;

    const newName = prompt('Rename event:', currentData.title);
    if (newName === null || newName.trim() === '' || newName === currentData.title) return; // No change or cancelled

    const response = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newName })
    });
    if (!response.ok) throw new Error(`Failed to rename event (${response.status})`);
    const updatedEvent = await response.json();

    // Update DOM (simple text update for now)
    const nameEl = panel.querySelector('.event-panel-title'); // Target specific element if possible
    if (nameEl) nameEl.textContent = updatedEvent.title;
    // Update internal data
    currentData.title = updatedEvent.title;
     // Update expanded view if open (more complex, might need event dispatch)
     const expandedTitle = panel.querySelector('.orbit-element-expanded-content .title-scroll');
     if(expandedTitle) expandedTitle.textContent = updatedEvent.title;

}

async function deleteEvent(eventId) {
    console.log(`Attempting to delete event with ID: ${eventId}`);
    const panel = document.querySelector(`.event-panel[data-event-id="${eventId}"]`);
    if (!panel) return;

    const response = await fetch(`/api/events/${eventId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(`Failed to delete event (${response.status})`);
    const data = await response.json();

    if (data.success) {
        const nodeId = panel.dataset.snappedToNode; // Check if it was attached to a node
        panel.remove(); // Remove from DOM
        console.log(`Event panel ${eventId} removed from DOM.`);

        // If attached to a node, update that node's layout
        if (nodeId) {
            const nodeEl = document.querySelector(`.event-node[data-node-id="${nodeId}"]`);
            const instance = nodeEl ? layoutInstances.get(nodeEl) : null;
            if (instance) {
                console.log(`Updating layout for node ${nodeId} after event deletion.`);
                 // Get remaining panels for the node
                 const remainingPanels = Array.from(eventPanelsContainer.querySelectorAll(`.event-panel[data-snapped-to-node="${nodeId}"]`));
                 instance.updateLayout(remainingPanels); // Update with remaining panels
            }
        }
    } else {
         throw new Error("Server reported delete failed.");
    }
}

async function renameNode(nodeId) {
    const nodeEl = document.querySelector(`.event-node[data-node-id="${nodeId}"]`);
    if (!nodeEl) return;
    const currentLabel = nodeEl.textContent || '';
    const newLabel = prompt('Rename node:', currentLabel);
    if (newLabel === null || newLabel.trim() === '' || newLabel === currentLabel) return;

    const response = await fetch(`/api/nodes/${nodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel })
    });
     if (!response.ok) throw new Error(`Failed to rename node (${response.status})`);
    const data = await response.json();

    nodeEl.textContent = data.label; // Update DOM
     // Update layout instance data if needed (less critical for label usually)
     const instance = layoutInstances.get(nodeEl);
     if (instance?.nodeInfo) instance.nodeInfo.label = data.label; // Example if layout uses it

}

async function deleteNode(nodeId) {
    const nodeEl = document.querySelector(`.event-node[data-node-id="${nodeId}"]`);
    if (!nodeEl) return;

    const response = await fetch(`/api/nodes/${nodeId}`, { method: 'DELETE' });
     if (!response.ok) throw new Error(`Failed to delete node (${response.status})`);
    const data = await response.json();

    if (data.success) {
         console.log(`Node ${nodeId} deleted successfully.`);
         // Remove associated event panels first
         const associatedPanels = eventPanelsContainer.querySelectorAll(`.event-panel[data-snapped-to-node="${nodeId}"]`);
         associatedPanels.forEach(panel => panel.remove());
         // Destroy layout instance associated with this node
         const instance = layoutInstances.get(nodeEl);
         if (instance) {
             console.log(`Destroying layout instance for deleted node ${nodeId}`);
             instance.destroy();
             layoutInstances.delete(nodeEl); // Remove from map
         }
         // Remove node element itself
         nodeEl.remove();
    } else {
         throw new Error("Server reported node delete failed.");
    }
}

async function createNodeAt(x, y, groupId) {
    if (!groupId) throw new Error("Cannot create node without active group ID.");
    console.log(`Creating node for group ${groupId} at rel coords (${x}, ${y})`);
    const response = await fetch(`/api/groups/${groupId}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: "New Node", x: x, y: y })
    });
    if (!response.ok) throw new Error(`Node creation failed (${response.status})`);
    const node = await response.json();

    const el = createNodeElement(node); // Creates the DOM element and makes it draggable
    if (el && eventPanelsContainer) {
        eventPanelsContainer.appendChild(el);
         console.log(`Node ${node.id} created and added to DOM.`);
    } else {
         console.error("Failed to create node element or container not found.");
    }
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
    // Get current transform state using viewportManager
    const { panX, panY, scale } = getTransformState(); // Assumes imported

    // Adjust mouse coordinates by the container's top-left screen position
    // Adjust further by the current pan, and divide by scale
    const mouseX_rel_viewport = pageX - rect.left;
    const mouseY_rel_viewport = pageY - rect.top;

    // Calculate position within the un-transformed container space
    const relX = (mouseX_rel_viewport - panX) / scale;
    const relY = (mouseY_rel_viewport - panY) / scale;

    return { x: relX, y: relY };
}


async function createEvent(groupId, nodeId = null) {
     if (!groupId) throw new Error("Cannot create event without active group ID.");
     if (!nodeId) { // Check if it's being created on canvas (we don't support this yet)
         alert("Please right-click on a Node to create an event attached to it.");
         return;
     }
     console.log(`Creating event for group ${groupId} on node ${nodeId}`);

    const eventData = {
        title: "New Event",
        // Default date to now + 1 hour, formatted as ISO string for backend
        date: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        location: "TBD",
        description: "",
        node_id: nodeId // Link to the node
    };

    const response = await fetch(`/api/groups/${groupId}/events`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(`Event creation failed: ${errorData.detail || response.statusText}`);
    }

    const event = await response.json();
    // --- IMPORTANT: Parse date string from API into Date object ---
    event.date = event.date ? new Date(event.date) : null;
    // --- Fetch user's initial RSVP status for the new event (usually null) ---
    // Alternatively, the create endpoint could return this, but a quick fetch is fine here
     try {
        const rsvpRes = await fetch(`/api/events/${event.id}/my-rsvp`);
        if(rsvpRes.ok) {
            const rsvpData = await rsvpRes.json();
            event.current_user_rsvp_status = rsvpData.status;
        } else {
            event.current_user_rsvp_status = null; // Default if fetch fails
        }
     } catch {
         event.current_user_rsvp_status = null;
     }


    const newPanel = createEventPanel(event); // Create the DOM element (attaches _eventData)

    if (!newPanel) throw new Error("Failed to create event panel element.");
    if (!eventPanelsContainer) throw new Error("Event container not found");
    eventPanelsContainer.appendChild(newPanel); // Add to DOM
     console.log(`Event ${event.id} created and added to DOM.`);

    // --- Trigger Layout Update for the Node ---
    const nodeEl = eventPanelsContainer.querySelector(`.event-node[data-node-id="${nodeId}"]`);
    if (nodeEl) {
        const instance = layoutInstances.get(nodeEl);
        const updatedPanelsForNode = eventPanelsContainer.querySelectorAll(`.event-panel[data-snapped-to-node="${nodeId}"]`);
        const updatedPanelsArray = Array.from(updatedPanelsForNode);

        if (instance) {
            console.log(` -> Updating existing layout instance ID ${instance.instanceId} for node ${nodeId} with ${updatedPanelsArray.length} panels.`);
            instance.updateLayout(updatedPanelsArray); // Pass the updated list
        } else {
            // Create one if it didn't exist (e.g., first event for this node)
            console.log(` -> Creating new layout instance for node ${nodeId} with ${updatedPanelsArray.length} panels.`);
            const newInstance = new OrbitLayoutManager(nodeEl, updatedPanelsArray);
             console.log(` -> Created Instance ID: ${newInstance.instanceId}`);
            layoutInstances.set(nodeEl, newInstance);
        }
    } else {
        console.warn(`Node element with ID ${nodeId} not found for layout update after creating event.`);
    }
}


// --- END OF FILE eventRenderer.js ---