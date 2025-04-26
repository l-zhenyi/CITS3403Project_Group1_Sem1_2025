// --- START OF FILE orbitLayoutDOM_v5_StrictClass.js ---
// Aiming for strict functional equivalence with orbitLayoutDOM v_FINAL3 within a class structure.

console.log("[OrbitLayoutDOM Strict Class v5] Module Loaded.");

// --- Configuration (Defaults from v_FINAL3) ---
const defaultConfig = {
  N: 12, centralRadius: 60, ringPadding: 10, ringGap: 8,
  circleSpacing: 4, minCircleRadius: 2, hoverScale: 3.0,
  animationSpeed: 0.1, repulsionPadding: 4, repulsionIterations: 5,
  nudgeFactor: 0.02, 
};

// --- Helper Functions (Remain outside the class) ---
function lerp(a, b, t) { return a * (1 - t) + b * t; }
function distance(x1, y1, x2, y2) {
  const dx = x2 - x1; const dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy);
}

export class OrbitLayoutManager {
  // Per-instance state
  nodeEl = null;
  eventEls = [];
  config = {};
  elementDataStore = new WeakMap(); // Specific to this instance
  activeElements = new Set();      // Specific to this instance
  animationFrameId = null;         // Specific to this instance
  nodeCenterX = 0;                 // Based on offsetLeft (like v_FINAL3)
  nodeCenterY = 0;                 // Based on offsetTop (like v_FINAL3)
  centralNodeCollisionRadius = 0;
  nodeInfo = {};
  isRunning = false;

  // --- Constructor ---
  constructor(nodeEl, eventEls, options = {}) {
    console.log(`%c[OrbitLayoutDOM v5] Creating for node:`, "color: darkcyan; font-weight: bold;", nodeEl);
    if (!nodeEl) { throw new Error("[OrbitLayoutDOM v5] ERROR: Central node element not provided."); }

    this.nodeEl = nodeEl;
    this.eventEls = Array.isArray(eventEls) ? [...eventEls] : (eventEls instanceof NodeList ? Array.from(eventEls) : (eventEls ? [eventEls] : []));

    this.config = { ...defaultConfig, ...options }; // Use v_FINAL3 defaults
    console.log("[OrbitLayoutDOM v5] Using Configuration:", this.config);

    this.performLayout();
    this.isRunning = true;
  }

