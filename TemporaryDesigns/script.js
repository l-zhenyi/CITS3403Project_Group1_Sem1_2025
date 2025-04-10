document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const plannerPane = document.getElementById('planner-pane');
    const groupListArea = document.querySelector('.group-list-area');
    const eventCollageArea = document.getElementById('event-collage');
    const calendarViewArea = document.getElementById('calendar-view'); // New
    const groupItems = document.querySelectorAll('.group-item');
    const backButtonGroup = document.getElementById('back-to-groups-button');
    const activeGroupNameEl = document.getElementById('active-group-name');
    const activeGroupAvatarEl = document.getElementById('active-group-avatar');
    const collageContainer = eventCollageArea;
    const groupsTab = document.getElementById('groups-tab'); // New
    const calendarTab = document.getElementById('calendar-tab'); // New
    const viewTabs = document.querySelectorAll('.view-tab'); // New
    const calendarMonthYearEl = document.getElementById('calendar-month-year'); // New
    const calendarGridEl = document.getElementById('calendar-grid'); // New
    const prevMonthButton = document.getElementById('calendar-prev-month'); // New
    const nextMonthButton = document.getElementById('calendar-next-month'); // New

    // --- State Variables ---
    let panelData = [];
    let isMobile = window.innerWidth <= 768;
    let isParallaxSetup = false;
    let parallaxScrollHandler = null;
    let resizeTimer;
    let currentView = 'groups'; // New: 'groups' or 'calendar'
    let calendarDate = new Date(); // New: Holds the currently displayed month/year
    // Sample Events Data (replace with actual data source later)
    const sampleEvents = { // Key: YYYY-MM-DD
        '2024-07-15': [{ title: 'Team Lunch' }],
        '2024-07-22': [{ title: 'Project Deadline' }],
        '2024-08-05': [{ title: 'Hiking Trip' }, {title: 'Another event'}],
        // Add more events for testing
    };


    console.log(`Initial state: ${isMobile ? 'Mobile' : 'Desktop'}, View: ${currentView}`);

    // --- Header Update Function (for Group View) ---
    function updateHeader(groupElement) {
        const groupName = groupElement?.dataset.groupName || 'Group Events';
        const groupAvatar = groupElement?.dataset.groupAvatar || 'https://via.placeholder.com/36';
        if (activeGroupNameEl) activeGroupNameEl.textContent = `${groupName} Events`;
        if (activeGroupAvatarEl) activeGroupAvatarEl.src = groupAvatar.replace('/40/', '/36/');
    }

    // --- Parallax Effect Functions ---
    function setupParallax() {
        // ONLY setup if on desktop AND in groups view AND not already setup
        if (!collageContainer || isParallaxSetup || isMobile || currentView !== 'groups') {
            // console.log(`Parallax setup skipped. isParallaxSetup: ${isParallaxSetup}, isMobile: ${isMobile}, currentView: ${currentView}`);
            return;
        }
        console.log("Setting up parallax...");
        // ... (rest of setupParallax function remains the same)

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
        // ... (rest of destroyParallax function remains the same)

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

    // Shows the Event Details pane (right side on desktop, full screen on mobile)
    function showEventView(groupElement) {
        if (!plannerPane || !groupElement) return;

        // *Always ensure we are in 'groups' view first*
        if (currentView !== 'groups') {
            switchView('groups'); // Switch back if calendar was active
        }

        console.log(`Showing event view for group: ${groupElement.dataset.groupName}`);
        updateHeader(groupElement);

        if (isMobile) {
            plannerPane.classList.add('mobile-event-view-active');
        } else {
            // On desktop, ensure parallax is potentially setup
            setupParallax(); // It will only run if conditions are met
        }

        if (eventCollageArea) eventCollageArea.scrollTop = 0;
    }

    // Shows the Group List (left side on desktop, full screen on mobile)
    function showGroupListView() {
        if (!plannerPane) return;

        // *Always ensure we are in 'groups' view first*
        if (currentView !== 'groups') {
            switchView('groups'); // Switch back if calendar was active
        }
        console.log("Showing group list view");

        if (isMobile) {
            plannerPane.classList.remove('mobile-event-view-active');
            if (groupListArea) groupListArea.scrollTop = 0;
        }

        // On Desktop, showing group list doesn't change panes visually,
        // but destroy parallax if transitioning from event view? (Usually not needed)
        // And update header if no group is selected.
        if (!isMobile) {
             const active = document.querySelector('.group-item.active');
             if(!active) {
                 updateHeader(null);
             }
             // Parallax should still be potentially active here on desktop
             setupParallax();
        }
    }

    // --- New Calendar Rendering Function ---
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

            // Check if it's today
            if (dateString === todayDateString) {
                cell.classList.add('today');
            }

            let cellHTML = `<span class="day-number">${i}</span>`;

            // Check for events on this day (using sample data)
            if (sampleEvents[dateString]) {
                sampleEvents[dateString].forEach(event => {
                    // Simple marker for now
                    cellHTML += `<div class="event-marker" title="${event.title}"></div>`;
                });
            }

            cell.innerHTML = cellHTML;
            cell.dataset.date = dateString; // Store date for potential click events later
            calendarGridEl.appendChild(cell);
        }

         // Calculate days from next month to fill the grid (usually up to 6 rows * 7 cols = 42)
         const totalCells = startingDay + daysInMonth;
         const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7) ; // Cells needed from next month
         // More robust: Ensure grid fills up to 6 weeks (42 cells) if needed
         // const cellsToFill = 42 - totalCells; // Alternative calculation

         for (let i = 1; i <= remainingCells; i++) {
            const cell = document.createElement('div');
            cell.classList.add('calendar-cell', 'other-month');
            cell.innerHTML = `<span class="day-number">${i}</span>`;
            calendarGridEl.appendChild(cell);
         }

         // Ensure enough rows (optional, CSS min-height often handles this visually)
         while(calendarGridEl.children.length < 35) { // Ensure at least 5 rows
            const cell = document.createElement('div');
            cell.classList.add('calendar-cell', 'other-month', 'empty-filler'); // Add class to hide if needed
            calendarGridEl.appendChild(cell);
         }

    }


    // --- New Main View Switching Function ---
    function switchView(viewName) { // viewName = 'groups' or 'calendar'
        if (currentView === viewName) return; // No change needed

        console.log(`Switching view to: ${viewName}`);
        currentView = viewName;

        // Update Tab Styles
        viewTabs.forEach(tab => tab.classList.remove('active'));
        if (viewName === 'groups' && groupsTab) {
            groupsTab.classList.add('active');
        } else if (viewName === 'calendar' && calendarTab) {
            calendarTab.classList.add('active');
        }

        // Toggle Pane Visibility Class
        if (viewName === 'calendar') {
            destroyParallax(); // Always destroy parallax when leaving groups view
            plannerPane.classList.add('calendar-view-active');
            plannerPane.classList.remove('mobile-event-view-active'); // Ensure mobile starts at list view equivalent for calendar
            // Render calendar for the current state date
            renderCalendar(calendarDate.getFullYear(), calendarDate.getMonth());
        } else { // Switching to 'groups'
            plannerPane.classList.remove('calendar-view-active');
            // Check if parallax should be setup (desktop state)
            checkScreenSize(); // Re-run checkScreenSize to handle potential parallax setup
             // Reset header based on active group, if switching back to groups
            const activeGroup = document.querySelector('.group-item.active');
            updateHeader(activeGroup); // Updates to default if null
            // Ensure correct mobile view state if applicable
            if (isMobile) {
                showGroupListView(); // Go back to group list on mobile when switching to groups view
            }
        }
    }


    // --- Responsive Logic ---
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
                destroyParallax(); // Destroy parallax if it was active
                // If in 'groups' view, ensure the group list is shown
                if (currentView === 'groups') {
                    plannerPane.classList.remove('mobile-event-view-active');
                }
                 // Calendar view doesn't have a sub-view on mobile like groups does
            } else {
                // Transitioning TO Desktop
                console.log("Transitioning TO Desktop actions...");
                plannerPane.classList.remove('mobile-event-view-active'); // Ensure mobile class is removed
                // Setup parallax ONLY if in 'groups' view
                if (currentView === 'groups') {
                    setupParallax();
                     // Update header based on active group (important after potential mobile view)
                    const activeGroup = document.querySelector('.group-item.active');
                    updateHeader(activeGroup); // Updates to default if null
                    if (activeGroup && eventCollageArea) eventCollageArea.scrollTop = 0;
                } else {
                    destroyParallax(); // Ensure parallax is off if landing on calendar view desktop
                }
            }
        } else {
            console.log("Screen state did NOT change.");
            // If state didn't change, but we are on desktop and in 'groups' view,
            // ensure parallax is set up if it isn't already.
            if (!isMobile && currentView === 'groups' && !isParallaxSetup) {
                console.log("Desktop 'groups' view, ensuring parallax is set up.");
                setupParallax();
            }
             // Ensure parallax is destroyed if somehow still active on mobile or calendar view
            if (isMobile || currentView === 'calendar') {
                destroyParallax();
            }
        }
        console.log("--- checkScreenSize finished ---");
    }


    // --- Event Listeners ---

    // Group Item Clicks
    groupItems.forEach(item => {
        item.addEventListener('click', () => {
            // If calendar is active, switch back to groups view first
            if (currentView === 'calendar') {
                switchView('groups');
            }

            console.log(isMobile ? 'Mobile Click' : 'Desktop Click', `on group: ${item.dataset.groupName}`);
            groupItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            showEventView(item);
        });
    });

    // Back Button Click (Mobile only, for group events view)
    backButtonGroup?.addEventListener('click', () => {
        console.log("Back button clicked");
         // This button only exists in the 'groups' view context
         if (currentView === 'groups') {
            showGroupListView(); // Should handle removing mobile-event-view-active
         }
    });

    // View Tab Clicks
    groupsTab?.addEventListener('click', () => switchView('groups'));
    calendarTab?.addEventListener('click', () => switchView('calendar'));

    // Calendar Navigation Clicks
    prevMonthButton?.addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() - 1);
        renderCalendar(calendarDate.getFullYear(), calendarDate.getMonth());
    });

    nextMonthButton?.addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() + 1);
        renderCalendar(calendarDate.getFullYear(), calendarDate.getMonth());
    });


    // Window Resize Handler (Debounced)
    window.addEventListener('resize', () => {
        // console.log("Resize event detected..."); // Less noisy log
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            console.log("Debounced resize executing checkScreenSize...");
            checkScreenSize();
        }, 250);
    });

    // --- Initial Setup ---
    checkScreenSize(); // Run once on load to set initial screen state

    // Set initial view based on `currentView` state ('groups' by default)
    switchView(currentView); // Initialize view correctly

    // Set initial group header if starting in 'groups' view
    if (currentView === 'groups') {
        const initiallyActiveGroup = document.querySelector('.group-item.active');
        if (initiallyActiveGroup) {
             updateHeader(initiallyActiveGroup);
             // Only setup parallax if desktop
             if (!isMobile) {
                 setupParallax(); // Attempt setup
             }
        } else {
            updateHeader(null); // Set default header if no group selected
        }
    }
    // Calendar is rendered by switchView if it's the initial view

    console.log("Planner UI script initialized.");

}); // End DOMContentLoaded