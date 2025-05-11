// --- START OF FILE insightsManager.js ---

// DOM Elements & State
let insightsView = null, insightsGridContainer = null, insightsGrid = null, palette = null, paletteHeader = null, paletteToggleBtn = null, paletteScrollContainer = null, emptyMessage = null, palettePreviewContainer = null;
let isDragging = false, draggedElement = null, placeholderElement = null, originalSourceElementForGridDrag = null;
let sourceIndex = -1, currentTargetIndex = -1, dragType = null, startClientX = 0, startClientY = 0, offsetX = 0, offsetY = 0;
let gridRect = null, paletteRect = null, animationFrameId = null;
let activeChartInstances = {};
let userGroupsCache = [];
let gridCellLayout = [], gridComputedStyle = null, gridColCount = 2;
let previewHideTimeout = null;
const PREVIEW_HIDE_DELAY = 150, PREVIEW_GAP_TO_RIGHT = 12, VIEWPORT_PADDING = 15;
const SCROLL_THRESHOLD = 40, SCROLL_SPEED_MULTIPLIER = 0.15, API_BASE = '/api', CHART_ANIMATION_DURATION = 400, DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
let chartInDraggedElement = null;

// --- Helper Functions ---
function generateUniqueId(prefix = 'panel') { return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`; }

// --- API Interaction Helpers ---
async function fetchApi(url, options = {}) {
    const defaultHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (options.method && !['GET', 'HEAD'].includes(options.method.toUpperCase())) {
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
        if (csrfToken) defaultHeaders['X-CSRFToken'] = csrfToken;
    }
    options.headers = { ...defaultHeaders, ...options.headers };
    if (options.body && typeof options.body !== 'string') options.body = JSON.stringify(options.body);
    try {
        const response = await fetch(url, options);
        if (!response.ok) { let errorData = { error: `Request failed (${response.status})` }; try { errorData = await response.json(); } catch (e) {} throw new Error(errorData.error || `HTTP error ${response.status}`);}
        if (response.status === 204 || response.headers.get('content-length') === '0') return null;
        return await response.json();
    } catch (error) { console.error(`[API] Network/API error on ${options.method || 'GET'} ${url}:`, error); throw error; }
}
async function addPanelToServer(analysisType, config = {}) { return await fetchApi(`${API_BASE}/insights/panels`, { method: 'POST', body: { analysis_type: analysisType, configuration: config } }); }
async function removePanelFromServer(panelIdInt) { return await fetchApi(`${API_BASE}/insights/panels/${panelIdInt}`, { method: 'DELETE' }); }
async function updatePanelOrderOnServer(panelIdInts) { return await fetchApi(`${API_BASE}/insights/panels/order`, { method: 'PUT', body: { panel_ids: panelIdInts } }); }
async function updatePanelConfigurationOnServer(panelIdInt, newConfig) { return await fetchApi(`${API_BASE}/insights/panels/${panelIdInt}`, { method: 'PATCH', body: { configuration: newConfig } }); }
async function fetchAnalysisData(analysisType, panelIdInt = null) {
    let url = `${API_BASE}/analysis/data/${analysisType}`;
    if (panelIdInt !== null && typeof panelIdInt === 'number' && !isNaN(panelIdInt)) {
        url += `?panel_id=${panelIdInt}`;
    }
    return await fetchApi(url);
}
async function fetchUserGroups() { if (userGroupsCache.length > 0) return userGroupsCache; try { const groups = await fetchApi('/api/groups'); userGroupsCache = groups || []; return userGroupsCache; } catch (error) { console.error("Failed to fetch user groups:", error); return []; } }

// --- Panel Creation & Content Loading ---
function createInsightPanelElement(panelData, isForPaletteDragClone = false) {
    const panelIdStr = String(panelData.id);
    const panel = document.createElement('div');
    panel.className = 'insight-panel glassy';
    panel.dataset.panelId = panelIdStr;
    panel.dataset.analysisType = panelData.analysis_type;
    if(panelData.title) panel.dataset.title = panelData.title;
    panel.dataset.configuration = JSON.stringify(panelData.configuration || {});

    const analysisDetails = getAnalysisDetails(panelData.analysis_type);
    const panelTitleText = panelData.title || analysisDetails?.title || 'Analysis';
    const placeholderHtml = analysisDetails?.placeholder_html || `<div class='loading-placeholder'><i class='fas fa-spinner fa-spin fa-2x'></i><p>Loading data...</p></div>`;

    const showControls = !isForPaletteDragClone;
    const controlsHtml = showControls ? `
        <button class="panel-action-btn panel-config-toggle-btn" aria-label="Toggle Configuration" title="Configure Panel"><i class="fas fa-cog"></i></button>
        <button class="panel-action-btn panel-close-btn" aria-label="Remove Panel" title="Remove Panel"><i class="fas fa-times"></i></button>
        <div class="panel-config-area">
            <div class="panel-config-controls">
                <div class="config-group-selector"><label for="group-select-${panelIdStr}">Filter by Group:</label><select id="group-select-${panelIdStr}" name="group_id"><option value="all">All My Groups</option></select></div>
                <div class="config-time-selector"><label for="time-slider-${panelIdStr}">Filter by Time Period:</label><div id="time-slider-${panelIdStr}" class="time-range-slider-placeholder"></div><div id="time-slider-display-${panelIdStr}" class="time-slider-display">Loading range...</div></div>
            </div>
        </div>` : '';
    const shareButtonHtml = showControls ? `<button class="panel-action-btn panel-share-btn" aria-label="Share Panel" title="Share Panel"><i class="fas fa-share-alt"></i></button>` : '';
    // Config summary for palette drag clone will be set by _updatePanelConfigSummary after its (default) config is known.
    // For other temp panels (like the grid placeholder itself, though it's not an insight-panel), "Drop to add panel" is fine.
    // For real panels, "Loading configuration..." is the initial state.
    const configSummaryText = isForPaletteDragClone ? "Loading default view..." : (panelIdStr.startsWith('temp-') ? 'Drop to add panel' : 'Loading configuration...');

    panel.innerHTML = `
        ${controlsHtml}
        <div class="panel-main-content-wrapper"><h3 class="panel-dynamic-title">${panelTitleText}</h3><div class="panel-config-summary">${configSummaryText}</div><div class="panel-content"><div class="placeholder-chart">${placeholderHtml}</div></div></div>
        ${shareButtonHtml}`;

    if (showControls) {
        makePanelDraggable(panel);
    }
    return panel;
}

function _updatePanelConfigSummary(panelElement) {
    if (!panelElement) return; const summaryElement = panelElement.querySelector('.panel-config-summary'); if (!summaryElement) return;
    const panelIdStr = panelElement.dataset.panelId;

    if (panelIdStr.startsWith('temp-live-')) { // Palette drag clone
        const panelConfig = JSON.parse(panelElement.dataset.configuration || '{}'); // Should be default config
        const analysisDetails = getAnalysisDetails(panelElement.dataset.analysisType);
        const defaultConfig = analysisDetails?.default_config || {};
        const effectiveConfig = { ...defaultConfig, ...panelConfig };

        let groupDisplay = "All Groups";
        if (effectiveConfig.group_id && effectiveConfig.group_id !== "all") {
            const group = userGroupsCache.find(g => String(g.id) === String(effectiveConfig.group_id));
            groupDisplay = group ? group.name : `Group ID: ${effectiveConfig.group_id}`;
        } else { groupDisplay = "All Groups"; } // Explicitly default

        let dateRangeDisplay = "All Time";
        if (effectiveConfig.time_period !== 'all_time' && effectiveConfig.startDate && effectiveConfig.endDate) {
            const startDate = new Date(effectiveConfig.startDate + 'T00:00:00Z');
            const endDate = new Date(effectiveConfig.endDate + 'T00:00:00Z');
            const options = { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' };
            if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
                dateRangeDisplay = `${startDate.toLocaleDateString(undefined, options)} - ${endDate.toLocaleDateString(undefined, options)}`;
            } else { dateRangeDisplay = "Invalid Dates"; }
        } else { dateRangeDisplay = "All Time"; }  // Explicitly default for all_time or missing dates
        summaryElement.textContent = `${groupDisplay} | ${dateRangeDisplay}`;
        return;
    }

    if (panelIdStr.startsWith('temp-') && !panelIdStr.startsWith('temp-live-')) {
        summaryElement.textContent = 'Drop to add panel'; // For placeholder in grid, etc.
        return;
    }

    // Persisted panels logic (same as V32.5)
    const panelConfig = JSON.parse(panelElement.dataset.configuration || '{}');
    const groupSelect = panelElement.querySelector(`#group-select-${panelIdStr}`); let groupDisplay = "All Groups";
    if (panelConfig.group_id && panelConfig.group_id !== "all") { if (groupSelect && groupSelect.value !== "all") { const selectedOption = groupSelect.options[groupSelect.selectedIndex]; groupDisplay = selectedOption ? selectedOption.text : `Group ID: ${panelConfig.group_id}`; } else if (userGroupsCache.length > 0) { const group = userGroupsCache.find(g => String(g.id) === String(panelConfig.group_id)); groupDisplay = group ? group.name : `Group ID: ${panelConfig.group_id}`; } else { groupDisplay = `Group ID: ${panelConfig.group_id}`; }} else if (groupSelect && groupSelect.value !== "all") { const selectedOption = groupSelect.options[groupSelect.selectedIndex]; groupDisplay = selectedOption ? selectedOption.text : "Selected Group"; }
    let dateRangeDisplay = "All Time";
    if (panelConfig.time_period !== 'all_time' && panelConfig.startDate && panelConfig.endDate) { const startDate = new Date(panelConfig.startDate + 'T00:00:00Z'); const endDate = new Date(panelConfig.endDate + 'T00:00:00Z'); const options = { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }; if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) { dateRangeDisplay = `${startDate.toLocaleDateString(undefined, options)} - ${endDate.toLocaleDateString(undefined, options)}`; } else { dateRangeDisplay = "Invalid Config Dates"; }} else { const sliderElement = panelElement.querySelector(`#time-slider-${panelIdStr}`); if (sliderElement && sliderElement.noUiSlider && sliderElement.noUiSlider.options) { try { const [s, e] = sliderElement.noUiSlider.get(); const sliderOpts = sliderElement.noUiSlider.options; if (s === new Date(sliderOpts.range.min).toISOString().split('T')[0] && e === new Date(sliderOpts.range.max).toISOString().split('T')[0]) { dateRangeDisplay = "All Time"; } else if (s !== "ERR_NaN" && e !== "ERR_NaN") { const sd = new Date(s + 'T00:00:00Z'), ed = new Date(e + 'T00:00:00Z'); const opts = { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }; dateRangeDisplay = (isNaN(sd.getTime()) || isNaN(ed.getTime())) ? "Invalid Range" : `${sd.toLocaleDateString(undefined, opts)} - ${ed.toLocaleDateString(undefined, opts)}`; } else { dateRangeDisplay = "Invalid Range"; }} catch (err) { dateRangeDisplay = "Error reading range";}}}
    summaryElement.textContent = `${groupDisplay} | ${dateRangeDisplay}`;
}

