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
async function updatePanelConfigurationOnServer(panelIdInt, newConfig) { console.log(`[Insights V32.13] Panel ${panelIdInt} (updatePanelConfigurationOnServer): Sending newConfig:`, JSON.parse(JSON.stringify(newConfig))); return await fetchApi(`${API_BASE}/insights/panels/${panelIdInt}`, { method: 'PATCH', body: { configuration: newConfig } }); }
async function fetchAnalysisData(analysisType, panelIdInt = null) {
    let url = `${API_BASE}/analysis/data/${analysisType}`;
    if (panelIdInt !== null && typeof panelIdInt === 'number' && !isNaN(panelIdInt)) {
        url += `?panel_id=${panelIdInt}`;
    }
    // console.log(`[Insights V32.13] (fetchAnalysisData) For ${analysisType}, panelId ${panelIdInt}. URL: ${url}`);
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
    
    const analysisDetails = getAnalysisDetails(panelData.analysis_type);
    const panelMainTitleText = panelData.title || analysisDetails?.title || 'Analysis';
    // Store the static title directly in a data attribute for easy access
    panel.dataset.staticTitle = panelMainTitleText; 

    const configToStore = typeof panelData.configuration === 'object' && panelData.configuration !== null 
                          ? panelData.configuration 
                          : (analysisDetails?.default_config || {});
    panel.dataset.configuration = JSON.stringify(configToStore);


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
    const configSummaryText = isForPaletteDragClone ? "Default View" : (panelIdStr.startsWith('temp-') ? 'Drop to add panel' : 'Loading filters...');

    panel.innerHTML = `
        ${controlsHtml}
        <div class="panel-main-content-wrapper"><h3 class="panel-dynamic-title">${panelMainTitleText}</h3><div class="panel-config-summary">${configSummaryText}</div><div class="panel-content"><div class="placeholder-chart">${placeholderHtml}</div></div></div>
        ${shareButtonHtml}`;

    if (showControls) {
        makePanelDraggable(panel);
    }
    return panel;
}

function _updatePanelConfigSummary(panelElement, backendGeneratedTitle) {
    if (!panelElement) return;
    const summaryElement = panelElement.querySelector('.panel-config-summary');
    if (!summaryElement) return;
    const panelIdStr = panelElement.dataset.panelId;

    if (backendGeneratedTitle) {
        const staticTitle = panelElement.dataset.staticTitle || ""; // Get stored static title
        let summaryText = backendGeneratedTitle;
        
        // Attempt to make the summary more concise by removing the static part if present
        // Case-insensitive comparison for robustness
        if (staticTitle && summaryText.toLowerCase().startsWith(staticTitle.toLowerCase())) {
            summaryText = summaryText.substring(staticTitle.length).trim();
            // Remove leading hyphen or similar separators if they exist after stripping
            if (summaryText.startsWith("-") || summaryText.startsWith("–") || summaryText.startsWith("—")) {
                 summaryText = summaryText.substring(1).trim();
            }
        }
        summaryElement.textContent = summaryText || "Current filters"; // Fallback if stripping makes it empty
        // console.log(`[Insights V32.13] Panel ${panelIdStr} (_updatePanelConfigSummary): Set summary from backend: "${summaryElement.textContent}" (Orig backend: "${backendGeneratedTitle}")`);
    } else {
        // Fallback if backend title is missing - try to use local config
        // This is more of a safety net, ideal case is backend title is always available
        const panelConfig = JSON.parse(panelElement.dataset.configuration || '{}');
        let groupDisplay = "All Groups"; 
        if (panelConfig.group_id && String(panelConfig.group_id) !== "all") {
            const group = userGroupsCache.find(g => String(g.id) === String(panelConfig.group_id));
            groupDisplay = group ? group.name : `Group ID: ${panelConfig.group_id}`;
        }
        let dateRangeDisplay = "All Time"; 
        if (panelConfig.startDate && panelConfig.endDate) {
            const startDate = new Date(panelConfig.startDate + 'T00:00:00Z');
            const endDate = new Date(panelConfig.endDate + 'T00:00:00Z');
            const options = { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' };
            if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
                dateRangeDisplay = `${startDate.toLocaleDateString(undefined, options)} - ${endDate.toLocaleDateString(undefined, options)}`;
            } else { dateRangeDisplay = "Invalid Dates"; }
        }
        summaryElement.textContent = `${groupDisplay} | ${dateRangeDisplay}`;
        console.warn(`[Insights V32.13] Panel ${panelIdStr} (_updatePanelConfigSummary): backendGeneratedTitle missing. Used local config for summary: "${summaryElement.textContent}"`);
    }
}


