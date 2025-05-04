// --- START OF FILE insightsManager.js ---

// DOM Elements & State
let insightsView = null;
let insightsGridContainer = null;
let insightsGrid = null;
let palette = null;
let paletteHeader = null;
let paletteToggleBtn = null;
let paletteScrollContainer = null;
let emptyMessage = null;
let palettePreviewContainer = null;

// State Variables
let isDragging = false;
let draggedElementClone = null;
let placeholderElement = null;
let sourceElement = null; // Palette item OR the original grid panel being dragged
let originalSourceElement = null; // Explicitly stores the grid panel during grid drag
let sourceIndex = -1;
let currentTargetIndex = -1;
let dragType = null; // 'grid' or 'palette'
let startClientX = 0;
let startClientY = 0;
let offsetX = 0;
let offsetY = 0;
let gridRect = null;
let animationFrameId = null;

// Grid Layout Cache
let gridCellLayout = [];
let gridComputedStyle = null;
let gridGap = 20; // Note: CSS uses margin, so effective gap might differ
let gridColCount = 2;

// Preview State
let previewHideTimeout = null;
const PREVIEW_HIDE_DELAY = 150;
const PREVIEW_GAP_TO_RIGHT = 12;

// Constants
const SCROLL_THRESHOLD = 40;
const SCROLL_SPEED_MULTIPLIER = 0.15;
const VIEWPORT_PADDING = 15;

// --- Helper Functions ---
function generateUniqueId(prefix = 'panel') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function createInsightPanelHTML(analysisType, title, description, placeholderContent) {
    const panelId = generateUniqueId(analysisType);
    const decodedPlaceholder = placeholderContent; // Adjust if placeholderContent contains actual HTML
    return `<div class="insight-panel glassy" data-panel-id="${panelId}" data-analysis-type="${analysisType}">
                <div class="panel-header" draggable="false">
                    <span class="panel-title">${title}</span>
                    <div class="panel-actions">
                        <button class="panel-action-btn share-panel-btn" aria-label="Share Analysis" title="Share"><i class="fas fa-share-alt"></i></button>
                        <button class="panel-action-btn remove-panel-btn" aria-label="Remove Analysis" title="Remove"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                <div class="panel-content">
                    <p>${description}</p>
                    <div class="placeholder-chart">${decodedPlaceholder}</div>
                </div>
            </div>`;
}

function checkGridEmpty() {
    if (!insightsGrid || !emptyMessage) return;
    const hasContent = insightsGrid.querySelector('.insight-panel:not(.dragging-placeholder)');
    emptyMessage.style.display = hasContent ? 'none' : 'block';
}

