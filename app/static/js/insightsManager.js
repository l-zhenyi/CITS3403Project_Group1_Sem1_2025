// --- START OF FILE insightsManager.js ---

// --- DOM Elements ---
let insightsView = null;
let insightsGridContainer = null; // The scrollable container
let insightsGrid = null;        // The grid element where panels are placed
let palette = null;
let paletteHeader = null; // Specifically target the header for toggle clicks
let paletteToggleBtn = null;
let paletteScrollContainer = null;
let emptyMessage = null;
let palettePreviewContainer = null; // Single preview container for palette item hover
let dropPreviewSlot = null;     // Dynamically created/managed preview slot in the grid

// --- Drag State ---
let isDragging = false;         // Is any drag operation active?
let draggedElement = null;      // The visual element being dragged (fixed position)
let sourceElement = null;       // The original panel or palette item that initiated the drag
let dragType = null;            // 'grid' or 'palette'
let startClientX, startClientY; // Raw pointer position at drag start
let offsetX, offsetY;           // Pointer offset within the dragged element
let gridRect = null;            // Bounding rect of the grid container (for bounds checks)
let gridCellLayout = [];        // Array storing calculated { x, y, width, height } for each grid cell position
let targetSlotIndex = -1;       // Index in gridCellLayout where the preview is shown / potential drop
let animationFrameId = null;

// --- Palette Preview State ---
let previewHideTimeout = null;
const PREVIEW_HIDE_DELAY = 150; // ms delay before hiding preview

// --- Constants ---
const DRAG_SCALE = 0.95; // Scale factor for dragged item
const GRID_COLS = 2;     // Define number of columns

// --- Helper Functions ---

/**
 * Generates a unique ID for panels.
 * @param {string} prefix
 * @returns {string}
 */
function generateUniqueId(prefix = 'panel') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Creates the HTML string for a new insight panel.
 * @param {string} analysisType - The type identifier (e.g., 'attendance-trends').
 * @param {string} title - The display title for the panel.
 * @param {string} description - Short description for the panel content area.
 * @param {string} placeholderContent - HTML or text for the placeholder chart/data area.
 * @returns {string} - The HTML string for the insight panel.
 */
