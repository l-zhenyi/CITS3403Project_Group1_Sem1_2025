// eventRenderer.js
import { groupsData, allEventsData, eventsByDate } from './dataHandle.js';

const eventPanelsContainer = document.getElementById('event-panels-container');
const calendarMonthYearEl = document.getElementById('calendar-month-year');
const calendarGridEl = document.getElementById('calendar-grid');
const eventListContainer = document.getElementById('event-list-container');
const collageViewport = document.getElementById('collage-viewport');

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

    // No dragging for event panels
    return panel;
}

// --- Dragging Functions ---
function makeDraggable(element, isNode = false) {
    if (!isNode) return;

    let isDragging = false;
    let startX, startY, elementStartX, elementStartY;

    element.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        isDragging = true;
        element.classList.add('dragging');
        element.style.zIndex = 1000;

        const containerRect = eventPanelsContainer.getBoundingClientRect();
        const currentScale = getCurrentZoomScale();
        const elementRect = element.getBoundingClientRect();

        startX = e.pageX;
        startY = e.pageY;
        elementStartX = (elementRect.left - containerRect.left) / currentScale;
        elementStartY = (elementRect.top - containerRect.top) / currentScale;

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
    }

    function onMouseUp(e) {
        if (!isDragging) return;
        isDragging = false;
        element.classList.remove('dragging');
        element.style.zIndex = 5;

        document.removeEventListener('mousemove', onMouseMove);

        const finalX = parseFloat(element.style.left || 0);
        const finalY = parseFloat(element.style.top || 0);

        const nodeId = element.dataset.nodeId;
        fetch(`/api/nodes/${nodeId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ x: finalX, y: finalY })
        }).catch(err => console.warn("Failed to update node position:", err));
    }
}

function getCurrentZoomScale() {
    if (!eventPanelsContainer) return 1;
    const transform = eventPanelsContainer.style.transform;
    const match = transform.match(/scale\(([\d.]+)\)/);
    return match ? parseFloat(match[1]) : 1;
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

    const { events, event_nodes } = groupData;

    container.innerHTML = '';

    container.style.minWidth = '2000px';
    container.style.minHeight = '1600px';

    // --- Render Nodes ---
    event_nodes.forEach(node => {
        const nodeEl = createNodeElement(node);
        container.appendChild(nodeEl);
    });

    // --- Render Events ---
    events.forEach(event => {
        event.date = new Date(event.date);
        const panel = createEventPanel(event);
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

    makeDraggable(el, true);

    return el;
}