// --- calculateGridCellLayout: Calculates potential grid slot positions based on rendered elements or estimation ---
function calculateGridCellLayout() {
    if (!insightsGrid || !insightsGridContainer) {
        gridCellLayout = []; // Clear layout
        return;
    }

    gridCellLayout = [];
    gridComputedStyle = window.getComputedStyle(insightsGrid);

    const gapValue = gridComputedStyle.gap; // CSS gap is 0, margins handle spacing
    const gaps = gapValue.split(' ').map(g => parseInt(g) || 0);
    const rowGap = gaps[0]; // Will be 0 based on CSS
    const colGap = gaps[1] !== undefined ? gaps[1] : rowGap; // Will be 0
    // gridGap = colGap; // Not really used if gap is 0

    if (window.innerWidth <= 768) {
        gridColCount = 1;
    } else {
        gridColCount = 2;
    }

    // Get dimensions of a *rendered* panel IF one exists, to calculate slot positions more accurately
    const firstPanel = insightsGrid.querySelector('.insight-panel:not(.dragging-placeholder)');
    let sampleCellWidth = 200; // Fallback
    let sampleCellHeight = 200; // Fallback
    let sampleMargin = 10; // Default from CSS

    if (firstPanel) {
        const panelRect = firstPanel.getBoundingClientRect();
        const panelStyle = window.getComputedStyle(firstPanel);
        sampleCellWidth = panelRect.width; // Includes padding/border if box-sizing is border-box
        sampleCellHeight = panelRect.height;
        sampleMargin = parseInt(panelStyle.marginLeft) || 0; // Use actual margin
    } else {
         // Estimate based on grid width if no panels exist (less accurate)
         const gridWidth = insightsGrid.offsetWidth - parseInt(gridComputedStyle.paddingLeft) - parseInt(gridComputedStyle.paddingRight);
         if (gridWidth > 0 && gridColCount > 0) {
             const estimatedColWidth = gridWidth / gridColCount;
             sampleCellWidth = Math.max(180, estimatedColWidth - 2 * sampleMargin); // Subtract margins, ensure min-width
             sampleCellHeight = sampleCellWidth; // Assume square
         }
    }

    // Calculate slot positions based on the sample size and margin
    const effectiveColGap = 2 * sampleMargin; // Space between columns is left+right margin
    const effectiveRowGap = 2 * sampleMargin; // Space between rows is top+bottom margin

    const visiblePanels = Array.from(insightsGrid.children).filter(el => el.classList.contains('insight-panel') && !el.classList.contains('dragging-placeholder'));
    const potentialSlots = visiblePanels.length + (isDragging ? 1 : 0);
    const estimatedRows = Math.max(1, Math.ceil(potentialSlots / gridColCount)) + 1;

    let currentX = parseInt(gridComputedStyle.paddingLeft) || 0 + sampleMargin; // Start after padding + margin
    let currentY = parseInt(gridComputedStyle.paddingTop) || 0 + sampleMargin;  // Start after padding + margin

    for (let r = 0; r < estimatedRows; r++) {
        currentX = (parseInt(gridComputedStyle.paddingLeft) || 0) + sampleMargin;
        for (let c = 0; c < gridColCount; c++) {
            gridCellLayout.push({
                x: currentX - sampleMargin,
                y: currentY - sampleMargin,
                width: sampleCellWidth + 2 * sampleMargin,
                height: sampleCellHeight + 2 * sampleMargin,
                contentX: currentX,
                contentY: currentY,
                contentWidth: sampleCellWidth,
                contentHeight: sampleCellHeight
            });
            currentX += sampleCellWidth + 2 * sampleMargin;
        }
        currentY += sampleCellHeight + 2 * sampleMargin;
    }
}

// --- findNearestSlotIndex: Finds the closest grid slot to given coordinates ---
function findNearestSlotIndex(pointerX, pointerY) {
    let closestIndex = -1;
    let minDistSq = Infinity;

    if (!gridCellLayout || gridCellLayout.length === 0) {
         console.warn("findNearestSlotIndex called with no grid layout available.");
         calculateGridCellLayout(); // Attempt recalculation
         if (!gridCellLayout || gridCellLayout.length === 0) return -1;
    }

    // Ensure gridComputedStyle is available for padding calculation
    if (!gridComputedStyle) {
        gridComputedStyle = window.getComputedStyle(insightsGrid);
    }
    const gridContentBoxX = pointerX - (parseInt(gridComputedStyle?.paddingLeft) || 0);
    const gridContentBoxY = pointerY - (parseInt(gridComputedStyle?.paddingTop) || 0);

    gridCellLayout.forEach((slot, index) => {
        const slotCenterX = slot.contentX + slot.contentWidth / 2;
        const slotCenterY = slot.contentY + slot.contentHeight / 2;
        const distSq = (gridContentBoxX - slotCenterX) ** 2 + (gridContentBoxY - slotCenterY) ** 2;

        if (distSq < minDistSq) {
            minDistSq = distSq;
            closestIndex = index;
        }
    });

    const maxIndex = insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder)').length;
    // Allow dropping into the next available slot
    return Math.min(closestIndex, maxIndex);
}

