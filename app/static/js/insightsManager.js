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
// Debounce ONLY for refreshing chart during slide (IF we add that back later)
// const PANEL_SLIDE_REFRESH_DEBOUNCE_MS = 300; // Keep commented out for now

// --- Helper Functions ---
function generateUniqueId(prefix = 'panel') { return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`; }

function timestampToYyyyMmDd(timestamp) {
    if (!Number.isFinite(timestamp)) return null;
    try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return null;
        return date.toISOString().split('T')[0];
    } catch (e) {
        console.error("Error in timestampToYyyyMmDd:", e);
        return null;
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func.apply(this, args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Store debounced refresh functions PER PANEL (IF needed for slide refresh)
// const debouncedPanelRefreshers = {}; // Keep commented out for now

// --- API Interaction Helpers ---
async function fetchApi(url, options = {}) {
    const defaultHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (options.method && !['GET', 'HEAD'].includes(options.method.toUpperCase())) {
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
        if (csrfToken) defaultHeaders['X-CSRFToken'] = csrfToken;
    }
    options.headers = { ...defaultHeaders, ...options.headers };
    if (options.body && typeof options.body !== 'string') {
        if (typeof options.body === 'object' && options.body !== null) {
            options.body = JSON.stringify(options.body);
        }
    }
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
// This remains the core function for saving config changes
async function updatePanelConfigurationOnServer(panelIdInt, newConfig) {
    console.log(`[Insights PATCH] Panel ${panelIdInt}: Sending config:`, JSON.parse(JSON.stringify(newConfig)));
    return await fetchApi(`${API_BASE}/insights/panels/${panelIdInt}`, { method: 'PATCH', body: { configuration: newConfig } });
}

// Fetch data - relies on backend using the *saved* config for the panel_id
async function fetchAnalysisData(analysisType, panelIdInt = null) {
    let url = `${API_BASE}/analysis/data/${analysisType}`;
    const queryParams = new URLSearchParams();
    if (panelIdInt !== null && typeof panelIdInt === 'number' && !isNaN(panelIdInt)) {
        queryParams.append('panel_id', panelIdInt);
    }
    const queryString = queryParams.toString();
    if (queryString) {
        url += `?${queryString}`;
    }
    // console.log(`[Insights GET] fetchAnalysisData URL: ${url}`);
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
    panel.dataset.staticTitle = panelMainTitleText;

    let configToStore = analysisDetails?.default_config || {};
    if (typeof panelData.configuration === 'object' && panelData.configuration !== null) {
        configToStore = panelData.configuration;
    }
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

    // NO debouncer needed here in this simplified version
    return panel;
}

// Updates the summary text below the title based on backend title or saved config
function _updatePanelConfigSummary(panelElement, backendGeneratedTitle = null) {
    if (!panelElement) return;
    const summaryElement = panelElement.querySelector('.panel-config-summary');
    if (!summaryElement) return;
    const panelIdStr = panelElement.dataset.panelId;

    let groupDisplay = "All Groups";
    let dateRangeDisplay = "All Time";
    let configSource = null;

    // 1. Prioritize Backend Title
    if (backendGeneratedTitle) {
        const staticTitle = panelElement.dataset.staticTitle || "";
        let summaryText = backendGeneratedTitle;
        if (staticTitle && summaryText.toLowerCase().startsWith(staticTitle.toLowerCase())) {
            summaryText = summaryText.substring(staticTitle.length).trim();
            if (summaryText.startsWith("-") || summaryText.startsWith("–") || summaryText.startsWith("—")) {
                 summaryText = summaryText.substring(1).trim();
            }
        }
        summaryElement.textContent = summaryText || "Current filters";
        // console.log(`[Summary] Using backend title for panel ${panelIdStr}: "${summaryText}"`);
        return;
    }

    // 2. Fallback to panel's dataset configuration (reflects last saved state)
    try {
         configSource = JSON.parse(panelElement.dataset.configuration || '{}');
    } catch (e) {
        console.error(`Error parsing dataset config for summary fallback on panel ${panelIdStr}: ${e}`);
        summaryElement.textContent = "Error loading filters";
        return;
    }

    // 3. Generate summary from configSource
    if (configSource.group_id && String(configSource.group_id) !== "all") {
        const group = userGroupsCache.find(g => String(g.id) === String(configSource.group_id));
        groupDisplay = group ? group.name : `Group ID: ${configSource.group_id}`;
    }

    if (configSource.startDate && configSource.endDate) {
        try {
            const startDate = new Date(configSource.startDate + 'T00:00:00Z');
            const endDate = new Date(configSource.endDate + 'T00:00:00Z');
            const options = { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' };
            if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
                // Check if it represents "All Time" based on slider boundaries (best effort)
                const sliderElement = panelElement.querySelector(`#time-slider-${panelIdStr}`);
                let isAllTime = false;
                if (sliderElement?.noUiSlider?.options?.range) {
                     const sliderMinTimestamp = sliderElement.noUiSlider.options.range.min;
                     const sliderMaxTimestamp = sliderElement.noUiSlider.options.range.max;
                     const tolerance = DAY_IN_MILLISECONDS / 2;
                     isAllTime = Math.abs(startDate.getTime() - sliderMinTimestamp) < tolerance && Math.abs(endDate.getTime() - sliderMaxTimestamp) < tolerance;
                }
                dateRangeDisplay = isAllTime ? "All Time" : `${startDate.toLocaleDateString(undefined, options)} - ${endDate.toLocaleDateString(undefined, options)}`;
            } else { dateRangeDisplay = "Invalid Dates"; }
        } catch (e) { dateRangeDisplay = "Date Error"; }
    } else {
        dateRangeDisplay = "All Time";
    }

    summaryElement.textContent = `${groupDisplay} | ${dateRangeDisplay}`;
    // console.log(`[Summary] Generated text for panel ${panelIdStr} from dataset config: "${summaryElement.textContent}"`);
}


// --- Slider Handling ---
let sliderNumberFormatter; // Init in initInsightsManager

// Handles the 'slide' event: ONLY updates the visual text display below slider.
// Does NOT save or trigger data reload.
function _handleSlideEvent(values, handle, unencoded, tap, positions, sliderInstance) {
    const panelElement = sliderInstance.target.closest('.insight-panel');
    if (!panelElement) return;
    const sliderDisplayElement = panelElement.querySelector(`#time-slider-display-${panelIdStr}`); // Find display element within panel
    const panelIdStr = panelElement.dataset.panelId; // Get panel ID for context

    if (sliderDisplayElement) {
        try {
            const startTimestamp = sliderNumberFormatter.from(values[0]);
            const endTimestamp = sliderNumberFormatter.from(values[1]);
            if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) throw new Error("Invalid numeric values");
            const sD = new Date(startTimestamp); const eD = new Date(endTimestamp);
            const opts = {month:'short', day:'numeric', year:'numeric', timeZone:'UTC'};
            sliderDisplayElement.textContent = `${sD.toLocaleDateString(undefined,opts)} - ${eD.toLocaleDateString(undefined,opts)}`;
        } catch (e) {
            console.warn(`[Slide Event] Panel ${panelIdStr}: Error updating display text: ${e.message}. Values:`, values);
            sliderDisplayElement.textContent = "Date Error";
        }
    }
    // --- We COULD update the main summary text here too for instant feedback ---
    // --- but it might be confusing if data doesn't match until 'set' event ---
    // Example: Create transient config and call _updatePanelConfigSummary(panelElement, null, transientConfig);
    // For now, let's keep it simple: only update the date range text during slide.
}


