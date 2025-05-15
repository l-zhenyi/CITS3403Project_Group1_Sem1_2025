// --- START OF FILE viewportManager.js ---

console.log("Viewport Manager Module Loaded (v7 - Property Name Fix propagation).");

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
const throttleInterval = 16; 

// Smooth animation state
let smoothAnimationId = null;
let currentAnimatingFunctionType = null; 
let currentDynamicTargetCallback = null;


// --- Helper Functions ---
/** Linear interpolation */
function lerp(a, b, t) {
    return a * (1 - t) + b * t;
}

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

function cancelCurrentAnimation(reason = "generic cancellation") {
    if (smoothAnimationId) {
        cancelAnimationFrame(smoothAnimationId);
        smoothAnimationId = null;
    }
    if (currentDynamicTargetCallback) {
        currentDynamicTargetCallback = null;
    }
    currentAnimatingFunctionType = null;
}


// --- Event Handlers ---
function handleMouseDown(e) {
    cancelCurrentAnimation("mousedown");
    if (e.button !== 0 || !window.draggingAllowed) return;
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
    cancelCurrentAnimation("wheel scroll");
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
}

export function getTransformState() {
    return { panX, panY, scale }; // panX, panY, scale are numbers
}

export function setTransformState({ x, y, s }) { // Expects lowercase x,y,s (numbers)
    cancelCurrentAnimation("setTransformState (direct)");
    panX = typeof x === 'number' ? x : panX;
    panY = typeof y === 'number' ? y : panY;
    scale = typeof s === 'number' ? Math.min(maxScale, Math.max(minScale, s)) : scale;
    applyTransform();
}

export async function smoothSetTransformState(newState, duration = 300) { // Expects newState with x,y,s (numbers)
    if (!newState || typeof newState.x !== 'number' || typeof newState.y !== 'number' || typeof newState.s !== 'number') {
        console.error(`[ViewportManager] smoothSetTransformState: Received invalid newState. State:`, newState);
        return Promise.reject(new Error("Invalid newState provided to smoothSetTransformState"));
    }

    cancelCurrentAnimation("smoothSetTransformState (new call)"); 
    currentAnimatingFunctionType = 'setTransformState';

    const startPanX_const = panX; 
    const startPanY_const = panY;
    const startScale_const = scale;

    const targetPanX_const = newState.x; 
    const targetPanY_const = newState.y;
    const targetScale_const = Math.min(maxScale, Math.max(minScale, newState.s)); 

    if (duration === 0) { 
        panX = targetPanX_const; panY = targetPanY_const; scale = targetScale_const;
        applyTransform();
        currentAnimatingFunctionType = null;
        return Promise.resolve();
    }
    
    const isCloseX = Math.abs(startPanX_const - targetPanX_const) < 0.01;
    const isCloseY = Math.abs(startPanY_const - targetPanY_const) < 0.01;
    const isCloseS = Math.abs(startScale_const - targetScale_const) < 0.0001;

    if (isCloseX && isCloseY && isCloseS) {
        currentAnimatingFunctionType = null;
        return Promise.resolve();
    }
    
    return new Promise((resolve) => { 
        let startTime = null;
        const animationInstanceId = Math.random().toString(36).substring(2, 9); 
        function animate(timestamp) {
            if (smoothAnimationId !== animationInstanceId) { resolve(); return; }
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = progress * (2 - progress); 
            panX = startPanX_const + (targetPanX_const - startPanX_const) * easedProgress;
            panY = startPanY_const + (targetPanY_const - startPanY_const) * easedProgress;
            scale = startScale_const + (targetScale_const - startScale_const) * easedProgress;
            applyTransform();
            if (progress < 1) { requestAnimationFrame(animate); } 
            else {
                smoothAnimationId = null; 
                panX = targetPanX_const; panY = targetPanY_const; scale = targetScale_const;
                applyTransform();
                currentAnimatingFunctionType = null;
                resolve();
            }
        }
        smoothAnimationId = animationInstanceId; 
        requestAnimationFrame(animate);
    });
}

