// eventRenderer.js
import { groupsData, allEventsData, eventsByDate } from './dataHandle.js';

const eventPanelsContainer = document.getElementById('event-panels-container');
const calendarMonthYearEl = document.getElementById('calendar-month-year');
const calendarGridEl = document.getElementById('calendar-grid');
const eventListContainer = document.getElementById('event-list-container');
const collageViewport = document.getElementById('collage-viewport');

// Radius to snap to node
const SNAP_RADIUS = 400; // Increased slightly for easier snapping
const SNAP_RING_RADIUS = 300; // radius from node center to snapped event center

function createEventPanel(event) {
    const panel = document.createElement('div');
    panel.className = 'event-panel';
    panel.dataset.eventId = event.id;

    const dateText = event.formatted_date || formatEventDateForDisplay(event.date);

    // Image element (covers entire panel)
    const image = document.createElement('img');
    image.className = 'event-image';
    image.alt = event.title;
    image.src = event.image_url || 'https://via.placeholder.com/150x150?text=Event';

    // Info overlay
    const infoOverlay = document.createElement('div');
    infoOverlay.className = 'event-info-overlay';
    infoOverlay.innerHTML = `
        <div class="event-name">${event.title}</div>
        ${event.location ? `<div class="event-location">📍 ${event.location}</div>` : ''}
        <div class="event-details">${dateText}${event.cost_display ? ` | ${event.cost_display}` : ''}</div>
    `;

    // Optional RSVP (can be styled later)
    if (event.rsvp_status) {
        const rsvp = document.createElement('div');
        rsvp.className = 'event-rsvp';
        rsvp.textContent = `You are ${event.rsvp_status}`;
        infoOverlay.appendChild(rsvp);
    }

    // Append everything to panel
    panel.appendChild(image);
    panel.appendChild(infoOverlay);

    // Optional buttons (kept invisible for now)
    const actions = document.createElement('div');
    actions.className = 'event-actions';
    actions.style.display = 'none'; // Hide for now
    actions.innerHTML = `
        <button class="button accept">Accept</button>
        <button class="button decline">Decline</button>
    `;
    panel.appendChild(actions);

    // Position
    panel.style.position = 'absolute';
    panel.style.left = `${event.x}px`;
    panel.style.top = `${event.y}px`;
    panel.dataset.isSnapped = "false";

    makeDraggable(panel);
    return panel;
}