function createInsightPanelHTML(analysisType, title, description, placeholderContent) {
    const panelId = generateUniqueId(analysisType);
    // Decode HTML entities if necessary (if stored encoded in data-attributes)
    const decodedPlaceholder = placeholderContent.replace(/</g, '<').replace(/>/g, '>');

    return `
        <div class="insight-panel glassy" data-panel-id="${panelId}" data-analysis-type="${analysisType}">
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

/**
 * Checks if the grid is empty and shows/hides the empty message.
 */
function checkGridEmpty() {
    if (!insightsGrid || !emptyMessage) return;
    // Count panels that are not placeholders or the preview slot
    const panelCount = insightsGrid.querySelectorAll('.insight-panel:not(.dragging-source-hidden)').length;
    emptyMessage.style.display = (panelCount === 0 && !getDropPreviewSlot()?.parentElement) ? 'block' : 'none'; // Hide if panels or preview exists
}

/** Calculates the target geometry of all grid slots */
function calculateGridCellLayout() {
    if (!insightsGrid || !insightsGridContainer) return;

    gridCellLayout = []; // Reset
    const gridStyle = window.getComputedStyle(insightsGrid);
    const colCount = GRID_COLS;
    const rowGap = parseInt(gridStyle.gap) || 25; // Use the general gap property
    const colGap = parseInt(gridStyle.gap) || 25; // Use the general gap property
    const gridWidth = insightsGrid.offsetWidth;

    if (!gridWidth || gridWidth <= 0 || colCount <= 0) {
        console.warn("Cannot calculate grid layout: Invalid dimensions or column count.");
        return;
    }

    const cellWidth = (gridWidth - (colCount - 1) * colGap) / colCount;
    let cellHeight = 0;

    // Use aspect-ratio defined on the panel for height calculation
    // Create a temporary element to accurately measure based on CSS
    const tempPanel = document.createElement('div');
    tempPanel.className = 'insight-panel'; // Apply class for aspect-ratio
    tempPanel.style.width = `${cellWidth}px`;
    tempPanel.style.position = 'absolute';
    tempPanel.style.visibility = 'hidden';
    tempPanel.style.pointerEvents = 'none';
    insightsGrid.appendChild(tempPanel); // Add to grid for style context
    cellHeight = tempPanel.offsetHeight;
    insightsGrid.removeChild(tempPanel);


    if (cellHeight <= 0) {
        console.warn("Could not determine valid cell height from aspect ratio. Using fallback.");
        cellHeight = cellWidth / (1 / 0.85); // Fallback aspect ratio calculation
    }

    const currentPanelCount = insightsGrid.querySelectorAll('.insight-panel:not(.dragging-source-hidden)').length;
     // Calculate needed rows: at least 1, or enough for current + dragged item + potential empty row
    const estimatedRows = Math.max(1, Math.ceil((currentPanelCount + 1) / colCount) + 1);

    let currentX = 0;
    let currentY = 0;
    for (let r = 0; r < estimatedRows; r++) {
        currentX = 0;
        for (let c = 0; c < colCount; c++) {
            gridCellLayout.push({ x: currentX, y: currentY, width: cellWidth, height: cellHeight });
            currentX += cellWidth + colGap;
        }
        currentY += cellHeight + rowGap;
    }
    // console.log("Calculated Grid Layout Slots:", gridCellLayout);
}

/** Finds the index of the NEAREST grid slot (occupied or empty) */
function findNearestSlotIndex(x, y) {
    let closestIndex = -1;
    let minDistSq = Infinity;
    if (!gridCellLayout || gridCellLayout.length === 0) {
        // console.warn("findNearestSlotIndex called before gridCellLayout is populated.");
        return -1; // Avoid errors if called too early
    }
    gridCellLayout.forEach((slot, index) => {
        const slotCenterX = slot.x + slot.width / 2;
        const slotCenterY = slot.y + slot.height / 2;
        const distSq = (x - slotCenterX) ** 2 + (y - slotCenterY) ** 2;
        if (distSq < minDistSq) {
            minDistSq = distSq;
            closestIndex = index;
        }
    });
    return closestIndex;
}

/** Gets the panel currently occupying a specific slot index */
function getPanelAtSlotIndex(index) {
    if (index < 0 || !gridCellLayout || index >= gridCellLayout.length) return null;
    const slot = gridCellLayout[index];
    let foundPanel = null;
    // Use a slightly generous bounding box check around the slot center
    const toleranceX = slot.width / 3;
    const toleranceY = slot.height / 3;
    const slotCenterX = slot.x + slot.width / 2;
    const slotCenterY = slot.y + slot.height / 2;

    insightsGrid.querySelectorAll('.insight-panel:not(.dragging-source-hidden):not(.drop-preview-slot)').forEach(p => {
        const pCenterX = p.offsetLeft + p.offsetWidth / 2;
        const pCenterY = p.offsetTop + p.offsetHeight / 2;
        // Check if panel center is within tolerance of slot center
        if (Math.abs(pCenterX - slotCenterX) < toleranceX && Math.abs(pCenterY - slotCenterY) < toleranceY) {
             foundPanel = p;
             // Note: This might find multiple if panels overlap heavily, but typically finds the one visually occupying the slot.
        }
    });
    return foundPanel;
}

/** Finds the index of the nearest grid slot that is currently EMPTY */
function findNearestAvailableSlotIndex(x, y) {
    let closestEmptyIndex = -1;
    let minDistSq = Infinity;

    if (!gridCellLayout || gridCellLayout.length === 0) {
        // console.warn("findNearestAvailableSlotIndex called before gridCellLayout is populated.");
        return -1; // Avoid errors if called too early
    }

    gridCellLayout.forEach((slot, index) => {
        const panelInSlot = getPanelAtSlotIndex(index);
        if (!panelInSlot) { // Slot is available
            const slotCenterX = slot.x + slot.width / 2;
            const slotCenterY = slot.y + slot.height / 2;
            const distSq = (x - slotCenterX) ** 2 + (y - slotCenterY) ** 2;
            if (distSq < minDistSq) {
                minDistSq = distSq;
                closestEmptyIndex = index;
            }
        }
    });
    return closestEmptyIndex;
}

/** Creates or retrieves the drop preview slot element */
function getDropPreviewSlot() {
    if (!dropPreviewSlot) {
        dropPreviewSlot = document.createElement('div');
        dropPreviewSlot.className = 'drop-preview-slot';
        // Apply aspect ratio dynamically based on calculated panel height/width
        if (gridCellLayout.length > 0 && gridCellLayout[0].width > 0 && gridCellLayout[0].height > 0) {
            dropPreviewSlot.style.width = `${gridCellLayout[0].width}px`;
            dropPreviewSlot.style.height = `${gridCellLayout[0].height}px`;
        } else {
             // Fallback if grid layout failed
             dropPreviewSlot.style.aspectRatio = '1 / 0.85';
             dropPreviewSlot.style.minHeight = '150px'; // Ensure some visibility
        }
        dropPreviewSlot.style.pointerEvents = 'none'; // Crucial: prevent interference
    }
    return dropPreviewSlot;
}

/** Inserts the drop preview slot into the grid DOM before a specific element */
function showDropPreviewInGrid(targetIndex) {
     if (gridCellLayout.length === 0) calculateGridCellLayout(); // Ensure layout exists
     if (targetIndex < 0 || targetIndex >= gridCellLayout.length) {
        hideDropPreviewInGrid();
        return;
    }
    const previewSlot = getDropPreviewSlot();

    // Ensure size matches current layout (might change on resize)
    const slotLayout = gridCellLayout[targetIndex];
    previewSlot.style.width = `${slotLayout.width}px`;
    previewSlot.style.height = `${slotLayout.height}px`;

    // --- Determine insertion point ---
    // Get currently laid out panels (excluding hidden source and the preview itself if already present)
    const currentPanels = Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-source-hidden):not(.drop-preview-slot)'));
    currentPanels.sort((a, b) => { // Sort by DOM order / visual order
        const orderA = (a.offsetTop * 1000) + a.offsetLeft; // Prioritize top, then left
        const orderB = (b.offsetTop * 1000) + b.offsetLeft;
        return orderA - orderB;
    });


    // Find the element that should come AFTER the target index
    let elementToInsertBefore = null;
    if (targetIndex < currentPanels.length) {
        elementToInsertBefore = currentPanels[targetIndex];
    }

    // --- Insert or Move the preview slot ---
    const needsInsert = !previewSlot.parentElement || previewSlot.parentElement !== insightsGrid;
    const needsMove = !needsInsert && (
        (elementToInsertBefore && previewSlot.nextElementSibling !== elementToInsertBefore) ||
        (!elementToInsertBefore && insightsGrid.lastElementChild !== previewSlot)
    );

    if (needsInsert || needsMove) {
        if (elementToInsertBefore) {
           insightsGrid.insertBefore(previewSlot, elementToInsertBefore);
        } else {
           insightsGrid.appendChild(previewSlot); // Append if it goes last
        }
    }

    targetSlotIndex = targetIndex; // Store the index where preview is shown

    if (emptyMessage) emptyMessage.style.display = 'none';
}


/** Removes the drop preview slot from the grid DOM */
function hideDropPreviewInGrid() {
    const previewSlot = getDropPreviewSlot();
    if (previewSlot && previewSlot.parentElement) {
        previewSlot.remove();
    }
    if(targetSlotIndex !== -1) { // Only reset if it was previously set
        targetSlotIndex = -1;
    }
    checkGridEmpty();
}

// --- Palette Preview Logic ---

/** Generates the inner HTML for the preview container */
function generatePreviewContentHTML(analysisType) {
    // Customize these previews as needed
    // Use backticks for potentially multi-line HTML for readability
    switch (analysisType) {
        case 'attendance-trends':
            return `<span class="preview-title">Attendance Trends Example</span><div class="preview-content"><img src="/static/img/placeholder-line-chart.png" alt="Line chart preview" style="max-width: 100%; height: auto; opacity: 0.7;"><p>Shows event attendance over time.</p></div>`;
        case 'active-groups':
            return `<span class="preview-title">Active Groups Example</span><div class="preview-content" style="font-size: 0.9em; color: #ddd;"><ol style="margin: 5px 0 0 15px; padding: 0; text-align: left;"><li>Top Group (25)</li><li>Second Group (18)</li><li>Another One (15)</li></ol><p style="font-size: 0.8em; margin-top: 8px; color: #ccc;">Ranks groups by recent activity.</p></div>`;
         case 'rsvp-distribution':
             return `<span class="preview-title">RSVP Distribution Example</span><div class="preview-content"><img src="/static/img/placeholder-pie-chart.png" alt="Pie chart preview" style="max-width: 80%; height: auto; margin: 5px auto; display: block; opacity: 0.7;"><p>Typical Going/Maybe/No breakdown.</p></div>`;
         case 'busy-periods':
             return `<span class="preview-title">Busy Periods Example</span><div class="preview-content"><img src="/static/img/placeholder-heatmap.png" alt="Heatmap preview" style="max-width: 100%; height: auto; opacity: 0.7;"><p>Highlights days with high event density.</p></div>`;
        default:
            return `<span class="preview-title">${analysisType.replace(/-/g, ' ')} Example</span><div class="preview-content"><p>Preview not available.</p></div>`;
    }
}

/** Shows the palette item preview */
function showPalettePreview(targetPaletteItem) {
    if (!palettePreviewContainer || !targetPaletteItem || isDragging) return; // Don't show if dragging
    clearTimeout(previewHideTimeout); // Cancel any pending hide
    previewHideTimeout = null;

    const analysisType = targetPaletteItem.dataset.analysisType;
    if (!analysisType) return;

    const previewHTML = generatePreviewContentHTML(analysisType);
    palettePreviewContainer.innerHTML = previewHTML;

    // Calculate position after setting content
    const itemRect = targetPaletteItem.getBoundingClientRect();

    // Temporarily make visible to measure dimensions
    palettePreviewContainer.style.visibility = 'hidden'; // Keep hidden but allow measurement
    palettePreviewContainer.style.display = 'block';
    const containerRect = palettePreviewContainer.getBoundingClientRect();
    palettePreviewContainer.style.display = ''; // Reset display
    palettePreviewContainer.style.visibility = ''; // Reset visibility

    let top = itemRect.top - containerRect.height - 10; // Position above item
    let left = itemRect.left + (itemRect.width / 2) - (containerRect.width / 2); // Center horizontally

    // Adjust if out of bounds
    if (top < 10) top = itemRect.bottom + 10; // Flip below if not enough space above
    if (left < 10) left = 10; // Prevent overflow left
    if (left + containerRect.width > window.innerWidth - 10) { // Prevent overflow right
        left = window.innerWidth - containerRect.width - 10;
    }

    palettePreviewContainer.style.top = `${top}px`;
    palettePreviewContainer.style.left = `${left}px`;
    palettePreviewContainer.classList.add('visible');
}

/** Schedules hiding the palette item preview (allows moving mouse into preview) */
function scheduleHidePalettePreview() {
    clearTimeout(previewHideTimeout);
    previewHideTimeout = setTimeout(hidePalettePreview, PREVIEW_HIDE_DELAY);
}

/** Hides the palette item preview immediately */
function hidePalettePreview() {
     clearTimeout(previewHideTimeout); // Ensure no lingering timeouts
     previewHideTimeout = null;
    if (palettePreviewContainer) {
        palettePreviewContainer.classList.remove('visible');
    }
}

/** Cancels the scheduled hide if the mouse enters the preview container */
function cancelHidePreview() {
    clearTimeout(previewHideTimeout);
    previewHideTimeout = null;
}


// --- Event Handlers ---

/** Handles pointer down on grid panels or palette items */
function onPointerDown(event) {
    const panelHeader = event.target.closest('.panel-header');
    const paletteItem = event.target.closest('.palette-item');
    const addBtn = event.target.closest('.add-analysis-btn');
    const panelActions = event.target.closest('.panel-actions');

    // Prevent drag start if clicking buttons within the item/panel
    if (addBtn || panelActions) {
        // Handle button click directly if needed (e.g., for add button)
        if (addBtn && paletteItem) {
            // Optional: Directly add the panel without dragging
            // addPanelFromPalette(paletteItem);
            console.log("Add button clicked (not implemented for direct add yet)");
        }
        return;
    }

    if (event.button !== 0) return; // Ignore non-left clicks

    if (panelHeader) { // Start grid drag
        startGridDrag(event, panelHeader.closest('.insight-panel'));
    } else if (paletteItem) { // Start palette drag
        startPaletteDrag(event, paletteItem);
    }
}


/** Initiates drag from a Grid Panel */
function startGridDrag(event, panel) {
    if (!panel || isDragging) return;
    event.preventDefault(); // Prevent default text selection, etc.
    event.stopPropagation(); // Prevent triggering lower-level listeners

    isDragging = true;
    dragType = 'grid';
    sourceElement = panel;

    // Ensure grid layout is up-to-date before calculating drag start
    calculateGridCellLayout();

    const rect = sourceElement.getBoundingClientRect();
    startClientX = event.clientX;
    startClientY = event.clientY;
    offsetX = startClientX - rect.left;
    offsetY = startClientY - rect.top;

    // Clone the element for visual dragging
    draggedElement = sourceElement.cloneNode(true); // Create a clone
    draggedElement.style.pointerEvents = 'none'; // Clone shouldn't capture events
    draggedElement.classList.add('dragging');
    draggedElement.style.position = 'fixed'; // Use fixed for smooth viewport dragging
    draggedElement.style.left = `${rect.left}px`;
    draggedElement.style.top = `${rect.top}px`;
    draggedElement.style.width = `${rect.width}px`;
    draggedElement.style.height = `${rect.height}px`;
    draggedElement.style.margin = '0'; // Reset margin for fixed positioning
    draggedElement.style.transform = `scale(${DRAG_SCALE})`; // Apply initial scale
    document.body.appendChild(draggedElement); // Add clone to body

    // Hide original panel visually but keep its space in the grid
    sourceElement.classList.add('dragging-source-hidden'); // Apply opacity/visibility hidden

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp, { once: true });
}

/** Initiates drag from a Palette Item */
function startPaletteDrag(event, item) {
    if (!item || isDragging) return;
    event.preventDefault();
    event.stopPropagation();

    isDragging = true;
    dragType = 'palette';
    sourceElement = item; // The palette item is the source

    const analysisType = item.dataset.analysisType;
    const title = item.dataset.title;
    const description = item.dataset.description;
    const placeholderHTML = item.dataset.placeholderHtml || '<p>Loading...</p>'; // Get placeholder HTML
    if (!analysisType || !title) { isDragging = false; return; }

    // Create the panel element that will be dragged
    const panelHTML = createInsightPanelHTML(analysisType, title, description, placeholderHTML);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = panelHTML.trim();
    draggedElement = tempDiv.firstChild; // This is the actual .insight-panel div

    // Ensure grid layout is calculated to estimate size
    calculateGridCellLayout();
    const cellWidth = gridCellLayout.length > 0 ? gridCellLayout[0].width : 300; // Use calculated width
    const cellHeight = gridCellLayout.length > 0 ? gridCellLayout[0].height : 250; // Use calculated height

    draggedElement.classList.add('dragging'); // Apply dragging styles (fixed position, etc.)
    draggedElement.style.width = `${cellWidth}px`; // Set initial size based on grid cell
    draggedElement.style.height = `${cellHeight}px`;
    draggedElement.style.margin = '0'; // Reset margins for fixed positioning
    document.body.appendChild(draggedElement); // Add to body for dragging

    startClientX = event.clientX;
    startClientY = event.clientY;
    // Offset slightly so pointer isn't exactly at top-left corner
    offsetX = cellWidth * 0.15; // Adjust as needed
    offsetY = cellHeight * 0.15; // Adjust as needed

    // Position initially at pointer location (minus offset)
    draggedElement.style.left = `${startClientX - offsetX}px`;
    draggedElement.style.top = `${startClientY - offsetY}px`;
    draggedElement.style.transform = `scale(${DRAG_SCALE})`; // Apply initial scale

    hidePalettePreview(); // Ensure preview is hidden when drag starts

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp, { once: true });
}

/** Handles pointer movement during drag */
function onPointerMove(event) {
    if (!isDragging || !draggedElement) return;

    const currentClientX = event.clientX;
    const currentClientY = event.clientY;

    // Use requestAnimationFrame for smoother updates
    cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(() => {
        // Update visual dragged element position
        draggedElement.style.left = `${currentClientX - offsetX}px`;
        draggedElement.style.top = `${currentClientY - offsetY}px`;

        // Find closest available drop slot based on *pointer* position relative to grid container
        gridRect = insightsGridContainer.getBoundingClientRect();
        // Calculate pointer position relative to the *content* of the scrollable grid container
        const pointerXInGridContent = currentClientX - gridRect.left + insightsGridContainer.scrollLeft;
        const pointerYInGridContent = currentClientY - gridRect.top + insightsGridContainer.scrollTop;

        const isOverGrid = currentClientX >= gridRect.left && currentClientX <= gridRect.right &&
                           currentClientY >= gridRect.top && currentClientY <= gridRect.bottom;

        if (isOverGrid) {
            const nearestEmptyIndex = findNearestAvailableSlotIndex(pointerXInGridContent, pointerYInGridContent);
            // console.log(`Pointer: (${pointerXInGridContent.toFixed(0)}, ${pointerYInGridContent.toFixed(0)}), Nearest Empty: ${nearestEmptyIndex}`);
            if (nearestEmptyIndex !== -1) {
                 if(targetSlotIndex !== nearestEmptyIndex) { // Only update DOM if target changes
                     showDropPreviewInGrid(nearestEmptyIndex);
                 }
            } else {
                 hideDropPreviewInGrid(); // Hide if no empty slot is near
            }
        } else {
            hideDropPreviewInGrid(); // Hide preview if outside grid
        }
    });
}


/** Handles pointer up event to end dragging */
function onPointerUp(event) {
    if (!isDragging || !draggedElement) return;
    cancelAnimationFrame(animationFrameId); // Cancel any pending animation frame

    const finalTargetIndex = targetSlotIndex; // Use the index where the preview was last shown

    hideDropPreviewInGrid(); // Remove visual placeholder slot from grid DOM

    // Determine where to insert the final element in the DOM based on target index
    let elementToInsertBefore = null;
    if (finalTargetIndex !== -1) {
         // Find the element that currently occupies the slot *after* the target index
         const currentPanels = Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-source-hidden):not(.drop-preview-slot)'));
         currentPanels.sort((a, b) => (a.offsetTop * 1000 + a.offsetLeft) - (b.offsetTop * 1000 + b.offsetLeft)); // Sort by visual order

         if(finalTargetIndex < currentPanels.length) {
             elementToInsertBefore = currentPanels[finalTargetIndex];
         }
     }


    if (finalTargetIndex !== -1) { // Dropped successfully onto an available slot
        if (dragType === 'grid') {
            // Move the original source element to the new position
            sourceElement.classList.remove('dragging-source-hidden'); // Make original visible again
            sourceElement.style.transform = ''; // Reset any temporary transform

            if (elementToInsertBefore) {
                insightsGrid.insertBefore(sourceElement, elementToInsertBefore);
            } else {
                insightsGrid.appendChild(sourceElement); // Append if dropped at the end
            }
            draggedElement.remove(); // Remove the temporary dragged clone

        } else if (dragType === 'palette') {
            // Insert the newly created panel (which was the draggedElement) into the grid
            draggedElement.classList.remove('dragging'); // Remove dragging styles
            draggedElement.style.position = ''; // Reset styles for grid layout
            draggedElement.style.left = '';
            draggedElement.style.top = '';
            draggedElement.style.width = '';    // Let grid control size
            draggedElement.style.height = '';   // Let grid control size
            draggedElement.style.transform = ''; // Remove scale
            draggedElement.style.pointerEvents = ''; // Re-enable pointer events
            draggedElement.style.margin = '';   // Reset margin

            if (elementToInsertBefore) {
                insightsGrid.insertBefore(draggedElement, elementToInsertBefore);
            } else {
                insightsGrid.appendChild(draggedElement); // Append if dropped at the end
            }
            makePanelDraggable(draggedElement); // Make the newly added panel draggable
            // Add event listeners for buttons inside the new panel
            addPanelActionListeners(draggedElement);
        }

    } else { // Drop failed (outside grid or valid slot)
        if (dragType === 'grid') {
            // Restore original panel to its place (just make it visible)
            sourceElement.classList.remove('dragging-source-hidden');
            sourceElement.style.transform = '';
            draggedElement.remove(); // Remove the clone
        } else if (dragType === 'palette') {
            // Dragged from palette failed, just remove the clone
            draggedElement.remove();
        }
        console.log("Drop outside valid area or on occupied slot.");
    }

    // --- Cleanup ---
    isDragging = false;
    draggedElement = null;
    sourceElement = null;
    dragType = null;
    targetSlotIndex = -1;
    // Remove global listeners added during drag start
    document.removeEventListener('pointermove', onPointerMove);
    // pointerup removed by {once: true}

    // Recalculate grid layout and check empty state after DOM changes settle
    setTimeout(() => {
        calculateGridCellLayout();
        checkGridEmpty();
    }, 50); // Small delay might help layout settle
}


/** Handles palette collapse/expand */
function handlePaletteToggle() {
    if (!palette || !paletteToggleBtn) return;
    const isCollapsed = palette.classList.toggle('collapsed');
    insightsView?.classList.toggle('palette-collapsed', isCollapsed);
    paletteToggleBtn.setAttribute('aria-label', isCollapsed ? 'Expand Palette' : 'Collapse Palette');
    paletteToggleBtn.setAttribute('title', isCollapsed ? 'Expand Palette' : 'Collapse Palette');
    const icon = paletteToggleBtn.querySelector('i');
    if (icon) icon.className = `fas ${isCollapsed ? 'fa-chevron-up' : 'fa-chevron-down'}`;
    // Recalculate grid after palette transition finishes (affects available height)
    setTimeout(calculateGridCellLayout, 350); // Match CSS transition duration
}

/** Handles clicks on panel action buttons (remove, share) - DELEGATED from grid */
function handlePanelAction(event) {
    const removeButton = event.target.closest('.remove-panel-btn');
    const shareButton = event.target.closest('.share-panel-btn');
    const panel = event.target.closest('.insight-panel');

    if (!panel) return; // Click wasn't inside a panel

    if (removeButton) {
        panel.remove();
        // Recalculate layout and check empty state after removal
        setTimeout(() => {
            calculateGridCellLayout();
            checkGridEmpty();
        }, 50);
    } else if (shareButton) {
        // Placeholder for share functionality
        alert(`Sharing panel '${panel.querySelector('.panel-title')?.textContent || 'N/A'}' (functionality not implemented)`);
        console.log("Share button clicked for panel:", panel.dataset.panelId);
    }
}

/** Attaches pointerdown listener to make a panel header draggable */
function makePanelDraggable(panelElement) {
    const header = panelElement.querySelector('.panel-header');
    if (header) {
        // Use the main onPointerDown handler for consistency
        header.removeEventListener('pointerdown', onPointerDown); // Remove if already added
        header.addEventListener('pointerdown', onPointerDown);
    }
}

/** Attaches event listeners for actions within a specific panel */
function addPanelActionListeners(panelElement) {
    const actionsContainer = panelElement.querySelector('.panel-actions');
    if (actionsContainer) {
        // We use event delegation on the grid, so specific listeners here might
        // not be strictly necessary unless we need different behavior.
        // If needed, add listeners like this:
        // const removeBtn = actionsContainer.querySelector('.remove-panel-btn');
        // if (removeBtn) {
        //     removeBtn.addEventListener('click', handlePanelAction); // Could call specific handler
        // }
    }
}


// --- Initialization ---

/** Sets up all event listeners */
function setupEventListeners() {
    if (!insightsView) return;

    // Palette Toggle
    if (paletteHeader) { // Target the header specifically for toggle
        paletteHeader.addEventListener('click', (event) => {
            // Ensure the click isn't on a button *inside* the header if any were added
            if (event.target.closest('button') && event.target !== paletteToggleBtn) return;
            handlePaletteToggle();
        });
    } else {
        console.warn("Palette header not found for toggle listener.");
    }


    // Palette Item Drag Initiation & Hover Preview (Delegated to scroll container)
    if (paletteScrollContainer) {
        // Drag Start
        paletteScrollContainer.addEventListener('pointerdown', onPointerDown);

        // Hover Preview - Show
        paletteScrollContainer.addEventListener('mouseover', (event) => {
            if (isDragging) return; // Don't show preview while dragging
            const targetItem = event.target.closest('.palette-item');
            if (targetItem) {
                showPalettePreview(targetItem);
            }
        });

        // Hover Preview - Hide (Schedule)
        paletteScrollContainer.addEventListener('mouseout', (event) => {
            if (isDragging) return;
            const targetItem = event.target.closest('.palette-item');
            const relatedTarget = event.relatedTarget;
             // Check if the mouse left the item AND didn't enter the preview container
             if (targetItem && !targetItem.contains(relatedTarget) && !palettePreviewContainer.contains(relatedTarget)) {
                 scheduleHidePalettePreview();
             }
        });

        // Keep preview visible if mouse enters it
        if(palettePreviewContainer) {
            palettePreviewContainer.addEventListener('mouseenter', cancelHidePreview);
            palettePreviewContainer.addEventListener('mouseleave', scheduleHidePalettePreview);
        }

    } else {
        console.warn("Palette scroll container not found.");
    }

    // Grid Panel Actions & Drag Initiation (Delegated to grid container)
    if (insightsGrid) {
        // Listen for clicks on buttons within the grid (delegation)
        insightsGrid.addEventListener('click', handlePanelAction);

        // Listen for pointer down to initiate dragging panel headers (delegation)
        // Note: onPointerDown already checks if the target is a .panel-header
        insightsGrid.addEventListener('pointerdown', onPointerDown);

        // Make existing panels draggable on load
        insightsGrid.querySelectorAll('.insight-panel').forEach(makePanelDraggable);

    } else {
        console.warn("Insights grid not found.");
    }

    // Recalculate layout on resize (debounced)
    window.addEventListener('resize', debounce(() => {
        if (!isDragging) { // Don't recalculate during an active drag
             console.log("Window resized, recalculating grid layout...");
             calculateGridCellLayout();
             // If drop preview is visible, reposition/resize it based on new layout
             if (targetSlotIndex !== -1) {
                 const slotLayout = gridCellLayout[targetSlotIndex];
                 if(slotLayout) {
                    const previewSlot = getDropPreviewSlot();
                    previewSlot.style.width = `${slotLayout.width}px`;
                    previewSlot.style.height = `${slotLayout.height}px`;
                    // Re-insert to ensure correct position if grid reflowed significantly
                    showDropPreviewInGrid(targetSlotIndex);
                 } else {
                    hideDropPreviewInGrid(); // Hide if index became invalid
                 }
             }
        }
    }, 250));

    console.log("Insights event listeners attached (V3 Rigid Grid - Hover Fix).");
}

/** Simple debounce utility */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout); timeout = setTimeout(later, wait);
    };
};

/** Main initialization function */
export function initInsightsManager() {
    console.log("Initializing Insights Manager (V3 Rigid Grid - Hover Fix)...");
    // Get elements
    insightsView = document.getElementById('insights-view');
    insightsGridContainer = insightsView?.querySelector('.insights-grid-container');
    insightsGrid = document.getElementById('insights-grid');
    palette = document.getElementById('analysis-palette');
    paletteHeader = document.getElementById('palette-header'); // Get palette header
    paletteToggleBtn = document.getElementById('palette-toggle-btn');
    paletteScrollContainer = document.getElementById('palette-scroll-container');
    emptyMessage = document.getElementById('insights-empty-message');
    palettePreviewContainer = document.getElementById('palette-preview-container');
    // dropPreviewSlot created dynamically

    if (!insightsView || !insightsGridContainer || !insightsGrid || !palette || !palettePreviewContainer || !paletteScrollContainer || !paletteHeader) {
        console.error("Insights view or critical child elements not found. Manager cannot initialize properly. Check IDs: insights-view, insights-grid-container, insights-grid, analysis-palette, palette-header, palette-scroll-container, palette-preview-container");
        return;
    }

    // Initial setup
    calculateGridCellLayout(); // Calculate layout dimensions first
    checkGridEmpty();          // Check if empty message needed
    setupEventListeners();     // Attach all handlers

    console.log("Insights Manager Initialized Successfully (V3 Rigid Grid - Hover Fix).");
}

// --- END OF FILE insightsManager.js ---