// --- START OF FILE orbitLayoutDOM.js ---
// REVISED: Removed hasOrbitRsvpListener flag, added entry log to handler

window.draggingAllowed ??= true;

console.log("[OrbitLayoutDOM Strict Class v14 LayoutAnim + RSVP Sync v3 + Cleanup Fix v2] Module Loaded."); // Updated version

// --- Configuration ---
const defaultConfig = {
    N: 12,                      // Max items per ring
    centralRadius: 60,          // Base radius from center (can be auto-adjusted)
    ringPadding: 10,            // Padding between central node and first ring
    ringGap: 8,                 // Gap between subsequent rings
    circleSpacing: 4,           // Minimum gap between circles on the same ring circumference
    minCircleRadius: 5,         // Smallest allowed circle radius
    hoverScale: 2,            // Scale factor on hover
    clickScale: 3.0,            // Scale factor on click
    animationSpeed: 0.16,       // Lerp factor (0 to 1)
    repulsionPadding: 4,        // Extra padding during collision resolution
    repulsionIterations: 5,     // How many times to push elements apart
    nudgeFactor: 0.05,          // How strongly non-interacted elements return to origin (0 to 1)
};

// --- Helper Functions ---
function lerp(a, b, t) { return a * (1 - t) + b * t; }
function distance(x1, y1, x2, y2) { const dx = x2 - x1; const dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); }

export class OrbitLayoutManager {
    // --- Internal Constants ---
    static referenceDiameter = 100; // px
    static referenceFontSize = 6;  // px

    // --- State variables ---
    nodeEl = null; eventEls = []; config = {}; elementDataStore = new WeakMap(); activeElements = new Set(); animationFrameId = null; nodeCenterX = 0; nodeCenterY = 0; centralNodeCollisionRadius = 0; nodeInfo = {}; isRunning = false; // isRunning tracks *animation state* primarily
    instanceId = `orbit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`; // Unique ID for logging

    // --- RSVP Status Update Handler (Bound reference) ---
    _boundHandleRsvpUpdate = this._handleRsvpUpdate.bind(this);


    constructor(nodeEl, eventEls, options = {}) {
        const nodeDesc = nodeEl?.id || nodeEl?.tagName || 'Unknown Node';
        console.log(`%c[OrbitLayoutDOM ${this.instanceId}] Creating for node: ${nodeDesc}`, "color: darkcyan; font-weight: bold;");
        if (!nodeEl) { throw new Error(`[OrbitLayoutDOM ${this.instanceId}] ERROR: Central node element not provided.`); }
        this.nodeEl = nodeEl;
        this.eventEls = Array.isArray(eventEls) ? [...eventEls] : (eventEls instanceof NodeList ? Array.from(eventEls) : (eventEls ? [eventEls] : []));
        this.config = { ...defaultConfig, ...options };
        // console.log(`[OrbitLayoutDOM ${this.instanceId}] Using Configuration:`, this.config);


        // --- ADD EVENT LISTENER ---
        // REMOVED the check for document.hasOrbitRsvpListener
        // Always attempt to add the listener for this instance.
        // If the same function for the same event/target is already attached,
        // the browser typically ignores subsequent adds.
        try {
            document.addEventListener('rsvpUpdated', this._boundHandleRsvpUpdate);
            // Added log to confirm attachment attempt per instance
            console.log(`%c[OrbitLayoutDOM ${this.instanceId}] Attached document listener for rsvpUpdated.`, "color: blue;");
        } catch (e) {
             console.error(`%c[OrbitLayoutDOM ${this.instanceId}] FAILED to attach document listener for rsvpUpdated:`, "color: red;", e);
        }
        // --- End Listener Add ---


        this.performLayout(); // Populates _eventData, calculates positions
        // Note: isRunning is set to true within performLayout/startAnimationLoop if successful
    }

    // --- Core Layout Method ---
    performLayout() {
        const nodeDesc = this.nodeEl?.id || this.nodeEl?.tagName || 'Unknown Node';
        console.log(`%c[OrbitLayoutDOM ${this.instanceId}] Performing layout for: ${nodeDesc}`, "color: darkcyan;");
        this.isRunning = false; // Reset animation state flag
        if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; }

        if (!this.nodeEl) { console.error(`[OrbitLayoutDOM ${this.instanceId}] Layout aborted: Central node missing.`); return; }
        const container = this.nodeEl.offsetParent;
        if (!container) { console.error(`%c[OrbitLayoutDOM ${this.instanceId}] FATAL ERROR: offsetParent null for ${nodeDesc}`, "color: red; font-weight: bold;"); return; }
        const nodeLayoutX = this.nodeEl.offsetLeft; const nodeLayoutY = this.nodeEl.offsetTop; this.nodeCenterX = nodeLayoutX + this.nodeEl.offsetWidth / 2; this.nodeCenterY = nodeLayoutY + this.nodeEl.offsetHeight / 2; const autoRadius = Math.max(this.nodeEl.offsetWidth, this.nodeEl.offsetHeight) / 2; this.centralNodeCollisionRadius = Math.max(autoRadius, this.config.centralRadius || 0); this.config.centralRadius = this.centralNodeCollisionRadius; this.nodeInfo = { centerX: this.nodeCenterX, centerY: this.nodeCenterY, radius: this.centralNodeCollisionRadius };
        const N = this.config.N; const totalEvents = this.eventEls.length; if (totalEvents === 0 || N <= 0) { console.log(`[OrbitLayoutDOM ${this.instanceId}] No events or N<=0, stopping layout for ${nodeDesc}.`); return; } const numRings = Math.ceil(totalEvents / N); let eventIndex = 0; let lastOrbitRadius_Layout = this.config.centralRadius; let lastCircleRadius = 0; const angleOffset = -Math.PI / 2;

        // Clear previous active elements for THIS instance
        this.activeElements.clear();