  // --- Core Layout Method ---
  performLayout() {
    console.log(`%c[OrbitLayoutDOM v5] Performing layout for:`, "color: darkcyan;", this.nodeEl);
    if (!this.nodeEl) { console.error("[OrbitLayoutDOM v5] Layout aborted: Central node missing."); return; }

    this._cleanupInstance(/* keepNodeEl */ true);

    const container = this.nodeEl.offsetParent;
    if (!container) {
      console.error(`%c[OrbitLayoutDOM v5] FATAL ERROR: nodeEl.offsetParent is null for node:`, "color: red; font-weight: bold;", this.nodeEl);
      this.isRunning = false; return;
    }
    // Basic validation (like v_FINAL3)
    const containerStyle = window.getComputedStyle(container);
    if (containerStyle.position === 'static') {
      console.warn(`%c[OrbitLayoutDOM v5] WARNING: offsetParent <${container.tagName}> has 'position: static'.`, "color: orange; font-weight: bold;", `Set 'position: relative;' or 'absolute'.`);
    }
    const nodeTransform = window.getComputedStyle(this.nodeEl).transform;
    if (nodeTransform && nodeTransform !== 'none') {
      console.warn(`%c[OrbitLayoutDOM v5] POTENTIAL ISSUE: Node element has CSS transform:`, "color: orange;", nodeTransform);
      console.warn("Layout center based on pre-transform offsetLeft/offsetTop.");
    }


    // ***** CENTER & RADIUS CALCULATION (accurate geometry) *****
    const nodeLayoutX = this.nodeEl.offsetLeft;
    const nodeLayoutY = this.nodeEl.offsetTop;
    this.nodeCenterX = nodeLayoutX + this.nodeEl.offsetWidth / 2;
    this.nodeCenterY = nodeLayoutY + this.nodeEl.offsetHeight / 2;

    // Compute an effective collision radius: at least half of the node’s bounding box,
    // but allow config.centralRadius to enlarge it if the caller wishes.
    const autoRadius = Math.max(this.nodeEl.offsetWidth, this.nodeEl.offsetHeight) / 2;
    this.centralNodeCollisionRadius = Math.max(autoRadius, this.config.centralRadius || 0);

    // Keep config and geometry in sync so later layout maths use the same value
    this.config.centralRadius = this.centralNodeCollisionRadius;

    this.nodeInfo = {
      centerX: this.nodeCenterX,
      centerY: this.nodeCenterY,
      radius: this.centralNodeCollisionRadius
    };
    // ***** END CENTER & RADIUS CALCULATION *****


    // === Core Layout Logic (Identical structure to v_FINAL3) ===
    const N = this.config.N;
    const totalEvents = this.eventEls.length;
    if (totalEvents === 0 || N <= 0) { this.isRunning = false; return; }

    const numRings = Math.ceil(totalEvents / N);
    let eventIndex = 0;
    let lastOrbitRadius_Layout = this.config.centralRadius;
    let lastCircleRadius = 0;
    const angleOffset = -Math.PI / 2;

    for (let ringIdx = 0; ringIdx < numRings; ringIdx++) {
      const ringIndex = ringIdx + 1;
      const isLastRing = (ringIndex === numRings);
      const numCirclesActualThisRing = isLastRing ? (totalEvents - eventIndex) : N;
      if (numCirclesActualThisRing <= 0) break;

      let estimatedOrbitRadius, finalOrbitRadius, circleRadius;
      // Calculate Geometry (Identical to v_FINAL3)
      if (ringIndex === 1) { estimatedOrbitRadius = lastOrbitRadius_Layout + this.config.ringPadding + this.config.minCircleRadius; }
      else { estimatedOrbitRadius = lastOrbitRadius_Layout + lastCircleRadius + this.config.ringGap + this.config.minCircleRadius; }
      const circumference = 2 * Math.PI * estimatedOrbitRadius;
      const idealRadiusBasedOnN = (circumference / N - this.config.circleSpacing) / 2;
      circleRadius = Math.max(this.config.minCircleRadius, idealRadiusBasedOnN);
      if (ringIndex === 1) { finalOrbitRadius = lastOrbitRadius_Layout + this.config.ringPadding + circleRadius; }
      else { finalOrbitRadius = lastOrbitRadius_Layout + lastCircleRadius + this.config.ringGap + circleRadius; }

      const angleStep = (2 * Math.PI) / N;
      const startAngle = (ringIndex % 2 === 0) ? angleOffset + angleStep / 2 : angleOffset;

      for (let i = 0; i < numCirclesActualThisRing; i++) {
        if (eventIndex >= totalEvents) break;
        const el = this.eventEls[eventIndex];
        if (!el) { eventIndex++; continue; }
        this.activeElements.add(el);

        const angle = startAngle + i * angleStep;
        const diameter = circleRadius * 2;
        // Calculate positions relative to the (potentially incorrect top-left) nodeCenterX/Y
        const initialTargetCenterX = this.nodeCenterX + finalOrbitRadius * Math.cos(angle);
        const initialTargetCenterY = this.nodeCenterY + finalOrbitRadius * Math.sin(angle);
        const initialTargetLeft = initialTargetCenterX - circleRadius;
        const initialTargetTop = initialTargetCenterY - circleRadius;

        // Apply initial styles (Identical to v_FINAL3)
        el.style.position = 'absolute';
        el.style.width = `${diameter}px`; el.style.height = `${diameter}px`;
        el.style.borderRadius = '50%';
        el.style.left = `${initialTargetLeft.toFixed(3)}px`;
        el.style.top = `${initialTargetTop.toFixed(3)}px`;
        el.style.transformOrigin = 'center center';
        el.style.transform = 'translate(0px, 0px) scale(1)';
        el.style.willChange = 'transform'; el.style.transition = 'none';

        // Store state (Identical to v_FINAL3, references instance config/nodeInfo)
        const data = {
          initialX: initialTargetCenterX, initialY: initialTargetCenterY, initialRadius: circleRadius,
          currentX: initialTargetCenterX, currentY: initialTargetCenterY, currentScale: 1,
          targetX: initialTargetCenterX, targetY: initialTargetCenterY, targetScale: 1,
          isHovered: false, originalZIndex: el.style.zIndex || '1', config: this.config,
          nodeInfo: this.nodeInfo
        };
        this.elementDataStore.set(el, data);
        this._setupHoverInteraction(el);

        eventIndex++;
      }
      lastOrbitRadius_Layout = finalOrbitRadius;
      lastCircleRadius = circleRadius;
      if (eventIndex >= totalEvents) break;
    }

    console.log(`%c[OrbitLayoutDOM v5] Static layout finished for ${this.activeElements.size} elements.`, "color: darkcyan;");
    this.isRunning = true;
    this._startAnimationLoop();
  }