function _initializePanelConfigurationControls(panelElement, panelDataForControls) {
    const panelIdStr = String(panelDataForControls.id);
    if (panelIdStr.startsWith('temp-')) return; // No controls for temp elements, including palette drag clones

    const analysisType = panelDataForControls.analysis_type; const analysisDetails = getAnalysisDetails(analysisType);
    const defaultConfig = analysisDetails?.default_config || {};
    const currentConfig = { ...defaultConfig, ...(panelDataForControls.configuration || {}) };
    panelElement.dataset.configuration = JSON.stringify(currentConfig);

    const groupSelect = panelElement.querySelector(`#group-select-${panelIdStr}`);
    if (groupSelect) {
        while (groupSelect.options.length > 1) groupSelect.remove(1);
        userGroupsCache.forEach(group => groupSelect.add(new Option(group.name, group.id)));
        groupSelect.value = String(currentConfig.group_id || "all");
        groupSelect.removeEventListener('change', _configChangeHandler);
        groupSelect.addEventListener('change', _configChangeHandler);
    }

    const sliderElement = panelElement.querySelector(`#time-slider-${panelIdStr}`);
    const sliderDisplayElement = panelElement.querySelector(`#time-slider-display-${panelIdStr}`);
    if (sliderElement && sliderDisplayElement && typeof noUiSlider !== 'undefined') {
        if (sliderElement.noUiSlider) sliderElement.noUiSlider.destroy();
        const todayDate = new Date();
        let maxTimestamp = Date.UTC(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
        const twoYearsAgoDate = new Date(todayDate); twoYearsAgoDate.setFullYear(todayDate.getFullYear() - 2);
        let minTimestamp = Date.UTC(twoYearsAgoDate.getFullYear(), twoYearsAgoDate.getMonth(), twoYearsAgoDate.getDate());
        if (isNaN(minTimestamp) || isNaN(maxTimestamp) || minTimestamp >= maxTimestamp) { maxTimestamp = new Date().getTime(); minTimestamp = maxTimestamp - (2 * 365 * DAY_IN_MILLISECONDS); }
        let initialStart = minTimestamp, initialEnd = maxTimestamp;
        if (currentConfig.time_period === 'all_time' || (!currentConfig.startDate && !currentConfig.endDate && currentConfig.time_period !== 'custom')) {}
        else if (currentConfig.startDate && currentConfig.endDate) { let pS = new Date(currentConfig.startDate + 'T00:00:00Z').getTime(); let pE = new Date(currentConfig.endDate + 'T00:00:00Z').getTime(); if (!isNaN(pS) && !isNaN(pE) && pS <= pE) { initialStart = Math.max(minTimestamp, pS); initialEnd = Math.min(maxTimestamp, pE); if (initialStart > initialEnd) { initialStart = minTimestamp; initialEnd = maxTimestamp; }}}
        if (initialStart >= initialEnd) { initialEnd = initialStart + DAY_IN_MILLISECONDS; initialEnd = Math.min(initialEnd, maxTimestamp); if (initialStart >= initialEnd) initialStart = initialEnd - DAY_IN_MILLISECONDS; }
        try {
            noUiSlider.create(sliderElement, { start: [initialStart, initialEnd], connect: true, range: { 'min': minTimestamp, 'max': maxTimestamp }, step: DAY_IN_MILLISECONDS, format: { to: v=>new Date(Math.round(parseFloat(v)/DAY_IN_MILLISECONDS)*DAY_IN_MILLISECONDS).toISOString().split('T')[0], from: s=>new Date(s+'T00:00:00Z').getTime()||minTimestamp }, behaviour: 'tap-drag', pips: {mode:'positions',values:[0,25,50,75,100],density:4,format:{to:v=>new Date(Math.round(parseFloat(v)/DAY_IN_MILLISECONDS)*DAY_IN_MILLISECONDS).toLocaleDateString(undefined,{month:'short',year:'2-digit',timeZone:'UTC'})}} });
            const updateSliderDisplay = (values) => { const sD = new Date(values[0]+'T00:00:00Z'), eD = new Date(values[1]+'T00:00:00Z'); sliderDisplayElement.textContent = `${sD.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})} - ${eD.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})}`;};
            sliderElement.noUiSlider.on('update', (values)=>{updateSliderDisplay(values); _updatePanelConfigSummary(panelElement);});
            sliderElement.noUiSlider.on('set', _configChangeHandler);
            updateSliderDisplay(sliderElement.noUiSlider.get());
        } catch(err) { console.error("Slider Error for panel " + panelIdStr + ":", err); sliderDisplayElement.textContent = "Slider Error"; }
    }

    const configToggleBtn = panelElement.querySelector('.panel-config-toggle-btn');
    const configArea = panelElement.querySelector('.panel-config-area');
    if (configToggleBtn && configArea && !configToggleBtn.getAttribute('listener-attached-init')) {
        configToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation(); configArea.classList.toggle('open');
            const icon = configToggleBtn.querySelector('i');
            if (icon) icon.className = configArea.classList.contains('open') ? 'fas fa-chevron-up' : 'fas fa-cog';
        });
        configToggleBtn.setAttribute('listener-attached-init', 'true');
    }
    _updatePanelConfigSummary(panelElement);
}

