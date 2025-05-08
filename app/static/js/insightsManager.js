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
let palettePreviewContainer = null; // Initialized in initInsightsManager

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
let activeChartInstances = {}; // Store active chart instances { panelId: chartInstance }

// Grid Layout Cache
let gridCellLayout = [];
let gridComputedStyle = null;
let gridColCount = 2;

// Preview State
let previewHideTimeout = null;
const PREVIEW_HIDE_DELAY = 150; // Base delay before hiding preview
const PREVIEW_GAP_TO_RIGHT = 12; // Gap between item and preview
const VIEWPORT_PADDING = 15; // Padding from viewport edges

// Constants
const SCROLL_THRESHOLD = 40;
const SCROLL_SPEED_MULTIPLIER = 0.15;
const API_BASE = '/api'; // Base path for API calls
const CHART_ANIMATION_DURATION = 400; // ms for chart animations

// --- Helper Functions ---
function generateUniqueId(prefix = 'panel') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// --- API Interaction Helpers ---
async function fetchApi(url, options = {}) {
    const defaultHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRFToken': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')
    };

    options.headers = { ...defaultHeaders, ...options.headers };
    if (options.body && typeof options.body !== 'string') {
        options.body = JSON.stringify(options.body);
    }

    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { error: response.statusText || `Request failed with status ${response.status}` };
            }
            console.error(`API Error (${response.status}) on ${options.method || 'GET'} ${url}:`, errorData);
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        if (response.status === 204 || response.headers.get('content-length') === '0') {
            return null;
        }
        return await response.json();
    } catch (error) {
        console.error(`Network or API error on ${options.method || 'GET'} ${url}:`, error);
        throw error;
    }
}

async function addPanelToServer(analysisType, config = {}) {
    console.log(`Adding panel of type: ${analysisType}`);
    return await fetchApi(`${API_BASE}/insights/panels`, {
        method: 'POST',
        body: { analysis_type: analysisType, configuration: config }
    });
}

async function removePanelFromServer(panelId) {
    console.log(`Removing panel ID: ${panelId}`);
    return await fetchApi(`${API_BASE}/insights/panels/${panelId}`, {
        method: 'DELETE'
    });
}

async function updatePanelOrderOnServer(panelIds) {
    console.log(`Updating panel order:`, panelIds);
    const integerIds = panelIds.map(id => parseInt(id)).filter(id => !isNaN(id));
    return await fetchApi(`${API_BASE}/insights/panels/order`, {
        method: 'PUT',
        body: { panel_ids: integerIds }
    });
}

async function fetchAnalysisData(analysisType, panelId = null) {
    console.log(`Fetching data for type: ${analysisType}, panel ID: ${panelId}`);
    let url = `${API_BASE}/analysis/data/${analysisType}`;
    if (panelId) {
        const panelIdInt = parseInt(panelId);
        if (!isNaN(panelIdInt)) {
            url += `?panel_id=${panelIdInt}`;
        } else {
            console.warn(`Invalid panelId (${panelId}) passed to fetchAnalysisData.`);
        }
    }
    return await fetchApi(url);
}

// --- Panel Creation & Content Loading ---

function createInsightPanelElement(panelData) {
    const panel = document.createElement('div');
    panel.className = 'insight-panel glassy';
    panel.dataset.panelId = panelData.id;
    panel.dataset.analysisType = panelData.analysis_type;

    // Find placeholder HTML from the palette item's data attribute if possible,
    // otherwise use a generic loading indicator. This assumes the analysis type
    // is known when creating the element (e.g., from palette drag or existing panel data).
    let placeholderHtmlContent = `<div style='text-align: center; padding: 20px; color: #aaa;'><i class='fas fa-spinner fa-spin fa-2x'></i><p style='margin-top: 10px;'>Loading data...</p></div>`; // Default
    const paletteItemForType = paletteScrollContainer?.querySelector(`.palette-item[data-analysis-type="${panelData.analysis_type}"]`);
    if (paletteItemForType && paletteItemForType.dataset.placeholderHtml) {
        placeholderHtmlContent = paletteItemForType.dataset.placeholderHtml;
    }

    panel.innerHTML = `
        <div class="panel-header" draggable="false">
            <span class="panel-title">${panelData.title || 'Loading...'}</span>
            <div class="panel-actions">
                <button class="panel-action-btn share-panel-btn" aria-label="Share Analysis" title="Share"><i class="fas fa-share-alt"></i></button>
                <button class="panel-action-btn remove-panel-btn" aria-label="Remove Analysis" title="Remove"><i class="fas fa-times"></i></button>
            </div>
        </div>
        <div class="panel-content">
            <p>${panelData.description || ''}</p>
            <div class="placeholder-chart">
                ${placeholderHtmlContent} {# Inject the specific placeholder HTML #}
            </div>
        </div>
    `;
    makePanelDraggable(panel);
    loadPanelContent(panel);
    return panel;
}

