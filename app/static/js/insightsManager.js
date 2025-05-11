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
let sourceElement = null;
let originalSourceElement = null;
let sourceIndex = -1;
let currentTargetIndex = -1;
let dragType = null;
let startClientX = 0, startClientY = 0;
let offsetX = 0, offsetY = 0;
let gridRect = null;
let animationFrameId = null;
let activeChartInstances = {}; // { panelId: chartInstance }
let userGroupsCache = []; // Populated by fetchUserGroups

// Grid Layout Cache
let gridCellLayout = [];
let gridComputedStyle = null;
let gridColCount = 2; // Default, recalculated

// Preview State
let previewHideTimeout = null;
const PREVIEW_HIDE_DELAY = 150;
const PREVIEW_GAP_TO_RIGHT = 12;
const VIEWPORT_PADDING = 15;

// Constants
const SCROLL_THRESHOLD = 40;
const SCROLL_SPEED_MULTIPLIER = 0.15;
const API_BASE = '/api';
const CHART_ANIMATION_DURATION = 400;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;


// --- Helper Functions ---
function generateUniqueId(prefix = 'panel') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// --- API Interaction Helpers ---
async function fetchApi(url, options = {}) {
    const defaultHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };
    if (options.method && !['GET', 'HEAD'].includes(options.method.toUpperCase())) {
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
        if (csrfToken) {
            defaultHeaders['X-CSRFToken'] = csrfToken;
        } else {
            console.warn(`CSRF token not found for ${options.method} ${url}. Request may fail.`);
        }
    }
    options.headers = { ...defaultHeaders, ...options.headers };
    if (options.body && typeof options.body !== 'string') {
        options.body = JSON.stringify(options.body);
    }

    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            let errorData = { error: `Request failed (${response.status})` };
            try { errorData = await response.json(); } catch (e) { /* ignore */ }
            console.error(`API Error (${response.status}) on ${options.method || 'GET'} ${url}:`, errorData);
            throw new Error(errorData.error || `HTTP error ${response.status}`);
        }
        if (response.status === 204 || response.headers.get('content-length') === '0') return null;
        return await response.json();
    } catch (error) {
        console.error(`Network or API error on ${options.method || 'GET'} ${url}:`, error);
        throw error;
    }
}

async function addPanelToServer(analysisType, config = {}) {
    return await fetchApi(`${API_BASE}/insights/panels`, {
        method: 'POST',
        body: { analysis_type: analysisType, configuration: config }
    });
}

async function removePanelFromServer(panelId) {
    return await fetchApi(`${API_BASE}/insights/panels/${panelId}`, { method: 'DELETE' });
}

async function updatePanelOrderOnServer(panelIds) {
    const integerIds = panelIds.map(id => parseInt(id)).filter(id => !isNaN(id));
    return await fetchApi(`${API_BASE}/insights/panels/order`, {
        method: 'PUT',
        body: { panel_ids: integerIds }
    });
}

async function updatePanelConfigurationOnServer(panelId, newConfig) {
    return await fetchApi(`${API_BASE}/insights/panels/${panelId}`, {
        method: 'PATCH',
        body: { configuration: newConfig }
    });
}

async function fetchAnalysisData(analysisType, panelId = null) {
    let url = `${API_BASE}/analysis/data/${analysisType}`;
    if (panelId) {
        const panelIdInt = parseInt(panelId);
        if (!isNaN(panelIdInt)) url += `?panel_id=${panelIdInt}`;
    }
    return await fetchApi(url);
}

async function fetchUserGroups() {
    if (userGroupsCache.length > 0) return userGroupsCache;
    try {
        const groups = await fetchApi('/api/groups');
        userGroupsCache = groups || [];
        return userGroupsCache;
    } catch (error) {
        console.error("Failed to fetch user groups for insights panels:", error);
        return [];
    }
}

// --- Panel Creation & Content Loading ---
function createInsightPanelElement(panelData) {
    const panel = document.createElement('div');
    panel.className = 'insight-panel glassy';
    panel.dataset.panelId = panelData.id;
    panel.dataset.analysisType = panelData.analysis_type;
    panel.dataset.configuration = JSON.stringify(panelData.configuration || {});

    let placeholderHtmlContent = `<div class='loading-placeholder'><i class='fas fa-spinner fa-spin fa-2x'></i><p>Loading data...</p></div>`;
    const analysisDetailsForPlaceholder = getAnalysisDetails(panelData.analysis_type);
    if (analysisDetailsForPlaceholder && analysisDetailsForPlaceholder.placeholder_html) {
        placeholderHtmlContent = analysisDetailsForPlaceholder.placeholder_html;
    }

    panel.innerHTML = `
        <button class="panel-action-btn panel-config-toggle-btn" aria-label="Toggle Configuration" title="Configure Panel">
            <i class="fas fa-cog"></i>
        </button>
        <button class="panel-action-btn panel-close-btn" aria-label="Remove Panel" title="Remove Panel">
            <i class="fas fa-times"></i>
        </button>

        <div class="panel-config-area">
            <div class="panel-config-controls">
                <div class="config-group-selector">
                    <label for="group-select-${panelData.id}">Filter by Group:</label>
                    <select id="group-select-${panelData.id}" name="group_id">
                        <option value="all">All My Groups</option>
                        <!-- Options populated by JS -->
                    </select>
                </div>
                <div class="config-time-selector">
                    <label for="time-slider-${panelData.id}">Filter by Time Period:</label>
                    <div id="time-slider-${panelData.id}" class="time-range-slider-placeholder"></div>
                    <div id="time-slider-display-${panelData.id}" class="time-slider-display">Loading range...</div>
                </div>
            </div>
        </div>

        <div class="panel-main-content-wrapper">
            <h3 class="panel-dynamic-title">${panelData.title || 'Loading Analysis...'}</h3>
            <div class="panel-content">
                <div class="placeholder-chart">
                    ${placeholderHtmlContent}
                </div>
            </div>
        </div>

        <button class="panel-action-btn panel-share-btn" aria-label="Share Panel" title="Share Panel">
            <i class="fas fa-share-alt"></i>
        </button>
    `;

    makePanelDraggable(panel);
    _initializePanelConfigurationControls(panel, panelData);
    loadPanelContent(panel);

    const configToggleBtn = panel.querySelector('.panel-config-toggle-btn');
    const configArea = panel.querySelector('.panel-config-area');
    if (configToggleBtn && configArea) {
        configToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            configArea.classList.toggle('open');
            const icon = configToggleBtn.querySelector('i');
            if (icon) icon.className = configArea.classList.contains('open') ? 'fas fa-chevron-up' : 'fas fa-cog';
        });
    }
    return panel;
}

