// eventRenderer.js
import { groupsData, allEventsData, eventsByDate } from './dataHandle.js';
import { layoutEventsAroundNodeDOM } from './orbitLayoutDOM.js';

const eventPanelsContainer = document.getElementById('event-panels-container');
const calendarMonthYearEl = document.getElementById('calendar-month-year');
const calendarGridEl = document.getElementById('calendar-grid');
const eventListContainer = document.getElementById('event-list-container');
const collageViewport = document.getElementById('collage-viewport');

function createEventPanel(event) {
    // --- DEBUGGING: Log the event object received by this function ---
    console.log("Creating panel for event:", event);
    // --- END DEBUGGING ---

    const panel = document.createElement('div');
    panel.className = 'event-panel';

    // This part works, according to you:
    if (event.id) { // Check if event.id exists before setting
        panel.dataset.eventId = event.id;
    } else {
        console.warn("Event object missing 'id':", event);
    }


    // --- THIS IS THE LIKELY POINT OF FAILURE ---
    // Check if the 'node_id' property exists AND has a meaningful value
    // Use a more robust check: null, undefined, and potentially empty string
    if (event.node_id !== null && event.node_id !== undefined && event.node_id !== '') {
        console.log(` -> Setting data-snapped-to-node="${String(event.node_id)}" for event ${event.id}`);
        panel.dataset.snappedToNode = String(event.node_id); // Ensure it's a string
    } else {
        // --- DEBUGGING: Log why it's *not* being set ---
        console.log(` -> NOT setting data-snapped-to-node for event ${event.id}. Reason: event.node_id is`, event.node_id);
        // --- END DEBUGGING ---
    }
    // --- END OF LIKELY FAILURE POINT ---


    const dateText = event.formatted_date || (event.date ? formatEventDateForDisplay(new Date(event.date)) : 'No Date'); // Handle potential Date object
    const image = document.createElement('img');
    image.className = 'event-image';
    image.alt = event.title || 'Event Image'; // Add default alt text
    image.src = event.image_url || 'https://via.placeholder.com/150x150?text=Event';
    // Add error handling for images
    image.onerror = () => { image.src = 'https://via.placeholder.com/150x150?text=Error'; };


    const infoOverlay = document.createElement('div');
    infoOverlay.className = 'event-info-overlay';
    infoOverlay.innerHTML = `
        <div class="event-name">${event.title || 'Untitled Event'}</div>
        ${event.location ? `<div class="event-location">📍 ${event.location}</div>` : ''}
        <div class="event-details">${dateText}${event.cost_display ? ` | ${event.cost_display}` : ''}</div>
    `;

    if (event.rsvp_status) {
        const rsvp = document.createElement('div');
        rsvp.className = 'event-rsvp';
        rsvp.textContent = `You are ${event.rsvp_status}`;
        infoOverlay.appendChild(rsvp);
    }

    panel.appendChild(image);
    panel.appendChild(infoOverlay);

    const actions = document.createElement('div');
    actions.className = 'event-actions';
    actions.style.display = 'none'; // Keep hidden initially
    actions.innerHTML = `
        <button class="button accept">Accept</button>
        <button class="button decline">Decline</button>
    `;
    panel.appendChild(actions);

    // Set initial position using event.x and event.y if they exist
    // These might be overridden by layoutEventsAroundNodeDOM later if snapped
    panel.style.position = 'absolute';
    panel.style.left = `${Number(event.x || 0)}px`;
    panel.style.top = `${Number(event.y || 0)}px`;

    return panel;
}