async function loadPanelContent(panelElement) {
    const analysisType = panelElement.dataset.analysisType;
    const panelId = panelElement.dataset.panelId;
    const contentContainer = panelElement.querySelector('.placeholder-chart');
    const panelTitleEl = panelElement.querySelector('.panel-title');

    if (!analysisType || !panelId || !contentContainer) {
        console.error("Cannot load panel content: Missing type, ID, or container.", { analysisType, panelId, panelElement });
        if (contentContainer) contentContainer.innerHTML = "<p style='color: red; text-align: center;'>Error loading: Invalid panel data.</p>";
        return;
    }

    if (activeChartInstances[panelId]) {
        try { activeChartInstances[panelId].destroy(); } catch (e) { console.error("Error destroying chart:", e); }
        delete activeChartInstances[panelId];
    }

    // Show loading state (reuse placeholder HTML initially set or reset it)
    const paletteItemForType = paletteScrollContainer?.querySelector(`.palette-item[data-analysis-type="${analysisType}"]`);
    if (paletteItemForType && paletteItemForType.dataset.placeholderHtml) {
        contentContainer.innerHTML = paletteItemForType.dataset.placeholderHtml;
    } else {
        contentContainer.innerHTML = `<div style='text-align: center; padding: 20px; color: #aaa;'><i class='fas fa-spinner fa-spin fa-2x'></i><p style='margin-top: 10px;'>Loading data...</p></div>`;
    }


    try {
        if (typeof Chart === 'undefined') {
            throw new Error("Chart.js library is not loaded.");
        }

        const analysisResult = await fetchAnalysisData(analysisType, panelId);

        if (panelTitleEl && analysisResult && analysisResult.title) {
            panelTitleEl.textContent = analysisResult.title;
        }

        if (analysisType === 'spending-by-category' && analysisResult && analysisResult.data) {
            if (analysisResult.data.length > 0) {
                contentContainer.innerHTML = ''; // Clear loading spinner
                const canvas = document.createElement('canvas');
                contentContainer.appendChild(canvas);

                const ctx = canvas.getContext('2d');
                const labels = analysisResult.data.map(item => item.category || 'Uncategorized');
                const amounts = analysisResult.data.map(item => item.amount);

                const generateColors = (numColors) => {
                    const colors = []; const hueStep = 360 / numColors;
                    for (let i = 0; i < numColors; i++) {
                        const hue = (i * hueStep) % 360; const saturation = 60 + (i % 3) * 5; const lightness = 55 + (i % 2) * 10;
                        colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
                    } return colors;
                };
                const backgroundColors = generateColors(labels.length);
                const hoverBackgroundColors = backgroundColors.map(color => {
                    try { let [h, s, l] = color.match(/\d+/g).map(Number); l = Math.min(100, l + 10); return `hsl(${h}, ${s}%, ${l}%)`; }
                    catch (e) { return color; }
                });

                const chartConfig = { /* ... (Chart.js config as before) ... */
                    type: 'pie',
                    data: { labels: labels, datasets: [{ label: 'Spending', data: amounts, backgroundColor: backgroundColors, hoverBackgroundColor: hoverBackgroundColors, borderColor: '#333', borderWidth: 1, hoverOffset: 8 }] },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'bottom', labels: { color: '#ddd', padding: 15, boxWidth: 12, usePointStyle: true, } },
                            title: { display: false, },
                            tooltip: {
                                backgroundColor: 'rgba(20, 20, 30, 0.8)', titleColor: '#eee', bodyColor: '#ddd',
                                callbacks: {
                                    label: function (context) {
                                        let label = context.label || ''; if (label) { label += ': '; }
                                        if (context.parsed !== null) {
                                            label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed);
                                            const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                                            const percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
                                            label += ` (${percentage}%)`;
                                        } return label;
                                    }
                                }
                            }
                        },
                        animation: { duration: CHART_ANIMATION_DURATION }
                    }
                };
                activeChartInstances[panelId] = new Chart(ctx, chartConfig);
                console.log(`Created chart for panel ${panelId}`);
            } else {
                contentContainer.innerHTML = '<p style="text-align: center; color: #bbb; padding: 15px 5px;">No spending data found matching the criteria.</p>';
            }
        }
        // --- Add rendering logic for other analysis types here ---
        else {
            if (analysisResult) {
                contentContainer.innerHTML = `<p style='text-align: center; color: orange; padding: 15px 5px;'>Data display not implemented for analysis type: ${analysisType}</p>`;
            } else {
                contentContainer.innerHTML = `<p style='text-align: center; color: orange; padding: 15px 5px;'>Received no data for analysis type: ${analysisType}</p>`;
            }
        }

    } catch (error) {
        console.error(`Failed to load content for panel ${panelId} (${analysisType}):`, error);
        contentContainer.innerHTML = `<p style='color: red; text-align: center; padding: 15px 5px;'>Error loading analysis data.<br><small>${error.message || 'Check console for details.'}</small></p>`;
        if (activeChartInstances[panelId]) {
            try { activeChartInstances[panelId].destroy(); } catch (e) { }
            delete activeChartInstances[panelId];
        }
    }
}


// --- Grid State & Layout ---

function checkGridEmpty() {
    if (!insightsGrid || !emptyMessage) return;
    const hasContent = insightsGrid.querySelector('.insight-panel:not(.dragging-placeholder)');
    emptyMessage.style.display = hasContent ? 'none' : 'block';
    if (!hasContent && emptyMessage.parentElement !== insightsGrid) {
        insightsGrid.appendChild(emptyMessage); // Ensure it's in the grid if empty
    }
}