function _initializePanelConfigurationControls(panelElement, panelDataForControls) {
    const panelIdStr = String(panelDataForControls.id);
    if (panelIdStr.startsWith('temp-')) return; 

    const analysisType = panelDataForControls.analysis_type;
    // panelDataForControls.configuration should already be a valid object (parsed or defaulted in setupEventListeners)
    const currentConfig = panelDataForControls.configuration; 
    
    // The dataset.configuration was already set correctly by the caller (setupEventListeners or createInsightPanelElement)
    // So, no need to set it again here, just use currentConfig.
    console.log(`[Insights V32.13] Panel ${panelIdStr} (_initializePanelConfigurationControls): Initializing controls with currentConfig:`, JSON.parse(JSON.stringify(currentConfig)));

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
        if (isNaN(minTimestamp) || isNaN(maxTimestamp) || minTimestamp >= maxTimestamp) {
             maxTimestamp = new Date().getTime(); minTimestamp = maxTimestamp - (2 * 365 * DAY_IN_MILLISECONDS);
        }
        
        let initialStart = minTimestamp; 
        let initialEnd = maxTimestamp;   

        if (currentConfig.startDate && currentConfig.endDate) {
            const parsedStartDate = new Date(currentConfig.startDate + 'T00:00:00Z').getTime();
            const parsedEndDate = new Date(currentConfig.endDate + 'T00:00:00Z').getTime();

            if (!isNaN(parsedStartDate) && !isNaN(parsedEndDate) && parsedStartDate <= parsedEndDate) {
                initialStart = Math.max(minTimestamp, parsedStartDate); 
                initialEnd = Math.min(maxTimestamp, parsedEndDate);     
                if (initialStart > initialEnd) { 
                    initialStart = minTimestamp; initialEnd = maxTimestamp;
                }
            }
        }
        if (initialStart === initialEnd) {
             initialEnd = Math.min(initialStart + DAY_IN_MILLISECONDS, maxTimestamp); 
             if (initialStart === initialEnd) { 
                 initialStart = Math.max(initialEnd - DAY_IN_MILLISECONDS, minTimestamp); 
             }
        }
        if (initialStart > initialEnd) { 
            [initialStart, initialEnd] = [initialEnd, initialStart]; 
        }

        console.log(`[Insights V32.13] Panel ${panelIdStr} (_initializePanelConfigurationControls): Slider INITIALIZING with values: start=${new Date(initialStart).toISOString()}, end=${new Date(initialEnd).toISOString()}`);

        try {
            noUiSlider.create(sliderElement, { 
                start: [initialStart, initialEnd], connect: true, range: { 'min': minTimestamp, 'max': maxTimestamp }, step: DAY_IN_MILLISECONDS, 
                format: { to: v => new Date(Math.round(parseFloat(v)/DAY_IN_MILLISECONDS)*DAY_IN_MILLISECONDS).toISOString().split('T')[0], from: s => new Date(s+'T00:00:00Z').getTime() || minTimestamp }, 
                behaviour: 'tap-drag', pips: {mode:'positions',values:[0,25,50,75,100],density:4,format:{to:v=>new Date(Math.round(parseFloat(v)/DAY_IN_MILLISECONDS)*DAY_IN_MILLISECONDS).toLocaleDateString(undefined,{month:'short',year:'2-digit',timeZone:'UTC'})}} 
            });
            const updateSliderDisplay = (values) => { 
                const sD = new Date(values[0]+'T00:00:00Z'), eD = new Date(values[1]+'T00:00:00Z'); 
                sliderDisplayElement.textContent = `${sD.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})} - ${eD.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})}`;
            };
            sliderElement.noUiSlider.on('update', (values) => { updateSliderDisplay(values); }); 
            sliderElement.noUiSlider.on('set', _configChangeHandler); 
            updateSliderDisplay(sliderElement.noUiSlider.get()); 
        } catch(err) { console.error(`[Insights V32.13] Slider Error for panel ${panelIdStr}:`, err); sliderDisplayElement.textContent = "Slider Error"; }
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
    // Initial summary display will be handled by loadPanelContent
}

