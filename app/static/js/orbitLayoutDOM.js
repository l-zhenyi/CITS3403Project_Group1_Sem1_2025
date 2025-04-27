// --- START OF FILE orbitLayoutDOM_v5_StrictClass_UnifiedScale_v6.js ---
// Refinements:
// - Restore setting --current-scale in JS animation loop.
// - Refined CSS (v6) using division by --current-scale for internal element base sizes.
// - Added backface-visibility CSS mitigation.
// - Pre-set target --current-scale on click/unclick to prevent initial render glitch.

console.log("[OrbitLayoutDOM Strict Class v5 UnifiedScale v6] Module Loaded.");

// --- Configuration (Keep faster defaults) ---
const defaultConfig = { /* ... same as v5 ... */
    N: 12, centralRadius: 60, ringPadding: 10, ringGap: 8, circleSpacing: 4,
    minCircleRadius: 2, hoverScale: 1.5, clickScale: 3.0, animationSpeed: 0.18,
    repulsionPadding: 4, repulsionIterations: 5, nudgeFactor: 0.06,
};

// --- Helper Functions ---
function lerp(a, b, t) { /* ... */ return a * (1 - t) + b * t; }
function distance(x1, y1, x2, y2) { /* ... */ const dx = x2 - x1; const dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); }

// --- CSS Injection (Uses v6 CSS) ---
const internalStylesId = 'orbit-layout-internal-styles-v5'; // Reuse ID
if (!document.getElementById(internalStylesId)) {
    const styleSheet = document.createElement("style");
    styleSheet.id = internalStylesId;
    // PASTE THE UPDATED v6 CSS HERE
    styleSheet.textContent = `
        /* --- CSS for Expanded Content (Inject or include in your CSS file) - v6 --- */
        .orbit-element-original-content { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; transition: opacity 0.2s ease-in-out; opacity: 1; visibility: visible; overflow: hidden; }
        .orbit-element-original-content > img { display: block; max-width: 90%; max-height: 90%; width: auto; height: auto; object-fit: contain; }
        .orbit-element-expanded-content { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: space-between; background-color: rgba(240, 240, 240, 0.95); border-radius: inherit; padding: max(1px, calc( (var(--orbit-diameter, 60px) * 0.05) / var(--current-scale, 1) )); box-sizing: border-box; pointer-events: auto; opacity: 0; transition: opacity 0.2s ease-in-out; visibility: hidden; overflow: hidden; z-index: 1; backface-visibility: hidden; }
        .orbit-element-expanded-content.visible { opacity: 1; visibility: visible; }
        .orbit-element-expanded-content .info-text { font-size: calc( var(--orbit-diameter, 60px) * 0.1 / var(--current-scale, 1) ); line-height: 1.3; text-align: center; margin-bottom: max(1px, calc( (var(--orbit-diameter, 60px) * 0.03) / var(--current-scale, 1) )); color: #333; flex-grow: 1; overflow-y: auto; max-height: 60%; width: 100%; }
        .orbit-element-expanded-content .button-container { display: flex; justify-content: center; align-items: center; flex-wrap: wrap; width: 100%; flex-shrink: 0; }
        .orbit-element-expanded-content button { margin: max(0.5px, calc( (var(--orbit-diameter, 60px) * 0.015) / var(--current-scale, 1) )); padding: max(1px, calc( (var(--orbit-diameter, 60px) * 0.025) / var(--current-scale, 1) )) max(2px, calc( (var(--orbit-diameter, 60px) * 0.05) / var(--current-scale, 1) )); font-size: calc( var(--orbit-diameter, 60px) * 0.09 / var(--current-scale, 1) ); border: max(0.5px, calc(1px / var(--current-scale, 1))) solid #ccc; border-radius: max(1px, calc(4px / var(--current-scale, 1))); background-color: #eee; cursor: pointer; flex-shrink: 0; line-height: 1.2; min-width: unset; }
        .orbit-element-original-content.hidden { opacity: 0; visibility: hidden; pointer-events: none; }
    `;
    document.head.appendChild(styleSheet);
}


