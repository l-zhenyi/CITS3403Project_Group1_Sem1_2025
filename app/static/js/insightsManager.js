// --- START OF FILE insightsManager.js ---

// --- DOM Elements ---
let insightsView = null;
let insightsGridContainer = null; // The scrollable container
let insightsGrid = null;        // The grid element where panels are placed
let palette = null;
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
    // Add data-panel-id here for easier selection
    // Ensure Font Awesome is included in HTML if using these icons
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
                <div class="placeholder-chart">${placeholderContent}</div>
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
    const rowGap = parseInt(gridStyle.rowGap) || 0;
    const colGap = parseInt(gridStyle.columnGap) || 0;
    const gridWidth = insightsGrid.offsetWidth;

    if (!gridWidth || gridWidth <= 0 || colCount <= 0) {
        console.warn("Cannot calculate grid layout: Invalid dimensions or column count.");
        return;
    }

    const cellWidth = (gridWidth - (colCount - 1) * colGap) / colCount;
    let cellHeight = 0;

    if (cellWidth > 0) {
        // Create a temporary element *within the grid container* for accurate style computation
        const tempPanel = document.createElement('div');
        tempPanel.style.width = `${cellWidth}px`;
        // Use the computed aspect ratio from CSS. Fallback if necessary.
        const cssAspectRatio = window.getComputedStyle(insightsGrid).getPropertyValue('--panel-aspect-ratio') || '1 / 0.85'; // Read custom property or default
        tempPanel.style.aspectRatio = cssAspectRatio;
        tempPanel.style.position = 'absolute'; tempPanel.style.visibility = 'hidden';
        insightsGridContainer.appendChild(tempPanel); // Append to container for style context
        cellHeight = tempPanel.offsetHeight;
        insightsGridContainer.removeChild(tempPanel);
    }

    if (cellHeight <= 0) {
        console.warn("Could not determine valid cell height.");
        cellHeight = cellWidth / (1 / 0.85); // Fallback aspect ratio calculation
    }

    const currentPanelCount = insightsGrid.querySelectorAll('.insight-panel').length;
    const estimatedRows = Math.max(3, Math.ceil((currentPanelCount + 2) / colCount));

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
    if (index < 0 || index >= gridCellLayout.length) return null;
    const slot = gridCellLayout[index];
    let foundPanel = null;
    let minDistSq = (slot.width / 3)**2; // Check within roughly a third of the width

    insightsGrid.querySelectorAll('.insight-panel:not(.dragging-source-hidden)').forEach(p => {
        const pCenterX = p.offsetLeft + p.offsetWidth / 2;
        const pCenterY = p.offsetTop + p.offsetHeight / 2;
        const slotCenterX = slot.x + slot.width / 2;
        const slotCenterY = slot.y + slot.height / 2;
        const distSq = (pCenterX - slotCenterX)**2 + (pCenterY - slotCenterY)**2;
        if (distSq < minDistSq) {
             minDistSq = distSq;
             foundPanel = p;
        }
    });
    return foundPanel;
}

/** Finds the index of the nearest grid slot that is currently EMPTY */
function findNearestAvailableSlotIndex(x, y) {
    let closestEmptyIndex = -1;
    let minDistSq = Infinity;

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
        // Get aspect ratio from CSS custom property or default
        const cssAspectRatio = window.getComputedStyle(insightsGrid).getPropertyValue('--panel-aspect-ratio') || '1 / 0.85';
        dropPreviewSlot.style.aspectRatio = cssAspectRatio;
        dropPreviewSlot.style.minHeight = '100px'; // Ensure visibility
    }
    return dropPreviewSlot;
}