function _configChangeHandler(event) { const panelElement = event.target.closest('.insight-panel'); if (panelElement) _handleConfigChange(panelElement, event); }

async function _handleConfigChange(panelElement, event = null) {
    const panelIdStr = panelElement.dataset.panelId; const analysisType = panelElement.dataset.analysisType;
    if (!panelIdStr || !analysisType || panelIdStr.startsWith('temp-')) { return; }

    console.log(`[Insights V32.13] Panel ${panelIdStr} (_handleConfigChange): START. Triggered by:`, event?.target?.id || event?.target?.classList[0] || event?.target?.tagName || 'programmatic call');

    const panelIdInt = parseInt(panelIdStr); if (isNaN(panelIdInt)) { alert("Config error: Invalid panel ID."); return; }
    
    let newConfig = JSON.parse(panelElement.dataset.configuration || '{}');

    const groupSelect = panelElement.querySelector(`#group-select-${panelIdStr}`);
    if (groupSelect) { newConfig.group_id = groupSelect.value; }
    
    const sliderElement = panelElement.querySelector(`#time-slider-${panelIdStr}`);
    if (sliderElement && sliderElement.noUiSlider) {
        try {
            const [sS, eS] = sliderElement.noUiSlider.get(); 
            if (sS === "ERR_NaN" || eS === "ERR_NaN") throw new Error("Invalid date from slider get()");
            newConfig.startDate = sS; newConfig.endDate = eS; newConfig.time_period = 'custom'; 
            const sliderOptions = sliderElement.noUiSlider.options;
            const sliderMinDateStr = new Date(sliderOptions.range.min).toISOString().split('T')[0];
            const sliderMaxDateStr = new Date(sliderOptions.range.max).toISOString().split('T')[0];
            if (sS === sliderMinDateStr && eS === sliderMaxDateStr) {
                newConfig.time_period = 'all_time'; newConfig.startDate = null; newConfig.endDate = null;
            }
            // console.log(`[Insights V32.13] Panel ${panelIdStr} (_handleConfigChange): Slider values read: ${sS} - ${eS}. New time_period: ${newConfig.time_period}`);
        } catch (e) {
            console.error(`[Insights V32.13] Panel ${panelIdStr} (_handleConfigChange): Error reading date range from slider: ${e.message}.`);
        }
    } else { 
        if (!newConfig.startDate && !newConfig.endDate) { newConfig.time_period = 'all_time';}
    }
    
    panelElement.dataset.configuration = JSON.stringify(newConfig);
    // Summary will be updated by loadPanelContent after data fetch.
    
    console.log(`[Insights V32.13] Panel ${panelIdStr} (_handleConfigChange): newConfig constructed:`, JSON.parse(JSON.stringify(newConfig)));
    console.log(`[Insights V32.13] Panel ${panelIdStr} (_handleConfigChange): Sending to server for update...`);
    try {
        await updatePanelConfigurationOnServer(panelIdInt, newConfig);
        console.log(`[Insights V32.13] Panel ${panelIdStr} (_handleConfigChange): Server update successful. Calling loadPanelContent.`);
        await loadPanelContent(panelElement);
    } catch (error) {
        alert(`Failed to update panel settings: ${error.message}`);
        console.error(`[Insights V32.13] Panel ${panelIdStr} (_handleConfigChange): API error:`, error);
    }
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

    const isPaletteDragClone = panelIdStr.startsWith('temp-live-'); 
    let chartInstanceToDestroy = null;
    if (!isPaletteDragClone && activeChartInstances[panelIdStr]) {
        chartInstanceToDestroy = activeChartInstances[panelIdStr];
    } else if (isPaletteDragClone && chartInDraggedElement) {
        chartInstanceToDestroy = chartInDraggedElement;
    }

    if (chartInstanceToDestroy) {
        try { chartInstanceToDestroy.destroy(); } catch (e) {}
        if (!isPaletteDragClone && !panelIdStr.startsWith('temp-')) delete activeChartInstances[panelIdStr]; 
        else if (isPaletteDragClone) chartInDraggedElement = null; 
    }

    const analysisDetails = getAnalysisDetails(analysisType);
    contentContainer.innerHTML = analysisDetails?.placeholder_html || `<div class='loading-placeholder'><i class='fas fa-spinner fa-spin fa-2x'></i><p>Loading data...</p></div>`;
    
    if (isPaletteDragClone) {
        const summaryEl = panelElement.querySelector('.panel-config-summary');
        if(summaryEl) summaryEl.textContent = "Default View";
    }
    // For real panels, summary is updated after fetch using analysisResult.title

    try {
        if (typeof Chart === 'undefined') throw new Error("Chart.js library not loaded.");
        const analysisResult = await fetchAnalysisData(analysisType, panelIdForDataFetch); 
        
        if (!isPaletteDragClone && analysisResult?.title) {
            _updatePanelConfigSummary(panelElement, analysisResult.title);
        } else if (!isPaletteDragClone) {
             _updatePanelConfigSummary(panelElement, null); // Fallback: will use local config to build summary
        }
        
        if (analysisResult?.config_used && !panelIdStr.startsWith('temp-')) {
             console.log(`[Insights V32.13] Panel ${panelIdStr} (loadPanelContent): Config used by server:`, analysisResult.config_used);
        }

        if (analysisType === 'spending-by-category' && analysisResult?.data) {
            if (analysisResult.data.length > 0) {
                contentContainer.innerHTML = ''; const canvas = document.createElement('canvas'); contentContainer.appendChild(canvas); const ctx = canvas.getContext('2d');
                const labels = analysisResult.data.map(item => item.category || 'Uncategorized'); const amounts = analysisResult.data.map(item => item.amount);
                const bgColors = Array.from({ length: labels.length }, (_, i) => `hsl(${(i * 360 / labels.length) % 360}, 65%, 60%)`);
                const chartOptions = { responsive: true, maintainAspectRatio: false, animation: { duration: isForDragCloneVisuals ? 0 : CHART_ANIMATION_DURATION }, plugins: { legend: { display: !isForDragCloneVisuals, position: 'bottom', labels: { color: '#ddd', padding: 15, boxWidth: 12, usePointStyle: true } }, tooltip: { enabled: !isForDragCloneVisuals, backgroundColor: 'rgba(20,20,30,0.85)', titleColor: '#eee', bodyColor: '#ddd', callbacks: { label: chartCtx => `${chartCtx.label || ''}: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(chartCtx.parsed)} (${(chartCtx.parsed / chartCtx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0) * 100).toFixed(1)}%)` } } } };
                if(isForDragCloneVisuals) { chartOptions.elements = { arc: { borderWidth: 1 }}; }
                const newChart = new Chart(ctx, { type: 'pie', data: { labels, datasets: [{ label: 'Spending', data: amounts, backgroundColor: bgColors, hoverBackgroundColor: bgColors.map(c => c.replace(/60%\)$/, '70%)')), borderColor: '#333', borderWidth: 1, hoverOffset: isForDragCloneVisuals ? 0: 8 }] }, options: chartOptions });
                if(isPaletteDragClone) chartInDraggedElement = newChart; 
                else if (!panelIdStr.startsWith('temp-')) activeChartInstances[panelIdStr] = newChart; 
            } else { contentContainer.innerHTML = `<p style="text-align:center;color:#bbb;padding:15px 5px;">No data found for current filters.</p>`; }
        } else if (analysisType !== 'spending-by-category') { contentContainer.innerHTML = `<p style='text-align:center;color:orange;padding:15px 5px;'>Display not implemented for: ${analysisType}</p>`; }
        else { contentContainer.innerHTML = `<p style="text-align:center;color:#bbb;padding:15px 5px;">No data or unexpected format.</p>`;}
    } catch (error) {
        console.error(`[Insights V32.13] loadPanelContent - ERROR CAUGHT - PanelID: ${panelIdStr}, Type: ${analysisType}:`, error);
        contentContainer.innerHTML = `<p style='color:red;text-align:center;padding:15px 5px;'>Error loading data.<br><small>${error.message}</small></p>`;
        if (!isPaletteDragClone) _updatePanelConfigSummary(panelElement, "Error loading filter details");
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
    } else { 
        originalSourceElementForGridDrag = null; const sourcePaletteItem = element;
        const { analysisType } = sourcePaletteItem.dataset; if (!analysisType) { isDragging = false; return; }
        const analysisDetails = getAnalysisDetails(analysisType); const defaultConfig = analysisDetails?.default_config || {};
        const tempPanelData = { id: generateUniqueId('temp-live'), analysis_type:analysisType, title: sourcePaletteItem.dataset.title || analysisDetails?.title || 'Analysis', configuration:defaultConfig };
        
        draggedElement = createInsightPanelElement(tempPanelData, true); 
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
            currentTargetIndex = -2; 
        } else {
            palette.classList.remove('drag-over-delete');
            const pointerXInGridCont = currentX - gridRect.left, pointerYInGridCont = currentY - gridRect.top;
            const isOverGrid = currentX>=gridRect.left && currentX<=gridRect.right && currentY>=gridRect.top && currentY<=gridRect.bottom;
            let nearestIdx = -1;
            if (isOverGrid) { const pointerXInGrid = pointerXInGridCont + insightsGridContainer.scrollLeft; const pointerYInGrid = pointerYInGridCont + insightsGridContainer.scrollTop; nearestIdx = findNearestSlotIndex(pointerXInGrid, pointerYInGrid); }
            if (isOverGrid && nearestIdx !== -1) { if (nearestIdx !== currentTargetIndex || !placeholderElement.parentElement) { insertElementAtIndex(placeholderElement, nearestIdx); currentTargetIndex = nearestIdx; } }
            else { if (placeholderElement.parentElement) placeholderElement.remove(); currentTargetIndex = -1; }
        }
        if (dragType === 'grid' && !isOverPalette) handleGridScroll(currentY, gridRect); 
        else if (dragType === 'palette') handleGridScroll(currentY, gridRect); 
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
            if (placeholderElement?.parentElement) placeholderElement.remove(); 
            if (!isNaN(panelIdInt)) { await removePanelFromServer(panelIdInt); }
            else { console.error("Cannot remove panel by dragging to palette: Invalid ID", panelIdStr); }
        } else if (droppedInsideGrid) {
            if (dragType === 'palette') {
                const analysisType = draggedElement.dataset.analysisType; const analysisDetails = getAnalysisDetails(analysisType);
                const initialConfig = JSON.parse(draggedElement.dataset.configuration) || analysisDetails?.default_config || {};
                const newPanelDataFromServer = await addPanelToServer(analysisType, initialConfig); if (!newPanelDataFromServer?.id) throw new Error("Panel creation failed on server.");
                const panelDataForCreation = { 
                    id: String(newPanelDataFromServer.id), 
                    analysis_type: newPanelDataFromServer.analysis_type || analysisType, 
                    title: newPanelDataFromServer.title || draggedElement.dataset.staticTitle || analysisDetails?.title || 'Analysis', 
                    configuration: newPanelDataFromServer.configuration || initialConfig 
                };
                finalPanelToFocus = createInsightPanelElement(panelDataForCreation, false); 
                placeholderElement.replaceWith(finalPanelToFocus);
                _initializePanelConfigurationControls(finalPanelToFocus, panelDataForCreation); 
                await loadPanelContent(finalPanelToFocus);
            } else if (dragType === 'grid' && originalSourceElementForGridDrag) {
                finalPanelToFocus = originalSourceElementForGridDrag; placeholderElement.replaceWith(finalPanelToFocus);
                const chartInstance = activeChartInstances[finalPanelToFocus.dataset.panelId]; if (chartInstance?.resize) { setTimeout(() => { try { chartInstance.resize(); } catch(e){} }, 50); }
                // Summary is updated by loadPanelContent if its config changed, or if it was re-added to DOM
                // It's safer to just call loadPanelContent to ensure everything is fresh
                await loadPanelContent(finalPanelToFocus);
            }
        } else { 
            if (dragType === 'grid' && originalSourceElementForGridDrag) {
                finalPanelToFocus = originalSourceElementForGridDrag; 
                if (placeholderElement?.parentElement) placeholderElement.remove(); 
                insertElementAtIndex(finalPanelToFocus, sourceIndex);
                const chartInstance = activeChartInstances[finalPanelToFocus.dataset.panelId]; 
                if (chartInstance?.resize) { setTimeout(() => { try { chartInstance.resize(); } catch(e){} }, 50); }
                // Reload content to ensure summary is correct after being re-inserted
                await loadPanelContent(finalPanelToFocus);

            } else if (dragType === 'palette') { if (placeholderElement?.parentElement) placeholderElement.remove(); }
        }

        if (droppedInsideGrid || droppedOnPalette) {
             const panelElementsInGrid = Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)'));
             const persistentPanelIds = panelElementsInGrid.filter(p => p.dataset.panelId && !String(p.dataset.panelId).startsWith('temp-')).map(p => parseInt(p.dataset.panelId)).filter(id => !isNaN(id));
            if (persistentPanelIds.length > 0 || ( (droppedInsideGrid || droppedOnPalette) && panelElementsInGrid.length === 0) ) {
                await updatePanelOrderOnServer(persistentPanelIds);
            }
        }
    } catch (apiError) {
        alert(`Error saving changes: ${apiError.message}`); console.error("[Insights V32.13] onPointerUp - API Error:", apiError);
        if (droppedOnPalette && originalSourceElementForGridDrag && !originalSourceElementForGridDrag.parentElement) { insertElementAtIndex(originalSourceElementForGridDrag, sourceIndex); /* Re-render summary if needed */ }
        else if (dragType === 'grid' && originalSourceElementForGridDrag && !originalSourceElementForGridDrag.parentElement) { if (placeholderElement?.parentElement) placeholderElement.remove(); insertElementAtIndex(originalSourceElementForGridDrag, sourceIndex); /* Re-render summary */ }
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
                        const panelTitleForCreation = newPanelDataFromServer.title || item.dataset.title || analysisDetails?.title || 'Analysis';
                        const panelDataForCreation = { 
                            id: String(newPanelDataFromServer.id), 
                            analysis_type: newPanelDataFromServer.analysis_type || analysisType, 
                            title: panelTitleForCreation, 
                            configuration: newPanelDataFromServer.configuration || initialConfig 
                        };
                        const newEl = createInsightPanelElement(panelDataForCreation, false); 
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
            const panelIdStr = panel.dataset.panelId; 
            const analysisType = panel.dataset.analysisType;
            const analysisDetails = getAnalysisDetails(analysisType); // For default_config

            if (!panelIdStr || !analysisType || panelIdStr.startsWith('temp-')) { continue; }
            if (isNaN(parseInt(panelIdStr))) { 
                const contentDiv = panel.querySelector('.placeholder-chart') || panel.querySelector('.panel-content'); 
                if (contentDiv) contentDiv.innerHTML = `<p style='color:red;'><b>Error:</b>Invalid ID ('${panelIdStr}')</p>`; 
                const titleH3 = panel.querySelector('.panel-dynamic-title'); 
                if (titleH3) titleH3.textContent = "Config Error"; 
                continue; 
            }
            
            makePanelDraggable(panel); 
            
            const panelStaticTitleText = panel.dataset.staticTitle || analysisDetails?.title || 'Analysis'; 
            const titleEl = panel.querySelector('.panel-dynamic-title'); 
            if (titleEl) { titleEl.textContent = panelStaticTitleText; }
             else { console.warn(`Panel ${panelIdStr} missing .panel-dynamic-title`); }
            
            const placeholderChartDiv = panel.querySelector('.placeholder-chart'); 
            if (placeholderChartDiv) { placeholderChartDiv.innerHTML = analysisDetails?.placeholder_html || `<div class='loading-placeholder'><i class='fas fa-spinner fa-spin fa-2x'></i><p>Loading data...</p></div>`; } 
            else { console.warn(`Panel ${panelIdStr} missing .placeholder-chart`); }
            
            // Robustly parse or default the configuration from the HTML dataset
            let configObject;
            const rawConfigString = panel.dataset.configuration; 
            if (!rawConfigString || rawConfigString.trim() === "") {
                console.warn(`[Insights V32.13] Panel ${panelIdStr} (setupEventListeners): data-configuration attribute is missing or empty. Using default_config.`);
                configObject = analysisDetails?.default_config || {};
                panel.dataset.configuration = JSON.stringify(configObject); // Ensure dataset is populated with valid JSON
            } else {
                try {
                    configObject = JSON.parse(rawConfigString);
                } catch (e) {
                    console.error(`[Insights V32.13] Panel ${panelIdStr} (setupEventListeners): Error parsing panel.dataset.configuration: "${rawConfigString}". Error: ${e.message}. Falling back to default_config.`);
                    configObject = analysisDetails?.default_config || {};
                    panel.dataset.configuration = JSON.stringify(configObject); // Correct dataset with valid default
                }
            }
            
            const panelDataForInit = { 
                id: panelIdStr, 
                analysis_type: analysisType, 
                title: panelStaticTitleText, // Pass the static title
                configuration: configObject 
            };

            _initializePanelConfigurationControls(panel, panelDataForInit); 
            await loadPanelContent(panel); 
        }
        const initialPanelElements = Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)'));
        const initialPersistentPanelIds = initialPanelElements.filter(p => p.dataset.panelId && !String(p.dataset.panelId).startsWith('temp-')).map(p => parseInt(p.dataset.panelId)).filter(id => !isNaN(id));
        if (initialPersistentPanelIds.length > 0) { await updatePanelOrderOnServer(initialPersistentPanelIds); }
    }
    window.addEventListener('resize', debounce(() => { hidePalettePreview(); calculateGridCellLayout(); updateToggleButtonIcon(); }, 250));
    insightsGridContainer?.addEventListener('scroll', debounce(() => { if (!isDragging) hidePalettePreview(); }, 100));
}