function _initializePanelConfigurationControls(panelElement, panelData) {
    const panelId = panelData.id;
    const analysisDetails = getAnalysisDetails(panelData.analysis_type);
    const defaultConfig = analysisDetails ? (analysisDetails.default_config || {}) : {};
    const currentPanelConfig = JSON.parse(panelElement.dataset.configuration || '{}');
    const config = { ...defaultConfig, ...currentPanelConfig };

    const groupSelect = panelElement.querySelector(`#group-select-${panelId}`);
    if (groupSelect) {
        while (groupSelect.options.length > 1) groupSelect.remove(1);
        userGroupsCache.forEach(group => {
            const option = new Option(group.name, group.id);
            groupSelect.add(option);
        });
        groupSelect.value = config.group_id || "all";
        groupSelect.addEventListener('change', () => _handleConfigChange(panelElement));
    }

    const sliderElement = panelElement.querySelector(`#time-slider-${panelId}`);
    const sliderDisplayElement = panelElement.querySelector(`#time-slider-display-${panelId}`);

    if (sliderElement && sliderDisplayElement && typeof noUiSlider !== 'undefined') {
        if (sliderElement.noUiSlider) sliderElement.noUiSlider.destroy();

        const todayDate = new Date();
        let maxTimestamp = Date.UTC(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
        const twoYearsAgoDate = new Date(todayDate);
        twoYearsAgoDate.setFullYear(todayDate.getFullYear() - 2);
        let minTimestamp = Date.UTC(twoYearsAgoDate.getFullYear(), twoYearsAgoDate.getMonth(), twoYearsAgoDate.getDate());

        if (isNaN(minTimestamp)) {
            console.error(`[Panel ${panelId}] minTimestamp is NaN. Defaulting.`);
            minTimestamp = new Date().getTime() - (2 * 365 * DAY_IN_MILLISECONDS);
        }
        if (isNaN(maxTimestamp)) {
            console.error(`[Panel ${panelId}] maxTimestamp is NaN. Defaulting.`);
            maxTimestamp = new Date().getTime();
        }
        if (minTimestamp >= maxTimestamp) {
            console.warn(`[Panel ${panelId}] minTimestamp (${new Date(minTimestamp).toISOString()}) >= maxTimestamp (${new Date(maxTimestamp).toISOString()}). Adjusting min.`);
            minTimestamp = maxTimestamp - DAY_IN_MILLISECONDS;
            if (minTimestamp >= maxTimestamp) { // Still an issue, e.g. maxTimestamp was 0
                 maxTimestamp = new Date().getTime();
                 minTimestamp = maxTimestamp - (2 * 365 * DAY_IN_MILLISECONDS);
                 console.warn(`[Panel ${panelId}] Further adjustment: min ${new Date(minTimestamp).toISOString()}, max ${new Date(maxTimestamp).toISOString()}`);
            }
        }

        let initialStart = minTimestamp, initialEnd = maxTimestamp;
        let parsedStartDateTs = NaN, parsedEndDateTs = NaN;

        if (config.startDate && typeof config.startDate === 'string') {
            parsedStartDateTs = new Date(config.startDate).getTime();
        }
        if (config.endDate && typeof config.endDate === 'string') {
            parsedEndDateTs = new Date(config.endDate).getTime();
        }
        
        if (isNaN(parsedStartDateTs)) parsedStartDateTs = minTimestamp;
        if (isNaN(parsedEndDateTs)) parsedEndDateTs = maxTimestamp;

        if (parsedStartDateTs <= parsedEndDateTs) {
            initialStart = Math.max(minTimestamp, parsedStartDateTs);
            initialEnd = Math.min(maxTimestamp, parsedEndDateTs);
            if (initialStart > initialEnd) initialStart = initialEnd; 
        } else if (config.time_period === 'last_month') {
            const tempDate = new Date(Date.UTC(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate()));
            tempDate.setUTCDate(tempDate.getUTCDate() - 30);
            initialStart = Math.max(minTimestamp, tempDate.getTime());
            initialEnd = maxTimestamp;
        } else if (config.time_period === 'last_year') {
            const tempDate = new Date(Date.UTC(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate()));
            tempDate.setUTCFullYear(tempDate.getUTCFullYear() - 1);
            initialStart = Math.max(minTimestamp, tempDate.getTime());
            initialEnd = maxTimestamp;
        } else {
            initialStart = minTimestamp;
            initialEnd = maxTimestamp;
        }
        
        if (isNaN(initialStart) || initialStart < minTimestamp || initialStart > maxTimestamp) {
            initialStart = minTimestamp;
        }
        if (isNaN(initialEnd) || initialEnd > maxTimestamp || initialEnd < minTimestamp) {
            initialEnd = maxTimestamp;
        }
        if (initialStart > initialEnd) {
            initialStart = initialEnd;
        }
        
        if (initialStart === initialEnd) {
            if (initialEnd < maxTimestamp - DAY_IN_MILLISECONDS / 2) { // Use half day to be safer with rounding
                initialEnd = initialStart + DAY_IN_MILLISECONDS;
                initialEnd = Math.min(initialEnd, maxTimestamp); 
            } else if (initialStart > minTimestamp + DAY_IN_MILLISECONDS / 2) {
                initialStart = initialEnd - DAY_IN_MILLISECONDS;
                initialStart = Math.max(initialStart, minTimestamp); 
            } else {
                 console.warn(`[Panel ${panelId}] Slider initialStart and initialEnd are identical and cannot be expanded within range. Range: ${new Date(minTimestamp).toISOString()} to ${new Date(maxTimestamp).toISOString()}`);
            }
        }
         // Final check to prevent min === max in range if initialStart/End forced it
        if (minTimestamp === maxTimestamp) {
            console.warn(`[Panel ${panelId}] Corrected slider range: minTimestamp was equal to maxTimestamp. Expanding max by one day.`);
            maxTimestamp += DAY_IN_MILLISECONDS;
        }


        console.debug(`[Panel ${panelId}] Slider Create Params: Range: [${new Date(minTimestamp).toISOString()}, ${new Date(maxTimestamp).toISOString()}], Start: [${new Date(initialStart).toISOString()}, ${new Date(initialEnd).toISOString()}]`);

        try {
            noUiSlider.create(sliderElement, {
                start: [initialStart, initialEnd],
                connect: true,
                range: { 'min': minTimestamp, 'max': maxTimestamp },
                step: DAY_IN_MILLISECONDS,
                tooltips: false,
                format: {
                    to: val => {
                        const numVal = parseFloat(val);
                        if (isNaN(numVal)) {
                            console.error(`[Panel ${panelId}] format.to: val is NaN. Input:`, val);
                            return "ERR_NaN"; 
                        }
                        const roundedVal = Math.round(numVal / DAY_IN_MILLISECONDS) * DAY_IN_MILLISECONDS;
                        return new Date(roundedVal).toISOString().split('T')[0];
                    },
                    from: valStr => {
                        let time;
                        const numAttempt = parseFloat(valStr);
                        // Check if valStr is a string representation of a number (timestamp)
                        // And ensure it's not something like "2023-05" which parseFloat might partially parse
                        if (!isNaN(numAttempt) && String(numAttempt) === valStr.trim() && numAttempt >= 0) {
                            time = numAttempt;
                        } else {
                            // Assume it's 'YYYY-MM-DD' or similar date string
                            time = new Date(valStr).getTime();
                        }

                        if (isNaN(time)) {
                            console.error(`[Panel ${panelId}] format.from: valStr "${valStr}" resulted in NaN timestamp. Defaulting to minTimestamp.`);
                            return minTimestamp; 
                        }
                        return time;
                    }
                },
                behaviour: 'tap-drag',
                pips: {
                    mode: 'positions',
                    values: [0, 25, 50, 75, 100],
                    density: 4,
                    format: {
                        to: val => {
                            const numVal = parseFloat(val);
                             if (isNaN(numVal)) {
                                console.error(`[Panel ${panelId}] pips.format.to: val is NaN. Input:`, val);
                                return "NaN";
                            }
                            const roundedVal = Math.round(numVal / DAY_IN_MILLISECONDS) * DAY_IN_MILLISECONDS;
                            const utcDateStr = new Date(roundedVal).toISOString().split('T')[0];
                            const localDateForDisplay = new Date(utcDateStr + 'T00:00:00');
                            return localDateForDisplay.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
                        }
                    }
                }
            });

            const updateSliderDisplay = (values) => { 
                if (!values || values.length < 2 || typeof values[0] !== 'string' || typeof values[1] !== 'string' || values[0] === "ERR_NaN" || values[1] === "ERR_NaN") {
                    sliderDisplayElement.textContent = "Invalid Date Range (formatter error)";
                    console.error(`[Panel ${panelId}] updateSliderDisplay received invalid values:`, values);
                    return;
                }
                const startDate = new Date(values[0] + 'T00:00:00'); 
                const endDate = new Date(values[1] + 'T00:00:00');   
                const options = { month: 'short', day: 'numeric', year: 'numeric' };
                sliderDisplayElement.textContent = (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) ?
                    "Invalid Date Range" :
                    `${startDate.toLocaleDateString(undefined, options)} - ${endDate.toLocaleDateString(undefined, options)}`;
            };
            sliderElement.noUiSlider.on('update', updateSliderDisplay);
            sliderElement.noUiSlider.on('set', () => _handleConfigChange(panelElement));
            
            try {
                const currentFormattedValues = sliderElement.noUiSlider.get();
                updateSliderDisplay(currentFormattedValues);
            } catch (e) {
                console.error(`[Panel ${panelId}] Error getting initial slider values for display:`, e);
                sliderDisplayElement.textContent = "Error initializing display";
            }

        } catch (error) {
            console.error(`[Panel ${panelId}] Failed to create noUiSlider:`, error);
            sliderDisplayElement.textContent = "Slider Error";
            sliderElement.innerHTML = `<p style="color:red;">Error initializing time range slider.</p>`;
        }
    }
}

async function _handleConfigChange(panelElement) {
    const panelId = panelElement.dataset.panelId;
    const analysisType = panelElement.dataset.analysisType;
    if (!panelId || !analysisType) return;

    const groupSelect = panelElement.querySelector(`#group-select-${panelId}`);
    const sliderElement = panelElement.querySelector(`#time-slider-${panelId}`);
    const analysisDetails = getAnalysisDetails(analysisType);
    let newConfig = { ...(analysisDetails?.default_config || {}), ...JSON.parse(panelElement.dataset.configuration || '{}')};

    if (groupSelect) newConfig.group_id = groupSelect.value;
    if (sliderElement && sliderElement.noUiSlider) {
        try {
            const [startDateStr, endDateStr] = sliderElement.noUiSlider.get();
            if (startDateStr === "ERR_NaN" || endDateStr === "ERR_NaN") {
                console.error(`[Panel ${panelId}] Cannot save config due to slider formatter error.`);
                alert("Error with date range selection. Please try again or refresh.");
                return;
            }
            newConfig.startDate = startDateStr;
            newConfig.endDate = endDateStr;
            newConfig.time_period = 'custom'; 
        } catch (e) {
            console.error(`[Panel ${panelId}] Error getting slider values on config change:`, e);
            alert("Error reading date range. Configuration not saved.");
            return;
        }
    }
    
    panelElement.dataset.configuration = JSON.stringify(newConfig);
    try {
        await updatePanelConfigurationOnServer(parseInt(panelId), newConfig);
        await loadPanelContent(panelElement);
    } catch (error) {
        alert(`Failed to update panel settings: ${error.message}`);
    }
}

async function loadPanelContent(panelElement) {
    const analysisType = panelElement.dataset.analysisType;
    const panelId = panelElement.dataset.panelId;
    const contentContainer = panelElement.querySelector('.placeholder-chart');
    const panelTitleEl = panelElement.querySelector('.panel-dynamic-title');

    if (!analysisType || !panelId || !contentContainer || !panelTitleEl) return;
    if (activeChartInstances[panelId]) {
        try { activeChartInstances[panelId].destroy(); } catch (e) { /*ignore*/ }
        delete activeChartInstances[panelId];
    }

    const analysisDetailsForLoad = getAnalysisDetails(analysisType);
    contentContainer.innerHTML = analysisDetailsForLoad?.placeholder_html || `<div class='loading-placeholder'><i class='fas fa-spinner fa-spin fa-2x'></i><p>Loading...</p></div>`;
    panelTitleEl.textContent = 'Loading title...';

    try {
        if (typeof Chart === 'undefined') throw new Error("Chart.js library not loaded.");
        const analysisResult = await fetchAnalysisData(analysisType, panelId);

        panelTitleEl.textContent = analysisResult?.title || analysisDetailsForLoad?.title || "Analysis";

        if (analysisType === 'spending-by-category' && analysisResult?.data) {
            if (analysisResult.data.length > 0) {
                contentContainer.innerHTML = '';
                const canvas = document.createElement('canvas');
                contentContainer.appendChild(canvas);
                const ctx = canvas.getContext('2d');
                const labels = analysisResult.data.map(item => item.category || 'Uncategorized');
                const amounts = analysisResult.data.map(item => item.amount);
                const bgColors = Array.from({ length: labels.length }, (_, i) => `hsl(${(i * 360 / labels.length) % 360}, 65%, 60%)`);
                const hoverBgColors = bgColors.map(c => c.replace(/60%\)$/, '70%)'));

                activeChartInstances[panelId] = new Chart(ctx, {
                    type: 'pie',
                    data: { labels, datasets: [{ label: 'Spending', data: amounts, backgroundColor: bgColors, hoverBackgroundColor: hoverBgColors, borderColor: '#333', borderWidth: 1, hoverOffset: 8 }] },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'bottom', labels: { color: '#ddd', padding: 15, boxWidth: 12, usePointStyle: true } },
                            tooltip: {
                                backgroundColor: 'rgba(20,20,30,0.85)', titleColor: '#eee', bodyColor: '#ddd',
                                callbacks: {
                                    label: ctx => `${ctx.label || ''}: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(ctx.parsed)} (${(ctx.parsed / ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0) * 100).toFixed(1)}%)`
                                }
                            }
                        },
                        animation: { duration: CHART_ANIMATION_DURATION }
                    }
                });
            } else {
                contentContainer.innerHTML = '<p style="text-align:center;color:#bbb;padding:15px 5px;">No spending data found for the selected criteria.</p>';
            }
        } else {
            contentContainer.innerHTML = `<p style='text-align:center;color:orange;padding:15px 5px;'>Display not implemented for: ${analysisType}</p>`;
        }
    } catch (error) {
        contentContainer.innerHTML = `<p style='color:red;text-align:center;padding:15px 5px;'>Error loading data.<br><small>${error.message}</small></p>`;
        panelTitleEl.textContent = 'Error Loading';
        if (activeChartInstances[panelId]) { try { activeChartInstances[panelId].destroy(); } catch (e) { /*ignore*/ } delete activeChartInstances[panelId]; }
    }
}