// Handles 'set' event (final slider position) AND group 'change' event.
// Reads final control states, saves config, reloads panel.
async function _handleConfigChange(panelElement, event = null) {
    const panelIdStr = panelElement.dataset.panelId;
    if (!panelIdStr || panelIdStr.startsWith('temp-')) return;

    const panelIdInt = parseInt(panelIdStr);
    if (isNaN(panelIdInt)) { console.error(`Invalid Panel ID on config change: ${panelIdStr}`); return; }

    console.log(`[Config Change] Panel ${panelIdStr}: Triggered.`);

    // Start with a fresh config object or load existing as base?
    // Let's load existing to preserve other potential config keys.
    let baseConfig = {};
    try { baseConfig = JSON.parse(panelElement.dataset.configuration || '{}'); } catch (e) {}

    let newConfig = { ...baseConfig }; // Copy base config

    // 1. Update Group ID (always read from select)
    const groupSelect = panelElement.querySelector(`#group-select-${panelIdStr}`);
    if (groupSelect) {
        newConfig.group_id = groupSelect.value;
    } else {
        newConfig.group_id = 'all'; // Fallback if select not found
    }

    // 2. Update Date Range (always read from slider if it exists)
    const sliderElement = panelElement.querySelector(`#time-slider-${panelIdStr}`);
    if (sliderElement && sliderElement.noUiSlider) {
        try {
            const valueStrings = sliderElement.noUiSlider.get(); // Get final values
            const startTimestamp = sliderNumberFormatter.from(valueStrings[0]);
            const endTimestamp = sliderNumberFormatter.from(valueStrings[1]);
            if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) throw new Error("Invalid final timestamp values.");

            const startDateStr = timestampToYyyyMmDd(startTimestamp);
            const endDateStr = timestampToYyyyMmDd(endTimestamp);
            if (!startDateStr || !endDateStr) throw new Error("Failed to format final dates.");

            const sliderOptions = sliderElement.noUiSlider.options;
            const tolerance = DAY_IN_MILLISECONDS / 2;
            if (Math.abs(startTimestamp - sliderOptions.range.min) < tolerance && Math.abs(endTimestamp - sliderOptions.range.max) < tolerance) {
                 newConfig.time_period = 'all_time';
                 newConfig.startDate = null;
                 newConfig.endDate = null;
            } else {
                 newConfig.startDate = startDateStr;
                 newConfig.endDate = endDateStr;
                 newConfig.time_period = 'custom';
            }
            console.log(`[Config Change] Panel ${panelIdStr}: Dates set to: ${newConfig.startDate || 'null'} - ${newConfig.endDate || 'null'} (Period: ${newConfig.time_period})`);

        } catch (e) {
            console.error(`[Config Change] Panel ${panelIdStr}: Error processing final slider values: ${e.message}. Preserving existing dates in config.`, e);
            // Keep existing date/period values in newConfig if slider reading fails
        }
    } else {
        // If no slider, ensure time_period matches date presence
        if (!newConfig.startDate && !newConfig.endDate) {
            newConfig.time_period = 'all_time';
        } else if (newConfig.startDate && newConfig.endDate) {
             newConfig.time_period = 'custom';
        }
        console.log(`[Config Change] Panel ${panelIdStr}: No slider found. Config based on group and existing dates.`);
    }

    // 3. Update the panel's dataset BEFORE saving
    panelElement.dataset.configuration = JSON.stringify(newConfig);
    console.log(`[Config Change] Panel ${panelIdStr}: Final config determined:`, JSON.parse(JSON.stringify(newConfig)));

    // 4. Save the final configuration to the server
    try {
        console.log(`[Config Change] Panel ${panelIdStr}: Sending config update (PATCH)...`);
        await updatePanelConfigurationOnServer(panelIdInt, newConfig);
        console.log(`[Config Change] Panel ${panelIdStr}: Config update successful. Reloading panel content (GET)...`);

        // 5. Reload content based on the *saved* configuration
        await loadPanelContent(panelElement, false);

    } catch (error) {
        alert(`Failed to update panel settings: ${error.message}`);
        console.error(`[Config Change] Panel ${panelIdStr}: API error during config save or panel reload:`, error);
        // Revert dataset? Load again? For now, just log.
    }
}

// Wrapper to call _handleConfigChange for specific events
// Used by both slider 'set' and select 'change'
function _configChangeHandlerWrapper(eventOrSliderData) {
    let panelElement = null;
    let eventObject = null; // To know if it was a DOM event

    if (eventOrSliderData instanceof Event) { // Check if it's a real DOM Event (from select 'change')
        panelElement = eventOrSliderData.target.closest('.insight-panel');
        eventObject = eventOrSliderData; // Keep the event object
    } else if (this && this.target) { // Check if 'this' context is noUiSlider API (from slider 'set')
        panelElement = this.target.closest('.insight-panel');
        // Don't pass the slider data array as the 'event' argument to _handleConfigChange
    }

    if (panelElement) {
        _handleConfigChange(panelElement, eventObject); // Pass eventObject (null if from slider)
    } else {
        console.error("Config change handler couldn't find parent panel. Source:", eventOrSliderData);
    }
}

