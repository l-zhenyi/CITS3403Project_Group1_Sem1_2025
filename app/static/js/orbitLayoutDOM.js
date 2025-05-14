// --- START OF FILE orbitLayoutDOM.js ---
// REVISED: v24 - Dynamic Viewport Targeting for Click Zoom
import { getTransformState, smoothSetTransformState, smoothZoomToRect } from './viewportManager.js';

window.draggingAllowed ??= true;

console.log("[OrbitLayoutDOM Strict Class v24 DynamicViewportTarget] Module Loaded.");

// --- Configuration ---
const defaultConfig = {
    N: 12,
    centralRadius: 60,
    ringPadding: 10,
    ringGap: 8,
    circleSpacing: 4,
    minCircleRadius: 5,
    hoverScale: 1.5,
    clickScale: 3.5,
    animationSpeed: 0.18,
    repulsionPadding: 4,
    repulsionIterations: 5,
    nudgeFactor: 0.05,
    clickToFillPadding: 20,
    zoomDuration: 300,
};

// --- Helper Functions ---
function lerp(a, b, t) { return a * (1 - t) + b * t; }
function distance(x1, y1, x2, y2) { const dx = x2 - x1; const dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); }

export class OrbitLayoutManager {
    static referenceDiameter = 100;
    static referenceFontSize = 6;