// --- Grid State & Layout ---
function checkGridEmpty() {
    if (!insightsGrid || !emptyMessage) return;
    const hasContent = insightsGrid.querySelector('.insight-panel:not(.dragging-placeholder)');
    emptyMessage.style.display = hasContent ? 'none' : 'block';
    if (!hasContent && emptyMessage.parentElement !== insightsGrid) insightsGrid.appendChild(emptyMessage);
}

function calculateGridCellLayout() {
    if (!insightsGrid || !insightsGridContainer) { gridCellLayout = []; return; }
    gridCellLayout = [];
    gridComputedStyle = window.getComputedStyle(insightsGrid);
    gridColCount = (window.innerWidth <= 768) ? 1 : 2; 
    
    const panelMargin = 12; 
    const gridPadding = 10; 
    const availableGridWidth = insightsGridContainer.clientWidth - (2 * gridPadding);
    
    let panelWidth = (availableGridWidth - (gridColCount - 1) * (2 * panelMargin)) / gridColCount;
    if (gridColCount === 1) {
        panelWidth = availableGridWidth - (2 * panelMargin);
    }
    panelWidth = Math.max(200, panelWidth);
    const panelHeight = panelWidth; 

    const startOffsetX = gridPadding + panelMargin;
    const startOffsetY = gridPadding + panelMargin;

    const visiblePanels = Array.from(insightsGrid.children).filter(el => el.classList.contains('insight-panel') && !el.classList.contains('dragging-placeholder'));
    const estimatedRows = Math.max(1, Math.ceil((visiblePanels.length + gridColCount) / gridColCount)); 

    for (let r = 0; r < estimatedRows; r++) {
        for (let c = 0; c < gridColCount; c++) {
            const slotX = startOffsetX + c * (panelWidth + 2 * panelMargin);
            const slotY = startOffsetY + r * (panelHeight + 2 * panelMargin);
            gridCellLayout.push({
                x: slotX - panelMargin, y: slotY - panelMargin, 
                width: panelWidth + 2 * panelMargin, height: panelHeight + 2 * panelMargin,
                contentX: slotX, contentY: slotY, 
                contentWidth: panelWidth, contentHeight: panelHeight
            });
        }
    }
}


