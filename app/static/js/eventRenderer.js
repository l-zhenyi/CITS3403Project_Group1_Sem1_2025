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


// createEventPanel function remains mostly the same
// (Ensure data-snapped-to-node is correctly set as before)
function createEventPanel(event) {
    const panel = document.createElement('div');
    panel.className = 'event-panel';

    // Basic ID and node ID
    if (event.id) panel.dataset.eventId = event.id;
    if (event.node_id !== null && event.node_id !== undefined && String(event.node_id).trim() !== '') {
        panel.dataset.snappedToNode = String(event.node_id);
    }

    // Save the actual event object directly (attach it neatly)
    panel._eventData = event;

    // Basic overlay for quick info
    const dateText = event.formatted_date || (event.date ? formatEventDateForDisplay(new Date(event.date)) : 'No Date');
    const image = document.createElement('img');
    image.className = 'event-image';
    image.alt = event.title || 'Event Image';
    image.src = event.image_url || 'https://via.placeholder.com/150x150?text=Event';
    image.onerror = () => { image.src = 'https://via.placeholder.com/150x150?text=Error'; };

    const infoOverlay = document.createElement('div');
    infoOverlay.className = 'event-info-overlay';
    infoOverlay.innerHTML = `
        <div class="event-name">${event.title || 'Untitled Event'}</div>
        <div class="event-overlay-details">
          <p>📅 <strong>${dateText}</strong></p>
          ${event.location ? `<p>📍 <strong>${event.location}</strong></p>` : ''}
          ${event.cost_display ? `<p>💲 <strong>${event.cost_display}</strong></p>` : ''}
        </div>
    `;

    if (event.rsvp_status) {
        const rsvp = document.createElement('div');
        rsvp.className = 'event-rsvp';
        rsvp.textContent = `You are ${event.rsvp_status}`;
        infoOverlay.appendChild(rsvp);
    }

    panel.appendChild(image);
    panel.appendChild(infoOverlay);

    panel.style.position = 'absolute';
    if (!panel.dataset.snappedToNode) {
        panel.style.left = `${Number(event.x || 0)}px`;
        panel.style.top = `${Number(event.y || 0)}px`;
    }

    return panel;
}