// --- Palette Preview Logic ---
function generatePreviewContentHTML(analysisType) {
    switch (analysisType) {
        case 'attendance-trends':
            return `<h3 class="preview-title">Attendance Trends Example</h3><div class="preview-content"><img src="/static/img/placeholder-line-chart.png" alt="Line chart preview"><p>Shows event attendance rate over time. Helps identify popular event types or seasonal changes.</p></div>`;
        case 'active-groups':
            return `<h3 class="preview-title">Active Groups Example</h3><div class="preview-content" style="text-align: left; padding: 0 10px;"><ol style="margin: 5px 0 0 20px; padding: 0;"><li>Event Planners Inc. (31)</li><li>Weekend Warriors (25)</li><li>Downtown Meetups (18)</li><li>Board Game Geeks (12)</li></ol><p style="margin-top: 10px; font-size: 0.85em; color: #ccc;">Ranks groups by the number of upcoming events created recently.</p></div>`;
        case 'rsvp-distribution':
            return `<h3 class="preview-title">RSVP Distribution Example</h3><div class="preview-content"><img src="/static/img/placeholder-pie-chart.png" alt="Pie chart preview" style="max-width: 70%; max-height: 100px;"><p>Analyzes the typical breakdown of 'Going', 'Maybe', and 'Not Going' RSVPs across events.</p></div>`;
        case 'busy-periods':
            return `<h3 class="preview-title">Busy Periods Example</h3><div class="preview-content"><img src="/static/img/placeholder-heatmap.png" alt="Heatmap preview" style="max-height: 120px;"><p>Highlights upcoming dates or days of the week with a high density of scheduled events.</p></div>`;
        default:
            return `<h3 class="preview-title">${analysisType.replace(/-/g, ' ')} Example</h3><div class="preview-content"><p>Preview information not available for this analysis type.</p></div>`;
    }
}

function showPalettePreview(targetPaletteItem) {
    if (!palettePreviewContainer || !targetPaletteItem || isDragging) return;
    if (palette.classList.contains('collapsed') && window.innerWidth > 768) return;

    clearTimeout(previewHideTimeout);
    previewHideTimeout = null;

    const analysisType = targetPaletteItem.dataset.analysisType;
    if (!analysisType) return;

    palettePreviewContainer.innerHTML = generatePreviewContentHTML(analysisType);
    palettePreviewContainer.style.visibility = 'hidden';
    palettePreviewContainer.style.display = 'block';
    palettePreviewContainer.style.transform = 'none'; // Ensure no residual transforms interfere

    const previewRect = palettePreviewContainer.getBoundingClientRect();
    const itemRect = targetPaletteItem.getBoundingClientRect();
    const containerRect = insightsView?.getBoundingClientRect()
        ?? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }; // Fallback to viewport

    let left = itemRect.right + PREVIEW_GAP_TO_RIGHT;
    left = Math.max(containerRect.left + VIEWPORT_PADDING, left); // Clamp left edge
    left = Math.min(left, containerRect.right - previewRect.width - VIEWPORT_PADDING); // Clamp right edge

    let top = itemRect.top + (itemRect.height / 2) - (previewRect.height / 2);
    top = Math.max(containerRect.top + VIEWPORT_PADDING, top); // Clamp top edge
    top = Math.min(top, containerRect.bottom - previewRect.height - VIEWPORT_PADDING); // Clamp bottom edge

    const relLeft = left - containerRect.left;
    const relTop = top - containerRect.top;

    palettePreviewContainer.style.left = `${Math.round(relLeft)}px`;
    palettePreviewContainer.style.top = `${Math.round(relTop)}px`;
    palettePreviewContainer.style.visibility = 'visible';
    palettePreviewContainer.classList.add('visible');
}

function scheduleHidePalettePreview() {
    clearTimeout(previewHideTimeout);
    previewHideTimeout = setTimeout(hidePalettePreview, PREVIEW_HIDE_DELAY);
}

function hidePalettePreview() {
    clearTimeout(previewHideTimeout);
    previewHideTimeout = null;
    if (palettePreviewContainer) {
        palettePreviewContainer.classList.remove('visible');
    }
}

function cancelHidePreview() {
    clearTimeout(previewHideTimeout);
    previewHideTimeout = null;
}

// --- Drag and Drop Logic ---