function findNearestSlotIndex(pointerX, pointerY) {
    let closestIndex = -1, minDistSq = Infinity;
    if (!gridCellLayout.length) calculateGridCellLayout();
    if (!gridCellLayout.length) return -1;
    gridCellLayout.forEach((slot, index) => {
        const slotCenterX = slot.contentX + slot.contentWidth / 2;
        const slotCenterY = slot.contentY + slot.contentHeight / 2;
        const distSq = (pointerX - slotCenterX) ** 2 + (pointerY - slotCenterY) ** 2;
        if (distSq < minDistSq) { minDistSq = distSq; closestIndex = index; }
    });
    const panelCount = insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder)').length;
    return Math.min(closestIndex, panelCount); 
}

// --- Palette Preview Logic ---
function showPalettePreview(targetPaletteItem) {
    if (!palettePreviewContainer || !targetPaletteItem || isDragging || (palette?.classList.contains('collapsed') && window.innerWidth > 768)) return;
    const { previewTitle, previewImageUrl, previewDescription } = targetPaletteItem.dataset;
    if (!previewTitle || !previewDescription) { hidePalettePreview(); return; }
    clearTimeout(previewHideTimeout); previewHideTimeout = null;
    palettePreviewContainer.innerHTML = `
        <div class="preview-container-inner">
            <h3 class="preview-title">${previewTitle}</h3>
            <div class="preview-content">
                ${previewImageUrl ? `<img src="${previewImageUrl}" alt="${previewTitle} preview" style="max-height:120px;width:auto;display:block;margin:5px auto 8px;border-radius:3px;">` : ''}
                <p>${previewDescription}</p>
            </div>
        </div>`;
    palettePreviewContainer.style.display = 'block'; palettePreviewContainer.style.visibility = 'hidden'; palettePreviewContainer.style.opacity = '0'; palettePreviewContainer.style.transform = 'scale(0.95)'; palettePreviewContainer.classList.remove('visible');
    requestAnimationFrame(() => {
        if (!palettePreviewContainer || !targetPaletteItem) return;
        const prevRect = palettePreviewContainer.getBoundingClientRect(), itemRect = targetPaletteItem.getBoundingClientRect();
        const contRect = insightsView?.getBoundingClientRect() || { left:0,top:0,right:window.innerWidth,bottom:window.innerHeight };
        let l = Math.max(contRect.left+VIEWPORT_PADDING, Math.min(itemRect.right+PREVIEW_GAP_TO_RIGHT, contRect.right-prevRect.width-VIEWPORT_PADDING));
        let t = Math.max(contRect.top+VIEWPORT_PADDING, Math.min(itemRect.top+(itemRect.height/2)-(prevRect.height/2), contRect.bottom-prevRect.height-VIEWPORT_PADDING));
        palettePreviewContainer.style.left = `${Math.round(l-contRect.left)}px`; palettePreviewContainer.style.top = `${Math.round(t-contRect.top)}px`;
        palettePreviewContainer.style.visibility = 'visible'; palettePreviewContainer.classList.add('visible'); palettePreviewContainer.style.opacity = '1'; palettePreviewContainer.style.transform = 'scale(1)';
    });
}
function scheduleHidePalettePreview() { clearTimeout(previewHideTimeout); previewHideTimeout = setTimeout(hidePalettePreview, PREVIEW_HIDE_DELAY + 100); }
function hidePalettePreview() {
    clearTimeout(previewHideTimeout); previewHideTimeout = null;
    if (palettePreviewContainer?.classList.contains('visible')) {
        palettePreviewContainer.classList.remove('visible'); palettePreviewContainer.style.opacity = '0'; palettePreviewContainer.style.transform = 'scale(0.95)';
        setTimeout(() => { if (palettePreviewContainer && !palettePreviewContainer.classList.contains('visible')) { palettePreviewContainer.style.display = 'none'; palettePreviewContainer.innerHTML = ''; } }, 300);
    } else if (palettePreviewContainer) { palettePreviewContainer.style.display = 'none'; palettePreviewContainer.innerHTML = ''; }
}
function cancelHidePreview() { clearTimeout(previewHideTimeout); }

