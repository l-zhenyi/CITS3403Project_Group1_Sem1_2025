// eventRenderer.js
import { groupsData, allEventsData, eventsByDate } from './dataHandle.js';
import { setupParallax, destroyParallax } from './parallax.js';

const eventPanelsContainer = document.getElementById('event-panels-container');
const calendarMonthYearEl = document.getElementById('calendar-month-year');
const calendarGridEl = document.getElementById('calendar-grid');
const eventListContainer = document.getElementById('event-list-container');
const eventCollageArea = document.getElementById('event-collage');
const eventsViewArea = document.getElementById('events-view');

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
    destroyParallax();

    const container = document.getElementById('event-panels-container');
    const collage = document.getElementById('event-collage');
    if (!container || !collage) return;

    const group = groupsData.find(g => g.id === groupId);
    if (!group || !group.events.length) {
        container.innerHTML = '<p class="no-events-message">No events for this group.</p>';
        return;
    }

    container.innerHTML = '';

    const verticalSpacing = 140;
    const horizontalOffsets = ['12%', '40%', '68%']; // loose 3-col layout
    const estimatedHeight = 100 + group.events.length * verticalSpacing * 0.75;
    container.style.minHeight = `${Math.max(400, estimatedHeight)}px`;

    group.events.sort((a, b) => a.date - b.date);

    group.events.forEach((event, index) => {
        const panel = document.createElement('div');
        panel.className = 'event-panel';

        const dateText = event.formatted_date || formatEventDateForDisplay(event.date);
        const rotateDeg = (Math.random() * 10 - 5).toFixed(1); // -5° to +5°
        const left = horizontalOffsets[index % horizontalOffsets.length];
        const top = `${60 + Math.floor(index / 3) * verticalSpacing}px`;
        const baseTransform = `rotate(${rotateDeg}deg)`;

        panel.innerHTML = `
            ${event.image_url ? `<img src="${event.image_url}" class="event-image">` : ''}
            <h3>${event.title}</h3>
            <p class="event-details">${dateText} ${event.cost_display ? `| ${event.cost_display}` : ''}</p>
            ${event.location ? `<p class="event-details">📍 ${event.location}</p>` : ''}
            ${event.rsvp_status ? `<p class="event-rsvp">You are ${event.rsvp_status}</p>` : ''}
            <div class="event-actions">
                <button class="button accept">Accept</button>
                <button class="button decline">Decline</button>
            </div>
        `;

        panel.style.position = 'absolute';
        panel.style.left = left;
        panel.style.top = top;
        panel.style.transform = baseTransform;
        panel.dataset.originalTransform = baseTransform;

        container.appendChild(panel);
    });

    setupParallax('groups');
}

/**
 * Renders the calendar grid for the specified year and month.
 * Assumes calendarGridEl and calendarMonthYearEl are valid DOM elements.
 * Assumes eventsByDate is an accessible object mapping 'YYYY-MM-DD' strings to event arrays.
 *
 * @param {number} year The full year (e.g., 2024)
 * @param {number} month The month index (0-11)
 */
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
    const daysFromPrevMonth = firstDayWeekday === 0 ? 6 : firstDayWeekday; // Adjust if your week starts Monday (0 = Sun)
    // NOTE: Standard getDay() is 0=Sunday. If your CSS grid starts Monday, adjust logic.
    // Assuming standard 0=Sunday start for grid columns:
    for (let i = 0; i < firstDayWeekday; i++) { // Use original firstDayWeekday if Sunday is col 1
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

    // **Crucial Part:** Set grid-template-rows using fractional units (fr).
    calendarGridEl.style.gridTemplateRows = `repeat(${numRows}, 1fr)`;

    // **REMOVE** setting height: 100% - let flex-grow handle it.
    // calendarGridEl.style.height = '100%'; // <<< REMOVE THIS LINE

    // **Ensure** any previous min-height is cleared (good practice).
    calendarGridEl.style.minHeight = '';

    // Add a class to the parent if needed for styling, e.g., based on row count
    // calendarGridEl.parentElement.classList.toggle('has-6-rows', numRows === 6);
    // calendarGridEl.parentElement.classList.toggle('has-5-rows', numRows === 5);
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