function _configChangeHandler(event) { const panelElement = event.target.closest('.insight-panel'); if (panelElement) _handleConfigChange(panelElement); }
async function _handleConfigChange(panelElement) {
    const panelIdStr = panelElement.dataset.panelId; const analysisType = panelElement.dataset.analysisType;
    if (!panelIdStr || !analysisType || panelIdStr.startsWith('temp-')) { return; }
    const panelIdInt = parseInt(panelIdStr); if (isNaN(panelIdInt)) { alert("Config error: Invalid panel ID."); return; }
    const analysisDetails = getAnalysisDetails(analysisType); let newConfig = JSON.parse(panelElement.dataset.configuration || JSON.stringify(analysisDetails?.default_config || {}));
    const groupSelect = panelElement.querySelector(`#group-select-${panelIdStr}`); if (groupSelect) newConfig.group_id = groupSelect.value;
    const sliderElement = panelElement.querySelector(`#time-slider-${panelIdStr}`);
    if (sliderElement && sliderElement.noUiSlider) { try { const [sS, eS] = sliderElement.noUiSlider.get(); if (sS === "ERR_NaN" || eS === "ERR_NaN") throw new Error("Invalid date from slider"); newConfig.startDate = sS; newConfig.endDate = eS; newConfig.time_period = 'custom'; const sO = sliderElement.noUiSlider.options; const sMinD = new Date(sO.range.min).toISOString().split('T')[0]; const sMaxD = new Date(sO.range.max).toISOString().split('T')[0]; if (sS === sMinD && eS === sMaxD) { newConfig.time_period = 'all_time'; newConfig.startDate = null; newConfig.endDate = null; }} catch (e) { alert("Error reading date range."); return; }} else if (!newConfig.startDate && !newConfig.endDate) { newConfig.time_period = 'all_time'; }
    panelElement.dataset.configuration = JSON.stringify(newConfig);
    try { await updatePanelConfigurationOnServer(panelIdInt, newConfig); await loadPanelContent(panelElement); } catch (error) { alert(`Failed to update panel settings: ${error.message}`); }
}

async function loadPanelContent(panelElement, isForDragCloneVisuals = false) {
    const panelIdStr = panelElement.dataset.panelId;
    const analysisType = panelElement.dataset.analysisType;
    const contentContainer = panelElement.querySelector('.placeholder-chart');

    if (!analysisType || !contentContainer) { console.error(`loadPanelContent - ABORTING. Missing type/container. PanelID: ${panelIdStr}`); if(contentContainer) contentContainer.innerHTML = "<p style='color:red'>Internal Error.</p>"; return; }

    let panelIdForDataFetch = null;
    if (!panelIdStr.startsWith('temp-')) {
        const parsedId = parseInt(panelIdStr);
        if (!isNaN(parsedId)) { panelIdForDataFetch = parsedId; }
        else { console.error(`loadPanelContent - Invalid ID for non-temp: ${panelIdStr}.`); contentContainer.innerHTML = `<p style='color:red'>Config Error.</p>`; return; }
    }

    const isPaletteDragClone = panelIdStr.startsWith('temp-live-'); // Used for palette drag visual element
    let chartInstanceToDestroy = null;
    if (!isPaletteDragClone && activeChartInstances[panelIdStr]) {
        chartInstanceToDestroy = activeChartInstances[panelIdStr];
    } else if (isPaletteDragClone && chartInDraggedElement) {
        chartInstanceToDestroy = chartInDraggedElement;
    }

    if (chartInstanceToDestroy) {
        try { chartInstanceToDestroy.destroy(); } catch (e) {}
        if (!isPaletteDragClone && !panelIdStr.startsWith('temp-')) delete activeChartInstances[panelIdStr]; // For actual panels in grid
        else if (isPaletteDragClone) chartInDraggedElement = null; // For palette drag clone
    }

    const analysisDetails = getAnalysisDetails(analysisType);
    contentContainer.innerHTML = analysisDetails?.placeholder_html || `<div class='loading-placeholder'><i class='fas fa-spinner fa-spin fa-2x'></i><p>Loading data...</p></div>`;

    try {
        if (typeof Chart === 'undefined') throw new Error("Chart.js library not loaded.");
        const analysisResult = await fetchAnalysisData(analysisType, panelIdForDataFetch);

        // Update summary for non-temp panels AND for palette drag clones (which now show default summary)
        if (isPaletteDragClone || !panelIdStr.startsWith('temp-')) {
            _updatePanelConfigSummary(panelElement);
        }

        if (analysisType === 'spending-by-category' && analysisResult?.data) {
            if (analysisResult.data.length > 0) {
                contentContainer.innerHTML = ''; const canvas = document.createElement('canvas'); contentContainer.appendChild(canvas); const ctx = canvas.getContext('2d');
                const labels = analysisResult.data.map(item => item.category || 'Uncategorized'); const amounts = analysisResult.data.map(item => item.amount);
                const bgColors = Array.from({ length: labels.length }, (_, i) => `hsl(${(i * 360 / labels.length) % 360}, 65%, 60%)`);
                const chartOptions = { responsive: true, maintainAspectRatio: false, animation: { duration: isForDragCloneVisuals ? 0 : CHART_ANIMATION_DURATION }, plugins: { legend: { display: !isForDragCloneVisuals, position: 'bottom', labels: { color: '#ddd', padding: 15, boxWidth: 12, usePointStyle: true } }, tooltip: { enabled: !isForDragCloneVisuals, backgroundColor: 'rgba(20,20,30,0.85)', titleColor: '#eee', bodyColor: '#ddd', callbacks: { label: chartCtx => `${chartCtx.label || ''}: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(chartCtx.parsed)} (${(chartCtx.parsed / chartCtx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0) * 100).toFixed(1)}%)` } } } };
                if(isForDragCloneVisuals) { chartOptions.elements = { arc: { borderWidth: 1 }}; }
                const newChart = new Chart(ctx, { type: 'pie', data: { labels, datasets: [{ label: 'Spending', data: amounts, backgroundColor: bgColors, hoverBackgroundColor: bgColors.map(c => c.replace(/60%\)$/, '70%)')), borderColor: '#333', borderWidth: 1, hoverOffset: isForDragCloneVisuals ? 0: 8 }] }, options: chartOptions });
                if(isPaletteDragClone) chartInDraggedElement = newChart; // Store chart for palette drag clone
                else if (!panelIdStr.startsWith('temp-')) activeChartInstances[panelIdStr] = newChart; // Store for real panels
            } else { contentContainer.innerHTML = `<p style="text-align:center;color:#bbb;padding:15px 5px;">No data found ${panelIdStr.startsWith('temp-') ? 'for this analysis type' : 'for current filters'}.</p>`; }
        } else if (analysisType !== 'spending-by-category') { contentContainer.innerHTML = `<p style='text-align:center;color:orange;padding:15px 5px;'>Display not implemented for: ${analysisType}</p>`; }
        else { contentContainer.innerHTML = `<p style="text-align:center;color:#bbb;padding:15px 5px;">No data or unexpected format.</p>`;}
    } catch (error) {
        console.error(`loadPanelContent - ERROR CAUGHT - PanelID: ${panelIdStr}, Type: ${analysisType}:`, error);
        contentContainer.innerHTML = `<p style='color:red;text-align:center;padding:15px 5px;'>Error loading data.<br><small>${error.message}</small></p>`;
    }
}