function onPointerDown(event) {
    if (event.button !== 0 || isDragging) return;
    if (event.target.closest('.panel-action-btn, .add-analysis-btn, .palette-toggle-btn')) {
        return;
    }

    const panelHeader = event.target.closest('.panel-header');
    const paletteItem = event.target.closest('.palette-item');

    if (panelHeader) {
        const panel = panelHeader.closest('.insight-panel:not(.dragging-placeholder)');
        if (panel) {
            initiateDrag(event, panel, 'grid');
        }
    } else if (paletteItem && !palette.classList.contains('collapsed')) {
        initiateDrag(event, paletteItem, 'palette');
    }
}

function initiateDrag(event, element, type) {
    event.preventDefault();
    event.stopPropagation();
    hidePalettePreview();

    isDragging = true;
    dragType = type;
    sourceElement = element;
    startClientX = event.clientX;
    startClientY = event.clientY;

    // --- 1. Calculate Grid Geometry (for slot finding, NOT sizing) ---
    calculateGridCellLayout(); // Ensures layout for findNearestSlotIndex is ready

    // --- 2. Create Placeholder (NO inline size, rely on CSS) ---
    placeholderElement = document.createElement('div');
    // Add BOTH classes: inherits .insight-panel layout, modified by .dragging-placeholder appearance
    placeholderElement.className = 'insight-panel dragging-placeholder';
    // CSS handles size, margin, box-sizing etc via inheritance from .insight-panel

    // --- 3. Handle Source Element & Create Clone ---
    let elementRect;
    if (dragType === 'grid') {
        originalSourceElement = sourceElement;
        elementRect = originalSourceElement.getBoundingClientRect();

        const gridContainerRect = insightsGridContainer.getBoundingClientRect();
        const initialX = (elementRect.left - gridContainerRect.left + insightsGridContainer.scrollLeft) + elementRect.width / 2;
        const initialY = (elementRect.top - gridContainerRect.top + insightsGridContainer.scrollTop) + elementRect.height / 2;
        sourceIndex = findNearestSlotIndex(initialX, initialY);
        currentTargetIndex = sourceIndex;

        originalSourceElement.parentElement.replaceChild(placeholderElement, originalSourceElement);

        draggedElementClone = originalSourceElement.cloneNode(true);
        draggedElementClone.classList.remove('dragging-placeholder');

        offsetX = startClientX - elementRect.left;
        offsetY = startClientY - elementRect.top;

    } else { // dragType === 'palette'
        originalSourceElement = null;
        const analysisType = sourceElement.dataset.analysisType;
        const title = sourceElement.dataset.title;
        const description = sourceElement.dataset.description;
        const placeholderHTML = sourceElement.dataset.placeholderHtml || '<p>Loading...</p>';

        if (!analysisType || !title) {
            console.warn("Palette item missing data attributes.");
            isDragging = false;
            return;
        }

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = createInsightPanelHTML(analysisType, title, description, placeholderHTML).trim();
        draggedElementClone = tempDiv.firstChild;

        sourceIndex = -1;
        currentTargetIndex = -1;

        // Offset for palette drag - Use a fixed pixel offset or small fraction of clone size
        draggedElementClone.style.visibility = 'hidden'; // Temporarily hide for measurement
        draggedElementClone.style.position = 'fixed';
        draggedElementClone.style.top = '-9999px'; // Position offscreen
        document.body.appendChild(draggedElementClone); // Add to DOM to measure
        const cloneRect = draggedElementClone.getBoundingClientRect();
        document.body.removeChild(draggedElementClone); // Remove after measuring
        draggedElementClone.style.visibility = ''; // Reset visibility

        const cloneWidth = cloneRect.width || 200;
        const cloneHeight = cloneRect.height || 200;
        offsetX = cloneWidth * 0.15; // e.g., 15% from left edge
        offsetY = cloneHeight * 0.15; // e.g., 15% from top edge

        elementRect = { left: startClientX - offsetX, top: startClientY - offsetY };
    }

    // --- 4. Style and Position the Clone ---
    draggedElementClone.classList.add('dragging-clone'); // CSS handles scale via --drag-scale
    draggedElementClone.style.position = 'fixed';
    draggedElementClone.style.zIndex = '1000';
    draggedElementClone.style.pointerEvents = 'none';
    // NO inline width/height
    // NO inline transform/scale (CSS handles it via .dragging-clone)

    draggedElementClone.style.left = `${elementRect.left}px`;
    draggedElementClone.style.top = `${elementRect.top}px`;

    document.body.appendChild(draggedElementClone);

    // --- 5. Add Global Event Listeners ---
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp, { once: true });
    document.addEventListener('contextmenu', preventContextMenuDuringDrag, { capture: true });
}

