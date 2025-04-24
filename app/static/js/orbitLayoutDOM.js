// --- START OF FILE orbitLayoutDOM.js ---

// Store state associated with each event element
const elementDataStore = new WeakMap(); // WeakMap<Element, OrbitData>
let animationFrameId = null;
let activeElements = new Set(); // Keep track of elements managed by the animation loop

// --- Configuration (Matching testing_circles.html defaults + interaction) ---
const defaultConfig = {
    // Layout Geometry
    N: 12,
    centralRadius: 60,       // This is now the conceptual radius for the *central node itself* for collision
    ringPadding: 10,       // Still the space between central node radius and first orbit path
    ringGap: 8,
    circleSpacing: 4,
    minCircleRadius: 2,

    // Interaction (from canvas example)
    hoverScale: 3.0,
    animationSpeed: 0.08,
    repulsionPadding: 4,   // Padding applied between elements AND between elements and central node
    repulsionIterations: 5,
    nudgeFactor: 0.02,
};

// Simple lerp function
function lerp(a, b, t) {
    return a * (1 - t) + b * t;
}

// Distance between two points
function distance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * FINAL LAYOUT v2: With Central Node Collision & Direct Hover
 * - Calculates initial layout using offsetLeft/Top + style.left/top.
 * - Includes central node in collision detection.
 * - Animates via transform: translate() scale().
 * - Uses direct pointerenter/leave for hover.
 */