export class OrbitLayoutManager {
    // ... (State variables remain the same) ...
    nodeEl = null; eventEls = []; config = {}; elementDataStore = new WeakMap(); activeElements = new Set(); animationFrameId = null; nodeCenterX = 0; nodeCenterY = 0; centralNodeCollisionRadius = 0; nodeInfo = {}; isRunning = false;

    // --- Constructor (Uses new defaults) ---
    constructor(nodeEl, eventEls, options = {}) { /* ... Same as v5 ... */ console.log(`%c[OrbitLayoutDOM v5 UnifiedScale v6] Creating for node:`, "color: darkcyan; font-weight: bold;", nodeEl); if (!nodeEl) { throw new Error("[OrbitLayoutDOM v5 UnifiedScale v6] ERROR: Central node element not provided."); } this.nodeEl = nodeEl; this.eventEls = Array.isArray(eventEls) ? [...eventEls] : (eventEls instanceof NodeList ? Array.from(eventEls) : (eventEls ? [eventEls] : [])); this.config = { ...defaultConfig, ...options }; console.log("[OrbitLayoutDOM v5 UnifiedScale v6] Using Configuration:", this.config); this.performLayout(); this.isRunning = true; }

    // --- Core Layout Method (No changes needed from v5) ---
    performLayout() { /* ... Same as v5 - still sets --orbit-diameter ... */ console.log(`%c[OrbitLayoutDOM v5 UnifiedScale v6] Performing layout for:`, "color: darkcyan;", this.nodeEl); if (!this.nodeEl) { console.error("[OrbitLayoutDOM v5 UnifiedScale v6] Layout aborted: Central node missing."); return; } this._cleanupInstance(true); const container = this.nodeEl.offsetParent; if (!container) { console.error(`%c[OrbitLayoutDOM v5 UnifiedScale v6] FATAL ERROR: nodeEl.offsetParent is null for node:`, "color: red; font-weight: bold;", this.nodeEl); this.isRunning = false; return; } const nodeLayoutX = this.nodeEl.offsetLeft; const nodeLayoutY = this.nodeEl.offsetTop; this.nodeCenterX = nodeLayoutX + this.nodeEl.offsetWidth / 2; this.nodeCenterY = nodeLayoutY + this.nodeEl.offsetHeight / 2; const autoRadius = Math.max(this.nodeEl.offsetWidth, this.nodeEl.offsetHeight) / 2; this.centralNodeCollisionRadius = Math.max(autoRadius, this.config.centralRadius || 0); this.config.centralRadius = this.centralNodeCollisionRadius; this.nodeInfo = { centerX: this.nodeCenterX, centerY: this.nodeCenterY, radius: this.centralNodeCollisionRadius }; const N = this.config.N; const totalEvents = this.eventEls.length; if (totalEvents === 0 || N <= 0) { this.isRunning = false; return; } const numRings = Math.ceil(totalEvents / N); let eventIndex = 0; let lastOrbitRadius_Layout = this.config.centralRadius; let lastCircleRadius = 0; const angleOffset = -Math.PI / 2; for (let ringIdx = 0; ringIdx < numRings; ringIdx++) { const ringIndex = ringIdx + 1; const isLastRing = (ringIndex === numRings); const numCirclesActualThisRing = isLastRing ? (totalEvents - eventIndex) : N; if (numCirclesActualThisRing <= 0) break; let estimatedOrbitRadius, finalOrbitRadius, circleRadius; if (ringIndex === 1) { estimatedOrbitRadius = lastOrbitRadius_Layout + this.config.ringPadding + this.config.minCircleRadius; } else { estimatedOrbitRadius = lastOrbitRadius_Layout + lastCircleRadius + this.config.ringGap + this.config.minCircleRadius; } const circumference = 2 * Math.PI * estimatedOrbitRadius; const idealRadiusBasedOnN = (circumference / N - this.config.circleSpacing) / 2; circleRadius = Math.max(this.config.minCircleRadius, idealRadiusBasedOnN); if (ringIndex === 1) { finalOrbitRadius = lastOrbitRadius_Layout + this.config.ringPadding + circleRadius; } else { finalOrbitRadius = lastOrbitRadius_Layout + lastCircleRadius + this.config.ringGap + circleRadius; } const angleStep = (2 * Math.PI) / N; const startAngle = (ringIndex % 2 === 0) ? angleOffset + angleStep / 2 : angleOffset; for (let i = 0; i < numCirclesActualThisRing; i++) { if (eventIndex >= totalEvents) break; const el = this.eventEls[eventIndex]; if (!el) { eventIndex++; continue; } this.activeElements.add(el); const angle = startAngle + i * angleStep; const diameter = circleRadius * 2; const initialTargetCenterX = this.nodeCenterX + finalOrbitRadius * Math.cos(angle); const initialTargetCenterY = this.nodeCenterY + finalOrbitRadius * Math.sin(angle); const initialTargetLeft = initialTargetCenterX - circleRadius; const initialTargetTop = initialTargetCenterY - circleRadius; if (!el.querySelector('.orbit-element-original-content')) { const wrapper = document.createElement('div'); wrapper.className = 'orbit-element-original-content'; while (el.firstChild) { wrapper.appendChild(el.firstChild); } el.appendChild(wrapper); } el.style.position = 'absolute'; el.style.width = `${diameter}px`; el.style.height = `${diameter}px`; el.style.borderRadius = '50%'; el.style.left = `${initialTargetLeft.toFixed(3)}px`; el.style.top = `${initialTargetTop.toFixed(3)}px`; el.style.transformOrigin = 'center center'; el.style.transform = 'translate(0px, 0px) scale(1)'; el.style.willChange = 'transform'; el.style.transition = 'none'; el.style.setProperty('--orbit-diameter', `${diameter.toFixed(3)}px`); el.style.setProperty('--current-scale', '1'); /* Set initial scale variable */ const data = { initialX: initialTargetCenterX, initialY: initialTargetCenterY, initialRadius: circleRadius, currentX: initialTargetCenterX, currentY: initialTargetCenterY, currentScale: 1, targetX: initialTargetCenterX, targetY: initialTargetCenterY, targetScale: 1, isHovered: false, isClicked: false, originalZIndex: el.style.zIndex || '1', config: this.config, nodeInfo: this.nodeInfo }; this.elementDataStore.set(el, data); this._ensureExpandedContentDiv(el); this._setupHoverInteraction(el); this._setupClickInteraction(el); eventIndex++; } lastOrbitRadius_Layout = finalOrbitRadius; lastCircleRadius = circleRadius; if (eventIndex >= totalEvents) break; } console.log(`%c[OrbitLayoutDOM v5 UnifiedScale v6] Static layout finished for ${this.activeElements.size} elements.`, "color: darkcyan;"); this.isRunning = true; this._startAnimationLoop(); }