    nodeEl = null;
    eventEls = [];
    config = {};
    elementDataStore = new WeakMap();
    activeElements = new Set();
    animationFrameId = null;
    nodeCenterX = 0;
    nodeCenterY = 0;
    centralNodeCollisionRadius = 0;
    nodeInfo = {};
    isRunning = false;
    instanceId = `orbit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    _currentlyClickedPanel = null;
    _boundHandleRsvpUpdate = this._handleRsvpUpdate.bind(this);

    constructor(nodeEl, eventEls, options = {}) {
        if (!nodeEl) { throw new Error(`[OrbitLayoutDOM ${this.instanceId}] ERROR: Central node element not provided.`); }
        this.nodeEl = nodeEl;
        this.eventEls = Array.isArray(eventEls) ? [...eventEls] : (eventEls instanceof NodeList ? Array.from(eventEls) : (eventEls ? [eventEls] : []));
        this.config = { ...defaultConfig, ...options };
        try {
            document.addEventListener('rsvpUpdated', this._boundHandleRsvpUpdate);
        } catch (e) {
            console.error(`%c[OrbitLayoutDOM ${this.instanceId}] FAILED to attach document listener for rsvpUpdated:`, "color: red;", e);
        }
        requestAnimationFrame(() => {
            this.performLayout();
        });
    }

    performLayout() {
        this.isRunning = false;
        if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; }

        if (this._currentlyClickedPanel) {
            const data = this.elementDataStore.get(this._currentlyClickedPanel);
            if (data) this._unclickPanel(this._currentlyClickedPanel, data, false);
        }
        this._currentlyClickedPanel = null;

        if (!this.nodeEl || !document.body.contains(this.nodeEl)) {
             console.warn(`[OrbitLayoutDOM ${this.instanceId}] Layout aborted: Central node ${this.nodeEl?.id} missing or not in DOM.`);
             // If nodeEl is gone, clean up any existing active elements tied to this instance
             this.activeElements.forEach(el => this._removeElement(el));
             this.activeElements.clear();
             return;
        }
        const container = this.nodeEl.offsetParent;
        if (!container) { console.error(`%c[OrbitLayoutDOM ${this.instanceId}] FATAL ERROR: offsetParent for central node is null. Node ID: ${this.nodeEl.id}`, "color: red; font-weight: bold;"); return; }

        const nodeLayoutX = this.nodeEl.offsetLeft; const nodeLayoutY = this.nodeEl.offsetTop;
        this.nodeCenterX = nodeLayoutX + this.nodeEl.offsetWidth / 2;
        this.nodeCenterY = nodeLayoutY + this.nodeEl.offsetHeight / 2;
        const autoRadius = Math.max(this.nodeEl.offsetWidth, this.nodeEl.offsetHeight) / 2;
        this.centralNodeCollisionRadius = Math.max(autoRadius, this.config.centralRadius || 0);
        this.config.centralRadius = this.centralNodeCollisionRadius;
        this.nodeInfo = { centerX: this.nodeCenterX, centerY: this.nodeCenterY, radius: this.centralNodeCollisionRadius };

        const N = this.config.N; const totalEvents = this.eventEls.length;
        if (totalEvents === 0 || N <= 0) {
            // If there are no events, ensure any previously active elements are cleaned up.
            const oldActiveElements = new Set(this.activeElements);
            oldActiveElements.forEach(el => this._removeElement(el));
            this.activeElements.clear();
            this._startAnimationLoop(); // Start loop if any pending cleanup might need it, or to stop it.
            return;
        }
        const numRings = Math.ceil(totalEvents / N);
        let eventIndex = 0; let lastOrbitRadius_Layout = this.config.centralRadius; let lastCircleRadius = 0;
        const angleOffset = -Math.PI / 2;
        
        const newActiveElements = new Set();

        for (let ringIdx = 0; ringIdx < numRings; ringIdx++) {
            const ringIndex = ringIdx + 1; const isLastRing = (ringIndex === numRings);
            const numCirclesActualThisRing = isLastRing ? (totalEvents - eventIndex) : N;
            if (numCirclesActualThisRing <= 0) break;

            let estimatedOrbitRadius, finalOrbitRadius, circleRadius;
            if (ringIndex === 1) { estimatedOrbitRadius = lastOrbitRadius_Layout + this.config.ringPadding + this.config.minCircleRadius; }
            else { estimatedOrbitRadius = lastOrbitRadius_Layout + lastCircleRadius + this.config.ringGap + this.config.minCircleRadius; }

            const circumference = 2 * Math.PI * estimatedOrbitRadius;
            const idealRadiusBasedOnN = Math.max(0, (circumference / N - this.config.circleSpacing) / 2);
            circleRadius = Math.max(this.config.minCircleRadius, idealRadiusBasedOnN);

            if (ringIndex === 1) { finalOrbitRadius = lastOrbitRadius_Layout + this.config.ringPadding + circleRadius; }
            else { finalOrbitRadius = lastOrbitRadius_Layout + lastCircleRadius + this.config.ringGap + circleRadius; }

            const angleStep = (2 * Math.PI) / N;
            const startAngle = (ringIndex % 2 === 0) ? angleOffset + angleStep / 2 : angleOffset;
            
            for (let i = 0; i < numCirclesActualThisRing; i++) {
                if (eventIndex >= totalEvents) break;
                const el = this.eventEls[eventIndex];
                if (!el) { eventIndex++; continue; }

                if (!document.body.contains(el)) {
                    console.warn(`[OrbitLayoutDOM ${this.instanceId}] Element ${el.id || 'UNIDED'} not in DOM during layout. Skipping.`);
                    if (this.elementDataStore.has(el)) this.elementDataStore.delete(el); // Clean data if it existed
                    eventIndex++;
                    continue;
                }
                
                if (!el._eventData || typeof el._eventData.id === 'undefined') {
                    console.warn(`[OrbitLayoutDOM ${this.instanceId}] Element missing _eventData:`, el.id || el);
                }
                newActiveElements.add(el);
                
                const angle = startAngle + i * angleStep;
                const diameter = circleRadius * 2;
                const initialTargetCenterX = this.nodeCenterX + finalOrbitRadius * Math.cos(angle);
                const initialTargetCenterY = this.nodeCenterY + finalOrbitRadius * Math.sin(angle);
                
                this._ensureContentWrappers(el);
                
                el.style.position = 'absolute';
                el.style.width = `${diameter}px`;
                el.style.height = `${diameter}px`;
                el.style.borderRadius = '50%';
                el.style.left = `${(initialTargetCenterX - diameter / 2).toFixed(3)}px`;
                el.style.top = `${(initialTargetCenterY - diameter / 2).toFixed(3)}px`;
                el.style.transform = 'none';
                el.style.willChange = 'width, height, left, top, font-size';
                el.style.transition = 'none';
                el.style.overflow = 'hidden';
                el.style.setProperty('--current-diameter', `${diameter.toFixed(3)}px`);
                const initialFontSize = (diameter / OrbitLayoutManager.referenceDiameter) * OrbitLayoutManager.referenceFontSize;
                el.style.fontSize = `${initialFontSize.toFixed(3)}px`;
                
                const eventIdNum = el._eventData?.id ? parseInt(String(el._eventData.id).split('-').pop(), 10) : null; // Handle cases like "groupid-eventid"

                let data = this.elementDataStore.get(el);
                if (data) { // Element is being re-laid out
                    data.initialX = initialTargetCenterX; data.initialY = initialTargetCenterY;
                    data.initialRadius = circleRadius; data.initialWidth = diameter; data.initialHeight = diameter;
                    if (!data.isHovered && !data.isClicked) { // Only reset if not in an active state
                        data.targetX = initialTargetCenterX; data.targetY = initialTargetCenterY;
                        data.currentX = initialTargetCenterX; data.currentY = initialTargetCenterY;
                        data.targetScale = 1; data.currentScale = 1;
                        data.currentWidth = diameter; data.currentHeight = diameter;
                    }
                    data.config = this.config; data.nodeInfo = this.nodeInfo;
                    data._eventDataRef = el._eventData;
                    data.eventId = eventIdNum;
                } else { // New element
                    data = {
                        initialX: initialTargetCenterX, initialY: initialTargetCenterY,
                        initialRadius: circleRadius, initialWidth: diameter, initialHeight: diameter,
                        currentX: initialTargetCenterX, currentY: initialTargetCenterY,
                        currentWidth: diameter, currentHeight: diameter, currentScale: 1,
                        targetX: initialTargetCenterX, targetY: initialTargetCenterY, targetScale: 1,
                        isHovered: false, isClicked: false, originalZIndex: el.style.zIndex || '1',
                        config: this.config, nodeInfo: this.nodeInfo,
                        eventId: eventIdNum,
                        _eventDataRef: el._eventData,
                        preClickViewportState: null
                    };
                    this.elementDataStore.set(el, data);
                    this._ensureExpandedContentDiv(el);
                    this._setupHoverInteraction(el);
                    this._setupClickInteraction(el);
                }
                eventIndex++;
            }
            lastOrbitRadius_Layout = finalOrbitRadius; lastCircleRadius = circleRadius;
            if (eventIndex >= totalEvents) break;
        }

        // Cleanup elements that were active but are no longer in this.eventEls
        this.activeElements.forEach(oldEl => {
            if (!newActiveElements.has(oldEl)) {
                this._removeElement(oldEl);
            }
        });
        this.activeElements = newActiveElements; // Set to the newly processed set

        this._startAnimationLoop();
    }

    _removeElement(el) {
        if (el._orbitCleanups) {
            if (el._orbitCleanups.has(this)) {
                try {
                    const cleanupFunc = el._orbitCleanups.get(this);
                    if (typeof cleanupFunc === 'function') cleanupFunc();
                    el._orbitCleanups.delete(this);
                    if (el._orbitCleanups.size === 0) delete el._orbitCleanups;
                } catch (e) { console.error(`[OrbitLayoutDOM ${this.instanceId}] Error during _removeElement cleanup:`, e, el); }
            }
        }
        this.elementDataStore.delete(el);
        if(this._currentlyClickedPanel === el) this._currentlyClickedPanel = null;
    }


    _resolveDomCollisions(elementsData) {
        const iterations = this.config.repulsionIterations;
        const padding = this.config.repulsionPadding;
        if (iterations === 0 || elementsData.length === 0) return;

        const centralX = this.nodeInfo.centerX;
        const centralY = this.nodeInfo.centerY;
        const centralRadius = this.nodeInfo.radius;

        for (let iter = 0; iter < iterations; iter++) {
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

                        const aIsFixed = aData.isHovered || aData.isClicked;
                        const bIsFixed = bData.isHovered || bData.isClicked;

                        let pushFactorA = 0.5, pushFactorB = 0.5;
                        if (aIsFixed && bIsFixed) { pushFactorA = 0; pushFactorB = 0; }
                        else if (aIsFixed) { pushFactorA = 0; pushFactorB = 1; }
                        else if (bIsFixed) { pushFactorA = 1; pushFactorB = 0; }

                        if (pushFactorA + pushFactorB > 0) {
                            const totalPushFactorInv = 1.0 / (pushFactorA + pushFactorB);
                            const pushX = Math.cos(angle) * overlap * totalPushFactorInv;
                            const pushY = Math.sin(angle) * overlap * totalPushFactorInv;
                            aData.targetX -= pushX * pushFactorA; aData.targetY -= pushY * pushFactorA;
                            bData.targetX += pushX * pushFactorB; bData.targetY += pushY * pushFactorB;
                        }
                    }
                }
            }

            for (let i = 0; i < elementsData.length; i++) {
                const elData = elementsData[i];
                const elRadius = elData.initialRadius * elData.targetScale;
                const elX = elData.targetX; const elY = elData.targetY;

                const distFromCenter = distance(centralX, centralY, elX, elY);
                const requiredDistFromCenter = centralRadius + elRadius + padding;

                if (distFromCenter < requiredDistFromCenter && distFromCenter > 0.01) {
                    const overlap = requiredDistFromCenter - distFromCenter;
                    const angle = Math.atan2(elY - centralY, elX - centralX);
                    elData.targetX += Math.cos(angle) * overlap;
                    elData.targetY += Math.sin(angle) * overlap;
                }
            }
        }

        const nudgeFactor = this.config.nudgeFactor;
        elementsData.forEach(data => {
            if (!data.isHovered && !data.isClicked) {
                data.targetX = lerp(data.targetX, data.initialX, nudgeFactor);
                data.targetY = lerp(data.targetY, data.initialY, nudgeFactor);
            }
        });
        
        elementsData.forEach(data => {
            const elRadius = data.initialRadius * data.targetScale;
            const dist = distance(centralX, centralY, data.targetX, data.targetY);
            const requiredDist = centralRadius + elRadius + padding; 
            if (dist < requiredDist && dist > 0.01) {
                const angle = Math.atan2(data.targetY - centralY, data.targetX - centralX) || 0;
                data.targetX = centralX + Math.cos(angle) * requiredDist;
                data.targetY = centralY + Math.sin(angle) * requiredDist;
            } else if (dist <= 0.01 && requiredDist > 0) {
                 data.targetX = centralX + requiredDist;
                 data.targetY = centralY;
            }
        });
    }

    _animationStep = () => {
        this.animationFrameId = null;
        let needsAnotherFrame = false;
        const elementsData = [];
        const currentActiveElements = new Set(this.activeElements);

        currentActiveElements.forEach(el => {
            if (document.body.contains(el) && this.elementDataStore.has(el)) {
                elementsData.push(this.elementDataStore.get(el));
            } else {
                this._removeElement(el);
                this.activeElements.delete(el);
            }
        });

        if (elementsData.length === 0 && this.activeElements.size === 0) {
            this.isRunning = false;
            // If a viewport dynamic target callback was associated with a panel from this instance,
            // it should be cleared if this instance stops.
            // However, viewportManager.currentDynamicTargetCallback is global to viewportManager.
            // This might need a more instance-specific way if multiple OrbitLayouts use dynamic zoom.
            // For now, we assume only one OrbitLayout controls dynamic zoom at a time.
            // If _currentlyClickedPanel is null, then the dynamic target callback from
            // _setupClickInteraction would return null, ending the dynamic zoom.
            return;
        }

        this._resolveDomCollisions(elementsData);

        for (const data of elementsData) {
            const el = Array.from(this.activeElements).find(element => this.elementDataStore.get(element) === data);
            if (!el) continue;
            const speed = data.config.animationSpeed;

            data.currentX = lerp(data.currentX, data.targetX, speed);
            data.currentY = lerp(data.currentY, data.targetY, speed);
            data.currentScale = lerp(data.currentScale, data.targetScale, speed);

            data.currentWidth = data.initialWidth * data.currentScale;
            data.currentHeight = data.initialHeight * data.currentScale;

            const currentLeft = data.currentX - data.currentWidth / 2;
            const currentTop = data.currentY - data.currentHeight / 2;
            const currentDiameter = data.currentWidth;
            const currentFontSize = (currentDiameter / OrbitLayoutManager.referenceDiameter) * OrbitLayoutManager.referenceFontSize;
            const clampedFontSize = Math.max(0.1, currentFontSize);

            const dx = data.targetX - data.currentX;
            const dy = data.targetY - data.currentY;
            const dScale = data.targetScale - data.currentScale;
            const posThreshold = 0.1; const scaleThreshold = 0.005;

            if (Math.abs(dx) > posThreshold || Math.abs(dy) > posThreshold || Math.abs(dScale) > scaleThreshold) {
                needsAnotherFrame = true;
            } else {
                data.currentX = data.targetX; data.currentY = data.targetY; data.currentScale = data.targetScale;
                data.currentWidth = data.initialWidth * data.targetScale;
                data.currentHeight = data.initialHeight * data.targetScale;
                // Final snap, no need to update style here, will be done below
            }
            el.style.left = `${currentLeft.toFixed(3)}px`;
            el.style.top = `${currentTop.toFixed(3)}px`;
            el.style.width = `${data.currentWidth.toFixed(3)}px`;
            el.style.height = `${data.currentHeight.toFixed(3)}px`;
            el.style.transform = 'none';
            el.style.setProperty('--current-diameter', `${currentDiameter.toFixed(3)}px`);
            el.style.fontSize = `${clampedFontSize.toFixed(3)}px`;

            el.style.zIndex = (data.isHovered || data.isClicked) ? '10' : data.originalZIndex;
            this._updateContentVisibility(el, data.isClicked);
        }
        if (needsAnotherFrame) {
            this.isRunning = true;
            this.animationFrameId = requestAnimationFrame(this._animationStep);
        } else {
            this.isRunning = false;
        }
    }

    _startAnimationLoop() {
        if (!this.animationFrameId && this.activeElements.size > 0) {
            this.isRunning = true;
            this.animationFrameId = requestAnimationFrame(this._animationStep);
        } else if (this.activeElements.size === 0 && this.isRunning) {
            // If no active elements, ensure isRunning is false.
            // If an animationFrameId was pending, it would have cleared itself.
            this.isRunning = false;
        }
    }

    // _ensureContentWrappers (same)
    _ensureContentWrappers(panel) {
        const originalContentClass = 'orbit-element-original-content'; const expandedContentClass = 'orbit-element-expanded-content';
        let originalContentWrapper = panel.querySelector(`.${originalContentClass}`);
        if (!originalContentWrapper) {
            originalContentWrapper = document.createElement('div'); originalContentWrapper.className = originalContentClass;
            const nodesToMove = [];
            for (let i = panel.childNodes.length - 1; i >= 0; i--) {
                const node = panel.childNodes[i];
                if (!(node.nodeType === Node.ELEMENT_NODE && node.classList.contains(expandedContentClass))) nodesToMove.push(node);
            }
            nodesToMove.reverse().forEach(node => originalContentWrapper.appendChild(node));
            const expandedContent = panel.querySelector(`.${expandedContentClass}`);
            if (expandedContent) panel.insertBefore(originalContentWrapper, expandedContent);
            else panel.appendChild(originalContentWrapper);
        } else {
             let img = originalContentWrapper.querySelector('.event-image'); let overlay = originalContentWrapper.querySelector('.event-info-overlay');
             if (!img || !overlay) console.warn(`[OrbitLayoutDOM ${this.instanceId}] Original content wrapper for panel ${panel.id} exists but lacks expected .event-image or .event-info-overlay.`);
        }
        this._ensureExpandedContentDiv(panel);
    }


    // _ensureExpandedContentDiv (same)
   _ensureExpandedContentDiv(panel) {
        const containerClass = 'orbit-element-expanded-content'; let expandedDiv = panel.querySelector(`.${containerClass}`);
        if (!expandedDiv) {
            expandedDiv = document.createElement('div'); expandedDiv.className = containerClass; expandedDiv.classList.add('glassy');
            const event = panel._eventData || {}; const initialStatus = event.current_user_rsvp_status;
            let statusClass = 'status-unknown'; let statusText = 'RSVP?';
            if (initialStatus === 'attending') { statusClass = 'status-attending'; statusText = 'Attending'; }
            else if (initialStatus === 'maybe') { statusClass = 'status-maybe'; statusText = 'Maybe'; }
            else if (initialStatus === 'declined') { statusClass = 'status-declined'; statusText = 'Declined'; }
            else if (initialStatus === null) { statusClass = 'status-cleared'; statusText = 'Cleared'; } // Assuming null means cleared
            
            let formattedDate = "Date Placeholder";
            if (event.date) {
                try {
                    const dateObj = event.date instanceof Date ? event.date : new Date(event.date);
                    if (!isNaN(dateObj.getTime())) {
                        formattedDate = dateObj.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
                    }
                } catch (e) { console.warn("Error formatting date for panel:", event.date, e); }
            }

            const eventData = { title: event.title || "Event Title Placeholder", date: formattedDate, location: event.location || "Location Placeholder", statusClass: statusClass, statusText: statusText, logoUrl: event.image_url || null, details: event.description || "No extra details available.", cost: event.cost_display || null, id: event.id || '' };
            expandedDiv.innerHTML = `
            <div class="expanded-grid-container-v2">
              <div class="grid-item event-header"><div class="event-logo-wrapper"><img src="${eventData.logoUrl || '/static/img/default-event-logo.png'}" alt="Event Logo" class="event-logo-img"></div><div class="event-title-wrapper content-box"><div class="title-scroll">${eventData.title}</div></div></div>
              <div class="grid-item event-status ${eventData.statusClass}"><span class="status-pill">${eventData.statusText}</span></div>
              <div class="grid-item event-timeplace content-box"><div class="timeplace-content"><p>📅 <strong>Date:</strong> ${eventData.date}</p><p>📍 <strong>Location:</strong> ${eventData.location}</p>${eventData.cost ? `<p>💲 <strong>Cost:</strong> ${eventData.cost}</p>` : ''}${eventData.details ? `<p class="extra-details">📝 ${eventData.details}</p>` : ''}</div></div>
              <div class="grid-item more-info"><button class="button info-button" data-event-id="${eventData.id}">More Info</button></div>
            </div>`;
            panel.appendChild(expandedDiv);
            const moreInfoButton = expandedDiv.querySelector('.info-button');
            if (moreInfoButton) {
                const buttonClickListener = (e) => {
                    e.stopPropagation(); const eventId = e.currentTarget.dataset.eventId; const panelEventData = panel._eventData;
                    if (eventId && panelEventData) {
                        const openModalEvent = new CustomEvent('openEventModalRequest', { detail: { eventData: panelEventData }, bubbles: true, composed: true });
                        document.dispatchEvent(openModalEvent);
                    } else console.warn(`[OrbitLayoutDOM ${this.instanceId}] 'More Info' button clicked, but event ID or panel._eventData missing. Event ID: ${eventId}, Panel Data:`, panelEventData);
                };
                moreInfoButton.addEventListener('click', buttonClickListener); moreInfoButton._clickListener = buttonClickListener; // Store for potential cleanup
            }
        }
        if (expandedDiv.style.display !== 'none') expandedDiv.style.display = 'none'; // Ensure hidden initially
        expandedDiv.classList.remove('visible');
        return expandedDiv;
    }

    // _updateContentVisibility (same)
    _updateContentVisibility(panel, showExpanded) {
        const expandedDiv = panel.querySelector('.orbit-element-expanded-content'); const originalContentDiv = panel.querySelector('.orbit-element-original-content');
        const originalDisplay = 'flex'; const expandedDisplay = 'flex'; let changed = false;
        if (originalContentDiv) {
            const targetDisplay = showExpanded ? 'none' : originalDisplay;
            if (originalContentDiv.style.display !== targetDisplay) { originalContentDiv.style.display = targetDisplay; changed = true; }
            if (originalContentDiv.classList.contains('hidden') !== showExpanded) originalContentDiv.classList.toggle('hidden', showExpanded);
        }
        if (expandedDiv) {
            const targetDisplay = showExpanded ? expandedDisplay : 'none';
            if (expandedDiv.style.display !== targetDisplay) {
                expandedDiv.style.display = targetDisplay; changed = true;
                if (showExpanded) requestAnimationFrame(() => { requestAnimationFrame(() => { expandedDiv.classList.add('visible'); }); });
            }
            if (expandedDiv.classList.contains('visible') !== showExpanded) {
                 if (showExpanded) { if (!changed) requestAnimationFrame(() => { requestAnimationFrame(() => { expandedDiv.classList.add('visible'); }); });}
                 else expandedDiv.classList.remove('visible');
                 changed = true;
             }
        }
    }


    // _setupHoverInteraction (same)
    _setupHoverInteraction(panel) {
        const listenerFlag = '_orbitHoverListenersAttached_v15';
        if (panel[listenerFlag]) return;
        const handlePointerEnter = (event) => {
            const data = this.elementDataStore.get(panel);
            if (!data || data.isClicked || data.isHovered) return;
            data.isHovered = true; data.targetScale = data.config.hoverScale;
            this._startAnimationLoop();
        };
        const handlePointerLeave = (event) => {
            const data = this.elementDataStore.get(panel); if (!data) return;
            let needsAnim = false;
            if (data.isHovered) {
                data.isHovered = false;
                if (!data.isClicked) { data.targetScale = 1; needsAnim = true; }
            }
            if (needsAnim) this._startAnimationLoop();
        };
        panel.addEventListener('pointerenter', handlePointerEnter); panel.addEventListener('pointerleave', handlePointerLeave);
        panel[listenerFlag] = { enter: handlePointerEnter, leave: handlePointerLeave };
        if (!panel._orbitCleanups) panel._orbitCleanups = new Map();
        const cleanupFunc = () => { panel.removeEventListener('pointerenter', handlePointerEnter); panel.removeEventListener('pointerleave', handlePointerLeave); delete panel[listenerFlag]; };
        panel._orbitCleanups.set(this, cleanupFunc);
    }


    async _setupClickInteraction(panel) {
        const clickListenerFlag = '_orbitClickListenersAttached_v15_dynamicZoom'; // New flag version
        if (panel[clickListenerFlag]) return;

        const handleClick = async (event) => {
            event.stopPropagation();
            if (event.target.closest('.more-info button.info-button')) return;

            const data = this.elementDataStore.get(panel);
            if ((!window.draggingAllowed && !(data && data.isClicked)) || !data) return;

            if (data.isClicked) {
                await this._unclickPanel(panel, data, true);
            } else {
                if (this._currentlyClickedPanel && this._currentlyClickedPanel !== panel) {
                    const otherData = this.elementDataStore.get(this._currentlyClickedPanel);
                    if (otherData) await this._unclickPanel(this._currentlyClickedPanel, otherData, true);
                }

                data.preClickViewportState = getTransformState(); // Store current viewport

                // Set panel's animation targets
                data.targetScale = data.config.clickScale;
                data.targetX = data.initialX; // Target the original orbital slot (might get repelled)
                data.targetY = data.initialY;
                data.isClicked = true;
                data.isHovered = false;
                this._currentlyClickedPanel = panel;
                window.draggingAllowed = false;

                // Start panel's own animation (scaling, moving, and collision resolution)
                this._startAnimationLoop();

                // Define the callback for dynamic viewport targeting
                const getDynamicTargetRect = () => {
                    if (this._currentlyClickedPanel !== panel || !this.elementDataStore.has(panel)) {
                        return null; // Panel unclicked or removed, stop dynamic targeting
                    }
                    const currentPanelData = this.elementDataStore.get(panel);
                    if (!currentPanelData.isClicked) return null; // No longer clicked

                    const panelDOMWidth = currentPanelData.initialWidth * currentPanelData.targetScale; // targetScale is clickScale
                    const panelDOMHeight = currentPanelData.initialHeight * currentPanelData.targetScale;

                    return {
                        x: currentPanelData.targetX - panelDOMWidth / 2,   // Use current targetX/Y
                        y: currentPanelData.targetY - panelDOMHeight / 2,  // which is updated by collision
                        width: panelDOMWidth,
                        height: panelDOMHeight
                    };
                };

                // Initial rect for viewport (might be slightly off from final due to immediate collision)
                const initialPanelFutureDOMWidth = data.initialWidth * data.config.clickScale;
                const initialPanelFutureDOMHeight = data.initialHeight * data.config.clickScale;
                const initialTargetRectForViewport = {
                    x: data.initialX - initialPanelFutureDOMWidth / 2,
                    y: data.initialY - initialPanelFutureDOMHeight / 2,
                    width: initialPanelFutureDOMWidth,
                    height: initialPanelFutureDOMHeight
                };

                // Initiate viewport zoom with the dynamic callback
                await smoothZoomToRect(
                    initialTargetRectForViewport, // Provide an initial target
                    data.config.clickToFillPadding,
                    data.config.zoomDuration,
                    getDynamicTargetRect             // Pass the callback here
                );
            }
            // Ensure animation loop continues if panel is still animating or needs final snap
            this._startAnimationLoop();
        };

        panel.addEventListener('click', handleClick);
        panel[clickListenerFlag] = handleClick;
        if (!panel._orbitCleanups) panel._orbitCleanups = new Map();
        const cleanupFunc = () => { panel.removeEventListener('click', handleClick); delete panel[clickListenerFlag]; };
        panel._orbitCleanups.set(this, cleanupFunc);
    }

    async _unclickPanel(panel, data, animateViewport = true) {
        if (!panel || !data || !data.isClicked) return false;

        data.targetScale = 1;
        data.targetX = data.initialX; // Target back to its base orbital position
        data.targetY = data.initialY;
        data.isClicked = false; // Mark as unclicked *before* viewport animation

        const duration = animateViewport ? data.config.zoomDuration : 0;
        
        // If dynamic zoom was active for this panel, its callback will now return null,
        // causing smoothZoomToRect to finish. Then smoothSetTransformState will take over.
        await smoothSetTransformState(data.preClickViewportState || { x: 0, y: 0, s: 1.0 }, duration);
        data.preClickViewportState = null;

        window.draggingAllowed = true;
        
        if (this._currentlyClickedPanel === panel) {
            this._currentlyClickedPanel = null;
        }
        this._startAnimationLoop(); // Ensure panel animates back
        return true;
    }

    _handleRsvpUpdate(event) { // Same as before
        const { eventId, newStatus } = event.detail;
        if (typeof eventId !== 'number') { // Ensure eventId is a number for strict comparison
            console.warn(`[OrbitLayoutDOM ${this.instanceId}] Received rsvpUpdated event with non-numeric eventId. Detail:`, event.detail); return;
        }
        for (const panel of this.activeElements) {
            const data = this.elementDataStore.get(panel);
            if (data && data.eventId === eventId) {
                const expandedDiv = panel.querySelector('.orbit-element-expanded-content');
                const statusContainer = expandedDiv ? expandedDiv.querySelector('.event-status') : null;
                const statusPill = statusContainer ? statusContainer.querySelector('.status-pill') : null;
                if (statusContainer && statusPill) {
                    let statusClass = 'status-unknown'; let statusText = 'RSVP?';
                    if (newStatus === 'attending') { statusClass = 'status-attending'; statusText = 'Attending'; }
                    else if (newStatus === 'maybe') { statusClass = 'status-maybe'; statusText = 'Maybe'; }
                    else if (newStatus === 'declined') { statusClass = 'status-declined'; statusText = 'Declined'; }
                    else if (newStatus === null) { statusClass = 'status-cleared'; statusText = 'Cleared'; }
                    statusContainer.className = `grid-item event-status ${statusClass}`; statusPill.textContent = statusText;
                    if (panel._eventData) panel._eventData.current_user_rsvp_status = newStatus;
                } else console.warn(`[OrbitLayoutDOM ${this.instanceId}] Could not find status pill/container elements for event ${eventId} on panel ${panel.id}.`);
                break;
            }
        }
    }

    _cleanupInstance(keepNodeEl = false) { // Same as before
        this.isRunning = false;
        if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; }
        if (this._currentlyClickedPanel) {
            const data = this.elementDataStore.get(this._currentlyClickedPanel);
            const resetState = (data && data.preClickViewportState) ? data.preClickViewportState : { x: 0, y: 0, s: 1.0 };
            smoothSetTransformState(resetState, 0); // Immediate reset
            if (data) data.preClickViewportState = null;
        }
        this._currentlyClickedPanel = null;

        const elementsToClean = new Set(this.activeElements);
        elementsToClean.forEach(el => {
            const expandedDiv = el.querySelector('.orbit-element-expanded-content');
            if (expandedDiv && expandedDiv.parentElement === el) {
                const moreInfoButton = expandedDiv.querySelector('.info-button');
                if (moreInfoButton && moreInfoButton._clickListener) {
                    moreInfoButton.removeEventListener('click', moreInfoButton._clickListener);
                    delete moreInfoButton._clickListener;
                }
                try { el.removeChild(expandedDiv); } catch (e) { /* ignore if already gone */ }
            }
            const originalContent = el.querySelector('.orbit-element-original-content');
            if (originalContent) { originalContent.style.display = ''; originalContent.classList.remove('hidden'); }
            el.style.cssText = ''; el.style.removeProperty('--current-diameter');

            this._removeElement(el); // Use helper for cleanup map
        });
        this.activeElements.clear();
        if (!keepNodeEl) { this.nodeEl = null; this.eventEls = []; this.nodeInfo = {}; }
    }

    async unclickActivePanel() { // Same as before
        if (!this._currentlyClickedPanel) return false;
        const panel = this._currentlyClickedPanel;
        const data = this.elementDataStore.get(panel);
        if (panel && data && data.isClicked) {
            await this._unclickPanel(panel, data, true);
            return true;
        }
        // Fallback safety
        const resetState = (data && data.preClickViewportState) ? data.preClickViewportState : { x: 0, y: 0, s: 1.0 };
        await smoothSetTransformState(resetState, data ? data.config.zoomDuration : defaultConfig.zoomDuration);
        if (data) {
            data.isClicked = false;
            data.preClickViewportState = null;
        }
        this._currentlyClickedPanel = null;
        window.draggingAllowed = true;
        this._startAnimationLoop();
        return false;
    }

    updateLayout(newEventEls = null) { // Same as before, uses performLayout which is updated
        this.isRunning = false;
        if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; }
        if (this._currentlyClickedPanel) {
            const data = this.elementDataStore.get(this._currentlyClickedPanel);
            if (data) this._unclickPanel(this._currentlyClickedPanel, data, false); // No viewport animation
        }
        this._currentlyClickedPanel = null;
        
        const newElementsArray = newEventEls === null ? this.eventEls : (Array.isArray(newEventEls) ? [...newEventEls] : (newEventEls instanceof NodeList ? Array.from(newEventEls) : (newEventEls ? [newEventEls] : [])));
        
        // Update internal list before calling performLayout
        this.eventEls = newElementsArray.filter(el => el instanceof HTMLElement); // Basic validation

        this.performLayout(); // performLayout now handles diffing and cleanup
    }

    updateConfiguration(newOptions) { // Same as before
        if (!this.nodeEl && this.activeElements.size === 0 && this.eventEls.length === 0) { console.warn(`[OrbitLayoutDOM ${this.instanceId}] Attempted to update configuration on likely destroyed or uninitialized instance.`); return; }
        const oldCentralRadius = this.config.centralRadius; const oldHoverScale = this.config.hoverScale; const oldClickScale = this.config.clickScale;
        this.config = { ...this.config, ...newOptions };
        if ('centralRadius' in newOptions && this.nodeInfo && oldCentralRadius !== this.config.centralRadius && this.nodeEl && document.body.contains(this.nodeEl)) {
            const autoRadius = Math.max(this.nodeEl.offsetWidth, this.nodeEl.offsetHeight) / 2;
            this.centralNodeCollisionRadius = Math.max(autoRadius, this.config.centralRadius || 0);
            this.config.centralRadius = this.centralNodeCollisionRadius; this.nodeInfo.radius = this.centralNodeCollisionRadius;
        }
        let scaleConfigChanged = ('hoverScale' in newOptions && oldHoverScale !== this.config.hoverScale) || ('clickScale' in newOptions && oldClickScale !== this.config.clickScale);
        this.activeElements.forEach(el => {
            const data = this.elementDataStore.get(el);
            if (data) {
                data.config = this.config; data.nodeInfo = this.nodeInfo;
                if (scaleConfigChanged) {
                    if (data.isClicked) { data.targetScale = this.config.clickScale; }
                    else if (data.isHovered) { data.targetScale = this.config.hoverScale; }
                }
            }
        });
        if ('animationSpeed' in newOptions || 'repulsionPadding' in newOptions || 'repulsionIterations' in newOptions || 'nudgeFactor' in newOptions || ('centralRadius' in newOptions && oldCentralRadius !== this.config.centralRadius) || scaleConfigChanged || 'clickToFillPadding' in newOptions || 'zoomDuration' in newOptions) {
            this._startAnimationLoop();
        }
    }

    destroy() { // Same as before
        const nodeDesc = this.nodeEl ? this.nodeEl.id || this.nodeEl.tagName : 'Unknown Node';
        // console.log(`[OrbitLayoutDOM ${this.instanceId}] Destroying instance for node: ${nodeDesc}`);
        try {
            document.removeEventListener('rsvpUpdated', this._boundHandleRsvpUpdate);
        } catch (e) {
            console.error(`%c[OrbitLayoutDOM ${this.instanceId}] Error removing document listener during destroy:`, "color: red;", e);
        }
        this._cleanupInstance(false);
    }
} // End Class OrbitLayoutManager
// --- END OF FILE orbitLayoutDOM.js ---