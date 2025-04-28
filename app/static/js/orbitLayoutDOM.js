// --- START OF FILE orbitLayoutDOM_v5_StrictClass_LayoutAnim_v14_SharpNative_ProportionalContent.js ---
// FINAL FINAL FINAL FINAL: Layout Animation + Robust Visibility + State Fixes + PROPORTIONAL CONTENT SCALING
// - NO parent scale transform. Animates width/height/left/top.
// - Uses display:none for robust hiding.
// - Relies on EXTERNAL CSS + uses --current-diameter for internal size.
// - Ensures click state cleanly cancels hover state.
// - NEW: Dynamically scales content font-size based on element diameter for proportional rendering.
// - REQUIREMENT: External CSS MUST use 'em' units for content styling.

window.draggingAllowed ??= true;

console.log("[OrbitLayoutDOM Strict Class v14 LayoutAnim SHARP NATIVE Proportional Content] Module Loaded.");

// --- Configuration (Keep layout anim defaults) ---
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

// --- NO CSS INJECTION ---


export class OrbitLayoutManager {
    // --- Internal Constants for Proportional Scaling ---
    // Defines the baseline: e.g., a 100px diameter circle should have a 10px base font size.
    // Content CSS should use 'em' units relative to this.
    static referenceDiameter = 100; // px
    static referenceFontSize = 6;  // px

    // ... (State variables - same as v13) ...
    nodeEl = null; eventEls = []; config = {}; elementDataStore = new WeakMap(); activeElements = new Set(); animationFrameId = null; nodeCenterX = 0; nodeCenterY = 0; centralNodeCollisionRadius = 0; nodeInfo = {}; isRunning = false;

    constructor(nodeEl, eventEls, options = {}) {
        console.log(`%c[OrbitLayoutDOM v14 SharpNative PropContent] Creating for node:`, "color: darkcyan; font-weight: bold;", nodeEl);
        if (!nodeEl) { throw new Error("[OrbitLayoutDOM v14 SharpNative PropContent] ERROR: Central node element not provided."); }
        this.nodeEl = nodeEl; this.eventEls = Array.isArray(eventEls) ? [...eventEls] : (eventEls instanceof NodeList ? Array.from(eventEls) : (eventEls ? [eventEls] : [])); this.config = { ...defaultConfig, ...options }; console.log("[OrbitLayoutDOM v14 SharpNative PropContent] Using Configuration:", this.config); this.performLayout(); this.isRunning = true;
    }