    // --- Collision Resolution (No changes needed) ---
    _resolveDomCollisions(elementsData) { /* ... Same as v5 ... */ const iterations = this.config.repulsionIterations; const padding = this.config.repulsionPadding; if (iterations === 0 || elementsData.length === 0) return; const centralX = this.nodeInfo.centerX; const centralY = this.nodeInfo.centerY; const centralRadius = this.nodeInfo.radius; for (let iter = 0; iter < iterations; iter++) { for (let i = 0; i < elementsData.length; i++) { for (let j = i + 1; j < elementsData.length; j++) { const aData = elementsData[i]; const bData = elementsData[j]; const aRadius = aData.initialRadius * aData.targetScale; const bRadius = bData.initialRadius * bData.targetScale; const ax = aData.targetX; const ay = aData.targetY; const bx = bData.targetX; const by = bData.targetY; const targetDist = distance(ax, ay, bx, by); const requiredDist = aRadius + bRadius + padding; if (targetDist < requiredDist && targetDist > 0.01) { const overlap = requiredDist - targetDist; const angle = Math.atan2(by - ay, bx - ax); const aIsFixed = aData.isHovered || aData.isClicked; const bIsFixed = bData.isHovered || bData.isClicked; let pushFactorA = 0.5; let pushFactorB = 0.5; if (aIsFixed && bIsFixed) { pushFactorA = 0; pushFactorB = 0; } else if (aIsFixed) { pushFactorA = 0; pushFactorB = 1; } else if (bIsFixed) { pushFactorA = 1; pushFactorB = 0; } if (pushFactorA + pushFactorB > 0) { const totalPushFactorInv = 1.0 / (pushFactorA + pushFactorB); const pushX = Math.cos(angle) * overlap * totalPushFactorInv; const pushY = Math.sin(angle) * overlap * totalPushFactorInv; aData.targetX -= pushX * pushFactorA; aData.targetY -= pushY * pushFactorA; bData.targetX += pushX * pushFactorB; bData.targetY += pushY * pushFactorB; } } } } for (let i = 0; i < elementsData.length; i++) { const elData = elementsData[i]; const elRadius = elData.initialRadius * elData.targetScale; const elX = elData.targetX; const elY = elData.targetY; const distFromCenter = distance(centralX, centralY, elX, elY); const requiredDistFromCenter = centralRadius + elRadius + padding; if (distFromCenter < requiredDistFromCenter && distFromCenter > 0.01) { const overlap = requiredDistFromCenter - distFromCenter; const angle = Math.atan2(elY - centralY, elX - centralX); elData.targetX += Math.cos(angle) * overlap; elData.targetY += Math.sin(angle) * overlap; } } } const nudgeFactor = this.config.nudgeFactor; elementsData.forEach(data => { if (!data.isHovered && !data.isClicked) { data.targetX = lerp(data.targetX, data.initialX, nudgeFactor); data.targetY = lerp(data.targetY, data.initialY, nudgeFactor); } }); elementsData.forEach(data => { const elRadius = data.initialRadius * data.targetScale; const dist = distance(centralX, centralY, data.targetX, data.targetY); const requiredDist = centralRadius + elRadius + padding; if (dist < requiredDist) { const angle = Math.atan2(data.targetY - centralY, data.targetX - centralX) || 0; data.targetX = centralX + Math.cos(angle) * requiredDist; data.targetY = centralY + Math.sin(angle) * requiredDist; } }); }