function onPointerMove(event) {
    if (!isDragging || !draggedElementClone) return;

    const currentClientX = event.clientX;
    const currentClientY = event.clientY;

    cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(() => {
        // Update clone position
        draggedElementClone.style.left = `${currentClientX - offsetX}px`;
        draggedElementClone.style.top = `${currentClientY - offsetY}px`;

        gridRect = insightsGridContainer.getBoundingClientRect();
        const pointerXInGrid = currentClientX - gridRect.left + insightsGridContainer.scrollLeft;
        const pointerYInGrid = currentClientY - gridRect.top + insightsGridContainer.scrollTop;

        const isOverGrid = currentClientX >= gridRect.left && currentClientX <= gridRect.right &&
                           currentClientY >= gridRect.top && currentClientY <= gridRect.bottom;

        let nearestIndex = -1;
        if (isOverGrid) {
            nearestIndex = findNearestSlotIndex(pointerXInGrid, pointerYInGrid);
            // Placeholder size is handled by CSS
        }

        // Update placeholder position in the DOM
        if (isOverGrid) {
            const needsMove = nearestIndex !== -1 && nearestIndex !== currentTargetIndex;
            if (!placeholderElement.parentElement || needsMove) {
                insertElementAtIndex(placeholderElement, nearestIndex);
                currentTargetIndex = nearestIndex;
            }
        } else {
            if (placeholderElement.parentElement) {
                placeholderElement.remove();
            }
            currentTargetIndex = -1;
        }

        if (isOverGrid) {
             handleGridScroll(currentClientY, gridRect);
        }
    });
}

function handleGridScroll(clientY, gridRect) {
    const scrollSpeed = 15 * SCROLL_SPEED_MULTIPLIER;
    let scrollDelta = 0;

    if (clientY < gridRect.top + SCROLL_THRESHOLD) {
        const proximityFactor = 1 - Math.max(0, clientY - gridRect.top) / SCROLL_THRESHOLD;
        scrollDelta = -scrollSpeed * (1 + proximityFactor);
    } else if (clientY > gridRect.bottom - SCROLL_THRESHOLD) {
        const proximityFactor = 1 - Math.max(0, gridRect.bottom - clientY) / SCROLL_THRESHOLD;
        scrollDelta = scrollSpeed * (1 + proximityFactor);
    }

    if (scrollDelta !== 0) {
        insightsGridContainer.scrollTop += scrollDelta;
    }
}

