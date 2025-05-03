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

// Constants
const DRAG_SCALE = 0.95;
const GRID_COLS = 2; // TODO: Read from CSS if needed
const SCROLL_THRESHOLD = 40; // Pixels from edge to trigger scroll
const SCROLL_SPEED_MULTIPLIER = 0.15; // Adjust for faster/slower scrolling relative to distance

// --- Helper Functions ---

function generateUniqueId(prefix = 'panel') { return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`; }
function createInsightPanelHTML(analysisType, title, description, placeholderContent) { const panelId = generateUniqueId(analysisType); const decodedPlaceholder = placeholderContent.replace(/</g, '<').replace(/>/g, '>'); return `<div class="insight-panel glassy" data-panel-id="${panelId}" data-analysis-type="${analysisType}"><div class="panel-header" draggable="false"> <span class="panel-title">${title}</span> <div class="panel-actions"> <button class="panel-action-btn share-panel-btn" aria-label="Share Analysis" title="Share"><i class="fas fa-share-alt"></i></button> <button class="panel-action-btn remove-panel-btn" aria-label="Remove Analysis" title="Remove"><i class="fas fa-times"></i></button> </div> </div><div class="panel-content"> <p>${description}</p> <div class="placeholder-chart">${decodedPlaceholder}</div> </div></div>`; }
function checkGridEmpty() { if (!insightsGrid || !emptyMessage) return; const hasContent = insightsGrid.querySelector('.insight-panel:not(.dragging-placeholder)'); emptyMessage.style.display = hasContent ? 'none' : 'block'; }
function calculateGridCellLayout() { /* ... (No changes needed) ... */ if (!insightsGrid || !insightsGridContainer) return; gridCellLayout = []; const gridStyle = window.getComputedStyle(insightsGrid); const colCount = GRID_COLS; const rowGap = parseInt(gridStyle.gap) || 25; const colGap = parseInt(gridStyle.gap) || 25; const gridWidth = insightsGrid.offsetWidth - parseInt(gridStyle.paddingLeft) - parseInt(gridStyle.paddingRight); if (!gridWidth || gridWidth <= 0 || colCount <= 0) return; const cellWidth = Math.max(0, (gridWidth - (colCount - 1) * colGap) / colCount); let cellHeight = 0; const firstPanel = insightsGrid.querySelector('.insight-panel'); if (firstPanel && firstPanel.offsetHeight > 0) { cellHeight = firstPanel.offsetHeight; } else { cellHeight = cellWidth / (1 / 0.85); } if(cellHeight <= 0) cellHeight = 200; const visiblePanels = Array.from(insightsGrid.children).filter(el => el.classList.contains('insight-panel') && !el.classList.contains('dragging-placeholder')); const visiblePanelCount = visiblePanels.length; const estimatedRows = Math.max(1, Math.ceil((visiblePanelCount + 1) / colCount)); let currentX = parseInt(gridStyle.paddingLeft) || 0; let currentY = parseInt(gridStyle.paddingTop) || 0; for (let r = 0; r < estimatedRows; r++) { currentX = parseInt(gridStyle.paddingLeft) || 0; for (let c = 0; c < colCount; c++) { gridCellLayout.push({ x: currentX, y: currentY, width: cellWidth, height: cellHeight }); currentX += cellWidth + colGap; } currentY += cellHeight + rowGap; } currentX = parseInt(gridStyle.paddingLeft) || 0; for (let c = 0; c < colCount; c++) { gridCellLayout.push({ x: currentX, y: currentY, width: cellWidth, height: cellHeight }); currentX += cellWidth + colGap; } }
function findNearestSlotIndex(pointerX, pointerY) { /* ... (No changes needed) ... */ let closestIndex = -1; let minDistSq = Infinity; if (!gridCellLayout || gridCellLayout.length === 0) return -1; gridCellLayout.forEach((slot, index) => { const inX = pointerX >= slot.x && pointerX <= slot.x + slot.width; const inY = pointerY >= slot.y && pointerY <= slot.y + slot.height; if (inX && inY) { closestIndex = index; minDistSq = 0; return; } if (minDistSq > 0) { const slotCenterX = slot.x + slot.width / 2; const slotCenterY = slot.y + slot.height / 2; const distSq = (pointerX - slotCenterX) ** 2 + (pointerY - slotCenterY) ** 2; if (distSq < minDistSq) { minDistSq = distSq; closestIndex = index; } } }); const maxIndex = insightsGrid.querySelectorAll('.insight-panel').length; return Math.min(closestIndex, maxIndex); }

// --- Palette Preview Logic (No changes) ---
function generatePreviewContentHTML(analysisType) { /* ... */ switch (analysisType) { case 'attendance-trends': return `<span class="preview-title">Attendance Trends Example</span><div class="preview-content"><img src="/static/img/placeholder-line-chart.png" alt="Line chart preview" style="max-width: 100%; height: auto; opacity: 0.7;"><p>Shows event attendance over time.</p></div>`; case 'active-groups': return `<span class="preview-title">Active Groups Example</span><div class="preview-content" style="font-size: 0.9em; color: #ddd;"><ol style="margin: 5px 0 0 15px; padding: 0; text-align: left;"><li>Top Group (25)</li><li>Second Group (18)</li><li>Another One (15)</li></ol><p style="font-size: 0.8em; margin-top: 8px; color: #ccc;">Ranks groups by recent activity.</p></div>`; case 'rsvp-distribution': return `<span class="preview-title">RSVP Distribution Example</span><div class="preview-content"><img src="/static/img/placeholder-pie-chart.png" alt="Pie chart preview" style="max-width: 80%; height: auto; margin: 5px auto; display: block; opacity: 0.7;"><p>Typical Going/Maybe/No breakdown.</p></div>`; case 'busy-periods': return `<span class="preview-title">Busy Periods Example</span><div class="preview-content"><img src="/static/img/placeholder-heatmap.png" alt="Heatmap preview" style="max-width: 100%; height: auto; opacity: 0.7;"><p>Highlights days with high event density.</p></div>`; default: return `<span class="preview-title">${analysisType.replace(/-/g, ' ')} Example</span><div class="preview-content"><p>Preview not available.</p></div>`; } }
function showPalettePreview(targetPaletteItem) { /* ... */ if (!palettePreviewContainer || !targetPaletteItem || isDragging) return; clearTimeout(previewHideTimeout); previewHideTimeout = null; const analysisType = targetPaletteItem.dataset.analysisType; if (!analysisType) return; const previewHTML = generatePreviewContentHTML(analysisType); palettePreviewContainer.innerHTML = previewHTML; const itemRect = targetPaletteItem.getBoundingClientRect(); palettePreviewContainer.style.visibility = 'hidden'; palettePreviewContainer.style.display = 'block'; const containerRect = palettePreviewContainer.getBoundingClientRect(); palettePreviewContainer.style.display = ''; palettePreviewContainer.style.visibility = ''; let top = itemRect.top - containerRect.height - 10; let left = itemRect.left + (itemRect.width / 2) - (containerRect.width / 2); if (top < 10) top = itemRect.bottom + 10; if (left < 10) left = 10; if (left + containerRect.width > window.innerWidth - 10) { left = window.innerWidth - containerRect.width - 10; } palettePreviewContainer.style.top = `${top}px`; palettePreviewContainer.style.left = `${left}px`; palettePreviewContainer.classList.add('visible'); }
function scheduleHidePalettePreview() { /* ... */ clearTimeout(previewHideTimeout); previewHideTimeout = setTimeout(hidePalettePreview, PREVIEW_HIDE_DELAY); }
function hidePalettePreview() { /* ... */ clearTimeout(previewHideTimeout); previewHideTimeout = null; if (palettePreviewContainer) { palettePreviewContainer.classList.remove('visible'); } }
function cancelHidePreview() { /* ... */ clearTimeout(previewHideTimeout); previewHideTimeout = null; }

// --- Event Handlers ---

function onPointerDown(event) { /* ... (No change) ... */ if (event.target.closest('.panel-actions button, .add-analysis-btn')) { return; } if (event.button !== 0 && event.pointerType !== 'touch') return; const panelHeader = event.target.closest('.panel-header'); const paletteItem = event.target.closest('.palette-item'); if (panelHeader) { const panel = panelHeader.closest('.insight-panel'); if (panel && !panel.classList.contains('dragging-placeholder')) { startGridDrag(event, panel); } } else if (paletteItem) { startPaletteDrag(event, paletteItem); } }
function startGridDrag(event, panel) { /* ... (No change) ... */ if (!panel || isDragging) return; event.preventDefault(); event.stopPropagation(); isDragging = true; dragType = 'grid'; sourceElement = panel; placeholderElement = sourceElement; calculateGridCellLayout(); const panelRect = placeholderElement.getBoundingClientRect(); const gridContainerRect = insightsGridContainer.getBoundingClientRect(); const initialX = (panelRect.left - gridContainerRect.left + insightsGridContainer.scrollLeft) + panelRect.width / 2; const initialY = (panelRect.top - gridContainerRect.top + insightsGridContainer.scrollTop) + panelRect.height / 2; sourceIndex = findNearestSlotIndex(initialX, initialY); currentTargetIndex = sourceIndex; if (sourceIndex === -1) { console.warn("Could not determine source index for grid drag."); isDragging = false; return; } placeholderElement.classList.add('dragging-placeholder'); const rect = sourceElement.getBoundingClientRect(); startClientX = event.clientX; startClientY = event.clientY; offsetX = startClientX - rect.left; offsetY = startClientY - rect.top; draggedElementClone = sourceElement.cloneNode(true); draggedElementClone.classList.remove('dragging-placeholder'); draggedElementClone.classList.add('dragging-clone'); draggedElementClone.style.left = `${rect.left}px`; draggedElementClone.style.top = `${rect.top}px`; draggedElementClone.style.width = `${rect.width}px`; draggedElementClone.style.height = `${rect.height}px`; document.body.appendChild(draggedElementClone); document.addEventListener('pointermove', onPointerMove); document.addEventListener('pointerup', onPointerUp, { once: true }); }
function startPaletteDrag(event, item) { /* ... (No change) ... */ if (!item || isDragging) return; event.preventDefault(); event.stopPropagation(); isDragging = true; dragType = 'palette'; sourceElement = item; sourceIndex = -1; const analysisType = item.dataset.analysisType; const title = item.dataset.title; const description = item.dataset.description; const placeholderHTML = item.dataset.placeholderHtml || '<p>Loading...</p>'; if (!analysisType || !title) { console.warn("Missing data on palette item."); isDragging = false; return; } placeholderElement = document.createElement('div'); placeholderElement.className = 'insight-panel dragging-placeholder'; calculateGridCellLayout(); const cellWidth = gridCellLayout.length > 0 ? gridCellLayout[0].width : 300; const cellHeight = gridCellLayout.length > 0 ? gridCellLayout[0].height : 250; placeholderElement.style.width = `${cellWidth}px`; placeholderElement.style.height = `${cellHeight}px`; const panelHTML = createInsightPanelHTML(analysisType, title, description, placeholderHTML); const tempDiv = document.createElement('div'); tempDiv.innerHTML = panelHTML.trim(); draggedElementClone = tempDiv.firstChild; draggedElementClone.classList.add('dragging-clone'); draggedElementClone.style.width = `${cellWidth}px`; draggedElementClone.style.height = `${cellHeight}px`; document.body.appendChild(draggedElementClone); startClientX = event.clientX; startClientY = event.clientY; offsetX = cellWidth * 0.15; offsetY = cellHeight * 0.15; draggedElementClone.style.left = `${startClientX - offsetX}px`; draggedElementClone.style.top = `${startClientY - offsetY}px`; hidePalettePreview(); document.addEventListener('pointermove', onPointerMove); document.addEventListener('pointerup', onPointerUp, { once: true }); }


function onPointerMove(event) {
    if (!isDragging || !draggedElementClone) return;

    const currentClientX = event.clientX;
    const currentClientY = event.clientY;

    cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(() => {
        // 1. Update clone position
        draggedElementClone.style.left = `${currentClientX - offsetX}px`;
        draggedElementClone.style.top = `${currentClientY - offsetY}px`;

        // 2. Determine grid position under cursor
        gridRect = insightsGridContainer.getBoundingClientRect(); // Use container rect for visibility check
        const pointerX = currentClientX - gridRect.left + insightsGridContainer.scrollLeft;
        const pointerY = currentClientY - gridRect.top + insightsGridContainer.scrollTop;
        const isOverGrid = currentClientX >= gridRect.left && currentClientX <= gridRect.right &&
                           currentClientY >= gridRect.top && currentClientY <= gridRect.bottom;

        let nearestIndex = -1;
        if (isOverGrid) {
            nearestIndex = findNearestSlotIndex(pointerX, pointerY);
        }

        // --- Placeholder Management ---
        if (isOverGrid) {
            if (!placeholderElement.parentElement && placeholderElement) {
                const targetDomIndex = Math.max(0, nearestIndex);
                insertElementAtIndex(placeholderElement, targetDomIndex);
                sourceIndex = targetDomIndex;
                currentTargetIndex = targetDomIndex;
                requestAnimationFrame(calculateGridCellLayout);
            }
            else if (nearestIndex !== -1 && nearestIndex !== sourceIndex && placeholderElement) {
                 insertElementAtIndex(placeholderElement, nearestIndex);
                 sourceIndex = nearestIndex;
                 currentTargetIndex = nearestIndex;
                 requestAnimationFrame(calculateGridCellLayout);
             } else {
                 currentTargetIndex = nearestIndex;
             }
        } else {
            if (placeholderElement && placeholderElement.parentElement) {
                placeholderElement.remove();
                sourceIndex = -1;
                requestAnimationFrame(calculateGridCellLayout);
            }
            currentTargetIndex = -1;
        }

        // --- Auto-Scroll Logic ---
        if (isOverGrid && placeholderElement && placeholderElement.parentElement) {
            const placeholderRect = placeholderElement.getBoundingClientRect(); // Rect relative to viewport

            // Check for scrolling down
            const bottomDiff = placeholderRect.bottom - (gridRect.bottom - SCROLL_THRESHOLD);
            if (bottomDiff > 0) {
                const scrollAmount = Math.max(5, Math.min(30, bottomDiff * SCROLL_SPEED_MULTIPLIER)); // Calculate speed, cap max/min
                insightsGridContainer.scrollTop += scrollAmount;
                 // console.log(`Scrolling down by ${scrollAmount.toFixed(1)}`);
            }

            // Check for scrolling up
            const topDiff = (gridRect.top + SCROLL_THRESHOLD) - placeholderRect.top;
             if (topDiff > 0) {
                 const scrollAmount = Math.max(5, Math.min(30, topDiff * SCROLL_SPEED_MULTIPLIER)); // Calculate speed, cap max/min
                 insightsGridContainer.scrollTop -= scrollAmount;
                 // console.log(`Scrolling up by ${scrollAmount.toFixed(1)}`);
            }
        }
         checkGridEmpty();
    });
}


function onPointerUp(event) {
    if (!isDragging) return;
    cancelAnimationFrame(animationFrameId);

    // --- Cleanup Visuals ---
    if (draggedElementClone) { draggedElementClone.remove(); draggedElementClone = null; }

    // --- Perform Drop Action ---
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

            insightsGrid.replaceChild(newPanel, placeholderElement);
            makePanelDraggable(newPanel);
            addPanelActionListeners(newPanel);

        } else if (dragType === 'grid' && sourceElement) {
             sourceElement.classList.remove('dragging-placeholder');
             sourceElement.style.opacity = '';
             sourceElement.style.visibility = '';
             sourceElement.style.border = ''; // Reset explicitly
             sourceElement.style.outline = ''; // Reset outline if used
        }
    } else {
        // Dropped outside
        if (dragType === 'grid' && sourceElement) {
            sourceElement.classList.remove('dragging-placeholder');
            sourceElement.style.opacity = '';
            sourceElement.style.visibility = '';
            sourceElement.style.border = ''; // Reset explicitly
            sourceElement.style.outline = ''; // Reset outline if used
        }
        if(placeholderElement && placeholderElement.parentElement){
            placeholderElement.remove();
        }
    }

    // --- Final State Reset ---
    isDragging = false;
    sourceElement = null;
    placeholderElement = null;
    sourceIndex = -1;
    dragType = null;
    currentTargetIndex = -1;
    document.removeEventListener('pointermove', onPointerMove);

    setTimeout(() => {
        calculateGridCellLayout();
        checkGridEmpty();
    }, 50);
}

/** Inserts element at specific visual index in the grid */
function insertElementAtIndex(elementToInsert, targetIndex) { /* ... (No change) ... */ const children = Array.from(insightsGrid.children).filter(el => el !== elementToInsert && el !== emptyMessage); if (targetIndex < 0) targetIndex = 0; if (targetIndex < children.length) { const referenceNode = children[targetIndex]; if (elementToInsert.nextElementSibling !== referenceNode) { insightsGrid.insertBefore(elementToInsert, referenceNode); } } else { const currentLastVisible = children[children.length - 1]; if (elementToInsert !== currentLastVisible) { if (emptyMessage && emptyMessage.parentElement === insightsGrid) { insightsGrid.insertBefore(elementToInsert, emptyMessage); } else { insightsGrid.appendChild(elementToInsert); } } } }

// --- Event Listeners & Init ---
function handlePaletteToggle() { /* ... (No change) ... */ if (!palette || !paletteToggleBtn) return; const isCollapsed = palette.classList.toggle('collapsed'); insightsView?.classList.toggle('palette-collapsed', isCollapsed); paletteToggleBtn.setAttribute('aria-label', isCollapsed ? 'Expand Palette' : 'Collapse Palette'); paletteToggleBtn.setAttribute('title', isCollapsed ? 'Expand Palette' : 'Collapse Palette'); const icon = paletteToggleBtn.querySelector('i'); if (icon) icon.className = `fas ${isCollapsed ? 'fa-chevron-up' : 'fa-chevron-down'}`; setTimeout(calculateGridCellLayout, 350); }
function handlePanelAction(event) { /* ... (No change) ... */ const removeButton = event.target.closest('.remove-panel-btn'); const shareButton = event.target.closest('.share-panel-btn'); const panel = event.target.closest('.insight-panel'); if (!panel || panel.classList.contains('dragging-placeholder')) return; if (removeButton) { panel.remove(); setTimeout(() => { calculateGridCellLayout(); checkGridEmpty(); }, 50); } else if (shareButton) { alert(`Sharing panel '${panel.querySelector('.panel-title')?.textContent || 'N/A'}' (not implemented)`); } }
function makePanelDraggable(panelElement) { /* ... (No change) ... */ const header = panelElement.querySelector('.panel-header'); if (header) { header.removeEventListener('pointerdown', onPointerDown); header.addEventListener('pointerdown', onPointerDown); } else { console.warn("Panel header not found for making draggable:", panelElement); } }
function addPanelActionListeners(panelElement) { /* ... (No change - handled by delegation) ... */ }
function setupEventListeners() { /* ... (No change) ... */ if (!insightsView) return; if (paletteHeader) { paletteHeader.addEventListener('click', (event) => { if (event.target.closest('button') && event.target !== paletteToggleBtn && !paletteToggleBtn.contains(event.target)) return; handlePaletteToggle(); }); } else { console.warn("Palette header not found."); } if (paletteScrollContainer) { paletteScrollContainer.addEventListener('pointerdown', onPointerDown); paletteScrollContainer.addEventListener('mouseover', (event) => { if (isDragging) return; const targetItem = event.target.closest('.palette-item'); if (targetItem) showPalettePreview(targetItem); }); paletteScrollContainer.addEventListener('mouseout', (event) => { if (isDragging) return; const targetItem = event.target.closest('.palette-item'); const relatedTarget = event.relatedTarget; if (targetItem && !targetItem.contains(relatedTarget) && !palettePreviewContainer?.contains(relatedTarget)) { scheduleHidePalettePreview(); } }); if(palettePreviewContainer) { palettePreviewContainer.addEventListener('mouseenter', cancelHidePreview); palettePreviewContainer.addEventListener('mouseleave', scheduleHidePalettePreview); } } else { console.warn("Palette scroll container not found."); } if (insightsGrid) { insightsGrid.addEventListener('pointerdown', onPointerDown); insightsGrid.addEventListener('click', handlePanelAction); insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder)').forEach(makePanelDraggable); } else { console.warn("Insights grid not found."); } window.addEventListener('resize', debounce(() => { if (!isDragging) { calculateGridCellLayout(); } }, 250)); console.log("Insights event listeners attached (V9 Scroll/Style)."); }
function debounce(func, wait) { /* ... (No change) ... */ let timeout; return function executedFunction(...args) { const later = () => { clearTimeout(timeout); func(...args); }; clearTimeout(timeout); timeout = setTimeout(later, wait); }; };

export function initInsightsManager() {
    console.log("Initializing Insights Manager (V9 Scroll/Style)...");
    insightsView = document.getElementById('insights-view');
    // *** IMPORTANT: Get the container for scrolling ***
    insightsGridContainer = document.getElementById('insights-grid-container');
    insightsGrid = document.getElementById('insights-grid');
    palette = document.getElementById('analysis-palette');
    paletteHeader = document.getElementById('palette-header');
    paletteToggleBtn = document.getElementById('palette-toggle-btn');
    paletteScrollContainer = document.getElementById('palette-scroll-container');
    emptyMessage = insightsGrid?.querySelector('.insights-empty-message');
    palettePreviewContainer = document.getElementById('palette-preview-container');

    // *** Ensure the grid container is found ***
    if (!insightsView || !insightsGridContainer || !insightsGrid || !palette || !palettePreviewContainer || !paletteScrollContainer || !paletteHeader || !emptyMessage) {
        console.error("Insights view or critical child elements (including insights-grid-container) not found. Aborting initialization.");
        return;
    }

    calculateGridCellLayout();
    checkGridEmpty();
    setupEventListeners();

    isDragging = false;
    draggedElementClone?.remove();
    document.querySelectorAll('.dragging-placeholder').forEach(el => el.classList.remove('dragging-placeholder'));
    document.removeEventListener('pointermove', onPointerMove);

    console.log("Insights Manager Initialized Successfully (V9 Scroll/Style).");
}

// --- END OF FILE insightsManager.js ---