/** Inserts the drop preview slot into the grid DOM before a specific element */
function showDropPreviewInGrid(targetIndex) {
    if (targetIndex < 0 || targetIndex >= gridCellLayout.length) {
        hideDropPreviewInGrid();
        return;
    }
    const previewSlot = getDropPreviewSlot();
    const slotLayout = gridCellLayout[targetIndex];

    // Set size for the preview slot
    previewSlot.style.width = `${slotLayout.width}px`;
    previewSlot.style.height = `${slotLayout.height}px`;

    // --- Determine insertion point ---
    // Get currently laid out panels (excluding hidden source)
    const currentPanels = Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-source-hidden)'));
    // Get their calculated slot indices
    const panelIndices = currentPanels.map(p => findNearestSlotIndex(p.offsetLeft + p.offsetWidth/2, p.offsetTop + p.offsetHeight/2));

    // Find the first panel whose *intended* slot index is >= the target drop index
    let elementToInsertBefore = null;
    for(let i = 0; i < currentPanels.length; i++) {
        if (panelIndices[i] >= targetIndex) {
            elementToInsertBefore = currentPanels[i];
            break;
        }
    }
    // ---------------------------------

    // Insert the preview slot
    if (previewSlot.parentElement !== insightsGrid || previewSlot.nextElementSibling !== elementToInsertBefore) {
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
    switch (analysisType) {
        case 'attendance-trends':
            return `<span class="preview-title">Attendance Trends Example</span><div class="preview-content"><img src="/static/img/placeholder-line-chart.png" alt="Line chart preview"><p>Shows event attendance over time.</p></div>`;
        case 'active-groups':
            return `<span class="preview-title">Active Groups Example</span><div class="preview-content" style="font-size: 0.9em; color: #ddd;"><ol style="margin: 5px 0 0 15px; padding: 0;"><li>Top Group (25)</li><li>Second Group (18)</li><li>Another One (15)</li></ol><p style="font-size: 0.8em; margin-top: 8px; color: #ccc;">Ranks groups by recent activity.</p></div>`;
         case 'rsvp-distribution':
             return `<span class="preview-title">RSVP Distribution Example</span><div class="preview-content"><img src="/static/img/placeholder-pie-chart.png" alt="Pie chart preview"><p>Typical Going/Maybe/No breakdown.</p></div>`;
         case 'busy-periods':
             return `<span class="preview-title">Busy Periods Example</span><div class="preview-content"><img src="/static/img/placeholder-heatmap.png" alt="Heatmap preview"><p>Highlights days with high event density.</p></div>`;
        default:
            return `<span class="preview-title">${analysisType.replace('-', ' ')} Example</span><div class="preview-content"><p>Preview not available.</p></div>`;
    }
}

/** Shows the palette item preview */
function showPalettePreview(targetPaletteItem) {
    if (!palettePreviewContainer || !targetPaletteItem || palettePreviewContainer.classList.contains('visible')) return;
    const analysisType = targetPaletteItem.dataset.analysisType;
    if (!analysisType) return;

    const previewHTML = generatePreviewContentHTML(analysisType);
    palettePreviewContainer.innerHTML = previewHTML;

    // Calculate position after setting content
    const itemRect = targetPaletteItem.getBoundingClientRect();
    palettePreviewContainer.style.display = 'block'; // Measure
    const containerRect = palettePreviewContainer.getBoundingClientRect();
    palettePreviewContainer.style.display = ''; // Reset

    let top = itemRect.top - containerRect.height - 10;
    let left = itemRect.left + (itemRect.width / 2) - (containerRect.width / 2);
    if (top < 10) top = itemRect.bottom + 10;
    if (left < 10) left = 10;
    if (left + containerRect.width > window.innerWidth - 10) left = window.innerWidth - containerRect.width - 10;

    palettePreviewContainer.style.top = `${top}px`;
    palettePreviewContainer.style.left = `${left}px`;
    palettePreviewContainer.classList.add('visible');
}

/** Hides the palette item preview */
function hidePalettePreview() {
    if (palettePreviewContainer) {
        palettePreviewContainer.classList.remove('visible');
    }
}


// --- Event Handlers ---

/** Handles pointer down on grid panels or palette items */
function onPointerDown(event) {
    const panelHeader = event.target.closest('.panel-header');
    const paletteItem = event.target.closest('.palette-item');
    const addBtn = event.target.closest('.add-analysis-btn');
    const panelActions = event.target.closest('.panel-actions');

    if (event.button !== 0 || addBtn || panelActions) return; // Ignore clicks on buttons or non-left clicks

    if (panelHeader && !panelActions) { // Ensure not clicking inside actions area of header
        startGridDrag(event, panelHeader.closest('.insight-panel'));
    } else if (paletteItem) {
        startPaletteDrag(event, paletteItem);
    }
}


/** Initiates drag from a Grid Panel */
function startGridDrag(event, panel) {
    if (!panel) return;
    event.preventDefault();
    event.stopPropagation();

    isDragging = true;
    dragType = 'grid';
    sourceElement = panel;

    const rect = sourceElement.getBoundingClientRect();
    startClientX = event.clientX;
    startClientY = event.clientY;
    offsetX = startClientX - rect.left;
    offsetY = startClientY - rect.top;

    // Clone the element for visual dragging
    draggedElement = sourceElement.cloneNode(true); // Create a clone
    draggedElement.style.pointerEvents = 'none'; // Clone shouldn't capture events
    draggedElement.classList.add('dragging');
    draggedElement.style.left = `${rect.left}px`;
    draggedElement.style.top = `${rect.top}px`;
    draggedElement.style.width = `${rect.width}px`;
    draggedElement.style.height = `${rect.height}px`;
    draggedElement.style.transform = `scale(${DRAG_SCALE})`;
    document.body.appendChild(draggedElement); // Add clone to body

    // Hide original position using placeholder class
    sourceElement.classList.add('dragging-source-hidden');

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp, { once: true });
}