// --- Drag and Drop Logic ---
function onPointerDown(event) {
    if (event.target.closest('.panel-action-btn, .add-analysis-btn, .palette-toggle-btn, .panel-config-area, .panel-config-controls, .panel-config-controls *, .noUi-handle, .noUi-pips')) return;
    if (event.button !== 0 || isDragging) return;
    const panel = event.target.closest('.insight-panel:not(.dragging-placeholder)');
    const paletteItem = event.target.closest('.palette-item');
    if (panel?.dataset.panelId) initiateDrag(event, panel, 'grid');
    else if (paletteItem && !palette?.classList.contains('collapsed') && paletteItem.dataset.analysisType) initiateDrag(event, paletteItem, 'palette');
}

function initiateDrag(event, element, type) {
    event.preventDefault(); event.stopPropagation(); hidePalettePreview();
    isDragging = true; dragType = type; sourceElement = element;
    startClientX = event.clientX; startClientY = event.clientY;
    calculateGridCellLayout();
    placeholderElement = document.createElement('div'); placeholderElement.className = 'insight-panel dragging-placeholder';
    let elementRect;
    if (dragType === 'grid') {
        originalSourceElement = sourceElement; elementRect = originalSourceElement.getBoundingClientRect();
        const gridContRect = insightsGridContainer.getBoundingClientRect();
        const initialX = (elementRect.left-gridContRect.left+insightsGridContainer.scrollLeft)+elementRect.width/2;
        const initialY = (elementRect.top-gridContRect.top+insightsGridContainer.scrollTop)+elementRect.height/2;
        sourceIndex = findNearestSlotIndex(initialX, initialY); currentTargetIndex = sourceIndex;
        if (originalSourceElement.parentElement) originalSourceElement.parentElement.replaceChild(placeholderElement, originalSourceElement);
        else { isDragging=false; return; }
        draggedElementClone = originalSourceElement.cloneNode(true);
        draggedElementClone.querySelectorAll('button,select,input,.noUi-target,.panel-config-controls').forEach(el=>el.remove());
        draggedElementClone.querySelector('.panel-config-area')?.classList.remove('open');
        offsetX = startClientX - elementRect.left; offsetY = startClientY - elementRect.top;
    } else { // palette
        originalSourceElement = null;
        const { analysisType, title, description } = sourceElement.dataset;
        if (!analysisType || !title) { isDragging=false; return; }
        const analysisDetails = getAnalysisDetails(analysisType);
        const defaultConfig = analysisDetails?.default_config || {};
        const tempPanelData = { id:'temp-drag', analysis_type:analysisType, title, description, configuration:defaultConfig };
        const tempEl = createInsightPanelElement(tempPanelData); 
        tempEl.style.position='absolute'; tempEl.style.visibility='hidden'; tempEl.style.width='auto'; tempEl.style.height='auto'; tempEl.style.minWidth='250px'; tempEl.style.margin='0';
        document.body.appendChild(tempEl); elementRect = tempEl.getBoundingClientRect(); document.body.removeChild(tempEl);
        draggedElementClone = createInsightPanelElement(tempPanelData); 
        draggedElementClone.querySelectorAll('button,select,input,.noUi-target,.panel-config-controls').forEach(el=>el.remove());
        draggedElementClone.querySelector('.panel-config-area')?.classList.remove('open');
        sourceIndex = -1; currentTargetIndex = -1;
        offsetX = Math.min(elementRect.width*0.15,30); offsetY = Math.min(elementRect.height*0.15,20);
        elementRect = {left:startClientX-offsetX, top:startClientY-offsetY, width:elementRect.width, height:elementRect.height};
    }
    draggedElementClone.classList.add('dragging-clone'); Object.assign(draggedElementClone.style, {position:'fixed', zIndex:1000, pointerEvents:'none', width:`${elementRect.width}px`, height:`${elementRect.height}px`, left:`${elementRect.left}px`, top:`${elementRect.top}px`});
    document.body.appendChild(draggedElementClone);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp, {once:true});
    document.addEventListener('contextmenu', preventContextMenuDuringDrag, {capture:true});
}