export function layoutEventsAroundNodeDOM(nodeEl, eventEls, options = {}) {
    console.log("%c[orbitLayoutDOM v_FINAL2] Starting layout...", "color: green; font-weight: bold;");
    if (!nodeEl) { console.error("[orbitLayoutDOM v_FINAL2] ERROR: Central node element not provided."); return; }
    if (!eventEls || eventEls.length === 0) { console.warn("[orbitLayoutDOM v_FINAL2] No event elements provided."); return; }

    const config = { ...defaultConfig, ...options };
    console.log("[orbitLayoutDOM v_FINAL2] Using Configuration:", config);

    // Clear previous state and stop animation
    activeElements.clear();
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    // --- Coordinate Setup & Validation ---
    const container = nodeEl.offsetParent;
    if (!container) {
        console.error("%c[orbitLayoutDOM v_FINAL2] FATAL ERROR: nodeEl.offsetParent is null.", "color: red; font-weight: bold;"); return;
    }
    const containerStyle = window.getComputedStyle(container);
    if (containerStyle.position === 'static') {
         console.error(`%c[orbitLayoutDOM v_FINAL2] CRITICAL ISSUE: offsetParent <${container.tagName}> has 'position: static'.`, "color: red; font-weight: bold;");
         console.error("SOLUTION: Set 'position: relative;' or 'position: absolute;' on the container.");
    }
    const nodeTransform = window.getComputedStyle(nodeEl).transform;
    if (nodeTransform && nodeTransform !== 'none') {
        console.warn(`%c[orbitLayoutDOM v_FINAL2] POTENTIAL ISSUE: Node element has CSS transform:`, "color: orange;", nodeTransform);
        console.warn("Layout center based on pre-transform position.");
    }
    // --- End Validation ---

    // Calculate initial node center relative to the CONTAINER's top-left (0,0)
    const nodeLayoutX = nodeEl.offsetLeft;
    const nodeLayoutY = nodeEl.offsetTop;
    const nodeLayoutWidth = nodeEl.offsetWidth;
    const nodeLayoutHeight = nodeEl.offsetHeight;
    const nodeCenterX = nodeLayoutX;
    const nodeCenterY = nodeLayoutY;
    // Use config.centralRadius for the central node's collision size
    const centralNodeCollisionRadius = config.centralRadius;


    console.log(`[orbitLayoutDOM v_FINAL2] Node offsetLeft=${nodeLayoutX}, offsetTop=${nodeLayoutY}, offsetWidth=${nodeLayoutWidth}, offsetHeight=${nodeLayoutHeight}`);
    console.log(`[orbitLayoutDOM v_FINAL2] Calculated Node Center: X=${nodeCenterX.toFixed(2)}, Y=${nodeCenterY.toFixed(2)}`);
    console.log(`[orbitLayoutDOM v_FINAL2] Using Central Node Collision Radius: ${centralNodeCollisionRadius}`);


    // === Core Layout Logic (Static part) ===
    // Note: Layout calculations still use centralRadius for spacing *from* the center,
    // collision uses it for the central object's *size*.
    const N = config.N;
    const totalEvents = eventEls.length;
    if (totalEvents === 0 || N <= 0) return;

    const numRings = Math.ceil(totalEvents / N);
    let eventIndex = 0;
    // The 'lastOrbitRadius' starts conceptually from the edge defined by config.centralRadius
    let lastOrbitRadius_Layout = config.centralRadius;
    let lastCircleRadius = 0;
    const angleOffset = -Math.PI / 2;

    for (let ringIdx = 0; ringIdx < numRings; ringIdx++) {
        const ringIndex = ringIdx + 1;
        const isLastRing = (ringIndex === numRings);
        const numCirclesActualThisRing = isLastRing ? (totalEvents - eventIndex) : N;
        if (numCirclesActualThisRing <= 0) break;

        // Calculate Geometry (Uses config.centralRadius for spacing, not collision)
        let estimatedOrbitRadius;
        if (ringIndex === 1) { estimatedOrbitRadius = lastOrbitRadius_Layout + config.ringPadding + config.minCircleRadius; }
        else { estimatedOrbitRadius = lastOrbitRadius_Layout + lastCircleRadius + config.ringGap + config.minCircleRadius; }
        const circumference = 2 * Math.PI * estimatedOrbitRadius;
        const idealRadiusBasedOnN = (circumference / N - config.circleSpacing) / 2;
        const circleRadius = Math.max(config.minCircleRadius, idealRadiusBasedOnN);
        let finalOrbitRadius;
        if (ringIndex === 1) { finalOrbitRadius = lastOrbitRadius_Layout + config.ringPadding + circleRadius; }
        else { finalOrbitRadius = lastOrbitRadius_Layout + lastCircleRadius + config.ringGap + circleRadius; }

        // Determine Placement Angles (Identical)
        const angleStep = (2 * Math.PI) / N;
        const startAngle = (ringIndex % 2 === 0) ? angleOffset + angleStep / 2 : angleOffset;

        // Place Circles (Set initial state and position)
        for (let i = 0; i < numCirclesActualThisRing; i++) {
            if (eventIndex >= totalEvents) break;
            const el = eventEls[eventIndex];
            if (!el) { eventIndex++; continue; }
            activeElements.add(el);

            const angle = startAngle + i * angleStep;
            const diameter = circleRadius * 2;

            const initialTargetCenterX = nodeCenterX + finalOrbitRadius * Math.cos(angle);
            const initialTargetCenterY = nodeCenterY + finalOrbitRadius * Math.sin(angle);
            const initialTargetLeft = initialTargetCenterX - circleRadius;
            const initialTargetTop = initialTargetCenterY - circleRadius;

            // Apply initial styles
            el.style.position = 'absolute';
            el.style.width = `${diameter}px`;
            el.style.height = `${diameter}px`;
            el.style.borderRadius = '50%';
            el.style.left = `${initialTargetLeft}px`;
            el.style.top = `${initialTargetTop}px`;
            el.style.transformOrigin = 'center center';
            el.style.transform = 'translate(0px, 0px) scale(1)';
            el.style.willChange = 'transform';
            el.style.transition = 'none';

            // Store state
            const data = {
                initialX: initialTargetCenterX, initialY: initialTargetCenterY, initialRadius: circleRadius,
                currentX: initialTargetCenterX, currentY: initialTargetCenterY, currentScale: 1,
                targetX: initialTargetCenterX, targetY: initialTargetCenterY, targetScale: 1,
                isHovered: false, originalZIndex: el.style.zIndex || '1', config: config,
                 // Store central node info needed for collision checks later
                 nodeInfo: { centerX: nodeCenterX, centerY: nodeCenterY, radius: centralNodeCollisionRadius }
            };
            elementDataStore.set(el, data);

            // Set up direct hover listeners
            setupHoverInteraction(el);

            eventIndex++;
        }
        // Update layout tracking variables for NEXT ring
        lastOrbitRadius_Layout = finalOrbitRadius;
        lastCircleRadius = circleRadius;
        if (eventIndex >= totalEvents) break;
    }

    console.log("%c[orbitLayoutDOM v_FINAL2] Static layout finished.", "color: green;");
    if (activeElements.size > 0) {
        startAnimationLoop();
    }
}


/**
 * Resolves collisions between elements AND against the central node.
 * Modifies targetX/targetY in elementDataStore.
 */
