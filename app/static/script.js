document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const plannerPane = document.getElementById('planner-pane');
    const groupListArea = document.querySelector('.group-list-area');
    const eventCollageArea = document.getElementById('event-collage');
    const eventPanelsContainer = document.getElementById('event-panels-container');
    const calendarViewArea = document.getElementById('calendar-view');
    const eventsViewArea = document.getElementById('events-view');
    const groupListUL = groupListArea?.querySelector('ul');
    const backButtonGroup = document.getElementById('back-to-groups-button');
    const activeGroupNameEl = document.getElementById('active-group-name');
    const activeGroupAvatarEl = document.getElementById('active-group-avatar');
    const groupsTab = document.getElementById('groups-tab');
    const calendarTab = document.getElementById('calendar-tab');
    const eventsTab = document.getElementById('events-tab');
    const viewTabs = document.querySelectorAll('.view-tab');
    const calendarMonthYearEl = document.getElementById('calendar-month-year');
    const calendarGridEl = document.getElementById('calendar-grid');
    const prevMonthButton = document.getElementById('calendar-prev-month');
    const nextMonthButton = document.getElementById('calendar-next-month');
    const eventFilterBar = document.getElementById('event-filter-bar');
    const eventListContainer = document.getElementById('event-list-container');
    // Add Example Trigger Buttons (Place these in your HTML)
    const addGroupBtn = document.getElementById('add-group-btn'); // <button id="add-group-btn">Add Group</button>
    const addEventBtn = document.getElementById('add-event-btn'); // <button id="add-event-btn">Add Event</button>

    // --- State Variables ---
    let groupsData = [];
    let allEventsData = []; // Derived from groupsData
    let eventsByDate = {}; // Derived from groupsData
    let isMobile = window.innerWidth <= 768;
    let resizeTimer;
    let currentView = 'groups';
    let calendarDate = new Date();
    let currentEventFilter = 'upcoming';
    let panelData = [];
    let isParallaxSetup = false;
    let parallaxScrollHandler = null;

    // --- Utility ---
    // Simple unique ID generator for demo purposes
    function generateUniqueId(prefix = 'item') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    }

    function formatEventDateForDisplay(date) {
        if (!date || !(date instanceof Date) || isNaN(date)) return "Invalid Date";
        return date.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    }

    // --- Data Processing ---
    function loadData() {
        try {
            const groupDataElement = document.getElementById('group-data');
            if (groupDataElement) {
                groupsData = JSON.parse(groupDataElement.textContent || '[]');
                console.log(`Loaded ${groupsData.length} groups.`);
                 // Ensure all initial events have Date objects (if date_iso is present)
                 groupsData.forEach(group => {
                    if (group.events && Array.isArray(group.events)) {
                        group.events.forEach(event => {
                             if (event.date_iso && !event.date) { // Add Date object if missing
                                event.date = new Date(event.date_iso);
                            }
                        });
                    } else {
                        group.events = []; // Ensure events array exists
                    }
                 });
            } else {
                console.warn('Group data script tag not found. Starting empty.');
                groupsData = [];
            }
            // *** Initial processing of derived data ***
            processAllEvents();

        } catch (e) {
            console.error("Error parsing embedded JSON data:", e);
            groupsData = [];
            allEventsData = [];
            eventsByDate = {};
        }
    }

    /**
     * Regenerates allEventsData and eventsByDate from the master groupsData.
     * Call this whenever an event is added, modified, or removed.
     */
    function processAllEvents() {
        console.log("Processing all events from groupsData...");
        const newAllEventsData = [];
        const newEventsByDate = {};

        groupsData.forEach(group => {
            if (!group.events || !Array.isArray(group.events)) return; // Skip if no events array

            group.events.forEach(event => {
                 // Ensure event has a valid Date object
                 if (!event.date || !(event.date instanceof Date) || isNaN(event.date)) {
                     // Attempt to parse from date_iso if available
                     if (event.date_iso) {
                         event.date = new Date(event.date_iso);
                         if (isNaN(event.date)) {
                             console.warn(`Skipping event with invalid date_iso: ${event.title || event.id}`, event);
                             return; // Skip this event
                         }
                     } else {
                         console.warn(`Skipping event with missing or invalid date: ${event.title || event.id}`, event);
                         return; // Skip this event
                     }
                 }

                // Create flattened event object for allEventsData
                newAllEventsData.push({
                    ...event, // Copy all properties from original event
                    group_id: group.id,
                    group_name: group.name,
                    // ensure 'date' is the Date object
                    date: event.date,
                });

                // Prepare data for eventsByDate (Calendar view)
                const dateString = `${event.date.getFullYear()}-${String(event.date.getMonth() + 1).padStart(2, '0')}-${String(event.date.getDate()).padStart(2, '0')}`;
                if (!newEventsByDate[dateString]) {
                    newEventsByDate[dateString] = [];
                }
                newEventsByDate[dateString].push({ title: event.title, group: group.name });
            });
        });

        // Replace global derived data arrays/objects
        allEventsData = newAllEventsData;
        eventsByDate = newEventsByDate;

        console.log(`Finished processing. allEventsData: ${allEventsData.length}, eventsByDate keys: ${Object.keys(eventsByDate).length}`);

        // Optional: Immediately refresh the current view if it depends on derived data
        // if (currentView === 'calendar') {
        //     renderCalendar(calendarDate.getFullYear(), calendarDate.getMonth());
        // } else if (currentView === 'events') {
        //     renderAllEventsList(currentEventFilter);
        // }
    }


    // --- Dynamic Creation Functions ---

    /**
     * Creates a new group and adds it to the list.
     * @param {string} name - The name of the new group.
     * @param {string} [avatarUrl] - Optional URL for the group avatar.
     * @param {boolean} [makeActive=false] - Whether to make the new group active immediately.
     * @returns {object | null} The newly created group object or null on failure.
     */
    function addGroup(name, avatarUrl, makeActive = false) {
        if (!name) {
            console.error("Cannot add group without a name.");
            return null;
        }
        if (!groupListUL) {
            console.error("Group list UL element not found.");
            return null;
        }

        const newGroupId = generateUniqueId('group');
        const defaultAvatar = `https://via.placeholder.com/40/cccccc/FFFFFF?text=${name.substring(0, 1).toUpperCase()}`;

        const newGroup = {
            id: newGroupId,
            name: name,
            avatar_url: avatarUrl || defaultAvatar,
            events: [],
            upcoming_event_count: 0 // Initialize count
            // Add any other default properties your groups need
        };

        // 1. Update Data
        groupsData.push(newGroup);
        console.log(`Group added to data: ${name} (ID: ${newGroupId})`);

        // 2. Update UI (Group List)
        const li = document.createElement('li');
        li.classList.add('group-item');
        li.dataset.groupId = newGroup.id;
        li.dataset.groupName = newGroup.name;
        li.dataset.groupAvatar = newGroup.avatar_url;

        li.innerHTML = `
            <img src="${newGroup.avatar_url}" alt="${newGroup.name} Avatar" class="group-avatar">
            <div class="group-info">
                <span class="group-name">${newGroup.name}</span>
                <span class="group-stats">0 upcoming events</span>
            </div>
        `;
        groupListUL.appendChild(li);
        console.log(`Group added to UI list: ${name}`);

        // 3. Optionally make active
        if (makeActive) {
             // Simulate a click to handle all activation logic consistently
             li.click();
             // Or manually:
             // groupListUL.querySelectorAll('.group-item').forEach(i => i.classList.remove('active'));
             // li.classList.add('active');
             // showEventViewForGroup(li); // Assuming showEventViewForGroup handles header/rendering
        }

        return newGroup;
    }

    /**
      * Adds a new event to a specified group.
      * @param {string} groupId - The ID of the group to add the event to.
      * @param {object} eventDetails - Object containing event properties (title, date_iso, image_url, cost_display, location, rsvp_status, etc.)
      * @returns {object | null} The newly created event object or null on failure.
      */
    function addEventToGroup(groupId, eventDetails) {
        if (!groupId || !eventDetails || !eventDetails.title || !eventDetails.date_iso) {
             console.error("Missing groupId or required event details (title, date_iso).");
             return null;
        }

        // 1. Find Target Group in Data
        const targetGroupIndex = groupsData.findIndex(g => g.id === groupId);
        if (targetGroupIndex === -1) {
            console.error(`Group with ID ${groupId} not found.`);
            return null;
        }

        // 2. Create New Event Object
        const newEventId = generateUniqueId('event');
        const eventDate = new Date(eventDetails.date_iso); // Parse date string
        if (isNaN(eventDate)) {
            console.error(`Invalid date_iso string provided: ${eventDetails.date_iso}`);
            return null;
        }

        const newEvent = {
            id: newEventId,
            title: eventDetails.title,
            date_iso: eventDetails.date_iso, // Keep original ISO string
            date: eventDate,                // Store the Date object
            image_url: eventDetails.image_url || 'https://via.placeholder.com/150/eeeeee/333333?text=Event', // Default image
            formatted_date: formatEventDateForDisplay(eventDate), // Pre-format for display
            cost_display: eventDetails.cost_display || 'Free',
            location: eventDetails.location || 'TBD',
            rsvp_status: eventDetails.rsvp_status || 'Invited',
            // Add any other properties from eventDetails
            ...eventDetails // Spread operator to include extras easily
        };

        // 3. Add to Group's Events Array
        groupsData[targetGroupIndex].events.push(newEvent);
        console.log(`Event '${newEvent.title}' added to group '${groupsData[targetGroupIndex].name}'.`);

        // --- Update Derived Data & UI ---

        // 4. Recalculate derived data (allEventsData, eventsByDate)
        processAllEvents();

        // 5. Update Group Stats in UI (Optional but good)
        try {
            const groupLi = groupListUL?.querySelector(`.group-item[data-group-id="${groupId}"]`);
            if (groupLi) {
                 // Recalculate upcoming count (example)
                 const now = new Date();
                 const upcomingCount = groupsData[targetGroupIndex].events.filter(ev => ev.date >= now).length;
                 groupsData[targetGroupIndex].upcoming_event_count = upcomingCount; // Update data model too
                 const statsSpan = groupLi.querySelector('.group-stats');
                 if (statsSpan) {
                     statsSpan.textContent = `${upcomingCount} upcoming event${upcomingCount !== 1 ? 's' : ''}`;
                 }
            }
        } catch(e) { console.error("Error updating group stats UI:", e); }


        // 6. Refresh Current View IF Necessary
        const activeGroupLi = groupListUL?.querySelector('.group-item.active');
        const currentlyDisplayedGroupId = activeGroupLi?.dataset.groupId;

        if (currentView === 'groups' && currentlyDisplayedGroupId === groupId) {
            // If the modified group is currently displayed in the main pane, re-render its events
             console.log("Refreshing event panels for the active group.");
            renderGroupEvents(groupId); // Re-renders panels & calls setupParallax
        } else if (currentView === 'calendar') {
            // If Calendar is active, re-render it to show the new event marker
            console.log("Refreshing calendar view.");
            renderCalendar(calendarDate.getFullYear(), calendarDate.getMonth());
        } else if (currentView === 'events') {
             // If the general Events List is active, re-render it
             console.log("Refreshing events list view.");
             renderAllEventsList(currentEventFilter);
        }

        return newEvent;
    }


    // --- UI Rendering Functions (Including Parallax) ---

    // Header Update (No change needed)
    function updateHeader(group) { /* ... as before ... */
        if (!group) { activeGroupNameEl.textContent = 'Group Events'; activeGroupAvatarEl.src = 'https://via.placeholder.com/36'; return; }
        const groupName = group.name || 'Group Events'; const groupAvatar = group.avatar_url || 'https://via.placeholder.com/36';
        if (activeGroupNameEl) activeGroupNameEl.textContent = `${groupName} Events`; if (activeGroupAvatarEl) activeGroupAvatarEl.src = groupAvatar.replace('/40/', '/36/');
    }

    // Parallax Style Calculation (No change needed)
    function calculateInitialPanelStyle(index, containerWidth) { /* ... as before ... */
        const typicalPanelWidth = 320; const sidePaddingPercent = 5; const horizontalGapPercent = 2; const verticalBaseOffset = 50; const verticalRowStep = 120; const maxRotation = 6; const maxZDepth = 40;
        const usableWidth = (typeof containerWidth === 'number' && containerWidth > typicalPanelWidth)? containerWidth : (window.innerWidth * 0.6);
        const availableWidthForPanels = usableWidth * (1 - (sidePaddingPercent * 2 / 100)); const panelPlusGapApproxWidth = typicalPanelWidth * (1 + horizontalGapPercent / 100); const numCols = Math.max(1, Math.floor(availableWidthForPanels / panelPlusGapApproxWidth));
        const colIndex = index % numCols; const rowIndex = Math.floor(index / numCols);
        const totalPanelWidthPercent = (typicalPanelWidth / usableWidth) * 100; const totalGapWidthPercent = horizontalGapPercent * (numCols - 1); const totalContentWidthPercent = (totalPanelWidthPercent * numCols) + totalGapWidthPercent; const sideMarginPercent = (100 - totalContentWidthPercent) / 2;
        let leftPercent = sideMarginPercent + colIndex * (totalPanelWidthPercent + horizontalGapPercent); leftPercent += (Math.random() - 0.5) * (horizontalGapPercent > 0 ? horizontalGapPercent : 4);
        let topValue = verticalBaseOffset + rowIndex * verticalRowStep; topValue += (Math.random() - 0.5) * 40;
        const rotation = (Math.random() - 0.5) * maxRotation * 2; const zDepth = Math.random() * maxZDepth * 2 - maxZDepth;
        leftPercent = Math.max(sidePaddingPercent / 2, Math.min(leftPercent, 100 - totalPanelWidthPercent - (sidePaddingPercent / 2))); topValue = Math.max(10, topValue);
        return { top: `${topValue.toFixed(0)}px`, left: `${leftPercent.toFixed(1)}%`, transform: `rotate(${rotation.toFixed(1)}deg) translateZ(${zDepth.toFixed(0)}px)` };
    }

    // Render Group Events (No significant change needed, relies on groupsData)
    function renderGroupEvents(groupId) { /* ... as before ... */
        if (!eventPanelsContainer || !eventCollageArea) { console.error("Missing container elements for rendering group events."); return; }
        console.log(`Rendering events for group ID: ${groupId}`);
        destroyParallax(); eventPanelsContainer.innerHTML = '';
        const group = groupsData.find(g => g.id === groupId);
        if (!group || !group.events || group.events.length === 0) { eventPanelsContainer.innerHTML = '<p class="no-events-message">No events found for this group.</p>'; eventPanelsContainer.style.minHeight = '100px'; return; }
        const containerWidth = eventCollageArea.clientWidth; const verticalRowStep = 120; const estimatedContainerHeight = Math.max(300, 100 + (group.events.length * verticalRowStep * 0.7)); eventPanelsContainer.style.minHeight = `${estimatedContainerHeight}px`;
        group.events.sort((a, b) => (a.date || 0) - (b.date || 0)); // Sort by Date object
        group.events.forEach((event, index) => {
            const panel = document.createElement('div'); panel.classList.add('event-panel');
            const initialStyle = calculateInitialPanelStyle(index, containerWidth); panel.style.position = 'absolute'; panel.style.top = initialStyle.top; panel.style.left = initialStyle.left; panel.style.transform = initialStyle.transform; panel.dataset.originalTransform = initialStyle.transform;
            const displayDate = event.formatted_date || formatEventDateForDisplay(event.date); // Use pre-formatted or generate
            panel.innerHTML = ` ${event.image_url ? `<img src="${event.image_url}" alt="Event Image" class="event-image">` : ''} <h3>${event.title || 'Untitled Event'}</h3> <p class="event-details">${displayDate} | ${event.cost_display || 'Info unavailable'}</p> ${event.location ? `<p class="event-details">📍 ${event.location}</p>` : ''} ${event.rsvp_status ? `<p class="event-rsvp">RSVP: ${event.rsvp_status}</p>` : ''} <div class="event-actions"> <button class="button accept">Accept</button> <button class="button decline">Decline</button> </div> `;
            eventPanelsContainer.appendChild(panel);
        });
        setupParallax();
    }

    // Render All Events List (No change needed, relies on allEventsData)
    function renderAllEventsList(filter = 'upcoming') { /* ... as before ... */
        if (!eventListContainer) return; console.log(`Rendering event list view with filter: ${filter}`); eventListContainer.innerHTML = '';
        const now = new Date(); let filteredEvents = [];
        switch (filter) { case 'upcoming': filteredEvents = allEventsData.filter(event => event.date >= now); break; case 'past': filteredEvents = allEventsData.filter(event => event.date < now); break; default: filteredEvents = [...allEventsData]; break; }
        filteredEvents.sort((a, b) => (filter === 'past' ? b.date - a.date : a.date - b.date));
        if (filteredEvents.length > 0) { filteredEvents.forEach(event => { const tile = document.createElement('div'); tile.classList.add('event-tile'); const dateIcon = '<span class="icon">📅</span>', groupIcon = '<span class="icon">👥</span>', locationIcon = '<span class="icon">📍</span>', rsvpIcon = '<span class="icon">✔️</span>'; const displayDate = event.formatted_date || formatEventDateForDisplay(event.date); tile.innerHTML = ` <h4>${event.title || 'Untitled Event'}</h4> <p class="tile-detail">${dateIcon} ${displayDate}</p> ${event.group_name ? `<p class="tile-detail">${groupIcon} ${event.group_name}</p>` : ''} ${event.location ? `<p class="tile-detail">${locationIcon} ${event.location}</p>` : ''} ${event.rsvp_status ? `<p class="tile-detail">${rsvpIcon} RSVP: ${event.rsvp_status}</p>` : ''} `; eventListContainer.appendChild(tile); }); } else { eventListContainer.innerHTML = '<p class="no-events-message">No events match the current filter.</p>'; }
        if (eventsViewArea) eventsViewArea.scrollTop = 0;
    }

    // Render Calendar (No change needed, relies on eventsByDate)
    function renderCalendar(year, month) { /* ... as before ... */
        if (!calendarGridEl || !calendarMonthYearEl) return; console.log(`Rendering calendar for: ${year}-${month + 1}`); calendarGridEl.innerHTML = '';
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]; calendarMonthYearEl.textContent = `${monthNames[month]} ${year}`;
        const firstDayOfMonth = new Date(year, month, 1); const daysInMonth = new Date(year, month + 1, 0).getDate(); const startingDay = firstDayOfMonth.getDay(); const today = new Date(); const todayDateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const daysInPrevMonth = new Date(year, month, 0).getDate(); for (let i = 0; i < startingDay; i++) { const dayNum = daysInPrevMonth - startingDay + 1 + i; const cell = document.createElement('div'); cell.classList.add('calendar-cell', 'other-month'); cell.innerHTML = `<span class="day-number">${dayNum}</span>`; calendarGridEl.appendChild(cell); }
        for (let i = 1; i <= daysInMonth; i++) { const cell = document.createElement('div'); cell.classList.add('calendar-cell'); const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`; if (dateString === todayDateString) cell.classList.add('today'); let cellHTML = `<span class="day-number">${i}</span>`; let eventTitles = []; if (eventsByDate[dateString]) { eventsByDate[dateString].forEach(event => { cellHTML += `<div class="event-marker"></div>`; eventTitles.push(event.title + (event.group ? ` (${event.group})` : '')); }); } cell.innerHTML = cellHTML; cell.dataset.date = dateString; if (eventTitles.length > 0) cell.title = eventTitles.join('\n'); calendarGridEl.appendChild(cell); }
        const totalCells = startingDay + daysInMonth; const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7); for (let i = 1; i <= remainingCells; i++) { const cell = document.createElement('div'); cell.classList.add('calendar-cell', 'other-month'); cell.innerHTML = `<span class="day-number">${i}</span>`; calendarGridEl.appendChild(cell); }
    }

    // Parallax Functions (No change needed)
    function setupParallax() { /* ... as before ... */
        if (!eventCollageArea || isParallaxSetup || isMobile) return; console.log("Setting up parallax..."); destroyParallax(); panelData = []; const panels = Array.from(eventPanelsContainer.querySelectorAll('.event-panel')); if (!panels.length) return;
        panels.forEach((panel, index) => { try { const style = window.getComputedStyle(panel); const matrix = new DOMMatrixReadOnly(style.transform); const z = matrix.is2D ? 0 : matrix.m43; const originalTransform = panel.dataset.originalTransform || ''; const rotateMatch = originalTransform.match(/rotate(?:Z|3d)?\([^)]+\)/); const baseRotate = rotateMatch ? rotateMatch[0] : 'rotate(0deg)'; const translateZMatch = originalTransform.match(/translateZ\([^)]+\)/); const baseTranslateZ = translateZMatch ? translateZMatch[0] : 'translateZ(0px)'; if (style.position !== 'absolute') console.warn("Panel not absolute, parallax might be jerky.", panel); panelData.push({ element: panel, originalTransform: originalTransform, baseRotate: baseRotate, baseTranslateZ: baseTranslateZ, parallaxFactorY: 1 + z / 200, parallaxFactorX: Math.sin(z / 50), swayAmplitude: (Math.random() - 0.5) * 15 }); } catch (e) { console.error(`Error processing panel ${index} for parallax:`, e, panel); } }); if (!panelData.length) return;
        let ticking = false; parallaxScrollHandler = () => { if (isMobile || !isParallaxSetup || !panelData.length || ticking || !eventCollageArea) return; ticking = true; window.requestAnimationFrame(() => { if (!eventCollageArea || !isParallaxSetup ) { ticking = false; return; } const scrollTop = eventCollageArea.scrollTop; panelData.forEach(data => { if (!data || !data.element) return; const offsetY = -scrollTop * (1 - data.parallaxFactorY) * 0.1; const sway = Math.sin(scrollTop * 0.005 + data.parallaxFactorX) * data.swayAmplitude; data.element.style.transform = `translateY(${offsetY.toFixed(2)}px) translateX(${sway.toFixed(2)}px) ${data.baseRotate} ${data.baseTranslateZ}`; }); ticking = false; }); };
        eventCollageArea.addEventListener('scroll', parallaxScrollHandler); isParallaxSetup = true; console.log(`Parallax setup complete. ${panelData.length} panels processed.`); parallaxScrollHandler();
     }
    function destroyParallax() { /* ... as before ... */
        if (!eventCollageArea || !isParallaxSetup) return; console.log("Destroying parallax..."); eventCollageArea.removeEventListener('scroll', parallaxScrollHandler); parallaxScrollHandler = null; panelData.forEach(data => { if (data?.element?.style) { data.element.style.transform = data.originalTransform; } }); panelData = []; isParallaxSetup = false; console.log("Parallax destroyed.");
    }

    // --- View Switching & UI Logic ---

    // showEventViewForGroup (Logic adjusted slightly for activation)
    function showEventViewForGroup(groupElement) {
        if (!plannerPane || !groupElement) return;
        const groupId = groupElement.dataset.groupId;
        const group = groupsData.find(g => g.id === groupId);
        if (!group) { console.error(`Group not found for ID: ${groupId}`); return; }

        // Add active class *before* potentially switching view
        groupListUL.querySelectorAll('.group-item').forEach(i => i.classList.remove('active'));
        groupElement.classList.add('active');

        if (currentView !== 'groups') {
            switchView('groups'); // switchView will see the new active group and render it
        } else {
            console.log(`Showing event view for group: ${group.name}`);
            updateHeader(group);
            renderGroupEvents(groupId); // Render events for this group (calls setupParallax)
            if (isMobile) {
                plannerPane.classList.add('mobile-event-view-active');
            }
        }
        if (eventCollageArea) eventCollageArea.scrollTop = 0;
    }


    // showGroupListView (No change needed)
    function showGroupListView() { /* ... as before ... */
         if (!plannerPane) return; if (currentView !== 'groups') { switchView('groups'); return; } console.log("Showing group list view (mobile back action)"); if (isMobile) { plannerPane.classList.remove('mobile-event-view-active'); if (groupListArea) groupListArea.scrollTop = 0; }
    }

    // switchView (Adjusted to always re-render derived views)
    function switchView(viewName) {
        if (currentView === viewName && viewName !== 'groups') {
             // If already in calendar/events, maybe still force re-render? Optional.
             // console.log(`Already in view ${viewName}, potentially refreshing.`);
             // if(viewName === 'calendar') renderCalendar(calendarDate.getFullYear(), calendarDate.getMonth());
             // else if (viewName === 'events') renderAllEventsList(currentEventFilter);
             // return;
        } else if (currentView === viewName && viewName === 'groups') {
             // Allow re-switching to groups (e.g., via tab click) to reset state/view
             console.log("Re-selecting groups view.");
        }


        console.log(`Switching view to: ${viewName}`);
        const previousView = currentView;
        currentView = viewName;

        if (previousView === 'groups' && viewName !== 'groups') destroyParallax();

        viewTabs.forEach(tab => tab.classList.remove('active'));
        const activeTab = document.getElementById(`${viewName}-tab`);
        if (activeTab) activeTab.classList.add('active');

        plannerPane.classList.remove('calendar-view-active', 'events-view-active', 'mobile-event-view-active');

        switch (viewName) {
            case 'calendar':
                plannerPane.classList.add('calendar-view-active');
                // *** Always render calendar on switch to ensure latest data ***
                renderCalendar(calendarDate.getFullYear(), calendarDate.getMonth());
                break;
            case 'events':
                plannerPane.classList.add('events-view-active');
                 // *** Always render events list on switch to ensure latest data ***
                renderAllEventsList(currentEventFilter);
                break;
            case 'groups':
            default:
                 checkScreenSize(); // Handles mobile/desktop state
                 const activeGroupLi = groupListUL?.querySelector('.group-item.active');
                 const groupId = activeGroupLi?.dataset.groupId;
                 const group = groupsData.find(g => g.id === groupId) || groupsData[0];
                 if (group) {
                    updateHeader(group);
                    renderGroupEvents(group.id); // Renders events + parallax if applicable
                 } else {
                    updateHeader(null); if (eventPanelsContainer) eventPanelsContainer.innerHTML = '<p class="no-events-message">No groups available.</p>'; destroyParallax();
                 }
                 if (isMobile) plannerPane.classList.remove('mobile-event-view-active');
                 break;
        }
         const activeViewArea = document.getElementById(`${viewName === 'groups' ? 'event-collage' : viewName + '-view'}`);
         if (activeViewArea) activeViewArea.scrollTop = 0;
    }


    // Responsive Logic (checkScreenSize - no significant change needed)
    function checkScreenSize() { /* ... as before ... */
        console.log("--- checkScreenSize called ---"); const currentlyMobile = window.innerWidth <= 768; const stateChanged = currentlyMobile !== isMobile; isMobile = currentlyMobile;
        if (stateChanged) { console.log(`Screen state changed to ${isMobile ? 'Mobile' : 'Desktop'}`); if (isMobile) { console.log("Transitioning TO Mobile actions..."); destroyParallax(); if (currentView === 'groups') { plannerPane.classList.remove('mobile-event-view-active'); } } else { console.log("Transitioning TO Desktop actions..."); plannerPane.classList.remove('mobile-event-view-active'); if (currentView === 'groups') { console.log("Desktop detected in groups view, re-rendering for parallax setup."); const activeGroupLi = groupListUL?.querySelector('.group-item.active'); const groupId = activeGroupLi?.dataset.groupId; const group = groupsData.find(g => g.id === groupId) || groupsData[0]; if(group) { renderGroupEvents(group.id); } else { destroyParallax(); } } else { destroyParallax(); } }
        } else { if (!isMobile && currentView === 'groups') { console.log("Desktop resize, re-rendering group events for layout/parallax recalc."); const activeGroupLi = groupListUL?.querySelector('.group-item.active'); const groupId = activeGroupLi?.dataset.groupId; const group = groupsData.find(g => g.id === groupId) || groupsData[0]; if(group) { renderGroupEvents(group.id); } else { destroyParallax(); } } else if (isMobile && isParallaxSetup) { console.warn("Parallax was active on mobile, destroying."); destroyParallax(); } }
        console.log("--- checkScreenSize finished ---");
    }

    // --- Event Listeners ---

    // Group Item Clicks (Delegation)
    groupListUL?.addEventListener('click', (e) => {
        const groupItem = e.target.closest('.group-item');
        // Only process if a group item was clicked AND it's not already active
        if (groupItem && !groupItem.classList.contains('active')) {
            // Don't remove active class here, let showEventViewForGroup handle it
            // to ensure correct logic flow when switching views
            showEventViewForGroup(groupItem);
        } else if (groupItem && groupItem.classList.contains('active')) {
             console.log("Clicked already active group.");
             // Optionally, could force re-render if needed: renderGroupEvents(groupItem.dataset.groupId);
        }
    });

    // Back Button Click (Mobile)
    backButtonGroup?.addEventListener('click', () => { /* ... as before ... */
         console.log("Back button clicked"); if (currentView === 'groups' && isMobile) { showGroupListView(); }
    });

    // View Tab Clicks
    groupsTab?.addEventListener('click', () => switchView('groups'));
    calendarTab?.addEventListener('click', () => switchView('calendar'));
    eventsTab?.addEventListener('click', () => switchView('events'));

    // Calendar Navigation
    prevMonthButton?.addEventListener('click', () => { calendarDate.setMonth(calendarDate.getMonth() - 1); renderCalendar(calendarDate.getFullYear(), calendarDate.getMonth()); });
    nextMonthButton?.addEventListener('click', () => { calendarDate.setMonth(calendarDate.getMonth() + 1); renderCalendar(calendarDate.getFullYear(), calendarDate.getMonth()); });

    // Event Filter Pill Clicks (Delegation)
    eventFilterBar?.addEventListener('click', (e) => { /* ... as before ... */
        if (e.target.classList.contains('filter-pill')) { const filterValue = e.target.dataset.filter; if (filterValue && filterValue !== currentEventFilter) { currentEventFilter = filterValue; eventFilterBar.querySelectorAll('.filter-pill').forEach(pill => pill.classList.remove('active')); e.target.classList.add('active'); renderAllEventsList(currentEventFilter); } }
    });

    // Window Resize Handler (Debounced)
    window.addEventListener('resize', () => { /* ... as before ... */
        clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { console.log("Debounced resize executing checkScreenSize..."); checkScreenSize(); }, 250);
    });

    // --- Example Dynamic Action Triggers ---
    addGroupBtn?.addEventListener('click', () => {
        const groupName = prompt("Enter new group name:", "New Dynamic Group");
        if (groupName) {
            addGroup(groupName, null, true); // Add and make active
        }
    });

    addEventBtn?.addEventListener('click', () => {
        const activeGroupLi = groupListUL?.querySelector('.group-item.active');
        if (!activeGroupLi) {
            alert("Please select a group first!");
            return;
        }
        const groupId = activeGroupLi.dataset.groupId;
        const groupName = activeGroupLi.dataset.groupName;

        const eventTitle = prompt(`Enter event title for group "${groupName}":`, "Dynamic Event");
        if (!eventTitle) return;

        // Basic date input - use a date picker library for better UX
        const dateStr = prompt("Enter event date (YYYY-MM-DDTHH:MM):", "2024-12-15T18:30");
        if (!dateStr) return;

        // Basic event details object
        const details = {
            title: eventTitle,
            date_iso: `${dateStr}:00`, // Add seconds for ISO standard consistency
            location: "Somewhere Fun",
            cost_display: "$10"
            // Add other fields as needed
        };

        addEventToGroup(groupId, details);
    });


    // --- Initial Setup ---
    loadData(); // Load initial data from HTML/JSON
    checkScreenSize(); // Set initial mobile/desktop state
    switchView(currentView); // Initialize default view ('groups'), renders initial state

    console.log("Planner UI script initialized with Dynamic Actions.");

}); // End DOMContentLoaded