    // --- Animation Loop (Set --current-scale) ---
    _animationStep = () => {
        if (!this.isRunning) { this.animationFrameId = null; return; }
        let needsAnotherFrame = false; const elementsData = [];
        // ... (Collect data/cleanup - same as v5) ...
        const currentActiveElements = new Set(this.activeElements); currentActiveElements.forEach(el => { if (document.body.contains(el) && this.elementDataStore.has(el)) { elementsData.push(this.elementDataStore.get(el)); } else { if (this.elementDataStore.has(el)) { if (el._orbitCleanups && el._orbitCleanups.has(this)) { el._orbitCleanups.get(this)(); } this.elementDataStore.delete(el); } this.activeElements.delete(el); } }); if (elementsData.length === 0 && this.activeElements.size === 0) { this.isRunning = false; this.animationFrameId = null; return; }

        this._resolveDomCollisions(elementsData);

        for (const data of elementsData) {
            const el = Array.from(this.activeElements).find(element => this.elementDataStore.get(element) === data);
            if (!el) continue;
            const speed = data.config.animationSpeed;
            data.currentX = lerp(data.currentX, data.targetX, speed); data.currentY = lerp(data.currentY, data.targetY, speed); data.currentScale = lerp(data.currentScale, data.targetScale, speed);
            const dx = data.targetX - data.currentX; const dy = data.targetY - data.currentY; const ds = data.targetScale - data.currentScale;
            if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01 || Math.abs(ds) > 0.001) { needsAnotherFrame = true; }
            else { data.currentX = data.targetX; data.currentY = data.targetY; data.currentScale = data.targetScale; }
            const deltaTranslateX = data.currentX - data.initialX; const deltaTranslateY = data.currentY - data.initialY;

            el.style.transform = `translate(${deltaTranslateX.toFixed(3)}px, ${deltaTranslateY.toFixed(3)}px) scale(${data.currentScale.toFixed(3)})`;
            // Set --current-scale for internal CSS CALCs
            el.style.setProperty('--current-scale', Math.max(0.01, data.currentScale).toFixed(3));

            el.style.zIndex = (data.isHovered || data.isClicked) ? '10' : data.originalZIndex;
            this._updateContentVisibility(el, data.isClicked);
        }