// --- Grid State & Layout ---
function checkGridEmpty() { if (!insightsGrid || !emptyMessage) return; const hasContent = insightsGrid.querySelector('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)'); emptyMessage.style.display = hasContent ? 'none' : 'block'; if (!hasContent && emptyMessage.parentElement !== insightsGrid) insightsGrid.appendChild(emptyMessage); }
function calculateGridCellLayout() {
    if (!insightsGrid || !insightsGridContainer) { gridCellLayout = []; return; }
    gridCellLayout = []; gridComputedStyle = window.getComputedStyle(insightsGrid); gridColCount = (window.innerWidth <= 768) ? 1 : 2;
    const panelOwnMargin = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-margin') || '12');
    const gridPadding = parseFloat(gridComputedStyle.paddingLeft) || 10;
    const availableGridWidth = insightsGridContainer.clientWidth - (2 * gridPadding);
    let panelContentWidth = (availableGridWidth - (gridColCount - 1) * (2 * panelOwnMargin)) / gridColCount;
    if (gridColCount === 1) { panelContentWidth = availableGridWidth; }
    panelContentWidth = Math.max(200, panelContentWidth); const panelContentHeight = panelContentWidth * 0.8;
    const startOffsetX = gridPadding; const startOffsetY = gridPadding;
    const visiblePanels = Array.from(insightsGrid.children).filter(el => (el.classList.contains('insight-panel') || el.classList.contains('dragging-placeholder')) && !el.classList.contains('dragging-clone'));
    const estimatedItems = visiblePanels.length + (isDragging && dragType === 'palette' && (!placeholderElement || !placeholderElement.parentElement) ? 1 : 0);
    const estimatedRows = Math.max(1, Math.ceil(estimatedItems / gridColCount));
    for (let r = 0; r < estimatedRows; r++) { for (let c = 0; c < gridColCount; c++) {
        const slotX = startOffsetX + c * (panelContentWidth + 2 * panelOwnMargin); const slotY = startOffsetY + r * (panelContentHeight + 2 * panelOwnMargin);
        gridCellLayout.push({ x: slotX, y: slotY, width: panelContentWidth + 2 * panelOwnMargin, height: panelContentHeight + 2 * panelOwnMargin, contentX: slotX + panelOwnMargin, contentY: slotY + panelOwnMargin, contentWidth: panelContentWidth, contentHeight: panelContentHeight });
    }}
}
function findNearestSlotIndex(pointerX, pointerY) { let closestIndex = -1, minDistSq = Infinity; if (!gridCellLayout.length) calculateGridCellLayout(); if (!gridCellLayout.length) return -1; gridCellLayout.forEach((slot, index) => { const slotCenterX = slot.contentX + slot.contentWidth / 2; const slotCenterY = slot.contentY + slot.contentHeight / 2; const distSq = (pointerX - slotCenterX) ** 2 + (pointerY - slotCenterY) ** 2; if (distSq < minDistSq) { minDistSq = distSq; closestIndex = index; } }); const panelChildren = Array.from(insightsGrid.children).filter(el => (el.classList.contains('insight-panel') || el.classList.contains('dragging-placeholder')) && !el.classList.contains('dragging-clone'));
    const panelCount = panelChildren.length + (isDragging && dragType === 'palette' && (!placeholderElement || !placeholderElement.parentElement) ? 1 : 0);
    return Math.min(closestIndex, panelCount);
}

