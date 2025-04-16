// eventRenderer.js
import { groupsData, allEventsData, eventsByDate, eventNodes} from './dataHandle.js';

const eventPanelsContainer = document.getElementById('event-panels-container');
const calendarMonthYearEl = document.getElementById('calendar-month-year');
const calendarGridEl = document.getElementById('calendar-grid');
const eventListContainer = document.getElementById('event-list-container');
const collageViewport = document.getElementById('collage-viewport');

// Radius to snap to node
const SNAP_RADIUS = 120; // Increased slightly for easier snapping
const REPEL_DISTANCE = 100; // How far to push other events
const REPEL_STRENGTH = 0.6; // How strongly to push (0-1)

// --- Node Functions ---
function renderEventNodes(container) {
    if (!container) return;
    container.querySelectorAll('.event-node').forEach(el => el.remove()); // Clear old nodes first
    eventNodes.forEach(node => {
        const nodeEl = createNodeElement(node);
        container.appendChild(nodeEl);
    });
}

function createNodeElement(node) {
    const nodeEl = document.createElement('div');
    nodeEl.className = 'event-node';
    nodeEl.dataset.nodeId = node.id;
    nodeEl.textContent = node.label;
    nodeEl.style.position = 'absolute';
    // Use transform for centering, makes position logic easier
    nodeEl.style.left = `${node.x}px`;
    nodeEl.style.top = `${node.y}px`;

    // Make nodes draggable
    makeDraggable(nodeEl, true); // Pass true to indicate it's a node
    return nodeEl;
}