    // --- Core Layout Method ---
    performLayout() {
        console.log(`%c[OrbitLayoutDOM v14 SharpNative PropContent] Performing layout for:`, "color: darkcyan;", this.nodeEl);
        // ... (Setup, center calc - same as v13) ...
        if (!this.nodeEl) { console.error("[OrbitLayoutDOM v14 SharpNative PropContent] Layout aborted: Central node missing."); return; } this._cleanupInstance(true); const container = this.nodeEl.offsetParent; if (!container) { console.error(`%c[OrbitLayoutDOM v14 SharpNative PropContent] FATAL ERROR: offsetParent null`, "color: red; font-weight: bold;", this.nodeEl); this.isRunning = false; return; } const nodeLayoutX = this.nodeEl.offsetLeft; const nodeLayoutY = this.nodeEl.offsetTop; this.nodeCenterX = nodeLayoutX + this.nodeEl.offsetWidth / 2; this.nodeCenterY = nodeLayoutY + this.nodeEl.offsetHeight / 2; const autoRadius = Math.max(this.nodeEl.offsetWidth, this.nodeEl.offsetHeight) / 2; this.centralNodeCollisionRadius = Math.max(autoRadius, this.config.centralRadius || 0); this.config.centralRadius = this.centralNodeCollisionRadius; this.nodeInfo = { centerX: this.nodeCenterX, centerY: this.nodeCenterY, radius: this.centralNodeCollisionRadius };
        const N = this.config.N; const totalEvents = this.eventEls.length; if (totalEvents === 0 || N <= 0) { this.isRunning = false; return; } const numRings = Math.ceil(totalEvents / N); let eventIndex = 0; let lastOrbitRadius_Layout = this.config.centralRadius; let lastCircleRadius = 0; const angleOffset = -Math.PI / 2;

        for (let ringIdx = 0; ringIdx < numRings; ringIdx++) {
            // ... (Ring geom calc - same) ...
            const ringIndex = ringIdx + 1; const isLastRing = (ringIndex === numRings); const numCirclesActualThisRing = isLastRing ? (totalEvents - eventIndex) : N; if (numCirclesActualThisRing <= 0) break; let estimatedOrbitRadius, finalOrbitRadius, circleRadius; if (ringIndex === 1) { estimatedOrbitRadius = lastOrbitRadius_Layout + this.config.ringPadding + this.config.minCircleRadius; } else { estimatedOrbitRadius = lastOrbitRadius_Layout + lastCircleRadius + this.config.ringGap + this.config.minCircleRadius; } const circumference = 2 * Math.PI * estimatedOrbitRadius; const idealRadiusBasedOnN = Math.max(0, (circumference / N - this.config.circleSpacing) / 2); circleRadius = Math.max(this.config.minCircleRadius, idealRadiusBasedOnN); if (ringIndex === 1) { finalOrbitRadius = lastOrbitRadius_Layout + this.config.ringPadding + circleRadius; } else { finalOrbitRadius = lastOrbitRadius_Layout + lastCircleRadius + this.config.ringGap + circleRadius; } const angleStep = (2 * Math.PI) / N; const startAngle = (ringIndex % 2 === 0) ? angleOffset + angleStep / 2 : angleOffset;

            for (let i = 0; i < numCirclesActualThisRing; i++) {
                if (eventIndex >= totalEvents) break; const el = this.eventEls[eventIndex]; if (!el) { eventIndex++; continue; }
                if (!el.classList.contains('event-panel')) { console.warn("Element missing 'event-panel' class.", el); }
                this.activeElements.add(el); const angle = startAngle + i * angleStep; const diameter = circleRadius * 2; const initialTargetCenterX = this.nodeCenterX + finalOrbitRadius * Math.cos(angle); const initialTargetCenterY = this.nodeCenterY + finalOrbitRadius * Math.sin(angle); const initialTargetLeft = initialTargetCenterX - diameter / 2; const initialTargetTop = initialTargetCenterY - diameter / 2;

                // Ensure content wrappers exist
                this._ensureContentWrappers(el);

                // Apply minimal required dynamic styles
                el.style.position = 'absolute'; el.style.width = `${diameter}px`; el.style.height = `${diameter}px`; el.style.borderRadius = '50%'; el.style.left = `${initialTargetLeft.toFixed(3)}px`; el.style.top = `${initialTargetTop.toFixed(3)}px`;
                el.style.transform = 'none'; el.style.willChange = 'width, height, left, top, font-size'; // Add font-size
                el.style.transition = 'none'; el.style.overflow = 'hidden';
                el.style.setProperty('--current-diameter', `${diameter.toFixed(3)}px`);
                // Set initial font size (can be recalculated in anim loop anyway)
                const initialFontSize = (diameter / OrbitLayoutManager.referenceDiameter) * OrbitLayoutManager.referenceFontSize;
                el.style.fontSize = `${initialFontSize.toFixed(3)}px`;

                // Store state (same as v13)
                const data = { /* ... same as v13 state ... */
                    initialX: initialTargetCenterX, initialY: initialTargetCenterY, initialRadius: circleRadius,
                    initialWidth: diameter, initialHeight: diameter,
                    currentX: initialTargetCenterX, currentY: initialTargetCenterY,
                    currentWidth: diameter, currentHeight: diameter, currentScale: 1,
                    targetX: initialTargetCenterX, targetY: initialTargetCenterY, targetScale: 1,
                    isHovered: false, isClicked: false, originalZIndex: el.style.zIndex || '1',
                    config: this.config, nodeInfo: this.nodeInfo
                };
                this.elementDataStore.set(el, data);
                this._ensureExpandedContentDiv(el); // Creates the hidden HTML overlay structure
                this._setupHoverInteraction(el); this._setupClickInteraction(el); eventIndex++;
            }
            lastOrbitRadius_Layout = finalOrbitRadius; lastCircleRadius = circleRadius; if (eventIndex >= totalEvents) break;
        }
        console.log(`%c[OrbitLayoutDOM v14 SharpNative PropContent] Static layout finished for ${this.activeElements.size} elements.`, "color: darkcyan;"); this.isRunning = true; this._startAnimationLoop();
    }