export async function initInsightsManager() {
    console.log("%c[Insights] initInsightsManager - START (V32.13 - Robust JSON Parse & Summary)", "background-color: yellow; color: black; font-weight:bold;");
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
        !paletteHeader || !paletteToggleBtn || !paletteScrollContainer || 
        !emptyMessage || !palettePreviewContainer) {
        console.error("Insights Manager init failed: Critical DOM elements not found. Check HTML IDs.");
        return;
    }
    if (typeof Chart === 'undefined') console.error("Chart.js library not found."); if (typeof noUiSlider === 'undefined') console.warn("noUiSlider library not found.");
    await fetchUserGroups();
    calculateGridCellLayout();
    await setupEventListeners(); // This now has the robust parsing
    checkGridEmpty();
    isDragging = false; if(draggedElement) draggedElement.remove(); draggedElement = null;
    document.querySelectorAll('.dragging-placeholder.drop-slot-indicator').forEach(el => el.remove());
    document.removeEventListener('pointermove', onPointerMove); document.removeEventListener('pointerup', onPointerUp); document.removeEventListener('contextmenu', preventContextMenuDuringDrag, {capture:true});
    hidePalettePreview(); if (palette) { insightsView.classList.toggle('palette-collapsed', palette.classList.contains('collapsed')); } updateToggleButtonIcon();
    console.log("%c[Insights] initInsightsManager - Initialized Successfully (V32.13)", "background-color: lightgreen; color: black; font-weight:bold;");
}

function getAnalysisDetails(analysisTypeId) { const localAvailableAnalyses = { "spending-by-category": { id: "spending-by-category", title: "💸 Spending by Category", description: "Total event costs by node. Filter by group & time.", preview_title: "Spending Example", preview_image_filename: "img/placeholder-bar-chart.png", preview_description: "Shows total costs for events linked to different nodes.", placeholder_html: `<div class='loading-placeholder' style='text-align: center; padding: 20px; color: #aaa;'><i class='fas fa-spinner fa-spin fa-2x'></i><p style='margin-top: 10px;'>Loading spending data...</p></div>`, default_config: { time_period: "all_time", group_id: "all", startDate: null, endDate: null } } }; return localAvailableAnalyses[analysisTypeId]; }
// --- END OF FILE insightsManager.js ---