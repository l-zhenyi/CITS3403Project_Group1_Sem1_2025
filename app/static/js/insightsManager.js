// --- START OF FILE insightsManager.js ---

// --- DOM Elements ---
let insightsView = null;
let insightsGridContainer = null;
let insightsGrid = null;
let palette = null;
let paletteHeader = null;
let paletteToggleBtn = null;
let paletteScrollContainer = null;
let emptyMessage = null;
let palettePreviewContainer = null;
let dropPreviewSlot = null;

// --- Drag State ---
let isDragging = false;
let draggedElementClone = null; // The visual clone following the mouse
let sourceElement = null;       // The original panel being dragged (or palette item)
let sourceIndex = -1;           // Grid index of the sourceElement (if applicable)
let dragType = null;            // 'grid' or 'palette'
let startClientX, startClientY;
let offsetX, offsetY;
let gridRect = null;
let gridCellLayout = [];
let targetSlotIndex = -1;       // Index where the drop preview is shown
let currentlyShiftedPanel = null; // Panel temporarily shifted aside
let animationFrameId = null;

// --- Palette Preview State ---
let previewHideTimeout = null;
const PREVIEW_HIDE_DELAY = 150;

// --- Constants ---
const DRAG_SCALE = 0.95;
const GRID_COLS = 2; // Consider reading from CSS if dynamic

// --- Helper Functions ---