function onPointerUp(event) {
    if (!isDragging) return;

    cancelAnimationFrame(animationFrameId);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('contextmenu', preventContextMenuDuringDrag, { capture: true });

    // Instantly remove clone for perceived responsiveness
    if (draggedElementClone) {
        draggedElementClone.remove();
        draggedElementClone = null;
    }

    const droppedInsideGrid = currentTargetIndex !== -1 && placeholderElement && placeholderElement.parentElement;

    if (droppedInsideGrid) {
        if (dragType === 'palette') {
            const analysisType = sourceElement.dataset.analysisType;
            const title = sourceElement.dataset.title;
            const description = sourceElement.dataset.description;
            const placeholderHTML = sourceElement.dataset.placeholderHtml || '';
            const panelHTML = createInsightPanelHTML(analysisType, title, description, placeholderHTML);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = panelHTML.trim();
            const newPanel = tempDiv.firstChild;

            placeholderElement.replaceWith(newPanel);
            makePanelDraggable(newPanel);

        } else if (dragType === 'grid' && originalSourceElement) {
            originalSourceElement.style = ''; // Reset any inline styles
            placeholderElement.replaceWith(originalSourceElement);
        }
        placeholderElement = null;

    } else {
        // Dropped Outside Grid
        if (dragType === 'grid' && originalSourceElement) {
             originalSourceElement.style = ''; // Reset styles first
             insertElementAtIndex(originalSourceElement, sourceIndex); // sourceIndex is its original slot
             placeholderElement?.remove(); // Remove placeholder if it exists
        } else if (dragType === 'palette') {
             placeholderElement?.remove(); // Just cleanup the placeholder
        }
        placeholderElement = null;
    }

    // Reset State
    isDragging = false;
    sourceElement = null;
    originalSourceElement = null;
    sourceIndex = -1;
    dragType = null;
    currentTargetIndex = -1;

    // Final Grid Updates after DOM settles
    setTimeout(() => {
        calculateGridCellLayout(); // Recalculate layout based on final state
        checkGridEmpty();       // Update empty message
    }, 50); // Small delay
}

function preventContextMenuDuringDrag(event) {
    if (isDragging) {
        event.preventDefault();
        event.stopPropagation();
    }
}

// Helper to insert element at a specific index within the grid
function insertElementAtIndex(elementToInsert, targetIndex) {
    const currentPanels = Array.from(insightsGrid.children)
        .filter(el => el.classList.contains('insight-panel') && el !== elementToInsert); // Exclude self

    // Clamp target index to valid range [0, currentPanels.length]
    targetIndex = Math.max(0, Math.min(targetIndex, currentPanels.length));

    // Simplified check: If the target location's adjacent element isn't correct, move it.
    let needsInsert = true; // Assume it needs moving unless proven otherwise
    if (targetIndex < currentPanels.length) {
         if(currentPanels[targetIndex].previousElementSibling === elementToInsert) {
             needsInsert = false;
         }
    } else if (currentPanels.length > 0) {
         if(currentPanels[currentPanels.length - 1] === elementToInsert) {
            needsInsert = false;
         } else if(insightsGrid.lastElementChild === elementToInsert || (emptyMessage && insightsGrid.lastElementChild === emptyMessage && emptyMessage.previousElementSibling === elementToInsert)) {
            needsInsert = false;
         }
    } else {
        if (insightsGrid.firstElementChild === elementToInsert) {
            needsInsert = false;
        }
    }
    // Special case: If element isn't in the grid at all, it always needs inserting.
    if (!elementToInsert.parentElement || elementToInsert.parentElement !== insightsGrid) {
        needsInsert = true;
    }

    if (needsInsert) {
        if (targetIndex < currentPanels.length) {
            insightsGrid.insertBefore(elementToInsert, currentPanels[targetIndex]);
        } else {
            if (emptyMessage && insightsGrid.lastElementChild === emptyMessage) {
                insightsGrid.insertBefore(elementToInsert, emptyMessage);
            } else {
                insightsGrid.appendChild(elementToInsert);
            }
        }
    }
 }

// --- Panel Actions & Palette Toggle ---

function handlePanelAction(event) {
    const removeButton = event.target.closest('.remove-panel-btn');
    const shareButton = event.target.closest('.share-panel-btn');
    const panel = event.target.closest('.insight-panel');

    if (!panel || panel.classList.contains('dragging-placeholder')) return;

    if (removeButton) {
        panel.remove();
        setTimeout(() => {
            calculateGridCellLayout();
            checkGridEmpty();
        }, 50);
    } else if (shareButton) {
        alert(`Sharing panel '${panel.querySelector('.panel-title')?.textContent || 'N/A'}' (not implemented)`);
    }
}