  // --- Collision Resolution (Logic strictly from v_FINAL3) ---
  _resolveDomCollisions(elementsData) {
    const iterations = this.config.repulsionIterations;
    const padding = this.config.repulsionPadding;
    if (iterations === 0 || elementsData.length === 0) return;

    // Central node info comes from this.nodeInfo (based on top-left offset)
    const centralX = this.nodeInfo.centerX;
    const centralY = this.nodeInfo.centerY;
    const centralRadius = this.nodeInfo.radius;

    for (let iter = 0; iter < iterations; iter++) {
      // 1. Element vs Element Collision (Identical push logic to v_FINAL3)
      for (let i = 0; i < elementsData.length; i++) {
        for (let j = i + 1; j < elementsData.length; j++) {
          const aData = elementsData[i]; const bData = elementsData[j];
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

              // Apply push logic exactly as in v_FINAL3
              if (!aData.isHovered) {
                aData.targetX -= pushX * pushFactorA;
                aData.targetY -= pushY * pushFactorA;
              }
              if (!bData.isHovered) {
                bData.targetX += pushX * pushFactorB;
                bData.targetY += pushY * pushFactorB;
              }
              if (pushFactorA === 0.5 && pushFactorB === 0.5) { // Both non-hovered
                aData.targetX -= pushX * pushFactorA;
                aData.targetY -= pushY * pushFactorA;
                bData.targetX += pushX * pushFactorB;
                bData.targetY += pushY * pushFactorB;
              }
            }
          }
        }
      } // End Element vs Element