function onPointerMove(event) {
    if (!isDragging || !draggedElementClone) return;
    const currentX = event.clientX, currentY = event.clientY;
    cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(() => {
        draggedElementClone.style.left = `${currentX - offsetX}px`;
        draggedElementClone.style.top = `${currentY - offsetY}px`;
        gridRect = insightsGridContainer.getBoundingClientRect();
        const pointerXInGridCont = currentX - gridRect.left, pointerYInGridCont = currentY - gridRect.top;
        const isOverGrid = currentX>=gridRect.left && currentX<=gridRect.right && currentY>=gridRect.top && currentY<=gridRect.bottom;
        let nearestIdx = -1;
        if (isOverGrid) {
            const pointerXInGrid = pointerXInGridCont + insightsGridContainer.scrollLeft;
            const pointerYInGrid = pointerYInGridCont + insightsGridContainer.scrollTop;
            nearestIdx = findNearestSlotIndex(pointerXInGrid, pointerYInGrid);
        }
        if (isOverGrid && nearestIdx !== -1) {
            if (nearestIdx !== currentTargetIndex || !placeholderElement.parentElement) {
                insertElementAtIndex(placeholderElement, nearestIdx); currentTargetIndex = nearestIdx;
            }
        } else {
            if (placeholderElement.parentElement) placeholderElement.remove();
            currentTargetIndex = -1;
        }
        if (isOverGrid) handleGridScroll(currentY, gridRect);
    });
}

function handleGridScroll(clientY, gridContainerRect) {
    let scrollDelta = 0;
    const speed = SCROLL_THRESHOLD * SCROLL_SPEED_MULTIPLIER * 0.5; 
    if (clientY < gridContainerRect.top + SCROLL_THRESHOLD) {
        scrollDelta = -speed * (1 - (clientY - gridContainerRect.top) / SCROLL_THRESHOLD);
    } else if (clientY > gridContainerRect.bottom - SCROLL_THRESHOLD) {
        scrollDelta = speed * (1 - (gridContainerRect.bottom - clientY) / SCROLL_THRESHOLD);
    }
    if (scrollDelta !== 0) insightsGridContainer.scrollTop += scrollDelta;
}