function calculateGridCellLayout() {
    // ... (No changes needed in this function) ...
    if (!insightsGrid || !insightsGridContainer) {
        gridCellLayout = []; return;
    }
    gridCellLayout = [];
    gridComputedStyle = window.getComputedStyle(insightsGrid);
    if (window.innerWidth <= 768) { gridColCount = 1; }
    else {
        const gridTemplateColumns = gridComputedStyle.gridTemplateColumns;
        const columnMatch = gridTemplateColumns?.split(' ').filter(s => s !== '0px' && s !== 'auto');
        gridColCount = columnMatch ? columnMatch.length : 2;
    }
    const firstPanel = insightsGrid.querySelector('.insight-panel:not(.dragging-placeholder)');
    let sampleCellWidth = 250; let sampleCellHeight = 250; let sampleMargin = 10;
    if (firstPanel) {
        const panelRect = firstPanel.getBoundingClientRect(); const panelStyle = window.getComputedStyle(firstPanel);
        sampleCellWidth = panelRect.width; sampleCellHeight = panelRect.height; sampleMargin = parseInt(panelStyle.marginRight) || sampleMargin;
    } else {
        const gridWidth = insightsGrid.offsetWidth - parseInt(gridComputedStyle.paddingLeft) - parseInt(gridComputedStyle.paddingRight);
        if (gridWidth > 0 && gridColCount > 0) {
            const totalMarginSpace = (gridColCount > 1) ? (gridColCount - 1) * (2 * sampleMargin) : 0;
            sampleCellWidth = Math.max(200, (gridWidth - totalMarginSpace) / gridColCount); sampleCellHeight = sampleCellWidth * 1.0;
        }
    }
    const effectiveColGap = 2 * sampleMargin; const effectiveRowGap = 2 * sampleMargin;
    const startOffsetX = (parseInt(gridComputedStyle.paddingLeft) || 0) + sampleMargin; const startOffsetY = (parseInt(gridComputedStyle.paddingTop) || 0) + sampleMargin;
    const visiblePanels = Array.from(insightsGrid.children).filter(el => el.classList.contains('insight-panel') && !el.classList.contains('dragging-placeholder'));
    const estimatedRows = Math.max(1, Math.ceil((visiblePanels.length + 1) / gridColCount)) + 1;
    let currentX = startOffsetX; let currentY = startOffsetY;
    for (let r = 0; r < estimatedRows; r++) {
        currentX = startOffsetX;
        for (let c = 0; c < gridColCount; c++) {
            gridCellLayout.push({
                x: currentX - sampleMargin, y: currentY - sampleMargin, width: sampleCellWidth + 2 * sampleMargin, height: sampleCellHeight + 2 * sampleMargin,
                contentX: currentX, contentY: currentY, contentWidth: sampleCellWidth, contentHeight: sampleCellHeight
            }); currentX += sampleCellWidth + effectiveColGap;
        } currentY += sampleCellHeight + effectiveRowGap;
    }
}

function findNearestSlotIndex(pointerX, pointerY) {
    // ... (No changes needed in this function) ...
    let closestIndex = -1; let minDistSq = Infinity;
    if (!gridCellLayout || gridCellLayout.length === 0) {
        console.warn("findNearestSlotIndex called with no grid layout."); calculateGridCellLayout();
        if (!gridCellLayout || gridCellLayout.length === 0) { console.error("Grid layout unavailable."); return -1; }
    }
    gridCellLayout.forEach((slot, index) => {
        const slotContentCenterX = slot.contentX + slot.contentWidth / 2; const slotContentCenterY = slot.contentY + slot.contentHeight / 2;
        const distSq = (pointerX - slotContentCenterX) ** 2 + (pointerY - slotContentCenterY) ** 2;
        if (distSq < minDistSq) { minDistSq = distSq; closestIndex = index; }
    });
    const currentPanelCount = insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder)').length;
    return Math.min(closestIndex, currentPanelCount);
}


// --- Palette Preview Logic (Refactored for JSON data) ---

/**
 * Shows the preview popup next to the target palette item.
 * Reads structured data from data-* attributes and dynamically builds the preview HTML.
 *
 * @param {HTMLElement} targetPaletteItem The palette item being hovered.
 */