export async function smoothZoomToRect(initialTargetRectInContainer, desiredViewportPadding, duration = 300, getTargetRectCallback = null) {
    cancelCurrentAnimation("smoothZoomToRect (new call)");
    currentAnimatingFunctionType = 'zoomToRect';
    currentDynamicTargetCallback = getTargetRectCallback; 

    const vpWidth = viewportElement.clientWidth;
    const vpHeight = viewportElement.clientHeight;
    const startPanX_const = panX;
    const startPanY_const = panY;
    const startScale_const = scale;

    let currentTargetPanXState, currentTargetPanYState, currentTargetScaleState; 

    function calculateViewportTargets(targetRect) {
        if (!targetRect || typeof targetRect.width !== 'number' || typeof targetRect.height !== 'number' || 
            typeof targetRect.x !== 'number' || typeof targetRect.y !== 'number') {
            return { 
                panX: typeof currentTargetPanXState ==='number' ? currentTargetPanXState : startPanX_const,
                panY: typeof currentTargetPanYState ==='number' ? currentTargetPanYState : startPanY_const,
                scale: typeof currentTargetScaleState ==='number' ? currentTargetScaleState : startScale_const
            };
        }
        const effWidth = targetRect.width <= 0 ? 0.001 : targetRect.width;
        const effHeight = targetRect.height <= 0 ? 0.001 : targetRect.height;
        let newCalculatedScale = Math.min((vpWidth-2*desiredViewportPadding)/effWidth, (vpHeight-2*desiredViewportPadding)/effHeight);
        newCalculatedScale = Math.min(maxScale, Math.max(minScale, newCalculatedScale));
        const targetElCenterX = targetRect.x + targetRect.width/2; 
        const targetElCenterY = targetRect.y + targetRect.height/2;
        return { 
            panX: (vpWidth/2) - (targetElCenterX*newCalculatedScale), 
            panY: (vpHeight/2) - (targetElCenterY*newCalculatedScale), 
            scale: newCalculatedScale 
        };
    }
    
    const initialTargets = calculateViewportTargets(initialTargetRectInContainer);
    currentTargetPanXState = initialTargets.panX;
    currentTargetPanYState = initialTargets.panY;
    currentTargetScaleState = initialTargets.scale;

    const alreadyThere =
        !currentDynamicTargetCallback &&
        Math.abs(startPanX_const - currentTargetPanXState) < 0.01 &&
        Math.abs(startPanY_const - currentTargetPanYState) < 0.01 &&
        Math.abs(startScale_const - currentTargetScaleState) < 0.0001;

    if (alreadyThere && (startPanX_const !== 0 || startPanY_const !== 0 || startScale_const !== 1.0)) {
        currentAnimatingFunctionType = null;
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        let startTime = null;
        const animationInstanceId = Math.random().toString(36).substring(2, 9);
        function animate(timestamp) {
            if (smoothAnimationId !== animationInstanceId) { resolve(); return; }
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            let progress = Math.min(elapsed / duration, 1);
            let dynamicTargetStillValid = true; 
            if (currentDynamicTargetCallback) { 
                const latestTargetRect = currentDynamicTargetCallback(); 
                if (latestTargetRect) { 
                    const newTargets = calculateViewportTargets(latestTargetRect);
                    const LERP = 0.15; 
                    currentTargetPanXState = lerp(currentTargetPanXState, newTargets.panX, LERP);
                    currentTargetPanYState = lerp(currentTargetPanYState, newTargets.panY, LERP);
                    currentTargetScaleState = lerp(currentTargetScaleState, newTargets.scale, LERP);
                } else { dynamicTargetStillValid = false; }
            } else { dynamicTargetStillValid = false; }

            const easedProgress = progress * (2 - progress);
            panX = startPanX_const + (currentTargetPanXState - startPanX_const) * easedProgress;
            panY = startPanY_const + (currentTargetPanYState - startPanY_const) * easedProgress;
            scale = startScale_const + (currentTargetScaleState - startScale_const) * easedProgress;
            applyTransform();

            if (progress < 1) { requestAnimationFrame(animate); } 
            else { 
                smoothAnimationId = null; 
                if (getTargetRectCallback && getTargetRectCallback === currentDynamicTargetCallback) { currentDynamicTargetCallback = null; }
                if (dynamicTargetStillValid) { 
                     panX = currentTargetPanXState; panY = currentTargetPanYState; scale = currentTargetScaleState;
                     applyTransform();
                }
                currentAnimatingFunctionType = null; resolve();
            }
        }
        smoothAnimationId = animationInstanceId; requestAnimationFrame(animate);
    });
}
// --- END OF FILE viewportManager.js ---