    // --- Collision Resolution (No changes needed) ---
    _resolveDomCollisions(elementsData) { /* ... Same as v13 ... */ const iterations = this.config.repulsionIterations; const padding = this.config.repulsionPadding; if (iterations === 0 || elementsData.length === 0) return; const centralX = this.nodeInfo.centerX; const centralY = this.nodeInfo.centerY; const centralRadius = this.nodeInfo.radius; for (let iter = 0; iter < iterations; iter++) { for (let i = 0; i < elementsData.length; i++) { for (let j = i + 1; j < elementsData.length; j++) { const aData = elementsData[i]; const bData = elementsData[j]; const aRadius = aData.initialRadius * aData.targetScale; const bRadius = bData.initialRadius * bData.targetScale; const ax = aData.targetX; const ay = aData.targetY; const bx = bData.targetX; const by = bData.targetY; const targetDist = distance(ax, ay, bx, by); const requiredDist = aRadius + bRadius + padding; if (targetDist < requiredDist && targetDist > 0.01) { const overlap = requiredDist - targetDist; const angle = Math.atan2(by - ay, bx - ax); const aIsFixed = aData.isHovered || aData.isClicked; const bIsFixed = bData.isHovered || bData.isClicked; let pushFactorA = 0.5; let pushFactorB = 0.5; if (aIsFixed && bIsFixed) { pushFactorA = 0; pushFactorB = 0; } else if (aIsFixed) { pushFactorA = 0; pushFactorB = 1; } else if (bIsFixed) { pushFactorA = 1; pushFactorB = 0; } if (pushFactorA + pushFactorB > 0) { const totalPushFactorInv = 1.0 / (pushFactorA + pushFactorB); const pushX = Math.cos(angle) * overlap * totalPushFactorInv; const pushY = Math.sin(angle) * overlap * totalPushFactorInv; aData.targetX -= pushX * pushFactorA; aData.targetY -= pushY * pushFactorA; bData.targetX += pushX * pushFactorB; bData.targetY += pushY * pushFactorB; } } } } for (let i = 0; i < elementsData.length; i++) { const elData = elementsData[i]; const elRadius = elData.initialRadius * elData.targetScale; const elX = elData.targetX; const elY = elData.targetY; const distFromCenter = distance(centralX, centralY, elX, elY); const requiredDistFromCenter = centralRadius + elRadius + padding; if (distFromCenter < requiredDistFromCenter && distFromCenter > 0.01) { const overlap = requiredDistFromCenter - distFromCenter; const angle = Math.atan2(elY - centralY, elX - centralX); elData.targetX += Math.cos(angle) * overlap; elData.targetY += Math.sin(angle) * overlap; } } } const nudgeFactor = this.config.nudgeFactor; elementsData.forEach(data => { if (!data.isHovered && !data.isClicked) { data.targetX = lerp(data.targetX, data.initialX, nudgeFactor); data.targetY = lerp(data.targetY, data.initialY, nudgeFactor); } }); elementsData.forEach(data => { const elRadius = data.initialRadius * data.targetScale; const dist = distance(centralX, centralY, data.targetX, data.targetY); const requiredDist = centralRadius + elRadius + padding; if (dist < requiredDist) { const angle = Math.atan2(data.targetY - centralY, data.targetX - centralX) || 0; data.targetX = centralX + Math.cos(angle) * requiredDist; data.targetY = centralY + Math.sin(angle) * requiredDist; } }); }