function showPalettePreview(targetPaletteItem) {
    // 1. Validate Inputs & State
    if (!palettePreviewContainer) {
        console.error("Preview failed: palettePreviewContainer element not found.");
        return;
    }
    if (!targetPaletteItem || isDragging || (palette && palette.classList.contains('collapsed') && window.innerWidth > 768)) {
        return; // Exit if no target, dragging, or palette collapsed
    }

    // 2. Read Structured Data from data-* attributes
    const { previewTitle, previewImageUrl, previewDescription } = targetPaletteItem.dataset;

    // 3. Validate required data
    if (!previewTitle || !previewDescription) { // Image is optional maybe? Adjust as needed
        console.warn("Preview skipped: Target item missing required data attributes (title, description).", targetPaletteItem.dataset);
        hidePalettePreview(); // Hide any previous preview
        return;
    }

    // 4. Clear Hide Timeout
    clearTimeout(previewHideTimeout);
    previewHideTimeout = null;

    console.log("Showing preview for:", previewTitle);

    // 5. Build Preview DOM Dynamically
    try {
        // Clear previous content safely
        palettePreviewContainer.innerHTML = '';

        // Create elements (example structure based on previous HTML)
        const innerDiv = document.createElement('div');
        innerDiv.className = 'preview-container-inner'; // Use classes for styling

        const titleEl = document.createElement('h3');
        titleEl.className = 'preview-title';
        titleEl.textContent = previewTitle; // Use textContent for safety
        innerDiv.appendChild(titleEl);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'preview-content';

        // Add image only if URL is provided
        if (previewImageUrl) {
            const imgEl = document.createElement('img');
            imgEl.src = previewImageUrl;
            imgEl.alt = `${previewTitle} preview`; // Basic alt text
            // Apply styling via CSS or inline if necessary
            imgEl.style.maxHeight = '120px';
            imgEl.style.width = 'auto';
            imgEl.style.display = 'block';
            imgEl.style.margin = '5px auto 8px'; // Example spacing
            imgEl.style.borderRadius = '3px';
            contentDiv.appendChild(imgEl);
        }

        const descEl = document.createElement('p');
        descEl.textContent = previewDescription; // Use textContent for safety
        contentDiv.appendChild(descEl);

        innerDiv.appendChild(contentDiv);
        palettePreviewContainer.appendChild(innerDiv); // Add the built structure

    } catch (error) {
        console.error("Error building preview DOM:", error);
        palettePreviewContainer.innerHTML = "<p style='color: red;'>Error loading preview.</p>";
    }

    // 6. Prepare for Positioning (make measurable but hidden)
    palettePreviewContainer.style.display = 'block';
    palettePreviewContainer.style.visibility = 'hidden';
    palettePreviewContainer.style.opacity = '0';
    palettePreviewContainer.style.transform = 'scale(0.95)';
    palettePreviewContainer.classList.remove('visible');

    // 7. Calculate Position and Animate In (using rAF)
    requestAnimationFrame(() => {
        if (!palettePreviewContainer || !targetPaletteItem) return; // Re-check elements

        const previewRect = palettePreviewContainer.getBoundingClientRect();
        const itemRect = targetPaletteItem.getBoundingClientRect();
        const containerRect = insightsView?.getBoundingClientRect()
            ?? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };

        // --- Position Calculation (Clamped to viewport) ---
        let left = itemRect.right + PREVIEW_GAP_TO_RIGHT;
        left = Math.max(containerRect.left + VIEWPORT_PADDING, left);
        left = Math.min(left, containerRect.right - previewRect.width - VIEWPORT_PADDING);

        let top = itemRect.top + (itemRect.height / 2) - (previewRect.height / 2);
        top = Math.max(containerRect.top + VIEWPORT_PADDING, top);
        top = Math.min(top, containerRect.bottom - previewRect.height - VIEWPORT_PADDING);
        // --- End Position Calculation ---

        const relLeft = left - containerRect.left;
        const relTop = top - containerRect.top;

        palettePreviewContainer.style.left = `${Math.round(relLeft)}px`;
        palettePreviewContainer.style.top = `${Math.round(relTop)}px`;
        palettePreviewContainer.style.visibility = 'visible'; // Make it visible now

        palettePreviewContainer.classList.add('visible');
        palettePreviewContainer.style.opacity = '1';
        palettePreviewContainer.style.transform = 'scale(1)';
    });
}

function scheduleHidePalettePreview() {
    clearTimeout(previewHideTimeout);
    previewHideTimeout = setTimeout(hidePalettePreview, PREVIEW_HIDE_DELAY + 100);
}

function hidePalettePreview() {
    clearTimeout(previewHideTimeout);
    previewHideTimeout = null;

    if (palettePreviewContainer && palettePreviewContainer.classList.contains('visible')) {
        palettePreviewContainer.classList.remove('visible');
        palettePreviewContainer.style.opacity = '0';
        palettePreviewContainer.style.transform = 'scale(0.95)';

        const computedStyle = getComputedStyle(palettePreviewContainer);
        const transitionDurations = computedStyle.transitionDuration.split(',').map(d => parseFloat(d) || 0);
        const transitionDelays = computedStyle.transitionDelay.split(',').map(d => parseFloat(d) || 0);
        let maxTotalDuration = 0;
        for (let i = 0; i < transitionDurations.length; i++) {
            maxTotalDuration = Math.max(maxTotalDuration, (transitionDurations[i] + transitionDelays[i]) * 1000);
        }

        setTimeout(() => {
            if (palettePreviewContainer && !palettePreviewContainer.classList.contains('visible')) {
                palettePreviewContainer.style.display = 'none';
                palettePreviewContainer.innerHTML = ''; // Clear content after hiding
            }
        }, maxTotalDuration || 300);
    } else if (palettePreviewContainer) {
        // Ensure it's hidden and clear content even if class wasn't present
        palettePreviewContainer.style.display = 'none';
        palettePreviewContainer.innerHTML = '';
    }
}

function cancelHidePreview() {
    clearTimeout(previewHideTimeout);
    previewHideTimeout = null;
}


// --- Drag and Drop Logic ---

function onPointerDown(event) {
    // ... (No changes needed in this function for preview refactor) ...
    if (event.button !== 0 || isDragging) return;
    if (event.target.closest('.panel-action-btn, .add-analysis-btn, .palette-toggle-btn')) { return; }

    const panelHeader = event.target.closest('.panel-header');
    const paletteItem = event.target.closest('.palette-item');

    if (panelHeader) {
        const panel = panelHeader.closest('.insight-panel:not(.dragging-placeholder)');
        if (panel && panel.dataset.panelId) { initiateDrag(event, panel, 'grid'); }
    } else if (paletteItem && !palette?.classList.contains('collapsed')) {
        if (paletteItem.dataset.analysisType) { initiateDrag(event, paletteItem, 'palette'); }
    }
}