// --- Configuration Initialization ---
function _initializePanelConfigurationControls(panelElement, panelDataForControls) {
    const panelIdStr = String(panelDataForControls.id);
    if (panelIdStr.startsWith('temp-')) return;
    const currentConfig = panelDataForControls.configuration || {};

    // Initialize Group Selector
    const groupSelect = panelElement.querySelector(`#group-select-${panelIdStr}`);
    if (groupSelect) {
        while (groupSelect.options.length > 1) groupSelect.remove(1);
        userGroupsCache.forEach(group => groupSelect.add(new Option(group.name, group.id)));
        groupSelect.value = String(currentConfig.group_id || "all");
        // Use the *wrapper* for the 'change' event listener
        groupSelect.removeEventListener('change', _configChangeHandlerWrapper);
        groupSelect.addEventListener('change', _configChangeHandlerWrapper);
    }

    // Initialize Time Slider
    const sliderElement = panelElement.querySelector(`#time-slider-${panelIdStr}`);
    const sliderDisplayElement = panelElement.querySelector(`#time-slider-display-${panelIdStr}`);
    if (sliderElement && sliderDisplayElement && typeof noUiSlider !== 'undefined' && typeof sliderNumberFormatter !== 'undefined') {
        if (sliderElement.noUiSlider) try { sliderElement.noUiSlider.destroy(); } catch (e) {}

        let minTimestamp, maxTimestamp;
        try { /* ... calculate min/max timestamps ... */
             const todayDateSource = new Date(); const calculatedMaxUtc = Date.UTC(todayDateSource.getUTCFullYear(), todayDateSource.getUTCMonth(), todayDateSource.getUTCDate()); let twoYearsAgoDate = new Date(calculatedMaxUtc); twoYearsAgoDate.setUTCFullYear(twoYearsAgoDate.getUTCFullYear() - 2); let calculatedMinUtc = twoYearsAgoDate.getTime(); if (!Number.isFinite(calculatedMinUtc) || !Number.isFinite(calculatedMaxUtc) || calculatedMinUtc >= calculatedMaxUtc) throw new Error("Invalid range"); minTimestamp = calculatedMinUtc; maxTimestamp = calculatedMaxUtc;
         } catch(e) { /* ... Fallback logic ... */ minTimestamp = new Date(Date.UTC(2022,0,1)).getTime(); maxTimestamp = new Date(Date.UTC(2024,0,1)).getTime(); }

        let initialStart = minTimestamp; let initialEnd = maxTimestamp;
        if (currentConfig.startDate && currentConfig.endDate) { try { /* ... parse and clamp dates ... */ const parsedStartDate = new Date(currentConfig.startDate + 'T00:00:00Z').getTime(); const parsedEndDate = new Date(currentConfig.endDate + 'T00:00:00Z').getTime(); if (Number.isFinite(parsedStartDate) && Number.isFinite(parsedEndDate) && parsedStartDate <= parsedEndDate) { let clampedStart = Math.max(minTimestamp, parsedStartDate); let clampedEnd = Math.min(maxTimestamp, parsedEndDate); if (clampedStart <= clampedEnd) { initialStart = clampedStart; initialEnd = clampedEnd; } } } catch(e){} }
        if (initialStart === initialEnd) { if (initialStart < maxTimestamp) initialEnd = Math.min(initialStart + DAY_IN_MILLISECONDS, maxTimestamp); else if (initialEnd > minTimestamp) initialStart = Math.max(initialEnd - DAY_IN_MILLISECONDS, minTimestamp); }
        if (initialStart > initialEnd) [initialStart, initialEnd] = [initialEnd, initialStart];

        try {
            noUiSlider.create(sliderElement, { /* ... options ... */
                start: [initialStart, initialEnd], connect: true, range: { 'min': minTimestamp, 'max': maxTimestamp }, step: DAY_IN_MILLISECONDS, format: sliderNumberFormatter, behaviour: 'tap-drag',
                pips: { mode:'positions', values:[0,25,50,75,100], density:4, format: { to: v_pip => { try { const d=new Date(Math.round(parseFloat(v_pip)/DAY_IN_MILLISECONDS)*DAY_IN_MILLISECONDS); return d.toLocaleDateString(undefined,{month:'short',year:'2-digit',timeZone:'UTC'}); } catch { return "?"; } } } }
            });

            const updateSliderDisplay = (sliderValues) => { /* ... */ try { const startNum=sliderNumberFormatter.from(sliderValues[0]); const endNum=sliderNumberFormatter.from(sliderValues[1]); if(!Number.isFinite(startNum)||!Number.isFinite(endNum)) throw new Error(); const sD=new Date(startNum); const eD=new Date(endNum); const opts={month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}; sliderDisplayElement.textContent = `${sD.toLocaleDateString(undefined,opts)} - ${eD.toLocaleDateString(undefined,opts)}`; } catch(e){ sliderDisplayElement.textContent="Date Error"; } };

            // Attach listeners:
            // 'update' fires frequently, just update visual display
            sliderElement.noUiSlider.on('update', (values) => updateSliderDisplay(values));
            // 'slide' only updates display text now
            sliderElement.noUiSlider.on('slide', _handleSlideEvent);
            // 'set' triggers the config change handler/wrapper
            sliderElement.noUiSlider.on('set', _configChangeHandlerWrapper); // <- Use the wrapper

            // Initial setup
            const currentSliderValues = sliderElement.noUiSlider.get();
            updateSliderDisplay(currentSliderValues);
            // Update the main summary based on initial config (done later in setupEventListeners)

        } catch(err) { /* ... error handling ... */ }
    } else { /* ... handle missing library/formatter ... */ }

    // Config Toggle Button
    const configToggleBtn = panelElement.querySelector('.panel-config-toggle-btn'); const configArea = panelElement.querySelector('.panel-config-area'); if (configToggleBtn && configArea && !configToggleBtn.getAttribute('listener-attached-init')) { configToggleBtn.addEventListener('click',(e)=>{e.stopPropagation();configArea.classList.toggle('open');const i=configToggleBtn.querySelector('i');if(i)i.className=configArea.classList.contains('open')?'fas fa-chevron-up':'fas fa-cog';}); configToggleBtn.setAttribute('listener-attached-init','true'); }
}