async function onPointerUp() {
    if (!isDragging) return;
    cancelAnimationFrame(animationFrameId);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('contextmenu', preventContextMenuDuringDrag, {capture:true});
    draggedElementClone?.remove(); draggedElementClone = null;
    const droppedInside = currentTargetIndex !== -1 && placeholderElement?.parentElement === insightsGrid;

    try {
        if (droppedInside) {
            if (dragType === 'palette') {
                const { analysisType } = sourceElement.dataset;
                const analysisDetails = getAnalysisDetails(analysisType);
                const initialConfig = analysisDetails?.default_config || {};
                const newPanelData = await addPanelToServer(analysisType, initialConfig);
                if (!newPanelData?.id) throw new Error("Panel creation failed: No ID from server.");
                const finalPanel = createInsightPanelElement(newPanelData);
                placeholderElement.replaceWith(finalPanel);
            } else if (dragType === 'grid' && originalSourceElement) {
                originalSourceElement.style = ''; 
                placeholderElement.replaceWith(originalSourceElement);
            }
            const finalPanelIds = Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder)')).map(p => p.dataset.panelId);
            await updatePanelOrderOnServer(finalPanelIds);
        } else if (dragType === 'grid' && originalSourceElement) { 
            originalSourceElement.style = '';
            insertElementAtIndex(originalSourceElement, sourceIndex); 
            loadPanelContent(originalSourceElement); 
        }
    } catch (apiError) {
        alert(`Error saving changes: ${apiError.message}`);
        if (dragType === 'grid' && originalSourceElement) { 
            originalSourceElement.style = ''; insertElementAtIndex(originalSourceElement, sourceIndex);
            loadPanelContent(originalSourceElement);
        }
    } finally {
        placeholderElement?.remove();
        isDragging = false; sourceElement = null; originalSourceElement = null; placeholderElement = null; sourceIndex = -1; dragType = null; currentTargetIndex = -1;
        setTimeout(() => {
            calculateGridCellLayout(); checkGridEmpty();
            const currentPanelIds = new Set(Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder)')).map(p => p.dataset.panelId));
            Object.keys(activeChartInstances).forEach(id => { if(!currentPanelIds.has(id)) { try{activeChartInstances[id].destroy();}catch(e){} delete activeChartInstances[id];}});
        }, 50);
    }
}

function preventContextMenuDuringDrag(event) { if (isDragging) event.preventDefault(); }

function insertElementAtIndex(element, index) {
    const current = Array.from(insightsGrid.children).filter(el => el.classList.contains('insight-panel') && el !== element);
    index = Math.max(0, Math.min(index, current.length));
    const ref = (index < current.length) ? current[index] : emptyMessage;
    if (ref?.parentElement === insightsGrid) insightsGrid.insertBefore(element, ref);
    else insightsGrid.appendChild(element); 
    if (emptyMessage && emptyMessage.parentElement !== insightsGrid) insightsGrid.appendChild(emptyMessage); 
}

// --- Panel Actions & Palette Toggle ---
async function handleGridAction(event) {
    const panel = event.target.closest('.insight-panel');
    if (!panel || !panel.dataset.panelId || panel.classList.contains('dragging-placeholder')) return;
    const panelId = panel.dataset.panelId;

    if (event.target.closest('.panel-close-btn')) {
        event.stopPropagation();
        if (activeChartInstances[panelId]) { try { activeChartInstances[panelId].destroy(); } catch(e){} delete activeChartInstances[panelId]; }
        const sliderEl = panel.querySelector(`#time-slider-${panelId}`);
        if (sliderEl?.noUiSlider) sliderEl.noUiSlider.destroy();
        panel.remove(); checkGridEmpty(); calculateGridCellLayout();
        try { await removePanelFromServer(parseInt(panelId)); }
        catch (error) { alert(`Error removing panel: ${error.message}. Please refresh.`); }
    } else if (event.target.closest('.panel-share-btn')) {
        event.stopPropagation();
        alert(`Sharing panel '${panel.querySelector('.panel-dynamic-title')?.textContent || 'N/A'}' - Not implemented.`);
    }
}

function makePanelDraggable(panelElement) {
    panelElement.removeEventListener('pointerdown', onPointerDown);
    panelElement.addEventListener('pointerdown', onPointerDown);
}

// --- Palette & Resize ---
function debounce(func, wait) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => func.apply(this,a), wait); }; }
function handlePaletteToggle(forceState=null) {
    if (!palette || !paletteToggleBtn) return; hidePalettePreview();
    let shouldClose = forceState === 'close' || (forceState === null && !palette.classList.contains('collapsed'));
    palette.classList.toggle('collapsed', shouldClose);
    insightsView?.classList.toggle('palette-collapsed', shouldClose);
    updateToggleButtonIcon();
    setTimeout(calculateGridCellLayout, parseFloat(getComputedStyle(palette).transitionDuration)*1000 || 350);
}
function updateToggleButtonIcon() {
    if (!palette || !paletteToggleBtn) return;
    const icon = paletteToggleBtn.querySelector('i'); if (!icon) return;
    const isMobile = window.innerWidth <= 768, isCollapsed = palette.classList.contains('collapsed');
    icon.className = `fas ${isMobile ? (isCollapsed ? 'fa-chevron-up':'fa-chevron-down') : (isCollapsed ? 'fa-chevron-right':'fa-chevron-left')}`;
    paletteToggleBtn.setAttribute('aria-label', isCollapsed ? 'Expand Palette' : 'Collapse Palette');
}