function initiateDrag(event, element, type) {
    // ... (No changes needed in this function for preview refactor) ...
    event.preventDefault(); event.stopPropagation();
    hidePalettePreview(); // Ensure preview hides on drag start

    isDragging = true; dragType = type; sourceElement = element;
    startClientX = event.clientX; startClientY = event.clientY;

    calculateGridCellLayout();

    placeholderElement = document.createElement('div');
    placeholderElement.className = 'insight-panel dragging-placeholder';

    let elementRect;
    if (dragType === 'grid') {
        originalSourceElement = sourceElement;
        elementRect = originalSourceElement.getBoundingClientRect();
        const gridContainerRect = insightsGridContainer.getBoundingClientRect();
        const initialX = (elementRect.left - gridContainerRect.left + insightsGridContainer.scrollLeft) + elementRect.width / 2;
        const initialY = (elementRect.top - gridContainerRect.top + insightsGridContainer.scrollTop) + elementRect.height / 2;
        sourceIndex = findNearestSlotIndex(initialX, initialY);
        currentTargetIndex = sourceIndex;
        if (originalSourceElement.parentElement) { originalSourceElement.parentElement.replaceChild(placeholderElement, originalSourceElement); }
        else { console.error("Cannot replace original element, parent not found."); isDragging = false; return; }
        draggedElementClone = originalSourceElement.cloneNode(true);
        draggedElementClone.classList.remove('dragging-placeholder');
        offsetX = startClientX - elementRect.left; offsetY = startClientY - elementRect.top;
    } else { // dragType === 'palette'
        originalSourceElement = null;
        const analysisType = sourceElement.dataset.analysisType; const title = sourceElement.dataset.title; const description = sourceElement.dataset.description;
        if (!analysisType || !title) { console.warn("Palette item missing data attributes."); isDragging = false; return; }
        const tempPanelData = { id: 'temp-drag', analysis_type: analysisType, title: title, description: description };
        const tempPanelElement = createInsightPanelElement(tempPanelData); // Uses placeholder HTML from data attr now
        tempPanelElement.style.position = 'absolute'; tempPanelElement.style.visibility = 'hidden';
        tempPanelElement.style.width = 'auto'; tempPanelElement.style.height = 'auto';
        tempPanelElement.style.minWidth = '250px'; tempPanelElement.style.margin = '0';
        document.body.appendChild(tempPanelElement); const cloneRect = tempPanelElement.getBoundingClientRect(); document.body.removeChild(tempPanelElement);
        draggedElementClone = createInsightPanelElement(tempPanelData); // Create actual clone
        elementRect = cloneRect;
        sourceIndex = -1; currentTargetIndex = -1;
        offsetX = Math.min(elementRect.width * 0.15, 30); offsetY = Math.min(elementRect.height * 0.15, 20);
        elementRect = { left: startClientX - offsetX, top: startClientY - offsetY, width: elementRect.width, height: elementRect.height };
    }

    draggedElementClone.classList.add('dragging-clone'); draggedElementClone.style.position = 'fixed';
    draggedElementClone.style.zIndex = '1000'; draggedElementClone.style.pointerEvents = 'none';
    draggedElementClone.style.width = `${elementRect.width}px`; draggedElementClone.style.height = `${elementRect.height}px`;
    draggedElementClone.style.left = `${elementRect.left}px`; draggedElementClone.style.top = `${elementRect.top}px`;
    document.body.appendChild(draggedElementClone);

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp, { once: true });
    document.addEventListener('contextmenu', preventContextMenuDuringDrag, { capture: true });
}

function onPointerMove(event) {
    // ... (No changes needed in this function for preview refactor) ...
    if (!isDragging || !draggedElementClone) return;
    const currentClientX = event.clientX; const currentClientY = event.clientY;
    cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(() => {
        draggedElementClone.style.left = `${currentClientX - offsetX}px`;
        draggedElementClone.style.top = `${currentClientY - offsetY}px`;
        gridRect = insightsGridContainer.getBoundingClientRect();
        const pointerXInGridContainer = currentClientX - gridRect.left; const pointerYInGridContainer = currentClientY - gridRect.top;
        const isOverGridContainer = currentClientX >= gridRect.left && currentClientX <= gridRect.right && currentClientY >= gridRect.top && currentClientY <= gridRect.bottom;
        let nearestIndex = -1;
        if (isOverGridContainer) {
            const pointerXInGrid = pointerXInGridContainer + insightsGridContainer.scrollLeft; const pointerYInGrid = pointerYInGridContainer + insightsGridContainer.scrollTop;
            nearestIndex = findNearestSlotIndex(pointerXInGrid, pointerYInGrid);
        }
        if (isOverGridContainer && nearestIndex !== -1) {
            const needsMove = (nearestIndex !== currentTargetIndex || !placeholderElement.parentElement);
            if (needsMove) { insertElementAtIndex(placeholderElement, nearestIndex); currentTargetIndex = nearestIndex; }
        } else {
            if (placeholderElement.parentElement) { placeholderElement.remove(); }
            currentTargetIndex = -1;
        }
        if (isOverGridContainer) { handleGridScroll(currentClientY, gridRect); }
    });
}