// --- Palette Preview Logic ---
function showPalettePreview(targetPaletteItem) { if (!palettePreviewContainer || !targetPaletteItem || isDragging || (palette?.classList.contains('collapsed') && window.innerWidth > 768)) return; const { previewTitle, previewImageUrl, previewDescription } = targetPaletteItem.dataset; if (!previewTitle || !previewDescription) { hidePalettePreview(); return; } clearTimeout(previewHideTimeout); previewHideTimeout = null; palettePreviewContainer.innerHTML = `<div class="preview-container-inner"><h3 class="preview-title">${previewTitle}</h3><div class="preview-content">${previewImageUrl ? `<img src="${previewImageUrl}" alt="${previewTitle} preview" style="max-height:120px;width:auto;display:block;margin:5px auto 8px;border-radius:3px;">` : ''}<p>${previewDescription}</p></div></div>`; palettePreviewContainer.style.display = 'block'; palettePreviewContainer.style.visibility = 'hidden'; palettePreviewContainer.style.opacity = '0'; palettePreviewContainer.style.transform = 'scale(0.95)'; palettePreviewContainer.classList.remove('visible'); requestAnimationFrame(() => { if (!palettePreviewContainer || !targetPaletteItem) return; const prevRect = palettePreviewContainer.getBoundingClientRect(); const itemRect = targetPaletteItem.getBoundingClientRect(); const contRect = insightsView?.getBoundingClientRect() || { left:0,top:0,right:window.innerWidth,bottom:window.innerHeight }; let l = Math.max(contRect.left+VIEWPORT_PADDING, Math.min(itemRect.right+PREVIEW_GAP_TO_RIGHT, contRect.right-prevRect.width-VIEWPORT_PADDING)); let t = Math.max(contRect.top+VIEWPORT_PADDING, Math.min(itemRect.top+(itemRect.height/2)-(prevRect.height/2), contRect.bottom-prevRect.height-VIEWPORT_PADDING)); palettePreviewContainer.style.left = `${Math.round(l-contRect.left)}px`; palettePreviewContainer.style.top = `${Math.round(t-contRect.top)}px`; palettePreviewContainer.style.visibility = 'visible'; palettePreviewContainer.classList.add('visible'); palettePreviewContainer.style.opacity = '1'; palettePreviewContainer.style.transform = 'scale(1)'; }); }
function scheduleHidePalettePreview() { clearTimeout(previewHideTimeout); previewHideTimeout = setTimeout(hidePalettePreview, PREVIEW_HIDE_DELAY + 100); }
function hidePalettePreview() { clearTimeout(previewHideTimeout); previewHideTimeout = null; if (palettePreviewContainer?.classList.contains('visible')) { palettePreviewContainer.classList.remove('visible'); palettePreviewContainer.style.opacity = '0'; palettePreviewContainer.style.transform = 'scale(0.95)'; setTimeout(() => { if (palettePreviewContainer && !palettePreviewContainer.classList.contains('visible')) { palettePreviewContainer.style.display = 'none'; palettePreviewContainer.innerHTML = ''; } }, 300); } else if (palettePreviewContainer) { palettePreviewContainer.style.display = 'none'; palettePreviewContainer.innerHTML = ''; } }
function cancelHidePreview() { clearTimeout(previewHideTimeout); }

// --- Drag and Drop Logic ---
function onPointerDown(event) { if (event.target.closest('.panel-action-btn, .add-analysis-btn, .palette-toggle-btn, .panel-config-area, .panel-config-controls, .panel-config-controls *, .noUi-handle, .noUi-pips')) return; if (event.button !== 0 || isDragging) return; const panelElement = event.target.closest('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)'); const paletteItem = event.target.closest('.palette-item'); if (panelElement?.dataset.panelId && !panelElement.dataset.panelId.startsWith('temp-')) initiateDrag(event, panelElement, 'grid'); else if (paletteItem && !palette?.classList.contains('collapsed') && paletteItem.dataset.analysisType) initiateDrag(event, paletteItem, 'palette');}

function initiateDrag(event, element, type) {
    event.preventDefault(); event.stopPropagation(); hidePalettePreview();
    isDragging = true; dragType = type; startClientX = event.clientX; startClientY = event.clientY;
    calculateGridCellLayout();
    if (palette) paletteRect = palette.getBoundingClientRect();

    placeholderElement = document.createElement('div');
    placeholderElement.className = 'dragging-placeholder drop-slot-indicator';
    if (gridCellLayout.length > 0) { placeholderElement.style.width = `${gridCellLayout[0].contentWidth}px`; placeholderElement.style.height = `${gridCellLayout[0].contentHeight}px`; }
    else { placeholderElement.style.width = '250px'; placeholderElement.style.height = '200px'; }

    let elementRect;
    if (dragType === 'grid') {
        originalSourceElementForGridDrag = element; draggedElement = originalSourceElementForGridDrag;
        elementRect = draggedElement.getBoundingClientRect(); offsetX = startClientX - elementRect.left; offsetY = startClientY - elementRect.top;
        sourceIndex = Array.from(insightsGrid.children).filter(child => child.classList.contains('insight-panel') && !child.classList.contains('dragging-clone')).indexOf(draggedElement);
        if (draggedElement.parentElement === insightsGrid && sourceIndex !== -1) { insightsGrid.insertBefore(placeholderElement, draggedElement); draggedElement.remove(); }
        else { console.error("Error: Dragged grid panel not found correctly."); isDragging = false; return; }
        currentTargetIndex = sourceIndex;
    } else { // dragType === 'palette'
        originalSourceElementForGridDrag = null; const sourcePaletteItem = element;
        const { analysisType } = sourcePaletteItem.dataset; if (!analysisType) { isDragging = false; return; }
        const analysisDetails = getAnalysisDetails(analysisType); const defaultConfig = analysisDetails?.default_config || {};
        const tempPanelData = { id: generateUniqueId('temp-live'), analysis_type:analysisType, title: sourcePaletteItem.dataset.title || analysisDetails?.title || 'Analysis', configuration:defaultConfig };
        
        draggedElement = createInsightPanelElement(tempPanelData, true); // true for isForPaletteDragClone
        loadPanelContent(draggedElement, true).catch(err => { console.error("Error loading data into palette drag clone:", err); const phc = draggedElement.querySelector('.placeholder-chart'); if(phc) phc.innerHTML = "<p style='color:red;text-align:center;'>Error loading data</p>"; });
        
        let cloneWidth = gridCellLayout.length > 0 ? gridCellLayout[0].contentWidth : 250; let cloneHeight = gridCellLayout.length > 0 ? gridCellLayout[0].contentHeight : 200;
        offsetX = cloneWidth * 0.5; offsetY = cloneHeight * 0.2; elementRect = {left:startClientX-offsetX, top:startClientY-offsetY, width:cloneWidth, height:cloneHeight};
        sourceIndex = -1; currentTargetIndex = -1;
    }
    draggedElement.classList.add('dragging-clone');
    Object.assign(draggedElement.style, { position:'fixed', zIndex:1000, pointerEvents:'none', width:`${elementRect.width}px`, height:`${elementRect.height}px`, left:`${elementRect.left}px`, top:`${elementRect.top}px` });
    document.body.appendChild(draggedElement);
    document.addEventListener('pointermove', onPointerMove); document.addEventListener('pointerup', onPointerUp, {once:true}); document.addEventListener('contextmenu', preventContextMenuDuringDrag, {capture:true});
}

