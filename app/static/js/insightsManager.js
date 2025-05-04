// --- START OF FILE insightsManager.js ---

// DOM Elements & State
let insightsView = null, insightsGridContainer = null, insightsGrid = null, palette = null, paletteHeader = null, paletteToggleBtn = null, paletteScrollContainer = null, emptyMessage = null, palettePreviewContainer = null;

let isDragging = false;
let draggedElementClone = null; // The visual clone following the mouse
let sourceElement = null;       // The original panel being dragged (or a temporary panel for palette drag)
let sourceIndex = -1;           // Grid index of the sourceElement placeholder
let dragType = null;            // 'grid' or 'palette'
let startClientX = 0, startClientY = 0, offsetX = 0, offsetY = 0;
let gridRect = null;
let gridCellLayout = [];
let currentTargetIndex = -1;      // Index where the placeholder *should* be
let animationFrameId = null;
let placeholderElement = null; // The element acting as the placeholder in the grid

// Palette Preview State
let previewHideTimeout = null;
const PREVIEW_HIDE_DELAY = 150;
// *** Gap between the PREVIEW'S BOTTOM edge and the PALETTE'S TOP edge ***
const PREVIEW_GAP_ABOVE_PALETTE = 0; // Adjust as needed

// Constants
const DRAG_SCALE = 0.95;
const GRID_COLS = 2;
const SCROLL_THRESHOLD = 40;
const SCROLL_SPEED_MULTIPLIER = 0.15;
const SCROLL_END_TOLERANCE = 5;

// --- Helper Functions ---

