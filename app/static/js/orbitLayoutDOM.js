// --- START OF FILE orbitLayoutDOM.js ---
// REVISED: v28 - Property Name Fix for preClickViewportState (COMPLETE FILE)
import { getTransformState, smoothSetTransformState, smoothZoomToRect } from './viewportManager.js';

window.draggingAllowed ??= true;

console.log("[OrbitLayoutDOM Strict Class v28 PropertyNameFix] Module Loaded.");

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
    _boundHandleClickAway = null; 

    constructor(nodeEl, eventEls, options = {}) {
        if (!nodeEl) { throw new Error(`[OrbitLayoutDOM ${this.instanceId}] ERROR: Central node element not provided.`); }
        this.nodeEl = nodeEl;
        this.eventEls = Array.isArray(eventEls) ? [...eventEls] : (eventEls instanceof NodeList ? Array.from(eventEls) : (eventEls ? [eventEls] : []));
        this.config = { ...defaultConfig, ...options };
        this._boundHandleClickAway = null; 
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
            const currentPanel = this._currentlyClickedPanel; 
            const data = this.elementDataStore.get(currentPanel);
            if (data) {
                this._unclickPanel(currentPanel, data, false)
                    .catch(err => console.error(`[OrbitLayoutDOM ${this.instanceId}] Error unclicking panel during performLayout:`, err));
            }
        }

        if (!this.nodeEl || !document.body.contains(this.nodeEl)) {
             console.warn(`[OrbitLayoutDOM ${this.instanceId}] Layout aborted: Central node ${this.nodeEl ? this.nodeEl.id : 'NO_NODE_EL'} missing or not in DOM.`);
             this.activeElements.forEach(el => this._removeElement(el)); 
             this.activeElements.clear();
             return; 
        }
        
        const container = this.nodeEl.offsetParent;
        if (!container) { 
            console.error(`%c[OrbitLayoutDOM ${this.instanceId}] FATAL ERROR: offsetParent for central node is null. Node ID: ${this.nodeEl.id}. Aborting layout.`, "color: red; font-weight: bold;"); 
            this.activeElements.forEach(el => this._removeElement(el));
            this.activeElements.clear();
            return;
        }

        const nodeLayoutX = this.nodeEl.offsetLeft; const nodeLayoutY = this.nodeEl.offsetTop;
        this.nodeCenterX = nodeLayoutX + this.nodeEl.offsetWidth / 2;
        this.nodeCenterY = nodeLayoutY + this.nodeEl.offsetHeight / 2;
        const autoRadius = Math.max(this.nodeEl.offsetWidth, this.nodeEl.offsetHeight) / 2;
        this.centralNodeCollisionRadius = Math.max(autoRadius, this.config.centralRadius || 0);
        this.config.centralRadius = this.centralNodeCollisionRadius;
        this.nodeInfo = { centerX: this.nodeCenterX, centerY: this.nodeCenterY, radius: this.centralNodeCollisionRadius };

        const N = this.config.N; const totalEvents = this.eventEls.length;
        if (totalEvents === 0 || N <= 0) {
            const oldActiveElements = new Set(this.activeElements);
            oldActiveElements.forEach(el => this._removeElement(el));
            this.activeElements.clear();
            this._startAnimationLoop(); 
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
                    if (this.elementDataStore.has(el)) this.elementDataStore.delete(el);
                    eventIndex++;
                    continue;
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
                
                const eventIdNum = el._eventData?.id ? parseInt(String(el._eventData.id).split('-').pop(), 10) : null;

                let data = this.elementDataStore.get(el);
                if (data) { 
                    data.initialX = initialTargetCenterX; data.initialY = initialTargetCenterY;
                    data.initialRadius = circleRadius; data.initialWidth = diameter; data.initialHeight = diameter;
                    if (!data.isHovered && !data.isClicked) { 
                        data.targetX = initialTargetCenterX; data.targetY = initialTargetCenterY;
                        data.currentX = initialTargetCenterX; data.currentY = initialTargetCenterY;
                        data.targetScale = 1; data.currentScale = 1;
                        data.currentWidth = diameter; data.currentHeight = diameter;
                    }
                    data.config = this.config; data.nodeInfo = this.nodeInfo;
                    data._eventDataRef = el._eventData;
                    data.eventId = eventIdNum;
                } else { 
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

        this.activeElements.forEach(oldEl => {
            if (!newActiveElements.has(oldEl)) {
                this._removeElement(oldEl);
            }
        });
        this.activeElements = newActiveElements; 
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
        if(this._currentlyClickedPanel === el) {
            this._currentlyClickedPanel = null;
            this._removeClickAwayListener(); 
        }
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
                 data.targetX = centralX + requiredDist; data.targetY = centralY;
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
            this.isRunning = false;
            if (this.animationFrameId) { 
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
        }
    }

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
        }
        this._ensureExpandedContentDiv(panel);
    }

   _ensureExpandedContentDiv(panel) {
        const containerClass = 'orbit-element-expanded-content'; let expandedDiv = panel.querySelector(`.${containerClass}`);
        if (!expandedDiv) {
            expandedDiv = document.createElement('div'); expandedDiv.className = containerClass; expandedDiv.classList.add('glassy');
            const event = panel._eventData || {}; const initialStatus = event.current_user_rsvp_status;
            let statusClass = 'status-unknown'; let statusText = 'RSVP?';
            if (initialStatus === 'attending') { statusClass = 'status-attending'; statusText = 'Attending'; }
            else if (initialStatus === 'maybe') { statusClass = 'status-maybe'; statusText = 'Maybe'; }
            else if (initialStatus === 'declined') { statusClass = 'status-declined'; statusText = 'Declined'; }
            else if (initialStatus === null) { statusClass = 'status-cleared'; statusText = 'Cleared'; } 
            let formattedDate = "Date Placeholder";
            if (event.date) {
                try {
                    const dateObj = event.date instanceof Date ? event.date : new Date(event.date);
                    if (!isNaN(dateObj.getTime())) {
                        formattedDate = dateObj.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
                    }
                } catch (e) { /* ignore */ }
            }
            const eventData = { title: event.title || "Event Title Placeholder", date: formattedDate, location: event.location || "Location Placeholder", statusClass: statusClass, statusText: statusText, logoUrl: event.image_url || null, details: event.description || "No extra details available.", cost: event.cost_display || null, id: event.id || '' };
            expandedDiv.innerHTML = `
            <div class="expanded-grid-container-v2">
              <div class="grid-item event-header"><div class="event-logo-wrapper"><img src="${eventData.logoUrl}" alt="Event Logo" class="event-logo-img"></div><div class="event-title-wrapper content-box"><div class="title-scroll">${eventData.title}</div></div></div>
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
                    } else console.warn(`[OrbitLayoutDOM ${this.instanceId}] 'More Info' button clicked, but event ID or panel._eventData missing.`);
                };
                moreInfoButton.addEventListener('click', buttonClickListener); moreInfoButton._clickListener = buttonClickListener; 
            }
        }
        if (expandedDiv.style.display !== 'none') expandedDiv.style.display = 'none';
        expandedDiv.classList.remove('visible');
        return expandedDiv;
    }

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
            }
        }
    }

    _setupHoverInteraction(panel) {
        const listenerFlag = '_orbitHoverListenersAttached_v15';
        if (panel[listenerFlag]) return;
        const handlePointerEnter = () => {
            const data = this.elementDataStore.get(panel);
            if (!data || data.isClicked || data.isHovered) return;
            data.isHovered = true; data.targetScale = data.config.hoverScale;
            this._startAnimationLoop();
        };
        const handlePointerLeave = () => {
            const data = this.elementDataStore.get(panel); if (!data) return;
            if (data.isHovered) {
                data.isHovered = false;
                if (!data.isClicked) { data.targetScale = 1; this._startAnimationLoop(); }
            }
        };
        panel.addEventListener('pointerenter', handlePointerEnter); panel.addEventListener('pointerleave', handlePointerLeave);
        panel[listenerFlag] = { enter: handlePointerEnter, leave: handlePointerLeave };
        if (!panel._orbitCleanups) panel._orbitCleanups = new Map();
        panel._orbitCleanups.set(this, () => { 
            panel.removeEventListener('pointerenter', handlePointerEnter); 
            panel.removeEventListener('pointerleave', handlePointerLeave); 
            delete panel[listenerFlag]; 
        });
    }

    _addClickAwayListener() {
        if (this._boundHandleClickAway) this._removeClickAwayListener();
        this._boundHandleClickAway = this._handleClickAway.bind(this); 
        document.documentElement.addEventListener('click', this._boundHandleClickAway, true); 
    }

    _removeClickAwayListener() {
        if (this._boundHandleClickAway) {
            document.documentElement.removeEventListener('click', this._boundHandleClickAway, true);
            this._boundHandleClickAway = null;
        }
    }

    _handleClickAway(event) {
        if (!this._currentlyClickedPanel || this._currentlyClickedPanel.contains(event.target)) return;
        const panelToUnclick = this._currentlyClickedPanel; 
        const data = this.elementDataStore.get(panelToUnclick);
        if (data) {
            Promise.resolve().then(() => this._unclickPanel(panelToUnclick, data, true))
            .catch(err => console.error(`[OrbitLayoutDOM ${this.instanceId}] Error in _handleClickAway's _unclickPanel promise:`, err));
        } else {
            this._removeClickAwayListener(); 
            this._currentlyClickedPanel = null; window.draggingAllowed = true;
        }
    }

    async _setupClickInteraction(panel) {
        const clickListenerFlag = '_orbitClickListenersAttached_v18_propFix'; 
        if (panel[clickListenerFlag]) return;

        const handleClick = async (event) => {
            event.stopPropagation(); 
            if (event.target.closest('.more-info button.info-button')) return;

            const data = this.elementDataStore.get(panel);
            if (!data) { console.error(`[OrbitLayoutDOM ${this.instanceId}] handleClick: No data for panel ${panel.id}.`); return; }
            if (!window.draggingAllowed && !data.isClicked) return;

            if (data.isClicked) {
                await this._unclickPanel(panel, data, true);
            } else {
                if (this._currentlyClickedPanel && this._currentlyClickedPanel !== panel) {
                    const otherData = this.elementDataStore.get(this._currentlyClickedPanel);
                    if (otherData) await this._unclickPanel(this._currentlyClickedPanel, otherData, true);
                }
                data.preClickViewportState = getTransformState(); // Returns {panX, panY, scale}
                // console.log(`[OrbitLayoutDOM ${this.instanceId}] SAVED preClickState for ${panel.id}: panX=${typeof data.preClickViewportState.panX}, panY=${typeof data.preClickViewportState.panY}, scale=${typeof data.preClickViewportState.scale}`); 
                data.targetScale = data.config.clickScale; data.targetX = data.initialX; data.targetY = data.initialY;
                data.isClicked = true; data.isHovered = false; 
                this._currentlyClickedPanel = panel; window.draggingAllowed = false; 
                this._addClickAwayListener(); this._startAnimationLoop(); 

                const getDynamicTargetRect = () => {
                    if (this._currentlyClickedPanel !== panel || !this.elementDataStore.has(panel)) return null;
                    const d = this.elementDataStore.get(panel); if (!d.isClicked) return null; 
                    const w = d.initialWidth*d.targetScale; const h = d.initialHeight*d.targetScale;
                    return {x:d.targetX-w/2, y:d.targetY-h/2, width:w, height:h};
                };
                const iW = data.initialWidth*data.config.clickScale; const iH = data.initialHeight*data.config.clickScale;
                await smoothZoomToRect({x:data.initialX-iW/2, y:data.initialY-iH/2, width:iW, height:iH}, 
                    data.config.clickToFillPadding, data.config.zoomDuration, getDynamicTargetRect);
            }
            this._startAnimationLoop(); 
        };

        panel.addEventListener('click', handleClick);
        panel[clickListenerFlag] = handleClick;
        if (!panel._orbitCleanups) panel._orbitCleanups = new Map();
        panel._orbitCleanups.set(this, () => { panel.removeEventListener('click', handleClick); delete panel[clickListenerFlag]; });
    }

    async _unclickPanel(panel, data, animateViewport = true) {
        if (!panel || !data) {
            if (this._currentlyClickedPanel === panel && panel) { 
                this._removeClickAwayListener(); this._currentlyClickedPanel = null; window.draggingAllowed = true;
            } return false;
        }
        const wasActive = (this._currentlyClickedPanel === panel);
        data.isClicked = false; 
        if (wasActive) { this._currentlyClickedPanel = null; this._removeClickAwayListener(); }
        window.draggingAllowed = true; 
        data.targetScale = 1; data.targetX = data.initialX; data.targetY = data.initialY;
        
        const duration = animateViewport ? data.config.zoomDuration : 0;
        if (data.preClickViewportState && 
            typeof data.preClickViewportState.panX === 'number' &&
            typeof data.preClickViewportState.panY === 'number' &&
            typeof data.preClickViewportState.scale === 'number') {
            const stateToRestore = {
                x: data.preClickViewportState.panX, y: data.preClickViewportState.panY, s: data.preClickViewportState.scale
            };
            // console.log(`[OLM] TYPEOF stateToRestore for smoothSet: x=${typeof stateToRestore.x}, y=${typeof stateToRestore.y}, s=${typeof stateToRestore.s}`);
            try { await smoothSetTransformState(stateToRestore, duration); } 
            catch (error) { console.error(`[OLM] Error restoring viewport:`, error); }
            data.preClickViewportState = null; 
        } else {
            if (data.preClickViewportState) { /* console.warn(`[OLM] Invalid preClickState for ${panel.id}:`, data.preClickViewportState); */ }
            if (animateViewport && wasActive) { await smoothSetTransformState({ x: 0, y: 0, s: 1.0 }, duration); }
            if (data.preClickViewportState) data.preClickViewportState = null;
        }
        this._startAnimationLoop(); 
        return true;
    }

    _handleRsvpUpdate(event) { 
        const { eventId, newStatus } = event.detail;
        const numericEventId = typeof eventId === 'number' ? eventId : parseInt(String(eventId).split('-').pop(), 10);
        if (isNaN(numericEventId) ) { console.warn(`[OLM] Invalid eventId in rsvpUpdated:`, event.detail); return; }
        for (const p of this.activeElements) {
            const d = this.elementDataStore.get(p);
            if (d && d.eventId === numericEventId) {
                const expDiv = p.querySelector('.orbit-element-expanded-content');
                const statC = expDiv ? expDiv.querySelector('.event-status') : null;
                const statP = statC ? statC.querySelector('.status-pill') : null;
                if (statC && statP) {
                    let sC='status-unknown'; let sT='RSVP?';
                    if(newStatus==='attending'){sC='status-attending';sT='Attending';}
                    else if(newStatus==='maybe'){sC='status-maybe';sT='Maybe';}
                    else if(newStatus==='declined'){sC='status-declined';sT='Declined';}
                    else if(newStatus===null){sC='status-cleared';sT='Cleared';}
                    statC.className=`grid-item event-status ${sC}`;statP.textContent=sT;
                    if(p._eventData)p._eventData.current_user_rsvp_status=newStatus;
                } break;
            }
        }
    }

    _cleanupInstance(keepNodeEl = false) { 
        this.isRunning = false;
        if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; }
        this._removeClickAwayListener(); 
        if (this._currentlyClickedPanel) {
            const p = this._currentlyClickedPanel; const d = this.elementDataStore.get(p);
            if (d && d.preClickViewportState && typeof d.preClickViewportState.panX === 'number') {
                smoothSetTransformState({x:d.preClickViewportState.panX, y:d.preClickViewportState.panY, s:d.preClickViewportState.scale},0);
                d.preClickViewportState = null;
            } else { smoothSetTransformState({x:0,y:0,s:1.0},0); }
        }
        this._currentlyClickedPanel = null;
        this.activeElements.forEach(el => {
            const ed = el.querySelector('.orbit-element-expanded-content');
            if(ed && ed.parentElement === el){ const btn=ed.querySelector('.info-button'); if(btn && btn._clickListener){btn.removeEventListener('click',btn._clickListener); delete btn._clickListener;} try{el.removeChild(ed);}catch(e){}}
            const oc = el.querySelector('.orbit-element-original-content'); if(oc){oc.style.display=''; oc.classList.remove('hidden');}
            el.style.cssText=''; el.style.removeProperty('--current-diameter');
            this._removeElement(el); 
        });
        this.activeElements.clear();
        if (!keepNodeEl) { this.nodeEl = null; this.eventEls = []; this.nodeInfo = {}; }
    }

    async unclickActivePanel() { 
        if (!this._currentlyClickedPanel) return false;
        const p = this._currentlyClickedPanel; const d = this.elementDataStore.get(p);
        if (p && d) { await this._unclickPanel(p, d, true); return true; }
        const rS = (d && d.preClickViewportState && typeof d.preClickViewportState.panX === 'number') ? 
            {x:d.preClickViewportState.panX, y:d.preClickViewportState.panY, s:d.preClickViewportState.scale} : {x:0,y:0,s:1.0};
        await smoothSetTransformState(rS, d ? d.config.zoomDuration : defaultConfig.zoomDuration);
        if(d){d.isClicked=false; d.preClickViewportState=null;}
        this._currentlyClickedPanel=null; this._removeClickAwayListener(); window.draggingAllowed=true; this._startAnimationLoop();
        return false;
    }

    updateLayout(newEventEls = null) { 
        this.isRunning = false;
        if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; }
        const newEls = newEventEls === null ? this.eventEls : (Array.isArray(newEventEls) ? [...newEventEls] : (newEventEls instanceof NodeList ? Array.from(newEventEls) : (newEventEls ? [newEventEls] : [])));
        this.eventEls = newEls.filter(el => el instanceof HTMLElement); 
        this.performLayout(); 
    }

    updateConfiguration(newOptions) { 
        if (!this.nodeEl && this.activeElements.size === 0 && this.eventEls.length === 0) { return; }
        const oldCR = this.config.centralRadius; const oldHS = this.config.hoverScale; const oldCS = this.config.clickScale;
        this.config = { ...this.config, ...newOptions };
        if ('centralRadius' in newOptions && this.nodeInfo && oldCR !== this.config.centralRadius && this.nodeEl && document.body.contains(this.nodeEl)) {
            const aR = Math.max(this.nodeEl.offsetWidth, this.nodeEl.offsetHeight)/2;
            this.centralNodeCollisionRadius = Math.max(aR, this.config.centralRadius||0);
            this.config.centralRadius = this.centralNodeCollisionRadius; this.nodeInfo.radius = this.centralNodeCollisionRadius;
        }
        let scaleChanged = ('hoverScale' in newOptions && oldHS !== this.config.hoverScale) || ('clickScale' in newOptions && oldCS !== this.config.clickScale);
        this.activeElements.forEach(el => {
            const d = this.elementDataStore.get(el);
            if (d) { d.config=this.config; d.nodeInfo=this.nodeInfo; if(scaleChanged){if(d.isClicked)d.targetScale=this.config.clickScale;else if(d.isHovered)d.targetScale=this.config.hoverScale;}}
        });
        if (Object.keys(newOptions).some(k => ['animationSpeed','repulsionPadding','repulsionIterations','nudgeFactor','centralRadius','clickToFillPadding','zoomDuration'].includes(k)) || scaleChanged) {
            this._startAnimationLoop();
        }
    }

    destroy() { 
        try { document.removeEventListener('rsvpUpdated', this._boundHandleRsvpUpdate); } 
        catch (e) { console.error(`[OLM] Error removing listener:`, e); }
        this._removeClickAwayListener(); 
        this._cleanupInstance(false);
    }
}
// --- END OF FILE orbitLayoutDOM.js ---