function resolveDomCollisions(elementsData, config) {
    const iterations = config.repulsionIterations;
    const padding = config.repulsionPadding;
    if (iterations === 0 || elementsData.length === 0) return;

    // Get central node info from the first element (assuming it's consistent)
    const nodeInfo = elementsData[0].nodeInfo;
    if (!nodeInfo) {
        console.warn("Node info missing from element data, cannot perform central collision.");
        return;
    }
    const centralX = nodeInfo.centerX;
    const centralY = nodeInfo.centerY;
    const centralRadius = nodeInfo.radius;

    for (let iter = 0; iter < iterations; iter++) {
        // 1. Element vs Element Collision
        for (let i = 0; i < elementsData.length; i++) {
            for (let j = i + 1; j < elementsData.length; j++) {
                const aData = elementsData[i];
                const bData = elementsData[j];

                const aRadius = aData.initialRadius * aData.targetScale;
                const bRadius = bData.initialRadius * bData.targetScale;
                const ax = aData.targetX; const ay = aData.targetY;
                const bx = bData.targetX; const by = bData.targetY;

                const targetDist = distance(ax, ay, bx, by);
                const requiredDist = aRadius + bRadius + padding;

                if (targetDist < requiredDist && targetDist > 0.01) {
                    const overlap = requiredDist - targetDist;
                    const angle = Math.atan2(by - ay, bx - ax);
                    const pushFactorA = aData.isHovered ? 0 : (bData.isHovered ? 1 : 0.5);
                    const pushFactorB = bData.isHovered ? 0 : (aData.isHovered ? 1 : 0.5);

                    if (pushFactorA + pushFactorB > 0) {
                        const totalPushFactor = pushFactorA + pushFactorB;
                        const scaledOverlap = overlap / totalPushFactor;
                        const pushX = Math.cos(angle) * scaledOverlap;
                        const pushY = Math.sin(angle) * scaledOverlap;
                        aData.targetX -= pushX * pushFactorA;
                        aData.targetY -= pushY * pushFactorA;
                        bData.targetX += pushX * pushFactorB;
                        bData.targetY += pushY * pushFactorB;
                    }
                }
            }
        } // End Element vs Element

        // 2. Element vs Central Node Collision
        for (let i = 0; i < elementsData.length; i++) {
             const elData = elementsData[i];

             // Hovered elements don't get pushed by the center (consistency with canvas)
             if (elData.isHovered) continue;

             const elRadius = elData.initialRadius * elData.targetScale; // Use scaled radius
             const elX = elData.targetX;
             const elY = elData.targetY;

             const distFromCenter = distance(centralX, centralY, elX, elY);
             // Required distance includes central node's radius, element's radius, and padding
             const requiredDistFromCenter = centralRadius + elRadius + padding;

             if (distFromCenter < requiredDistFromCenter && distFromCenter > 0.01) {
                 const overlap = requiredDistFromCenter - distFromCenter;
                 const angle = Math.atan2(elY - centralY, elX - centralX); // Angle from center to element

                 // Push the element directly away from the center
                 elData.targetX += Math.cos(angle) * overlap;
                 elData.targetY += Math.sin(angle) * overlap;
             }
        } // End Element vs Center

    } // End iterations

    // Nudge non-hovered elements gently back towards their initial position
    const nudgeFactor = config.nudgeFactor || 0.02;
    elementsData.forEach(data => {
        if (!data.isHovered) {
            data.targetX = lerp(data.targetX, data.initialX, nudgeFactor);
            data.targetY = lerp(data.targetY, data.initialY, nudgeFactor);
        }
    });
}


/**
 * The main animation loop using requestAnimationFrame.
 */