// --- Fully replaced makeDraggableNode ---
function makeDraggableNode(element) {
    let isDragging = false;
    let startX, startY, initialNodeLeft, initialNodeTop;

    function onMouseMove(e) {
        if (!isDragging) return;
        e.preventDefault();
        const scale = getCurrentZoomScale();
        const dx = (e.pageX - startX) / scale;
        const dy = (e.pageY - startY) / scale;
        const newX = initialNodeLeft + dx;
        const newY = initialNodeTop + dy;
        element.style.left = `${newX}px`;
        element.style.top = `${newY}px`;

        const instance = layoutInstances.get(element);
        if (instance) {
            instance.updateLayout();
        }
    }

    function onMouseUp() {
        if (!isDragging) return;
        isDragging = false;
        element.classList.remove('dragging');
        element.style.zIndex = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        const instance = layoutInstances.get(element);
        if (instance) {
            instance.updateLayout();
        }

        const nodeId = element.dataset.nodeId;
        if (nodeId) {
            const x = parseFloat(element.style.left) || 0;
            const y = parseFloat(element.style.top) || 0;
            fetch(`/api/nodes/${nodeId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ x, y })
            })
                .then(res => {
                    if (!res.ok) console.error(`Failed to update node ${nodeId} position.`);
                    return res.json();
                })
                .then(data => {
                    console.log(`Node ${nodeId} position updated`, data);
                })
                .catch(err => console.error(`Error updating node ${nodeId}:`, err));
        }
    }

    element.addEventListener('mousedown', (e) => {
        if (e.target !== element) return;
        e.stopPropagation();
        isDragging = true;
        element.classList.add('dragging');
        element.style.zIndex = 1000;
        startX = e.pageX;
        startY = e.pageY;
        initialNodeLeft = parseFloat(element.style.left) || 0;
        initialNodeTop = parseFloat(element.style.top) || 0;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

function getCurrentZoomScale() {
    // If eventPanelsContainer doesn't exist yet, return 1
    if (!eventPanelsContainer) return 1;
    const transform = eventPanelsContainer.style.transform;
    const match = transform.match(/scale\(([\d.]+)\)/);
    return match ? parseFloat(match[1]) : 1;
}

// createNodeElement remains the same
export function createNodeElement(node) {
    const el = document.createElement('div');
    el.className = 'event-node';
    el.id = `node-${node.id}`;
    el.dataset.nodeId = node.id;
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



// --- Modified renderGroupEvents ---
export async function renderGroupEvents(groupId) {
    if (!eventPanelsContainer) return;

    try {
        const res = await fetch(`/api/groups/${groupId}/events`);
        if (!res.ok) throw new Error(`Failed to fetch group events: ${res.statusText}`);
        const groupData = await res.json();
        const { nodes } = groupData;
        const events = nodes.flatMap(node => node.events || []);

        // --- 3a. Cleanup old instances BEFORE clearing DOM ---
        console.log(`[renderGroupEvents] Cleaning up ${layoutInstances.size} old layout instances.`);
        layoutInstances.forEach((instance, nodeEl) => {
            // Check if the nodeEl is still within the container we are about to clear
            if (eventPanelsContainer.contains(nodeEl)) {
                console.log(` -> Destroying instance for node:`, nodeEl);
                instance.destroy(); // Call the class's cleanup method
            } else {
                console.warn(" -> Stale instance found for node not in container?", nodeEl);
            }
        });
        layoutInstances.clear(); // Clear the map
        // --- End Cleanup ---

        eventPanelsContainer.innerHTML = ''; // Clear previous DOM content

        const renderedNodes = {}; // Keep track of newly rendered node elements

        // --- Render Nodes ---
        nodes.forEach(node => {
            const nodeEl = createNodeElement(node);
            eventPanelsContainer.appendChild(nodeEl);
            renderedNodes[node.id] = nodeEl;
        });

        // --- Render Events ---
        events.forEach(event => {
            event.date = event.date ? new Date(event.date) : null;
            const panel = createEventPanel(event);
            eventPanelsContainer.appendChild(panel);
        });

        // --- 3b. Initialize or Update Layout Instances ---
        console.log("[renderGroupEvents] Initializing layout instances...");
        Object.entries(renderedNodes).forEach(([nodeId, nodeEl]) => {
            // Find all event panels *just rendered* that are snapped to this node
            const panelsForNode = Array.from(
                eventPanelsContainer.querySelectorAll(`.event-panel[data-snapped-to-node="${nodeId}"]`)
            );

            if (panelsForNode.length > 0) {
                console.log(` -> Found ${panelsForNode.length} panels for node ${nodeId}. Creating layout instance.`);
                // Create a NEW instance for this node element
                const newInstance = new OrbitLayoutManager(nodeEl, panelsForNode);
                layoutInstances.set(nodeEl, newInstance); // Store the instance
            } else {
                // console.log(` -> No panels found for node ${nodeId}. Skipping layout instance.`);
            }
        });
        console.log(`[renderGroupEvents] Layout initialization complete. ${layoutInstances.size} instances active.`);


    } catch (error) {
        console.error("Error rendering group events:", error);
        eventPanelsContainer.innerHTML = `<p class="error-message">Could not load events for this group.</p>`;
        // Also clear instances map in case of error after some were created but before full render
        layoutInstances.forEach(instance => instance.destroy());
        layoutInstances.clear();
    }
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

function handleContextAction(label, x, y, id) {
    const groupId = getActiveGroupId();
    const { x: relX, y: relY } = getRelativeCoordsToContainer(x, y);

    // Map context menu options to actions, generic by type/id
    const actions = {
        'Create Node': () => createNodeAt(relX, relY, groupId),
        'Create Event on Node': () => createEvent(groupId, id),
        'Rename Event': () => renameEvent(id),
        'Delete Event': () => deleteEvent(id),
        'Rename Node': () => renameNode(id),
        'Delete Node': () => deleteNode(id)
    };
    const action = actions[label];
    if (action) action();
}

// type: 'event-panel', 'event-node', 'canvas', etc.
export function showContextMenu({ x, y, type, id }) {
    let menu = document.getElementById('custom-context-menu');
    if (!menu) menu = createContextMenuElement();

    menu.innerHTML = '';
    // Option mapping by type
    const optionsMap = {
        'event-panel': ['Rename Event', 'Delete Event'],
        'event-node': ['Create Event on Node', 'Rename Node', 'Delete Node'],
        'canvas': ['Create Node']
    };
    const options = optionsMap[type] || [];

    options.forEach(label => {
        const option = document.createElement('div');
        option.className = 'context-menu-option';
        option.textContent = label;
        option.onclick = () => {
            menu.style.display = 'none';
            handleContextAction(label, x, y, id);
        };
        menu.appendChild(option);
    });

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = 'block';
}

function renameEvent(eventId) {
    const panel = document.querySelector(`.event-panel[data-event-id="${eventId}"]`);
    if (!panel) return;
    const currentName = panel.querySelector('.event-name')?.textContent || '';
    const newName = prompt('Rename event:', currentName);
    if (!newName) return;

    fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newName })
    }).then(res => res.json())
        .then(data => {
            const nameEl = panel.querySelector('.event-name');
            if (nameEl) nameEl.textContent = data.title;
        });
}

function deleteEvent(eventId) {
    console.log(`Deleting event with ID: ${eventId}`);
    const panel = document.querySelector(`.event-panel[data-event-id="${eventId}"]`);
    if (!panel) return;

    fetch(`/api/events/${eventId}`, { method: 'DELETE' })
        .then(res => {
            if (!res.ok) throw new Error('Delete failed');
            return res.json(); // read the JSON response
        })
        .then(data => {
            if (data.success) panel.remove();
        })
        .catch(err => console.error('Failed to delete event:', err));
}

function renameNode(nodeId) {
    const panel = document.querySelector(`.event-node[data-node-id="${nodeId}"]`);
    if (!panel) return;
    const currentLabel = panel.textContent || '';
    const newLabel = prompt('Rename node:', currentLabel);
    if (!newLabel) return;

    fetch(`/api/nodes/${nodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel })
    }).then(res => res.json())
        .then(data => {
            panel.textContent = data.label;
        });
}

