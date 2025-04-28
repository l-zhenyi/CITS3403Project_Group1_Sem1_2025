// --- START OF FILE viewportManager.js ---

console.log("Viewport Manager Module Loaded.");

// --- Module Scope Variables ---
let panX = 0;
let panY = 0;
let scale = 1.0;
let viewportElement = null;
let containerElement = null;

// Configuration
const minScale = 0.3;
const maxScale = 2.5;
const zoomFactor = 0.1;

// Internal drag state
let isDragging = false;
let startX = 0;
let startY = 0;
let lastMoveTime = 0;
const throttleInterval = 16; // approx 60fps

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
    } else {
        // console.warn("applyTransform called before containerElement is set.");
    }
}

// --- Event Handlers ---
function handleMouseDown(e) {
    // Use window.draggingAllowed defined in main scope (or pass as config if preferred)
    if (e.button !== 0 || !window.draggingAllowed) return;

    // Prevent starting drag on interactive elements within the container
    if (e.target !== viewportElement && e.target !== containerElement) {
        if (!e.target.closest('.event-panel') && !e.target.closest('.event-node')) {
             // Allow drag if directly on viewport or container background
        } else {
             return; // Prevent drag start on panels/nodes
        }
    }


    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    if (viewportElement) {
        viewportElement.style.cursor = 'grabbing';
        viewportElement.classList.add('dragging');
    }
     // Add listener to window for mousemove/mouseup to catch events outside viewport
     window.addEventListener('mousemove', handleMouseMove);
     window.addEventListener('mouseup', handleMouseUp);
}

function handleMouseMove(e) {
    if (!isDragging || !window.draggingAllowed) return;

    const now = performance.now();
    if (now - lastMoveTime < throttleInterval) {
        // console.log("Throttled mousemove"); // DEBUG
        return; // Throttle rendering
    }
    lastMoveTime = now;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    panX += dx;
    panY += dy;
    startX = e.clientX; // Update start position for next delta calculation
    startY = e.clientY;

    // console.log(`Panning: dx=${dx.toFixed(1)}, dy=${dy.toFixed(1)} -> panX=${panX.toFixed(1)}, panY=${panY.toFixed(1)}`); // DEBUG
    applyTransform();
}

function handleMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    if (viewportElement) {
        viewportElement.style.cursor = 'grab';
        viewportElement.classList.remove('dragging');
    }
    // Remove global listeners
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
}

function handleWheel(e) {
    if (!window.draggingAllowed || !viewportElement) return;
    e.preventDefault();

    const rect = viewportElement.getBoundingClientRect();
    const mouseX = e.clientX - rect.left; // Mouse position relative to viewport top-left
    const mouseY = e.clientY - rect.top;

    // Calculate mouse position in the "world" space (before zoom/pan)
    const worldX = (mouseX - panX) / scale;
    const worldY = (mouseY - panY) / scale;

    const delta = e.deltaY < 0 ? 1 : -1; // Wheel up = positive delta (zoom in), wheel down = negative
    const zoomAmount = 1 + delta * zoomFactor;
    const newScale = Math.min(maxScale, Math.max(minScale, scale * zoomAmount));

    if (newScale !== scale) {
        // Calculate new pan values to keep the point under the mouse stationary
        panX = mouseX - worldX * newScale;
        panY = mouseY - worldY * newScale;
        scale = newScale;
        // console.log(`Zooming: scale=${scale.toFixed(2)} -> panX=${panX.toFixed(1)}, panY=${panY.toFixed(1)}`); // DEBUG
        applyTransform();
    }
}


// --- Exported Functions ---

/**
 * Initializes the viewport interaction listeners.
 * @param {HTMLElement} vpElement The viewport element (e.g., #collage-viewport).
 * @param {HTMLElement} ctElement The container element to transform (e.g., #event-panels-container).
 */
export function setupViewportInteractions(vpElement, ctElement) {
    if (!vpElement || !ctElement) {
        console.error("ViewportManager setup failed: Viewport or Container element missing.");
        return;
    }

    viewportElement = vpElement;
    containerElement = ctElement;

    console.log("Setting up viewport interactions for:", viewportElement, containerElement);

    // Ensure initial state is applied
    containerElement.style.transformOrigin = '0 0';
    applyTransform(); // Apply initial panX=0, panY=0, scale=1

    // Remove existing listeners first (optional, but good practice if re-initializing)
    viewportElement.removeEventListener('mousedown', handleMouseDown);
    viewportElement.removeEventListener('wheel', handleWheel);
    // Global mousemove/mouseup are added/removed dynamically

    // Add new listeners
    viewportElement.addEventListener('mousedown', handleMouseDown);
    viewportElement.addEventListener('wheel', handleWheel, { passive: false }); // Need passive:false for preventDefault

    console.log("Viewport interaction listeners attached.");
}

/**
 * Gets the current transformation state.
 * @returns {{panX: number, panY: number, scale: number}}
 */
export function getTransformState() {
    return { panX, panY, scale };
}

/**
 * Sets the transformation state and applies it.
 * @param {{x: number, y: number, s: number}} newState The new state object.
 */
export function setTransformState({ x, y, s }) {
    console.log(`Setting transform state: x=${x}, y=${y}, s=${s}`);
    panX = typeof x === 'number' ? x : panX;
    panY = typeof y === 'number' ? y : panY;
    scale = typeof s === 'number' ? Math.min(maxScale, Math.max(minScale, s)) : scale; // Clamp scale
    applyTransform();
}

// --- END OF FILE viewportManager.js ---