function handleGridScroll(clientY, gridRect) {
    // ... (No changes needed in this function) ...
    const scrollSpeed = 15 * SCROLL_SPEED_MULTIPLIER; let scrollDelta = 0;
    if (clientY < gridRect.top + SCROLL_THRESHOLD) { const proximityFactor = 1 - Math.max(0, clientY - gridRect.top) / SCROLL_THRESHOLD; scrollDelta = -scrollSpeed * (1 + proximityFactor); }
    else if (clientY > gridRect.bottom - SCROLL_THRESHOLD) { const proximityFactor = 1 - Math.max(0, gridRect.bottom - clientY) / SCROLL_THRESHOLD; scrollDelta = scrollSpeed * (1 + proximityFactor); }
    if (scrollDelta !== 0) { insightsGridContainer.scrollTop += scrollDelta; }
}

async function onPointerUp(event) {
    // ... (No changes needed in this function for preview refactor) ...
    if (!isDragging) return;
    const panelIdBeingDragged = (dragType === 'grid' && originalSourceElement) ? originalSourceElement.dataset.panelId : null;
    cancelAnimationFrame(animationFrameId);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('contextmenu', preventContextMenuDuringDrag, { capture: true });
    if (draggedElementClone) { draggedElementClone.remove(); draggedElementClone = null; }
    const droppedInsideGrid = currentTargetIndex !== -1 && placeholderElement && placeholderElement.parentElement === insightsGrid;
    let finalPanelElement = null; let addedPanelData = null;
    try {
        if (droppedInsideGrid) {
            if (dragType === 'palette') {
                const analysisType = sourceElement.dataset.analysisType;
                try {
                    addedPanelData = await addPanelToServer(analysisType);
                    if (!addedPanelData || !addedPanelData.id) { throw new Error("Failed to create panel: Invalid data from server."); }
                    finalPanelElement = createInsightPanelElement(addedPanelData); // This now loads content correctly
                    placeholderElement.replaceWith(finalPanelElement); placeholderElement = null;
                    const finalPanelIds = Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder)')).map(p => p.dataset.panelId);
                    await updatePanelOrderOnServer(finalPanelIds);
                } catch (error) {
                    console.error("Error adding panel via drag/drop:", error); placeholderElement?.remove(); addedPanelData = null; finalPanelElement = null;
                    alert(`Error adding panel: ${error.message}`);
                }
            } else if (dragType === 'grid' && originalSourceElement) {
                originalSourceElement.style = ''; placeholderElement.replaceWith(originalSourceElement);
                finalPanelElement = originalSourceElement; placeholderElement = null;
                const finalPanelIds = Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder)')).map(p => p.dataset.panelId);
                await updatePanelOrderOnServer(finalPanelIds);
                // Optional: Reload content if needed after move: loadPanelContent(finalPanelElement);
            }
        } else { // Dropped Outside Grid
            if (dragType === 'grid' && originalSourceElement) {
                originalSourceElement.style = ''; insertElementAtIndex(originalSourceElement, sourceIndex);
                const panelId = originalSourceElement.dataset.panelId;
                if (panelId) { console.warn(`Panel ${panelId} dropped outside, reloading content.`); loadPanelContent(originalSourceElement); }
            }
            placeholderElement?.remove(); placeholderElement = null;
        }
    } catch (apiError) {
        console.error("API Error during panel drop/reorder:", apiError); alert(`Error saving changes: ${apiError.message}`);
        if (dragType === 'palette' && droppedInsideGrid) { placeholderElement?.remove(); }
        if (dragType === 'grid' && originalSourceElement) {
            insertElementAtIndex(originalSourceElement, sourceIndex); placeholderElement?.remove();
            if (originalSourceElement.dataset.panelId) { loadPanelContent(originalSourceElement); }
        }
        finalPanelElement = null; addedPanelData = null;
    } finally {
        isDragging = false; sourceElement = null; originalSourceElement = null; placeholderElement = null; sourceIndex = -1; dragType = null; currentTargetIndex = -1;
        setTimeout(() => {
            calculateGridCellLayout(); checkGridEmpty();
            const currentPanelIds = new Set(Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder)')).map(p => p.dataset.panelId));
            for (const panelId in activeChartInstances) {
                if (!currentPanelIds.has(panelId)) {
                    try { activeChartInstances[panelId].destroy(); } catch (e) { }
                    delete activeChartInstances[panelId]; console.log(`Cleaned up orphaned chart for panel ${panelId}`);
                }
            }
        }, 50);
    }
}

function preventContextMenuDuringDrag(event) {
    if (isDragging) { event.preventDefault(); event.stopPropagation(); }
}

function insertElementAtIndex(elementToInsert, targetIndex) {
    // ... (No changes needed in this function) ...
    const currentPanels = Array.from(insightsGrid.children).filter(el => el.classList.contains('insight-panel') && el !== elementToInsert);
    targetIndex = Math.max(0, Math.min(targetIndex, currentPanels.length));
    const referenceElement = (targetIndex < currentPanels.length) ? currentPanels[targetIndex] : emptyMessage;
    let needsInsert = true;
    if (referenceElement && referenceElement.parentElement === insightsGrid) { if (referenceElement.previousElementSibling === elementToInsert) { needsInsert = false; } }
    else {
        const lastPanelElement = Array.from(insightsGrid.children).filter(el => el.classList.contains('insight-panel') && !el.classList.contains('insights-empty-message')).pop();
        if (lastPanelElement === elementToInsert) { needsInsert = false; }
        else if (!lastPanelElement && insightsGrid.firstElementChild === elementToInsert && !elementToInsert.classList.contains('insights-empty-message')) { needsInsert = false; }
    }
    if (!elementToInsert.parentElement || elementToInsert.parentElement !== insightsGrid) { needsInsert = true; }
    if (needsInsert) {
        if (referenceElement && referenceElement.parentElement === insightsGrid) { insightsGrid.insertBefore(elementToInsert, referenceElement); }
        else {
            insightsGrid.appendChild(elementToInsert);
            if (emptyMessage && emptyMessage.parentElement !== insightsGrid) { insightsGrid.appendChild(emptyMessage); }
        }
    }
}