function deleteNode(nodeId) {
    const panel = document.querySelector(`.event-node[data-node-id="${nodeId}"]`);
    if (!panel) return;

    fetch(`/api/nodes/${nodeId}`, { method: 'DELETE' })
        .then(res => {
            if (!res.ok) throw new Error('Delete failed');
            return res.json();
        })
        .then(data => {
            if (data.success) panel.remove();
        })
        .catch(err => console.error('Failed to delete node:', err));
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

async function createEvent(groupId, nodeId = null) {
    try {
        const eventData = {
            title: "New Event", date: new Date().toISOString(), location: "TBD",
            description: "Description goes here", node_id: nodeId
        };

        const res = await fetch(`/api/groups/${groupId}/events`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData)
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ detail: 'Unknown error' }));
            throw new Error(`Event creation failed: ${errorData.detail || res.statusText}`);
        }

        const event = await res.json();
        event.date = new Date(event.date);
        const newPanel = createEventPanel(event); // Create the DOM element

        const container = document.getElementById('event-panels-container');
        if (!container) throw new Error("Event container not found");
        container.appendChild(newPanel); // Add to DOM

        // --- 5. Trigger Layout Update using Instance ---
        if (nodeId) {
            const nodeEl = container.querySelector(`.event-node[data-node-id="${nodeId}"]`);
            if (nodeEl) {
                const instance = layoutInstances.get(nodeEl);
                const updatedPanelsForNode = container.querySelectorAll(`.event-panel[data-snapped-to-node="${nodeId}"]`);
                const updatedPanelsArray = Array.from(updatedPanelsForNode);

                if (instance) {
                    // Instance exists, update it with the new list of panels
                    console.log(` -> Updating existing layout instance for node ${nodeId} with ${updatedPanelsArray.length} panels.`);
                    instance.updateLayout(updatedPanelsArray);
                } else {
                    // No instance existed (first event for this node?), create one
                    console.log(` -> Creating new layout instance for node ${nodeId} with ${updatedPanelsArray.length} panels.`);
                    const newInstance = new OrbitLayoutManager(nodeEl, updatedPanelsArray);
                    layoutInstances.set(nodeEl, newInstance);
                }
            } else {
                console.warn(`Node element with ID ${nodeId} not found for layout after creating event.`);
            }
        }
        // No layout needed for unattached events

    } catch (err) {
        console.error("Error creating event:", err);
        alert(`Failed to create event: ${err.message}`);
    }
}