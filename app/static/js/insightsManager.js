// --- START OF FILE insightsManager.js ---

// DOM Elements & State
let insightsView = null, insightsGridContainer = null, insightsGrid = null, palette = null, paletteHeader = null, paletteToggleBtn = null, paletteScrollContainer = null, emptyMessage = null, palettePreviewContainer = null;

// State Variables
let isDragging = false; let draggedElementClone = null; let sourceElement = null; let sourceIndex = -1; let dragType = null; let startClientX = 0, startClientY = 0, offsetX = 0, offsetY = 0; let gridRect = null; let currentTargetIndex = -1; let animationFrameId = null; let placeholderElement = null;
let gridCellLayout = []; let gridComputedStyle = null; let gridGap = 20; let gridColCount = 2;
let previewHideTimeout = null; const PREVIEW_HIDE_DELAY = 150; const PREVIEW_GAP_TO_RIGHT = 12;

// Constants
const DRAG_SCALE = 0.95; const SCROLL_THRESHOLD = 40; const SCROLL_SPEED_MULTIPLIER = 0.15; const SCROLL_END_TOLERANCE = 5; const VIEWPORT_PADDING = 15;


// --- Helper Functions ---
function generateUniqueId(prefix = 'panel') { return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`; }
function createInsightPanelHTML(analysisType, title, description, placeholderContent) { const panelId = generateUniqueId(analysisType); const decodedPlaceholder = placeholderContent.replace(/</g, '<').replace(/>/g, '>'); return `<div class="insight-panel glassy" data-panel-id="${panelId}" data-analysis-type="${analysisType}"><div class="panel-header" draggable="false"> <span class="panel-title">${title}</span> <div class="panel-actions"> <button class="panel-action-btn share-panel-btn" aria-label="Share Analysis" title="Share"><i class="fas fa-share-alt"></i></button> <button class="panel-action-btn remove-panel-btn" aria-label="Remove Analysis" title="Remove"><i class="fas fa-times"></i></button> </div> </div><div class="panel-content"> <p>${description}</p> <div class="placeholder-chart">${decodedPlaceholder}</div> </div></div>`; }
function checkGridEmpty() { if (!insightsGrid || !emptyMessage) return; const hasContent = insightsGrid.querySelector('.insight-panel:not(.dragging-placeholder)'); emptyMessage.style.display = hasContent ? 'none' : 'block'; }

// --- calculateGridCellLayout: Updated for Square Panels ---
function calculateGridCellLayout() {
    if (!insightsGrid || !insightsGridContainer) return;
    gridCellLayout = []; gridComputedStyle = window.getComputedStyle(insightsGrid);
    const gapValue = gridComputedStyle.gap; const gaps = gapValue.split(' ').map(g => parseInt(g) || 0);
    const rowGap = gaps[0]; const colGap = gaps[1] !== undefined ? gaps[1] : rowGap; gridGap = colGap;

    // --- FIX: Use fixed 2 columns on desktop, 1 on mobile ---
     if (window.innerWidth <= 768) {
        gridColCount = 1;
     } else {
        gridColCount = 2; // Default desktop
     }
    // --- End Fix ---

    const gridWidth = insightsGrid.offsetWidth - parseInt(gridComputedStyle.paddingLeft) - parseInt(gridComputedStyle.paddingRight);
    if (!gridWidth || gridWidth <= 0 || gridColCount <= 0) { return; }

    const cellWidth = Math.max(0, (gridWidth - (gridColCount - 1) * colGap) / gridColCount);
    // --- FIX: Height equals Width for square panels ---
    const cellHeight = cellWidth;
    // --- End Fix ---

    if(cellHeight <= 0 || !isFinite(cellHeight)) { console.warn("Invalid cell height calculated."); return; } // Added check

    const visiblePanels = Array.from(insightsGrid.children).filter(el => el.classList.contains('insight-panel') && !el.classList.contains('dragging-placeholder'));
    const totalSlotsNeeded = visiblePanels.length + gridColCount + (placeholderElement && placeholderElement.parentElement ? 1 : 0);
    const estimatedRows = Math.max(1, Math.ceil(totalSlotsNeeded / gridColCount));
    let currentX = parseInt(gridComputedStyle.paddingLeft) || 0; let currentY = parseInt(gridComputedStyle.paddingTop) || 0;
    for (let r = 0; r < estimatedRows; r++) { currentX = parseInt(gridComputedStyle.paddingLeft) || 0; for (let c = 0; c < gridColCount; c++) { gridCellLayout.push({ x: currentX, y: currentY, width: cellWidth, height: cellHeight }); currentX += cellWidth + colGap; } currentY += cellHeight + rowGap; }
 }

function findNearestSlotIndex(pointerX, pointerY) { /* ... Keep V17 implementation ... */
    let closestIndex = -1; let minDistSq = Infinity; if (!gridCellLayout || gridCellLayout.length === 0) return -1;
    gridCellLayout.forEach((slot, index) => { const slotCenterX = slot.x + slot.width / 2; const slotCenterY = slot.y + slot.height / 2; const distSq = (pointerX - slotCenterX) ** 2 + (pointerY - slotCenterY) ** 2 * 1.1; if (distSq < minDistSq) { minDistSq = distSq; closestIndex = index; } });
    const maxIndex = insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder)').length; return Math.min(closestIndex, maxIndex);
 }

// --- Palette Preview Logic ---
function generatePreviewContentHTML(analysisType) { /* ... Keep V17 ... */ switch (analysisType) { case 'attendance-trends': return `<h3 class="preview-title">Attendance Trends Example</h3><div class="preview-content"><img src="/static/img/placeholder-line-chart.png" alt="Line chart preview"><p>Shows event attendance rate over time. Helps identify popular event types or seasonal changes.</p></div>`; case 'active-groups': return `<h3 class="preview-title">Active Groups Example</h3><div class="preview-content" style="text-align: left; padding: 0 10px;"><ol style="margin: 5px 0 0 20px; padding: 0;"><li>Event Planners Inc. (31)</li><li>Weekend Warriors (25)</li><li>Downtown Meetups (18)</li><li>Board Game Geeks (12)</li></ol><p style="margin-top: 10px; font-size: 0.85em; color: #ccc;">Ranks groups by the number of upcoming events created recently.</p></div>`; case 'rsvp-distribution': return `<h3 class="preview-title">RSVP Distribution Example</h3><div class="preview-content"><img src="/static/img/placeholder-pie-chart.png" alt="Pie chart preview" style="max-width: 70%; max-height: 100px;"><p>Analyzes the typical breakdown of 'Going', 'Maybe', and 'Not Going' RSVPs across events.</p></div>`; case 'busy-periods': return `<h3 class="preview-title">Busy Periods Example</h3><div class="preview-content"><img src="/static/img/placeholder-heatmap.png" alt="Heatmap preview" style="max-height: 120px;"><p>Highlights upcoming dates or days of the week with a high density of scheduled events.</p></div>`; default: return `<h3 class="preview-title">${analysisType.replace(/-/g, ' ')} Example</h3><div class="preview-content"><p>Preview information not available for this analysis type.</p></div>`; } }

// --- showPalettePreview: rewritten for robust bounding & no transform drift ---
function showPalettePreview(targetPaletteItem) {
    /* Guard clauses */
    if (!palettePreviewContainer || !targetPaletteItem || isDragging) return;
    if (palette.classList.contains('collapsed') && window.innerWidth > 768) return;

    clearTimeout(previewHideTimeout);
    previewHideTimeout = null;

    const analysisType = targetPaletteItem.dataset.analysisType;
    if (!analysisType) return;

    /* 1. Populate preview  */
    palettePreviewContainer.innerHTML = generatePreviewContentHTML(analysisType);

    /* 2. Prepare element for measurement (visible → hidden, no transforms) */
    palettePreviewContainer.style.visibility = 'hidden';
    palettePreviewContainer.style.display = 'block';

    /* 3. Measure */
    const previewRect   = palettePreviewContainer.getBoundingClientRect();
    const itemRect      = targetPaletteItem.getBoundingClientRect();
    const containerRect = insightsView?.getBoundingClientRect()
                         ?? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };

    /* 4. Horizontal position (right of palette but clamped) */
    const GAP = PREVIEW_GAP_TO_RIGHT;
    const PAD = VIEWPORT_PADDING;
    let left = itemRect.right + GAP;
    left = Math.min(left, containerRect.right - previewRect.width - PAD);
    left = Math.max(left, containerRect.left + PAD);

    /* 5. Vertical position (centre on item then clamp) */
    let top = itemRect.top + (itemRect.height - previewRect.height) / 2;
    const minTop = containerRect.top + PAD;
    const maxTop = containerRect.bottom - previewRect.height - PAD;

    if (previewRect.height >= (containerRect.bottom - containerRect.top - 2 * PAD)) {
        // Too tall to fit fully – pin to top
        top = minTop;
    } else {
        // Clamp normally
        top = Math.min(Math.max(top, minTop), maxTop);
    }

    /* 6. Apply & reveal */
    // Convert viewport coords → coords relative to the containing block
    const relLeft = left - containerRect.left;
    const relTop  = top  - containerRect.top;

    palettePreviewContainer.style.left = `${Math.round(relLeft)}px`;
    palettePreviewContainer.style.top  = `${Math.round(relTop)}px`;
    palettePreviewContainer.style.visibility = 'visible';
    palettePreviewContainer.classList.add('visible');
}

function scheduleHidePalettePreview() { /* ... Keep V17 ... */ clearTimeout(previewHideTimeout); previewHideTimeout = setTimeout(hidePalettePreview, PREVIEW_HIDE_DELAY); }
function hidePalettePreview() { /* ... Keep V17 ... */ clearTimeout(previewHideTimeout); previewHideTimeout = null; if (palettePreviewContainer) { palettePreviewContainer.classList.remove('visible'); } }
function cancelHidePreview() { /* ... Keep V17 ... */ clearTimeout(previewHideTimeout); previewHideTimeout = null; }

// --- Event Handlers --- (Keep V17 Handlers)
function onPointerDown(event) { /* ... Keep V17 ... */ if (event.target.closest('.panel-actions button, .add-analysis-btn, .palette-toggle-btn')) { return; } if (event.button !== 0 && event.pointerType !== 'touch') return; const panelHeader = event.target.closest('.panel-header'); const paletteItem = event.target.closest('.palette-item'); if (panelHeader) { const panel = panelHeader.closest('.insight-panel'); if (panel && !panel.classList.contains('dragging-placeholder')) { startGridDrag(event, panel); } } else if (paletteItem && !palette.classList.contains('collapsed')) { startPaletteDrag(event, paletteItem); } }
function startGridDrag(event, panel) { /* ... Keep V17 ... */ if (!panel || isDragging) return; event.preventDefault(); event.stopPropagation(); hidePalettePreview(); isDragging = true; dragType = 'grid'; sourceElement = panel; placeholderElement = sourceElement; calculateGridCellLayout(); const panelRect = placeholderElement.getBoundingClientRect(); const gridContainerRect = insightsGridContainer.getBoundingClientRect(); const initialX = (panelRect.left - gridContainerRect.left + insightsGridContainer.scrollLeft) + panelRect.width / 2; const initialY = (panelRect.top - gridContainerRect.top + insightsGridContainer.scrollTop) + panelRect.height / 2; sourceIndex = findNearestSlotIndex(initialX, initialY); currentTargetIndex = sourceIndex; if (sourceIndex === -1) { isDragging = false; return; } const cellHeight = gridCellLayout[0]?.height || 220; const cellWidth = gridCellLayout[0]?.width || panelRect.width; placeholderElement.classList.add('dragging-placeholder'); const rect = sourceElement.getBoundingClientRect(); startClientX = event.clientX; startClientY = event.clientY; offsetX = startClientX - rect.left; offsetY = startClientY - rect.top; draggedElementClone = sourceElement.cloneNode(true); draggedElementClone.classList.remove('dragging-placeholder'); draggedElementClone.classList.add('dragging-clone'); draggedElementClone.style.left = `${rect.left}px`; draggedElementClone.style.top = `${rect.top}px`; draggedElementClone.style.width = `${rect.width}px`; draggedElementClone.style.height = `${rect.height}px`; document.body.appendChild(draggedElementClone); document.addEventListener('pointermove', onPointerMove); document.addEventListener('pointerup', onPointerUp, { once: true }); }
function startPaletteDrag(event, item) { /* ... Keep V17 ... */ if (!item || isDragging) return; event.preventDefault(); event.stopPropagation(); hidePalettePreview(); isDragging = true; dragType = 'palette'; sourceElement = item; sourceIndex = -1; const analysisType = item.dataset.analysisType; const title = item.dataset.title; const description = item.dataset.description; const placeholderHTML = item.dataset.placeholderHtml || '<p>Loading...</p>'; if (!analysisType || !title) { isDragging = false; return; } placeholderElement = document.createElement('div'); placeholderElement.className = 'insight-panel dragging-placeholder'; calculateGridCellLayout(); const cellWidth = gridCellLayout.length > 0 ? gridCellLayout[0].width : 300; const cellHeight = gridCellLayout.length > 0 ? gridCellLayout[0].height : cellWidth; /* Use width if height fails for square */ const panelHTML = createInsightPanelHTML(analysisType, title, description, placeholderHTML); const tempDiv = document.createElement('div'); tempDiv.innerHTML = panelHTML.trim(); draggedElementClone = tempDiv.firstChild; draggedElementClone.classList.add('dragging-clone'); document.body.appendChild(draggedElementClone); startClientX = event.clientX; startClientY = event.clientY; offsetX = cellWidth * 0.15; offsetY = cellHeight * 0.15; draggedElementClone.style.left = `${startClientX - offsetX}px`; draggedElementClone.style.top = `${startClientY - offsetY}px`; draggedElementClone.style.setProperty('--drag-scale', DRAG_SCALE); document.addEventListener('pointermove', onPointerMove); document.addEventListener('pointerup', onPointerUp, { once: true }); }
function onPointerMove(event) { /* ... Keep V17 ... */ if (!isDragging || !draggedElementClone || !placeholderElement) return; const currentClientX = event.clientX; const currentClientY = event.clientY; cancelAnimationFrame(animationFrameId); animationFrameId = requestAnimationFrame(() => { draggedElementClone.style.left = `${currentClientX - offsetX}px`; draggedElementClone.style.top = `${currentClientY - offsetY}px`; gridRect = insightsGridContainer.getBoundingClientRect(); const pointerX = currentClientX - gridRect.left + insightsGridContainer.scrollLeft; const pointerY = currentClientY - gridRect.top + insightsGridContainer.scrollTop; const isOverGrid = currentClientX >= gridRect.left && currentClientX <= gridRect.right && currentClientY >= gridRect.top && currentClientY <= gridRect.bottom; let nearestIndex = -1; if (isOverGrid) { nearestIndex = findNearestSlotIndex(pointerX, pointerY); } if (isOverGrid) { if(gridCellLayout.length > 0){ placeholderElement.style.height = `${gridCellLayout[0].height}px`; placeholderElement.style.width = `${gridCellLayout[0].width}px`; } const needsMove = nearestIndex !== -1 && nearestIndex !== currentTargetIndex; if (!placeholderElement.parentElement) { const targetDomIndex = Math.max(0, nearestIndex); insertElementAtIndex(placeholderElement, targetDomIndex); currentTargetIndex = targetDomIndex; } else if (needsMove) { insertElementAtIndex(placeholderElement, nearestIndex); currentTargetIndex = nearestIndex; } if (nearestIndex !== -1) { currentTargetIndex = nearestIndex; } } else { if (placeholderElement.parentElement) { placeholderElement.remove(); } currentTargetIndex = -1; } if (isOverGrid && placeholderElement.parentElement) { handleGridScroll(currentClientY, gridRect); } checkGridEmpty(); }); }
function handleGridScroll(clientY, gridRect) { /* ... Keep V17 ... */ const scrollSpeed = 15 * SCROLL_SPEED_MULTIPLIER; let scrollDelta = 0; if (clientY < gridRect.top + SCROLL_THRESHOLD) { const proximityFactor = 1 - Math.max(0, clientY - gridRect.top) / SCROLL_THRESHOLD; scrollDelta = -scrollSpeed * (1 + proximityFactor); } else if (clientY > gridRect.bottom - SCROLL_THRESHOLD) { const proximityFactor = 1 - Math.max(0, gridRect.bottom - clientY) / SCROLL_THRESHOLD; scrollDelta = scrollSpeed * (1 + proximityFactor); } if (scrollDelta !== 0) { insightsGridContainer.scrollTop += scrollDelta; } }
function onPointerUp(event) { /* ... Keep V17 ... */ if (!isDragging) return; cancelAnimationFrame(animationFrameId); if (draggedElementClone) { draggedElementClone.remove(); draggedElementClone = null; } const droppedInsideGrid = currentTargetIndex !== -1 && placeholderElement && placeholderElement.parentElement; if (droppedInsideGrid) { if (dragType === 'palette') { const analysisType = sourceElement.dataset.analysisType; const title = sourceElement.dataset.title; const description = sourceElement.dataset.description; const placeholderHTML = sourceElement.dataset.placeholderHtml || ''; const panelHTML = createInsightPanelHTML(analysisType, title, description, placeholderHTML); const tempDiv = document.createElement('div'); tempDiv.innerHTML = panelHTML.trim(); const newPanel = tempDiv.firstChild; placeholderElement.replaceWith(newPanel); makePanelDraggable(newPanel); placeholderElement = null; } else if (dragType === 'grid' && sourceElement) { if(placeholderElement.parentElement) { placeholderElement.replaceWith(sourceElement); } sourceElement.classList.remove('dragging-placeholder'); sourceElement.style = ''; placeholderElement = null; } } else { if (dragType === 'grid' && sourceElement) { placeholderElement?.remove(); sourceElement.classList.remove('dragging-placeholder'); sourceElement.style = ''; } else if (dragType === 'palette') { placeholderElement?.remove(); } placeholderElement = null; } isDragging = false; sourceElement = null; sourceIndex = -1; dragType = null; currentTargetIndex = -1; document.removeEventListener('pointermove', onPointerMove); setTimeout(() => { calculateGridCellLayout(); checkGridEmpty(); }, 50); }
function insertElementAtIndex(elementToInsert, targetIndex) { /* ... Keep V17 ... */ const currentPanels = Array.from(insightsGrid.children).filter(el => el.classList.contains('insight-panel') && el !== elementToInsert); targetIndex = Math.max(0, Math.min(targetIndex, currentPanels.length)); const currentParent = elementToInsert.parentElement; let needsInsert = !currentParent || currentParent !== insightsGrid; if (!needsInsert) { if (targetIndex === 0) { needsInsert = insightsGrid.firstElementChild !== elementToInsert; } else { needsInsert = currentPanels[targetIndex - 1].nextElementSibling !== elementToInsert; } } if (needsInsert) { if (targetIndex < currentPanels.length) { insightsGrid.insertBefore(elementToInsert, currentPanels[targetIndex]); } else { if (emptyMessage && insightsGrid.lastElementChild === emptyMessage) { insightsGrid.insertBefore(elementToInsert, emptyMessage); } else { insightsGrid.appendChild(elementToInsert); } } } }
function handlePanelAction(event) { /* ... Keep V17 ... */ const removeButton = event.target.closest('.remove-panel-btn'); const shareButton = event.target.closest('.share-panel-btn'); const panel = event.target.closest('.insight-panel'); if (!panel || panel.classList.contains('dragging-placeholder')) return; if (removeButton) { panel.remove(); setTimeout(() => { calculateGridCellLayout(); checkGridEmpty(); }, 50); } else if (shareButton) { alert(`Sharing panel '${panel.querySelector('.panel-title')?.textContent || 'N/A'}' (not implemented)`); } }
function makePanelDraggable(panelElement) { /* ... Keep V17 ... */ const header = panelElement.querySelector('.panel-header'); if (header) { header.removeEventListener('pointerdown', onPointerDown); header.addEventListener('pointerdown', onPointerDown); } else { console.warn("Panel header not found for making draggable:", panelElement); } }
function debounce(func, wait) { /* ... Keep V17 ... */ let timeout; return function executedFunction(...args) { const later = () => { clearTimeout(timeout); func(...args); }; clearTimeout(timeout); timeout = setTimeout(later, wait); }; };
function handlePaletteToggle(forceState = null) { /* ... Keep V17 ... */ if (!palette || !paletteToggleBtn) return; hidePalettePreview(); const currentCollapsedState = palette.classList.contains('collapsed'); let shouldBeCollapsed; if (forceState !== null) { shouldBeCollapsed = (forceState === 'close'); } else { shouldBeCollapsed = !currentCollapsedState; } if (shouldBeCollapsed === currentCollapsedState) return; if (shouldBeCollapsed) { palette.classList.add('collapsed'); insightsView?.classList.add('palette-collapsed'); paletteToggleBtn.setAttribute('aria-label', 'Expand Palette'); paletteToggleBtn.setAttribute('title', 'Expand Palette'); } else { palette.classList.remove('collapsed'); insightsView?.classList.remove('palette-collapsed'); paletteToggleBtn.setAttribute('aria-label', 'Collapse Palette'); paletteToggleBtn.setAttribute('title', 'Collapse Palette'); } updateToggleButtonIcon(); setTimeout(calculateGridCellLayout, 350); }
function updateToggleButtonIcon() { /* ... Keep V17 ... */ if (!palette || !paletteToggleBtn) return; const isMobile = window.innerWidth <= 768; const isCollapsed = palette.classList.contains('collapsed'); const icon = paletteToggleBtn.querySelector('i'); if (icon) { if (isMobile) { icon.className = `fas ${isCollapsed ? 'fa-chevron-up' : 'fa-chevron-down'}`; } else { icon.className = `fas ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`; } } const label = isCollapsed ? 'Expand Palette' : 'Collapse Palette'; paletteToggleBtn.setAttribute('aria-label', label); paletteToggleBtn.setAttribute('title', label); }
function setupEventListeners() { /* ... Keep V17 ... */ if (!insightsView) return; if (paletteHeader) { paletteHeader.addEventListener('click', (event) => { if (event.target.closest('.add-analysis-btn') || paletteToggleBtn.contains(event.target)) return; if(event.target === paletteToggleBtn) { handlePaletteToggle(); return; } handlePaletteToggle(); }); paletteToggleBtn.addEventListener('click', (event) => { event.stopPropagation(); handlePaletteToggle(); }); } else { console.warn("Palette header not found."); } if (paletteScrollContainer) { paletteScrollContainer.addEventListener('pointerdown', onPointerDown); paletteScrollContainer.addEventListener('mouseover', (event) => { if (isDragging || (palette.classList.contains('collapsed') && window.innerWidth > 768)) return; const targetItem = event.target.closest('.palette-item'); if (targetItem) showPalettePreview(targetItem); }); paletteScrollContainer.addEventListener('mouseout', (event) => { if (isDragging) return; const targetItem = event.target.closest('.palette-item'); const relatedTarget = event.relatedTarget; if (targetItem && !targetItem.contains(relatedTarget) && !palettePreviewContainer?.contains(relatedTarget)) { scheduleHidePalettePreview(); } }); paletteScrollContainer.addEventListener('click', (event) => { const addButton = event.target.closest('.add-analysis-btn'); if (addButton && !isDragging) { const item = addButton.closest('.palette-item'); if (item) { const analysisType = item.dataset.analysisType; const title = item.dataset.title; const description = item.dataset.description; const placeholderHTML = item.dataset.placeholderHtml || ''; const panelHTML = createInsightPanelHTML(analysisType, title, description, placeholderHTML); const tempDiv = document.createElement('div'); tempDiv.innerHTML = panelHTML.trim(); const newPanel = tempDiv.firstChild; if (emptyMessage && emptyMessage.parentElement === insightsGrid) { insightsGrid.insertBefore(newPanel, emptyMessage); } else { insightsGrid.appendChild(newPanel); } makePanelDraggable(newPanel); setTimeout(() => { calculateGridCellLayout(); checkGridEmpty(); insightsGridContainer.scrollTop = insightsGridContainer.scrollHeight; }, 50); } } }); } else { console.warn("Palette scroll container not found."); } if (palettePreviewContainer) { palettePreviewContainer.addEventListener('mouseleave', (event) => { const relatedTarget = event.relatedTarget; if (!relatedTarget || !relatedTarget.closest('.palette-item')) { scheduleHidePalettePreview(); } }); palettePreviewContainer.addEventListener('mouseenter', cancelHidePreview); } if (insightsGrid) { insightsGrid.addEventListener('click', handlePanelAction); insightsGrid.addEventListener('pointerdown', onPointerDown); insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder)').forEach(makePanelDraggable); } else { console.warn("Insights grid not found."); } window.addEventListener('resize', debounce(() => { hidePalettePreview(); calculateGridCellLayout(); updateToggleButtonIcon(); }, 250)); insightsGridContainer?.addEventListener('scroll', debounce(() => { if (!isDragging) hidePalettePreview(); }, 100)); console.log("Insights event listeners attached (V19 Corrected)."); }

// --- initInsightsManager: Add export ---
export function initInsightsManager() { // <<< FIX: Added export
    console.log("Initializing Insights Manager (V19 Corrected)...");
    insightsView = document.getElementById('insights-view');
    // ... (rest of init is same as V17)
    insightsGridContainer = document.getElementById('insights-grid-container'); insightsGrid = document.getElementById('insights-grid'); palette = document.getElementById('analysis-palette'); paletteHeader = document.getElementById('palette-header'); paletteToggleBtn = document.getElementById('palette-toggle-btn'); paletteScrollContainer = document.getElementById('palette-scroll-container'); emptyMessage = insightsGrid?.querySelector('.insights-empty-message'); palettePreviewContainer = document.getElementById('palette-preview-container'); if (!insightsView || !insightsGridContainer || !insightsGrid || !palette || !paletteHeader || !paletteToggleBtn || !paletteScrollContainer || !palettePreviewContainer) { console.error("Insights view or critical child elements not found. Aborting initialization."); return; } if (insightsGrid && !emptyMessage) { console.warn("Insights empty message element not found, creating fallback."); emptyMessage = document.createElement('p'); emptyMessage.className = 'insights-empty-message'; emptyMessage.id = 'insights-empty-message'; emptyMessage.textContent = 'Add analyses from the palette on the left or drag existing ones to rearrange.'; insightsGrid.prepend(emptyMessage); } calculateGridCellLayout(); checkGridEmpty(); setupEventListeners(); isDragging = false; draggedElementClone?.remove(); document.querySelectorAll('.dragging-placeholder').forEach(el => el.remove()); document.removeEventListener('pointermove', onPointerMove); document.removeEventListener('pointerup', onPointerUp); hidePalettePreview(); const isInitiallyCollapsed = palette.classList.contains('collapsed'); if (isInitiallyCollapsed) { palette.classList.add('collapsed'); insightsView?.classList.add('palette-collapsed'); } else { palette.classList.remove('collapsed'); insightsView?.classList.remove('palette-collapsed'); } updateToggleButtonIcon();
    console.log("Insights Manager Initialized Successfully (V19 Corrected).");
}

// --- END OF FILE insightsManager.js ---