// --- Event Functions ---
function createEventPanel(event) {
    const panel = document.createElement('div');
    panel.className = 'event-panel';
    panel.dataset.eventId = event.id; // Add event ID for reference

    const dateText = event.formatted_date || formatEventDateForDisplay(event.date);

    panel.innerHTML = `
        ${event.image_url ? `<img src="${event.image_url}" class="event-image" alt="${event.title}">` : ''}
        <h3>${event.title}</h3>
        <p class="event-details">${dateText} ${event.cost_display ? `| ${event.cost_display}` : ''}</p>
        ${event.location ? `<p class="event-details">📍 ${event.location}</p>` : ''}
        ${event.rsvp_status ? `<p class="event-rsvp">You are ${event.rsvp_status}</p>` : ''}
        <div class="event-actions">
            <button class="button accept">Accept</button>
            <button class="button decline">Decline</button>
        </div>
    `;

    // Initial random position (or load saved position later)
    panel.style.position = 'absolute';
    panel.style.left = `${event.x || Math.random() * (eventPanelsContainer.offsetWidth * 0.8 || 1600) + 50}px`;
    panel.style.top = `${event.y || Math.random() * (eventPanelsContainer.offsetHeight * 0.8 || 1200) + 50}px`;
    panel.dataset.isSnapped = "false"; // Track snap state

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
        // Prevent dragging text, images, buttons etc. inside the panel/node
        if (e.target !== element && !isNode) {
            // Allow dragging node even if clicking text inside
            if (!element.contains(e.target) || e.target.tagName === 'BUTTON' || e.target.tagName === 'IMG' || e.target.tagName === 'A') {
                 return;
            }
        }
        // Prevent canvas drag from starting
        e.stopPropagation();

        isDragging = true;
        element.classList.add('dragging');
        element.classList.remove('snapped'); // Unsnap visually when drag starts
        element.dataset.isSnapped = "false";
        element.style.zIndex = 1000; // Bring to front while dragging

        const containerRect = eventPanelsContainer.getBoundingClientRect();
        const currentScale = getCurrentZoomScale();

        // Calculate starting position relative to the container, considering scale
        startX = e.pageX;
        startY = e.pageY;

        if (useTransform && element.style.transform) {
            const match = element.style.transform.match(/translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
            if (match) {
                elementStartX = parseFloat(match[1]);
                elementStartY = parseFloat(match[2]);
            } else { // Fallback if transform is not in expected format
                elementStartX = parseFloat(element.style.left || 0);
                elementStartY = parseFloat(element.style.top || 0);
                element.style.transform = `translate(${elementStartX}px, ${elementStartY}px)`; // Initialize transform
            }
        } else {
            elementStartX = parseFloat(element.style.left || 0);
            elementStartY = parseFloat(element.style.top || 0);
            if(useTransform) element.style.transform = `translate(${elementStartX}px, ${elementStartY}px)`; // Initialize transform
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp, { once: true }); // Use once to auto-remove listener
    });
    
    function onMouseMove(e) {
        if (!isDragging) return;

        const currentScale = getCurrentZoomScale();
        const dx = (e.pageX - startX) / currentScale; // Adjust delta by scale
        const dy = (e.pageY - startY) / currentScale;

        const newX = elementStartX + dx;
        const newY = elementStartY + dy;

        if(useTransform) {
            element.style.transform = `translate(${newX}px, ${newY}px)`;
            // Also update left/top slightly for potential fallback or state saving
             element.style.left = `${newX}px`;
             element.style.top = `${newY}px`;
        } else {
            element.style.left = `${newX}px`;
            element.style.top = `${newY}px`;
        }


        // --- Snapping PREVIEW (Visual cue during drag, no state change) ---
        if (!isNode) {
            const closestNode = findClosestNode(element);
            if (closestNode.node && closestNode.distance < SNAP_RADIUS) {
                element.classList.add('snap-preview'); // Add visual cue class
            } else {
                element.classList.remove('snap-preview');
            }
        }
    }

    function onMouseUp(e) {
        if (!isDragging) return;
        isDragging = false;
        element.classList.remove('dragging', 'snap-preview');
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

function checkAndSnapToNode(eventElement) {
    const eventRect = eventElement.getBoundingClientRect();
    const eventCenterX = eventRect.left + eventRect.width / 2;
    const eventCenterY = eventRect.top + eventRect.height / 2;

    const eventContainer = document.getElementById('event-panels-container');
    if (!eventContainer) {
        console.error("Event panels container not found.");
        return;
    }

    const nodes = eventContainer.querySelectorAll('.event-node');
    nodes.forEach(node => {
        const nodeRect = node.getBoundingClientRect();
        const nodeCenterX = nodeRect.left + nodeRect.width / 2;
        const nodeCenterY = nodeRect.top + nodeRect.height / 2;

        const distance = Math.sqrt(
            Math.pow(eventCenterX - nodeCenterX, 2) +
            Math.pow(eventCenterY - nodeCenterY, 2)
        );

        if (distance <= SNAP_RADIUS) {
            // Snap logic
            snapToNode(eventElement, nodeCenterX, nodeCenterY);
        }
        else {
            // Un-snap logic
            eventElement.style.opacity = '1';
        }
    });
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
    console.log(`Snapping event ${eventElement.dataset.eventId} to node ${nodeElement.dataset.nodeId}`);
    eventElement.classList.add('snapped');
    eventElement.dataset.isSnapped = "true";
    eventElement.dataset.snappedToNode = nodeElement.dataset.nodeId;
    eventElement.style.zIndex = 9; // Ensure snapped events are below dragging ones but above nodes

    // --- Calculate Position & Repel ---
    const nodeX = parseFloat(nodeElement.style.left || 0);
    const nodeY = parseFloat(nodeElement.style.top || 0);
    const eventWidth = eventElement.offsetWidth;
    const eventHeight = eventElement.offsetHeight;

    // Initial position near the node before repulsion
    const initialAngle = Math.random() * 2 * Math.PI;
    const initialRadius = SNAP_RADIUS * 0.6; // Start closer
    let targetX = nodeX + initialRadius * Math.cos(initialAngle) - eventWidth / 2;
    let targetY = nodeY + initialRadius * Math.sin(initialAngle) - eventHeight / 2;


    // --- Repulsion Logic ---
    const otherSnappedEvents = eventPanelsContainer.querySelectorAll(`.event-panel.snapped[data-snapped-to-node="${nodeElement.dataset.nodeId}"]`);

    otherSnappedEvents.forEach(otherEvent => {
        if (otherEvent === eventElement) return; // Don't repel self

        const otherRect = otherEvent.getBoundingClientRect(); // Use screen positions for relative calc
        const eventRect = eventElement.getBoundingClientRect();
        const scale = getCurrentZoomScale();

        // Centers relative to scaled container origin
        const otherCenterX = (otherRect.left + otherRect.width / 2 - eventPanelsContainer.getBoundingClientRect().left) / scale;
        const otherCenterY = (otherRect.top + otherRect.height / 2 - eventPanelsContainer.getBoundingClientRect().top) / scale;
        const eventCenterX = (eventRect.left + eventRect.width / 2 - eventPanelsContainer.getBoundingClientRect().left) / scale + (targetX - parseFloat(eventElement.style.left || 0)); // Adjust for target pos
        const eventCenterY = (eventRect.top + eventRect.height / 2 - eventPanelsContainer.getBoundingClientRect().top) / scale + (targetY - parseFloat(eventElement.style.top || 0)); // Adjust for target pos


        const dx = eventCenterX - otherCenterX;
        const dy = eventCenterY - otherCenterY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < REPEL_DISTANCE && distance > 0) {
            const overlap = REPEL_DISTANCE - distance;
            const pushFactor = (overlap / distance) * REPEL_STRENGTH; // Push stronger if closer
            const pushX = dx * pushFactor;
            const pushY = dy * pushFactor;

            // Apply push to the event being snapped
            targetX += pushX;
            targetY += pushY;

            // Optionally, push the *other* event slightly too
            const otherTargetX = parseFloat(otherEvent.style.left || 0) - pushX * 0.3; // Weaker counter-push
            const otherTargetY = parseFloat(otherEvent.style.top || 0) - pushY * 0.3;
            otherEvent.style.transition = 'left 0.2s ease-out, top 0.2s ease-out'; // Smooth adjustment
            otherEvent.style.left = `${otherTargetX}px`;
            otherEvent.style.top = `${otherTargetY}px`;
            otherEvent.style.transform = ''; // Clear transform if setting left/top
            // Remove transition after a short delay
             setTimeout(() => { otherEvent.style.transition = ''; }, 200);
        }
    });


    // Apply the final (potentially repelled) position
    eventElement.style.transition = 'left 0.25s ease-out, top 0.25s ease-out'; // Smooth snap animation
    eventElement.style.left = `${targetX}px`;
    eventElement.style.top = `${targetY}px`;
    eventElement.style.transform = ''; // Clear transform when snapping to left/top

    // Remove transition after animation
    setTimeout(() => {
        eventElement.style.transition = '';
        // Update event data if needed
        // findEventById(eventElement.dataset.eventId).x = targetX;
        // findEventById(eventElement.dataset.eventId).y = targetY;
    }, 250);
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

export function renderGroupEvents(groupId) {
    const container = document.getElementById('event-panels-container');
    if (!container) {
        console.error("Event panels container not found.");
        return;
    }

    const group = groupsData.find(g => g.id === groupId);
    if (!group) {
        container.innerHTML = '<p class="no-events-message">Group not found.</p>';
        return;
    }

    // --- Mobile vs Desktop Check ---
    const isMobile = window.innerWidth <= 768;

    // Clear container content (Events AND Nodes)
    container.innerHTML = '';

    if (!group.events.length && isMobile) {
         container.innerHTML = '<p class="no-events-message">No events for this group.</p>';
         return;
     }


    if (!isMobile) {
        // --- Desktop Collage Layout ---
        // Ensure container has a minimum size if needed, but allow it to grow
        container.style.minWidth = '2000px';
        container.style.minHeight = '1600px';

        // Render Nodes first (so they are behind events by default)
        renderEventNodes(container);

        if (!group.events.length) {
             container.innerHTML += '<p class="no-events-message" style="position:absolute; top: 50px; left: 50px; color: white;">No events for this group.</p>'; // Add message if no events
             return;
        }


        group.events.sort((a, b) => a.date - b.date); // Optional sort

        group.events.forEach((event) => {
            const panel = createEventPanel(event);
            container.appendChild(panel);
            // If event has saved snapped state, apply it visually (optional)
            // if (event.snappedToNodeId) {
            //     const nodeEl = container.querySelector(`.event-node[data-node-id="${event.snappedToNodeId}"]`);
            //     if (nodeEl) snapToNode(panel, nodeEl); // Re-snap without animation?
            // }
        });

    } else {
        // --- Mobile Stacked Layout ---
        container.style.minWidth = ''; // Reset desktop styles
        container.style.minHeight = '';

        if (!group.events.length) { // Already checked above, but safe
             container.innerHTML = '<p class="no-events-message">No events for this group.</p>';
             return;
        }

        group.events.sort((a, b) => a.date - b.date);

        group.events.forEach((event) => {
            // Create panel - CSS will handle stacking
            const panel = createEventPanel(event);
             // Reset potentially conflicting desktop styles from createEventPanel
            panel.style.position = 'relative'; // Override absolute
            panel.style.left = 'auto';
            panel.style.top = 'auto';
            panel.style.transform = '';
            panel.style.zIndex = 'auto';
            panel.classList.remove('snapped');
            panel.dataset.isSnapped = "false";
            container.appendChild(panel);
        });
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