function makeDraggableNode(element) {
    let isDragging = false;
    let startX, startY, initialNodeLeft, initialNodeTop; // Store initial style values

    element.addEventListener('mousedown', (e) => {
        // Only drag on the node itself, not on children like text
        if (e.target !== element) return;

        e.stopPropagation(); // Prevent viewport panning when dragging node
        isDragging = true;
        element.classList.add('dragging');
        element.style.zIndex = 1000; // Bring node to front

        // Use pageX/pageY for consistency across browsers
        startX = e.pageX;
        startY = e.pageY;

        // Store the node's position *at the start* of the drag
        // Use parseFloat to handle 'px' unit
        initialNodeLeft = parseFloat(element.style.left) || 0;
        initialNodeTop = parseFloat(element.style.top) || 0;

        // Add listeners to the window/document for wider drag capture
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp, { once: true });
    });

    function onMouseMove(e) {
        if (!isDragging) return;

        // Prevent text selection during drag
        e.preventDefault();

        const scale = getCurrentZoomScale(); // Get current zoom

        // Calculate delta from the drag start position
        const dx = (e.pageX - startX) / scale;
        const dy = (e.pageY - startY) / scale;

        // Calculate new absolute position based on initial position + delta
        const newX = initialNodeLeft + dx;
        const newY = initialNodeTop + dy;

        // Update the node's position directly
        element.style.left = `${newX}px`;
        element.style.top = `${newY}px`;

        // --- Update attached event panels ---
        const nodeId = element.dataset.nodeId;
        // Select panels directly within the container for efficiency
        const attachedPanels = eventPanelsContainer.querySelectorAll(`.event-panel[data-snapped-to-node="${nodeId}"]`);
        console.log(`Dragging node ${nodeId}, found ${attachedPanels.length} attached panels.`);
        // Call layout WITHOUT transition during drag for responsiveness
        if (attachedPanels.length > 0) {
            layoutEventsAroundNodeDOM(element, Array.from(attachedPanels), false); // Pass false for useTransition
        }
    }

    function onMouseUp() {
        if (!isDragging) return; // Prevent potential multi-calls
        isDragging = false;
        element.classList.remove('dragging');
        element.style.zIndex = ''; // Reset z-index

        document.removeEventListener('mousemove', onMouseMove);
        // No need to remove mouseup listener due to { once: true }

        // --- Optional: Final layout with transition for smooth settling ---
        // const nodeId = element.dataset.nodeId;
        // const attachedPanels = eventPanelsContainer.querySelectorAll(`.event-panel[data-snapped-to-node="${nodeId}"]`);
        // if (attachedPanels.length > 0) {
        //     layoutEventsAroundNodeDOM(element, Array.from(attachedPanels), true); // Pass true for transition
        // }
    }
}

function getCurrentZoomScale() {
    if (!eventPanelsContainer) return 1;
    const transform = eventPanelsContainer.style.transform;
    const match = transform.match(/scale\(([\d.]+)\)/);
    return match ? parseFloat(match[1]) : 1;
}

export function createNodeElement(node) {
    const el = document.createElement('div');
    el.className = 'event-node';
    el.id = `node-${node.id}`;
    el.dataset.nodeId = node.id;
    // Make sure x and y are numbers before setting style
    el.style.left = `${Number(node.x || 0)}px`;
    el.style.top = `${Number(node.y || 0)}px`;
    el.textContent = node.label || 'Untitled';
    makeDraggableNode(el); // Attach drag handler
    return el;
}


export function renderAllEventsList(filter = 'upcoming') {
    if (!eventListContainer) return;
    const now = new Date();

    let filtered = allEventsData.filter(event => {
        if (!event.date) return false;
        if (filter === 'upcoming') return event.date >= now;
        if (filter === 'past') return event.date < now;
        return true;
    });

    filtered.sort((a, b) => filter === 'past' ? b.date - a.date : a.date - b.date);

    eventListContainer.innerHTML = filtered.map(event => `
        <div class="event-tile">
            <h4>${event.title}</h4>
            <p class="tile-detail">📅 ${formatEventDateForDisplay(event.date)}</p>
            <p class="tile-detail">👥 ${event.group_name}</p>
            <p class="tile-detail">📍 ${event.location || 'TBD'}</p>
            <p class="tile-detail">✔️ RSVP: ${event.rsvp_status || 'Invited'}</p>
        </div>
    `).join('');

    if (eventsViewArea) eventsViewArea.scrollTop = 0;
}

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