function makePanelDraggable(panelElement) {
    const header = panelElement.querySelector('.panel-header');
    if (header) {
        header.removeEventListener('pointerdown', onPointerDown);
        header.addEventListener('pointerdown', onPointerDown);
    } else {
        console.warn("Panel header not found for making draggable:", panelElement);
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function handlePaletteToggle(forceState = null) {
    if (!palette || !paletteToggleBtn) return;
    hidePalettePreview();

    const currentCollapsedState = palette.classList.contains('collapsed');
    let shouldBeCollapsed;

    if (forceState !== null) {
        shouldBeCollapsed = (forceState === 'close');
    } else {
        shouldBeCollapsed = !currentCollapsedState;
    }

    if (shouldBeCollapsed === currentCollapsedState) return;

    if (shouldBeCollapsed) {
        palette.classList.add('collapsed');
        insightsView?.classList.add('palette-collapsed');
    } else {
        palette.classList.remove('collapsed');
        insightsView?.classList.remove('palette-collapsed');
    }

    updateToggleButtonIcon();
    setTimeout(calculateGridCellLayout, 350); // Recalculate after animation
}

function updateToggleButtonIcon() {
    if (!palette || !paletteToggleBtn) return;
    const isMobile = window.innerWidth <= 768;
    const isCollapsed = palette.classList.contains('collapsed');
    const icon = paletteToggleBtn.querySelector('i');

    if (icon) {
        if (isMobile) {
            icon.className = `fas ${isCollapsed ? 'fa-chevron-up' : 'fa-chevron-down'}`;
        } else {
            icon.className = `fas ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`;
        }
    }

    const label = isCollapsed ? 'Expand Palette' : 'Collapse Palette';
    paletteToggleBtn.setAttribute('aria-label', label);
    paletteToggleBtn.setAttribute('title', label);
}

// --- Initialization and Event Setup ---

function setupEventListeners() {
    if (!insightsView) {
        console.error("Insights view not found, cannot setup listeners.");
        return;
    }

    // Palette Header & Toggle
    if (paletteHeader && paletteToggleBtn) {
         paletteHeader.addEventListener('click', (event) => {
            if (paletteToggleBtn.contains(event.target) || event.target.closest('.add-analysis-btn')) return;
            handlePaletteToggle();
        });
        paletteToggleBtn.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent header click handler
            handlePaletteToggle();
        });
    } else {
        console.warn("Palette header or toggle button not found.");
    }

    // Palette Items (for drag start and preview)
    if (paletteScrollContainer) {
        paletteScrollContainer.addEventListener('pointerdown', onPointerDown);
        paletteScrollContainer.addEventListener('mouseover', (event) => {
             if (isDragging || (palette.classList.contains('collapsed') && window.innerWidth > 768)) return;
             const targetItem = event.target.closest('.palette-item');
             if (targetItem) {
                 showPalettePreview(targetItem);
             }
        });
        paletteScrollContainer.addEventListener('mouseout', (event) => {
            if (isDragging) return;
            const targetItem = event.target.closest('.palette-item');
            const relatedTarget = event.relatedTarget;
            if (targetItem && !targetItem.contains(relatedTarget) && !palettePreviewContainer?.contains(relatedTarget)) {
                scheduleHidePalettePreview();
            }
        });
        paletteScrollContainer.addEventListener('click', (event) => {
             const addButton = event.target.closest('.add-analysis-btn');
             if (addButton && !isDragging) {
                const item = addButton.closest('.palette-item');
                if (item) {
                    const analysisType = item.dataset.analysisType;
                    const title = item.dataset.title;
                    const description = item.dataset.description;
                    const placeholderHTML = item.dataset.placeholderHtml || '';
                    const panelHTML = createInsightPanelHTML(analysisType, title, description, placeholderHTML);
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = panelHTML.trim();
                    const newPanel = tempDiv.firstChild;

                     if (emptyMessage && emptyMessage.parentElement === insightsGrid) {
                         insightsGrid.insertBefore(newPanel, emptyMessage);
                     } else {
                         insightsGrid.appendChild(newPanel);
                     }

                     makePanelDraggable(newPanel);

                     setTimeout(() => {
                         calculateGridCellLayout();
                         checkGridEmpty();
                         insightsGridContainer.scrollTop = insightsGridContainer.scrollHeight; // Scroll new item into view
                     }, 50);
                 }
             }
        });
    } else {
        console.warn("Palette scroll container not found.");
    }

    // Palette Preview Container (cancel hide on hover)
    if (palettePreviewContainer) {
        palettePreviewContainer.addEventListener('mouseleave', (event) => {
             const relatedTarget = event.relatedTarget;
             if (!relatedTarget || !relatedTarget.closest('.palette-item')) {
                 scheduleHidePalettePreview();
             }
        });
         palettePreviewContainer.addEventListener('mouseenter', cancelHidePreview);
    }

    // Insights Grid (for panel actions)
    if (insightsGrid) {
        insightsGrid.addEventListener('click', handlePanelAction);
        // Make existing panels draggable on initialization
        insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder)').forEach(makePanelDraggable);
    } else {
        console.warn("Insights grid not found.");
    }

    // Window Resize
    window.addEventListener('resize', debounce(() => {
        hidePalettePreview();
        calculateGridCellLayout();
        updateToggleButtonIcon();
    }, 250));

    // Grid Container Scroll (hide preview)
    insightsGridContainer?.addEventListener('scroll', debounce(() => {
        if (!isDragging) {
            hidePalettePreview();
        }
    }, 100));

    console.log("Insights event listeners attached (V23 Formatted).");
}