        // Request next frame or stop
        if (needsAnotherFrame && this.isRunning) {
             this.animationFrameId = requestAnimationFrame(this._animationStep);
        } else {
             this.animationFrameId = null;
             if (!needsAnotherFrame) { /* Final Snap Logic - Set --current-scale */
                elementsData.forEach(data => { const el = Array.from(this.activeElements).find(element => this.elementDataStore.get(element) === data); if (el) { data.currentX = data.targetX; data.currentY = data.targetY; data.currentScale = data.targetScale; const finalTranslateX = data.targetX - data.initialX; const finalTranslateY = data.targetY - data.initialY; el.style.transform = `translate(${finalTranslateX.toFixed(3)}px, ${finalTranslateY.toFixed(3)}px) scale(${data.targetScale.toFixed(3)})`; el.style.setProperty('--current-scale', Math.max(0.01, data.targetScale).toFixed(3)); this._updateContentVisibility(el, data.isClicked); } });
             }
        }
    }

    // --- Start Animation Loop (No changes needed) ---
    _startAnimationLoop() { /* ... Same as v5 ... */ if (!this.animationFrameId && this.isRunning && this.activeElements.size > 0) { this.animationFrameId = requestAnimationFrame(this._animationStep); } }

    // --- Helper for Content Visibility (No changes needed from v5) ---
    _ensureExpandedContentDiv(panel) { /* ... Same as v5 ... */ let expandedDiv = panel.querySelector('.orbit-element-expanded-content'); if (!expandedDiv) { expandedDiv = document.createElement('div'); expandedDiv.className = 'orbit-element-expanded-content'; expandedDiv.innerHTML = `<div class="info-text">Event Details Here...</div><div class="button-container"><button class="accept-btn" data-action="accept">Accept</button><button class="decline-btn" data-action="decline">Decline</button><button class="info-btn" data-action="info">Info</button></div>`; expandedDiv.querySelectorAll('.button-container button').forEach(button => { button.addEventListener('click', (e) => { e.stopPropagation(); const action = e.target.dataset.action; console.log(`[OrbitLayoutDOM v5 UnifiedScale v6] Button Action: ${action} on element:`, panel); panel.dispatchEvent(new CustomEvent('orbitaction', { detail: { action: action, element: panel }, bubbles: true, composed: true })); }); }); panel.appendChild(expandedDiv); } return expandedDiv; }
    _updateContentVisibility(panel, showExpanded) { /* ... Same as v5 ... */ const expandedDiv = panel.querySelector('.orbit-element-expanded-content'); const originalContentDiv = panel.querySelector('.orbit-element-original-content'); if (expandedDiv) { expandedDiv.classList.toggle('visible', showExpanded); } if (originalContentDiv) { originalContentDiv.classList.toggle('hidden', showExpanded); } }

    // --- Setup Hover Interaction (No changes needed) ---
    _setupHoverInteraction(panel) { /* ... Same as v5 ... */ const listenerFlag = '_orbitHoverListenersAttached_v5u6'; if (panel[listenerFlag]) return; const handlePointerEnter = (event) => { if (!this.isRunning) return; const data = this.elementDataStore.get(panel); if (!data || data.isHovered || data.isClicked) { return; } data.isHovered = true; data.targetScale = data.config.hoverScale; this.activeElements.forEach(el => { if (el !== panel) { const otherData = this.elementDataStore.get(el); if (otherData && !otherData.isClicked) { otherData.isHovered = false; if(otherData.targetScale !== 1) { otherData.targetScale = 1; } } else if (otherData && otherData.isClicked) { otherData.isHovered = false; } } }); this._startAnimationLoop(); }; const handlePointerLeave = (event) => { if (!this.isRunning) return; const data = this.elementDataStore.get(panel); if (!data) return; let needsAnim = false; if (data.isHovered) { data.isHovered = false; needsAnim = true; } if (data.isClicked) { console.log("[OrbitLayoutDOM v5 UnifiedScale v6] Pointer leaving clicked element. Unclicking.", panel); this._unclickPanel(panel, data); needsAnim = true; } if (!data.isClicked && data.targetScale !== 1) { data.targetScale = 1; needsAnim = true; } if(needsAnim) { this._startAnimationLoop(); } }; panel.addEventListener('pointerenter', handlePointerEnter); panel.addEventListener('pointerleave', handlePointerLeave); panel[listenerFlag] = { enter: handlePointerEnter, leave: handlePointerLeave }; if (!panel._orbitCleanups) { panel._orbitCleanups = new Map(); } const cleanupFunc = () => { panel.removeEventListener('pointerenter', handlePointerEnter); panel.removeEventListener('pointerleave', handlePointerLeave); delete panel[listenerFlag]; panel._orbitCleanups.delete(this); if (panel._orbitCleanups.size === 0) { delete panel._orbitCleanups; } }; panel._orbitCleanups.set(this, cleanupFunc); }

    // --- Setup Click Interaction (Pre-set target scale var) ---
    _setupClickInteraction(panel) {
        const clickListenerFlag = '_orbitClickListenersAttached_v5u6';
        if (panel[clickListenerFlag]) return;

        const handleClick = (event) => {
             if (event.target.closest('.orbit-element-expanded-content button')) { return; }
             if (!this.isRunning) return;
             const data = this.elementDataStore.get(panel);
             if (!data) return;

             if (data.isClicked) {
                 console.log("[OrbitLayoutDOM v5 UnifiedScale v6] Clicked an expanded panel. Shrinking.", panel);
                 this._unclickPanel(panel, data); // This now pre-sets --current-scale to 1
             } else {
                 console.log("[OrbitLayoutDOM v5 UnifiedScale v6] Clicked a panel. Expanding.", panel);
                 // Unclick others first
                 this.activeElements.forEach(el => { /* ... same as v5 ... */ if (el !== panel) { const otherData = this.elementDataStore.get(el); if (otherData && otherData.isClicked) { this._unclickPanel(el, otherData); } if(otherData) otherData.isHovered = false; } });

                 // Handle the clicked panel
                 data.isClicked = true; data.isHovered = false;
                 data.targetScale = data.config.clickScale;
                 // *** PRE-SET CSS VARIABLE for target scale ***
                 panel.style.setProperty('--current-scale', data.targetScale.toFixed(3));

                 this._ensureExpandedContentDiv(panel);
             }
             this._startAnimationLoop();
        };

        panel.addEventListener('click', handleClick);
        panel[clickListenerFlag] = handleClick;
        // ... (cleanup setup - same as v5) ...
        if (!panel._orbitCleanups) { panel._orbitCleanups = new Map(); } const cleanupFunc = () => { panel.removeEventListener('click', handleClick); delete panel[clickListenerFlag]; panel._orbitCleanups.delete(this); if (panel._orbitCleanups.size === 0) { delete panel._orbitCleanups; } }; panel._orbitCleanups.set(this, cleanupFunc);
    }

    // --- Helper to Unclick a Panel (Pre-set target scale var) ---
    _unclickPanel(panel, data) {
        if (!data || !data.isClicked) return;
        data.isClicked = false;
        data.targetScale = 1;
        // *** PRE-SET CSS VARIABLE for target scale ***
        panel.style.setProperty('--current-scale', '1');
    }

    // --- Internal Cleanup Helper (No changes needed) ---
     _cleanupInstance(keepNodeEl = false) { /* ... Same as v5 ... */ console.log(`%c[OrbitLayoutDOM v5 UnifiedScale v6] Cleaning up instance associated with node:`, "color: red;", this.nodeEl); this.isRunning = false; if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; console.log("[OrbitLayoutDOM v5 UnifiedScale v6] Cancelled animation frame."); } const elementsToClean = new Set(this.activeElements); elementsToClean.forEach(el => { if (el._orbitCleanups && el._orbitCleanups.has(this)) { const cleanupFunc = el._orbitCleanups.get(this); if (typeof cleanupFunc === 'function') { cleanupFunc(); } else { el._orbitCleanups.delete(this); if (el._orbitCleanups.size === 0) delete el._orbitCleanups; } } this.elementDataStore.delete(el); }); this.activeElements.clear(); console.log("[OrbitLayoutDOM v5 UnifiedScale v6] Cleared active elements and associated data/listeners."); if (!keepNodeEl) { console.log("[OrbitLayoutDOM v5 UnifiedScale v6] Clearing node and event element references."); this.nodeEl = null; this.eventEls = []; this.nodeInfo = {}; } }

    // --- Public Methods (No changes needed) ---
    updateLayout(newEventEls = null) { /* ... Same as v5 ... */ console.log(`%c[OrbitLayoutDOM v5 UnifiedScale v6] updateLayout called for node:`, "color: blueviolet;", this.nodeEl); if (!this.nodeEl) { console.warn("[OrbitLayoutDOM v5 UnifiedScale v6] updateLayout called on an instance without a node. Aborting."); return; } const wasRunning = this.isRunning; this.isRunning = false; if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; } if (newEventEls !== null) { console.log("[OrbitLayoutDOM v5 UnifiedScale v6] Updating event elements list."); const newElementsArray = Array.isArray(newEventEls) ? [...newEventEls] : (newEventEls instanceof NodeList ? Array.from(newEventEls) : (newEventEls ? [newEventEls] : [])); const newElementsSet = new Set(newElementsArray); const oldElements = new Set(this.activeElements); oldElements.forEach(oldEl => { if (!newElementsSet.has(oldEl)) { console.log("[OrbitLayoutDOM v5 UnifiedScale v6] Removing listener/data for element no longer in list:", oldEl); if (oldEl._orbitCleanups && oldEl._orbitCleanups.has(this)) { oldEl._orbitCleanups.get(this)(); } this.elementDataStore.delete(oldEl); } }); this.eventEls = newElementsArray; } else { console.log("[OrbitLayoutDOM v5 UnifiedScale v6] Re-running layout with existing elements."); this.eventEls = Array.from(this.activeElements).filter(el => document.body.contains(el)); } this.performLayout(); if (this.activeElements.size > 0) { this.isRunning = true; this._startAnimationLoop(); } else { this.isRunning = false; } }
    updateConfiguration(newOptions) { /* ... Same as v5 ... */ console.log("[OrbitLayoutDOM v5 UnifiedScale v6] Updating configuration:", newOptions); if (!this.isRunning && this.activeElements.size === 0 && !this.nodeEl) { console.warn("[OrbitLayoutDOM v5 UnifiedScale v6] Attempted to update configuration on a destroyed or uninitialized instance."); return; } const oldCentralRadius = this.config.centralRadius; const oldHoverScale = this.config.hoverScale; const oldClickScale = this.config.clickScale; this.config = { ...this.config, ...newOptions }; if ('centralRadius' in newOptions && this.nodeInfo && oldCentralRadius !== this.config.centralRadius) { const autoRadius = Math.max(this.nodeEl.offsetWidth, this.nodeEl.offsetHeight) / 2; this.centralNodeCollisionRadius = Math.max(autoRadius, this.config.centralRadius || 0); this.config.centralRadius = this.centralNodeCollisionRadius; this.nodeInfo.radius = this.centralNodeCollisionRadius; console.log("[OrbitLayoutDOM v5 UnifiedScale v6] Updated central node collision radius:", this.nodeInfo.radius); } let scaleChanged = ('hoverScale' in newOptions && oldHoverScale !== this.config.hoverScale) || ('clickScale' in newOptions && oldClickScale !== this.config.clickScale); this.activeElements.forEach(el => { const data = this.elementDataStore.get(el); if (data) { data.config = this.config; data.nodeInfo = this.nodeInfo; if (scaleChanged) { if (data.isClicked && 'clickScale' in newOptions) { data.targetScale = this.config.clickScale; el.style.setProperty('--current-scale', data.targetScale.toFixed(3)); /* Update pre-set if needed */ } else if (data.isHovered && 'hoverScale' in newOptions) { if (!data.isClicked) data.targetScale = data.config.hoverScale; } } } }); if ('animationSpeed' in newOptions || 'repulsionPadding' in newOptions || 'repulsionIterations' in newOptions || 'nudgeFactor' in newOptions || 'centralRadius' in newOptions || scaleChanged) { console.log("[OrbitLayoutDOM v5 UnifiedScale v6] Animation/Collision parameters changed, restarting animation loop."); this._startAnimationLoop(); } }
    destroy() { /* ... Same as v5 ... */ const nodeDesc = this.nodeEl ? this.nodeEl.id || this.nodeEl.tagName : 'Unknown Node'; this._cleanupInstance(false); console.log(`%c[OrbitLayoutDOM v5 UnifiedScale v6] Destroyed instance for node: ${nodeDesc}`, "color: red; font-weight: bold;"); }
}

// --- END OF FILE orbitLayoutDOM_v5_StrictClass_UnifiedScale_v6.js ---