export async function renderGroupEvents(groupId) {
    // Use the globally defined constant
    if (!eventPanelsContainer) return;

    try { // Add error handling for fetch
        const res = await fetch(`/api/groups/${groupId}/events`);
        if (!res.ok) {
            throw new Error(`Failed to fetch group events: ${res.statusText}`);
        }
        const groupData = await res.json();

        const { events, nodes } = groupData;

        eventPanelsContainer.innerHTML = ''; // Clear previous content

        // Set a large enough size for the scrollable area (adjust if needed)
        // These might not be strictly necessary if content defines size, but can help
        // eventPanelsContainer.style.minWidth = '2000px';
        // eventPanelsContainer.style.minHeight = '1600px';

        const renderedNodes = {}; // Keep track of rendered node elements

        // --- Render Nodes ---
        nodes.forEach(node => {
            const nodeEl = createNodeElement(node);
            eventPanelsContainer.appendChild(nodeEl);
            renderedNodes[node.id] = nodeEl; // Store reference by ID
        });

        // --- Render Events ---
        events.forEach(event => {
            // Ensure date is a Date object
            event.date = event.date ? new Date(event.date) : null;
            const panel = createEventPanel(event);
            eventPanelsContainer.appendChild(panel);
        });

        // --- Initial Layout After Rendering Everything ---
        // Use the stored node elements for layout
        Object.entries(renderedNodes).forEach(([nodeId, nodeEl]) => {
            const panelsForNode = eventPanelsContainer.querySelectorAll(`.event-panel[data-snapped-to-node="${nodeId}"]`);
            if (panelsForNode.length > 0) {
                // Call layout WITH transition for the initial setup
                layoutEventsAroundNodeDOM(nodeEl, Array.from(panelsForNode), true);
            }
        });

    } catch (error) {
        console.error("Error rendering group events:", error);
        eventPanelsContainer.innerHTML = `<p class="error-message">Could not load events for this group.</p>`;
    }
    // No mobile check needed here, this function renders the collage content
}


export function renderCalendar(year, month) {
    // Ensure elements exist
    if (!calendarGridEl || !calendarMonthYearEl) {
        console.error("Calendar grid or month/year element not found.");
        return;
    }

    // --- Calculations ---
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfPrevMonth = new Date(year, month, 0);
    const lastDayOfCurrentMonth = new Date(year, month + 1, 0);

    const firstDayWeekday = firstDayOfMonth.getDay(); // 0=Sunday, 1=Monday, ...
    const numDays = lastDayOfCurrentMonth.getDate();
    const prevMonthDays = lastDayOfPrevMonth.getDate();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    // --- Update Header ---
    calendarMonthYearEl.textContent = `${monthNames[month]} ${year}`;

    // --- Build Grid HTML String ---
    let gridHtml = '';
    // Previous month's days
    // Assuming standard 0=Sunday start for grid columns:
    for (let i = 0; i < firstDayWeekday; i++) {
        const dayNum = prevMonthDays - firstDayWeekday + 1 + i;
        gridHtml += `<div class="calendar-cell other-month"><span class="day-number">${dayNum}</span><div class="event-markers"></div></div>`;
    }

    // Current month's days
    for (let i = 1; i <= numDays; i++) {
        const currentDate = new Date(year, month, i);
        currentDate.setHours(0, 0, 0, 0);
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const isToday = currentDate.getTime() === todayTimestamp;
        const events = (typeof eventsByDate !== 'undefined' && eventsByDate[dateStr]) ? eventsByDate[dateStr] : [];

        let cellClasses = "calendar-cell";
        if (isToday) {
            cellClasses += " today";
        }

        gridHtml += `<div class="${cellClasses}" data-date="${dateStr}">`;
        gridHtml += `<span class="day-number">${i}</span>`;
        gridHtml += `<div class="event-markers">`; // Container for markers
        events.slice(0, 3).forEach(() => { // Limit markers shown initially if needed
            gridHtml += `<div class="event-marker"></div>`;
        });
        if (events.length > 3) {
            gridHtml += `<div class="event-marker more-events">+</div>`; // Indicate more
        }
        gridHtml += `</div>`; // Close event-markers
        gridHtml += '</div>'; // Close calendar-cell
    }

    // Next month's days
    const totalCellsRendered = firstDayWeekday + numDays;
    const remainingCells = totalCellsRendered % 7 === 0 ? 0 : 7 - (totalCellsRendered % 7);
    for (let i = 1; i <= remainingCells; i++) {
        gridHtml += `<div class="calendar-cell other-month"><span class="day-number">${i}</span><div class="event-markers"></div></div>`;
    }

    // --- Update Grid Content ---
    calendarGridEl.innerHTML = gridHtml;

    // --- Calculate Rows and Apply Dynamic Row Sizing ---
    const totalCellsInGrid = firstDayWeekday + numDays + remainingCells;
    const numRows = totalCellsInGrid / 7;

    calendarGridEl.style.gridTemplateRows = `repeat(${numRows}, 1fr)`;
    calendarGridEl.style.minHeight = ''; // Ensure dynamic height works

}