    // --- Animation Loop (MODIFIED: Sets font-size) ---
    _animationStep = () => {
        if (!this.isRunning) { this.animationFrameId = null; return; }
        let needsAnotherFrame = false;
        const elementsData = [];
        const currentActiveElements = new Set(this.activeElements);

        currentActiveElements.forEach(el => {
            if (document.body.contains(el) && this.elementDataStore.has(el)) {
                elementsData.push(this.elementDataStore.get(el));
            } else {
                // Cleanup elements removed from DOM or instance
                if (this.elementDataStore.has(el)) {
                    if (el._orbitCleanups && el._orbitCleanups.has(this)) {
                        el._orbitCleanups.get(this)(); // Run specific cleanup for this instance
                    }
                    this.elementDataStore.delete(el);
                }
                this.activeElements.delete(el);
            }
        });

        if (elementsData.length === 0 && this.activeElements.size === 0) {
            this.isRunning = false;
            this.animationFrameId = null;
            return;
        }

        this._resolveDomCollisions(elementsData);

        for (const data of elementsData) {
            const el = Array.from(this.activeElements).find(element => this.elementDataStore.get(element) === data);
            if (!el) continue; // Should not happen with the check above, but safety first

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
            const currentDiameter = data.currentWidth; // Width and Height are the same for circles

            // *** NEW: Calculate proportional font size ***
            const currentFontSize = (currentDiameter / OrbitLayoutManager.referenceDiameter) * OrbitLayoutManager.referenceFontSize;
            // Prevent excessively small font sizes which can cause rendering issues
            const clampedFontSize = Math.max(0.1, currentFontSize);

            // Check if animation is still needed
            const dx = data.targetX - data.currentX;
            const dy = data.targetY - data.currentY;
            const dScale = data.targetScale - data.currentScale;

            if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1 || Math.abs(dScale) > 0.005) {
                needsAnotherFrame = true;
            } else {
                // Snap to final state if close enough
                data.currentX = data.targetX;
                data.currentY = data.targetY;
                data.currentScale = data.targetScale;
                data.currentWidth = data.initialWidth * data.targetScale;
                data.currentHeight = data.initialHeight * data.targetScale;
                const finalLeft = data.targetX - data.currentWidth / 2;
                const finalTop = data.targetY - data.currentHeight / 2;
                const finalDiameter = data.currentWidth;
                const finalFontSize = (finalDiameter / OrbitLayoutManager.referenceDiameter) * OrbitLayoutManager.referenceFontSize;

                el.style.left = `${finalLeft.toFixed(3)}px`;
                el.style.top = `${finalTop.toFixed(3)}px`;
                el.style.width = `${data.currentWidth.toFixed(3)}px`;
                el.style.height = `${data.currentHeight.toFixed(3)}px`;
                el.style.setProperty('--current-diameter', `${finalDiameter.toFixed(3)}px`);
                el.style.fontSize = `${Math.max(0.1, finalFontSize).toFixed(3)}px`; // Apply final font size
            }

            // Apply interpolated styles for the current frame
            el.style.left = `${currentLeft.toFixed(3)}px`;
            el.style.top = `${currentTop.toFixed(3)}px`;
            el.style.width = `${data.currentWidth.toFixed(3)}px`;
            el.style.height = `${data.currentHeight.toFixed(3)}px`;
            el.style.transform = 'none'; // Still using layout animation
            el.style.setProperty('--current-diameter', `${currentDiameter.toFixed(3)}px`);
            el.style.fontSize = `${clampedFontSize.toFixed(3)}px`; // Apply calculated font size

            // Update z-index and content visibility
            el.style.zIndex = (data.isHovered || data.isClicked) ? '10' : data.originalZIndex;
            this._updateContentVisibility(el, data.isClicked);
        }