        for (let ringIdx = 0; ringIdx < numRings; ringIdx++) {
            const ringIndex = ringIdx + 1; const isLastRing = (ringIndex === numRings); const numCirclesActualThisRing = isLastRing ? (totalEvents - eventIndex) : N; if (numCirclesActualThisRing <= 0) break; let estimatedOrbitRadius, finalOrbitRadius, circleRadius; if (ringIndex === 1) { estimatedOrbitRadius = lastOrbitRadius_Layout + this.config.ringPadding + this.config.minCircleRadius; } else { estimatedOrbitRadius = lastOrbitRadius_Layout + lastCircleRadius + this.config.ringGap + this.config.minCircleRadius; } const circumference = 2 * Math.PI * estimatedOrbitRadius; const idealRadiusBasedOnN = Math.max(0, (circumference / N - this.config.circleSpacing) / 2); circleRadius = Math.max(this.config.minCircleRadius, idealRadiusBasedOnN); if (ringIndex === 1) { finalOrbitRadius = lastOrbitRadius_Layout + this.config.ringPadding + circleRadius; } else { finalOrbitRadius = lastOrbitRadius_Layout + lastCircleRadius + this.config.ringGap + circleRadius; } const angleStep = (2 * Math.PI) / N; const startAngle = (ringIndex % 2 === 0) ? angleOffset + angleStep / 2 : angleOffset;

            for (let i = 0; i < numCirclesActualThisRing; i++) {
                if (eventIndex >= totalEvents) break; const el = this.eventEls[eventIndex]; if (!el) { eventIndex++; continue; }

                // --- CRITICAL: Assume _eventData {id, ..., current_user_rsvp_status} is attached externally ---
                if (!el._eventData || typeof el._eventData.id === 'undefined') {
                    console.warn(`[OrbitLayoutDOM ${this.instanceId}] Element is missing _eventData or _eventData.id. Skipping RSVP features for:`, el.id || el);
                }

                if (!el.classList.contains('event-panel')) { console.warn("Element missing 'event-panel' class.", el.id || el); }
                this.activeElements.add(el); // Add to active set HERE
                const angle = startAngle + i * angleStep; const diameter = circleRadius * 2; const initialTargetCenterX = this.nodeCenterX + finalOrbitRadius * Math.cos(angle); const initialTargetCenterY = this.nodeCenterY + finalOrbitRadius * Math.sin(angle); const initialTargetLeft = initialTargetCenterX - diameter / 2; const initialTargetTop = initialTargetCenterY - diameter / 2;

                this._ensureContentWrappers(el); // Create wrappers

                // Apply styles
                el.style.position = 'absolute'; el.style.width = `${diameter}px`; el.style.height = `${diameter}px`; el.style.borderRadius = '50%'; el.style.left = `${initialTargetLeft.toFixed(3)}px`; el.style.top = `${initialTargetTop.toFixed(3)}px`;
                el.style.transform = 'none'; el.style.willChange = 'width, height, left, top, font-size'; el.style.transition = 'none'; el.style.overflow = 'hidden';
                el.style.setProperty('--current-diameter', `${diameter.toFixed(3)}px`);
                const initialFontSize = (diameter / OrbitLayoutManager.referenceDiameter) * OrbitLayoutManager.referenceFontSize;
                el.style.fontSize = `${initialFontSize.toFixed(3)}px`;

                // Store state (Store eventId as number)
                const eventIdNum = el._eventData?.id ? parseInt(el._eventData.id, 10) : null;
                 if (isNaN(eventIdNum) && el._eventData?.id) {
                      console.warn(`[OrbitLayoutDOM ${this.instanceId}] Could not parse event ID '${el._eventData.id}' as number for element:`, el.id || el);
                 }
                const data = {
                    initialX: initialTargetCenterX, initialY: initialTargetCenterY, initialRadius: circleRadius,
                    initialWidth: diameter, initialHeight: diameter,
                    currentX: initialTargetCenterX, currentY: initialTargetCenterY,
                    currentWidth: diameter, currentHeight: diameter, currentScale: 1,
                    targetX: initialTargetCenterX, targetY: initialTargetCenterY, targetScale: 1,
                    isHovered: false, isClicked: false, originalZIndex: el.style.zIndex || '1',
                    config: this.config, nodeInfo: this.nodeInfo,
                    eventId: eventIdNum, // Store as number
                    _eventDataRef: el._eventData // Keep a reference to the original data object
                };
                this.elementDataStore.set(el, data);

                // Ensure expanded content structure exists
                this._ensureExpandedContentDiv(el);

                this._setupHoverInteraction(el);
                this._setupClickInteraction(el);
                eventIndex++;
            }
            lastOrbitRadius_Layout = finalOrbitRadius; lastCircleRadius = circleRadius; if (eventIndex >= totalEvents) break;
        }
        // console.log(`%c[OrbitLayoutDOM ${this.instanceId}] Static layout finished for ${this.activeElements.size} elements.`, "color: darkcyan;");
        this._startAnimationLoop(); // Attempt to start animation
    }

    // --- Collision Resolution ---
    _resolveDomCollisions(elementsData) {
         const iterations = this.config.repulsionIterations; const padding = this.config.repulsionPadding; if (iterations === 0 || elementsData.length === 0) return; const centralX = this.nodeInfo.centerX; const centralY = this.nodeInfo.centerY; const centralRadius = this.nodeInfo.radius; for (let iter = 0; iter < iterations; iter++) { for (let i = 0; i < elementsData.length; i++) { for (let j = i + 1; j < elementsData.length; j++) { const aData = elementsData[i]; const bData = elementsData[j]; const aRadius = aData.initialRadius * aData.targetScale; const bRadius = bData.initialRadius * bData.targetScale; const ax = aData.targetX; const ay = aData.targetY; const bx = bData.targetX; const by = bData.targetY; const targetDist = distance(ax, ay, bx, by); const requiredDist = aRadius + bRadius + padding; if (targetDist < requiredDist && targetDist > 0.01) { const overlap = requiredDist - targetDist; const angle = Math.atan2(by - ay, bx - ax); const aIsFixed = aData.isHovered || aData.isClicked; const bIsFixed = bData.isHovered || bData.isClicked; let pushFactorA = 0.5; let pushFactorB = 0.5; if (aIsFixed && bIsFixed) { pushFactorA = 0; pushFactorB = 0; } else if (aIsFixed) { pushFactorA = 0; pushFactorB = 1; } else if (bIsFixed) { pushFactorA = 1; pushFactorB = 0; } if (pushFactorA + pushFactorB > 0) { const totalPushFactorInv = 1.0 / (pushFactorA + pushFactorB); const pushX = Math.cos(angle) * overlap * totalPushFactorInv; const pushY = Math.sin(angle) * overlap * totalPushFactorInv; aData.targetX -= pushX * pushFactorA; aData.targetY -= pushY * pushFactorA; bData.targetX += pushX * pushFactorB; bData.targetY += pushY * pushFactorB; } } } } for (let i = 0; i < elementsData.length; i++) { const elData = elementsData[i]; const elRadius = elData.initialRadius * elData.targetScale; const elX = elData.targetX; const elY = elData.targetY; const distFromCenter = distance(centralX, centralY, elX, elY); const requiredDistFromCenter = centralRadius + elRadius + padding; if (distFromCenter < requiredDistFromCenter && distFromCenter > 0.01) { const overlap = requiredDistFromCenter - distFromCenter; const angle = Math.atan2(elY - centralY, elX - centralX); elData.targetX += Math.cos(angle) * overlap; elData.targetY += Math.sin(angle) * overlap; } } } const nudgeFactor = this.config.nudgeFactor; elementsData.forEach(data => { if (!data.isHovered && !data.isClicked) { data.targetX = lerp(data.targetX, data.initialX, nudgeFactor); data.targetY = lerp(data.targetY, data.initialY, nudgeFactor); } }); elementsData.forEach(data => { const elRadius = data.initialRadius * data.targetScale; const dist = distance(centralX, centralY, data.targetX, data.targetY); const requiredDist = centralRadius + elRadius + padding; if (dist < requiredDist) { const angle = Math.atan2(data.targetY - centralY, data.targetX - centralX) || 0; data.targetX = centralX + Math.cos(angle) * requiredDist; data.targetY = centralY + Math.sin(angle) * requiredDist; } });
    }


    // --- Animation Step ---
     _animationStep = () => {
        // if (!this.isRunning) { // Check removed as it's reset at the start of the loop
        //     this.animationFrameId = null;
        //     return;
        // }
        this.animationFrameId = null; // Assume loop will stop unless needed

        let needsAnotherFrame = false;
        const elementsData = [];
        const currentActiveElements = new Set(this.activeElements);

        currentActiveElements.forEach(el => {
            // Check element exists in DOM AND is still tracked by this instance's datastore
            if (document.body.contains(el) && this.elementDataStore.has(el)) {
                elementsData.push(this.elementDataStore.get(el));
            } else {
                // Cleanup elements removed from DOM or no longer in instance data
                 console.log(`%c[OrbitLayoutDOM ${this.instanceId}] Cleaning up element during animation step (removed from DOM/instance):`, el.id || el, "color: grey;");

                 // Perform robust listener cleanup for this specific element
                 if (el._orbitCleanups) { // Check if the Map property exists
                    if (el._orbitCleanups.has(this)) { // Check if this instance has an entry
                         try {
                             const cleanupFunc = el._orbitCleanups.get(this);
                             if(typeof cleanupFunc === 'function') cleanupFunc();
                             el._orbitCleanups.delete(this);
                             if (el._orbitCleanups.size === 0) delete el._orbitCleanups;
                         } catch (e) {
                              console.error(`[OrbitLayoutDOM ${this.instanceId}] Error during animation step element removal cleanup execution:`, e, el);
                         }
                     }
                 }

                if (this.elementDataStore.has(el)) {
                    this.elementDataStore.delete(el);
                }
                this.activeElements.delete(el); // Remove from THIS instance's active set
            }
        });

        if (elementsData.length === 0 && this.activeElements.size === 0) {
            this.isRunning = false; // Stop animation if no elements left for this instance
            console.log(`%c[OrbitLayoutDOM ${this.instanceId}] All elements cleaned up or removed. Stopping animation loop.`, "color: grey");
            return;
        }

        this._resolveDomCollisions(elementsData);

        for (const data of elementsData) {
            // Find the corresponding element *safely* from the current active set
            const el = Array.from(this.activeElements).find(element => this.elementDataStore.get(element) === data);
            if (!el) continue; // Skip if element somehow got removed between checks

            const speed = data.config.animationSpeed;

            // Lerp position and scale
            data.currentX = lerp(data.currentX, data.targetX, speed);
            data.currentY = lerp(data.currentY, data.targetY, speed);
            data.currentScale = lerp(data.currentScale, data.targetScale, speed);

            // Calculate current dimensions based on lerped scale
            data.currentWidth = data.initialWidth * data.currentScale;
            data.currentHeight = data.initialHeight * data.currentScale;

            const currentLeft = data.currentX - data.currentWidth / 2;
            const currentTop = data.currentY - data.currentHeight / 2;
            const currentDiameter = data.currentWidth;

            // Calculate proportional font size
            const currentFontSize = (currentDiameter / OrbitLayoutManager.referenceDiameter) * OrbitLayoutManager.referenceFontSize;
            const clampedFontSize = Math.max(0.1, currentFontSize);

            // Check if animation is still needed for this element
            const dx = data.targetX - data.currentX;
            const dy = data.targetY - data.currentY;
            const dScale = data.targetScale - data.currentScale;
            const posThreshold = 0.1;
            const scaleThreshold = 0.005;

            if (Math.abs(dx) > posThreshold || Math.abs(dy) > posThreshold || Math.abs(dScale) > scaleThreshold) {
                needsAnotherFrame = true;
            } else {
                // Snap to final state if close enough
                data.currentX = data.targetX;
                data.currentY = data.targetY;
                data.currentScale = data.targetScale;
                data.currentWidth = data.initialWidth * data.targetScale;
                data.currentHeight = data.initialHeight * data.targetScale;
                // Recalculate final positions based on snapped values
                const finalLeft = data.targetX - data.currentWidth / 2;
                const finalTop = data.targetY - data.currentHeight / 2;
                const finalDiameter = data.currentWidth;
                const finalFontSize = (finalDiameter / OrbitLayoutManager.referenceDiameter) * OrbitLayoutManager.referenceFontSize;

                // Apply snapped styles
                el.style.left = `${finalLeft.toFixed(3)}px`;
                el.style.top = `${finalTop.toFixed(3)}px`;
                el.style.width = `${data.currentWidth.toFixed(3)}px`;
                el.style.height = `${data.currentHeight.toFixed(3)}px`;
                el.style.setProperty('--current-diameter', `${finalDiameter.toFixed(3)}px`);
                el.style.fontSize = `${Math.max(0.1, finalFontSize).toFixed(3)}px`;
            }

            // Apply interpolated styles for the current frame (always apply even if snapping for consistency)
            el.style.left = `${currentLeft.toFixed(3)}px`;
            el.style.top = `${currentTop.toFixed(3)}px`;
            el.style.width = `${data.currentWidth.toFixed(3)}px`;
            el.style.height = `${data.currentHeight.toFixed(3)}px`;
            el.style.transform = 'none';
            el.style.setProperty('--current-diameter', `${currentDiameter.toFixed(3)}px`);
            el.style.fontSize = `${clampedFontSize.toFixed(3)}px`;

            // Update z-index and content visibility
            el.style.zIndex = (data.isHovered || data.isClicked) ? '10' : data.originalZIndex;
            this._updateContentVisibility(el, data.isClicked);
        } // End for loop

        // Request next frame if needed
        if (needsAnotherFrame) {
            this.isRunning = true; // Mark animation as active
            this.animationFrameId = requestAnimationFrame(this._animationStep);
        } else {
            this.isRunning = false; // Mark animation as settled
            // console.log(`%c[OrbitLayoutDOM ${this.instanceId}] Animation loop settled.`, "color: grey");
        }
    }


    // --- Start Animation Loop ---
     _startAnimationLoop() {
        if (!this.animationFrameId && this.activeElements.size > 0) {
            // console.log(`%c[OrbitLayoutDOM ${this.instanceId}] Starting animation loop...`, "color: green");
            this.isRunning = true; // Explicitly set running state
            this.animationFrameId = requestAnimationFrame(this._animationStep);
        } else if (this.activeElements.size === 0) {
            this.isRunning = false; // Ensure stopped if no elements
        }
    }

    // --- Helper for Ensuring Content Wrappers ---
     _ensureContentWrappers(panel) {
        const originalContentClass = 'orbit-element-original-content';
        const expandedContentClass = 'orbit-element-expanded-content';

        let originalContentWrapper = panel.querySelector(`.${originalContentClass}`);
        if (!originalContentWrapper) {
            originalContentWrapper = document.createElement('div');
            originalContentWrapper.className = originalContentClass;

            // Move existing direct children (except expanded content div) into the original wrapper
            const nodesToMove = [];
            for (let i = panel.childNodes.length - 1; i >= 0; i--) {
                const node = panel.childNodes[i];
                // Only move nodes that are not the expanded content div itself
                if (!(node.nodeType === Node.ELEMENT_NODE && node.classList.contains(expandedContentClass))) {
                    nodesToMove.push(node);
                }
            }
            // Append them in the original order
            nodesToMove.reverse().forEach(node => originalContentWrapper.appendChild(node));

            // Insert the original wrapper before the expanded one if it exists, otherwise just append
            const expandedContent = panel.querySelector(`.${expandedContentClass}`);
            if (expandedContent) {
                panel.insertBefore(originalContentWrapper, expandedContent);
            } else {
                panel.appendChild(originalContentWrapper);
            }
        }

        // Ensure expanded content div structure exists (or create it)
        this._ensureExpandedContentDiv(panel);
    }


    // --- Helper for Expanded Content Div & Initial RSVP Status ---
    _ensureExpandedContentDiv(panel) {
        const containerClass = 'orbit-element-expanded-content';
        let expandedDiv = panel.querySelector(`.${containerClass}`);

        if (!expandedDiv) {
            expandedDiv = document.createElement('div');
            expandedDiv.className = containerClass;
            expandedDiv.classList.add('glassy'); // Add base class for styling

            // Safely access event data attached to the panel
            const event = panel._eventData || {};
            // console.log(`[Debug _ensureExpandedContentDiv] Creating content for panel:`, panel.id, 'Event Data:', event);

            const initialStatus = event.current_user_rsvp_status; // Expect 'attending', 'maybe', 'declined', null
            // console.log(`[Debug _ensureExpandedContentDiv] Initial Status Read:`, initialStatus, `(Type: ${typeof initialStatus})`);

            let statusClass = 'status-unknown'; // Default CSS class
            let statusText = 'RSVP?'; // Default display text

            // --- Map status to class and text ---
            if (initialStatus === 'attending') {
                statusClass = 'status-attending'; statusText = 'Attending';
            } else if (initialStatus === 'maybe') {
                statusClass = 'status-maybe'; statusText = 'Maybe';
            } else if (initialStatus === 'declined') {
                statusClass = 'status-declined'; statusText = 'Declined';
            } else if (initialStatus === null) { // Handle cleared/no status explicitly
                statusClass = 'status-cleared'; statusText = 'Cleared'; // Or 'RSVP?' if preferred
            }

            // Format date safely
            const formattedDate = event.date instanceof Date && !isNaN(event.date.getTime())
                ? event.date.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                : "Date Placeholder";

            const eventData = {
                title: event.title || "Event Title Placeholder",
                date: formattedDate,
                location: event.location || "Location Placeholder",
                statusClass: statusClass, // Use determined class
                statusText: statusText, // Use determined text
                logoUrl: event.image_url || null, // Handle null logo URL
                details: event.description || "No extra details available.",
                cost: event.cost_display || null, // Handle null cost
                id: event.id || '' // Ensure ID is available for button
            };

            // --- Grid Structure (Complete) ---
            expandedDiv.innerHTML = `
            <div class="expanded-grid-container-v2">
              <!-- HEADER -->
              <div class="grid-item event-header">
                <div class="event-logo-wrapper">
                  <img src="${eventData.logoUrl || '/static/img/default-event-logo.png'}" alt="Event Logo" class="event-logo-img">
                </div>
                <div class="event-title-wrapper content-box">
                  <div class="title-scroll">${eventData.title}</div>
                </div>
              </div>

              <!-- STATUS (Uses initial status) -->
              <div class="grid-item event-status ${eventData.statusClass}">
                <span class="status-pill">${eventData.statusText}</span>
              </div>

              <!-- TIME/PLACE/DETAILS -->
              <div class="grid-item event-timeplace content-box">
                <div class="timeplace-content">
                  <p>📅 <strong>Date:</strong> ${eventData.date}</p>
                  <p>📍 <strong>Location:</strong> ${eventData.location}</p>
                  ${eventData.cost ? `<p>💲 <strong>Cost:</strong> ${eventData.cost}</p>` : ''}
                  ${eventData.details ? `<p class="extra-details">📝 ${eventData.details}</p>` : ''}
                </div>
              </div>

              <!-- MORE INFO BUTTON -->
              <div class="grid-item more-info">
                <button class="button info-button" data-event-id="${eventData.id}">More Info</button>
              </div>
            </div>
            `;
            // --- End Grid Structure ---

            panel.appendChild(expandedDiv);

            // --- Add event listener for the "More Info" button ---
             const moreInfoButton = expandedDiv.querySelector('.info-button');
             if (moreInfoButton) {
                 const buttonClickListener = (e) => {
                     e.stopPropagation(); // Prevent panel click trigger
                     const eventId = e.currentTarget.dataset.eventId;
                     const panelEventData = panel._eventData; // Use data attached to the panel
                     if (eventId && panelEventData) {
                         // Dispatch event for main application to catch and open modal
                         const openModalEvent = new CustomEvent('openEventModalRequest', {
                             detail: { eventData: panelEventData }, // Send the full data object
                             bubbles: true, composed: true
                         });
                         document.dispatchEvent(openModalEvent);
                         // console.log(`[OrbitLayoutDOM ${this.instanceId}] 'More Info' clicked for event ${eventId}. Requesting modal open.`);
                     } else {
                         console.warn(`[OrbitLayoutDOM ${this.instanceId}] 'More Info' button clicked, but event ID or panel._eventData missing.`, eventId, panelEventData);
                     }
                 };
                 moreInfoButton.addEventListener('click', buttonClickListener);
                 moreInfoButton._clickListener = buttonClickListener; // Store for cleanup
             }
        }

        // Ensure it starts hidden (display: none)
        if (expandedDiv.style.display !== 'none') {
            expandedDiv.style.display = 'none';
        }
        return expandedDiv;
    }

    // --- Helper for Content Visibility ---
    _updateContentVisibility(panel, showExpanded) {
        const expandedDiv = panel.querySelector('.orbit-element-expanded-content');
        const originalContentDiv = panel.querySelector('.orbit-element-original-content');
        const originalDisplay = 'flex'; // Or 'block', match your CSS
        const expandedDisplay = 'flex'; // Or 'block', match your CSS
        let changed = false;

        if (originalContentDiv) {
            const targetDisplay = showExpanded ? 'none' : originalDisplay;
            if (originalContentDiv.style.display !== targetDisplay) {
                originalContentDiv.style.display = targetDisplay; changed = true;
            }
            // Use class for semantic state, not just display
            if (originalContentDiv.classList.contains('hidden') !== showExpanded) {
                originalContentDiv.classList.toggle('hidden', showExpanded);
            }
        }
        if (expandedDiv) {
            const targetDisplay = showExpanded ? expandedDisplay : 'none';
            if (expandedDiv.style.display !== targetDisplay) {
                expandedDiv.style.display = targetDisplay; changed = true;
                // Use rAF for smoother transition trigger when showing
                if (showExpanded) {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => { // Double rAF ensures style change is applied before class add
                             expandedDiv.classList.add('visible'); // Add class for opacity transition
                        });
                    });
                } else {
                    expandedDiv.classList.remove('visible'); // Remove class for fade-out
                }
            }
        }
        // if (changed) console.log(`[VisibilityChange] Panel ${panel.id}, ShowExpanded: ${showExpanded}`); // Debug
    }

    // --- Setup Hover Interaction ---
    _setupHoverInteraction(panel) {
        const listenerFlag = '_orbitHoverListenersAttached_v14_rsvp';
        if (panel[listenerFlag]) return; // Avoid duplicate listeners

        const handlePointerEnter = (event) => {
             const data = this.elementDataStore.get(panel);
             // Allow hover only if not clicked and instance has data
             if (!data || data.isClicked || data.isHovered) return;
             // Also consider animation state if needed: if (!this.isRunning && !data?.isClicked) return;

             data.isHovered = true;
             data.targetScale = data.config.hoverScale;

             // Optionally de-hover others (can cause flickering if not careful)
             // this.activeElements.forEach(el => { ... });

             this._startAnimationLoop(); // Ensure animation runs for scaling up
        };

        const handlePointerLeave = (event) => {
             const data = this.elementDataStore.get(panel);
             if (!data) return; // No data, nothing to do

             let needsAnim = false;
             if (data.isHovered) {
                 data.isHovered = false;
                 // Only scale back if NOT clicked
                 if (!data.isClicked) {
                     data.targetScale = 1;
                     needsAnim = true;
                 }
             }
             // Removed auto-unclick on pointer leave - requires explicit click outside
             if (needsAnim) this._startAnimationLoop(); // Start anim if scaling back
        };

        panel.addEventListener('pointerenter', handlePointerEnter);
        panel.addEventListener('pointerleave', handlePointerLeave);
        panel[listenerFlag] = { enter: handlePointerEnter, leave: handlePointerLeave }; // Store listeners

        // --- Store cleanup function specific to this instance ---
        if (!panel._orbitCleanups) panel._orbitCleanups = new Map();
        const cleanupFunc = () => {
            // console.log(`[Cleanup] Removing hover listeners for instance ${this.instanceId} on panel ${panel.id}`); // Debug
            panel.removeEventListener('pointerenter', handlePointerEnter);
            panel.removeEventListener('pointerleave', handlePointerLeave);
            delete panel[listenerFlag]; // Remove the flag indicating listeners are attached
            // Note: Map entry is deleted in _cleanupInstance or updateLayout
        };
        panel._orbitCleanups.set(this, cleanupFunc); // Map instance -> cleanup function
    }

    // --- Setup Click Interaction ---
     _setupClickInteraction(panel) {
        const clickListenerFlag = '_orbitClickListenersAttached_v14_rsvp';
        if (panel[clickListenerFlag]) return; // Avoid duplicate listeners

        const handleClick = (event) => {
            // Prevent click action if the 'More Info' button was the target
            if (event.target.closest('.more-info button.info-button')) {
                // console.log(`[OrbitLayoutDOM ${this.instanceId}] Click ignored (target was 'More Info' button).`);
                return; // Stop processing here, let button listener handle it
            }

            const data = this.elementDataStore.get(panel);
            // Allow click/unclick even if animation isn't running.
            // Check dragging flag - only allow click if viewport dragging is off OR if this panel is already clicked (to allow unclicking)
            if ((!window.draggingAllowed && !(data && data.isClicked)) || !data) {
                 // console.log(`[OrbitLayoutDOM ${this.instanceId}] Click ignored (dragging=${window.draggingAllowed}, isClicked=${data?.isClicked})`);
                 return;
            }

            if (data.isClicked) {
                 // --- Unclick this panel ---
                 console.log(`%c[OrbitLayoutDOM ${this.instanceId}] Unclicking panel: ${panel.id}`, "color: orange");
                 this._unclickPanel(panel, data); // This also enables viewport dragging
            } else {
                 // --- Click this panel ---
                 console.log(`%c[OrbitLayoutDOM ${this.instanceId}] Clicking panel: ${panel.id}`, "color: green");
                 // Unclick any other currently clicked panel within this instance
                 this.activeElements.forEach(el => {
                     if (el !== panel) {
                         const otherData = this.elementDataStore.get(el);
                         if (otherData && otherData.isClicked) {
                             this._unclickPanel(el, otherData); // Unclick the other one
                         }
                         // Also ensure hover state is off for others when clicking one
                         if (otherData) otherData.isHovered = false;
                     }
                 });
                 window.draggingAllowed = false; // Disable viewport drag when an item is expanded/clicked
                 data.isClicked = true;
                 data.isHovered = false; // Explicitly turn off hover state when clicking
                 data.targetScale = data.config.clickScale; // Set target scale for click
            }
            this._startAnimationLoop(); // Trigger animation to handle scale/position/visibility changes
        };

        panel.addEventListener('click', handleClick);
        panel[clickListenerFlag] = handleClick; // Store listener reference

        // --- Store cleanup function specific to this instance ---
        if (!panel._orbitCleanups) panel._orbitCleanups = new Map();
        const cleanupFunc = () => {
            // console.log(`[Cleanup] Removing click listener for instance ${this.instanceId} on panel ${panel.id}`); // Debug
            panel.removeEventListener('click', handleClick);
            delete panel[clickListenerFlag]; // Remove the flag
            // Note: Map entry is deleted in _cleanupInstance or updateLayout
        };
        panel._orbitCleanups.set(this, cleanupFunc); // Map instance -> cleanup function
    }

    // --- Helper to Unclick a Panel ---
    _unclickPanel(panel, data) {
        window.draggingAllowed = true; // Re-enable viewport drag FIRST
        if (!data || !data.isClicked) return; // Only proceed if it was actually clicked
        data.isClicked = false;
        data.targetScale = 1; // Target scale back to normal
        // Animation loop will handle the visual change (_startAnimationLoop is called after this)
    }

    // --- Handle RSVP Update Event (with Logging) ---
    // Handles the 'rsvpUpdated' event dispatched from modalManager
    _handleRsvpUpdate(event) {
        // --- ADDED LOG AT THE START ---
        console.log(`%c[OrbitLayoutDOM ${this.instanceId}] _handleRsvpUpdate CALLED. Event detail:`, "color: magenta;", event.detail);

        const { eventId, newStatus } = event.detail; // Expect eventId (number), newStatus ('attending', 'maybe', 'declined', null)

        // Check if the event contains valid data
        if (typeof eventId !== 'number') { // Check type explicitly
            console.warn(`[OrbitLayoutDOM ${this.instanceId}] Received rsvpUpdated event without a numeric eventId. Detail:`, event.detail);
            return;
        }

        let foundPanel = false;
        // Iterate through the elements managed by THIS specific instance
        for (const panel of this.activeElements) {
            const data = this.elementDataStore.get(panel);

            // Compare numeric eventId stored in the element's data
            if (data && data.eventId === eventId) {
                foundPanel = true;
                // console.log(`[OrbitLayoutDOM ${this.instanceId}] Found matching panel for event ID ${eventId}:`, panel.id || panel); // Debug

                // Find the UI elements within the panel's expanded content
                const expandedDiv = panel.querySelector('.orbit-element-expanded-content');
                const statusContainer = expandedDiv ? expandedDiv.querySelector('.event-status') : null;
                const statusPill = statusContainer ? statusContainer.querySelector('.status-pill') : null;

                if (statusContainer && statusPill) {
                    let statusClass = 'status-unknown';
                    let statusText = 'RSVP?';

                    // Map newStatus to CSS class and display text
                    if (newStatus === 'attending') { statusClass = 'status-attending'; statusText = 'Attending'; }
                    else if (newStatus === 'maybe') { statusClass = 'status-maybe'; statusText = 'Maybe'; }
                    else if (newStatus === 'declined') { statusClass = 'status-declined'; statusText = 'Declined'; }
                    else if (newStatus === null) { statusClass = 'status-cleared'; statusText = 'Cleared'; } // Or 'RSVP?'

                    // console.log(`[OrbitLayoutDOM ${this.instanceId}] Applying Class: '${statusClass}', Text: '${statusText}'`); // Debug

                    // Update UI elements directly
                    statusContainer.className = `grid-item event-status ${statusClass}`; // Replace all relevant classes
                    statusPill.textContent = statusText;

                    // Update internal data cache stored on the element (panel._eventData)
                    if (panel._eventData) {
                        panel._eventData.current_user_rsvp_status = newStatus;
                         // console.log(`[OrbitLayoutDOM ${this.instanceId}] Updated internal _eventData status for ${eventId}`); // Debug
                    }
                     console.log(`%c[OrbitLayoutDOM ${this.instanceId}] Successfully updated UI for event ${eventId}.`, "color: green;");
                } else {
                    console.warn(`[OrbitLayoutDOM ${this.instanceId}] Could not find status pill/container elements within panel for event ${eventId}. Cannot update UI.`);
                }
                break; // Found the panel managed by this instance, stop looping
            }
        } // End for loop

         // This log is normal if multiple OrbitLayout instances exist
         if (!foundPanel) {
             console.log(`%c[OrbitLayoutDOM ${this.instanceId}] No active panel found matching event ID ${eventId} in *this* instance.`, "color: grey;");
         }
    }


    // --- Internal Cleanup Helper ---
    _cleanupInstance(keepNodeEl = false) {
        const nodeDesc = this.nodeEl?.id || this.nodeEl?.tagName || 'Unknown Node';
        console.log(`%c[OrbitLayoutDOM ${this.instanceId}] Cleaning up instance for node: ${nodeDesc}`, "color: red;");
        this.isRunning = false; // Ensure animation state is off
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null;
        }

        // --- Global Listener ---
        // We do NOT remove the global listener here. It's potentially shared.
        // document.removeEventListener('rsvpUpdated', this._boundHandleRsvpUpdate); // NO!

        const elementsToClean = new Set(this.activeElements);
        elementsToClean.forEach(el => {
            // --- Clean up expanded content and styles FIRST ---
            const expandedDiv = el.querySelector('.orbit-element-expanded-content');
            if (expandedDiv && expandedDiv.parentElement === el) {
                const moreInfoButton = expandedDiv.querySelector('.info-button');
                if (moreInfoButton && moreInfoButton._clickListener) {
                    moreInfoButton.removeEventListener('click', moreInfoButton._clickListener);
                    delete moreInfoButton._clickListener;
                }
                 try { el.removeChild(expandedDiv); } catch (e) { /* ignore if already removed */ }
            }
            const originalContent = el.querySelector('.orbit-element-original-content');
            if (originalContent) {
                originalContent.style.display = '';
                originalContent.classList.remove('hidden');
            }
            el.style.cssText = '';
            el.style.removeProperty('--current-diameter');

            // --- Listener Cleanup (Using Robust Logic) ---
            if (el._orbitCleanups) { // 1. Check if the Map *property* exists first
                if (el._orbitCleanups.has(this)) { // 2. Check if *this* instance has an entry in the map
                    try {
                        const cleanupFunc = el._orbitCleanups.get(this); // Get the cleanup function for this instance
                        if (typeof cleanupFunc === 'function') {
                            cleanupFunc(); // Execute the stored cleanup function (removes listeners)
                        } else {
                             console.warn(`[OrbitLayoutDOM ${this.instanceId}] Cleanup entry for instance was not a function for element:`, el.id);
                        }

                        // 3. Remove *this* instance's entry from the Map
                        el._orbitCleanups.delete(this);

                        // 4. Check if the Map is now empty *after* removing this instance's entry
                        if (el._orbitCleanups.size === 0) {
                            // console.log(`[OrbitLayoutDOM ${this.instanceId}] Deleting empty _orbitCleanups map from element:`, el.id); // Optional debug log
                            delete el._orbitCleanups; // Remove the Map property itself from the element
                        }
                    } catch (e) {
                        // Error occurred during the execution of the cleanupFunc() itself
                        console.error(`[OrbitLayoutDOM ${this.instanceId}] Error during execution of listener cleanup function:`, e, el);
                        // Avoid trying complex cleanup here; the primary issue was logged.
                    }
                }
                // If map exists but !has(this), do nothing for this instance.
            }
            // If el._orbitCleanups didn't exist at all, do nothing.

            this.elementDataStore.delete(el); // Remove instance-specific data
        }); // End forEach elementToClean

        this.activeElements.clear(); // Clear the set for this instance

        if (!keepNodeEl) {
            this.nodeEl = null; this.eventEls = []; this.nodeInfo = {};
        }
         console.log(`%c[OrbitLayoutDOM ${this.instanceId}] Instance cleanup finished. KeepNode: ${keepNodeEl}`, "color: red;");
    }


    // --- Public Methods ---
    updateLayout(newEventEls = null) {
         const nodeDesc = this.nodeEl?.id || this.nodeEl?.tagName || 'Unknown Node';
         if (!this.nodeEl) { console.warn(`[OrbitLayoutDOM ${this.instanceId}] updateLayout called on an instance without a node. Aborting.`); return; }
         console.log(`%c[OrbitLayoutDOM ${this.instanceId}] updateLayout called for node: ${nodeDesc}`, "color: blueviolet;");
        this.isRunning = false; // Stop current animation
        if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; }

        const newElementsArray = newEventEls === null ? this.eventEls : (Array.isArray(newEventEls) ? [...newEventEls] : (newEventEls instanceof NodeList ? Array.from(newEventEls) : (newEventEls ? [newEventEls] : [])));
        const newElementsSet = new Set(newElementsArray);
        const oldElementsSet = new Set(this.activeElements); // Use current active elements
        const elementsToRemove = new Set();
        // const elementsToAdd = new Set(newElementsArray); // We don't actually need elementsToAdd explicitly

        // Determine which old elements are being removed
        oldElementsSet.forEach(oldEl => {
            if (!newElementsSet.has(oldEl)) {
                 elementsToRemove.add(oldEl);
            } // else { elementsToAdd.delete(oldEl); } // Keep existing ones implicitly
        });

        // Clean up elements that are being removed (using the same revised logic as _cleanupInstance)
        elementsToRemove.forEach(oldEl => {
             console.log(`%c[OrbitLayoutDOM ${this.instanceId}] Removing element during update: ${oldEl.id || 'Unnamed Element'}`, "color: orange");

             // --- Expanded Content & Style Cleanup ---
             const expandedDiv = oldEl.querySelector('.orbit-element-expanded-content');
             if (expandedDiv && expandedDiv.parentElement === oldEl) { const moreInfoButton = expandedDiv.querySelector('.info-button'); if (moreInfoButton && moreInfoButton._clickListener) { moreInfoButton.removeEventListener('click', moreInfoButton._clickListener); delete moreInfoButton._clickListener; } try { oldEl.removeChild(expandedDiv); } catch(e) { /* ignore */ } }
             const originalContent = oldEl.querySelector('.orbit-element-original-content');
             if (originalContent) { originalContent.style.display = ''; originalContent.classList.remove('hidden'); }
             oldEl.style.cssText = ''; oldEl.style.removeProperty('--current-diameter');

             // --- Listener Cleanup (Revised Logic) ---
             if (oldEl._orbitCleanups) { // Check if Map property exists
                 if (oldEl._orbitCleanups.has(this)) { // Check if this instance has entry
                     try {
                         const cleanupFunc = oldEl._orbitCleanups.get(this);
                         if(typeof cleanupFunc === 'function') cleanupFunc(); // Execute cleanup
                         oldEl._orbitCleanups.delete(this); // Remove entry for this instance
                         if (oldEl._orbitCleanups.size === 0) delete oldEl._orbitCleanups; // Delete Map if empty
                     } catch(e) {
                         console.error(`[OrbitLayoutDOM ${this.instanceId}] Error during updateLayout's element removal cleanup execution:`, e, oldEl);
                     }
                 }
             }

             this.elementDataStore.delete(oldEl); // Remove instance data for the removed element
             // Note: We don't need to call this.activeElements.delete(oldEl) here,
             // because performLayout will rebuild the activeElements set from scratch.
        });

        // IMPORTANT: Ensure elements in newElementsArray have _eventData attached externally BEFORE calling updateLayout
        this.eventEls = newElementsArray; // Update the internal list to the new list
        this.performLayout(); // Re-runs layout for the updated list, rebuilds activeElements, attaches listeners, starts anim loop
        // console.log(`%c[OrbitLayoutDOM ${this.instanceId}] updateLayout finished. Animation Running: ${this.isRunning}`, "color: blueviolet;");
    }


    updateConfiguration(newOptions) {
         const nodeDesc = this.nodeEl?.id || this.nodeEl?.tagName || 'Unknown Node';
         console.log(`[OrbitLayoutDOM ${this.instanceId}] Updating configuration for node ${nodeDesc}:`, newOptions);
         if (!this.nodeEl && this.activeElements.size === 0) { console.warn(`[OrbitLayoutDOM ${this.instanceId}] Attempted to update configuration on destroyed instance.`); return; }

         const oldCentralRadius = this.config.centralRadius;
         const oldHoverScale = this.config.hoverScale;
         const oldClickScale = this.config.clickScale;
         this.config = { ...this.config, ...newOptions };

         // Recalculate central node collision radius if necessary
         if ('centralRadius' in newOptions && this.nodeInfo && oldCentralRadius !== this.config.centralRadius && this.nodeEl) {
             const autoRadius = Math.max(this.nodeEl.offsetWidth, this.nodeEl.offsetHeight) / 2;
             this.centralNodeCollisionRadius = Math.max(autoRadius, this.config.centralRadius || 0);
             this.config.centralRadius = this.centralNodeCollisionRadius;
             this.nodeInfo.radius = this.centralNodeCollisionRadius;
         }

         let scaleChanged = ('hoverScale' in newOptions && oldHoverScale !== this.config.hoverScale) ||
                            ('clickScale' in newOptions && oldClickScale !== this.config.clickScale);

         // Update data store for active elements
         this.activeElements.forEach(el => {
             const data = this.elementDataStore.get(el);
             if (data) {
                 data.config = this.config; // Update config reference
                 data.nodeInfo = this.nodeInfo; // Update nodeInfo reference
                 // Update target scale if scale config changed and element is affected
                 if (scaleChanged) {
                     if (data.isClicked && 'clickScale' in newOptions) {
                         data.targetScale = this.config.clickScale;
                     } else if (data.isHovered && 'hoverScale' in newOptions && !data.isClicked) {
                         data.targetScale = this.config.hoverScale;
                     }
                     // Note: If neither clicked nor hovered, targetScale remains 1 implicitly
                 }
             }
         });

         // If dynamic properties changed, restart animation to apply them
         if ('animationSpeed' in newOptions || 'repulsionPadding' in newOptions ||
             'repulsionIterations' in newOptions || 'nudgeFactor' in newOptions ||
             ('centralRadius' in newOptions && oldCentralRadius !== this.config.centralRadius) || // Trigger if radius changes
             scaleChanged)
         {
             this._startAnimationLoop();
         }
    }


    destroy() {
         const nodeDesc = this.nodeEl ? this.nodeEl.id || this.nodeEl.tagName : 'Unknown Node';
         console.log(`%c[OrbitLayoutDOM ${this.instanceId}] Destroying instance for node: ${nodeDesc}`, "color: red; font-weight: bold;");
         // --- Listener Removal ---
         // We remove the listener specifically bound to THIS instance from the document.
         // It's okay if other instances still have their listeners attached.
         try {
            document.removeEventListener('rsvpUpdated', this._boundHandleRsvpUpdate);
            console.log(`%c[OrbitLayoutDOM ${this.instanceId}] Removed document listener for rsvpUpdated.`, "color: orange;");
         } catch(e) {
             console.error(`%c[OrbitLayoutDOM ${this.instanceId}] Error removing document listener during destroy:`, "color: red;", e);
         }

         this._cleanupInstance(false); // Full cleanup (removes nodeEl ref, etc.)

         // Note: The global listener removal above is now done per-instance.
    }

} // End Class OrbitLayoutManager
// --- END OF FILE orbitLayoutDOM.js ---