function createContextMenuElement() {
    const menu = document.createElement('div');
    menu.id = 'custom-context-menu';
    menu.className = 'context-menu';
    document.body.appendChild(menu);
    return menu;
}

function getActiveGroupId() {
    const activeLi = document.querySelector('.group-item.active');
    return activeLi?.dataset.groupId;
}

function getRelativeCoordsToContainer(x, y) {
    const container = document.getElementById('event-panels-container');
    const rect = container.getBoundingClientRect();
    const scale = getCurrentZoomScale();
    return {
        x: (x - rect.left) / scale,
        y: (y - rect.top) / scale
    };
}

function handleContextAction(label, x, y, nodeId) {
    const groupId = getActiveGroupId();
    const { x: relX, y: relY } = getRelativeCoordsToContainer(x, y);

    if (label === 'Create Node') {
        createNodeAt(relX, relY, groupId);
    } else if (label === 'Create Event on Node') {
        createEventAt(relX, relY, groupId, nodeId);
    } else if (label === 'Create Event (Unattached)') {
        createEventAt(relX, relY, groupId, null);
    }
}

export function showContextMenu({ x, y, onNode, nodeId }) {
    let menu = document.getElementById('custom-context-menu');
    if (!menu) menu = createContextMenuElement();

    menu.innerHTML = '';
    const options = onNode
        ? ['Create Event on Node']
        : ['Create Node', 'Create Event (Unattached)'];

    options.forEach(label => {
        const option = document.createElement('div');
        option.className = 'context-menu-option';
        option.textContent = label;
        option.onclick = () => {
            menu.style.display = 'none';
            handleContextAction(label, x, y, nodeId);
        };
        menu.appendChild(option);
    });

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = 'block';
}

async function createNodeAt(x, y, groupId) {
    try {
        const res = await fetch(`/api/groups/${groupId}/nodes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                label: "New Node",
                x: x,
                y: y
            })
        });
        if (!res.ok) throw new Error("Node creation failed");
        const node = await res.json();
        const el = createNodeElement(node);
        document.getElementById('event-panels-container').appendChild(el);
    } catch (err) {
        console.error(err);
    }
}

async function createEventAt(x, y, groupId, nodeId = null) {
    try {
        // Ensure date is sent in ISO format
        const eventData = {
            title: "New Event",
            date: new Date().toISOString(),
            location: "TBD",
            description: "Description goes here",
            x: x, // Use relative X
            y: y, // Use relative Y
            node_id: nodeId
        };

        const res = await fetch(`/api/groups/${groupId}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData)
        });

        if (!res.ok) {
             const errorData = await res.json().catch(() => ({ detail: 'Unknown error' }));
             throw new Error(`Event creation failed: ${errorData.detail || res.statusText}`);
        }

        const event = await res.json();
        event.date = new Date(event.date); // Parse ISO string to Date object for display
        const el = createEventPanel(event);

        const container = document.getElementById('event-panels-container');
        if (!container) throw new Error("Event container not found");

        container.appendChild(el);

        // --- Trigger Layout Update ---
        if (nodeId) {
            const nodeEl = container.querySelector(`.event-node[data-node-id="${nodeId}"]`);
            if (nodeEl) {
                const nodePanels = container.querySelectorAll(`.event-panel[data-snapped-to-node="${nodeId}"]`);
                // Layout WITH transition after adding a new event
                layoutEventsAroundNodeDOM(nodeEl, Array.from(nodePanels), true);
            } else {
                console.warn(`Node element with ID ${nodeId} not found for layout.`);
            }
        }
        // No else needed, unattached events just use their x, y

    } catch (err) {
        console.error("Error creating event:", err);
        alert(`Failed to create event: ${err.message}`); // Show error to user
    }
}