      // 2. Element vs Central Node Collision (Identical logic to v_FINAL3 - checks all elements)
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
      } // End Element vs Center
    } // End iterations

    // ***** NUDGE LOGIC (Identical to v_FINAL3) *****
    const nudgeFactor = this.config.nudgeFactor; // Default 0.02 from config
    elementsData.forEach(data => {
      if (!data.isHovered) {
        data.targetX = lerp(data.targetX, data.initialX, nudgeFactor);
        data.targetY = lerp(data.targetY, data.initialY, nudgeFactor);
      }
      // Hovered elements do NOT get nudged back - they stay where collision pushed them
    });
    // ***** END NUDGE LOGIC *****

    // --- Ensure elements are fully outside the central node after all iterations ---
    elementsData.forEach(data => {
      const elRadius = data.initialRadius * data.targetScale;
      const dist = distance(centralX, centralY, data.targetX, data.targetY);
      const requiredDist = centralRadius + elRadius + padding;
      if (dist < requiredDist) {
        const angle = Math.atan2(data.targetY - centralY, data.targetX - centralX) || 0;
        data.targetX = centralX + Math.cos(angle) * requiredDist;
        data.targetY = centralY + Math.sin(angle) * requiredDist;
      }
    });
  }

  // --- Animation Loop (Structure identical to v_FINAL3, using instance state) ---
  _animationStep = () => {
    if (!this.isRunning) return;
    let needsAnotherFrame = false;
    const elementsData = [];

    // Collect data ONLY from elements managed by THIS instance
    for (const el of this.activeElements) {
      const data = this.elementDataStore.get(el);
      if (data) { elementsData.push(data); }
    }
    // Post-iteration cleanup (safer)
    const elementsToRemove = [];
    this.activeElements.forEach(el => {
      if (!this.elementDataStore.has(el)) { elementsToRemove.push(el); }
    });
    elementsToRemove.forEach(el => this.activeElements.delete(el));

    if (elementsData.length === 0) { this.animationFrameId = null; return; }

    // Resolve Collisions for this instance's elements
    this._resolveDomCollisions(elementsData); // Uses v_FINAL3 logic

    // Interpolate and Apply Styles (Identical logic to v_FINAL3)
    for (const data of elementsData) {
      const el = [...this.activeElements].find(element => this.elementDataStore.get(element) === data);
      if (!el) continue;
      const speed = data.config.animationSpeed;
      data.currentX = lerp(data.currentX, data.targetX, speed);
      data.currentY = lerp(data.currentY, data.targetY, speed);
      data.currentScale = lerp(data.currentScale, data.targetScale, speed);

      const dx = data.targetX - data.currentX;
      const dy = data.targetY - data.currentY;
      const ds = data.targetScale - data.currentScale;
      if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1 || Math.abs(ds) > 0.01) {
        needsAnotherFrame = true;
      } else {
        data.currentX = data.targetX; data.currentY = data.targetY; data.currentScale = data.targetScale;
      }

      const deltaTranslateX = data.currentX - data.initialX;
      const deltaTranslateY = data.currentY - data.initialY;
      el.style.transform = `translate(${deltaTranslateX.toFixed(3)}px, ${deltaTranslateY.toFixed(3)}px) scale(${data.currentScale.toFixed(3)})`;
      el.style.zIndex = data.isHovered ? '10' : data.originalZIndex;
    }

    // Request next frame or stop for THIS instance
    if (needsAnotherFrame && this.activeElements.size > 0 && this.isRunning) {
      this.animationFrameId = requestAnimationFrame(this._animationStep);
    } else {
      this.animationFrameId = null;
    }
  }

  // --- Start Animation Loop (Method) ---
  _startAnimationLoop() {
    if (!this.animationFrameId && this.activeElements.size > 0 && this.isRunning) {
      this.animationFrameId = requestAnimationFrame(this._animationStep);
    }
  }

  // --- Setup Hover Interaction (Logic strictly from v_FINAL3) ---
  _setupHoverInteraction(panel) {
    const listenerFlag = '_orbitHoverListenersAttached_v5';
    if (panel[listenerFlag]) return;

    const handlePointerEnter = (event) => {
      if (!this.isRunning) return;
      const data = this.elementDataStore.get(panel);
      if (!data || data.isHovered) { return; }

      data.isHovered = true;
      data.targetScale = data.config.hoverScale;
      // Keep target X/Y at initial unless pushed by central collision (v_FINAL3 logic)
      data.targetX = data.initialX;
      data.targetY = data.initialY;

      // Reset targets only for OTHER non-hovered elements (v_FINAL3 logic)
      this.activeElements.forEach(el => {
        if (el !== panel) {
          const otherData = this.elementDataStore.get(el);
          if (otherData) {
            otherData.targetX = otherData.initialX;
            otherData.targetY = otherData.initialY;
            otherData.targetScale = 1;
            otherData.isHovered = false;
          }
        }
      });
      this._startAnimationLoop();
    };

    const handlePointerLeave = (event) => {
      if (!this.isRunning) return;
      const data = this.elementDataStore.get(panel);
      if (!data || !data.isHovered) { return; }

      data.isHovered = false;
      // Reset ALL elements including self
      this.activeElements.forEach(el => {
        const otherData = this.elementDataStore.get(el);
        if (otherData) {
          otherData.targetX = otherData.initialX;
          otherData.targetY = otherData.initialY;
          otherData.targetScale = 1;
          otherData.isHovered = false;
        }
      });
      this._startAnimationLoop();
    };

    panel.addEventListener('pointerenter', handlePointerEnter);
    panel.addEventListener('pointerleave', handlePointerLeave);
    panel[listenerFlag] = { enter: handlePointerEnter, leave: handlePointerLeave };

    // Cleanup mechanism (consistent with v4)
    if (!panel._orbitCleanups) { panel._orbitCleanups = new Map(); }
    panel._orbitCleanups.set(this, () => {
      panel.removeEventListener('pointerenter', handlePointerEnter);
      panel.removeEventListener('pointerleave', handlePointerLeave);
      delete panel[listenerFlag];
      panel._orbitCleanups.delete(this);
      if (panel._orbitCleanups.size === 0) { delete panel._orbitCleanups; }
    });
  }

  // --- Internal Cleanup Helper (Identical to v4) ---
  _cleanupInstance(keepNodeEl = false) {
    console.log(`%c[OrbitLayoutDOM v5] Cleaning up instance for:`, "color: red;", this.nodeEl);
    this.isRunning = false;
    if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; }
    this.activeElements.forEach(el => {
      if (el._orbitCleanups && el._orbitCleanups.has(this)) {
        el._orbitCleanups.get(this)();
      }
      this.elementDataStore.delete(el);
    });
    this.activeElements.clear();
    if (!keepNodeEl) { this.nodeEl = null; this.eventEls = []; }
  }


  // --- Public Methods (Structure identical to v4) ---

  /** Recalculates layout, useful after node moves or element list changes */
  updateLayout(newEventEls = null) {
    console.log(`%c[OrbitLayoutDOM v5] updateLayout called for:`, "color: blueviolet;", this.nodeEl);
    if (newEventEls !== null) {
      const oldElements = new Set(this.activeElements);
      const newElements = new Set(Array.isArray(newEventEls) ? newEventEls : Array.from(newEventEls));
      oldElements.forEach(oldEl => {
        if (!newElements.has(oldEl)) {
          if (oldEl._orbitCleanups && oldEl._orbitCleanups.has(this)) { oldEl._orbitCleanups.get(this)(); }
          this.elementDataStore.delete(oldEl);
        }
      });
      this.eventEls = Array.isArray(newEventEls) ? [...newEventEls] : Array.from(newEventEls);
    }
    // Re-run the core layout logic (which uses the offsetLeft/Top center calc)
    this.performLayout();
  }

  /** Updates configuration options dynamically */
  updateConfiguration(newOptions) {
    console.log("[OrbitLayoutDOM v5] Updating configuration:", newOptions);
    const oldCentralRadius = this.config.centralRadius;
    this.config = { ...this.config, ...newOptions };

    if ('centralRadius' in newOptions && this.nodeInfo && oldCentralRadius !== this.config.centralRadius) {
      // Update radius based on offsetLeft/Top center
      this.nodeInfo.radius = this.config.centralRadius;
    }

    this.activeElements.forEach(el => {
      const data = this.elementDataStore.get(el);
      if (data) {
        data.config = this.config; // Update config reference
        data.nodeInfo = this.nodeInfo; // Update nodeInfo reference
      }
    });

    // Restart loop if interaction params changed
    if ('animationSpeed' in newOptions || 'repulsionPadding' in newOptions || 'repulsionIterations' in newOptions || 'hoverScale' in newOptions || 'nudgeFactor' in newOptions || 'centralRadius' in newOptions) {
      this._startAnimationLoop();
    }
  }

  /** Call this to completely stop and remove the layout */
  destroy() {
    this._cleanupInstance(/* keepNodeEl */ false);
    console.log(`%c[OrbitLayoutDOM v5] Destroyed instance for node:`, "color: red; font-weight: bold;", this.nodeEl);
  }
}

// --- END OF FILE orbitLayoutDOM_v5_StrictClass.js ---