/** Initiates drag from a Palette Item */
function startPaletteDrag(event, item) {
    event.preventDefault();
    event.stopPropagation();
    if (isDragging) return;

    isDragging = true;
    dragType = 'palette';
    sourceElement = item;

    const analysisType = item.dataset.analysisType;
    const title = item.dataset.title;
    const description = item.dataset.description;
    const placeholderHTML = item.dataset.placeholderHtml;
    if (!analysisType || !title) { isDragging = false; return; }

    // Create the panel element to be dragged
    const panelHTML = createInsightPanelHTML(analysisType, title, description, placeholderHTML);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = panelHTML.trim();
    draggedElement = tempDiv.firstChild;

    // Estimate size based on grid calculation
    calculateGridCellLayout(); // Ensure layout is calculated
    const cellWidth = gridCellLayout.length > 0 ? gridCellLayout[0].width : 300;
    const cellHeight = gridCellLayout.length > 0 ? gridCellLayout[0].height : 250;
    draggedElement.style.width = `${cellWidth}px`;
    draggedElement.style.height = `${cellHeight}px`;

    draggedElement.classList.add('dragging');
    document.body.appendChild(draggedElement);

    startClientX = event.clientX;
    startClientY = event.clientY;
    offsetX = cellWidth * 0.5;
    offsetY = cellHeight * 0.2;
    draggedElement.style.left = `${startClientX - offsetX}px`;
    draggedElement.style.top = `${startClientY - offsetY}px`;
    draggedElement.style.transform = `scale(${DRAG_SCALE})`;

    hidePalettePreview();

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp, { once: true });
}

/** Handles pointer movement during drag */
function onPointerMove(event) {
    if (!isDragging || !draggedElement) return;

    const currentClientX = event.clientX;
    const currentClientY = event.clientY;

    // Update visual dragged element position
    draggedElement.style.left = `${currentClientX - offsetX}px`;
    draggedElement.style.top = `${currentClientY - offsetY}px`;

    // Find closest available drop slot based on *pointer* position relative to grid container
    gridRect = insightsGridContainer.getBoundingClientRect();
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
}

/** Handles pointer up event to end dragging */
function onPointerUp(event) {
    if (!isDragging || !draggedElement) return;

    const previewSlot = getDropPreviewSlot();
    const finalTargetIndex = targetSlotIndex; // Use the index where the preview was last shown

    hideDropPreviewInGrid(); // Remove visual placeholder

    // Determine where to insert the final element in the DOM
    let elementToInsertBefore = null;
    if (finalTargetIndex !== -1) {
         // Find the element that *should* be after the dropped position
         const panels = Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-source-hidden)'));
         panels.sort((a, b) => (a.offsetTop - b.offsetTop) || (a.offsetLeft - b.offsetLeft)); // Sort by visual position
         for (let i = 0; i < panels.length; i++) {
             const panelIndex = findNearestSlotIndex(panels[i].offsetLeft + panels[i].offsetWidth / 2, panels[i].offsetTop + panels[i].offsetHeight / 2);
             if (panelIndex >= finalTargetIndex) {
                 elementToInsertBefore = panels[i];
                 break;
             }
         }
     }


    if (finalTargetIndex !== -1) { // Dropped successfully onto an available slot
        if (dragType === 'grid') {
            // Move the original source element
            sourceElement.classList.remove('dragging-source-hidden');
            sourceElement.style.transform = ''; // Remove scale immediately

            if (elementToInsertBefore) {
                insightsGrid.insertBefore(sourceElement, elementToInsertBefore);
            } else {
                insightsGrid.appendChild(sourceElement);
            }
             // Remove the temporary dragged clone
             draggedElement.remove();

        } else if (dragType === 'palette') {
            // Insert the newly created panel (which was the draggedElement)
            draggedElement.classList.remove('dragging');
            draggedElement.style.position = ''; // Reset styles for grid layout
            draggedElement.style.left = '';
            draggedElement.style.top = '';
            draggedElement.style.width = '';
            draggedElement.style.height = '';
            draggedElement.style.transform = ''; // Remove scale
            draggedElement.style.pointerEvents = ''; // Re-enable pointer events

            if (elementToInsertBefore) {
                insightsGrid.insertBefore(draggedElement, elementToInsertBefore);
            } else {
                insightsGrid.appendChild(draggedElement);
            }
            makePanelDraggable(draggedElement); // Make the new panel draggable
        }

    } else { // Dropped outside grid or onto occupied slot (and no other empty slot was near)
        if (dragType === 'grid') {
            // Return original panel
            sourceElement.classList.remove('dragging-source-hidden');
            sourceElement.style.transform = '';
             draggedElement.remove(); // Remove the clone used for dragging
        } else if (dragType === 'palette') {
            // Just remove the dragged clone
            draggedElement.remove();
        }
        console.log("Drop outside valid area.");
    }

    // Reset state
    isDragging = false;
    draggedElement = null;
    sourceElement = null;
    dragType = null;
    targetSlotIndex = -1;
    currentDropTarget = null; // Reset hover target as well

    // Remove global listeners
    document.removeEventListener('pointermove', onPointerMove);
    // pointerup removed by {once: true}

    // Final check on empty message state
    checkGridEmpty();
    // Recalculate grid layout after potential DOM changes
    setTimeout(calculateGridCellLayout, 0);
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
}