        // Request next frame if needed
        if (needsAnotherFrame && this.isRunning) {
            this.animationFrameId = requestAnimationFrame(this._animationStep);
        } else {
            this.animationFrameId = null; // Stop the loop if no elements need animation
            console.log("%c[OrbitLayoutDOM v14 SharpNative PropContent] Animation loop settled.", "color: grey");
        }
    }


    // --- Start Animation Loop ---
    _startAnimationLoop() {
        // Only start if not already running, instance is active, and there are elements
        if (!this.animationFrameId && this.isRunning && this.activeElements.size > 0) {
            console.log("%c[OrbitLayoutDOM v14 SharpNative PropContent] Starting animation loop...", "color: green");
            this.animationFrameId = requestAnimationFrame(this._animationStep);
        } else if (this.animationFrameId && this.isRunning) {
            // console.log("[OrbitLayoutDOM v14 SharpNative PropContent] Animation loop already running.");
        } else {
            // console.log(`[OrbitLayoutDOM v14 SharpNative PropContent] Animation loop not started (isRunning: ${this.isRunning}, activeElements: ${this.activeElements.size})`);
        }
    }

    // --- Helper for Ensuring Content Wrappers ---
    // --- Helper for Ensuring Content Wrappers (REVISED) ---
    _ensureContentWrappers(panel) {
        const originalContentClass = 'orbit-element-original-content';
        const expandedContentClass = 'orbit-element-expanded-content';

        // Ensure original content wrapper exists
        let originalContentWrapper = panel.querySelector(`.${originalContentClass}`);
        if (!originalContentWrapper) {
            // console.log(`[OrbitLayoutDOM v14] Creating .${originalContentClass} for`, panel.id || panel);
            originalContentWrapper = document.createElement('div');
            originalContentWrapper.className = originalContentClass;

            // --- REVISED Child Moving Logic ---
            const nodesToMove = [];
            // Iterate backwards to avoid issues with live NodeList modification
            for (let i = panel.childNodes.length - 1; i >= 0; i--) {
                const node = panel.childNodes[i];
                // Don't move the expanded content div if it already exists
                if (!(node.nodeType === Node.ELEMENT_NODE && node.classList.contains(expandedContentClass))) {
                    nodesToMove.push(node);
                }
            }
            // Prepend nodes in reverse order to maintain original order
            nodesToMove.reverse().forEach(node => originalContentWrapper.appendChild(node));
            // --- End Revised Logic ---


            // Insert the wrapper before the expanded content if it exists, otherwise append
            const expandedContent = panel.querySelector(`.${expandedContentClass}`);
            if (expandedContent) {
                panel.insertBefore(originalContentWrapper, expandedContent);
            } else {
                panel.appendChild(originalContentWrapper);
            }
        }

        // Ensure it's visible initially (display controlled later by _updateContentVisibility)
        // Don't set display here directly, let CSS and _updateContentVisibility handle it
        // originalContentWrapper.style.display = 'flex'; // Removed this line

        // Ensure expanded content wrapper exists (structure only)
        this._ensureExpandedContentDiv(panel); // This now primarily ensures the structure exists
    }


    // --- Helper for Content Visibility (REVISED v2: Grid Layout based on Rotated Sketch) ---
    _ensureExpandedContentDiv(panel) {
        const containerClass = 'orbit-element-expanded-content';
        let expandedDiv = panel.querySelector(`.${containerClass}`);

        if (!expandedDiv) {
            expandedDiv = document.createElement('div');
            expandedDiv.className = containerClass;
            // Add glassy class for visual style
            expandedDiv.classList.add('glassy');

            const event = panel._eventData || {};

            const eventData = {
                title: event.title || "Event Title Placeholder",
                date: event.date ? new Date(event.date).toLocaleDateString() : "Date Placeholder",
                location: event.location || "Location Placeholder",
                status: event.rsvp_status || "unknown",
                logoUrl: event.image_url || null,
                infoUrl: event.info_url || "#",
                details: event.description || "Some additional details about the event.",
            };

            // --- UPDATED Grid Structure and HTML per requested template ---
            expandedDiv.innerHTML = `
      <div class="expanded-grid-container-v2">
        <div class="grid-item event-header">
          <div class="event-logo-wrapper">
            <img src="${eventData.logoUrl || '/static/img/default-event-logo.png'}" alt="Event Logo" class="event-logo-img">
          </div>
          <div class="event-title-wrapper content-box">
            <div class="title-scroll">${eventData.title}</div>
          </div>
        </div>
        <div class="grid-item event-status status-${eventData.status}">
          <span class="status-pill">${eventData.status.charAt(0).toUpperCase() + eventData.status.slice(1)}</span>
        </div>
        <div class="grid-item event-timeplace content-box">
          <div class="timeplace-content">
            <p><strong>Date:</strong> ${eventData.date}</p>
            <p><strong>Location:</strong> ${eventData.location}</p>
            ${eventData.details ? `<p class="extra-details">${eventData.details}</p>` : ''}
          </div>
        </div>
        <div class="grid-item more-info">
          <a href="${eventData.infoUrl || '#'}" target="_blank" class="button info-button">Info</a>
        </div>
      </div>`;
            // --- End UPDATED Grid Structure ---

            panel.appendChild(expandedDiv);
            console.log("[OrbitLayoutDOM v15] Created expanded content grid structure V2 for", panel);
        }

        if (expandedDiv.style.display !== 'none') {
            expandedDiv.style.display = 'none';
        }
        return expandedDiv;
    }

    _updateContentVisibility(panel, showExpanded) {
        const expandedDiv = panel.querySelector('.orbit-element-expanded-content');
        const originalContentDiv = panel.querySelector('.orbit-element-original-content');

        // Determine desired display style (flex is common, adjust if needed)
        const originalDisplay = 'flex'; // Or 'block'
        const expandedDisplay = 'flex'; // Often a flex column

        let changed = false;

        if (originalContentDiv) {
            const targetDisplay = showExpanded ? 'none' : originalDisplay;
            if (originalContentDiv.style.display !== targetDisplay) {
                originalContentDiv.style.display = targetDisplay;
                changed = true;
            }
            // Keep class for potential CSS hooks (e.g., opacity transitions)
            if (originalContentDiv.classList.contains('hidden') !== showExpanded) {
                originalContentDiv.classList.toggle('hidden', showExpanded);
            }
        }
        if (expandedDiv) {
            const targetDisplay = showExpanded ? expandedDisplay : 'none';
            if (expandedDiv.style.display !== targetDisplay) {
                expandedDiv.style.display = targetDisplay;
                changed = true;
                // Trigger opacity transition shortly after display change
                // Use requestAnimationFrame to ensure 'display' change is flushed
                if (showExpanded) {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => { // Double RAF sometimes needed for transitions after display change
                            expandedDiv.classList.add('visible');
                        });
                    });
                } else {
                    expandedDiv.classList.remove('visible');
                }
            }
        }
        // if (changed) console.log(`Visibility updated for ${panel.id}: showExpanded=${showExpanded}`);
    }


    // --- Setup Hover Interaction (Ensure click overrides) ---
    _setupHoverInteraction(panel) {
        // ... (Same as v13 - No changes needed here) ...
        const listenerFlag = '_orbitHoverListenersAttached_v14'; // Update flag version
        if (panel[listenerFlag]) return;
        const handlePointerEnter = (event) => {
            if (!this.isRunning) return;
            const data = this.elementDataStore.get(panel);
            if (!data || data.isHovered || data.isClicked) {
                return; // Do nothing if already hovered or clicked
            }
            data.isHovered = true;
            data.targetScale = data.config.hoverScale;
            // Reset others
            this.activeElements.forEach(el => { if (el !== panel) { const otherData = this.elementDataStore.get(el); if (otherData && !otherData.isClicked) { otherData.isHovered = false; if (otherData.targetScale !== 1) otherData.targetScale = 1; } else if (otherData && otherData.isClicked) { otherData.isHovered = false; } } });
            this._startAnimationLoop();
        };
        const handlePointerLeave = (event) => {
            if (!this.isRunning) return; const data = this.elementDataStore.get(panel); if (!data) return;
            let needsAnim = false;
            if (data.isHovered) {
                data.isHovered = false;
                if (!data.isClicked) { // Only reset scale if not clicked
                    data.targetScale = 1;
                    needsAnim = true;
                }
            }

            if (data.isClicked) {
                console.log(`%c[OrbitLayoutDOM v15] Pointer leaving clicked element (${panel.id || 'no-id'}). Unclicking.`, "color: orange;");
                this._unclickPanel(panel, data); // Resets isClicked and sets targetScale to 1
                needsAnim = true; // Ensure animation runs to shrink back
                window.draggingAllowed = true; // Allow dragging again
            }

            if (needsAnim) {
                this._startAnimationLoop();
            }
        };
        panel.addEventListener('pointerenter', handlePointerEnter); panel.addEventListener('pointerleave', handlePointerLeave); panel[listenerFlag] = { enter: handlePointerEnter, leave: handlePointerLeave };
        // Cleanup setup
        if (!panel._orbitCleanups) { panel._orbitCleanups = new Map(); } const cleanupFunc = () => { panel.removeEventListener('pointerenter', handlePointerEnter); panel.removeEventListener('pointerleave', handlePointerLeave); delete panel[listenerFlag]; panel._orbitCleanups.delete(this); if (panel._orbitCleanups.size === 0) { delete panel._orbitCleanups; } }; panel._orbitCleanups.set(this, cleanupFunc);
    }

    // --- Setup Click Interaction (Ensure hover state is killed) ---
    _setupClickInteraction(panel) {
        // ... (Same as v13 - No changes needed here, relies on animation loop for visibility) ...
        const clickListenerFlag = '_orbitClickListenersAttached_v14'; // Update flag version
        if (panel[clickListenerFlag]) return;
        const handleClick = (event) => {
            // Ignore clicks on buttons inside the expanded content
            if (event.target.closest('.orbit-element-expanded-content button')) {
                console.log("[OrbitLayoutDOM v14 SharpNative PropContent] Clicked on button, ignoring panel click.");
                return;
            }
            if (!this.isRunning) return; const data = this.elementDataStore.get(panel); if (!data) return;

            if (data.isClicked) {
                // Clicked on an already clicked panel: Unclick it
                this._unclickPanel(panel, data);
            } else {
                // Clicked on a non-clicked panel: Unclick others, then click this one
                this.activeElements.forEach(el => { if (el !== panel) { const otherData = this.elementDataStore.get(el); if (otherData && otherData.isClicked) { this._unclickPanel(el, otherData); } if (otherData) { otherData.isHovered = false; if (otherData.targetScale !== 1) otherData.targetScale = 1; } } }); // Unclick AND unhover others

                // Set state for this panel
                window.draggingAllowed = false; // Prevent dragging while clicking
                data.isClicked = true;
                data.isHovered = false; // Explicitly turn off hover state
                data.targetScale = data.config.clickScale;
                this._ensureExpandedContentDiv(panel); // Ensure structure exists

                // Visibility is handled by the animation loop checking data.isClicked
            }
            this._startAnimationLoop(); // Trigger animation update
        };
        panel.addEventListener('click', handleClick); panel[clickListenerFlag] = handleClick;
        // Cleanup setup
        if (!panel._orbitCleanups) { panel._orbitCleanups = new Map(); } const cleanupFunc = () => { panel.removeEventListener('click', handleClick); delete panel[clickListenerFlag]; panel._orbitCleanups.delete(this); if (panel._orbitCleanups.size === 0) { delete panel._orbitCleanups; } }; panel._orbitCleanups.set(this, cleanupFunc);
    }

    // --- Helper to Unclick a Panel (Resets state) ---
    _unclickPanel(panel, data) {
        // ... (Same as v13 - No changes needed here) ...
        window.draggingAllowed = true; // Allow dragging again
        if (!data || !data.isClicked) return;
        console.log("[OrbitLayoutDOM v14 SharpNative PropContent] Unclicking panel:", panel);
        data.isClicked = false;
        data.targetScale = 1; // Reset logical target scale
        // Visibility is handled by animation loop calling _updateContentVisibility
    }

    // --- Internal Cleanup Helper ---
    // --- Internal Cleanup Helper (REVISED) ---
    _cleanupInstance(keepNodeEl = false) {
        console.log(`%c[OrbitLayoutDOM v15 LeaveUnclicks] Cleaning up instance associated with node:`, "color: red;", this.nodeEl);
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
            console.log("[OrbitLayoutDOM v15 LeaveUnclicks] Cancelled animation frame.");
        }
        const elementsToClean = new Set(this.activeElements);

        elementsToClean.forEach(el => {
            // *** FIX: Get the data associated with this element ***
            const data = this.elementDataStore.get(el);

            // Remove dynamic content/styles
            const expandedDiv = el.querySelector('.orbit-element-expanded-content');
            if (expandedDiv && expandedDiv.parentElement === el) {
                el.removeChild(expandedDiv);
            }
            const originalContent = el.querySelector('.orbit-element-original-content');
            if (originalContent) {
                // Restore original content display if it was hidden
                originalContent.style.display = 'flex'; // Or initial display type
                originalContent.classList.remove('hidden');
            }

            // Reset styles modified by the script
            el.style.position = '';
            el.style.width = '';
            el.style.height = '';
            el.style.left = '';
            el.style.top = '';
            el.style.borderRadius = '';
            el.style.transform = '';
            el.style.willChange = '';
            // *** FIX: Use the fetched 'data' object ***
            // Restore original zIndex *if* data was found
            el.style.zIndex = data ? data.originalZIndex : '';
            el.style.overflow = '';
            el.style.fontSize = ''; // Reset dynamic font size
            el.style.removeProperty('--current-diameter');

            // Remove listeners using the cleanup map
            if (el._orbitCleanups && el._orbitCleanups.has(this)) {
                const cleanupFunc = el._orbitCleanups.get(this);
                if (typeof cleanupFunc === 'function') {
                    cleanupFunc(); // Removes listeners and its own map entry
                } else {
                    // Fallback if cleanup function is wrong type
                    el._orbitCleanups.delete(this);
                    if (el._orbitCleanups.size === 0) delete el._orbitCleanups;
                }
            }

            // *** FIX: Delete data AFTER it has been used ***
            this.elementDataStore.delete(el);
        });

        this.activeElements.clear();
        console.log("[OrbitLayoutDOM v15 LeaveUnclicks] Cleared active elements and associated data/listeners/styles.");

        if (!keepNodeEl) {
            console.log("[OrbitLayoutDOM v15 LeaveUnclicks] Clearing node and event element references.");
            this.nodeEl = null;
            this.eventEls = [];
            this.nodeInfo = {};
        }
    }

    // --- Public Methods (No changes needed) ---
    updateLayout(newEventEls = null) {
        console.log(`%c[OrbitLayoutDOM v14 SharpNative PropContent] updateLayout called for node:`, "color: blueviolet;", this.nodeEl);
        if (!this.nodeEl) { console.warn("[OrbitLayoutDOM v14 SharpNative PropContent] updateLayout called on an instance without a node. Aborting."); return; }
        const wasRunning = this.isRunning;
        this.isRunning = false;
        if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; }

        // Determine which elements are new and which are removed
        const newElementsArray = newEventEls === null ? this.eventEls : (Array.isArray(newEventEls) ? [...newEventEls] : (newEventEls instanceof NodeList ? Array.from(newEventEls) : (newEventEls ? [newEventEls] : [])));
        const newElementsSet = new Set(newElementsArray);
        const oldElementsSet = new Set(this.activeElements);
        const elementsToRemove = new Set();
        const elementsToAdd = new Set(newElementsArray); // Start with all new ones

        oldElementsSet.forEach(oldEl => {
            if (!newElementsSet.has(oldEl)) {
                elementsToRemove.add(oldEl); // Mark for removal
            } else {
                elementsToAdd.delete(oldEl); // Already exists, don't re-add basics
            }
        });

        console.log(`[OrbitLayoutDOM v14] Elements to remove: ${elementsToRemove.size}, Elements to add: ${elementsToAdd.size}, Elements to keep: ${oldElementsSet.size - elementsToRemove.size}`);


        // Clean up removed elements FULLY
        elementsToRemove.forEach(oldEl => {
            console.log("[OrbitLayoutDOM v14 SharpNative PropContent] Removing listener/data/content for element no longer in list:", oldEl);
            const expandedDiv = oldEl.querySelector('.orbit-element-expanded-content');
            if (expandedDiv && expandedDiv.parentElement === oldEl) oldEl.removeChild(expandedDiv);
            // Reset styles thoroughly? Or assume they get removed from DOM? Let's reset for safety.
            oldEl.style.position = ''; oldEl.style.width = ''; oldEl.style.height = ''; oldEl.style.left = ''; oldEl.style.top = ''; oldEl.style.borderRadius = ''; oldEl.style.transform = ''; oldEl.style.willChange = ''; oldEl.style.zIndex = ''; oldEl.style.overflow = ''; oldEl.style.fontSize = ''; oldEl.style.removeProperty('--current-diameter');

            if (oldEl._orbitCleanups && oldEl._orbitCleanups.has(this)) { oldEl._orbitCleanups.get(this)(); } // Removes listeners
            this.elementDataStore.delete(oldEl);
            this.activeElements.delete(oldEl); // Remove from active set
        });

        // Update the internal list for the new layout calculation
        this.eventEls = newElementsArray;

        // Perform the layout (will re-process existing elements and add new ones)
        this.performLayout();

        // Restart animation if needed
        if (this.activeElements.size > 0) {
            this.isRunning = true; // Set running state *before* starting loop
            this._startAnimationLoop();
        } else {
            this.isRunning = false;
        }
    }
    updateConfiguration(newOptions) { /* ... Same as v13 ... */ console.log("[OrbitLayoutDOM v14 SharpNative PropContent] Updating configuration:", newOptions); if (!this.isRunning && this.activeElements.size === 0 && !this.nodeEl) { console.warn("[OrbitLayoutDOM v14 SharpNative PropContent] Attempted to update configuration on destroyed instance."); return; } const oldCentralRadius = this.config.centralRadius; const oldHoverScale = this.config.hoverScale; const oldClickScale = this.config.clickScale; this.config = { ...this.config, ...newOptions }; if ('centralRadius' in newOptions && this.nodeInfo && oldCentralRadius !== this.config.centralRadius) { const autoRadius = Math.max(this.nodeEl.offsetWidth, this.nodeEl.offsetHeight) / 2; this.centralNodeCollisionRadius = Math.max(autoRadius, this.config.centralRadius || 0); this.config.centralRadius = this.centralNodeCollisionRadius; this.nodeInfo.radius = this.centralNodeCollisionRadius; console.log("[OrbitLayoutDOM v14 SharpNative PropContent] Updated central node collision radius:", this.nodeInfo.radius); } let scaleChanged = ('hoverScale' in newOptions && oldHoverScale !== this.config.hoverScale) || ('clickScale' in newOptions && oldClickScale !== this.config.clickScale); this.activeElements.forEach(el => { const data = this.elementDataStore.get(el); if (data) { data.config = this.config; data.nodeInfo = this.nodeInfo; if (scaleChanged) { if (data.isClicked && 'clickScale' in newOptions) { data.targetScale = this.config.clickScale; } else if (data.isHovered && 'hoverScale' in newOptions) { if (!data.isClicked) data.targetScale = this.config.hoverScale; } } } }); if ('animationSpeed' in newOptions || 'repulsionPadding' in newOptions || 'repulsionIterations' in newOptions || 'nudgeFactor' in newOptions || 'centralRadius' in newOptions || scaleChanged) { console.log("[OrbitLayoutDOM v14 SharpNative PropContent] Animation/Collision parameters changed, restarting animation loop."); this._startAnimationLoop(); } }
    destroy() { /* ... Use updated cleanup ... */ const nodeDesc = this.nodeEl ? this.nodeEl.id || this.nodeEl.tagName : 'Unknown Node'; this._cleanupInstance(false); console.log(`%c[OrbitLayoutDOM v14 SharpNative PropContent] Destroyed instance for node: ${nodeDesc}`, "color: red; font-weight: bold;"); }

}

// --- END OF FILE orbitLayoutDOM_v5_StrictClass_LayoutAnim_v14_SharpNative_ProportionalContent.js ---