function generateUniqueId(prefix = 'panel') { /* ... */ return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`; }

function createInsightPanelHTML(analysisType, title, description, placeholderContent) { /* ... */
    const panelId = generateUniqueId(analysisType);
    const decodedPlaceholder = placeholderContent.replace(/</g, '<').replace(/>/g, '>');
    return `
        <div class="insight-panel glassy" data-panel-id="${panelId}" data-analysis-type="${analysisType}">
            <div class="panel-header" draggable="false"> <span class="panel-title">${title}</span> <div class="panel-actions"> <button class="panel-action-btn share-panel-btn" aria-label="Share Analysis" title="Share"><i class="fas fa-share-alt"></i></button> <button class="panel-action-btn remove-panel-btn" aria-label="Remove Analysis" title="Remove"><i class="fas fa-times"></i></button> </div> </div>
            <div class="panel-content"> <p>${description}</p> <div class="placeholder-chart">${decodedPlaceholder}</div> </div>
        </div>`;
}

function checkGridEmpty() {
    if (!insightsGrid || !emptyMessage) return;
    // Check for any panel that isn't the clone
    const hasContent = insightsGrid.querySelector('.insight-panel:not(.dragging-clone)');
    emptyMessage.style.display = hasContent ? 'none' : 'block';
}

function calculateGridCellLayout() {
    // ... (Keep the existing layout calculation logic) ...
    if (!insightsGrid || !insightsGridContainer) return;
    gridCellLayout = [];
    const gridStyle = window.getComputedStyle(insightsGrid);
    const colCount = GRID_COLS;
    const rowGap = parseInt(gridStyle.gap) || 25;
    const colGap = parseInt(gridStyle.gap) || 25;
    const gridWidth = insightsGrid.offsetWidth - parseInt(gridStyle.paddingLeft) - parseInt(gridStyle.paddingRight);

    if (!gridWidth || gridWidth <= 0 || colCount <= 0) return;

    const cellWidth = Math.max(0, (gridWidth - (colCount - 1) * colGap) / colCount);
    let cellHeight = 0;

    const tempPanel = document.createElement('div');
    tempPanel.className = 'insight-panel';
    tempPanel.style.width = `${cellWidth}px`; tempPanel.style.position = 'absolute'; tempPanel.style.visibility = 'hidden';
    insightsGrid.appendChild(tempPanel);
    cellHeight = tempPanel.offsetHeight;
    insightsGrid.removeChild(tempPanel);

    if (cellHeight <= 0) cellHeight = cellWidth / (1 / 0.85); // Fallback

    // Calculate rows needed based on *visible* panels + potential new one
    const visiblePanelCount = insightsGrid.querySelectorAll('.insight-panel:not(.dragging-clone)').length;
    const estimatedRows = Math.max(1, Math.ceil((visiblePanelCount + 1) / colCount) + 1);

    let currentX = parseInt(gridStyle.paddingLeft) || 0;
    let currentY = parseInt(gridStyle.paddingTop) || 0;
    for (let r = 0; r < estimatedRows; r++) {
        currentX = parseInt(gridStyle.paddingLeft) || 0;
        for (let c = 0; c < colCount; c++) {
            gridCellLayout.push({ x: currentX, y: currentY, width: cellWidth, height: cellHeight });
            currentX += cellWidth + colGap;
        }
        currentY += cellHeight + rowGap;
    }
}

/** Finds the index of the NEAREST grid slot based on pointer coords */
function findNearestSlotIndex(pointerX, pointerY) {
    let closestIndex = -1;
    let minDistSq = Infinity;
    if (!gridCellLayout || gridCellLayout.length === 0) return -1;

    gridCellLayout.forEach((slot, index) => {
        const slotCenterX = slot.x + slot.width / 2;
        const slotCenterY = slot.y + slot.height / 2;
        // Calculate distance squared from pointer to slot center
        const distSq = (pointerX - slotCenterX) ** 2 + (pointerY - slotCenterY) ** 2;

        // Optional: Add a tolerance - only consider slots within a certain distance
        // const maxDist = (slot.width * 1.5)**2; // Example tolerance
        // if (distSq < maxDist && distSq < minDistSq) {

        if (distSq < minDistSq) {
            minDistSq = distSq;
            closestIndex = index;
        }
    });
    return closestIndex;
}

/** Gets the panel element currently visually occupying a slot index */
function getPanelElementAtSlotIndex(index) {
    if (index < 0 || !gridCellLayout || index >= gridCellLayout.length) return null;

    const slot = gridCellLayout[index];
    const slotCenterX = slot.x + slot.width / 2;
    const slotCenterY = slot.y + slot.height / 2;
    const tolerance = slot.width * 0.4; // Tolerance for matching

    const potentialPanels = insightsGrid.querySelectorAll('.insight-panel:not(.dragging-clone)');

    for (const panel of potentialPanels) {
        // Calculate panel center relative to the grid *content* origin
        const panelRect = panel.getBoundingClientRect();
        const gridContainerRect = insightsGridContainer.getBoundingClientRect();
        const panelCenterX = (panelRect.left - gridContainerRect.left + insightsGridContainer.scrollLeft) + panelRect.width / 2;
        const panelCenterY = (panelRect.top - gridContainerRect.top + insightsGridContainer.scrollTop) + panelRect.height / 2;

        if (Math.abs(panelCenterX - slotCenterX) < tolerance && Math.abs(panelCenterY - slotCenterY) < tolerance) {
            // Ensure we don't return the original source element if it's acting as placeholder
            // if (panel !== sourceElement || !sourceElement?.classList.contains('dragging-source')) {
                return panel;
            // }
        }
    }
    return null; // No panel found at this index
}


// --- Shift/Repel Logic ---

/** Applies a visual shift to a panel */
function shiftPanelAside(panel) {
    if (!panel || panel.classList.contains('shifting')) return;
    // Reset any previously shifted panel first
    resetShiftedPanel();
    panel.classList.add('shifting');
    currentlyShiftedPanel = panel;
}

/** Resets the visual shift effect */
function resetShiftedPanel() {
    if (currentlyShiftedPanel) {
        currentlyShiftedPanel.classList.remove('shifting');
        currentlyShiftedPanel = null;
    }
}

// --- Drop Preview Slot Logic ---

/** Creates or retrieves the drop preview slot element */
function getDropPreviewSlot() {
    if (!dropPreviewSlot) {
        dropPreviewSlot = document.createElement('div');
        dropPreviewSlot.className = 'drop-preview-slot';
        dropPreviewSlot.style.pointerEvents = 'none';
        // Size set when shown
    }
    return dropPreviewSlot;
}

/** Shows the drop preview at the target index */
function showDropPreviewInGrid(indexToShow) {
    if (gridCellLayout.length === 0) calculateGridCellLayout();
    if (indexToShow < 0 || indexToShow >= gridCellLayout.length) {
        hideDropPreviewInGrid();
        return;
    }

    const previewSlot = getDropPreviewSlot();
    const slotLayout = gridCellLayout[indexToShow];
    previewSlot.style.width = `${slotLayout.width}px`;
    previewSlot.style.height = `${slotLayout.height}px`;
    previewSlot.classList.remove('hidden'); // Ensure visible if previously hidden

    // --- Determine DOM insertion point ---
    // Find the element that *should* come after this index
    let elementToInsertBefore = null;
    const visiblePanels = Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-clone)'));
    // Consider the source element's original position if dragging from grid
    const elementsWithIndices = visiblePanels.map(p => ({
        element: p,
        // Calculate current index based on position (more reliable than trying to track order perfectly)
        index: findNearestSlotIndex(p.offsetLeft + p.offsetWidth/2, p.offsetTop + p.offsetHeight/2)
    }));

    // If dragging from grid, ensure the source placeholder is considered
    if (dragType === 'grid' && sourceElement && !elementsWithIndices.some(item => item.element === sourceElement)) {
        elementsWithIndices.push({element: sourceElement, index: sourceIndex});
    }

    elementsWithIndices.sort((a, b) => a.index - b.index); // Sort by calculated grid index

    // Find the first element whose index is >= the target drop index
    for(let i = 0; i < elementsWithIndices.length; i++) {
         // If the element's index is >= target AND it's not the source element itself (which is visually replaced by preview)
        if (elementsWithIndices[i].index >= indexToShow && elementsWithIndices[i].element !== sourceElement) {
            elementToInsertBefore = elementsWithIndices[i].element;
            break;
        }
        // Special case: If the target IS the source index, insert before the element that comes *after* the source
        if(dragType === 'grid' && indexToShow === sourceIndex && elementsWithIndices[i].index > sourceIndex) {
             elementToInsertBefore = elementsWithIndices[i].element;
             break;
        }
    }


    // --- Insert or Move the preview slot ---
    const needsInsert = !previewSlot.parentElement;
    const needsMove = !needsInsert && (
        (elementToInsertBefore && previewSlot.nextElementSibling !== elementToInsertBefore) ||
        (!elementToInsertBefore && insightsGrid.lastElementChild !== previewSlot && insightsGrid.lastElementChild !== emptyMessage)
    );

     if (needsInsert || needsMove) {
         if (elementToInsertBefore) {
            insightsGrid.insertBefore(previewSlot, elementToInsertBefore);
         } else {
             if (emptyMessage && emptyMessage.parentElement === insightsGrid) {
                 insightsGrid.insertBefore(previewSlot, emptyMessage);
             } else {
                 insightsGrid.appendChild(previewSlot);
             }
         }
     }
    targetSlotIndex = indexToShow; // Update the target index state
    checkGridEmpty();
}


/** Hides the drop preview slot */
function hideDropPreviewInGrid() {
    const previewSlot = getDropPreviewSlot();
    if (previewSlot && previewSlot.parentElement) {
        // Instead of removing, hide smoothly? Or just remove. Let's remove for simplicity.
         previewSlot.remove();
         // previewSlot.classList.add('hidden');
         // setTimeout(() => { if(previewSlot.classList.contains('hidden')) previewSlot.remove(); }, 200);
    }
    if(targetSlotIndex !== -1) {
        targetSlotIndex = -1;
    }
    checkGridEmpty();
}

// --- Palette Preview Logic (No changes needed) ---
function generatePreviewContentHTML(analysisType) { /* ... */
    switch (analysisType) { case 'attendance-trends': return `<span class="preview-title">Attendance Trends Example</span><div class="preview-content"><img src="/static/img/placeholder-line-chart.png" alt="Line chart preview" style="max-width: 100%; height: auto; opacity: 0.7;"><p>Shows event attendance over time.</p></div>`; case 'active-groups': return `<span class="preview-title">Active Groups Example</span><div class="preview-content" style="font-size: 0.9em; color: #ddd;"><ol style="margin: 5px 0 0 15px; padding: 0; text-align: left;"><li>Top Group (25)</li><li>Second Group (18)</li><li>Another One (15)</li></ol><p style="font-size: 0.8em; margin-top: 8px; color: #ccc;">Ranks groups by recent activity.</p></div>`; case 'rsvp-distribution': return `<span class="preview-title">RSVP Distribution Example</span><div class="preview-content"><img src="/static/img/placeholder-pie-chart.png" alt="Pie chart preview" style="max-width: 80%; height: auto; margin: 5px auto; display: block; opacity: 0.7;"><p>Typical Going/Maybe/No breakdown.</p></div>`; case 'busy-periods': return `<span class="preview-title">Busy Periods Example</span><div class="preview-content"><img src="/static/img/placeholder-heatmap.png" alt="Heatmap preview" style="max-width: 100%; height: auto; opacity: 0.7;"><p>Highlights days with high event density.</p></div>`; default: return `<span class="preview-title">${analysisType.replace(/-/g, ' ')} Example</span><div class="preview-content"><p>Preview not available.</p></div>`; }
 }
function showPalettePreview(targetPaletteItem) { /* ... */
    if (!palettePreviewContainer || !targetPaletteItem || isDragging) return; clearTimeout(previewHideTimeout); previewHideTimeout = null; const analysisType = targetPaletteItem.dataset.analysisType; if (!analysisType) return; const previewHTML = generatePreviewContentHTML(analysisType); palettePreviewContainer.innerHTML = previewHTML; const itemRect = targetPaletteItem.getBoundingClientRect(); palettePreviewContainer.style.visibility = 'hidden'; palettePreviewContainer.style.display = 'block'; const containerRect = palettePreviewContainer.getBoundingClientRect(); palettePreviewContainer.style.display = ''; palettePreviewContainer.style.visibility = ''; let top = itemRect.top - containerRect.height - 10; let left = itemRect.left + (itemRect.width / 2) - (containerRect.width / 2); if (top < 10) top = itemRect.bottom + 10; if (left < 10) left = 10; if (left + containerRect.width > window.innerWidth - 10) { left = window.innerWidth - containerRect.width - 10; } palettePreviewContainer.style.top = `${top}px`; palettePreviewContainer.style.left = `${left}px`; palettePreviewContainer.classList.add('visible');
}
function scheduleHidePalettePreview() { /* ... */ clearTimeout(previewHideTimeout); previewHideTimeout = setTimeout(hidePalettePreview, PREVIEW_HIDE_DELAY); }
function hidePalettePreview() { /* ... */ clearTimeout(previewHideTimeout); previewHideTimeout = null; if (palettePreviewContainer) { palettePreviewContainer.classList.remove('visible'); } }
function cancelHidePreview() { /* ... */ clearTimeout(previewHideTimeout); previewHideTimeout = null; }


// --- Event Handlers ---

/** Handles pointer down to initiate drag */
function onPointerDown(event) {
    if (event.target.closest('.panel-actions, .add-analysis-btn')) return;
    if (event.button !== 0) return;

    const panelHeader = event.target.closest('.panel-header');
    const paletteItem = event.target.closest('.palette-item');

    if (panelHeader) {
        startGridDrag(event, panelHeader.closest('.insight-panel'));
    } else if (paletteItem) {
        startPaletteDrag(event, paletteItem);
    }
}

/** Initiates drag from a Grid Panel */
function startGridDrag(event, panel) {
    if (!panel || isDragging) return;
    event.preventDefault();
    event.stopPropagation();

    isDragging = true;
    dragType = 'grid';
    sourceElement = panel; // The original panel

    calculateGridCellLayout();
    sourceIndex = findNearestSlotIndex(
        panel.offsetLeft + panel.offsetWidth / 2,
        panel.offsetTop + panel.offsetHeight / 2
    );
     if (sourceIndex === -1) { // Safety check if layout is weird
         console.warn("Could not determine source index for drag start.");
         isDragging = false;
         return;
     }

    const rect = sourceElement.getBoundingClientRect();
    startClientX = event.clientX;
    startClientY = event.clientY;
    offsetX = startClientX - rect.left;
    offsetY = startClientY - rect.top;

    // Create the visual clone
    draggedElementClone = sourceElement.cloneNode(true);
    draggedElementClone.classList.add('dragging-clone'); // Use specific class for clone
    // Apply dragging styles via CSS (.dragging-clone)
    draggedElementClone.style.left = `${rect.left}px`;
    draggedElementClone.style.top = `${rect.top}px`;
    draggedElementClone.style.width = `${rect.width}px`;
    draggedElementClone.style.height = `${rect.height}px`;
    document.body.appendChild(draggedElementClone);

    // Apply placeholder style to the original source element
    sourceElement.classList.add('dragging-source');
    targetSlotIndex = sourceIndex; // Initially target is source

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
    sourceElement = item; // The palette item is the conceptual source
    sourceIndex = -1;     // No source index for palette items

    const analysisType = item.dataset.analysisType;
    const title = item.dataset.title;
    const description = item.dataset.description;
    const placeholderHTML = item.dataset.placeholderHtml || '<p>Loading...</p>';
    if (!analysisType || !title) { isDragging = false; return; }

    // Create the panel *clone* directly (no original in grid yet)
    const panelHTML = createInsightPanelHTML(analysisType, title, description, placeholderHTML);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = panelHTML.trim();
    draggedElementClone = tempDiv.firstChild; // This is the panel to drag

    calculateGridCellLayout();
    const cellWidth = gridCellLayout.length > 0 ? gridCellLayout[0].width : 300;
    const cellHeight = gridCellLayout.length > 0 ? gridCellLayout[0].height : 250;

    draggedElementClone.classList.add('dragging-clone'); // Style as the clone
    draggedElementClone.style.width = `${cellWidth}px`;
    draggedElementClone.style.height = `${cellHeight}px`;
    document.body.appendChild(draggedElementClone);

    startClientX = event.clientX;
    startClientY = event.clientY;
    offsetX = cellWidth * 0.15;
    offsetY = cellHeight * 0.15;

    draggedElementClone.style.left = `${startClientX - offsetX}px`;
    draggedElementClone.style.top = `${startClientY - offsetY}px`;

    hidePalettePreview();

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp, { once: true });
}

/** Handles pointer movement during drag */
function onPointerMove(event) {
    if (!isDragging || !draggedElementClone) return;

    const currentClientX = event.clientX;
    const currentClientY = event.clientY;

    cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(() => {
        // Update visual clone position
        draggedElementClone.style.left = `${currentClientX - offsetX}px`;
        draggedElementClone.style.top = `${currentClientY - offsetY}px`;

        // Calculate pointer position relative to grid content
        gridRect = insightsGridContainer.getBoundingClientRect();
        const pointerXInGridContent = currentClientX - gridRect.left + insightsGridContainer.scrollLeft;
        const pointerYInGridContent = currentClientY - gridRect.top + insightsGridContainer.scrollTop;

        const isOverGrid = currentClientX >= gridRect.left && currentClientX <= gridRect.right &&
                           currentClientY >= gridRect.top && currentClientY <= gridRect.bottom;

        let nearestIndex = -1;
        if (isOverGrid) {
            nearestIndex = findNearestSlotIndex(pointerXInGridContent, pointerYInGridContent);
        }

        // --- Update Visual State based on nearestIndex ---

        if (nearestIndex !== targetSlotIndex) { // Target slot has changed
            hideDropPreviewInGrid(); // Hide preview at old position
            resetShiftedPanel();     // Reset any previously shifted panel

            if (nearestIndex !== -1) { // Moved to a valid new slot
                 showDropPreviewInGrid(nearestIndex); // Show preview at new position

                const panelAtTarget = getPanelElementAtSlotIndex(nearestIndex);
                 if (panelAtTarget && panelAtTarget !== sourceElement) {
                     shiftPanelAside(panelAtTarget); // Shift panel if it's occupied by another
                 }

                 // Manage source placeholder visibility
                 if (dragType === 'grid' && sourceElement) {
                     sourceElement.classList.toggle('over-source-slot', nearestIndex === sourceIndex);
                 }

            } else { // Moved off the grid
                 targetSlotIndex = -1;
                 if (dragType === 'grid' && sourceElement) {
                     sourceElement.classList.remove('over-source-slot'); // Ensure not highlighted if off-grid
                 }
            }
        }
        // If nearestIndex is the same as targetSlotIndex, no visual state change needed
    });
}


/** Handles pointer up event to end dragging */
function onPointerUp(event) {
    if (!isDragging) return; // Check isDragging flag first
    cancelAnimationFrame(animationFrameId);

    const finalTargetIndex = targetSlotIndex; // Where the preview was shown

    // --- Cleanup Visuals ---
    if (draggedElementClone) {
        draggedElementClone.remove(); // Remove the clone immediately
        draggedElementClone = null;
    }
    hideDropPreviewInGrid(); // Remove the preview slot
    resetShiftedPanel();     // Reset any shifted panel

    if (sourceElement && dragType === 'grid') {
        sourceElement.classList.remove('dragging-source', 'over-source-slot'); // Restore original panel appearance
    }

    // --- Perform Drop Action ---
    if (finalTargetIndex !== -1) { // Dropped on a valid grid slot
        if (dragType === 'palette') {
            // Create the *actual* new panel element from the palette item data
            const analysisType = sourceElement.dataset.analysisType;
            const title = sourceElement.dataset.title;
            const description = sourceElement.dataset.description;
            const placeholderHTML = sourceElement.dataset.placeholderHtml || '';
            const panelHTML = createInsightPanelHTML(analysisType, title, description, placeholderHTML);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = panelHTML.trim();
            const newPanel = tempDiv.firstChild;

            // Insert the new panel at the correct position
            insertElementAtIndex(newPanel, finalTargetIndex);
            makePanelDraggable(newPanel);
            addPanelActionListeners(newPanel);

        } else if (dragType === 'grid' && sourceElement) {
            if (finalTargetIndex !== sourceIndex) {
                // Move the original source element to the new position
                console.log(`Moving panel from index ${sourceIndex} to ${finalTargetIndex}`);
                insertElementAtIndex(sourceElement, finalTargetIndex);
            } else {
                 console.log("Dropped back onto original position. No move needed.");
                 // No DOM change needed, classes already reset
            }
        }

    } else { // Dropped outside the grid
        console.log("Drop outside grid.");
        // No action needed for palette drags dropped outside.
        // For grid drags, the sourceElement classes were already reset.
    }

    // --- Final State Reset ---
    isDragging = false;
    // draggedElementClone removed above
    sourceElement = null;
    sourceIndex = -1;
    dragType = null;
    targetSlotIndex = -1;
    // currentlyShiftedPanel reset above
    document.removeEventListener('pointermove', onPointerMove);

    // Recalculate layout AFTER the DOM manipulation has likely settled
    setTimeout(() => {
        calculateGridCellLayout();
        checkGridEmpty();
    }, 50); // Allow short time for CSS grid reflow
}

/** Helper to insert an element at a specific visual index in the grid */
function insertElementAtIndex(elementToInsert, targetIndex) {
    const currentPanels = Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-clone)'));
     // Find the element that currently IS (or should be) at the target index or later
    let referenceNode = null;

     // Simple approach: find the Nth child (where N = targetIndex)
     if (targetIndex < currentPanels.length) {
         // Need to account for the element being moved if it's already in the list
         let count = 0;
         for(let i = 0; i < currentPanels.length; i++) {
             if (currentPanels[i] === elementToInsert) continue; // Skip the element itself
             if(count === targetIndex) {
                 referenceNode = currentPanels[i];
                 break;
             }
             count++;
         }
         // If we are inserting at the very end position targetIndex will equal count after loop
         if(!referenceNode && count === targetIndex) {
             referenceNode = null; // Means append at the end
         }

     } // If targetIndex >= currentPanels.length, referenceNode remains null (append)


    // Perform insertion
    if (referenceNode) {
        // Check if element is already before reference node, avoid redundant insert
        if (elementToInsert.nextElementSibling !== referenceNode) {
             insightsGrid.insertBefore(elementToInsert, referenceNode);
        }
    } else {
        // Check if element is already last, avoid redundant append
        if (insightsGrid.lastElementChild !== elementToInsert || insightsGrid.lastElementChild !== emptyMessage ) {
            if (emptyMessage && emptyMessage.parentElement === insightsGrid) {
                 insightsGrid.insertBefore(elementToInsert, emptyMessage);
            } else {
                 insightsGrid.appendChild(elementToInsert);
            }
        }
    }
}


/** Handles palette collapse/expand */
function handlePaletteToggle() { /* ... (no changes) ... */
    if (!palette || !paletteToggleBtn) return;
    const isCollapsed = palette.classList.toggle('collapsed');
    insightsView?.classList.toggle('palette-collapsed', isCollapsed);
    paletteToggleBtn.setAttribute('aria-label', isCollapsed ? 'Expand Palette' : 'Collapse Palette');
    paletteToggleBtn.setAttribute('title', isCollapsed ? 'Expand Palette' : 'Collapse Palette');
    const icon = paletteToggleBtn.querySelector('i');
    if (icon) icon.className = `fas ${isCollapsed ? 'fa-chevron-up' : 'fa-chevron-down'}`;
    setTimeout(calculateGridCellLayout, 350);
}

/** Handles clicks on panel action buttons (delegated) */
function handlePanelAction(event) { /* ... (no changes) ... */
    const removeButton = event.target.closest('.remove-panel-btn');
    const shareButton = event.target.closest('.share-panel-btn');
    const panel = event.target.closest('.insight-panel');
    if (!panel) return;
    if (removeButton) {
        panel.remove();
        setTimeout(() => { calculateGridCellLayout(); checkGridEmpty(); }, 50);
    } else if (shareButton) {
        alert(`Sharing panel '${panel.querySelector('.panel-title')?.textContent || 'N/A'}' (not implemented)`);
    }
}

/** Attaches pointerdown listener */
function makePanelDraggable(panelElement) { /* ... (no changes) ... */
    const header = panelElement.querySelector('.panel-header');
    if (header) { header.removeEventListener('pointerdown', onPointerDown); header.addEventListener('pointerdown', onPointerDown); }
}

/** Attaches delegated action listeners */
function addPanelActionListeners(panelElement) { /* ... (no changes needed - handled by grid delegation) ... */ }


// --- Initialization ---

/** Sets up all event listeners */
function setupEventListeners() { /* ... (no changes to listener setup logic) ... */
    if (!insightsView) return;
    if (paletteHeader) { paletteHeader.addEventListener('click', (event) => { if (event.target.closest('button') && event.target !== paletteToggleBtn) return; handlePaletteToggle(); }); } else { console.warn("Palette header not found."); }
    if (paletteScrollContainer) { paletteScrollContainer.addEventListener('pointerdown', onPointerDown); paletteScrollContainer.addEventListener('mouseover', (event) => { if (isDragging) return; const targetItem = event.target.closest('.palette-item'); if (targetItem) showPalettePreview(targetItem); }); paletteScrollContainer.addEventListener('mouseout', (event) => { if (isDragging) return; const targetItem = event.target.closest('.palette-item'); const relatedTarget = event.relatedTarget; if (targetItem && !targetItem.contains(relatedTarget) && !palettePreviewContainer?.contains(relatedTarget)) { scheduleHidePalettePreview(); } }); if(palettePreviewContainer) { palettePreviewContainer.addEventListener('mouseenter', cancelHidePreview); palettePreviewContainer.addEventListener('mouseleave', scheduleHidePalettePreview); } } else { console.warn("Palette scroll container not found."); }
    if (insightsGrid) { insightsGrid.addEventListener('click', handlePanelAction); insightsGrid.addEventListener('pointerdown', onPointerDown); insightsGrid.querySelectorAll('.insight-panel').forEach(makePanelDraggable); } else { console.warn("Insights grid not found."); }
    window.addEventListener('resize', debounce(() => { if (!isDragging) { console.log("Window resized, recalculating grid layout..."); calculateGridCellLayout(); /* No need to reposition preview/shift explicitly here as move handler will catch up */ } }, 250));
    console.log("Insights event listeners attached (V5 Shift/Refined).");
}

/** Simple debounce utility */
function debounce(func, wait) { /* ... (no changes) ... */ let timeout; return function executedFunction(...args) { const later = () => { clearTimeout(timeout); func(...args); }; clearTimeout(timeout); timeout = setTimeout(later, wait); }; };

/** Main initialization function */
export function initInsightsManager() { /* ... (no changes) ... */
    console.log("Initializing Insights Manager (V5 Shift/Refined)...");
    insightsView = document.getElementById('insights-view');
    insightsGridContainer = insightsView?.querySelector('.insights-grid-container');
    insightsGrid = document.getElementById('insights-grid');
    palette = document.getElementById('analysis-palette');
    paletteHeader = document.getElementById('palette-header');
    paletteToggleBtn = document.getElementById('palette-toggle-btn');
    paletteScrollContainer = document.getElementById('palette-scroll-container');
    emptyMessage = insightsGrid?.querySelector('.insights-empty-message');
    palettePreviewContainer = document.getElementById('palette-preview-container');
    if (!insightsView || !insightsGridContainer || !insightsGrid || !palette || !palettePreviewContainer || !paletteScrollContainer || !paletteHeader || !emptyMessage) { console.error("Insights view or critical child elements not found."); return; }
    calculateGridCellLayout(); checkGridEmpty(); setupEventListeners();
    console.log("Insights Manager Initialized Successfully (V5 Shift/Refined).");
}

// --- END OF FILE insightsManager.js ---