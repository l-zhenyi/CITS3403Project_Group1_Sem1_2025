document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const plannerPane = document.getElementById('planner-pane');
    const groupListArea = document.querySelector('.group-list-area');
    const eventCollageArea = document.getElementById('event-collage');
    const groupItems = document.querySelectorAll('.group-item');
    const backButtonGroup = document.getElementById('back-to-groups-button');
    const activeGroupNameEl = document.getElementById('active-group-name');
    const activeGroupAvatarEl = document.getElementById('active-group-avatar');
    const collageContainer = eventCollageArea; // Alias for clarity

    // --- State Variables ---
    let panelData = [];
    let isMobile = window.innerWidth <= 768; // Initialize based on initial width
    let isParallaxSetup = false;
    let parallaxScrollHandler = null;
    let resizeTimer;

    console.log(`Initial state: ${isMobile ? 'Mobile' : 'Desktop'}`);

    // --- Header Update Function ---
    function updateHeader(groupElement) {
        const groupName = groupElement?.dataset.groupName || 'Group Events'; // Default name
        const groupAvatar = groupElement?.dataset.groupAvatar || 'https://via.placeholder.com/36'; // Default avatar
        if (activeGroupNameEl) activeGroupNameEl.textContent = `${groupName} Events`;
        if (activeGroupAvatarEl) activeGroupAvatarEl.src = groupAvatar.replace('/40/', '/36/'); // Ensure correct size if needed
    }

    // --- Parallax Effect Functions ---
    function setupParallax() {
        // Don't setup if no container, already setup, or currently mobile
        if (!collageContainer || isParallaxSetup || isMobile) {
             // console.log(`Parallax setup skipped. isParallaxSetup: ${isParallaxSetup}, isMobile: ${isMobile}`);
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
                // Ensure transform is treated as a matrix for robust Z extraction
                const matrix = new DOMMatrixReadOnly(style.transform);
                const z = matrix.is2D ? 0 : matrix.m43; // Get translateZ value

                // Store the original inline style *before* making changes
                const originalInlineTransform = panel.style.transform || '';

                // Extract existing rotation and Z-translation if they were inline
                const rotateMatch = originalInlineTransform.match(/rotate(?:Z|3d)?\([^)]+\)/);
                const baseRotate = rotateMatch ? rotateMatch[0] : '';
                const translateZMatch = originalInlineTransform.match(/translateZ\([^)]+\)/);
                const baseTranslateZ = translateZMatch ? translateZMatch[0] : '';

                // Apply absolute positioning if not already applied (needed for parallax)
                // Be cautious if elements already rely on different positioning
                if (style.position !== 'absolute' && style.position !== 'fixed' && style.position !== 'sticky') {
                     // console.warn(`Panel ${index} is not absolutely positioned. Applying 'absolute'. This might affect layout.`);
                     panel.style.position = 'absolute';
                     panel.style.top = panel.style.top || '0px'; // Ensure top/left are set if changing position
                     panel.style.left = panel.style.left || '0px';
                }


                panelData.push({
                    element: panel,
                    originalInlineTransform: originalInlineTransform, // Store the original for restoration
                    baseRotate: baseRotate,
                    baseTranslateZ: baseTranslateZ,
                    parallaxFactorY: 1 + z / 200, // Adjust divisor for sensitivity
                    parallaxFactorX: Math.sin(z / 50), // Factor for sway calculation
                    swayAmplitude: (Math.random() - 0.5) * 20 // Random sway amount per panel
                });
            } catch (e) {
                console.error(`Error processing panel ${index} for parallax:`, e, panel);
            }
        });

        let ticking = false;
        parallaxScrollHandler = () => {
            // Extra checks inside handler
            if (isMobile || !panelData.length || ticking || !collageContainer) return;

            ticking = true;
            window.requestAnimationFrame(() => {
                if (!collageContainer) { // Check again inside RAF
                    ticking = false;
                    return;
                }
                const scrollTop = collageContainer.scrollTop;

                panelData.forEach(data => {
                    if (!data || !data.element) return; // Guard against missing data/elements
                    // Calculate new positions based on scroll
                    const offsetY = -scrollTop * (1 - data.parallaxFactorY) * 0.1; // Adjust multiplier for effect strength
                    const sway = Math.sin(scrollTop * 0.01 + data.parallaxFactorX) * data.swayAmplitude; // Sway effect

                    // Apply transforms, preserving original rotation/Z-translation
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
        parallaxScrollHandler(); // Apply initial parallax state
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
            // Restore original inline transform style
            if (data && data.element && data.element.style) {
                data.element.style.transform = data.originalInlineTransform;
                // Consider restoring original position if it was changed?
                // If setupParallax applied 'position: absolute', you might need
                // to store the original position and restore it here too.
                // For now, we assume position is handled externally or fixed.
            }
        });

        panelData = []; // Clear the panel data
        isParallaxSetup = false;
        console.log("Parallax destroyed.");
    }

    // --- View Switching Functions ---
    function showEventView(groupElement) {
        if (!plannerPane || !groupElement) return;

        console.log(`Showing event view for group: ${groupElement.dataset.groupName}`);
        updateHeader(groupElement); // Update header with selected group

        // Only add the class for mobile view switching
        if (isMobile) {
            plannerPane.classList.add('mobile-event-view-active');
        }

        // Always reset scroll position when showing events
        if (eventCollageArea) eventCollageArea.scrollTop = 0;
    }

    function showGroupListView() {
        if (!plannerPane) return;
        console.log("Showing group list view");

        // Only remove the class for mobile view switching
        if (isMobile) {
            plannerPane.classList.remove('mobile-event-view-active');
            // Reset group list scroll (optional, but good UX)
            if (groupListArea) groupListArea.scrollTop = 0;
        }
        // On Desktop, showing the "group list view" doesn't visually change panes
        // but we might want to reset the header to a default state if no group is 'active'
        if (!isMobile) {
             const active = document.querySelector('.group-item.active');
             if(!active) {
                 updateHeader(null); // Update to default header if no group selected
             }
        }
    }

    // --- Responsive Logic ---
    function checkScreenSize() {
        console.log("--- checkScreenSize called ---"); // DEBUG: Confirm function execution
        const currentlyMobile = window.innerWidth <= 768;
        const wasMobile = isMobile; // Capture previous state

        console.log(`State Check: Current Width=${window.innerWidth}, currentlyMobile=${currentlyMobile}, wasMobile=${wasMobile}`); // DEBUG: Log states

        // Only proceed if the state actually changed
        if (currentlyMobile !== wasMobile) {
            console.log(`!!! Screen state CHANGED from ${wasMobile ? 'Mobile' : 'Desktop'} to ${currentlyMobile ? 'Mobile' : 'Desktop'} !!!`); // DEBUG: Log state change

            isMobile = currentlyMobile; // Update the global state *after* detecting a change

            if (isMobile) {
                // Transitioning TO Mobile (was Desktop)
                console.log("Transitioning TO Mobile actions...");
                destroyParallax(); // Parallax not needed on mobile
                // *** FIX: Always show group list when switching TO mobile ***
                showGroupListView();
                // Ensure the main pane class reflects the change (showGroupListView handles this)
            } else {
                // Transitioning TO Desktop (was Mobile)
                console.log("Transitioning TO Desktop actions...");
                // Ensure the mobile-specific class is removed (restores two-pane layout via CSS)
                if(plannerPane) plannerPane.classList.remove('mobile-event-view-active');
                // Re-setup parallax for desktop view
                setupParallax();
                // Update header based on active group, if any (important after potential mobile view)
                const activeGroup = document.querySelector('.group-item.active');
                 if (activeGroup) {
                     updateHeader(activeGroup);
                     // Ensure event view scroll is reset if coming from mobile where it wasn't visible
                     if (eventCollageArea) eventCollageArea.scrollTop = 0;
                 } else {
                     updateHeader(null); // Set default header if no group is active
                 }
            }
        } else {
             console.log("Screen state did NOT change."); // DEBUG: Log no change
             // If state didn't change, but we are on desktop and parallax isn't set up, set it up.
             // This handles the initial desktop load case correctly via the initial call.
             if (!isMobile && !isParallaxSetup) {
                 console.log("Desktop state, ensuring parallax is set up.");
                 setupParallax();
             }
             // Ensure the global state is still up-to-date even if no transition,
             // although it should be correct if `currentlyMobile !== wasMobile` was false.
             isMobile = currentlyMobile;
        }
        console.log("--- checkScreenSize finished ---"); // DEBUG: Confirm function end
    }

    // --- Event Listeners ---

    // Group Item Clicks
    groupItems.forEach(item => {
        item.addEventListener('click', () => {
            // Debounce or prevent rapid clicks if necessary
            console.log(isMobile ? 'Mobile Click' : 'Desktop Click', `on group: ${item.dataset.groupName}`);

            // Update active state styling
            groupItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // Show the event view for the clicked group
            showEventView(item); // This function now handles mobile vs desktop display internally
        });
    });

    // Back Button Click (Mobile only)
    backButtonGroup?.addEventListener('click', () => {
        console.log("Back button clicked");
        showGroupListView(); // Reverts to the list view on mobile
    });

    // Window Resize Handler (Debounced)
    window.addEventListener('resize', () => {
        console.log("Resize event detected..."); // DEBUG: Confirm event listener fires
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            console.log("Debounced resize executing checkScreenSize..."); // DEBUG: Confirm debounced call
            checkScreenSize();
        }, 250); // 250ms delay
    });

    // --- Initial Setup ---
    checkScreenSize(); // Run once on load to set initial state and setup parallax if needed

    // Optional: Set initial header if needed (e.g., if no group is active by default)
     const initiallyActiveGroup = document.querySelector('.group-item.active');
     if (!initiallyActiveGroup) {
         updateHeader(null); // Set default header
     } else if (!isMobile) {
         updateHeader(initiallyActiveGroup); // Set header if desktop and a group is active
     }
     // On mobile, the header updates when a group is clicked


     console.log("Planner UI script initialized.");

}); // End DOMContentLoaded