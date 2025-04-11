document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const plannerPane = document.getElementById('planner-pane');
    const groupListArea = document.querySelector('.group-list-area');
    const eventCollageArea = document.getElementById('event-collage');
    const calendarViewArea = document.getElementById('calendar-view');
    const eventsViewArea = document.getElementById('events-view'); // New
    const groupItems = document.querySelectorAll('.group-item');
    const backButtonGroup = document.getElementById('back-to-groups-button');
    const activeGroupNameEl = document.getElementById('active-group-name');
    const activeGroupAvatarEl = document.getElementById('active-group-avatar');
    const collageContainer = eventCollageArea;
    const groupsTab = document.getElementById('groups-tab');
    const calendarTab = document.getElementById('calendar-tab');
    const eventsTab = document.getElementById('events-tab'); // New
    const viewTabs = document.querySelectorAll('.view-tab');
    const calendarMonthYearEl = document.getElementById('calendar-month-year');
    const calendarGridEl = document.getElementById('calendar-grid');
    const prevMonthButton = document.getElementById('calendar-prev-month');
    const nextMonthButton = document.getElementById('calendar-next-month');
    const eventFilterBar = document.getElementById('event-filter-bar'); // New
    const eventListContainer = document.getElementById('event-list-container'); // New

    // --- State Variables ---
    let panelData = [];
    let isMobile = window.innerWidth <= 768;
    let isParallaxSetup = false;
    let parallaxScrollHandler = null;
    let resizeTimer;
    let currentView = 'groups'; // 'groups', 'calendar', or 'events'
    let calendarDate = new Date();
    let currentEventFilter = 'upcoming'; // New: 'upcoming', 'past', 'all'

    // --- More Detailed Sample Events Data ---
    const now = new Date();
    const detailedEvents = [
        { id: 1, title: 'Mountain Hike Day', date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 9, 0), group: 'Weekend Hikers', location: 'Eagle Peak Trail', rsvp: 'Going' },
        { id: 2, title: 'Strategy Board Games Night', date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 9, 19, 0), group: 'Board Game Geeks', location: 'Game Nook Cafe', rsvp: 'Maybe' },
        { id: 3, title: 'Downtown Taco Tour', date: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 10, 13, 0), group: 'City Foodies', location: 'Various Downtown Stops', rsvp: 'Going' }, // Past
        { id: 4, title: 'Indie Film Screening', date: new Date(now.getFullYear(), now.getMonth() + 1, 5, 18, 0), group: 'Indie Film Club', location: 'Art House Cinema', rsvp: 'Declined' },
        { id: 5, title: 'Coastal Trail Walk', date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 15, 10, 0), group: 'Weekend Hikers', location: 'Seaview Path', rsvp: 'Invited' },
        { id: 6, title: 'Eurogames Evening', date: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 18, 30), group: 'Board Game Geeks', location: 'Community Center', rsvp: 'Going' }, // Past
        { id: 7, title: 'Potluck Picnic', date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6, 12, 0), group: 'City Foodies', location: 'Central Park Meadow', rsvp: 'Invited' },
         { id: 8, title: 'Previous Hike Prep Meeting', date: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 20, 19, 0), group: 'Weekend Hikers', location: 'Online', rsvp: 'Going' }, // Past
    ];

    // Convert sampleEvents (used by calendar) from detailedEvents for simplicity
    const sampleEvents = {}; // Key: YYYY-MM-DD
    detailedEvents.forEach(event => {
        const dateString = `${event.date.getFullYear()}-${String(event.date.getMonth() + 1).padStart(2, '0')}-${String(event.date.getDate()).padStart(2, '0')}`;
        if (!sampleEvents[dateString]) {
            sampleEvents[dateString] = [];
        }
        sampleEvents[dateString].push({ title: event.title });
    });


    console.log(`Initial state: ${isMobile ? 'Mobile' : 'Desktop'}, View: ${currentView}`);

    function formatEventDate(date) {
        return date.toLocaleString(undefined, {
            weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
        });
    }

    // --- Header Update Function (for Group View) ---
    function updateHeader(groupElement) {
        const groupName = groupElement?.dataset.groupName || 'Group Events';
        const groupAvatar = groupElement?.dataset.groupAvatar || 'https://via.placeholder.com/36';
        if (activeGroupNameEl) activeGroupNameEl.textContent = `${groupName} Events`;
        if (activeGroupAvatarEl) activeGroupAvatarEl.src = groupAvatar.replace('/40/', '/36/');
    }

    // --- Parallax Effect Functions ---
    function setupParallax() {
        if (!collageContainer || isParallaxSetup || isMobile || currentView !== 'groups') {
            // console.log(`Parallax setup skipped. isParallaxSetup: ${isParallaxSetup}, isMobile: ${isMobile}, currentView: ${currentView}`);
            return;
        }
        console.log("Setting up parallax...");

        panelData = [];
        const panels = Array.from(collageContainer.querySelectorAll('.event-panel'));
        if (!panels.length) {
            console.log("No event panels found for parallax.");
            return; // No panels to apply parallax to
        }

        panels.forEach((panel, index) => {
            try {
                const style = window.getComputedStyle(panel);
                const matrix = new DOMMatrixReadOnly(style.transform);
                const z = matrix.is2D ? 0 : matrix.m43;
                const originalInlineTransform = panel.style.transform || '';
                const rotateMatch = originalInlineTransform.match(/rotate(?:Z|3d)?\([^)]+\)/);
                const baseRotate = rotateMatch ? rotateMatch[0] : '';
                const translateZMatch = originalInlineTransform.match(/translateZ\([^)]+\)/);
                const baseTranslateZ = translateZMatch ? translateZMatch[0] : '';

                if (style.position !== 'absolute' && style.position !== 'fixed' && style.position !== 'sticky') {
                    panel.style.position = 'absolute';
                    panel.style.top = panel.style.top || '0px';
                    panel.style.left = panel.style.left || '0px';
                }

                panelData.push({
                    element: panel,
                    originalInlineTransform: originalInlineTransform,
                    baseRotate: baseRotate,
                    baseTranslateZ: baseTranslateZ,
                    parallaxFactorY: 1 + z / 200,
                    parallaxFactorX: Math.sin(z / 50),
                    swayAmplitude: (Math.random() - 0.5) * 20
                });
            } catch (e) {
                console.error(`Error processing panel ${index} for parallax:`, e, panel);
            }
        });

        let ticking = false;
        parallaxScrollHandler = () => {
            if (isMobile || currentView !== 'groups' || !panelData.length || ticking || !collageContainer) return; // Check view here too

            ticking = true;
            window.requestAnimationFrame(() => {
                if (!collageContainer) {
                    ticking = false;
                    return;
                }
                const scrollTop = collageContainer.scrollTop;

                panelData.forEach(data => {
                    if (!data || !data.element) return;
                    const offsetY = -scrollTop * (1 - data.parallaxFactorY) * 0.1;
                    const sway = Math.sin(scrollTop * 0.01 + data.parallaxFactorX) * data.swayAmplitude;

                    data.element.style.transform = `
                        translateY(${offsetY}px)
                        translateX(${sway}px)
                        ${data.baseRotate}
                        ${data.baseTranslateZ}
                    `;
                });

                ticking = false;
            });
        };

        collageContainer.addEventListener('scroll', parallaxScrollHandler);
        isParallaxSetup = true;
        console.log(`Parallax setup complete. ${panelData.length} panels processed.`);
        parallaxScrollHandler(); // Apply initial state
    }

    function destroyParallax() {
        if (!collageContainer || !isParallaxSetup) {
            // console.log(`Parallax destruction skipped. isParallaxSetup: ${isParallaxSetup}`);
            return;
        }

        console.log("Destroying parallax...");

        collageContainer.removeEventListener('scroll', parallaxScrollHandler);
        parallaxScrollHandler = null;

        panelData.forEach(data => {
            if (data && data.element && data.element.style) {
                data.element.style.transform = data.originalInlineTransform;
                // We assume position was absolute before, might need adjustment if not
            }
        });

        panelData = [];
        isParallaxSetup = false;
        console.log("Parallax destroyed.");
    }

    // --- View Switching Functions ---

    function showEventView(groupElement) {
        if (!plannerPane || !groupElement) return;

        // *Always ensure we are in 'groups' view first*
        if (currentView !== 'groups') {
            switchView('groups'); // Switch back if another view was active
        }

        console.log(`Showing event view for group: ${groupElement.dataset.groupName}`);
        updateHeader(groupElement);

        if (isMobile) {
            plannerPane.classList.add('mobile-event-view-active');
        } else {
            setupParallax(); // Attempt setup
        }

        if (eventCollageArea) eventCollageArea.scrollTop = 0;
    }

    function showGroupListView() {
        if (!plannerPane) return;

        // *Always ensure we are in 'groups' view first*
        if (currentView !== 'groups') {
            switchView('groups');
        }
        console.log("Showing group list view");

        if (isMobile) {
            plannerPane.classList.remove('mobile-event-view-active');
            if (groupListArea) groupListArea.scrollTop = 0;
        }

        if (!isMobile) {
             const active = document.querySelector('.group-item.active');
             if(!active) {
                 updateHeader(null);
             }
             setupParallax(); // Attempt setup
        }
    }


    // --- Calendar Rendering Function ---
    // ... (renderCalendar remains the same)
    function renderCalendar(year, month) { // month is 0-indexed (0=Jan, 11=Dec)
        if (!calendarGridEl || !calendarMonthYearEl) return;

        console.log(`Rendering calendar for: ${year}-${month + 1}`);
        calendarGridEl.innerHTML = ''; // Clear previous grid

        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        calendarMonthYearEl.textContent = `${monthNames[month]} ${year}`;

        const firstDayOfMonth = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startingDay = firstDayOfMonth.getDay(); // 0 = Sunday, 1 = Monday, ...

        const today = new Date();
        const todayDateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        // Calculate days from previous month to display
        const daysInPrevMonth = new Date(year, month, 0).getDate();
        for (let i = 0; i < startingDay; i++) {
            const dayNum = daysInPrevMonth - startingDay + 1 + i;
            const cell = document.createElement('div');
            cell.classList.add('calendar-cell', 'other-month');
            cell.innerHTML = `<span class="day-number">${dayNum}</span>`;
            calendarGridEl.appendChild(cell);
        }

        // Display days of the current month
        for (let i = 1; i <= daysInMonth; i++) {
            const cell = document.createElement('div');
            cell.classList.add('calendar-cell');
            const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;

            if (dateString === todayDateString) {
                cell.classList.add('today');
            }

            let cellHTML = `<span class="day-number">${i}</span>`;

            // Use sampleEvents derived from detailedEvents
            if (sampleEvents[dateString]) {
                sampleEvents[dateString].forEach(event => {
                    cellHTML += `<div class="event-marker" title="${event.title}"></div>`;
                });
            }

            cell.innerHTML = cellHTML;
            cell.dataset.date = dateString;
            calendarGridEl.appendChild(cell);
        }

         // Calculate days from next month to fill the grid
         const totalCells = startingDay + daysInMonth;
         const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7) ;

         for (let i = 1; i <= remainingCells; i++) {
            const cell = document.createElement('div');
            cell.classList.add('calendar-cell', 'other-month');
            cell.innerHTML = `<span class="day-number">${i}</span>`;
            calendarGridEl.appendChild(cell);
         }

         // Ensure enough rows
         while(calendarGridEl.children.length < 35) {
            const cell = document.createElement('div');
            cell.classList.add('calendar-cell', 'other-month', 'empty-filler');
            calendarGridEl.appendChild(cell);
         }
    }

    // --- New Events List Rendering Function ---
    function renderEventsList(filter = 'upcoming') {
        if (!eventListContainer) return;
        console.log(`Rendering event list with filter: ${filter}`);
        eventListContainer.innerHTML = ''; // Clear previous list

        const now = new Date();
        let filteredEvents = [];

        // Filter events based on the selected filter
        switch (filter) {
            case 'upcoming':
                filteredEvents = detailedEvents.filter(event => event.date >= now);
                break;
            case 'past':
                filteredEvents = detailedEvents.filter(event => event.date < now);
                break;
            case 'all':
            default:
                filteredEvents = [...detailedEvents]; // Copy all events
                break;
        }

        // Sort events by date
        // Upcoming/All: Ascending (earliest first)
        // Past: Descending (most recent first)
        filteredEvents.sort((a, b) => {
            if (filter === 'past') {
                return b.date - a.date; // Descending for past
            }
            return a.date - b.date; // Ascending otherwise
        });

        // Create and append event tiles
        if (filteredEvents.length > 0) {
            filteredEvents.forEach(event => {
                const tile = document.createElement('div');
                tile.classList.add('event-tile'); // Add the glassy class if needed or style .event-tile directly

                // Add simple icons (can be replaced with <img> or icon font later)
                const dateIcon = '<span class="icon">📅</span>';
                const groupIcon = '<span class="icon">👥</span>';
                const locationIcon = '<span class="icon">📍</span>';
                const rsvpIcon = '<span class="icon">✔️</span>'; // Example

                tile.innerHTML = `
                    <h4>${event.title}</h4>
                    <p class="tile-detail">${dateIcon} ${formatEventDate(event.date)}</p>
                    ${event.group ? `<p class="tile-detail">${groupIcon} ${event.group}</p>` : ''}
                    ${event.location ? `<p class="tile-detail">${locationIcon} ${event.location}</p>` : ''}
                    ${event.rsvp ? `<p class="tile-detail">${rsvpIcon} RSVP: ${event.rsvp}</p>` : ''}
                `;
                eventListContainer.appendChild(tile);
            });
        } else {
            eventListContainer.innerHTML = '<p class="no-events-message">No events match the current filter.</p>';
            // Add styling for .no-events-message if desired
        }
         // Reset scroll position of the list
         if (eventsViewArea) eventsViewArea.scrollTop = 0;
    }


    // --- Main View Switching Function (Updated) ---
    function switchView(viewName) { // viewName = 'groups', 'calendar', or 'events'
        if (currentView === viewName && viewName !== 'groups') return; // Allow re-switching to groups to reset mobile view etc.

        console.log(`Switching view to: ${viewName}`);
        const previousView = currentView;
        currentView = viewName;

        // Update Tab Styles
        viewTabs.forEach(tab => tab.classList.remove('active'));
        const activeTab = document.getElementById(`${viewName}-tab`);
        if (activeTab) activeTab.classList.add('active');

        // Always destroy parallax when leaving 'groups' view
        if (previousView === 'groups' && viewName !== 'groups') {
            destroyParallax();
        }

        // Remove existing view classes
        plannerPane.classList.remove('calendar-view-active', 'events-view-active', 'mobile-event-view-active');

        // Add the specific class for the new view
        switch (viewName) {
            case 'calendar':
                plannerPane.classList.add('calendar-view-active');
                renderCalendar(calendarDate.getFullYear(), calendarDate.getMonth());
                break;
            case 'events':
                plannerPane.classList.add('events-view-active');
                renderEventsList(currentEventFilter); // Render with the current filter
                break;
            case 'groups':
            default: // Default to groups view
                 // No specific class needed for base group view, CSS handles default
                 // Check screen size to potentially set up parallax or handle mobile state
                 checkScreenSize();
                 // Reset header based on active group
                 const activeGroup = document.querySelector('.group-item.active');
                 updateHeader(activeGroup);
                 // If mobile, ensure group list is shown initially
                 if (isMobile) {
                     showGroupListView(); // This correctly removes mobile-event-view-active
                 }
                 break;
        }
    }


    // --- Responsive Logic ---
    // ... (checkScreenSize remains the same, primarily concerned with parallax based on currentView === 'groups')
    function checkScreenSize() {
        console.log("--- checkScreenSize called ---");
        const currentlyMobile = window.innerWidth <= 768;
        const wasMobile = isMobile;

        console.log(`State Check: Width=${window.innerWidth}, currentlyMobile=${currentlyMobile}, wasMobile=${wasMobile}, currentView=${currentView}`);

        // State change detection
        const stateChanged = currentlyMobile !== wasMobile;
        isMobile = currentlyMobile; // Update global state

        if (stateChanged) {
            console.log(`!!! Screen state CHANGED from ${wasMobile ? 'Mobile' : 'Desktop'} to ${isMobile ? 'Mobile' : 'Desktop'} !!!`);

            if (isMobile) {
                // Transitioning TO Mobile
                console.log("Transitioning TO Mobile actions...");
                destroyParallax(); // Parallax never needed on mobile
                // If ending up in 'groups' view, ensure the group list is shown
                if (currentView === 'groups') {
                    plannerPane.classList.remove('mobile-event-view-active');
                }
                 // Calendar/Events views don't have sub-views on mobile
            } else {
                // Transitioning TO Desktop
                console.log("Transitioning TO Desktop actions...");
                plannerPane.classList.remove('mobile-event-view-active'); // Ensure mobile class is removed
                // Setup parallax ONLY if ending up in 'groups' view
                if (currentView === 'groups') {
                    setupParallax();
                    const activeGroup = document.querySelector('.group-item.active');
                    updateHeader(activeGroup);
                    if (activeGroup && eventCollageArea) eventCollageArea.scrollTop = 0;
                } else {
                    destroyParallax(); // Ensure parallax is off otherwise
                }
            }
        } else {
            console.log("Screen state did NOT change.");
            // Ensure parallax state matches current view/screen size
            if (!isMobile && currentView === 'groups' && !isParallaxSetup) {
                console.log("Desktop 'groups' view, ensuring parallax is set up.");
                setupParallax();
            } else if (isMobile || currentView !== 'groups') {
                 if (isParallaxSetup) {
                    console.log("Destroying parallax because view is not 'groups' or screen is mobile.");
                    destroyParallax();
                 }
            }
        }
        console.log("--- checkScreenSize finished ---");
    }


    // --- Event Listeners ---

    // Group Item Clicks
    groupItems.forEach(item => {
        item.addEventListener('click', () => {
            // If another view is active, switch back to groups view first
             if (currentView !== 'groups') {
                switchView('groups');
             }
             // Now proceed with showing the specific group's events
            console.log(isMobile ? 'Mobile Click' : 'Desktop Click', `on group: ${item.dataset.groupName}`);
            groupItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            showEventView(item); // Shows event collage/mobile equivalent
        });
    });

    // Back Button Click (Mobile only, for group events view)
    backButtonGroup?.addEventListener('click', () => {
        console.log("Back button clicked");
         if (currentView === 'groups' && isMobile) {
            showGroupListView(); // Go back to the group list
         }
    });

    // View Tab Clicks
    groupsTab?.addEventListener('click', () => switchView('groups'));
    calendarTab?.addEventListener('click', () => switchView('calendar'));
    eventsTab?.addEventListener('click', () => switchView('events')); // New

    // Calendar Navigation Clicks
    prevMonthButton?.addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() - 1);
        renderCalendar(calendarDate.getFullYear(), calendarDate.getMonth());
    });

    nextMonthButton?.addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() + 1);
        renderCalendar(calendarDate.getFullYear(), calendarDate.getMonth());
    });

    // Event Filter Pill Clicks (using event delegation)
    eventFilterBar?.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-pill')) {
            const filterValue = e.target.dataset.filter;
            if (filterValue && filterValue !== currentEventFilter) {
                console.log(`Filter changed to: ${filterValue}`);
                currentEventFilter = filterValue;

                // Update active pill style
                eventFilterBar.querySelectorAll('.filter-pill').forEach(pill => pill.classList.remove('active'));
                e.target.classList.add('active');

                // Re-render the list with the new filter
                renderEventsList(currentEventFilter);
            }
        }
    });


    // Window Resize Handler (Debounced)
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            console.log("Debounced resize executing checkScreenSize...");
            checkScreenSize();
        }, 250);
    });

    // --- Initial Setup ---
    checkScreenSize(); // Set initial screen state (mobile/desktop)

    // Initialize the view based on `currentView` ('groups' by default)
    // This will also handle initial rendering/parallax setup as needed
    switchView(currentView);

    // If starting in 'groups', set initial header (switchView handles this now)
    // if (currentView === 'groups') { ... } // No longer needed here

    console.log("Planner UI script initialized.");

}); // End DOMContentLoaded