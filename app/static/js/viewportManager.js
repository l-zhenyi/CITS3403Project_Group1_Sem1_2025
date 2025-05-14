// --- START OF FILE viewportManager.js ---

console.log("Viewport Manager Module Loaded (v3 with dynamic target zoom).");

// --- Module Scope Variables ---
let panX = 0;
let panY = 0;
let scale = 1.0;
let viewportElement = null;
let containerElement = null;

// Configuration
const minScale = 0.3;
const maxScale = 5.0;
const zoomFactor = 0.1;

// Internal drag state
let isDragging = false;
let startX = 0;
let startY = 0;
let lastMoveTime = 0;
const throttleInterval = 16; // approx 60fps

// Smooth animation state
let smoothAnimationId = null;
let previousTransformStateBeforeSmoothZoom = null;
// Store for the dynamic target callback
let currentDynamicTargetCallback = null;


// --- Debounce Utility ---
export function debounce(func, wait, immediate) {
    var timeout;
    return function () {
        var context = this, args = arguments;
        var later = function () {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        var callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
};

// --- Internal Transform Function ---
function applyTransform() {
    if (containerElement) {
        containerElement.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    }
}

// --- Event Handlers ---
function handleMouseDown(e) {
    if (smoothAnimationId) { // Cancel smooth animation if user starts dragging
        cancelAnimationFrame(smoothAnimationId);
        smoothAnimationId = null;
        currentDynamicTargetCallback = null; // Clear callback
    }
    if (e.button !== 0 || !window.draggingAllowed) return;
    // Allow dragging only if target is viewport or container directly,
    // OR if it's not an interactive element like a panel or node.
    if (e.target !== viewportElement && e.target !== containerElement) {
        if (e.target.closest('.event-panel') || e.target.closest('.event-node') || e.target.closest('button') || e.target.closest('a')) {
             return;
        }
    }
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    if (viewportElement) {
        viewportElement.style.cursor = 'grabbing';
        viewportElement.classList.add('dragging');
    }
     window.addEventListener('mousemove', handleMouseMove);
     window.addEventListener('mouseup', handleMouseUp);
}

function handleMouseMove(e) {
    if (!isDragging || !window.draggingAllowed) return;
    const now = performance.now();
    if (now - lastMoveTime < throttleInterval) return;
    lastMoveTime = now;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    panX += dx;
    panY += dy;
    startX = e.clientX;
    startY = e.clientY;
    applyTransform();
}

function handleMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    if (viewportElement) {
        viewportElement.style.cursor = 'grab';
        viewportElement.classList.remove('dragging');
    }
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
}

function handleWheel(e) {
    if (smoothAnimationId) { // Cancel smooth animation if user starts scrolling
        cancelAnimationFrame(smoothAnimationId);
        smoothAnimationId = null;
        currentDynamicTargetCallback = null; // Clear callback
    }
    if (!window.draggingAllowed || !viewportElement) return;
    e.preventDefault();
    const rect = viewportElement.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const worldX = (mouseX - panX) / scale;
    const worldY = (mouseY - panY) / scale;
    const delta = e.deltaY < 0 ? 1 : -1;
    const zoomAmount = 1 + delta * zoomFactor;
    const newScale = Math.min(maxScale, Math.max(minScale, scale * zoomAmount));
    if (newScale !== scale) {
        panX = mouseX - worldX * newScale;
        panY = mouseY - worldY * newScale;
        scale = newScale;
        applyTransform();
    }
}


// --- Exported Functions ---

export function setupViewportInteractions(vpElement, ctElement) {
    if (!vpElement || !ctElement) {
        console.error("ViewportManager setup failed: Viewport or Container element missing.");
        return;
    }
    viewportElement = vpElement;
    containerElement = ctElement;
    containerElement.style.transformOrigin = '0 0';
    applyTransform();
    viewportElement.removeEventListener('mousedown', handleMouseDown);
    viewportElement.removeEventListener('wheel', handleWheel);
    viewportElement.addEventListener('mousedown', handleMouseDown);
    viewportElement.addEventListener('wheel', handleWheel, { passive: false });
    console.log("Viewport interaction listeners attached.");
}

export function getTransformState() {
    return { panX, panY, scale };
}

export function setTransformState({ x, y, s }) {
    if (smoothAnimationId) { // Cancel any ongoing smooth animation
        cancelAnimationFrame(smoothAnimationId);
        smoothAnimationId = null;
        currentDynamicTargetCallback = null; // Clear callback
    }
    panX = typeof x === 'number' ? x : panX;
    panY = typeof y === 'number' ? y : panY;
    scale = typeof s === 'number' ? Math.min(maxScale, Math.max(minScale, s)) : scale;
    applyTransform();
}

export async function smoothSetTransformState(newState, duration = 300) {
    return new Promise((resolve) => {
        if (smoothAnimationId) {
            cancelAnimationFrame(smoothAnimationId);
            // currentDynamicTargetCallback should not be active here,
            // as this function is for direct state setting, not dynamic rect zooming.
            // If it was, it's an issue with how smoothZoomToRect clears it or how this is called.
        }

        const startPanX = panX;
        const startPanY = panY;
        const startScale = scale;

        const targetPanX = typeof newState.x === 'number' ? newState.x : startPanX;
        const targetPanY = typeof newState.y === 'number' ? newState.y : startPanY;
        const targetScale = typeof newState.s === 'number' ? Math.min(maxScale, Math.max(minScale, newState.s)) : startScale;

        if (duration === 0) { // Handle immediate set
            panX = targetPanX;
            panY = targetPanY;
            scale = targetScale;
            applyTransform();
            resolve();
            return;
        }
        
        if (Math.abs(startPanX - targetPanX) < 0.1 &&
            Math.abs(startPanY - targetPanY) < 0.1 &&
            Math.abs(startScale - targetScale) < 0.001) {
            resolve();
            return;
        }

        let startTime = null;

        function animate(timestamp) {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = progress * (2 - progress); // Ease-out quadratic

            panX = startPanX + (targetPanX - startPanX) * easedProgress;
            panY = startPanY + (targetPanY - startPanY) * easedProgress;
            scale = startScale + (targetScale - startScale) * easedProgress;

            applyTransform();

            if (progress < 1) {
                smoothAnimationId = requestAnimationFrame(animate);
            } else {
                smoothAnimationId = null;
                panX = targetPanX; // Ensure final values are exact
                panY = targetPanY;
                scale = targetScale;
                applyTransform();
                resolve();
            }
        }
        smoothAnimationId = requestAnimationFrame(animate);
    });
}

/**
 * Smoothly zooms and pans the viewport to fit a target rectangle.
 * @param {Object} initialTargetRectInContainer - The initial rectangle to target {x, y, width, height}.
 * @param {number} desiredViewportPadding - Padding around the target rectangle in the viewport.
 * @param {number} duration - Duration of the zoom animation.
 * @param {function|null} getTargetRectCallback - Optional. If provided, this function will be called
 *                                                on each animation frame to get the current target rectangle.
 *                                                It should return an object like {x, y, width, height} or null if target is gone.
 */
export async function smoothZoomToRect(initialTargetRectInContainer, desiredViewportPadding, duration = 300, getTargetRectCallback = null) {
    if (!viewportElement || !containerElement) {
        console.warn("smoothZoomToRect: viewport or container not set.");
        return Promise.resolve(); // Return a resolved promise
    }

    if (smoothAnimationId) {
        cancelAnimationFrame(smoothAnimationId); // Cancel any ongoing smooth animation
    }
    currentDynamicTargetCallback = getTargetRectCallback; // Store the callback

    // Save previous state only if we're not already in a dynamic zoom or if it's a new one
    if (!previousTransformStateBeforeSmoothZoom || !getTargetRectCallback) {
        previousTransformStateBeforeSmoothZoom = { x: panX, y: panY, s: scale };
    }

    const vpWidth = viewportElement.clientWidth;
    const vpHeight = viewportElement.clientHeight;

    const startPanX = panX;
    const startPanY = panY;
    const startScale = scale;

    let startTime = null;

    let currentTargetPanXState, currentTargetPanYState, currentTargetScaleState;

    function calculateViewportTargets(targetRect) {
        if (!targetRect || typeof targetRect.width !== 'number' || targetRect.width <= 0 || 
            typeof targetRect.height !== 'number' || targetRect.height <= 0 ||
            typeof targetRect.x !== 'number' || typeof targetRect.y !== 'number') {
            console.warn("smoothZoomToRect: Invalid targetRect received during calculation.", targetRect);
            // Fallback: aim for the last known good target or initial viewport state if no good target yet
            return {
                panX: typeof currentTargetPanXState === 'number' ? currentTargetPanXState : startPanX,
                panY: typeof currentTargetPanYState === 'number' ? currentTargetPanYState : startPanY,
                scale: typeof currentTargetScaleState === 'number' ? currentTargetScaleState : startScale
            };
        }

        const targetVisualWidth = vpWidth - 2 * desiredViewportPadding;
        const targetVisualHeight = vpHeight - 2 * desiredViewportPadding;

        let newCalculatedScale;
        const scaleX = targetVisualWidth / targetRect.width;
        const scaleY = targetVisualHeight / targetRect.height;
        newCalculatedScale = Math.min(scaleX, scaleY);
        newCalculatedScale = Math.min(maxScale, Math.max(minScale, newCalculatedScale));

        const targetElCenterX = targetRect.x + targetRect.width / 2;
        const targetElCenterY = targetRect.y + targetRect.height / 2;

        const newCalculatedPanX = (vpWidth / 2) - (targetElCenterX * newCalculatedScale);
        const newCalculatedPanY = (vpHeight / 2) - (targetElCenterY * newCalculatedScale);

        return { panX: newCalculatedPanX, panY: newCalculatedPanY, scale: newCalculatedScale };
    }

    const initialTargets = calculateViewportTargets(initialTargetRectInContainer);
    currentTargetPanXState = initialTargets.panX;
    currentTargetPanYState = initialTargets.panY;
    currentTargetScaleState = initialTargets.scale;

    if (!getTargetRectCallback &&
        Math.abs(startPanX - currentTargetPanXState) < 0.1 &&
        Math.abs(startPanY - currentTargetPanYState) < 0.1 &&
        Math.abs(startScale - currentTargetScaleState) < 0.001) {
        currentDynamicTargetCallback = null;
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        function animate(timestamp) {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            let progress = Math.min(elapsed / duration, 1);

            if (currentDynamicTargetCallback) { // Check if callback is still active
                const latestTargetRect = currentDynamicTargetCallback();
                if (latestTargetRect) { // If we have a new target
                    const newViewportTargets = calculateViewportTargets(latestTargetRect);
                    // Smoothly update the viewport's animation targets
                    const LERP_FACTOR = 0.15; // How quickly the viewport adapts its own target
                    currentTargetPanXState = currentTargetPanXState * (1 - LERP_FACTOR) + newViewportTargets.panX * LERP_FACTOR;
                    currentTargetPanYState = currentTargetPanYState * (1 - LERP_FACTOR) + newViewportTargets.panY * LERP_FACTOR;
                    currentTargetScaleState = currentTargetScaleState * (1 - LERP_FACTOR) + newViewportTargets.scale * LERP_FACTOR;
                } else { // Dynamic target became null (e.g., panel unclicked)
                    console.log("[ViewportManager] Dynamic target became null, ending zoom early.");
                    progress = 1; // Force animation to end
                }
            }

            const easedProgress = progress * (2 - progress);

            panX = startPanX + (currentTargetPanXState - startPanX) * easedProgress;
            panY = startPanY + (currentTargetPanYState - startPanY) * easedProgress;
            scale = startScale + (currentTargetScaleState - startScale) * easedProgress;

            applyTransform();

            if (progress < 1) {
                smoothAnimationId = requestAnimationFrame(animate);
            } else {
                smoothAnimationId = null;
                // Only clear if this animation instance was responsible for setting it
                if (getTargetRectCallback === currentDynamicTargetCallback) {
                    currentDynamicTargetCallback = null;
                }
                
                // Snap to final target if it wasn't a dynamic "null target" exit
                if (!(getTargetRectCallback && currentDynamicTargetCallback === null && currentDynamicTargetCallback() === null) ){
                     panX = currentTargetPanXState;
                     panY = currentTargetPanYState;
                     scale = currentTargetScaleState;
                     applyTransform();
                }
                resolve();
            }
        }
        smoothAnimationId = requestAnimationFrame(animate);
    });
}


export async function smoothResetZoom(duration = 300) {
    if (smoothAnimationId) {
        cancelAnimationFrame(smoothAnimationId);
        smoothAnimationId = null;
        currentDynamicTargetCallback = null;
    }
    const targetState = previousTransformStateBeforeSmoothZoom || { x: 0, y: 0, s: 1.0 };
    await smoothSetTransformState(targetState, duration);
    previousTransformStateBeforeSmoothZoom = null;
}

// --- END OF FILE viewportManager.js ---