function generateUniqueId(prefix = 'panel') { return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`; }
function createInsightPanelHTML(analysisType, title, description, placeholderContent) { const panelId = generateUniqueId(analysisType); const decodedPlaceholder = placeholderContent.replace(/</g, '<').replace(/>/g, '>'); return `<div class="insight-panel glassy" data-panel-id="${panelId}" data-analysis-type="${analysisType}"><div class="panel-header" draggable="false"> <span class="panel-title">${title}</span> <div class="panel-actions"> <button class="panel-action-btn share-panel-btn" aria-label="Share Analysis" title="Share"><i class="fas fa-share-alt"></i></button> <button class="panel-action-btn remove-panel-btn" aria-label="Remove Analysis" title="Remove"><i class="fas fa-times"></i></button> </div> </div><div class="panel-content"> <p>${description}</p> <div class="placeholder-chart">${decodedPlaceholder}</div> </div></div>`; }
function checkGridEmpty() { if (!insightsGrid || !emptyMessage) return; const hasContent = insightsGrid.querySelector('.insight-panel:not(.dragging-placeholder)'); emptyMessage.style.display = hasContent ? 'none' : 'block'; }
function calculateGridCellLayout() { /* ... (No changes needed) ... */ if (!insightsGrid || !insightsGridContainer) return; gridCellLayout = []; const gridStyle = window.getComputedStyle(insightsGrid); const colCount = parseInt(gridStyle.gridTemplateColumns.split(' ').length) || GRID_COLS; /* Dynamic based on CSS */ const rowGap = parseInt(gridStyle.gap) || 25; const colGap = parseInt(gridStyle.gap) || 25; const gridWidth = insightsGrid.offsetWidth - parseInt(gridStyle.paddingLeft) - parseInt(gridStyle.paddingRight); if (!gridWidth || gridWidth <= 0 || colCount <= 0) return; const cellWidth = Math.max(0, (gridWidth - (colCount - 1) * colGap) / colCount); let cellHeight = 0; const firstPanel = insightsGrid.querySelector('.insight-panel:not(.dragging-placeholder)'); if (firstPanel && firstPanel.offsetHeight > 0) { cellHeight = firstPanel.offsetHeight; } else if (gridCellLayout.length > 0 && gridCellLayout[0].height > 0) { cellHeight = gridCellLayout[0].height; /* Use previous if available */} else { const aspectRatio = 1 / 0.85; cellHeight = cellWidth / aspectRatio; } if(cellHeight <= 0 || !isFinite(cellHeight)) cellHeight = 200; const visiblePanels = Array.from(insightsGrid.children).filter(el => el.classList.contains('insight-panel') && !el.classList.contains('dragging-placeholder')); const visiblePanelCount = visiblePanels.length + (placeholderElement && placeholderElement.parentElement ? 1 : 0); const estimatedRows = Math.max(1, Math.ceil((visiblePanelCount) / colCount)); let currentX = parseInt(gridStyle.paddingLeft) || 0; let currentY = parseInt(gridStyle.paddingTop) || 0; for (let r = 0; r < estimatedRows; r++) { currentX = parseInt(gridStyle.paddingLeft) || 0; for (let c = 0; c < colCount; c++) { gridCellLayout.push({ x: currentX, y: currentY, width: cellWidth, height: cellHeight }); currentX += cellWidth + colGap; } currentY += cellHeight + rowGap; } /* Add an extra row for dropping at the end */ currentX = parseInt(gridStyle.paddingLeft) || 0; for (let c = 0; c < colCount; c++) { gridCellLayout.push({ x: currentX, y: currentY, width: cellWidth, height: cellHeight }); currentX += cellWidth + colGap; } }
function findNearestSlotIndex(pointerX, pointerY) { /* ... (No changes needed) ... */ let closestIndex = -1; let minDistSq = Infinity; if (!gridCellLayout || gridCellLayout.length === 0) return -1; gridCellLayout.forEach((slot, index) => { const inX = pointerX >= slot.x && pointerX <= slot.x + slot.width; const inY = pointerY >= slot.y && pointerY <= slot.y + slot.height; if (inX && inY) { closestIndex = index; minDistSq = 0; return; } if (minDistSq > 0) { const slotCenterX = slot.x + slot.width / 2; const slotCenterY = slot.y + slot.height / 2; const distSq = (pointerX - slotCenterX) ** 2 + (pointerY - slotCenterY) ** 2; if (distSq < minDistSq) { minDistSq = distSq; closestIndex = index; } } }); const maxIndex = insightsGrid.querySelectorAll('.insight-panel').length; return Math.min(closestIndex, maxIndex); }

// --- Palette Preview Logic ---
function generatePreviewContentHTML(analysisType) { /* ... (No changes needed from V10) ... */ switch (analysisType) { case 'attendance-trends': return `<h3 class="preview-title">Attendance Trends Example</h3><div class="preview-content"><img src="/static/img/placeholder-line-chart.png" alt="Line chart preview"><p>Shows event attendance rate over time. Helps identify popular event types or seasonal changes.</p></div>`; case 'active-groups': return `<h3 class="preview-title">Active Groups Example</h3><div class="preview-content" style="text-align: left; padding: 0 10px;"><ol style="margin: 5px 0 0 20px; padding: 0;"><li>Event Planners Inc. (31)</li><li>Weekend Warriors (25)</li><li>Downtown Meetups (18)</li><li>Board Game Geeks (12)</li></ol><p style="margin-top: 10px; font-size: 0.85em; color: #ccc;">Ranks groups by the number of upcoming events created recently.</p></div>`; case 'rsvp-distribution': return `<h3 class="preview-title">RSVP Distribution Example</h3><div class="preview-content"><img src="/static/img/placeholder-pie-chart.png" alt="Pie chart preview" style="max-width: 70%; max-height: 100px;"><p>Analyzes the typical breakdown of 'Going', 'Maybe', and 'Not Going' RSVPs across events.</p></div>`; case 'busy-periods': return `<h3 class="preview-title">Busy Periods Example</h3><div class="preview-content"><img src="/static/img/placeholder-heatmap.png" alt="Heatmap preview" style="max-height: 120px;"><p>Highlights upcoming dates or days of the week with a high density of scheduled events.</p></div>`; default: return `<h3 class="preview-title">${analysisType.replace(/-/g, ' ')} Example</h3><div class="preview-content"><p>Preview information not available for this analysis type.</p></div>`; } }

function showPalettePreview(targetPaletteItem) {
    if (!palettePreviewContainer || !targetPaletteItem || isDragging || !palette) return;

    clearTimeout(previewHideTimeout);
    previewHideTimeout = null;

    const analysisType = targetPaletteItem.dataset.analysisType;
    if (!analysisType) return;

    const previewHTML = generatePreviewContentHTML(analysisType);
    palettePreviewContainer.innerHTML = previewHTML;

    // --- Calculate Position ---
    // Measure dimensions *before* applying final position to avoid transition jumpiness
    palettePreviewContainer.style.transition = 'none'; // Temporarily disable transitions
    palettePreviewContainer.style.visibility = 'hidden'; // Still hidden
    palettePreviewContainer.style.display = 'block'; // Force layout calculation
    const previewRect = palettePreviewContainer.getBoundingClientRect();
    const itemRect = targetPaletteItem.getBoundingClientRect();
    const paletteRect = palette.getBoundingClientRect();

    // Horizontal: Center ABOVE the hovered ITEM
    let left = (itemRect.left + itemRect.width / 2) - (previewRect.width / 2);

    // Boundary Checks for left/right
    const viewportPadding = 10; // Space from viewport edges
    if (left < viewportPadding) { // Prevent going off-screen left
        left = viewportPadding;
    }
    if (left + previewRect.width > window.innerWidth - viewportPadding) { // Prevent going off-screen right
        left = window.innerWidth - previewRect.width - viewportPadding;
    }

    // --- Anchor preview by bottom instead of top ---
    // Remove or comment out the old top calculation
    // let top = paletteRect.top - previewRect.height - PREVIEW_GAP_ABOVE_PALETTE;
    // if (top < viewportPadding) { top = viewportPadding; }
    // palettePreviewContainer.style.top = `${top}px`;

    // New: anchor by bottom (align with palette item instead of full palette container)
    const bottom = window.innerHeight - itemRect.top + PREVIEW_GAP_ABOVE_PALETTE;
    palettePreviewContainer.style.top = 'auto';
    palettePreviewContainer.style.bottom = `${bottom}px`;

    // Apply final styles and make visible
    palettePreviewContainer.style.left = `${left}px`;
    palettePreviewContainer.style.display = ''; // Reset display
    palettePreviewContainer.style.visibility = 'visible'; // Now make visible

    // Force browser reflow before re-enabling transitions
    void palettePreviewContainer.offsetWidth;

    // Re-enable transitions and add 'visible' class for animations
    palettePreviewContainer.style.transition = ''; // Re-enable CSS transitions
    palettePreviewContainer.classList.add('visible');
}

function scheduleHidePalettePreview() { /* ... (No change) ... */ clearTimeout(previewHideTimeout); previewHideTimeout = setTimeout(hidePalettePreview, PREVIEW_HIDE_DELAY); }
function hidePalettePreview() { /* ... (No change) ... */ clearTimeout(previewHideTimeout); previewHideTimeout = null; if (palettePreviewContainer) { palettePreviewContainer.classList.remove('visible'); } }
function cancelHidePreview() { /* ... (No change) ... */ clearTimeout(previewHideTimeout); previewHideTimeout = null; }

// --- Event Handlers ---

function onPointerDown(event) { /* ... (No change) ... */ if (event.target.closest('.panel-actions button, .add-analysis-btn')) { return; } if (event.button !== 0 && event.pointerType !== 'touch') return; const panelHeader = event.target.closest('.panel-header'); const paletteItem = event.target.closest('.palette-item'); if (panelHeader) { const panel = panelHeader.closest('.insight-panel'); if (panel && !panel.classList.contains('dragging-placeholder')) { startGridDrag(event, panel); } } else if (paletteItem) { startPaletteDrag(event, paletteItem); } }
function startGridDrag(event, panel) { /* ... (No change) ... */ if (!panel || isDragging) return; event.preventDefault(); event.stopPropagation(); hidePalettePreview(); isDragging = true; dragType = 'grid'; sourceElement = panel; placeholderElement = sourceElement; calculateGridCellLayout(); const panelRect = placeholderElement.getBoundingClientRect(); const gridContainerRect = insightsGridContainer.getBoundingClientRect(); const initialX = (panelRect.left - gridContainerRect.left + insightsGridContainer.scrollLeft) + panelRect.width / 2; const initialY = (panelRect.top - gridContainerRect.top + insightsGridContainer.scrollTop) + panelRect.height / 2; sourceIndex = findNearestSlotIndex(initialX, initialY); currentTargetIndex = sourceIndex; if (sourceIndex === -1) { console.warn("Could not determine source index for grid drag."); isDragging = false; return; } placeholderElement.classList.add('dragging-placeholder'); const rect = sourceElement.getBoundingClientRect(); startClientX = event.clientX; startClientY = event.clientY; offsetX = startClientX - rect.left; offsetY = startClientY - rect.top; draggedElementClone = sourceElement.cloneNode(true); draggedElementClone.classList.remove('dragging-placeholder'); draggedElementClone.classList.add('dragging-clone'); draggedElementClone.style.left = `${rect.left}px`; draggedElementClone.style.top = `${rect.top}px`; draggedElementClone.style.width = `${rect.width}px`; draggedElementClone.style.height = `${rect.height}px`; document.body.appendChild(draggedElementClone); document.addEventListener('pointermove', onPointerMove); document.addEventListener('pointerup', onPointerUp, { once: true }); }
function startPaletteDrag(event, item) { /* ... (No change) ... */ if (!item || isDragging) return; event.preventDefault(); event.stopPropagation(); hidePalettePreview(); isDragging = true; dragType = 'palette'; sourceElement = item; sourceIndex = -1; const analysisType = item.dataset.analysisType; const title = item.dataset.title; const description = item.dataset.description; const placeholderHTML = item.dataset.placeholderHtml || '<p>Loading...</p>'; if (!analysisType || !title) { console.warn("Missing data on palette item."); isDragging = false; return; } placeholderElement = document.createElement('div'); placeholderElement.className = 'insight-panel dragging-placeholder'; calculateGridCellLayout(); /* Calculate layout first to get dimensions */ const cellWidth = gridCellLayout.length > 0 ? gridCellLayout[0].width : 300; const cellHeight = gridCellLayout.length > 0 ? gridCellLayout[0].height : 250; placeholderElement.style.width = `${cellWidth}px`; placeholderElement.style.height = `${cellHeight}px`; const panelHTML = createInsightPanelHTML(analysisType, title, description, placeholderHTML); const tempDiv = document.createElement('div'); tempDiv.innerHTML = panelHTML.trim(); draggedElementClone = tempDiv.firstChild; draggedElementClone.classList.add('dragging-clone'); draggedElementClone.style.width = `${cellWidth}px`; draggedElementClone.style.height = `${cellHeight}px`; document.body.appendChild(draggedElementClone); startClientX = event.clientX; startClientY = event.clientY; offsetX = cellWidth * 0.15; /* Adjust offset for better grab point */ offsetY = cellHeight * 0.15; draggedElementClone.style.left = `${startClientX - offsetX}px`; draggedElementClone.style.top = `${startClientY - offsetY}px`; draggedElementClone.style.setProperty('--drag-scale', DRAG_SCALE); document.addEventListener('pointermove', onPointerMove); document.addEventListener('pointerup', onPointerUp, { once: true }); }
function onPointerMove(event) { /* ... (No change) ... */ if (!isDragging || !draggedElementClone || !placeholderElement) return; const currentClientX = event.clientX; const currentClientY = event.clientY; cancelAnimationFrame(animationFrameId); animationFrameId = requestAnimationFrame(() => { draggedElementClone.style.left = `${currentClientX - offsetX}px`; draggedElementClone.style.top = `${currentClientY - offsetY}px`; gridRect = insightsGridContainer.getBoundingClientRect(); const pointerX = currentClientX - gridRect.left + insightsGridContainer.scrollLeft; const pointerY = currentClientY - gridRect.top + insightsGridContainer.scrollTop; const isOverGrid = currentClientX >= gridRect.left && currentClientX <= gridRect.right && currentClientY >= gridRect.top && currentClientY <= gridRect.bottom; let nearestIndex = -1; if (isOverGrid) { nearestIndex = findNearestSlotIndex(pointerX, pointerY); } if (isOverGrid) { if (!placeholderElement.parentElement) { const targetDomIndex = Math.max(0, nearestIndex); insertElementAtIndex(placeholderElement, targetDomIndex); sourceIndex = targetDomIndex; currentTargetIndex = targetDomIndex; requestAnimationFrame(calculateGridCellLayout); } else if (nearestIndex !== -1 && nearestIndex !== sourceIndex) { insertElementAtIndex(placeholderElement, nearestIndex); sourceIndex = nearestIndex; currentTargetIndex = nearestIndex; requestAnimationFrame(calculateGridCellLayout); } else { currentTargetIndex = nearestIndex; } } else { if (placeholderElement.parentElement) { placeholderElement.remove(); sourceIndex = -1; requestAnimationFrame(calculateGridCellLayout); } currentTargetIndex = -1; } if (isOverGrid && placeholderElement.parentElement) { const placeholderRect = placeholderElement.getBoundingClientRect(); const panelCount = insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder)').length; const isAddingToEnd = nearestIndex >= panelCount; const isScrolledToBottom = insightsGridContainer.scrollHeight - insightsGridContainer.scrollTop - insightsGridContainer.clientHeight < SCROLL_END_TOLERANCE; if (isAddingToEnd && !isScrolledToBottom) { const bottomDiff = placeholderRect.bottom - (gridRect.bottom - SCROLL_THRESHOLD); if (bottomDiff > 0) { const scrollAmount = Math.max(5, Math.min(30, bottomDiff * SCROLL_SPEED_MULTIPLIER)); insightsGridContainer.scrollTop += scrollAmount; } } const topDiff = (gridRect.top + SCROLL_THRESHOLD) - placeholderRect.top; if (topDiff > 0) { const scrollAmount = Math.max(5, Math.min(30, topDiff * SCROLL_SPEED_MULTIPLIER)); insightsGridContainer.scrollTop -= scrollAmount; } } checkGridEmpty(); }); }
function onPointerUp(event) { /* ... (No change) ... */ if (!isDragging) return; cancelAnimationFrame(animationFrameId); if (draggedElementClone) { draggedElementClone.remove(); draggedElementClone = null; } const droppedInsideGrid = currentTargetIndex !== -1 && placeholderElement && placeholderElement.parentElement; if (droppedInsideGrid) { if (dragType === 'palette') { const analysisType = sourceElement.dataset.analysisType; const title = sourceElement.dataset.title; const description = sourceElement.dataset.description; const placeholderHTML = sourceElement.dataset.placeholderHtml || ''; const panelHTML = createInsightPanelHTML(analysisType, title, description, placeholderHTML); const tempDiv = document.createElement('div'); tempDiv.innerHTML = panelHTML.trim(); const newPanel = tempDiv.firstChild; insightsGrid.replaceChild(newPanel, placeholderElement); makePanelDraggable(newPanel); /* No need to add listeners here, handled by delegation */ } else if (dragType === 'grid' && sourceElement) { sourceElement.classList.remove('dragging-placeholder'); sourceElement.style.opacity = ''; sourceElement.style.visibility = ''; sourceElement.style.border = ''; sourceElement.style.outline = ''; } } else { if (dragType === 'grid' && sourceElement) { sourceElement.classList.remove('dragging-placeholder'); sourceElement.style.opacity = ''; sourceElement.style.visibility = ''; sourceElement.style.border = ''; sourceElement.style.outline = ''; } if(placeholderElement && placeholderElement.parentElement){ placeholderElement.remove(); } } isDragging = false; sourceElement = null; placeholderElement = null; sourceIndex = -1; dragType = null; currentTargetIndex = -1; document.removeEventListener('pointermove', onPointerMove); setTimeout(() => { calculateGridCellLayout(); checkGridEmpty(); }, 50); }
function insertElementAtIndex(elementToInsert, targetIndex) { /* ... (No change) ... */ const children = Array.from(insightsGrid.children).filter(el => el !== elementToInsert && el !== emptyMessage); if (targetIndex < 0) targetIndex = 0; if (targetIndex < children.length) { const referenceNode = children[targetIndex]; if (elementToInsert.nextElementSibling !== referenceNode) { insightsGrid.insertBefore(elementToInsert, referenceNode); } } else { const currentLastVisible = children[children.length - 1]; if (elementToInsert !== currentLastVisible) { if (emptyMessage && emptyMessage.parentElement === insightsGrid) { insightsGrid.insertBefore(elementToInsert, emptyMessage); } else { insightsGrid.appendChild(elementToInsert); } } } }

// --- Event Listeners & Init ---
function handlePaletteToggle() { /* ... (No change) ... */ if (!palette || !paletteToggleBtn) return; hidePalettePreview(); const isCollapsed = palette.classList.toggle('collapsed'); insightsView?.classList.toggle('palette-collapsed', isCollapsed); paletteToggleBtn.setAttribute('aria-label', isCollapsed ? 'Expand Palette' : 'Collapse Palette'); paletteToggleBtn.setAttribute('title', isCollapsed ? 'Expand Palette' : 'Collapse Palette'); const icon = paletteToggleBtn.querySelector('i'); if (icon) icon.className = `fas ${isCollapsed ? 'fa-chevron-up' : 'fa-chevron-down'}`; setTimeout(calculateGridCellLayout, 350); }
function handlePanelAction(event) { /* ... (No change) ... */ const removeButton = event.target.closest('.remove-panel-btn'); const shareButton = event.target.closest('.share-panel-btn'); const panel = event.target.closest('.insight-panel'); if (!panel || panel.classList.contains('dragging-placeholder')) return; if (removeButton) { panel.remove(); setTimeout(() => { calculateGridCellLayout(); checkGridEmpty(); }, 50); } else if (shareButton) { alert(`Sharing panel '${panel.querySelector('.panel-title')?.textContent || 'N/A'}' (not implemented)`); } }
function makePanelDraggable(panelElement) { /* ... (No change) ... */ const header = panelElement.querySelector('.panel-header'); if (header) { header.removeEventListener('pointerdown', onPointerDown); header.addEventListener('pointerdown', onPointerDown); } else { console.warn("Panel header not found for making draggable:", panelElement); } }
// function addPanelActionListeners(panelElement) { /* ... (No change - handled by delegation) ... */ } // Removed as redundant
function setupEventListeners() { /* ... (Setup logic remains the same, updated log message) ... */ if (!insightsView) return; if (paletteHeader) { paletteHeader.addEventListener('click', (event) => { /* Prevents toggle when clicking palette item buttons */ if (event.target.closest('button') && event.target !== paletteToggleBtn && !paletteToggleBtn.contains(event.target)) return; handlePaletteToggle(); }); } else { console.warn("Palette header not found."); } if (paletteScrollContainer) { paletteScrollContainer.addEventListener('pointerdown', onPointerDown); paletteScrollContainer.addEventListener('mouseover', (event) => { if (isDragging) return; const targetItem = event.target.closest('.palette-item'); if (targetItem) { showPalettePreview(targetItem); } }); paletteScrollContainer.addEventListener('mouseout', (event) => { if (isDragging) return; const targetItem = event.target.closest('.palette-item'); const relatedTarget = event.relatedTarget; /* Check if moving off the item AND not onto the preview itself */ if (targetItem && !targetItem.contains(relatedTarget) && !palettePreviewContainer?.contains(relatedTarget)) { scheduleHidePalettePreview(); } }); /* Keep preview open if mouse moves onto it */ if (palettePreviewContainer) { palettePreviewContainer.addEventListener('mouseleave', (event) => { const relatedTarget = event.relatedTarget; /* Hide if mouse moves off preview AND not back onto a palette item */ if (!relatedTarget || !relatedTarget.closest('.palette-item')) { scheduleHidePalettePreview(); } }); palettePreviewContainer.addEventListener('mouseenter', cancelHidePreview); } } else { console.warn("Palette scroll container not found."); } if (insightsGrid) { /* Use event delegation for panel actions */ insightsGrid.addEventListener('click', handlePanelAction); /* Draggability needs direct listeners on headers */ insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder)').forEach(makePanelDraggable); /* Add pointerdown listener for grid dragging */ insightsGrid.addEventListener('pointerdown', onPointerDown); } else { console.warn("Insights grid not found."); } window.addEventListener('resize', debounce(() => { hidePalettePreview(); if (!isDragging) { calculateGridCellLayout(); } }, 250)); insightsGridContainer?.addEventListener('scroll', debounce(() => { if (!isDragging) { hidePalettePreview(); } }, 100)); console.log("Insights event listeners attached (V14.2 Palette Above Gap)."); }
function debounce(func, wait) { /* ... (No change) ... */ let timeout; return function executedFunction(...args) { const later = () => { clearTimeout(timeout); func(...args); }; clearTimeout(timeout); timeout = setTimeout(later, wait); }; };

export function initInsightsManager() {
    console.log("Initializing Insights Manager (V14.2 Palette Above Gap)...");
    insightsView = document.getElementById('insights-view');
    insightsGridContainer = document.getElementById('insights-grid-container');
    insightsGrid = document.getElementById('insights-grid');
    palette = document.getElementById('analysis-palette');
    paletteHeader = document.getElementById('palette-header');
    paletteToggleBtn = document.getElementById('palette-toggle-btn');
    paletteScrollContainer = document.getElementById('palette-scroll-container');
    emptyMessage = insightsGrid?.querySelector('.insights-empty-message');
    palettePreviewContainer = document.getElementById('palette-preview-container');

    if (!insightsView || !insightsGridContainer || !insightsGrid || !palette || !palettePreviewContainer || !paletteScrollContainer || !paletteHeader || !emptyMessage) {
        console.error("Insights view or critical child elements not found. Aborting initialization.");
        return;
    }

    // Initial state setup
    calculateGridCellLayout();
    checkGridEmpty();
    setupEventListeners();

    // Reset drag state just in case
    isDragging = false;
    draggedElementClone?.remove();
    document.querySelectorAll('.dragging-placeholder').forEach(el => el.remove()); // Ensure placeholders are gone
    document.removeEventListener('pointermove', onPointerMove); // Ensure move listener is off
    document.removeEventListener('pointerup', onPointerUp); // Ensure up listener is off
    hidePalettePreview();

    console.log("Insights Manager Initialized Successfully (V14.2 Palette Above Gap).");
}

// --- END OF FILE insightsManager.js ---