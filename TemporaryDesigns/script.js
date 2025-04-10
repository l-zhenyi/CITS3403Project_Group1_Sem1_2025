document.addEventListener('DOMContentLoaded', () => {
    const plannerPane = document.getElementById('planner-pane');
    const groupListArea = document.querySelector('.group-list-area');
    const eventCollageArea = document.getElementById('event-collage');
    const groupItems = document.querySelectorAll('.group-item');
    const backButtonGroup = document.getElementById('back-to-groups-button');
    const activeGroupNameEl = document.getElementById('active-group-name');
    const activeGroupAvatarEl = document.getElementById('active-group-avatar');

    // --- Parallax Logic (Keep for Desktop) ---
    const collageContainer = eventCollageArea; // Use the already selected element
    let panelData = []; // Initialize empty
    let isMobile = window.innerWidth <= 768; // Check initial screen size
    let isParallaxSetup = false; // Track if parallax listeners are active
    let parallaxScrollHandler = null; // To store the bound scroll handler

    function setupParallax() {
        if (!collageContainer || isMobile || isParallaxSetup) return;
    
        panelData = []; // Clear before recalculating
        const panels = Array.from(collageContainer.querySelectorAll('.event-panel'));
    
        panels.forEach(panel => {
            const initialInlineTransform = panel.style.transform || ''; // Get the ORIGINAL inline style
    
            // --- Try to extract components (Best effort parsing) ---
            // Match common rotate functions (rotate, rotateZ, rotate3d)
            const rotateMatch = initialInlineTransform.match(/rotate(?:Z|3d)?\([^)]+\)/) || initialInlineTransform.match(/rotate\([^)]+\)/);
            const baseRotate = rotateMatch ? rotateMatch[0] : '';
    
            // Match translateZ
            const translateZMatch = initialInlineTransform.match(/translateZ\([^)]+\)/);
            const baseTranslateZ = translateZMatch ? translateZMatch[0] : '';
    
            // --- Get Z value for parallax calculation (separate from applying the function) ---
             // Use regex first, fallback to matrix parsing
            let initialZ = 0;
            const translateZValueMatch = initialInlineTransform.match(/translateZ\(\s*([-0-9.]+)(?:px)?\s*\)/);
            if (translateZValueMatch) {
                 initialZ = parseFloat(translateZValueMatch[1]);
            } else {
                // Fallback: Try reading from computed matrix if inline parsing fails
                const style = window.getComputedStyle(panel);
                const matrix = new DOMMatrixReadOnly(style.transform);
                 if (matrix.is2D === false) { // Only check m43 (z translation) for 3D matrix
                     initialZ = matrix.m43; // Note: m43 is perspective-aware, might differ slightly from pure translateZ
                }
                 // If still zero, check translateZ component specifically if matrix exists
                 // This part is complex and often not needed if inline style is reliable
            }
            // --- End Z value extraction ---
    
            // Ensure desktop styles are set
            panel.style.position = 'absolute';
            panel.style.top = panel.style.top || '0px'; // Keep original or default
            panel.style.left = panel.style.left || '0px'; // Keep original or default
            // IMPORTANT: Re-apply the original transform initially if parallax calculation needs it
            // Or ensure the parallax handler applies the base parts correctly from frame 0
            // Let's rely on the handler applying base parts
    
    
            panelData.push({
                element: panel,
                originalInlineTransform: initialInlineTransform, // Store the full original for potential restoration
                originalTop: panel.style.top,
                originalLeft: panel.style.left,
                // Store the extracted *functional parts*
                baseRotate: baseRotate,
                baseTranslateZ: baseTranslateZ,
                // Use calculated Z for parallax factors
                parallaxFactorY: 1 + initialZ / 200,
                parallaxFactorX: Math.sin(initialZ / 50),
                swayAmplitude: (Math.random() - 0.5) * 20
            });
        });
    
        // --- Parallax Scroll Handler ---
        let ticking = false;
        parallaxScrollHandler = () => {
             if (isMobile || !panelData.length || ticking) return;
    
             ticking = true;
             window.requestAnimationFrame(() => {
                 const scrollTop = collageContainer.scrollTop;
    
                 panelData.forEach(data => {
                     if (!data.element || !data.element.style) return;
    
                     const offsetY = -scrollTop * (1 - data.parallaxFactorY) * 0.1;
                     const sway = Math.sin(scrollTop * 0.01 + data.parallaxFactorX) * data.swayAmplitude;
                     const offsetX = sway;
    
                     // Reconstruct transform ORDER MATTERS: Translate first, then apply base rotate/Z
                     data.element.style.transform = `
                         translateY(${offsetY}px)
                         translateX(${offsetX}px)
                         ${data.baseRotate || ''}        /* Re-apply base rotation */
                         ${data.baseTranslateZ || ''}    /* Re-apply base Z translation */
                     `;
                 });
                 ticking = false;
             });
        };
    
        collageContainer.addEventListener('scroll', parallaxScrollHandler);
        isParallaxSetup = true;
        // Trigger initial calculation/application of base transforms
        if (parallaxScrollHandler) parallaxScrollHandler();
    }
    
    // 2. Modify checkScreenSize - REMOVE transform reset for mobile transition
    
    function checkScreenSize() {
        const currentlyMobile = window.innerWidth <= 768;
        if (currentlyMobile !== isMobile) {
            isMobile = currentlyMobile;
            if (isMobile) {
                // Transitioning TO mobile
                destroyParallax();
                if (plannerPane && plannerPane.classList.contains('mobile-event-view-active')) {
                    showGroupListView();
                }
                 // Let CSS handle ALL style resets for mobile panels
                 const panels = collageContainer?.querySelectorAll('.event-panel');
                 panels?.forEach(panel => {
                     // ONLY reset things explicitly needed if CSS isn't enough
                     // panel.style.position = ''; // CSS should handle
                     // panel.style.transform = ''; // <-- REMOVE THIS LINE! Let CSS override.
                 });
    
            } else {
                // Transitioning TO desktop
                 if (plannerPane) plannerPane.classList.remove('mobile-event-view-active');
                 // Update header based on current active group
                 const currentActiveGroup = document.querySelector('.group-item.active');
                 if (currentActiveGroup) {
                     // ... (update header code) ...
                 }
                 // Setup parallax, which will re-apply absolute pos & base transforms
                 setupParallax();
            }
        } else if (!isMobile && !isParallaxSetup) {
            setupParallax();
        }
    }
    
    // 3. Modify destroyParallax - Ensure original inline transform is restored (optional but safer)
    
    function destroyParallax() {
        if (!collageContainer || !isParallaxSetup) return;
    
        if (parallaxScrollHandler) {
           collageContainer.removeEventListener('scroll', parallaxScrollHandler);
           parallaxScrollHandler = null;
        }
    
        panelData.forEach(data => {
           if (data.element && data.element.style) {
               // Restore the original inline transform when destroying
               // This helps if CSS override isn't perfect or when switching back
               data.element.style.transform = data.originalInlineTransform || '';
               // Let CSS handle position/top/left for mobile view
               // data.element.style.position = '';
               // data.element.style.top = '';
               // data.element.style.left = '';
           }
        });
        panelData = [];
        isParallaxSetup = false;
    }


    // --- Mobile View Switching Logic ---
    function showEventView(groupElement) {
        if (!isMobile) return; // Only run this logic on mobile

        // Update header
        const groupName = groupElement.dataset.groupName || 'Group Events';
        const groupAvatar = groupElement.dataset.groupAvatar || 'https://via.placeholder.com/36';
        if (activeGroupNameEl) activeGroupNameEl.textContent = groupName + " Events";
        if (activeGroupAvatarEl) activeGroupAvatarEl.src = groupAvatar.replace('/40/', '/36/');

        // Add class to switch view via CSS
        if (plannerPane) plannerPane.classList.add('mobile-event-view-active');

         // Scroll event view to top
         if(eventCollageArea) eventCollageArea.scrollTop = 0;
    }

    function showGroupListView() {
        if (!isMobile) return; // Only run on mobile

        // Remove class to switch view via CSS
        if (plannerPane) plannerPane.classList.remove('mobile-event-view-active');

         // Scroll group list to top (optional)
         if (groupListArea) groupListArea.scrollTop = 0;
    }

    // Event Listeners
    groupItems.forEach(item => {
        item.addEventListener('click', () => {
            // Update active state for visual feedback (works on both desktop/mobile)
            groupItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            const groupName = item.dataset.groupName || 'Group Events';
            const groupAvatar = item.dataset.groupAvatar || 'https://via.placeholder.com/36';

            // Update header immediately (needed for both modes)
            if (activeGroupNameEl) activeGroupNameEl.textContent = groupName + " Events";
            if (activeGroupAvatarEl) activeGroupAvatarEl.src = groupAvatar.replace('/40/', '/36/');

            // Trigger mobile view switch or desktop update
            if (isMobile) {
                showEventView(item);
            } else {
                // On desktop, ensure event area is scrolled to top when switching groups
                 if(eventCollageArea) eventCollageArea.scrollTop = 0;
                // Maybe re-fetch/filter event data here for the selected group in a real app
            }
        });
    });

    if (backButtonGroup) {
        backButtonGroup.addEventListener('click', () => {
            showGroupListView();
        });
    }

    // --- Responsive Handling ---
    function checkScreenSize() {
        const currentlyMobile = window.innerWidth <= 768;
        if (currentlyMobile !== isMobile) {
            isMobile = currentlyMobile;
            if (isMobile) {
                // Transitioning TO mobile
                destroyParallax();
                // Ensure mobile view class reflects reality (usually defaults to list)
                 if (plannerPane && plannerPane.classList.contains('mobile-event-view-active')) {
                    showGroupListView();
                 }
                 // Ensure CSS handles panel positioning/styling
                 // Only reset styles dynamically added by JS (like transform)
                  const panels = collageContainer?.querySelectorAll('.event-panel');
                  panels?.forEach(panel => {
                      panel.style.position = ''; // Let CSS rule take over (optional, CSS should handle)
                      // Don't clear top/left - let CSS mobile rules apply
                      panel.style.transform = ''; // Reset transform added by JS
                  });

            } else {
                // Transitioning TO desktop
                 // Ensure mobile view class is removed
                 if (plannerPane) plannerPane.classList.remove('mobile-event-view-active');
                 // Re-apply necessary desktop styles & setup parallax
                 // (CSS should handle most structural changes)
                 // Update active group header based on current '.active' group item
                 const currentActiveGroup = document.querySelector('.group-item.active');
                 if (currentActiveGroup) {
                     const groupName = currentActiveGroup.dataset.groupName || 'Group Events';
                     const groupAvatar = currentActiveGroup.dataset.groupAvatar || 'https://via.placeholder.com/36';
                     if (activeGroupNameEl) activeGroupNameEl.textContent = groupName + " Events";
                     if (activeGroupAvatarEl) activeGroupAvatarEl.src = groupAvatar.replace('/40/', '/36/');
                 }
                 // Delay parallax setup slightly to allow CSS transitions to finish? Might not be needed.
                 // setTimeout(setupParallax, 50);
                 setupParallax();
            }
        } else if (!isMobile && !isParallaxSetup) {
            // If starting on desktop and parallax wasn't setup yet (e.g., initial load)
            setupParallax();
        }
    }

    // Initial Setup
    checkScreenSize(); // Run on load to set initial state & setup parallax if needed

    // Listen for resize events (debounced)
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(checkScreenSize, 250);
    });

});