// --- Initialization and Event Setup ---
function setupEventListeners() {
    if (!insightsView) return;
    paletteHeader?.addEventListener('click', e => { if (!e.target.closest('.palette-toggle-btn, .add-analysis-btn')) handlePaletteToggle(); });
    paletteToggleBtn?.addEventListener('click', e => { e.stopPropagation(); handlePaletteToggle(); });

    if (paletteScrollContainer) {
        paletteScrollContainer.addEventListener('pointerdown', onPointerDown);
        paletteScrollContainer.addEventListener('mouseover', e => { if (!isDragging && !palette?.classList.contains('collapsed') && window.innerWidth>768) { const item = e.target.closest('.palette-item'); if(item) showPalettePreview(item); }});
        paletteScrollContainer.addEventListener('mouseout', e => { if(!isDragging){ const item=e.target.closest('.palette-item'); if(item && !item.contains(e.relatedTarget) && !palettePreviewContainer?.contains(e.relatedTarget)) scheduleHidePalettePreview(); }});
        paletteScrollContainer.addEventListener('click', async e => {
            const addBtn = e.target.closest('.add-analysis-btn');
            if (addBtn && !isDragging) {
                e.stopPropagation();
                const item = addBtn.closest('.palette-item');
                if (item?.dataset.analysisType) {
                    const { analysisType } = item.dataset;
                    const analysisDetails = getAnalysisDetails(analysisType);
                    const initialConfig = analysisDetails?.default_config || {};
                    addBtn.disabled=true; addBtn.innerHTML='<i class="fas fa-spinner fa-spin"></i>';
                    try {
                        const newPanelData = await addPanelToServer(analysisType, initialConfig);
                        if (!newPanelData?.id) throw new Error("Panel creation failed.");
                        const newEl = createInsightPanelElement(newPanelData);
                        if (emptyMessage?.parentElement === insightsGrid) insightsGrid.insertBefore(newEl, emptyMessage);
                        else insightsGrid.appendChild(newEl);
                        checkGridEmpty(); calculateGridCellLayout();
                        await updatePanelOrderOnServer(Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder)')).map(p=>p.dataset.panelId));
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
        insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder)').forEach(panel => {
            if (panel.dataset.panelId && panel.dataset.analysisType) {
                makePanelDraggable(panel);
                const panelData = {
                    id: panel.dataset.panelId,
                    analysis_type: panel.dataset.analysisType,
                    title: panel.querySelector('.panel-dynamic-title')?.textContent || 'Analysis',
                    configuration: JSON.parse(panel.dataset.configuration || '{}')
                };
                _initializePanelConfigurationControls(panel, panelData); 
                loadPanelContent(panel); 
                const cfgToggle = panel.querySelector('.panel-config-toggle-btn'), cfgArea = panel.querySelector('.panel-config-area');
                if(cfgToggle && cfgArea) cfgToggle.addEventListener('click', e => { e.stopPropagation(); cfgArea.classList.toggle('open'); cfgToggle.querySelector('i').className = cfgArea.classList.contains('open')?'fas fa-chevron-up':'fas fa-cog'; });
            }
        });
    }
    window.addEventListener('resize', debounce(() => { hidePalettePreview(); calculateGridCellLayout(); updateToggleButtonIcon(); }, 250));
    insightsGridContainer?.addEventListener('scroll', debounce(() => { if (!isDragging) hidePalettePreview(); }, 100));
}

export async function initInsightsManager() {
    console.log("Initializing Insights Manager (V24 - Robust format.from)...");
    insightsView = document.getElementById('insights-view');
    insightsGridContainer = document.getElementById('insights-grid-container');
    insightsGrid = document.getElementById('insights-grid');
    palette = document.getElementById('analysis-palette');
    paletteHeader = document.getElementById('palette-header');
    paletteToggleBtn = document.getElementById('palette-toggle-btn');
    paletteScrollContainer = document.getElementById('palette-scroll-container');
    emptyMessage = document.getElementById('insights-empty-message');
    palettePreviewContainer = document.getElementById('palette-preview-container');

    if (!insightsView || !insightsGridContainer || !insightsGrid || !palette || !palettePreviewContainer || !emptyMessage) {
        console.error("Insights Manager init failed: One or more critical elements not found. Aborting."); return;
    }
    if (typeof Chart === 'undefined') console.error("Chart.js library not found.");
    if (typeof noUiSlider === 'undefined') console.warn("noUiSlider library not found. Time range slider will not work.");

    await fetchUserGroups();
    calculateGridCellLayout();
    checkGridEmpty();
    setupEventListeners(); 

    isDragging = false; draggedElementClone?.remove();
    document.querySelectorAll('.dragging-placeholder').forEach(el => el.remove());
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('contextmenu', preventContextMenuDuringDrag, {capture:true});
    hidePalettePreview();
    insightsView.classList.toggle('palette-collapsed', palette.classList.contains('collapsed'));
    updateToggleButtonIcon();
    console.log("Insights Manager Initialized Successfully (V24).");
}

// Local helper to get analysis details
function getAnalysisDetails(analysisTypeId) {
    const localAvailableAnalyses = {
        "spending-by-category": {
            id: "spending-by-category",
            title: "💸 Spending by Category",
            description: "Total event costs by node. Filter by group & time.",
            preview_title: "Spending Example",
            preview_image_filename: "img/placeholder-bar-chart.png",
            preview_description: "Shows total costs for events linked to different nodes.",
            placeholder_html: `<div class='loading-placeholder' style='text-align: center; padding: 20px; color: #aaa;'><i class='fas fa-spinner fa-spin fa-2x'></i><p style='margin-top: 10px;'>Loading spending data...</p></div>`,
            default_config: { time_period: "all_time", group_id: "all", startDate: null, endDate: null }
        }
    };
    return localAvailableAnalyses[analysisTypeId];
}
// --- END OF FILE insightsManager.js ---