function onPointerMove(event) {
    if (!isDragging || !draggedElement) return; const currentX = event.clientX, currentY = event.clientY;
    cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(() => {
        draggedElement.style.left = `${currentX - offsetX}px`; draggedElement.style.top = `${currentY - offsetY}px`;
        gridRect = insightsGridContainer.getBoundingClientRect();
        
        let isOverPalette = false;
        if (dragType === 'grid' && paletteRect && palette && !palette.classList.contains('collapsed')) {
            isOverPalette = currentX >= paletteRect.left && currentX <= paletteRect.right &&
                            currentY >= paletteRect.top && currentY <= paletteRect.bottom;
        }

        if (isOverPalette) {
            palette.classList.add('drag-over-delete');
            if (placeholderElement.parentElement) placeholderElement.remove();
            currentTargetIndex = -2; // Special index for palette drop
        } else {
            palette.classList.remove('drag-over-delete');
            const pointerXInGridCont = currentX - gridRect.left, pointerYInGridCont = currentY - gridRect.top;
            const isOverGrid = currentX>=gridRect.left && currentX<=gridRect.right && currentY>=gridRect.top && currentY<=gridRect.bottom;
            let nearestIdx = -1;
            if (isOverGrid) { const pointerXInGrid = pointerXInGridCont + insightsGridContainer.scrollLeft; const pointerYInGrid = pointerYInGridCont + insightsGridContainer.scrollTop; nearestIdx = findNearestSlotIndex(pointerXInGrid, pointerYInGrid); }
            if (isOverGrid && nearestIdx !== -1) { if (nearestIdx !== currentTargetIndex || !placeholderElement.parentElement) { insertElementAtIndex(placeholderElement, nearestIdx); currentTargetIndex = nearestIdx; } }
            else { if (placeholderElement.parentElement) placeholderElement.remove(); currentTargetIndex = -1; }
        }
        if (dragType === 'grid' && !isOverPalette) handleGridScroll(currentY, gridRect); // Only scroll grid if not over palette for delete
        else if (dragType === 'palette') handleGridScroll(currentY, gridRect); // Palette drags can scroll grid
    });
}
function handleGridScroll(clientY, gridContainerRect) { let scrollDelta = 0; const speed = SCROLL_THRESHOLD * SCROLL_SPEED_MULTIPLIER * 0.5; if (clientY < gridContainerRect.top + SCROLL_THRESHOLD) { scrollDelta = -speed * (1 - (clientY - gridContainerRect.top) / SCROLL_THRESHOLD); } else if (clientY > gridContainerRect.bottom - SCROLL_THRESHOLD) { scrollDelta = speed * (1 - (gridContainerRect.bottom - clientY) / SCROLL_THRESHOLD); } if (scrollDelta !== 0) insightsGridContainer.scrollTop += scrollDelta; }

async function onPointerUp() {
    if (!isDragging) return; cancelAnimationFrame(animationFrameId);
    document.removeEventListener('pointermove', onPointerMove); document.removeEventListener('contextmenu', preventContextMenuDuringDrag, {capture:true});
    if (palette) palette.classList.remove('drag-over-delete');

    const droppedOnPalette = currentTargetIndex === -2 && dragType === 'grid' && originalSourceElementForGridDrag;
    const droppedInsideGrid = currentTargetIndex !== -1 && currentTargetIndex !== -2 && placeholderElement?.parentElement === insightsGrid;
    let finalPanelToFocus = null;

    if (draggedElement) { draggedElement.remove(); draggedElement.classList.remove('dragging-clone'); ['position', 'left', 'top', 'width', 'height', 'zIndex', 'pointerEvents', 'transform', 'margin'].forEach(prop => { draggedElement.style[prop] = ''; }); }
    if (dragType === 'palette' && chartInDraggedElement) { try { chartInDraggedElement.destroy(); } catch(e){} chartInDraggedElement = null; }

    try {
        if (droppedOnPalette) {
            const panelToRemove = originalSourceElementForGridDrag;
            const panelIdStr = panelToRemove.dataset.panelId;
            const panelIdInt = parseInt(panelIdStr);

            if (activeChartInstances[panelIdStr]) { try { activeChartInstances[panelIdStr].destroy(); } catch(e){} delete activeChartInstances[panelIdStr]; }
            const sliderEl = panelToRemove.querySelector(`#time-slider-${panelIdStr}`); if (sliderEl?.noUiSlider) sliderEl.noUiSlider.destroy();
            if (placeholderElement?.parentElement) placeholderElement.remove(); // Remove grid placeholder if it was shown
            // Panel is already visually gone (was draggedElement)
            if (!isNaN(panelIdInt)) { await removePanelFromServer(panelIdInt); }
            else { console.error("Cannot remove panel by dragging to palette: Invalid ID", panelIdStr); }
        } else if (droppedInsideGrid) {
            if (dragType === 'palette') {
                const analysisType = draggedElement.dataset.analysisType; const analysisDetails = getAnalysisDetails(analysisType);
                const initialConfig = JSON.parse(draggedElement.dataset.configuration) || analysisDetails?.default_config || {};
                const newPanelDataFromServer = await addPanelToServer(analysisType, initialConfig); if (!newPanelDataFromServer?.id) throw new Error("Panel creation failed on server.");
                const panelDataForCreation = { id: String(newPanelDataFromServer.id), analysis_type: newPanelDataFromServer.analysis_type || analysisType, title: newPanelDataFromServer.title || draggedElement.dataset.title || analysisDetails?.title || 'Analysis', configuration: newPanelDataFromServer.configuration || initialConfig };
                finalPanelToFocus = createInsightPanelElement(panelDataForCreation, false); // Not a palette drag clone
                placeholderElement.replaceWith(finalPanelToFocus);
                _initializePanelConfigurationControls(finalPanelToFocus, panelDataForCreation); await loadPanelContent(finalPanelToFocus);
            } else if (dragType === 'grid' && originalSourceElementForGridDrag) {
                finalPanelToFocus = originalSourceElementForGridDrag; placeholderElement.replaceWith(finalPanelToFocus);
                const chartInstance = activeChartInstances[finalPanelToFocus.dataset.panelId]; if (chartInstance?.resize) { setTimeout(() => { try { chartInstance.resize(); } catch(e){} }, 50); }
                _updatePanelConfigSummary(finalPanelToFocus);
            }
        } else { // Dropped outside grid and not on palette
            if (dragType === 'grid' && originalSourceElementForGridDrag) {
                finalPanelToFocus = originalSourceElementForGridDrag; if (placeholderElement?.parentElement) placeholderElement.remove(); insertElementAtIndex(finalPanelToFocus, sourceIndex);
                const chartInstance = activeChartInstances[finalPanelToFocus.dataset.panelId]; if (chartInstance?.resize) { setTimeout(() => { try { chartInstance.resize(); } catch(e){} }, 50); }
                _updatePanelConfigSummary(finalPanelToFocus);
            } else if (dragType === 'palette') { if (placeholderElement?.parentElement) placeholderElement.remove(); }
        }

        if (droppedInsideGrid || droppedOnPalette) {
             const panelElementsInGrid = Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)'));
             const persistentPanelIds = panelElementsInGrid.filter(p => p.dataset.panelId && !String(p.dataset.panelId).startsWith('temp-')).map(p => parseInt(p.dataset.panelId)).filter(id => !isNaN(id));
            // Update order if list changed or became empty
            if (persistentPanelIds.length > 0 || ( (droppedInsideGrid || droppedOnPalette) && panelElementsInGrid.length === 0) ) {
                await updatePanelOrderOnServer(persistentPanelIds);
            }
        }
    } catch (apiError) {
        alert(`Error saving changes: ${apiError.message}`); console.error("[Insights] onPointerUp - API Error:", apiError);
        if (droppedOnPalette && originalSourceElementForGridDrag && !originalSourceElementForGridDrag.parentElement) { insertElementAtIndex(originalSourceElementForGridDrag, sourceIndex); _updatePanelConfigSummary(originalSourceElementForGridDrag); }
        else if (dragType === 'grid' && originalSourceElementForGridDrag && !originalSourceElementForGridDrag.parentElement) { if (placeholderElement?.parentElement) placeholderElement.remove(); insertElementAtIndex(originalSourceElementForGridDrag, sourceIndex); _updatePanelConfigSummary(originalSourceElementForGridDrag); }
        else if (dragType === 'palette' && placeholderElement?.parentElement) { placeholderElement.remove(); }
    } finally {
        if(placeholderElement?.parentElement) placeholderElement.remove(); placeholderElement = null;
        isDragging = false; draggedElement = null; originalSourceElementForGridDrag = null; sourceIndex = -1; dragType = null; currentTargetIndex = -1;
        setTimeout(() => {
            calculateGridCellLayout(); checkGridEmpty();
            const currentPanelIds = new Set(Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)')).map(p => p.dataset.panelId));
            Object.keys(activeChartInstances).forEach(idStr => { if(!idStr.startsWith('temp-') && !currentPanelIds.has(idStr)) { try{ activeChartInstances[idStr].destroy(); } catch(e){} delete activeChartInstances[idStr]; }});
        }, 50);
    }
}
function preventContextMenuDuringDrag(event) { if (isDragging) event.preventDefault(); }
function insertElementAtIndex(elementToInsert, index) {
    const currentGridChildren = Array.from(insightsGrid.children).filter(el => (el.classList.contains('insight-panel') || el.classList.contains('dragging-placeholder')) && !el.classList.contains('dragging-clone'));
    const actualItems = currentGridChildren.filter(child => child !== elementToInsert);
    const effectiveIndex = Math.max(0, Math.min(index, actualItems.length));
    if (elementToInsert.parentElement === insightsGrid) { insightsGrid.removeChild(elementToInsert); }
    if (effectiveIndex < actualItems.length) { insightsGrid.insertBefore(elementToInsert, actualItems[effectiveIndex]); }
    else { if (emptyMessage && emptyMessage.parentElement === insightsGrid && insightsGrid.lastChild === emptyMessage) { insightsGrid.insertBefore(elementToInsert, emptyMessage); } else { insightsGrid.appendChild(elementToInsert); }}
    checkGridEmpty();
}