// Load Panel Content - Fetches data based on *saved* config
async function loadPanelContent(panelElement, isForPaletteDragClone = false) {
    const isClone = isForPaletteDragClone || panelElement.dataset.panelId?.startsWith('temp-live-') || panelElement.dataset.panelId?.startsWith('temp-');
    const panelIdStr = panelElement.dataset.panelId;
    const analysisType = panelElement.dataset.analysisType;
    const contentContainer = panelElement.querySelector('.placeholder-chart');

    if (!analysisType || !contentContainer) { /* ... error ... */ return; }
    let panelIdForDataFetch = null; if (!panelIdStr.startsWith('temp-')) { const p=parseInt(panelIdStr); if(!isNaN(p)) panelIdForDataFetch=p; else { /* error */ return; } }

    // --- Chart Cleanup ---
    let chartInstanceToDestroy = null; if (!isClone && activeChartInstances[panelIdStr]) chartInstanceToDestroy = activeChartInstances[panelIdStr]; else if (isClone && chartInDraggedElement) chartInstanceToDestroy = chartInDraggedElement; if (chartInstanceToDestroy) { try { chartInstanceToDestroy.destroy(); } catch (e) {} if (!isClone) delete activeChartInstances[panelIdStr]; else chartInDraggedElement = null; }

    // --- Loading State ---
    const analysisDetails = getAnalysisDetails(analysisType); contentContainer.innerHTML = analysisDetails?.placeholder_html || `<div class='loading-placeholder'><i class='fas fa-spinner fa-spin fa-2x'></i><p>Loading data...</p></div>`; if (isClone) { const s=panelElement.querySelector('.panel-config-summary'); if(s) s.textContent="Default View"; }

    // --- Fetch and Render ---
    try {
        if (typeof Chart === 'undefined') throw new Error("Chart.js missing.");
        // console.log(`[Load Content] Panel ${panelIdStr}: Fetching data (GET)...`);
        const analysisResult = await fetchAnalysisData(analysisType, panelIdForDataFetch);
        // console.log(`[Load Content] Panel ${panelIdStr}: Data received.`);

        // Update summary text AFTER fetch, using backend title or saved config
        if (!isClone) {
             _updatePanelConfigSummary(panelElement, analysisResult?.title);
        }

        // Render Chart or Message
        if (analysisType === 'spending-by-category' && analysisResult?.data) { /* ... Chart rendering logic as before ... */
             if (analysisResult.data.length > 0) {
                 contentContainer.innerHTML = ''; const canvas = document.createElement('canvas'); contentContainer.appendChild(canvas); const ctx = canvas.getContext('2d');
                 const labels = analysisResult.data.map(item => item.category || 'Uncategorized'); const amounts = analysisResult.data.map(item => item.amount); const bgColors = Array.from({ length: labels.length }, (_, i) => `hsl(${(i * 360 / labels.length + 45) % 360}, 65%, 60%)`); const hoverBgColors = bgColors.map(c => c.replace(/, 65%, 60%\)$/, ', 70%, 65%)'));
                 const chartOptions = { responsive: true, maintainAspectRatio: false, animation: { duration: isClone ? 0 : CHART_ANIMATION_DURATION }, plugins: { legend: { display: !isClone, position: 'bottom', labels: { color: '#ddd', padding: 15, boxWidth: 12, usePointStyle: true } }, tooltip: { enabled: !isClone, backgroundColor: 'rgba(20,20,30,0.85)', titleColor: '#eee', bodyColor: '#ddd', callbacks: { label: ctx => `${ctx.label||''}: ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(ctx.parsed)} (${(ctx.parsed/ctx.chart.data.datasets[0].data.reduce((a,b)=>a+b,0)*100).toFixed(1)}%)` } } } };
                 if(isClone) { chartOptions.elements={arc:{borderWidth:1}}; chartOptions.plugins.legend.display=false; chartOptions.plugins.tooltip.enabled=false; }
                 const newChart = new Chart(ctx, { type: 'pie', data: { labels, datasets: [{ label: 'Spending', data: amounts, backgroundColor: bgColors, hoverBackgroundColor: hoverBgColors, borderColor: '#333', borderWidth: 1, hoverOffset: isClone ? 0: 8 }] }, options: chartOptions });
                 if(isClone) chartInDraggedElement = newChart; else if (!panelIdStr.startsWith('temp-')) activeChartInstances[panelIdStr] = newChart;
             } else { contentContainer.innerHTML = `<p style="text-align:center; color:#bbb; padding:15px 5px;">No spending data found for the current filters.</p>`; }
        } else if (analysisType !== 'spending-by-category') { contentContainer.innerHTML = `<p style='text-align:center; color:orange; padding:15px 5px;'>Display not implemented for: ${analysisType}</p>`; }
        else { contentContainer.innerHTML = `<p style="text-align:center; color:#bbb; padding:15px 5px;">No data available or received in an unexpected format.</p>`;}

    } catch (error) { /* ... Error handling ... */
         console.error(`[Load Content] ERROR CAUGHT - PanelID: ${panelIdStr}, Type: ${analysisType}:`, error); contentContainer.innerHTML = `<p style='color:red; text-align:center; padding:15px 5px;'>Error loading data.<br><small>${error.message}</small></p>`; if (!isClone) _updatePanelConfigSummary(panelElement, "Error Loading Data");
    }
}