// --- initInsightsManager: Initialize the module ---
export function initInsightsManager() {
    console.log("Initializing Insights Manager (V23 Formatted)...");

    // Cache DOM elements
    insightsView = document.getElementById('insights-view');
    insightsGridContainer = document.getElementById('insights-grid-container');
    insightsGrid = document.getElementById('insights-grid');
    palette = document.getElementById('analysis-palette');
    paletteHeader = document.getElementById('palette-header');
    paletteToggleBtn = document.getElementById('palette-toggle-btn');
    paletteScrollContainer = document.getElementById('palette-scroll-container');
    emptyMessage = insightsGrid?.querySelector('.insights-empty-message'); // Try to find existing
    palettePreviewContainer = document.getElementById('palette-preview-container');

    // Validate critical elements
    if (!insightsView || !insightsGridContainer || !insightsGrid || !palette || !paletteHeader || !paletteToggleBtn || !paletteScrollContainer || !palettePreviewContainer) {
        console.error("Insights view or critical child elements not found. Aborting initialization.");
        console.log({ insightsView, insightsGridContainer, insightsGrid, palette, paletteHeader, paletteToggleBtn, paletteScrollContainer, palettePreviewContainer });
        return;
    }

    // Fallback for empty message if not found
    if (insightsGrid && !emptyMessage) {
        console.warn("Insights empty message element not found, creating fallback.");
        emptyMessage = document.createElement('p');
        emptyMessage.className = 'insights-empty-message';
        emptyMessage.id = 'insights-empty-message';
        emptyMessage.textContent = 'Add analyses from the palette or drag existing ones to rearrange.';
        emptyMessage.style.display = 'none'; // Start hidden
        insightsGrid.prepend(emptyMessage); // Add to the beginning
    }

    // Initial state setup
    calculateGridCellLayout(); // Calculate initial layout
    checkGridEmpty();       // Set initial empty message visibility
    setupEventListeners();      // Attach all event listeners

    // Reset any lingering drag state from potential hot reloads/errors
    isDragging = false;
    draggedElementClone?.remove();
    document.querySelectorAll('.dragging-placeholder').forEach(el => el.remove()); // Clean up stray placeholders
    document.removeEventListener('pointermove', onPointerMove); // Ensure listeners are removed
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('contextmenu', preventContextMenuDuringDrag, { capture: true });
    hidePalettePreview(); // Ensure preview is hidden initially

    // Set initial palette collapsed state based on class
    const isInitiallyCollapsed = palette.classList.contains('collapsed');
    if (isInitiallyCollapsed) {
        insightsView?.classList.add('palette-collapsed');
    } else {
        insightsView?.classList.remove('palette-collapsed');
    }
    updateToggleButtonIcon(); // Set correct icon/label

    console.log("Insights Manager Initialized Successfully (V23 Formatted).");
}

// --- END OF FILE insightsManager.js ---