// --- Panel Actions & Palette Toggle ---
async function handleGridAction(event) {
    const panel = event.target.closest('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)'); if (!panel || !panel.dataset.panelId) return; const panelIdStr = panel.dataset.panelId; if (panelIdStr.startsWith('temp-')) return;
    if (event.target.closest('.panel-close-btn')) {
        event.stopPropagation(); if (activeChartInstances[panelIdStr]) { try { activeChartInstances[panelIdStr].destroy(); } catch(e){} delete activeChartInstances[panelIdStr]; }
        const sliderEl = panel.querySelector(`#time-slider-${panelIdStr}`); if (sliderEl?.noUiSlider) sliderEl.noUiSlider.destroy();
        panel.remove(); checkGridEmpty(); calculateGridCellLayout();
        const panelIdInt = parseInt(panelIdStr); if (!isNaN(panelIdInt)) { try { await removePanelFromServer(panelIdInt); } catch (error) { alert(`Error removing panel: ${error.message}.`);}} else { console.error("Cannot remove panel: Invalid ID", panelIdStr); }
    } else if (event.target.closest('.panel-share-btn')) { event.stopPropagation(); const panelTitleText = panel.querySelector('.panel-dynamic-title')?.textContent || 'N/A'; alert(`Sharing panel '${panelTitleText}' - Not implemented.`); }
}
function makePanelDraggable(panelElement) { panelElement.removeEventListener('pointerdown', onPointerDown); panelElement.addEventListener('pointerdown', onPointerDown); }
function debounce(func, wait) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => func.apply(this,a), wait); }; }
function handlePaletteToggle(forceState=null) { if (!palette || !paletteToggleBtn) return; hidePalettePreview(); let shouldClose = forceState === 'close' || (forceState === null && !palette.classList.contains('collapsed')); palette.classList.toggle('collapsed', shouldClose); insightsView?.classList.toggle('palette-collapsed', shouldClose); updateToggleButtonIcon(); setTimeout(calculateGridCellLayout, parseFloat(getComputedStyle(palette).transitionDuration)*1000 || 350); }
function updateToggleButtonIcon() { if (!palette || !paletteToggleBtn) return; const icon = paletteToggleBtn.querySelector('i'); if (!icon) return; const isMobile = window.innerWidth <= 768, isCollapsed = palette.classList.contains('collapsed'); icon.className = `fas ${isMobile ? (isCollapsed ? 'fa-chevron-up':'fa-chevron-down') : (isCollapsed ? 'fa-chevron-right':'fa-chevron-left')}`; paletteToggleBtn.setAttribute('aria-label', isCollapsed ? 'Expand Palette' : 'Collapse Palette'); }