function animationStep() {
    let needsAnotherFrame = false;

    // 1. Collect data
    const elementsData = [];
    let currentConfig = defaultConfig;
    for (const el of activeElements) {
        const data = elementDataStore.get(el);
        if (data) {
            elementsData.push(data);
            if (elementsData.length === 1) currentConfig = data.config;
        }
    }

    // 2. Resolve Collisions (includes central node)
    if (elementsData.length > 0) {
       resolveDomCollisions(elementsData, currentConfig);
    }

    // 3. Interpolate and Apply Styles
    for (const data of elementsData) {
       const el = [...activeElements].find(element => elementDataStore.get(element) === data);
       if (!el) continue;

        const speed = data.config.animationSpeed;

        // Interpolate center position and scale
        data.currentX = lerp(data.currentX, data.targetX, speed);
        data.currentY = lerp(data.currentY, data.targetY, speed);
        data.currentScale = lerp(data.currentScale, data.targetScale, speed);

        // Check if animation is still needed
        const dx = data.targetX - data.currentX;
        const dy = data.targetY - data.currentY;
        const ds = data.targetScale - data.currentScale;
        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1 || Math.abs(ds) > 0.01) {
            needsAnotherFrame = true;
        } else {
            // Snap to target
            data.currentX = data.targetX; data.currentY = data.targetY; data.currentScale = data.targetScale;
        }

        // Apply styles: delta translate + scale
        const deltaTranslateX = data.currentX - data.initialX;
        const deltaTranslateY = data.currentY - data.initialY;
        el.style.transform = `translate(${deltaTranslateX.toFixed(3)}px, ${deltaTranslateY.toFixed(3)}px) scale(${data.currentScale.toFixed(3)})`;
        el.style.zIndex = data.isHovered ? '10' : data.originalZIndex;
    }

    // 4. Request next frame
    if (needsAnotherFrame) {
        animationFrameId = requestAnimationFrame(animationStep);
    } else {
        animationFrameId = null;
        console.log("[orbitLayoutDOM v_FINAL2] Animation loop stopped.");
    }
}

/** Starts the animation loop if it's not already running */
function startAnimationLoop() {
    if (!animationFrameId) {
        console.log("[orbitLayoutDOM v_FINAL2] Animation loop starting...");
        animationFrameId = requestAnimationFrame(animationStep);
    }
}

/**
 * Sets up DIRECT hover listeners for a single element.
 */
function setupHoverInteraction(panel) {
    // Added check to ensure listeners aren't attached multiple times
    if (panel._orbitHoverListenersAttached_vF2) return;

    console.log(`[orbitLayoutDOM v_FINAL2] Attaching hover listeners to:`, panel);
    panel.addEventListener('pointerenter', (event) => {
        // Optional: Log the event target to ensure it's the expected element
        // console.log('Pointer Enter:', event.target);
        const data = elementDataStore.get(panel);
        if (!data || data.isHovered) {
             // console.log('Hover ignored (no data or already hovered)');
            return;
        }
        // console.log('Hover Start:', panel);

        data.isHovered = true;
        data.targetScale = data.config.hoverScale;
        data.targetX = data.initialX; // Keep hovered item's target stable
        data.targetY = data.initialY;

        // Reset targets for OTHERS
        activeElements.forEach(el => {
            if (el !== panel) {
                const otherData = elementDataStore.get(el);
                if (otherData) {
                    otherData.targetX = otherData.initialX;
                    otherData.targetY = otherData.initialY;
                    otherData.targetScale = 1;
                    otherData.isHovered = false;
                }
            }
        });
        startAnimationLoop();
    });

    panel.addEventListener('pointerleave', (event) => {
         // console.log('Pointer Leave:', event.target);
         const data = elementDataStore.get(panel);
        if (!data || !data.isHovered) {
             // console.log('Hover End ignored (no data or not hovered)');
            return;
        }
         // console.log('Hover End:', panel);

        data.isHovered = false;
        // Reset self
        data.targetScale = 1;
        data.targetX = data.initialX;
        data.targetY = data.initialY;

        // Reset ALL targets to initial (allows smooth return)
        activeElements.forEach(el => {
            const otherData = elementDataStore.get(el);
            if (otherData) {
                otherData.targetX = otherData.initialX;
                otherData.targetY = otherData.initialY;
                otherData.targetScale = 1;
            }
        });
        startAnimationLoop();
    });

    panel._orbitHoverListenersAttached_vF2 = true; // Use a unique flag
}

// Optional: Function to update configuration dynamically
export function updateOrbitConfiguration(newOptions) {
    console.log("[orbitLayoutDOM v_FINAL2] Updating configuration:", newOptions);
    activeElements.forEach(el => {
        const data = elementDataStore.get(el);
        if(data) {
             // Merge new options into the existing config for this element
             data.config = { ...data.config, ...newOptions };
              // Also update the stored nodeInfo if centralRadius changed
             if ('centralRadius' in newOptions && data.nodeInfo) {
                 data.nodeInfo.radius = data.config.centralRadius;
             }
        }
    });
    if ('animationSpeed' in newOptions || 'repulsionPadding' in newOptions || 'repulsionIterations' in newOptions || 'hoverScale' in newOptions || 'centralRadius' in newOptions) {
         startAnimationLoop(); // Restart loop if interaction params change
    }
}

// --- END OF FILE orbitLayoutDOM.js ---