// --- Dragging Functions ---
function makeDraggable(element, isNode = false) {
    let isDragging = false;
    let startX, startY, elementStartX, elementStartY; // Positions relative to container

    // Use transform for smoother movement if possible, fallback to left/top
    const useTransform = true;

    element.addEventListener('mousedown', (e) => {
        if (e.target !== element && !isNode) {
            if (!element.contains(e.target) || ['BUTTON', 'IMG', 'A'].includes(e.target.tagName)) return;
        }

        e.stopPropagation();
        isDragging = true;
        element.classList.add('dragging');
        element.classList.remove('snapped');
        element.dataset.isSnapped = "false";
        element.style.zIndex = isNode ? 5 : 1000;

        const containerRect = eventPanelsContainer.getBoundingClientRect();
        const currentScale = getCurrentZoomScale();

        const elementRect = element.getBoundingClientRect();

        // Positions relative to the container, scaled
        startX = e.pageX;
        startY = e.pageY;

        elementStartX = (elementRect.left - containerRect.left) / currentScale;
        elementStartY = (elementRect.top - containerRect.top) / currentScale;

        // Clear transform if exists
        element.style.transform = '';

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp, { once: true });
    });

    function onMouseMove(e) {
        if (!isDragging) return;

        const scale = getCurrentZoomScale();
        const dx = (e.pageX - startX) / scale;
        const dy = (e.pageY - startY) / scale;

        const newX = elementStartX + dx;
        const newY = elementStartY + dy;

        element.style.left = `${newX}px`;
        element.style.top = `${newY}px`;

        // --- Snapping PREVIEW (only for event panels, not nodes) ---
        if (!isNode) {
            const closestNode = findClosestNode(element);
            if (closestNode.node && closestNode.distance < SNAP_RADIUS) {
                element.classList.add('snapped');
            } else {
                element.classList.remove('snapped');
            }
        }
    }

    function onMouseUp(e) {
        if (!isDragging) return;
        isDragging = false;
        element.classList.remove('dragging');
        element.style.zIndex = isNode ? 5 : 10; // Reset z-index (nodes below events)

        document.removeEventListener('mousemove', onMouseMove);
        // mouseup listener removed by {once: true}

        // --- Final Position & Snapping Logic ---
        // Get final position from transform or left/top
        let finalX, finalY;
        if (useTransform && element.style.transform) {
            const match = element.style.transform.match(/translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
            if (match) {
                finalX = parseFloat(match[1]);
                finalY = parseFloat(match[2]);
            } else { // Fallback
                finalX = parseFloat(element.style.left || 0);
                finalY = parseFloat(element.style.top || 0);
            }
        } else {
            finalX = parseFloat(element.style.left || 0);
            finalY = parseFloat(element.style.top || 0);
        }

        if (!isNode) {
            const eventId = element.dataset.eventId;
            if (eventId) {
                fetch(`/api/events/${eventId}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        x: finalX,
                        y: finalY
                    })
                }).then(res => {
                    if (!res.ok) {
                        console.warn("Failed to update event position");
                    }
                });
            }
        }

        // Update node position in data array
        if (isNode) {
            const nodeId = element.dataset.nodeId;
            const nodeData = eventNodes.find(n => n.id === nodeId);
            if (nodeData) {
                nodeData.x = finalX; // Store the final position
                nodeData.y = finalY;
                console.log(`Node ${nodeId} moved to ${finalX}, ${finalY}`);
                // Apply final position definitively (transform might reset otherwise)
                element.style.left = `${finalX}px`;
                element.style.top = `${finalY}px`;
                element.style.transform = ''; // Clear transform if setting left/top
            }
        } else {
            // Check for snapping for EVENT panels
            const closestNode = findClosestNode(element);
            if (closestNode.node && closestNode.distance < SNAP_RADIUS) {
                snapToNode(element, closestNode.node);
            } else {
                // Not snapping, just record its free position
                element.dataset.isSnapped = "false";
                element.dataset.snappedToNode = "";
                // Update event data if needed (e.g., for saving state)
                // findEventById(element.dataset.eventId).x = finalX;
                // findEventById(element.dataset.eventId).y = finalY;

                // Apply final position definitively
                element.style.left = `${finalX}px`;
                element.style.top = `${finalY}px`;
                element.style.transform = ''; // Clear transform
            }
        }
    }
}

function getCurrentZoomScale() {
    if (!eventPanelsContainer) return 1;
    const transform = eventPanelsContainer.style.transform;
    const match = transform.match(/scale\(([\d.]+)\)/);
    return match ? parseFloat(match[1]) : 1;
}

function findClosestNode(eventElement) {
    const eventRect = eventElement.getBoundingClientRect(); // Position on screen
    const containerRect = eventPanelsContainer.getBoundingClientRect();
    const scale = getCurrentZoomScale();

    // Calculate event center relative to the SCALED container
    // Screen position - container screen position / scale = position within scaled container
    const eventCenterX = (eventRect.left + eventRect.width / 2 - containerRect.left) / scale;
    const eventCenterY = (eventRect.top + eventRect.height / 2 - containerRect.top) / scale;

    let closestNode = null;
    let minDistance = Infinity;

    const nodes = eventPanelsContainer.querySelectorAll('.event-node');
    nodes.forEach(node => {
        // Node position is stored in its style.left/top (relative to container)
        const nodeX = parseFloat(node.style.left || 0);
        const nodeY = parseFloat(node.style.top || 0);

        // No need for getBoundingClientRect for nodes if using style.left/top
        // const nodeCenterX = nodeX + node.offsetWidth / 2; // Approximate center
        // const nodeCenterY = nodeY + node.offsetHeight / 2;
        const nodeCenterX = nodeX; // Style.left/top IS the center due to transform translate -50%
        const nodeCenterY = nodeY;

        const distance = Math.sqrt(
            Math.pow(eventCenterX - nodeCenterX, 2) +
            Math.pow(eventCenterY - nodeCenterY, 2)
        );

        if (distance < minDistance) {
            minDistance = distance;
            closestNode = node;
        }
    });

    return { node: closestNode, distance: minDistance };
}

function snapToNode(eventElement, nodeElement) {
    const nodeId = nodeElement.dataset.nodeId;
    const nodeX = parseFloat(nodeElement.style.left || 0);
    const nodeY = parseFloat(nodeElement.style.top || 0);

    const eventRect = eventElement.getBoundingClientRect();
    const containerRect = eventPanelsContainer.getBoundingClientRect();
    const scale = getCurrentZoomScale();

    const eventCenterX = (eventRect.left + eventRect.width / 2 - containerRect.left) / scale;
    const eventCenterY = (eventRect.top + eventRect.height / 2 - containerRect.top) / scale;

    const dx = eventCenterX - nodeX;
    const dy = eventCenterY - nodeY;
    const lockedAngle = Math.atan2(dy, dx); // This angle should be respected

    eventElement.classList.add('snapped');
    eventElement.dataset.isSnapped = "true";
    eventElement.dataset.snappedToNode = nodeId;
    eventElement.style.zIndex = 9;

    // Gather snapped events
    const snappedEvents = Array.from(eventPanelsContainer.querySelectorAll(`.event-panel.snapped[data-snapped-to-node="${nodeId}"]`));

    // Remove duplicates of this event (if already in DOM from previous snap)
    const uniqueEvents = [...new Set(snappedEvents)];
    const otherEvents = uniqueEvents.filter(e => e !== eventElement);

    // Total number of snapped events (including dragged one)
    const total = otherEvents.length + 1;
    const angleStep = (2 * Math.PI) / total;

    // We'll position others evenly around the locked angle
    let currentAngle = lockedAngle - angleStep * Math.floor(total / 2);

    let placed = 0;
    for (let i = 0; i < total; i++) {
        let el;
        if (i === Math.floor(total / 2)) {
            el = eventElement; // Dragged one goes in the center
        } else {
            el = otherEvents[placed++];
        }

        const elWidth = el.offsetWidth;
        const elHeight = el.offsetHeight;

        const targetX = nodeX + SNAP_RING_RADIUS * Math.cos(currentAngle) - elWidth / 2;
        const targetY = nodeY + SNAP_RING_RADIUS * Math.sin(currentAngle) - elHeight / 2;

        el.style.transition = 'left 0.3s ease-out, top 0.3s ease-out';
        el.style.left = `${targetX}px`;
        el.style.top = `${targetY}px`;
        el.style.transform = '';

        currentAngle += angleStep;

        setTimeout(() => {
            el.style.transition = '';
        }, 300);
    }
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
    const container = document.getElementById('event-panels-container');
    if (!container) return;

    const res = await fetch(`/api/groups/${groupId}/events`);
    const groupData = await res.json();

    const { events, event_nodes } = groupData; // assume your API returns this structure

    container.innerHTML = ''; // Clear previous content

    // Optional: Add min size for the floating layout
    container.style.minWidth = '2000px';
    container.style.minHeight = '1600px';

    // --- Render Nodes ---
    event_nodes.forEach(node => {
        const nodeEl = createNodeElement(node); // already defined
        container.appendChild(nodeEl);
    });

    // --- Render Events ---
    events.forEach(event => {
        event.date = new Date(event.date);
        const panel = createEventPanel(event); // uses event.x and event.y
        container.appendChild(panel);
    });
    const isMobile = window.innerWidth <= 768;
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

export function createNodeElement(node) {
    const el = document.createElement('div');
    el.className = 'event-node';
    el.dataset.nodeId = node.id;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.textContent = node.label || 'Untitled';

    // Optional: Make draggable (you likely already have this logic)
    makeDraggable(el);

    return el;
}