/** Handles clicks on panel action buttons (remove, share) */
function handlePanelAction(event) {
    const removeButton = event.target.closest('.remove-panel-btn');
    const shareButton = event.target.closest('.share-panel-btn');
    const panel = event.target.closest('.insight-panel');

    if (removeButton && panel) {
        panel.remove();
        setTimeout(() => {
            calculateGridCellLayout(); // Recalculate layout needed
            checkGridEmpty();
        }, 0);
    } else if (shareButton && panel) {
        alert(`Sharing panel '${panel.querySelector('.panel-title')?.textContent || 'N/A'}'`);
    }
}

/** Attaches pointerdown listener to make a panel header draggable */
function makePanelDraggable(panelElement) {
    const header = panelElement.querySelector('.panel-header');
    if (header) {
        header.removeEventListener('pointerdown', onPointerDown); // Use the main handler
        header.addEventListener('pointerdown', onPointerDown);
    }
}

// --- Initialization ---

/** Sets up all event listeners */
function setupEventListeners() {
    if (!insightsView) return;
    // Palette Toggle
    const paletteHeader = palette?.querySelector('.palette-header');
    if (paletteHeader) paletteHeader.addEventListener('click', handlePaletteToggle);

    // Palette Drag Initiation & Hover Preview
    if (paletteScrollContainer) {
        paletteScrollContainer.addEventListener('pointerdown', onPointerDown); // Handles drag start
        paletteScrollContainer.addEventListener('mouseover', (event) => { /* ... same preview show ... */ });
        paletteScrollContainer.addEventListener('mouseout', (event) => { /* ... same preview hide ... */ });
        if(palettePreviewContainer) palettePreviewContainer.addEventListener('mouseleave', hidePalettePreview);
    }
    // Grid Panel Actions & Drag Initiation (Delegated)
    if (insightsGrid) {
        insightsGrid.addEventListener('click', handlePanelAction); // For remove/share
        insightsGrid.addEventListener('pointerdown', onPointerDown); // For drag start on headers
    }
    // Resize handling
    window.addEventListener('resize', debounce(() => { if (!isDragging) calculateGridCellLayout(); }, 250));
    console.log("Insights event listeners attached (V3 Rigid Grid).");
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
    console.log("Initializing Insights Manager (V3 Rigid Grid)...");
    // Get elements
    insightsView = document.getElementById('insights-view');
    insightsGridContainer = insightsView?.querySelector('.insights-grid-container');
    insightsGrid = document.getElementById('insights-grid');
    palette = document.getElementById('analysis-palette');
    paletteToggleBtn = document.getElementById('palette-toggle-btn');
    paletteScrollContainer = document.getElementById('palette-scroll-container');
    emptyMessage = document.getElementById('insights-empty-message');
    palettePreviewContainer = document.getElementById('palette-preview-container');
    // dropPreviewSlot created dynamically

    if (!insightsView || !insightsGridContainer || !insightsGrid || !palette || !palettePreviewContainer) {
        console.warn("Insights view or required elements not found. Manager not fully initialized.");
        return;
    }

    calculateGridCellLayout(); // Initial calculation
    checkGridEmpty();
    setupEventListeners();

    console.log("Insights Manager Initialized Successfully (V3 Rigid Grid).");
}

// --- END OF FILE insightsManager.js ---