// --- Panel Actions & Palette Toggle ---

async function handlePanelAction(event) {
    // ... (No changes needed in this function) ...
    const removeButton = event.target.closest('.remove-panel-btn'); const shareButton = event.target.closest('.share-panel-btn');
    const panel = event.target.closest('.insight-panel');
    if (!panel || !panel.dataset.panelId || panel.classList.contains('dragging-placeholder')) return;
    const panelId = panel.dataset.panelId;
    if (removeButton && panelId) {
        if (activeChartInstances[panelId]) {
            try { activeChartInstances[panelId].destroy(); console.log(`Destroyed chart for panel ${panelId} before removal.`); }
            catch (e) { console.error("Error destroying chart:", e); }
            delete activeChartInstances[panelId];
        }
        panel.remove(); checkGridEmpty(); calculateGridCellLayout();
        try { await removePanelFromServer(parseInt(panelId)); console.log(`Panel ${panelId} removed from server.`); }
        catch (error) { console.error(`Failed to remove panel ${panelId} from server:`, error); alert(`Error removing panel: ${error.message}. Please refresh.`); }
    } else if (shareButton) { alert(`Sharing panel '${panel.querySelector('.panel-title')?.textContent || 'N/A'}' (ID: ${panelId}) - Feature not implemented.`); }
}

function makePanelDraggable(panelElement) {
    // ... (No changes needed in this function) ...
    const header = panelElement.querySelector('.panel-header');
    if (header) { header.removeEventListener('pointerdown', onPointerDown); header.addEventListener('pointerdown', onPointerDown); }
    else { console.warn("Panel header not found for making draggable:", panelElement); }
}

// --- Palette & Resize ---

function debounce(func, wait) {
    // ... (No changes needed in this function) ...
    let timeout; return function executedFunction(...args) { const later = () => { clearTimeout(timeout); func(...args); }; clearTimeout(timeout); timeout = setTimeout(later, wait); };
}

function handlePaletteToggle(forceState = null) {
    // ... (No changes needed in this function) ...
    if (!palette || !paletteToggleBtn) return; hidePalettePreview();
    const currentCollapsedState = palette.classList.contains('collapsed'); let shouldBeCollapsed;
    if (forceState !== null) { shouldBeCollapsed = (forceState === 'close'); } else { shouldBeCollapsed = !currentCollapsedState; }
    if (shouldBeCollapsed === currentCollapsedState) return;
    if (shouldBeCollapsed) { palette.classList.add('collapsed'); insightsView?.classList.add('palette-collapsed'); }
    else { palette.classList.remove('collapsed'); insightsView?.classList.remove('palette-collapsed'); }
    updateToggleButtonIcon();
    const transitionDuration = parseFloat(getComputedStyle(palette).transitionDuration) * 1000;
    setTimeout(() => { calculateGridCellLayout(); }, transitionDuration || 350);
}

function updateToggleButtonIcon() {
    // ... (No changes needed in this function) ...
    if (!palette || !paletteToggleBtn) return; const isMobile = window.innerWidth <= 768; const isCollapsed = palette.classList.contains('collapsed');
    const icon = paletteToggleBtn.querySelector('i'); if (!icon) return;
    if (isMobile) { icon.className = `fas ${isCollapsed ? 'fa-chevron-up' : 'fa-chevron-down'}`; }
    else { icon.className = `fas ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`; }
    const label = isCollapsed ? 'Expand Palette' : 'Collapse Palette'; paletteToggleBtn.setAttribute('aria-label', label); paletteToggleBtn.setAttribute('title', label);
}

// --- Initialization and Event Setup ---