// --- Grid & Drag/Drop Logic (Unchanged from previous correct version) ---
function checkGridEmpty() { /* ... */ if (!insightsGrid || !emptyMessage) return; const hasContent = insightsGrid.querySelector('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)'); emptyMessage.style.display = hasContent ? 'none' : 'block'; if (!hasContent && emptyMessage.parentElement !== insightsGrid) insightsGrid.appendChild(emptyMessage); }
function calculateGridCellLayout() { /* ... */ if (!insightsGrid || !insightsGridContainer) { gridCellLayout = []; return; } gridCellLayout = []; gridComputedStyle = window.getComputedStyle(insightsGrid); gridColCount = (window.innerWidth <= 768) ? 1 : 2; const panelOwnMargin = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-margin') || '12'); const gridPadding = parseFloat(gridComputedStyle.paddingLeft) || 10; const availableGridWidth = insightsGridContainer.clientWidth - (2 * gridPadding); let panelContentWidth = (availableGridWidth - (gridColCount - 1) * (2 * panelOwnMargin)) / gridColCount; if (gridColCount === 1) { panelContentWidth = availableGridWidth; } panelContentWidth = Math.max(200, panelContentWidth); const panelContentHeight = panelContentWidth * 0.8; const startOffsetX = gridPadding; const startOffsetY = gridPadding; const visiblePanels = Array.from(insightsGrid.children).filter(el => (el.classList.contains('insight-panel') || el.classList.contains('dragging-placeholder')) && !el.classList.contains('dragging-clone')); const estimatedItems = visiblePanels.length + (isDragging && dragType === 'palette' && (!placeholderElement || !placeholderElement.parentElement) ? 1 : 0); const estimatedRows = Math.max(1, Math.ceil(estimatedItems / gridColCount)); for (let r = 0; r < estimatedRows; r++) { for (let c = 0; c < gridColCount; c++) { const slotX = startOffsetX + c * (panelContentWidth + 2 * panelOwnMargin); const slotY = startOffsetY + r * (panelContentHeight + 2 * panelOwnMargin); gridCellLayout.push({ x: slotX, y: slotY, width: panelContentWidth + 2 * panelOwnMargin, height: panelContentHeight + 2 * panelOwnMargin, contentX: slotX + panelOwnMargin, contentY: slotY + panelOwnMargin, contentWidth: panelContentWidth, contentHeight: panelContentHeight }); }} }
function findNearestSlotIndex(pointerX, pointerY) { /* ... */ let closestIndex = -1, minDistSq = Infinity; if (!gridCellLayout.length) calculateGridCellLayout(); if (!gridCellLayout.length) return -1; gridCellLayout.forEach((slot, index) => { const slotCenterX = slot.contentX + slot.contentWidth / 2; const slotCenterY = slot.contentY + slot.contentHeight / 2; const distSq = (pointerX - slotCenterX) ** 2 + (pointerY - slotCenterY) ** 2; if (distSq < minDistSq) { minDistSq = distSq; closestIndex = index; } }); const panelChildren = Array.from(insightsGrid.children).filter(el => (el.classList.contains('insight-panel') || el.classList.contains('dragging-placeholder')) && !el.classList.contains('dragging-clone')); const panelCount = panelChildren.length + (isDragging && dragType === 'palette' && (!placeholderElement || !placeholderElement.parentElement) ? 1 : 0); return Math.min(closestIndex, panelCount); }
function showPalettePreview(targetPaletteItem) { /* ... */ if (!palettePreviewContainer || !targetPaletteItem || isDragging || (palette?.classList.contains('collapsed') && window.innerWidth > 768)) return; const { previewTitle, previewImageUrl, previewDescription } = targetPaletteItem.dataset; if (!previewTitle || !previewDescription) { hidePalettePreview(); return; } clearTimeout(previewHideTimeout); previewHideTimeout = null; palettePreviewContainer.innerHTML = `<div class="preview-container-inner"><h3 class="preview-title">${previewTitle}</h3><div class="preview-content">${previewImageUrl ? `<img src="${previewImageUrl}" alt="${previewTitle} preview" style="max-height:120px;width:auto;display:block;margin:5px auto 8px;border-radius:3px;">` : ''}<p>${previewDescription}</p></div></div>`; palettePreviewContainer.style.display = 'block'; palettePreviewContainer.style.visibility = 'hidden'; palettePreviewContainer.style.opacity = '0'; palettePreviewContainer.style.transform = 'scale(0.95)'; palettePreviewContainer.classList.remove('visible'); requestAnimationFrame(() => { if (!palettePreviewContainer || !targetPaletteItem) return; const prevRect = palettePreviewContainer.getBoundingClientRect(); const itemRect = targetPaletteItem.getBoundingClientRect(); const contRect = insightsView?.getBoundingClientRect() || { left:0,top:0,right:window.innerWidth,bottom:window.innerHeight }; let l = Math.max(contRect.left+VIEWPORT_PADDING, Math.min(itemRect.right+PREVIEW_GAP_TO_RIGHT, contRect.right-prevRect.width-VIEWPORT_PADDING)); let t = Math.max(contRect.top+VIEWPORT_PADDING, Math.min(itemRect.top+(itemRect.height/2)-(prevRect.height/2), contRect.bottom-prevRect.height-VIEWPORT_PADDING)); palettePreviewContainer.style.left = `${Math.round(l-contRect.left)}px`; palettePreviewContainer.style.top = `${Math.round(t-contRect.top)}px`; palettePreviewContainer.style.visibility = 'visible'; palettePreviewContainer.classList.add('visible'); palettePreviewContainer.style.opacity = '1'; palettePreviewContainer.style.transform = 'scale(1)'; }); }
function scheduleHidePalettePreview() { /* ... */ clearTimeout(previewHideTimeout); previewHideTimeout = setTimeout(hidePalettePreview, PREVIEW_HIDE_DELAY + 100); }
function hidePalettePreview() { /* ... */ clearTimeout(previewHideTimeout); previewHideTimeout = null; if (palettePreviewContainer?.classList.contains('visible')) { palettePreviewContainer.classList.remove('visible'); palettePreviewContainer.style.opacity = '0'; palettePreviewContainer.style.transform = 'scale(0.95)'; setTimeout(() => { if (palettePreviewContainer && !palettePreviewContainer.classList.contains('visible')) { palettePreviewContainer.style.display = 'none'; palettePreviewContainer.innerHTML = ''; } }, 300); } else if (palettePreviewContainer) { palettePreviewContainer.style.display = 'none'; palettePreviewContainer.innerHTML = ''; } }
function cancelHidePreview() { /* ... */ clearTimeout(previewHideTimeout); }
function onPointerDown(event) { /* ... */ if (event.target.closest('.panel-action-btn, .add-analysis-btn, .palette-toggle-btn, .panel-config-area, .panel-config-controls, .panel-config-controls *, .noUi-handle, .noUi-pips, .noUi-connects')) return; if (event.button !== 0 || isDragging) return; const panelElement = event.target.closest('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)'); const paletteItem = event.target.closest('.palette-item'); if (panelElement?.dataset.panelId && !panelElement.dataset.panelId.startsWith('temp-')) initiateDrag(event, panelElement, 'grid'); else if (paletteItem && !palette?.classList.contains('collapsed') && paletteItem.dataset.analysisType) initiateDrag(event, paletteItem, 'palette');}
function initiateDrag(event, element, type) { /* ... */ event.preventDefault(); event.stopPropagation(); hidePalettePreview(); isDragging = true; dragType = type; startClientX = event.clientX; startClientY = event.clientY; calculateGridCellLayout(); if (palette) paletteRect = palette.getBoundingClientRect(); if (!insightsGridContainer) { isDragging = false; return; } placeholderElement = document.createElement('div'); placeholderElement.className = 'dragging-placeholder drop-slot-indicator'; if (gridCellLayout.length > 0 && gridCellLayout[0].contentWidth > 0 && gridCellLayout[0].contentHeight > 0) { placeholderElement.style.width = `${gridCellLayout[0].contentWidth}px`; placeholderElement.style.height = `${gridCellLayout[0].contentHeight}px`; } else { placeholderElement.style.width = '250px'; placeholderElement.style.height = '200px'; } let elementRect; if (dragType === 'grid') { originalSourceElementForGridDrag = element; draggedElement = originalSourceElementForGridDrag; elementRect = draggedElement.getBoundingClientRect(); offsetX = startClientX - elementRect.left; offsetY = startClientY - elementRect.top; const gridChildren = Array.from(insightsGrid.children).filter(child => (child.classList.contains('insight-panel') || child.classList.contains('dragging-placeholder')) && !child.classList.contains('dragging-clone')); sourceIndex = gridChildren.indexOf(draggedElement); if (draggedElement.parentElement === insightsGrid && sourceIndex !== -1) { insightsGrid.insertBefore(placeholderElement, draggedElement); draggedElement.remove(); } else { isDragging = false; return; } currentTargetIndex = sourceIndex; } else { originalSourceElementForGridDrag = null; const sourcePaletteItem = element; const { analysisType } = sourcePaletteItem.dataset; if (!analysisType) { isDragging = false; return; } const analysisDetails = getAnalysisDetails(analysisType); const defaultConfig = analysisDetails?.default_config || {}; const tempPanelData = { id: generateUniqueId('temp-live'), analysis_type:analysisType, title: sourcePaletteItem.dataset.title || analysisDetails?.title || 'Analysis', configuration:defaultConfig }; draggedElement = createInsightPanelElement(tempPanelData, true); loadPanelContent(draggedElement, true).catch(err => {}); let cloneWidth = placeholderElement.style.width ? parseFloat(placeholderElement.style.width) : 250; let cloneHeight = placeholderElement.style.height ? parseFloat(placeholderElement.style.height) : 200; offsetX = cloneWidth * 0.5; offsetY = cloneHeight * 0.2; elementRect = {left:startClientX - offsetX, top:startClientY - offsetY, width:cloneWidth, height:cloneHeight}; sourceIndex = -1; currentTargetIndex = -1; } draggedElement.classList.add('dragging-clone'); Object.assign(draggedElement.style, { position:'fixed', zIndex:1000, pointerEvents:'none', width:`${elementRect.width}px`, height:`${elementRect.height}px`, left:`${elementRect.left}px`, top:`${elementRect.top}px`, transition: 'none' }); document.body.appendChild(draggedElement); document.addEventListener('pointermove', onPointerMove); document.addEventListener('pointerup', onPointerUp, {once:true}); document.addEventListener('contextmenu', preventContextMenuDuringDrag, {capture:true}); }
function onPointerMove(event) { /* ... */ if (!isDragging || !draggedElement) return; const currentX = event.clientX, currentY = event.clientY; cancelAnimationFrame(animationFrameId); animationFrameId = requestAnimationFrame(() => { if (!isDragging || !draggedElement) return; draggedElement.style.left = `${currentX - offsetX}px`; draggedElement.style.top = `${currentY - offsetY}px`; gridRect = insightsGridContainer.getBoundingClientRect(); let isOverPalette = false; if (dragType === 'grid' && paletteRect && palette && !palette.classList.contains('collapsed')) { isOverPalette = currentX >= paletteRect.left && currentX <= paletteRect.right && currentY >= paletteRect.top && currentY <= paletteRect.bottom; } if (isOverPalette) { palette.classList.add('drag-over-delete'); if (placeholderElement?.parentElement) placeholderElement.remove(); currentTargetIndex = -2; } else { palette?.classList.remove('drag-over-delete'); const pointerXInGridCont = currentX - gridRect.left; const pointerYInGridCont = currentY - gridRect.top; const isOverGrid = currentX >= gridRect.left && currentX <= gridRect.right && currentY >= gridRect.top && currentY <= gridRect.bottom; let nearestIdx = -1; if (isOverGrid) { const pointerXInGrid = pointerXInGridCont + insightsGridContainer.scrollLeft; const pointerYInGrid = pointerYInGridCont + insightsGridContainer.scrollTop; nearestIdx = findNearestSlotIndex(pointerXInGrid, pointerYInGrid); } if (isOverGrid && nearestIdx !== -1) { if (nearestIdx !== currentTargetIndex || !placeholderElement?.parentElement) { insertElementAtIndex(placeholderElement, nearestIdx); currentTargetIndex = nearestIdx; } } else { if (placeholderElement?.parentElement) placeholderElement.remove(); currentTargetIndex = -1; } } handleGridScroll(currentY, gridRect); }); }
function handleGridScroll(clientY, gridContainerRect) { /* ... */ let scrollDelta = 0; const speed = SCROLL_THRESHOLD * SCROLL_SPEED_MULTIPLIER * 0.75; if (clientY < gridContainerRect.top + SCROLL_THRESHOLD) { scrollDelta = -speed * (1 - (clientY - gridContainerRect.top) / SCROLL_THRESHOLD); } else if (clientY > gridContainerRect.bottom - SCROLL_THRESHOLD) { scrollDelta = speed * (1 - (gridContainerRect.bottom - clientY) / SCROLL_THRESHOLD); } if (scrollDelta !== 0 && insightsGridContainer) insightsGridContainer.scrollTop += scrollDelta; }
async function onPointerUp() { /* ... */ if (!isDragging) return; cancelAnimationFrame(animationFrameId); document.removeEventListener('pointermove', onPointerMove); document.removeEventListener('contextmenu', preventContextMenuDuringDrag, {capture:true}); if (palette) palette.classList.remove('drag-over-delete'); const droppedOnPalette = currentTargetIndex === -2 && dragType === 'grid' && originalSourceElementForGridDrag; const droppedInsideGrid = currentTargetIndex !== -1 && currentTargetIndex !== -2 && placeholderElement?.parentElement === insightsGrid; let finalPanelToFocus = null; if (draggedElement) { draggedElement.remove(); draggedElement.classList.remove('dragging-clone'); ['position', 'left', 'top', 'width', 'height', 'zIndex', 'pointerEvents', 'transform', 'margin', 'transition'].forEach(prop => { if (draggedElement.style[prop]) draggedElement.style[prop] = ''; }); } if (dragType === 'palette' && chartInDraggedElement) try { chartInDraggedElement.destroy(); } catch(e){} chartInDraggedElement = null; try { if (droppedOnPalette) { const panelToRemove = originalSourceElementForGridDrag; const panelIdStr = panelToRemove.dataset.panelId; const panelIdInt = parseInt(panelIdStr); if (activeChartInstances[panelIdStr]) { try { activeChartInstances[panelIdStr].destroy(); } catch(e){} delete activeChartInstances[panelIdStr]; } const sliderEl = panelToRemove.querySelector(`#time-slider-${panelIdStr}`); if (sliderEl?.noUiSlider) try { sliderEl.noUiSlider.destroy(); } catch(e) {} /* No debouncer to remove */ if (placeholderElement?.parentElement) placeholderElement.remove(); if (!isNaN(panelIdInt)) await removePanelFromServer(panelIdInt); } else if (droppedInsideGrid) { if (dragType === 'palette') { const analysisType = draggedElement.dataset.analysisType; const analysisDetails = getAnalysisDetails(analysisType); const initialConfig = JSON.parse(draggedElement.dataset.configuration || '{}') || analysisDetails?.default_config || {}; const newPanelDataFromServer = await addPanelToServer(analysisType, initialConfig); if (!newPanelDataFromServer?.id) throw new Error("Panel creation failed."); const panelDataForCreation = { id: String(newPanelDataFromServer.id), analysis_type: newPanelDataFromServer.analysis_type || analysisType, title: newPanelDataFromServer.title || draggedElement.dataset.staticTitle || analysisDetails?.title || 'Analysis', configuration: newPanelDataFromServer.configuration || initialConfig }; finalPanelToFocus = createInsightPanelElement(panelDataForCreation, false); placeholderElement.replaceWith(finalPanelToFocus); _initializePanelConfigurationControls(finalPanelToFocus, panelDataForCreation); await loadPanelContent(finalPanelToFocus, false); } else if (dragType === 'grid' && originalSourceElementForGridDrag) { finalPanelToFocus = originalSourceElementForGridDrag; placeholderElement.replaceWith(finalPanelToFocus); const chartInstance = activeChartInstances[finalPanelToFocus.dataset.panelId]; if (chartInstance?.resize) setTimeout(() => { try { chartInstance.resize(); } catch(e){} }, 50); } } else { if (dragType === 'grid' && originalSourceElementForGridDrag) { finalPanelToFocus = originalSourceElementForGridDrag; if (placeholderElement?.parentElement) placeholderElement.remove(); insertElementAtIndex(finalPanelToFocus, sourceIndex); const chartInstance = activeChartInstances[finalPanelToFocus.dataset.panelId]; if (chartInstance?.resize) setTimeout(() => { try { chartInstance.resize(); } catch(e){} }, 50); } else if (dragType === 'palette') { if (placeholderElement?.parentElement) placeholderElement.remove(); } } const panelElementsInGrid = Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)')); const persistentPanelIds = panelElementsInGrid .map(p => p.dataset.panelId) .filter(id => id && !String(id).startsWith('temp-')) .map(id => parseInt(id)) .filter(id => !isNaN(id)); if (persistentPanelIds.length > 0 || (droppedOnPalette && panelElementsInGrid.length === 0)) { await updatePanelOrderOnServer(persistentPanelIds); } } catch (apiError) { alert(`Error saving changes: ${apiError.message}`); console.error("[Drop] API or Logic Error:", apiError); if (placeholderElement?.parentElement) placeholderElement.remove(); if (dragType === 'grid' && originalSourceElementForGridDrag && !originalSourceElementForGridDrag.parentElement) { insertElementAtIndex(originalSourceElementForGridDrag, sourceIndex); try { await loadPanelContent(originalSourceElementForGridDrag, false); } catch (loadErr) {} } } finally { /* ... Final Cleanup ... */ if(placeholderElement?.parentElement) placeholderElement.remove(); placeholderElement = null; isDragging = false; draggedElement = null; originalSourceElementForGridDrag = null; sourceIndex = -1; dragType = null; currentTargetIndex = -1; gridRect = null; paletteRect = null; setTimeout(() => { calculateGridCellLayout(); checkGridEmpty(); const currentPanelIds = new Set(Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)')).map(p => p.dataset.panelId)); Object.keys(activeChartInstances).forEach(idStr => { if(!idStr.startsWith('temp-') && !currentPanelIds.has(idStr)) { try{ activeChartInstances[idStr].destroy(); } catch(e){} delete activeChartInstances[idStr]; }}); /* No debouncers to clean */ }, 50); if (finalPanelToFocus?.scrollIntoView) setTimeout(() => { finalPanelToFocus.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 100); } }
function preventContextMenuDuringDrag(event) { /* ... */ if (isDragging) event.preventDefault(); }
function insertElementAtIndex(elementToInsert, index) { /* ... */ if (!insightsGrid) return; const currentGridChildren = Array.from(insightsGrid.children).filter(el => (el.classList.contains('insight-panel') || el.classList.contains('dragging-placeholder')) && !el.classList.contains('dragging-clone')); const actualItems = currentGridChildren.filter(child => child !== elementToInsert); const effectiveIndex = Math.max(0, Math.min(index, actualItems.length)); if (elementToInsert.parentElement === insightsGrid) insightsGrid.removeChild(elementToInsert); if (effectiveIndex < actualItems.length) insightsGrid.insertBefore(elementToInsert, actualItems[effectiveIndex]); else { if (emptyMessage && emptyMessage.parentElement === insightsGrid && insightsGrid.lastChild === emptyMessage) insightsGrid.insertBefore(elementToInsert, emptyMessage); else insightsGrid.appendChild(elementToInsert); } checkGridEmpty(); }
async function handleGridAction(event) { /* ... Close button logic as before, removing debouncer reference */ const panel = event.target.closest('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)'); if (!panel || !panel.dataset.panelId) return; const panelIdStr = panel.dataset.panelId; if (panelIdStr.startsWith('temp-')) return; if (event.target.closest('.panel-close-btn')) { event.stopPropagation(); if (activeChartInstances[panelIdStr]) { try { activeChartInstances[panelIdStr].destroy(); } catch(e){} delete activeChartInstances[panelIdStr]; } const sliderEl = panel.querySelector(`#time-slider-${panelIdStr}`); if (sliderEl?.noUiSlider) try { sliderEl.noUiSlider.destroy(); } catch(e) {} /* No debouncer */ panel.remove(); checkGridEmpty(); calculateGridCellLayout(); const panelIdInt = parseInt(panelIdStr); if (!isNaN(panelIdInt)) { try { await removePanelFromServer(panelIdInt); const panelElementsAfterRemove = Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)')); const panelIdsToOrderAfterRemove = panelElementsAfterRemove .map(p => p.dataset.panelId).filter(id => id && !id.startsWith('temp-')).map(id => parseInt(id)).filter(id => !isNaN(id)); await updatePanelOrderOnServer(panelIdsToOrderAfterRemove); } catch (error) { alert(`Error removing panel: ${error.message}.`); } } else { console.error("Close failed: Invalid ID", panelIdStr); } } else if (event.target.closest('.panel-share-btn')) { event.stopPropagation(); const panelTitleText = panel.querySelector('.panel-dynamic-title')?.textContent || 'this panel'; alert(`Sharing ${panelTitleText} - Not implemented.`); } }
function makePanelDraggable(panelElement) { /* ... */ panelElement.removeEventListener('pointerdown', onPointerDown); panelElement.addEventListener('pointerdown', onPointerDown); }
function handlePaletteToggle(forceState=null) { /* ... */ if (!palette || !paletteToggleBtn || !insightsView) return; hidePalettePreview(); let shouldCollapse = forceState === 'close' || (forceState === null && !palette.classList.contains('collapsed')); palette.classList.toggle('collapsed', shouldCollapse); insightsView.classList.toggle('palette-collapsed', shouldCollapse); updateToggleButtonIcon(); setTimeout(() => { calculateGridCellLayout(); Object.values(activeChartInstances).forEach(chart => { if (chart?.resize) try { chart.resize(); } catch(e){} }); }, parseFloat(getComputedStyle(palette).transitionDuration || '0.3s')*1000 + 50); }
function updateToggleButtonIcon() { /* ... */ if (!palette || !paletteToggleBtn) return; const icon = paletteToggleBtn.querySelector('i'); if (!icon) return; const isMobile = window.innerWidth <= 768; const isCollapsed = palette.classList.contains('collapsed'); icon.className = `fas ${isMobile ? (isCollapsed ? 'fa-chevron-up':'fa-chevron-down') : (isCollapsed ? 'fa-chevron-right':'fa-chevron-left')}`; paletteToggleBtn.setAttribute('aria-label', isCollapsed ? 'Expand Palette' : 'Collapse Palette'); }

// --- Initialization ---
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
        paletteScrollContainer.addEventListener('click', async e => { /* Add button logic */ const addBtn = e.target.closest('.add-analysis-btn'); if (addBtn && !isDragging) { e.stopPropagation(); const item = addBtn.closest('.palette-item'); if (item?.dataset.analysisType) { const { analysisType } = item.dataset; const analysisDetails = getAnalysisDetails(analysisType); const initialConfig = analysisDetails?.default_config || {}; addBtn.disabled=true; addBtn.innerHTML='<i class="fas fa-spinner fa-spin"></i>'; try { const newPanelDataFromServer = await addPanelToServer(analysisType, initialConfig); if (!newPanelDataFromServer?.id) throw new Error("Panel creation failed."); const panelDataForCreation = { id: String(newPanelDataFromServer.id), analysis_type: newPanelDataFromServer.analysis_type || analysisType, title: newPanelDataFromServer.title || item.dataset.title || analysisDetails?.title || 'Analysis', configuration: newPanelDataFromServer.configuration || initialConfig }; const newEl = createInsightPanelElement(panelDataForCreation, false); const targetIndex = insightsGrid.children.length - (emptyMessage?.parentElement === insightsGrid ? 1 : 0); insertElementAtIndex(newEl, targetIndex ); _initializePanelConfigurationControls(newEl, panelDataForCreation); await loadPanelContent(newEl, false); checkGridEmpty(); calculateGridCellLayout(); const panelElementsAfterAdd = Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)')); const panelIdsToOrderAfterAdd = panelElementsAfterAdd.map(p => p.dataset.panelId).filter(id => id && !id.startsWith('temp-')).map(id => parseInt(id)).filter(id => !isNaN(id)); if (panelIdsToOrderAfterAdd.length > 0) await updatePanelOrderOnServer(panelIdsToOrderAfterAdd); setTimeout(() => newEl?.scrollIntoView({behavior:'smooth',block:'nearest'}), 150); } catch (err) { alert(`Failed to add panel: ${err.message}`); } finally { addBtn.disabled=false; addBtn.innerHTML='+'; } } } });
    }
    palettePreviewContainer?.addEventListener('mouseleave', e => { if (!e.relatedTarget || !e.relatedTarget.closest('.palette-item')) scheduleHidePalettePreview(); });
    palettePreviewContainer?.addEventListener('mouseenter', cancelHidePreview);

    if (insightsGrid) {
        insightsGrid.addEventListener('click', handleGridAction); // For close/share etc.

        console.log("[Init] Initializing existing panels...");
        const existingPanels = insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)');
        const initPromises = [];
        for (const panel of existingPanels) {
            const panelIdStr = panel.dataset.panelId; const analysisType = panel.dataset.analysisType; const analysisDetails = getAnalysisDetails(analysisType);
            if (!panelIdStr || !analysisType || panelIdStr.startsWith('temp-') || isNaN(parseInt(panelIdStr))) { continue; }
            makePanelDraggable(panel);
            const panelStaticTitleText = panel.dataset.staticTitle || analysisDetails?.title || 'Analysis';
            const titleEl = panel.querySelector('.panel-dynamic-title'); if (titleEl) titleEl.textContent = panelStaticTitleText;
            const placeholderChartDiv = panel.querySelector('.placeholder-chart'); if (placeholderChartDiv) placeholderChartDiv.innerHTML = analysisDetails?.placeholder_html || `<div class='loading-placeholder'><i class='fas fa-spinner fa-spin fa-2x'></i><p>Loading data...</p></div>`;
            let configObject; try { configObject = JSON.parse(panel.dataset.configuration || '{}'); if(typeof configObject !== 'object' || configObject === null) throw new Error();} catch (e) { configObject = analysisDetails?.default_config || {}; panel.dataset.configuration = JSON.stringify(configObject); }
            const panelDataForInit = { id: panelIdStr, analysis_type: analysisType, title: panelStaticTitleText, configuration: configObject };

            _initializePanelConfigurationControls(panel, panelDataForInit);
            initPromises.push(loadPanelContent(panel, false)); // Load initial content
        }
        try {
            await Promise.all(initPromises);
            console.log("[Init] Existing panels initialization complete.");
            // Update summaries based on final loaded state (after potential backend title override)
             existingPanels.forEach(panel => {
                 if (!panel.dataset.panelId?.startsWith('temp-')) {
                     _updatePanelConfigSummary(panel); // Call without backend title to use dataset config
                 }
             });
        } catch(initError) {
             console.error("[Init] Error during initial panel loading:", initError);
        }
    }
    window.addEventListener('resize', debounce(() => { hidePalettePreview(); calculateGridCellLayout(); updateToggleButtonIcon(); Object.values(activeChartInstances).forEach(chart => { if (chart?.resize) try { chart.resize(); } catch(e){} }); }, 250));
    insightsGridContainer?.addEventListener('scroll', debounce(() => { if (!isDragging) hidePalettePreview(); }, 100));
}

export async function initInsightsManager() {
    console.log("%c[Insights] initInsightsManager - START (V_REVERT_SIMPLE_UPDATE)", "background-color: yellow; color: black; font-weight:bold;");
    insightsView = document.getElementById('insights-view'); insightsGridContainer = document.getElementById('insights-grid-container'); insightsGrid = document.getElementById('insights-grid'); palette = document.getElementById('analysis-palette'); paletteHeader = document.getElementById('palette-header'); paletteToggleBtn = document.getElementById('palette-toggle-btn'); paletteScrollContainer = document.getElementById('palette-scroll-container'); emptyMessage = document.getElementById('insights-empty-message'); palettePreviewContainer = document.getElementById('palette-preview-container');

    if (typeof wNumb === 'function') { try { sliderNumberFormatter = wNumb({ decimals: 0 }); console.info("[Init] Using wNumb."); } catch (e) { console.error("[Init] wNumb error:", e); sliderNumberFormatter = { to:v=>String(Math.round(parseFloat(v))), from:v=>parseFloat(v) }; } }
    else { console.warn("[Init] wNumb missing."); sliderNumberFormatter = { to:v=>String(Math.round(parseFloat(v))), from:v=>parseFloat(v) }; }

    let criticalElementsFound = true; const elementsToCheck = { insightsView, insightsGridContainer, insightsGrid, palette, paletteHeader, paletteToggleBtn, paletteScrollContainer, emptyMessage, palettePreviewContainer }; for (const [name, el] of Object.entries(elementsToCheck)) { if (!el) { console.error(`[Init] Missing element: ${name}`); criticalElementsFound = false; } } if (!criticalElementsFound) { alert("Insights UI init error."); return; }
    if (typeof Chart === 'undefined') console.error("[Init] Chart.js missing."); if (typeof noUiSlider === 'undefined') console.warn("[Init] noUiSlider missing.");

    isDragging = false; if(draggedElement) { draggedElement.remove(); draggedElement = null; } document.querySelectorAll('.dragging-placeholder.drop-slot-indicator').forEach(el => el.remove()); document.removeEventListener('pointermove', onPointerMove); document.removeEventListener('pointerup', onPointerUp); document.removeEventListener('contextmenu', preventContextMenuDuringDrag, {capture:true});

    try {
        await fetchUserGroups();
        calculateGridCellLayout();
        await setupEventListeners(); // Setup listeners & init existing panels
        checkGridEmpty();
        hidePalettePreview();
        if (palette) insightsView.classList.toggle('palette-collapsed', palette.classList.contains('collapsed'));
        updateToggleButtonIcon();
        console.log("%c[Insights] initInsightsManager - Initialized Successfully (V_REVERT_SIMPLE_UPDATE)", "background-color: lightgreen; color: black; font-weight:bold;");
    } catch (error) {
        console.error("%c[Insights] initInsightsManager - FAILED:", "background-color: red; color: white; font-weight:bold;", error);
        alert("Insights initialization failed.");
    }
}

// Analysis Type Definitions
function getAnalysisDetails(analysisTypeId) { /* ... */ const localAvailableAnalyses = { "spending-by-category": { id: "spending-by-category", title: "💸 Spending by Category", description: "Total attended event costs grouped by node/category.", preview_title: "Spending by Category", preview_image_filename: null, preview_description: "Visualizes where your event budget went, categorized by the event's assigned node. Filters apply.", placeholder_html: `<div class='loading-placeholder' style='text-align: center; padding: 20px; color: #aaa;'><i class='fas fa-chart-pie fa-2x'></i><p style='margin-top: 10px;'>Loading spending data...</p></div>`, default_config: { time_period: "all_time", group_id: "all", startDate: null, endDate: null } } }; return localAvailableAnalyses[analysisTypeId]; }
// --- END OF FILE insightsManager.js ---