// --- Initialization and Event Setup ---
async function setupEventListeners() {
    if (!insightsView) { return; }
    if (!getComputedStyle(document.documentElement).getPropertyValue('--panel-margin')) {
        document.documentElement.style.setProperty('--panel-margin', '12px');
    }

    paletteHeader?.addEventListener('click', e => { if (!e.target.closest('.palette-toggle-btn, .add-analysis-btn')) handlePaletteToggle(); });
    paletteToggleBtn?.addEventListener('click', e => { e.stopPropagation(); handlePaletteToggle(); });
    if (paletteScrollContainer) {
        paletteScrollContainer.addEventListener('pointerdown', onPointerDown);
        paletteScrollContainer.addEventListener('mouseover', e => { if (!isDragging && !palette?.classList.contains('collapsed') && window.innerWidth>768) { const item = e.target.closest('.palette-item'); if(item) showPalettePreview(item); }});
        paletteScrollContainer.addEventListener('mouseout', e => { if(!isDragging){ const item=e.target.closest('.palette-item'); if(item && !item.contains(e.relatedTarget) && !palettePreviewContainer?.contains(e.relatedTarget)) scheduleHidePalettePreview(); }});
        paletteScrollContainer.addEventListener('click', async e => {
            const addBtn = e.target.closest('.add-analysis-btn');
            if (addBtn && !isDragging) {
                e.stopPropagation(); const item = addBtn.closest('.palette-item'); if (item?.dataset.analysisType) {
                    const { analysisType } = item.dataset; const analysisDetails = getAnalysisDetails(analysisType); const initialConfig = analysisDetails?.default_config || {};
                    addBtn.disabled=true; addBtn.innerHTML='<i class="fas fa-spinner fa-spin"></i>';
                    try {
                        const newPanelDataFromServer = await addPanelToServer(analysisType, initialConfig); if (!newPanelDataFromServer?.id) throw new Error("Panel creation failed.");
                        const panelDataForCreation = { id: String(newPanelDataFromServer.id), analysis_type: newPanelDataFromServer.analysis_type || analysisType, title: item.dataset.title || newPanelDataFromServer.title || analysisDetails?.title || 'Analysis', configuration: newPanelDataFromServer.configuration || initialConfig };
                        const newEl = createInsightPanelElement(panelDataForCreation, false); // Not a palette drag clone
                        insertElementAtIndex(newEl, insightsGrid.children.length - (emptyMessage.parentElement === insightsGrid ? 1 : 0) );
                        _initializePanelConfigurationControls(newEl, panelDataForCreation);
                        await loadPanelContent(newEl);
                        checkGridEmpty(); calculateGridCellLayout();
                        const panelElementsAfterAdd = Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)'));
                        const panelIdsToOrderAfterAdd = panelElementsAfterAdd.filter(p => p.dataset.panelId && !String(p.dataset.panelId).startsWith('temp-')).map(p => parseInt(p.dataset.panelId)).filter(id => !isNaN(id));
                        if (panelIdsToOrderAfterAdd.length > 0) { await updatePanelOrderOnServer(panelIdsToOrderAfterAdd); }
                        setTimeout(() => newEl?.scrollIntoView({behavior:'smooth',block:'nearest'}), 100);
                    } catch (err) { alert(`Failed to add panel: ${err.message}`); }
                    finally { addBtn.disabled=false; addBtn.innerHTML='+'; }
                }
            }
        });
    }
    palettePreviewContainer?.addEventListener('mouseleave', e => { if (!e.relatedTarget || !e.relatedTarget.closest('.palette-item')) scheduleHidePalettePreview(); });
    palettePreviewContainer?.addEventListener('mouseenter', cancelHidePreview);

    if (insightsGrid) {
        insightsGrid.addEventListener('click', handleGridAction);
        const existingPanels = insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)');
        for (const panel of existingPanels) {
            const panelIdStr = panel.dataset.panelId; const analysisType = panel.dataset.analysisType;
            if (!panelIdStr || !analysisType || panelIdStr.startsWith('temp-')) { continue; }
            if (isNaN(parseInt(panelIdStr))) { const contentDiv = panel.querySelector('.placeholder-chart') || panel.querySelector('.panel-content'); if (contentDiv) contentDiv.innerHTML = `<p style='color:red;'><b>Error:</b>Invalid ID ('${panelIdStr}')</p>`; const titleH3 = panel.querySelector('.panel-dynamic-title'); if (titleH3) titleH3.textContent = "Config Error"; continue; }
            makePanelDraggable(panel); const analysisDetails = getAnalysisDetails(analysisType);
            const titleEl = panel.querySelector('.panel-dynamic-title'); let panelTitleText = panel.dataset.title || (analysisDetails?.title || 'Analysis');
            if (titleEl) titleEl.textContent = panelTitleText; else { console.warn(`Panel ${panelIdStr} missing .panel-dynamic-title`); }
            const placeholderChartDiv = panel.querySelector('.placeholder-chart'); if (placeholderChartDiv) { placeholderChartDiv.innerHTML = analysisDetails?.placeholder_html || `<div class='loading-placeholder'><i class='fas fa-spinner fa-spin fa-2x'></i><p>Loading data...</p></div>`; } else { console.warn(`Panel ${panelIdStr} missing .placeholder-chart`); }
            let configObject; try { configObject = JSON.parse(panel.dataset.configuration || '{}'); } catch (e) { console.error(`Error parsing config for ${panelIdStr}:`, panel.dataset.configuration, e); configObject = analysisDetails?.default_config || {}; }
            const panelDataForInit = { id: panelIdStr, analysis_type: analysisType, title: panelTitleText, configuration: configObject };
            _initializePanelConfigurationControls(panel, panelDataForInit); await loadPanelContent(panel);
        }
        const initialPanelElements = Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)'));
        const initialPersistentPanelIds = initialPanelElements.filter(p => p.dataset.panelId && !String(p.dataset.panelId).startsWith('temp-')).map(p => parseInt(p.dataset.panelId)).filter(id => !isNaN(id));
        if (initialPersistentPanelIds.length > 0) { await updatePanelOrderOnServer(initialPersistentPanelIds); }
    }
    window.addEventListener('resize', debounce(() => { hidePalettePreview(); calculateGridCellLayout(); updateToggleButtonIcon(); }, 250));
    insightsGridContainer?.addEventListener('scroll', debounce(() => { if (!isDragging) hidePalettePreview(); }, 100));
}

export async function initInsightsManager() {
    console.log("%c[Insights] initInsightsManager - START (V32.6 - Palette Drag Full & Delete)", "background-color: yellow; color: black; font-weight:bold;");
    insightsView = document.getElementById('insights-view');
    insightsGridContainer = document.getElementById('insights-grid-container');
    insightsGrid = document.getElementById('insights-grid');
    palette = document.getElementById('analysis-palette');
    paletteHeader = document.getElementById('palette-header');
    paletteToggleBtn = document.getElementById('palette-toggle-btn');
    paletteScrollContainer = document.getElementById('palette-scroll-container');
    emptyMessage = document.getElementById('insights-empty-message');
    palettePreviewContainer = document.getElementById('palette-preview-container');

    if (!insightsView || !insightsGridContainer || !insightsGrid || !palette ||
        !paletteHeader || !paletteToggleBtn || !paletteScrollContainer || // Added missing checks
        !emptyMessage || !palettePreviewContainer) {
        console.error("Insights Manager init failed: Critical DOM elements not found. Check HTML IDs.");
        return;
    }
    if (typeof Chart === 'undefined') console.error("Chart.js library not found."); if (typeof noUiSlider === 'undefined') console.warn("noUiSlider library not found.");
    await fetchUserGroups();
    calculateGridCellLayout();
    await setupEventListeners();
    checkGridEmpty();
    isDragging = false; if(draggedElement) draggedElement.remove(); draggedElement = null;
    document.querySelectorAll('.dragging-placeholder.drop-slot-indicator').forEach(el => el.remove());
    document.removeEventListener('pointermove', onPointerMove); document.removeEventListener('pointerup', onPointerUp); document.removeEventListener('contextmenu', preventContextMenuDuringDrag, {capture:true});
    hidePalettePreview(); if (palette) { insightsView.classList.toggle('palette-collapsed', palette.classList.contains('collapsed')); } updateToggleButtonIcon();
    console.log("%c[Insights] initInsightsManager - Initialized Successfully (V32.6)", "background-color: lightgreen; color: black; font-weight:bold;");
}

function getAnalysisDetails(analysisTypeId) { const localAvailableAnalyses = { "spending-by-category": { id: "spending-by-category", title: "💸 Spending by Category", description: "Total event costs by node. Filter by group & time.", preview_title: "Spending Example", preview_image_filename: "img/placeholder-bar-chart.png", preview_description: "Shows total costs for events linked to different nodes.", placeholder_html: `<div class='loading-placeholder' style='text-align: center; padding: 20px; color: #aaa;'><i class='fas fa-spinner fa-spin fa-2x'></i><p style='margin-top: 10px;'>Loading spending data...</p></div>`, default_config: { time_period: "all_time", group_id: "all", startDate: null, endDate: null } } }; return localAvailableAnalyses[analysisTypeId]; }
// --- END OF FILE insightsManager.js ---