function setupEventListeners() {
    if (!insightsView) { console.error("Insights view not found, cannot setup listeners."); return; }

    // --- Palette Header & Toggle Button ---
    if (paletteHeader && paletteToggleBtn) {
        paletteHeader.addEventListener('click', (event) => { if (paletteToggleBtn.contains(event.target) || event.target.closest('.add-analysis-btn')) { return; } handlePaletteToggle(); });
        paletteToggleBtn.addEventListener('click', (event) => { event.stopPropagation(); handlePaletteToggle(); });
    } else { console.warn("Palette header or toggle button not found."); }

    // --- Palette Items (Drag Start, Preview, Add Button) ---
    if (paletteScrollContainer) {
        // Drag start
        paletteScrollContainer.addEventListener('pointerdown', onPointerDown);

        // Show preview on hover (uses refactored showPalettePreview)
        paletteScrollContainer.addEventListener('mouseover', (event) => {
            if (isDragging || (palette && palette.classList.contains('collapsed') && window.innerWidth > 768)) return;
            const targetItem = event.target.closest('.palette-item');
            if (targetItem) {
                showPalettePreview(targetItem); // Will now read data-* and build DOM
            }
        });

        // Hide preview on mouseout
        paletteScrollContainer.addEventListener('mouseout', (event) => {
            if (isDragging) return;
            const targetItem = event.target.closest('.palette-item');
            const relatedTarget = event.relatedTarget;
            if (targetItem && !targetItem.contains(relatedTarget) && !palettePreviewContainer?.contains(relatedTarget)) {
                scheduleHidePalettePreview();
            }
        });

        // '+' Add Analysis Button Click
        paletteScrollContainer.addEventListener('click', async (event) => {
            const addButton = event.target.closest('.add-analysis-btn');
            if (addButton && !isDragging) {
                const item = addButton.closest('.palette-item');
                if (item && item.dataset.analysisType) {
                    const analysisType = item.dataset.analysisType;
                    addButton.disabled = true; addButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    let newPanelElement = null;
                    try {
                        const newPanelData = await addPanelToServer(analysisType);
                        if (!newPanelData || !newPanelData.id) throw new Error("Failed to add panel: Invalid response.");
                        newPanelElement = createInsightPanelElement(newPanelData);
                        if (emptyMessage && emptyMessage.parentElement === insightsGrid) { insightsGrid.insertBefore(newPanelElement, emptyMessage); }
                        else { insightsGrid.appendChild(newPanelElement); }
                        checkGridEmpty(); calculateGridCellLayout();
                        const finalPanelIds = Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder)')).map(p => p.dataset.panelId);
                        await updatePanelOrderOnServer(finalPanelIds);
                        setTimeout(() => { newPanelElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 100);
                    } catch (error) {
                        console.error("Error adding panel via '+' button:", error); alert(`Failed to add panel: ${error.message || 'Server error'}`); newPanelElement?.remove();
                    } finally { addButton.disabled = false; addButton.innerHTML = '+'; }
                }
            }
        });
    } else { console.warn("Palette scroll container not found."); }

    // --- Palette Preview Container (Cancel Hide on Hover) ---
    if (palettePreviewContainer) {
        palettePreviewContainer.addEventListener('mouseleave', (event) => {
            const relatedTarget = event.relatedTarget;
            if (!relatedTarget || !relatedTarget.closest('.palette-item')) { scheduleHidePalettePreview(); }
        });
        palettePreviewContainer.addEventListener('mouseenter', cancelHidePreview);
    } else { console.warn("Palette preview container not found, hover previews will not work."); }

    // --- Insights Grid (Panel Actions & Initial Load) ---
    if (insightsGrid) {
        insightsGrid.addEventListener('click', handlePanelAction);
        // Initialize existing panels (make draggable, load content)
        insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder)').forEach(panel => {
            if (panel.dataset.panelId) { makePanelDraggable(panel); loadPanelContent(panel); }
            else { console.warn("Found grid panel without panel ID:", panel); } // Warn if ID missing
        });
    } else { console.warn("Insights grid element not found."); }

    // --- Window Resize ---
    window.addEventListener('resize', debounce(() => {
        console.log("Window resized, recalculating layout."); hidePalettePreview(); calculateGridCellLayout(); updateToggleButtonIcon();
    }, 250));

    // --- Grid Container Scroll ---
    insightsGridContainer?.addEventListener('scroll', debounce(() => { if (!isDragging) { hidePalettePreview(); } }, 100));

    console.log("Insights event listeners attached.");
}

// --- initInsightsManager: Initialize the module ---
export function initInsightsManager() {
    console.log("Initializing Insights Manager (JSON Preview Data)...");

    insightsView = document.getElementById('insights-view');
    insightsGridContainer = document.getElementById('insights-grid-container');
    insightsGrid = document.getElementById('insights-grid');
    palette = document.getElementById('analysis-palette');
    paletteHeader = document.getElementById('palette-header');
    paletteToggleBtn = document.getElementById('palette-toggle-btn');
    paletteScrollContainer = document.getElementById('palette-scroll-container');
    emptyMessage = document.getElementById('insights-empty-message');
    palettePreviewContainer = document.getElementById('palette-preview-container'); // CRITICAL assignment

    const criticalElements = { insightsView, insightsGridContainer, insightsGrid, palette, paletteHeader, paletteToggleBtn, paletteScrollContainer, palettePreviewContainer, emptyMessage };
    let missingElement = false;
    for (const key in criticalElements) {
        if (!criticalElements[key]) {
            const idSelector = key.replace(/([A-Z])/g, '-$1').toLowerCase();
            console.error(`Insights Manager init failed: Element with ID '${idSelector}' not found.`);
            missingElement = true;
        }
    }
    if (missingElement) { console.error("Aborting Insights Manager initialization."); return; }

    if (!document.querySelector('meta[name="csrf-token"]')) { console.warn("CSRF token meta tag not found."); }
    if (typeof Chart === 'undefined') { console.error("Chart.js library not found."); }

    calculateGridCellLayout();
    checkGridEmpty();
    setupEventListeners(); // Setup listeners after finding elements

    isDragging = false; draggedElementClone?.remove();
    document.querySelectorAll('.dragging-placeholder').forEach(el => el.remove());
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('contextmenu', preventContextMenuDuringDrag, { capture: true });
    hidePalettePreview(); // Ensure preview is hidden initially

    const isInitiallyCollapsed = palette.classList.contains('collapsed');
    insightsView?.classList.toggle('palette-collapsed', isInitiallyCollapsed);
    updateToggleButtonIcon();

    console.log("Insights Manager Initialized Successfully.");
}

// --- END OF FILE insightsManager.js ---