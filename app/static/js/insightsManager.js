// --- START OF FILE insightsManager.js ---

import { openSharePanelModal } from './sharePanelModalManager.js';

// DOM Elements & State
let insightsView = null, insightsGridContainer = null, insightsGrid = null, palette = null, paletteHeader = null, paletteToggleBtn = null, paletteScrollContainer = null, emptyMessage = null, palettePreviewContainer = null;
let isDragging = false, draggedElement = null, placeholderElement = null, originalSourceElementForGridDrag = null;
let sourceIndex = -1, currentTargetIndex = -1, dragType = null, startClientX = 0, startClientY = 0, offsetX = 0, offsetY = 0;
let gridRect = null, paletteRect = null, animationFrameId = null;
let activeChartInstances = {}; // Keyed by panelInstanceKey
let userGroupsCache = []; // Current logged-in user's groups
let gridCellLayout = [], gridComputedStyle = null, gridColCount = 2;
let previewHideTimeout = null;
const PREVIEW_HIDE_DELAY = 150, PREVIEW_GAP_TO_RIGHT = 12, VIEWPORT_PADDING = 15;
const SCROLL_THRESHOLD = 40, SCROLL_SPEED_MULTIPLIER = 0.15, API_BASE = '/api', CHART_ANIMATION_DURATION = 400, DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
let chartInDraggedElement = null;

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
async function updatePanelConfigurationOnServer(panelIdInt, newConfig) {
    // console.log(`[Insights PATCH] Panel ${panelIdInt}: Sending config:`, JSON.parse(JSON.stringify(newConfig))); // Less verbose
    return await fetchApi(`${API_BASE}/insights/panels/${panelIdInt}`, { method: 'PATCH', body: { configuration: newConfig } });
}

async function fetchAnalysisData(analysisType, idForApi, isSharedApiCall, recipientChosenConfig = null) {
    let url = `${API_BASE}/analysis/data/${analysisType}`;
    const queryParams = new URLSearchParams();

    if (isSharedApiCall) {
        if (idForApi && !isNaN(parseInt(idForApi))) {
            queryParams.append('shared_instance_id', idForApi);
        } else {
            console.error("fetchAnalysisData: isSharedApiCall true, but idForApi is invalid:", idForApi);
            return Promise.reject("Invalid shared_instance_id for API call");
        }
        if (recipientChosenConfig) { 
            if (recipientChosenConfig.startDate) queryParams.append('startDate', recipientChosenConfig.startDate);
            if (recipientChosenConfig.endDate) queryParams.append('endDate', recipientChosenConfig.endDate);
        }
    } else {
         const panelIdNum = parseInt(idForApi);
         if (panelIdNum && !isNaN(panelIdNum)) {
            queryParams.append('panel_id', panelIdNum);
         } else if (idForApi && !String(idForApi).startsWith('temp-')) {
            console.warn(`fetchAnalysisData called for non-shared panel with non-numeric, non-temp id: ${idForApi}`);
         }
    }

    const queryString = queryParams.toString();
    if (queryString) {
        url += `?${queryString}`;
    }
    // console.log(`[Insights GET] fetchAnalysisData URL: ${url}`); // Less verbose
    return await fetchApi(url);
}
async function fetchUserGroups() { if (userGroupsCache.length > 0) return userGroupsCache; try { const groups = await fetchApi('/api/groups'); userGroupsCache = groups || []; return userGroupsCache; } catch (error) { console.error("Failed to fetch user groups:", error); return []; } }


// --- Panel Creation & Content Loading ---
function getPanelInstanceKey(panelData) {
    if (panelData.is_shared && panelData.shared_instance_id) {
        return `shared-${panelData.shared_instance_id}`;
    }
    if (String(panelData.id).startsWith('temp-')) return String(panelData.id);
    return String(panelData.id); 
}

function createInsightPanelElement(panelData, isForPaletteDragClone = false) {
    const panelInstanceKey = getPanelInstanceKey(panelData);
    const originalPanelDbId = String(panelData.id); 

    const panel = document.createElement('div');
    panel.className = 'insight-panel glassy';
    panel.dataset.panelId = originalPanelDbId; 
    panel.dataset.panelInstanceKey = panelInstanceKey; 
    panel.dataset.analysisType = panelData.analysis_type;

    const analysisDetails = getAnalysisDetails(panelData.analysis_type);
    const panelMainTitleText = panelData.title || analysisDetails?.title || 'Analysis';
    panel.dataset.staticTitle = panelMainTitleText;

    if (panelData.is_shared) {
        panel.dataset.isShared = "true";
        panel.dataset.accessMode = panelData.access_mode;
        panel.dataset.sharerUsername = panelData.sharer_username;
        panel.dataset.sharedInstanceId = String(panelData.shared_instance_id); 
        
        const configForDisplay = panelData.current_config_for_display || {};
        panel.dataset.sharedConfigGroupId = configForDisplay.group_id || 'all';
        panel.dataset.sharedConfigStartDate = configForDisplay.startDate || '';
        panel.dataset.sharedConfigEndDate = configForDisplay.endDate || '';   

        panel.dataset.recipientChosenConfig = JSON.stringify({
            group_id: configForDisplay.group_id || 'all', 
            startDate: null, 
            endDate: null,
            time_period: 'all_time'
        });
        panel.dataset.configuration = JSON.stringify(panelData.configuration || analysisDetails?.default_config || {});
    } else {
        panel.dataset.configuration = JSON.stringify(panelData.configuration || analysisDetails?.default_config || {});
    }

    const placeholderHtml = analysisDetails?.placeholder_html || `<div class='loading-placeholder'><i class='fas fa-spinner fa-spin fa-2x'></i><p>Loading data...</p></div>`;
    const showControls = !isForPaletteDragClone;
    const idSuffix = panelInstanceKey.replace(/[^\w-]/g, '_');

    const controlsHtml = showControls ? `
        <button class="panel-action-btn panel-config-toggle-btn" aria-label="Toggle Configuration" title="Configure Panel"><i class="fas fa-cog"></i></button>
        <button class="panel-action-btn panel-close-btn" aria-label="Remove Panel" title="Remove Panel"><i class="fas fa-times"></i></button>
        <div class="panel-config-area">
            <div class="panel-config-controls">
                <div class="config-group-selector">
                    <label for="group-select-${idSuffix}">Filter by Group:</label>
                    <select id="group-select-${idSuffix}" name="group_id">
                        <option value="all">All My Groups</option>
                    </select>
                </div>
                <div class="config-time-selector">
                    <label for="time-slider-${idSuffix}">Filter by Time Period:</label>
                    <div id="time-slider-${idSuffix}" class="time-range-slider-placeholder"></div>
                    <div id="time-slider-display-${idSuffix}" class="time-slider-display">Loading range...</div>
                </div>
            </div>
        </div>` : '';
    
    const shareButtonHtml = showControls && !panelData.is_shared ? 
        `<button class="panel-action-btn panel-share-btn" aria-label="Share Panel" title="Share Panel"><i class="fas fa-share-alt"></i></button>` : '';
    
    let configSummaryText = "Loading filters...";
    if (isForPaletteDragClone) configSummaryText = "Default View";
    else if (panelInstanceKey.startsWith('temp-')) configSummaryText = 'Drop to add panel';
    else if (panelData.is_shared) configSummaryText = `${panelData.access_mode === 'fixed' ? 'Fixed View' : 'Dynamic View'}`;


    panel.innerHTML = `
        ${controlsHtml}
        <div class="panel-main-content-wrapper">
            <h3 class="panel-dynamic-title">${panelMainTitleText}</h3>
            <div class="panel-config-summary">${configSummaryText}</div>
            <div class="panel-content"><div class="placeholder-chart">${placeholderHtml}</div></div>
        </div>
        ${shareButtonHtml}`;

    if (showControls) {
        makePanelDraggable(panel); 
        if (shareButtonHtml) { 
            const shareBtn = panel.querySelector('.panel-share-btn');
            if (shareBtn) {
                const shareModalOpener = (e) => {
                    e.stopPropagation();
                    openSharePanelModal(panel);
                };
                shareBtn.addEventListener('click', shareModalOpener);
                shareBtn._clickHandler = shareModalOpener; 
            }
        }
    }
    return panel;
}

function _updatePanelConfigSummary(panelElement, backendGeneratedTitle = null) {
    if (!panelElement) return;
    const summaryElement = panelElement.querySelector('.panel-config-summary');
    const titleElement = panelElement.querySelector('.panel-dynamic-title');
    if (!summaryElement || !titleElement) return;
    
    const panelInstanceKey = panelElement.dataset.panelInstanceKey;
    const isShared = panelElement.dataset.isShared === 'true';
    const accessMode = panelElement.dataset.accessMode;
    const staticTitle = panelElement.dataset.staticTitle || "Analysis";
    let sharerPrefix = "";
    if (isShared && panelElement.dataset.sharerUsername) {
        sharerPrefix = `Shared by ${panelElement.dataset.sharerUsername} - `;
    }
    titleElement.textContent = sharerPrefix + staticTitle; 

    if (backendGeneratedTitle) {
        let dynamicPartOfTitle = backendGeneratedTitle; 
        if (staticTitle && dynamicPartOfTitle.toLowerCase().startsWith(staticTitle.toLowerCase())) {
            dynamicPartOfTitle = dynamicPartOfTitle.substring(staticTitle.length).trim();
            if (dynamicPartOfTitle.startsWith("-") || dynamicPartOfTitle.startsWith("–") || dynamicPartOfTitle.startsWith("—")) {
                 dynamicPartOfTitle = dynamicPartOfTitle.substring(1).trim();
            }
        }
        summaryElement.textContent = dynamicPartOfTitle || (isShared ? (accessMode === 'fixed' ? "Fixed Filters" : "Dynamic Filters") : "Current filters");
        if (dynamicPartOfTitle && dynamicPartOfTitle.toLowerCase() !== "no data" && dynamicPartOfTitle.toLowerCase() !== "current filters") {
            titleElement.textContent = sharerPrefix + backendGeneratedTitle; 
        }
        return;
    }

    let configSource = {};
    if (isShared) {
        if (accessMode === 'fixed') {
            configSource.group_id = panelElement.dataset.sharedConfigGroupId;
            configSource.startDate = panelElement.dataset.sharedConfigStartDate || null; 
            configSource.endDate = panelElement.dataset.sharedConfigEndDate || null; 
        } else { 
            try { configSource = JSON.parse(panelElement.dataset.recipientChosenConfig || '{}'); } catch(e) {}
        }
    } else { 
        try { configSource = JSON.parse(panelElement.dataset.configuration || '{}'); } catch (e) { summaryElement.textContent = "Error loading filters"; return; }
    }
    
    let groupDisplay = "All Groups";
    if (configSource.group_id && String(configSource.group_id) !== "all") {
        groupDisplay = isShared ? `Group ID: ${configSource.group_id}` : 
                       (userGroupsCache.find(g => String(g.id) === String(configSource.group_id))?.name || `Group ID: ${configSource.group_id}`);
    } else if (isShared) {
        groupDisplay = "All Sharer's Groups";
    }

    let dateRangeDisplay = "All Time";
    if (configSource.startDate && configSource.endDate) {
        try {
            const startDate = new Date(configSource.startDate + 'T00:00:00Z');
            const endDate = new Date(configSource.endDate + 'T00:00:00Z');
            const options = { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' };
            if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
                let isAllTime = false;
                if (!isShared) { 
                    const idSuffix = panelInstanceKey.replace(/[^\w-]/g, '_');
                    const sliderElement = panelElement.querySelector(`#time-slider-${idSuffix}`);
                    if (sliderElement?.noUiSlider?.options?.range) {
                         const sliderMinTimestamp = sliderElement.noUiSlider.options.range.min;
                         const sliderMaxTimestamp = sliderElement.noUiSlider.options.range.max;
                         const tolerance = DAY_IN_MILLISECONDS / 2;
                         isAllTime = Math.abs(startDate.getTime() - sliderMinTimestamp) < tolerance && Math.abs(endDate.getTime() - sliderMaxTimestamp) < tolerance;
                    }
                }
                dateRangeDisplay = isAllTime ? "All Time" : `${startDate.toLocaleDateString(undefined, options)} - ${endDate.toLocaleDateString(undefined, options)}`;
            } else { dateRangeDisplay = "Invalid Dates"; }
        } catch (e) { dateRangeDisplay = "Date Error"; }
    }
    summaryElement.textContent = `${groupDisplay} | ${dateRangeDisplay}`;
}


// --- Slider Handling ---
let sliderNumberFormatter; 

function _handleSlideEvent(values, handle, unencoded, tap, positions, sliderInstance) {
    const panelElement = sliderInstance.target.closest('.insight-panel');
    if (!panelElement) return;
    
    const panelInstanceKey = panelElement.dataset.panelInstanceKey;
    const idSuffix = panelInstanceKey.replace(/[^\w-]/g, '_');
    const sliderDisplayElement = panelElement.querySelector(`#time-slider-display-${idSuffix}`);

    if (sliderDisplayElement) {
        try {
            const startTimestamp = sliderNumberFormatter.from(values[0]);
            const endTimestamp = sliderNumberFormatter.from(values[1]);
            if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) throw new Error("Invalid numeric values");
            const sD = new Date(startTimestamp); const eD = new Date(endTimestamp);
            const opts = {month:'short', day:'numeric', year:'numeric', timeZone:'UTC'};
            sliderDisplayElement.textContent = `${sD.toLocaleDateString(undefined,opts)} - ${eD.toLocaleDateString(undefined,opts)}`;
        } catch (e) {
            sliderDisplayElement.textContent = "Date Error";
        }
    }
}

async function _handleConfigChange(panelElement, event = null) {
    const panelInstanceKey = panelElement.dataset.panelInstanceKey;
    if (!panelInstanceKey || panelInstanceKey.startsWith('temp-')) return;

    const isShared = panelElement.dataset.isShared === 'true';
    const accessMode = panelElement.dataset.accessMode;

    let currentConfig = {}; 
    if (isShared) {
        if (accessMode === 'dynamic') {
            try { currentConfig = JSON.parse(panelElement.dataset.recipientChosenConfig || '{}'); } catch(e) {}
            currentConfig.group_id = panelElement.dataset.sharedConfigGroupId || 'all';
        } else { 
            currentConfig.group_id = panelElement.dataset.sharedConfigGroupId;
            currentConfig.startDate = panelElement.dataset.sharedConfigStartDate || null;
            currentConfig.endDate = panelElement.dataset.sharedConfigEndDate || null;
            currentConfig.time_period = (currentConfig.startDate && currentConfig.endDate) ? 'custom' : 'all_time';
        }
    } else { 
        try { currentConfig = JSON.parse(panelElement.dataset.configuration || '{}'); } catch (e) {}
    }
    
    const idSuffix = panelInstanceKey.replace(/[^\w-]/g, '_');

    const groupSelect = panelElement.querySelector(`#group-select-${idSuffix}`);
    if (groupSelect && !groupSelect.disabled && !isShared) { 
        currentConfig.group_id = groupSelect.value;
    }

    const sliderElement = panelElement.querySelector(`#time-slider-${idSuffix}`);
    if (sliderElement && sliderElement.noUiSlider && !sliderElement.hasAttribute('disabled')) {
        if (!isShared || (isShared && accessMode === 'dynamic')) {
            try {
                const valueStrings = sliderElement.noUiSlider.get();
                const startTimestamp = sliderNumberFormatter.from(valueStrings[0]);
                const endTimestamp = sliderNumberFormatter.from(valueStrings[1]);
                if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) throw new Error("Invalid final timestamp values.");
                const startDateStr = timestampToYyyyMmDd(startTimestamp);
                const endDateStr = timestampToYyyyMmDd(endTimestamp);
                if (!startDateStr || !endDateStr) throw new Error("Failed to format final dates.");
                const sliderOptions = sliderElement.noUiSlider.options;
                const tolerance = DAY_IN_MILLISECONDS / 2;
                if (Math.abs(startTimestamp - sliderOptions.range.min) < tolerance && Math.abs(endTimestamp - sliderOptions.range.max) < tolerance) {
                     currentConfig.time_period = 'all_time'; currentConfig.startDate = null; currentConfig.endDate = null;
                } else {
                     currentConfig.startDate = startDateStr; currentConfig.endDate = endDateStr; currentConfig.time_period = 'custom';
                }
            } catch (e) { console.error(`[Config Change] Panel ${panelInstanceKey}: Error processing slider: ${e.message}.`); }
        }
    }
    
    if (!isShared) { 
        panelElement.dataset.configuration = JSON.stringify(currentConfig);
        try {
            const panelDbId = parseInt(panelElement.dataset.panelId); 
            if (isNaN(panelDbId)) throw new Error("Invalid original Panel ID for PATCH");
            await updatePanelConfigurationOnServer(panelDbId, currentConfig);
            await loadPanelContent(panelElement, false); 
        } catch (error) { alert(`Failed to update panel settings: ${error.message}`); console.error(`[Config Change] Panel ${panelInstanceKey}: API error:`, error); }
    } else { 
        if (accessMode === 'dynamic') { 
            panelElement.dataset.recipientChosenConfig = JSON.stringify(currentConfig);
            await loadPanelContent(panelElement, false, currentConfig); 
        } else { 
            await loadPanelContent(panelElement, false); 
        }
    }
}

function _configChangeHandlerWrapper(eventOrSliderData) {
    let panelElement = null;
    let eventObject = null; 

    if (eventOrSliderData instanceof Event) { 
        panelElement = eventOrSliderData.target.closest('.insight-panel');
        eventObject = eventOrSliderData; 
    } else if (this && this.target) { 
        panelElement = this.target.closest('.insight-panel');
    }

    if (panelElement) {
        _handleConfigChange(panelElement, eventObject); 
    } else {
        console.error("Config change handler couldn't find parent panel. Source:", eventOrSliderData);
    }
}

function _initializePanelConfigurationControls(panelElement, panelDataForControls) {
    const panelInstanceKey = panelElement.dataset.panelInstanceKey;
    if (panelInstanceKey.startsWith('temp-')) return;

    const idSuffix = panelInstanceKey.replace(/[^\w-]/g, '_');
    const isShared = panelDataForControls.is_shared;
    const accessMode = panelDataForControls.access_mode; 
    
    let configForSetup = {};
    if (isShared) {
        if (accessMode === 'fixed') {
            configForSetup.group_id = panelElement.dataset.sharedConfigGroupId;
            configForSetup.startDate = panelElement.dataset.sharedConfigStartDate || null;
            configForSetup.endDate = panelElement.dataset.sharedConfigEndDate || null;
        } else { 
            try { configForSetup = JSON.parse(panelElement.dataset.recipientChosenConfig || '{}'); } catch(e) {}
            configForSetup.group_id = panelElement.dataset.sharedConfigGroupId || configForSetup.group_id || 'all';
        }
    } else { 
        configForSetup = panelDataForControls.configuration || {};
    }

    const groupSelect = panelElement.querySelector(`#group-select-${idSuffix}`);
    if (groupSelect) {
        const defaultOption = groupSelect.options[0]; 
        while (groupSelect.options.length > 1) groupSelect.remove(1); 
        
        if (!isShared) { 
            defaultOption.textContent = "All My Groups";
            userGroupsCache.forEach(group => groupSelect.add(new Option(group.name, group.id)));
            groupSelect.value = String(configForSetup.group_id || "all");
            groupSelect.disabled = false;
        } else { 
            const sharerName = panelElement.dataset.sharerUsername || "Sharer";
            const sharedGroupId = panelElement.dataset.sharedConfigGroupId;

            if (sharedGroupId && sharedGroupId !== 'all') {
                defaultOption.value = sharedGroupId;
                const matchingUserGroup = userGroupsCache.find(g => String(g.id) === String(sharedGroupId));
                defaultOption.textContent = matchingUserGroup ? `${matchingUserGroup.name} (from ${sharerName})` : `Group ID ${sharedGroupId} (from ${sharerName})`;
                groupSelect.value = sharedGroupId;
            } else { 
                defaultOption.value = "all";
                defaultOption.textContent = `All Groups (from ${sharerName})`;
                groupSelect.value = "all";
            }
            groupSelect.disabled = true; 
        }
        groupSelect.removeEventListener('change', _configChangeHandlerWrapper);
        groupSelect.addEventListener('change', _configChangeHandlerWrapper);
    }

    const sliderElement = panelElement.querySelector(`#time-slider-${idSuffix}`);
    const sliderDisplayElement = panelElement.querySelector(`#time-slider-display-${idSuffix}`);
    if (sliderElement && sliderDisplayElement && typeof noUiSlider !== 'undefined' && typeof sliderNumberFormatter !== 'undefined') {
        if (sliderElement.noUiSlider) try { sliderElement.noUiSlider.destroy(); } catch (e) {}

        let minTimestamp, maxTimestamp; 
        try { const today = new Date(); const maxUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()); let twoYrsAgo = new Date(maxUtc); twoYrsAgo.setUTCFullYear(twoYrsAgo.getUTCFullYear()-2); minTimestamp = twoYrsAgo.getTime(); maxTimestamp = maxUtc; } catch(e){ minTimestamp=(new Date(Date.UTC(2022,0,1))).getTime(); maxTimestamp=(new Date(Date.UTC(2024,0,1))).getTime(); }

        let initialStart = minTimestamp; let initialEnd = maxTimestamp;
        if (configForSetup.startDate && configForSetup.endDate) { 
            try { const psd = new Date(configForSetup.startDate + 'T00:00:00Z').getTime(); const ped = new Date(configForSetup.endDate + 'T00:00:00Z').getTime(); if(Number.isFinite(psd) && Number.isFinite(ped) && psd <= ped){ initialStart = Math.max(minTimestamp, psd); initialEnd = Math.min(maxTimestamp, ped); }} catch(e){}
        }
        if(initialStart===initialEnd){ if(initialStart<maxTimestamp)initialEnd=Math.min(initialStart+DAY_IN_MILLISECONDS,maxTimestamp); else if(initialEnd>minTimestamp)initialStart=Math.max(initialEnd-DAY_IN_MILLISECONDS,minTimestamp); }
        if(initialStart>initialEnd) [initialStart, initialEnd] = [initialEnd, initialStart];

        try {
            noUiSlider.create(sliderElement, { 
                start: [initialStart, initialEnd], connect: true, range: { 'min': minTimestamp, 'max': maxTimestamp }, step: DAY_IN_MILLISECONDS, format: sliderNumberFormatter, behaviour: 'tap-drag',
                pips: { mode:'positions', values:[0,25,50,75,100], density:4, format: { to: v_pip => { try { const d=new Date(Math.round(parseFloat(v_pip)/DAY_IN_MILLISECONDS)*DAY_IN_MILLISECONDS); return d.toLocaleDateString(undefined,{month:'short',year:'2-digit',timeZone:'UTC'}); } catch { return "?"; } } } }
            });
            const updateSliderDisplay = (values) => { try{ const s=sliderNumberFormatter.from(values[0]), e=sliderNumberFormatter.from(values[1]); if(!Number.isFinite(s)||!Number.isFinite(e))throw Error(); const sD=new Date(s),eD=new Date(e); sliderDisplayElement.textContent=`${sD.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})} - ${eD.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})}`; }catch(err){sliderDisplayElement.textContent="Date Error";} };
            sliderElement.noUiSlider.on('update', updateSliderDisplay);
            sliderElement.noUiSlider.on('slide', _handleSlideEvent);
            sliderElement.noUiSlider.on('set', _configChangeHandlerWrapper);
            updateSliderDisplay(sliderElement.noUiSlider.get());
            
            if (isShared && accessMode === 'fixed') {
                sliderElement.setAttribute('disabled', true);
            } else {
                sliderElement.removeAttribute('disabled');
            }
        } catch(err) { console.error(`Error initializing noUiSlider for ${idSuffix}:`, err); if(sliderDisplayElement) sliderDisplayElement.textContent = "Slider Error."; }
    }

    const configToggleBtn = panelElement.querySelector('.panel-config-toggle-btn'); const configArea = panelElement.querySelector('.panel-config-area'); if (configToggleBtn && configArea && !configToggleBtn.getAttribute('listener-attached-init')) { configToggleBtn.addEventListener('click',(e)=>{e.stopPropagation();configArea.classList.toggle('open');const i=configToggleBtn.querySelector('i');if(i)i.className=configArea.classList.contains('open')?'fas fa-chevron-up':'fas fa-cog';}); configToggleBtn.setAttribute('listener-attached-init','true'); }
}

async function loadPanelContent(panelElement, isForPaletteDragClone = false, recipientChosenConfig = null) {
    const isClone = isForPaletteDragClone || panelElement.dataset.panelInstanceKey?.startsWith('temp-live-') || panelElement.dataset.panelInstanceKey?.startsWith('temp-');
    const panelInstanceKey = panelElement.dataset.panelInstanceKey;
    const analysisType = panelElement.dataset.analysisType;
    const contentContainer = panelElement.querySelector('.placeholder-chart');

    if (!analysisType || !contentContainer) { console.error(`Panel ${panelInstanceKey}: Missing analysisType or contentContainer.`); return; }
    
    let idForApiCall; 
    let isSharedApiCall = false;

    if (panelElement.dataset.isShared === 'true') {
        idForApiCall = panelElement.dataset.sharedInstanceId; 
        isSharedApiCall = true;
        if (!idForApiCall) { console.error(`Shared panel ${panelInstanceKey} missing shared_instance_id dataset.`); return; }
    } else { 
        idForApiCall = panelElement.dataset.panelId; 
        if (!idForApiCall || idForApiCall.startsWith('temp-')) { 
            idForApiCall = null; 
        }
    }

    let chartInstanceToDestroy = null; if (!isClone && activeChartInstances[panelInstanceKey]) chartInstanceToDestroy = activeChartInstances[panelInstanceKey]; else if (isClone && chartInDraggedElement) chartInstanceToDestroy = chartInDraggedElement; if (chartInstanceToDestroy) { try { chartInstanceToDestroy.destroy(); } catch (e) {} if (!isClone) delete activeChartInstances[panelInstanceKey]; else chartInDraggedElement = null; }

    const analysisDetails = getAnalysisDetails(analysisType); contentContainer.innerHTML = analysisDetails?.placeholder_html || `<div class='loading-placeholder'><i class='fas fa-spinner fa-spin fa-2x'></i><p>Loading data...</p></div>`; if (isClone) { const s=panelElement.querySelector('.panel-config-summary'); if(s) s.textContent="Default View"; }

    try {
        if (typeof Chart === 'undefined') throw new Error("Chart.js missing.");
        const analysisResult = await fetchAnalysisData(analysisType, idForApiCall, isSharedApiCall, recipientChosenConfig);

        if (!isClone) { 
            _updatePanelConfigSummary(panelElement, analysisResult?.title);
        }

        if (analysisType === 'spending-by-category' && analysisResult?.data) {
             if (analysisResult.data.length > 0) {
                 contentContainer.innerHTML = ''; const canvas = document.createElement('canvas'); contentContainer.appendChild(canvas); const ctx = canvas.getContext('2d');
                 const labels = analysisResult.data.map(item => item.category || 'Uncategorized'); const amounts = analysisResult.data.map(item => item.amount); const bgColors = Array.from({ length: labels.length }, (_, i) => `hsl(${(i * 360 / labels.length + 45) % 360}, 65%, 60%)`); const hoverBgColors = bgColors.map(c => c.replace(/, 65%, 60%\)$/, ', 70%, 65%)'));
                 const chartOptions = { responsive: true, maintainAspectRatio: false, animation: { duration: isClone ? 0 : CHART_ANIMATION_DURATION }, plugins: { legend: { display: !isClone, position: 'bottom', labels: { color: '#ddd', padding: 15, boxWidth: 12, usePointStyle: true } }, tooltip: { enabled: !isClone, backgroundColor: 'rgba(20,20,30,0.85)', titleColor: '#eee', bodyColor: '#ddd', callbacks: { label: ctxTooltip => `${ctxTooltip.label||''}: ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(ctxTooltip.parsed)} (${(ctxTooltip.parsed/ctxTooltip.chart.data.datasets[0].data.reduce((a,b)=>a+b,0)*100).toFixed(1)}%)` } } } };
                 if(isClone) { chartOptions.elements={arc:{borderWidth:1}}; chartOptions.plugins.legend.display=false; chartOptions.plugins.tooltip.enabled=false; }
                 const newChart = new Chart(ctx, { type: 'pie', data: { labels, datasets: [{ label: 'Spending', data: amounts, backgroundColor: bgColors, hoverBackgroundColor: hoverBgColors, borderColor: '#333', borderWidth: 1, hoverOffset: isClone ? 0: 8 }] }, options: chartOptions });
                 if(isClone) chartInDraggedElement = newChart; else if (!panelInstanceKey.startsWith('temp-')) activeChartInstances[panelInstanceKey] = newChart;
             } else { contentContainer.innerHTML = `<p style="text-align:center; color:#bbb; padding:15px 5px;">No spending data found for the current filters.</p>`; }
        } else if (analysisType !== 'spending-by-category') { contentContainer.innerHTML = `<p style='text-align:center; color:orange; padding:15px 5px;'>Display not implemented for: ${analysisType}</p>`; }
        else { contentContainer.innerHTML = `<p style="text-align:center; color:#bbb; padding:15px 5px;">No data available or received in an unexpected format.</p>`;}

    } catch (error) {
         console.error(`[Load Content] ERROR CAUGHT - Panel Instance Key: ${panelInstanceKey}, Type: ${analysisType}:`, error); contentContainer.innerHTML = `<p style='color:red; text-align:center; padding:15px 5px;'>Error loading data.<br><small>${error.message}</small></p>`; if (!isClone) _updatePanelConfigSummary(panelElement, "Error Loading Data");
    }
}

// --- Grid & Drag/Drop Logic ---
function checkGridEmpty() { if (!insightsGrid || !emptyMessage) return; const hasContent = insightsGrid.querySelector('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)'); emptyMessage.style.display = hasContent ? 'none' : 'block'; if (!hasContent && emptyMessage.parentElement !== insightsGrid) insightsGrid.appendChild(emptyMessage); }
function calculateGridCellLayout() { if (!insightsGrid || !insightsGridContainer) { gridCellLayout = []; return; } gridCellLayout = []; gridComputedStyle = window.getComputedStyle(insightsGrid); gridColCount = (window.innerWidth <= 768) ? 1 : 2; const panelOwnMargin = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-margin') || '12'); const gridPadding = parseFloat(gridComputedStyle.paddingLeft) || 10; const availableGridWidth = insightsGridContainer.clientWidth - (2 * gridPadding); let panelContentWidth = (availableGridWidth - (gridColCount - 1) * (2 * panelOwnMargin)) / gridColCount; if (gridColCount === 1) { panelContentWidth = availableGridWidth; } panelContentWidth = Math.max(200, panelContentWidth); const panelContentHeight = panelContentWidth * 0.8; const startOffsetX = gridPadding; const startOffsetY = gridPadding; const visiblePanels = Array.from(insightsGrid.children).filter(el => (el.classList.contains('insight-panel') || el.classList.contains('dragging-placeholder')) && !el.classList.contains('dragging-clone')); const estimatedItems = visiblePanels.length + (isDragging && dragType === 'palette' && (!placeholderElement || !placeholderElement.parentElement) ? 1 : 0); const estimatedRows = Math.max(1, Math.ceil(estimatedItems / gridColCount)); for (let r = 0; r < estimatedRows; r++) { for (let c = 0; c < gridColCount; c++) { const slotX = startOffsetX + c * (panelContentWidth + 2 * panelOwnMargin); const slotY = startOffsetY + r * (panelContentHeight + 2 * panelOwnMargin); gridCellLayout.push({ x: slotX, y: slotY, width: panelContentWidth + 2 * panelOwnMargin, height: panelContentHeight + 2 * panelOwnMargin, contentX: slotX + panelOwnMargin, contentY: slotY + panelOwnMargin, contentWidth: panelContentWidth, contentHeight: panelContentHeight }); }} }
function findNearestSlotIndex(pointerX, pointerY) { let closestIndex = -1, minDistSq = Infinity; if (!gridCellLayout.length) calculateGridCellLayout(); if (!gridCellLayout.length) return -1; gridCellLayout.forEach((slot, index) => { const slotCenterX = slot.contentX + slot.contentWidth / 2; const slotCenterY = slot.contentY + slot.contentHeight / 2; const distSq = (pointerX - slotCenterX) ** 2 + (pointerY - slotCenterY) ** 2; if (distSq < minDistSq) { minDistSq = distSq; closestIndex = index; } }); const panelChildren = Array.from(insightsGrid.children).filter(el => (el.classList.contains('insight-panel') || el.classList.contains('dragging-placeholder')) && !el.classList.contains('dragging-clone')); const panelCount = panelChildren.length + (isDragging && dragType === 'palette' && (!placeholderElement || !placeholderElement.parentElement) ? 1 : 0); return Math.min(closestIndex, panelCount); }
function showPalettePreview(targetPaletteItem) { if (!palettePreviewContainer || !targetPaletteItem || isDragging || (palette?.classList.contains('collapsed') && window.innerWidth > 768)) return; const { previewTitle, previewImageUrl, previewDescription } = targetPaletteItem.dataset; if (!previewTitle || !previewDescription) { hidePalettePreview(); return; } clearTimeout(previewHideTimeout); previewHideTimeout = null; palettePreviewContainer.innerHTML = `<div class="preview-container-inner"><h3 class="preview-title">${previewTitle}</h3><div class="preview-content">${previewImageUrl ? `<img src="${previewImageUrl}" alt="${previewTitle} preview" style="max-height:120px;width:auto;display:block;margin:5px auto 8px;border-radius:3px;">` : ''}<p>${previewDescription}</p></div></div>`; palettePreviewContainer.style.display = 'block'; palettePreviewContainer.style.visibility = 'hidden'; palettePreviewContainer.style.opacity = '0'; palettePreviewContainer.style.transform = 'scale(0.95)'; palettePreviewContainer.classList.remove('visible'); requestAnimationFrame(() => { if (!palettePreviewContainer || !targetPaletteItem) return; const prevRect = palettePreviewContainer.getBoundingClientRect(); const itemRect = targetPaletteItem.getBoundingClientRect(); const contRect = insightsView?.getBoundingClientRect() || { left:0,top:0,right:window.innerWidth,bottom:window.innerHeight }; let l = Math.max(contRect.left+VIEWPORT_PADDING, Math.min(itemRect.right+PREVIEW_GAP_TO_RIGHT, contRect.right-prevRect.width-VIEWPORT_PADDING)); let t = Math.max(contRect.top+VIEWPORT_PADDING, Math.min(itemRect.top+(itemRect.height/2)-(prevRect.height/2), contRect.bottom-prevRect.height-VIEWPORT_PADDING)); palettePreviewContainer.style.left = `${Math.round(l-contRect.left)}px`; palettePreviewContainer.style.top = `${Math.round(t-contRect.top)}px`; palettePreviewContainer.style.visibility = 'visible'; palettePreviewContainer.classList.add('visible'); palettePreviewContainer.style.opacity = '1'; palettePreviewContainer.style.transform = 'scale(1)'; }); }
function scheduleHidePalettePreview() { clearTimeout(previewHideTimeout); previewHideTimeout = setTimeout(hidePalettePreview, PREVIEW_HIDE_DELAY + 100); }
function hidePalettePreview() { clearTimeout(previewHideTimeout); previewHideTimeout = null; if (palettePreviewContainer?.classList.contains('visible')) { palettePreviewContainer.classList.remove('visible'); palettePreviewContainer.style.opacity = '0'; palettePreviewContainer.style.transform = 'scale(0.95)'; setTimeout(() => { if (palettePreviewContainer && !palettePreviewContainer.classList.contains('visible')) { palettePreviewContainer.style.display = 'none'; palettePreviewContainer.innerHTML = ''; } }, 300); } else if (palettePreviewContainer) { palettePreviewContainer.style.display = 'none'; palettePreviewContainer.innerHTML = ''; } }
function cancelHidePreview() { clearTimeout(previewHideTimeout); }
function onPointerDown(event) { if (event.target.closest('.panel-action-btn, .add-analysis-btn, .palette-toggle-btn, .panel-config-area, .panel-config-controls, .panel-config-controls *, .noUi-handle, .noUi-pips, .noUi-connects')) return; if (event.button !== 0 || isDragging) return; const panelElement = event.target.closest('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)'); const paletteItem = event.target.closest('.palette-item'); if (panelElement?.dataset.panelInstanceKey && !panelElement.dataset.panelInstanceKey.startsWith('temp-')) initiateDrag(event, panelElement, 'grid'); else if (paletteItem && !palette?.classList.contains('collapsed') && paletteItem.dataset.analysisType) initiateDrag(event, paletteItem, 'palette');}
function initiateDrag(event, element, type) { event.preventDefault(); event.stopPropagation(); hidePalettePreview(); isDragging = true; dragType = type; startClientX = event.clientX; startClientY = event.clientY; calculateGridCellLayout(); if (palette) paletteRect = palette.getBoundingClientRect(); if (!insightsGridContainer) { isDragging = false; return; } placeholderElement = document.createElement('div'); placeholderElement.className = 'dragging-placeholder drop-slot-indicator'; let elementRect; if (dragType === 'grid') { originalSourceElementForGridDrag = element; draggedElement = originalSourceElementForGridDrag; elementRect = draggedElement.getBoundingClientRect(); offsetX = startClientX - elementRect.left; offsetY = startClientY - elementRect.top; const gridChildren = Array.from(insightsGrid.children).filter(child => (child.classList.contains('insight-panel') || child.classList.contains('dragging-placeholder')) && !child.classList.contains('dragging-clone')); sourceIndex = gridChildren.indexOf(draggedElement); if (draggedElement.parentElement === insightsGrid && sourceIndex !== -1) { insightsGrid.insertBefore(placeholderElement, draggedElement); draggedElement.remove(); } else { isDragging = false; return; } currentTargetIndex = sourceIndex; } else { originalSourceElementForGridDrag = null; const sourcePaletteItem = element; const { analysisType } = sourcePaletteItem.dataset; if (!analysisType) { isDragging = false; return; } const analysisDetails = getAnalysisDetails(analysisType); const defaultConfig = analysisDetails?.default_config || {}; const tempPanelData = { id: generateUniqueId('temp-live'), analysis_type:analysisType, title: sourcePaletteItem.dataset.title || analysisDetails?.title || 'Analysis', configuration:defaultConfig, is_shared:false }; draggedElement = createInsightPanelElement(tempPanelData, true); loadPanelContent(draggedElement, true).catch(err => {}); let cloneWidth = placeholderElement.style.width ? parseFloat(placeholderElement.style.width) : 250; let cloneHeight = placeholderElement.style.height ? parseFloat(placeholderElement.style.height) : 200; offsetX = cloneWidth * 0.5; offsetY = cloneHeight * 0.2; elementRect = {left:startClientX - offsetX, top:startClientY - offsetY, width:cloneWidth, height:cloneHeight}; sourceIndex = -1; currentTargetIndex = -1; } draggedElement.classList.add('dragging-clone'); Object.assign(draggedElement.style, { position:'fixed', zIndex:1000, pointerEvents:'none', width:`${elementRect.width}px`, height:`${elementRect.height}px`, left:`${elementRect.left}px`, top:`${elementRect.top}px`, transition: 'none' }); document.body.appendChild(draggedElement); document.addEventListener('pointermove', onPointerMove); document.addEventListener('pointerup', onPointerUp, {once:true}); document.addEventListener('contextmenu', preventContextMenuDuringDrag, {capture:true}); }
function onPointerMove(event) { if (!isDragging || !draggedElement) return; const currentX = event.clientX, currentY = event.clientY; cancelAnimationFrame(animationFrameId); animationFrameId = requestAnimationFrame(() => { if (!isDragging || !draggedElement) return; draggedElement.style.left = `${currentX - offsetX}px`; draggedElement.style.top = `${currentY - offsetY}px`; gridRect = insightsGridContainer.getBoundingClientRect(); let isOverPalette = false; if (dragType === 'grid' && paletteRect && palette && !palette.classList.contains('collapsed')) { isOverPalette = currentX >= paletteRect.left && currentX <= paletteRect.right && currentY >= paletteRect.top && currentY <= paletteRect.bottom; } if (isOverPalette) { palette.classList.add('drag-over-delete'); if (placeholderElement?.parentElement) placeholderElement.remove(); currentTargetIndex = -2; } else { palette?.classList.remove('drag-over-delete'); const pointerXInGridCont = currentX - gridRect.left; const pointerYInGridCont = currentY - gridRect.top; const isOverGrid = currentX >= gridRect.left && currentX <= gridRect.right && currentY >= gridRect.top && currentY <= gridRect.bottom; let nearestIdx = -1; if (isOverGrid) { const pointerXInGrid = pointerXInGridCont + insightsGridContainer.scrollLeft; const pointerYInGrid = pointerYInGridCont + insightsGridContainer.scrollTop; nearestIdx = findNearestSlotIndex(pointerXInGrid, pointerYInGrid); } if (isOverGrid && nearestIdx !== -1) { if (nearestIdx !== currentTargetIndex || !placeholderElement?.parentElement) { insertElementAtIndex(placeholderElement, nearestIdx); currentTargetIndex = nearestIdx; } } else { if (placeholderElement?.parentElement) placeholderElement.remove(); currentTargetIndex = -1; } } handleGridScroll(currentY, gridRect); }); }
function handleGridScroll(clientY, gridContainerRect) { let scrollDelta = 0; const speed = SCROLL_THRESHOLD * SCROLL_SPEED_MULTIPLIER * 0.75; if (clientY < gridContainerRect.top + SCROLL_THRESHOLD) { scrollDelta = -speed * (1 - (clientY - gridContainerRect.top) / SCROLL_THRESHOLD); } else if (clientY > gridContainerRect.bottom - SCROLL_THRESHOLD) { scrollDelta = speed * (1 - (gridContainerRect.bottom - clientY) / SCROLL_THRESHOLD); } if (scrollDelta !== 0 && insightsGridContainer) insightsGridContainer.scrollTop += scrollDelta; }
async function onPointerUp() { if (!isDragging) return; cancelAnimationFrame(animationFrameId); document.removeEventListener('pointermove', onPointerMove); document.removeEventListener('contextmenu', preventContextMenuDuringDrag, {capture:true}); if (palette) palette.classList.remove('drag-over-delete'); const droppedOnPalette = currentTargetIndex === -2 && dragType === 'grid' && originalSourceElementForGridDrag; const droppedInsideGrid = currentTargetIndex !== -1 && currentTargetIndex !== -2 && placeholderElement?.parentElement === insightsGrid; let finalPanelToFocus = null; if (draggedElement) { draggedElement.remove(); draggedElement.classList.remove('dragging-clone'); ['position', 'left', 'top', 'width', 'height', 'zIndex', 'pointerEvents', 'transform', 'margin', 'transition'].forEach(prop => { if (draggedElement.style[prop]) draggedElement.style[prop] = ''; }); } if (dragType === 'palette' && chartInDraggedElement) try { chartInDraggedElement.destroy(); } catch(e){} chartInDraggedElement = null; try { if (droppedOnPalette) { const panelToRemove = originalSourceElementForGridDrag; const panelInstanceKey = panelToRemove.dataset.panelInstanceKey; const panelDbId = parseInt(panelToRemove.dataset.panelId); if (activeChartInstances[panelInstanceKey]) { try { activeChartInstances[panelInstanceKey].destroy(); } catch(e){} delete activeChartInstances[panelInstanceKey]; } const idSuffix = panelInstanceKey.replace(/[^\w-]/g, '_'); const sliderEl = panelToRemove.querySelector(`#time-slider-${idSuffix}`); if (sliderEl?.noUiSlider) try { sliderEl.noUiSlider.destroy(); } catch(e) {} if (placeholderElement?.parentElement) placeholderElement.remove(); if (!isNaN(panelDbId) && panelToRemove.dataset.isShared !== 'true') { await removePanelFromServer(panelDbId); } else if (panelToRemove.dataset.isShared === 'true') { console.log("Shared panel instance removed from view (client-side)."); } } else if (droppedInsideGrid) { if (dragType === 'palette') { const analysisType = draggedElement.dataset.analysisType; const analysisDetails = getAnalysisDetails(analysisType); const initialConfig = JSON.parse(draggedElement.dataset.configuration || '{}') || analysisDetails?.default_config || {}; const newPanelDataFromServer = await addPanelToServer(analysisType, initialConfig); if (!newPanelDataFromServer?.id) throw new Error("Panel creation failed."); const panelDataForCreation = { id: String(newPanelDataFromServer.id), analysis_type: newPanelDataFromServer.analysis_type || analysisType, title: newPanelDataFromServer.title || draggedElement.dataset.staticTitle || analysisDetails?.title || 'Analysis', configuration: newPanelDataFromServer.configuration || initialConfig, is_shared: false }; finalPanelToFocus = createInsightPanelElement(panelDataForCreation, false); placeholderElement.replaceWith(finalPanelToFocus); _initializePanelConfigurationControls(finalPanelToFocus, panelDataForCreation); await loadPanelContent(finalPanelToFocus, false); } else if (dragType === 'grid' && originalSourceElementForGridDrag) { finalPanelToFocus = originalSourceElementForGridDrag; placeholderElement.replaceWith(finalPanelToFocus); const chartInstance = activeChartInstances[finalPanelToFocus.dataset.panelInstanceKey]; if (chartInstance?.resize) setTimeout(() => { try { chartInstance.resize(); } catch(e){} }, 50); } } else { if (dragType === 'grid' && originalSourceElementForGridDrag) { finalPanelToFocus = originalSourceElementForGridDrag; if (placeholderElement?.parentElement) placeholderElement.remove(); insertElementAtIndex(finalPanelToFocus, sourceIndex); const chartInstance = activeChartInstances[finalPanelToFocus.dataset.panelInstanceKey]; if (chartInstance?.resize) setTimeout(() => { try { chartInstance.resize(); } catch(e){} }, 50); } else if (dragType === 'palette') { if (placeholderElement?.parentElement) placeholderElement.remove(); } } const panelElementsInGrid = Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)')); const persistentOriginalPanelIds = panelElementsInGrid .filter(p => p.dataset.isShared !== 'true' && p.dataset.panelId && !String(p.dataset.panelId).startsWith('temp-')) .map(p => parseInt(p.dataset.panelId)) .filter(id => !isNaN(id)); if (persistentOriginalPanelIds.length > 0 || (droppedOnPalette && panelElementsInGrid.length === 0 && originalSourceElementForGridDrag?.dataset.isShared !== 'true')) { await updatePanelOrderOnServer(persistentOriginalPanelIds); } } catch (apiError) { alert(`Error saving changes: ${apiError.message}`); console.error("[Drop] API or Logic Error:", apiError); if (placeholderElement?.parentElement) placeholderElement.remove(); if (dragType === 'grid' && originalSourceElementForGridDrag && !originalSourceElementForGridDrag.parentElement) { insertElementAtIndex(originalSourceElementForGridDrag, sourceIndex); try { await loadPanelContent(originalSourceElementForGridDrag, false); } catch (loadErr) {} } } finally { if(placeholderElement?.parentElement) placeholderElement.remove(); placeholderElement = null; isDragging = false; draggedElement = null; originalSourceElementForGridDrag = null; sourceIndex = -1; dragType = null; currentTargetIndex = -1; gridRect = null; paletteRect = null; setTimeout(() => { calculateGridCellLayout(); checkGridEmpty(); const currentPanelInstanceKeys = new Set(Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)')).map(p => p.dataset.panelInstanceKey)); Object.keys(activeChartInstances).forEach(keyStr => { if(!keyStr.startsWith('temp-') && !currentPanelInstanceKeys.has(keyStr)) { try{ activeChartInstances[keyStr].destroy(); } catch(e){} delete activeChartInstances[keyStr]; }}); }, 50); if (finalPanelToFocus?.scrollIntoView) setTimeout(() => { finalPanelToFocus.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 100); } }
function preventContextMenuDuringDrag(event) { if (isDragging) event.preventDefault(); }
function insertElementAtIndex(elementToInsert, index) { if (!insightsGrid) return; const currentGridChildren = Array.from(insightsGrid.children).filter(el => (el.classList.contains('insight-panel') || el.classList.contains('dragging-placeholder')) && !el.classList.contains('dragging-clone')); const actualItems = currentGridChildren.filter(child => child !== elementToInsert); const effectiveIndex = Math.max(0, Math.min(index, actualItems.length)); if (elementToInsert.parentElement === insightsGrid) insightsGrid.removeChild(elementToInsert); if (effectiveIndex < actualItems.length) insightsGrid.insertBefore(elementToInsert, actualItems[effectiveIndex]); else { if (emptyMessage && emptyMessage.parentElement === insightsGrid && insightsGrid.lastChild === emptyMessage) insightsGrid.insertBefore(elementToInsert, emptyMessage); else insightsGrid.appendChild(elementToInsert); } checkGridEmpty(); }
async function handleGridAction(event) {
    const panel = event.target.closest('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)');
    if (!panel || !panel.dataset.panelInstanceKey) return;
    const panelInstanceKey = panel.dataset.panelInstanceKey;
    const panelDbId = parseInt(panel.dataset.panelId); 
    const isSharedPanel = panel.dataset.isShared === 'true';

    if (panelInstanceKey.startsWith('temp-')) return;

    if (event.target.closest('.panel-close-btn')) {
        event.stopPropagation();
        if (activeChartInstances[panelInstanceKey]) {
            try { activeChartInstances[panelInstanceKey].destroy(); } catch(e){}
            delete activeChartInstances[panelInstanceKey];
        }
        const idSuffix = panelInstanceKey.replace(/[^\w-]/g, '_');
        const sliderEl = panel.querySelector(`#time-slider-${idSuffix}`);
        if (sliderEl?.noUiSlider) try { sliderEl.noUiSlider.destroy(); } catch(e) {}
        
        panel.remove();
        checkGridEmpty();
        calculateGridCellLayout();

        if (!isSharedPanel && !isNaN(panelDbId)) { 
            try {
                await removePanelFromServer(panelDbId);
                const panelElementsAfterRemove = Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)'));
                const panelDbIdsToOrder = panelElementsAfterRemove
                    .filter(p => p.dataset.isShared !== 'true' && p.dataset.panelId && !String(p.dataset.panelId).startsWith('temp-'))
                    .map(p => parseInt(p.dataset.panelId)).filter(id => !isNaN(id));
                await updatePanelOrderOnServer(panelDbIdsToOrder);
            } catch (error) { alert(`Error removing panel: ${error.message}.`); }
        } else if (isSharedPanel) {
            console.log(`Shared panel instance ${panelInstanceKey} (original DB ID ${panelDbId}) removed from view.`);
        }
    } 
}
function makePanelDraggable(panelElement) { panelElement.removeEventListener('pointerdown', onPointerDown); panelElement.addEventListener('pointerdown', onPointerDown); }
function handlePaletteToggle(forceState=null) { if (!palette || !paletteToggleBtn || !insightsView) return; hidePalettePreview(); let shouldCollapse = forceState === 'close' || (forceState === null && !palette.classList.contains('collapsed')); palette.classList.toggle('collapsed', shouldCollapse); insightsView.classList.toggle('palette-collapsed', shouldCollapse); updateToggleButtonIcon(); setTimeout(() => { calculateGridCellLayout(); Object.values(activeChartInstances).forEach(chart => { if (chart?.resize) try { chart.resize(); } catch(e){} }); }, parseFloat(getComputedStyle(palette).transitionDuration || '0.3s')*1000 + 50); }
function updateToggleButtonIcon() { if (!palette || !paletteToggleBtn) return; const icon = paletteToggleBtn.querySelector('i'); if (!icon) return; const isMobile = window.innerWidth <= 768; const isCollapsed = palette.classList.contains('collapsed'); icon.className = `fas ${isMobile ? (isCollapsed ? 'fa-chevron-up':'fa-chevron-down') : (isCollapsed ? 'fa-chevron-right':'fa-chevron-left')}`; paletteToggleBtn.setAttribute('aria-label', isCollapsed ? 'Expand Palette' : 'Collapse Palette'); }

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
        paletteScrollContainer.addEventListener('click', async e => { const addBtn = e.target.closest('.add-analysis-btn'); if (addBtn && !isDragging) { e.stopPropagation(); const item = addBtn.closest('.palette-item'); if (item?.dataset.analysisType) { const { analysisType } = item.dataset; const analysisDetails = getAnalysisDetails(analysisType); const initialConfig = analysisDetails?.default_config || {}; addBtn.disabled=true; addBtn.innerHTML='<i class="fas fa-spinner fa-spin"></i>'; try { const newPanelDataFromServer = await addPanelToServer(analysisType, initialConfig); if (!newPanelDataFromServer?.id) throw new Error("Panel creation failed."); const panelDataForCreation = { id: String(newPanelDataFromServer.id), analysis_type: newPanelDataFromServer.analysis_type || analysisType, title: newPanelDataFromServer.title || item.dataset.title || analysisDetails?.title || 'Analysis', configuration: newPanelDataFromServer.configuration || initialConfig, is_shared: false }; const newEl = createInsightPanelElement(panelDataForCreation, false); const targetIndex = insightsGrid.children.length - (emptyMessage?.parentElement === insightsGrid ? 1 : 0); insertElementAtIndex(newEl, targetIndex ); _initializePanelConfigurationControls(newEl, panelDataForCreation); await loadPanelContent(newEl, false); checkGridEmpty(); calculateGridCellLayout(); const panelElementsAfterAdd = Array.from(insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)')); const panelDbIdsToOrder = panelElementsAfterAdd.filter(p => p.dataset.isShared !== 'true' && p.dataset.panelId && !String(p.dataset.panelId).startsWith('temp-')).map(p => parseInt(p.dataset.panelId)).filter(id => !isNaN(id)); if (panelDbIdsToOrder.length > 0) await updatePanelOrderOnServer(panelDbIdsToOrder); setTimeout(() => newEl?.scrollIntoView({behavior:'smooth',block:'nearest'}), 150); } catch (err) { alert(`Failed to add panel: ${err.message}`); } finally { addBtn.disabled=false; addBtn.innerHTML='+'; } } } });
    }
    palettePreviewContainer?.addEventListener('mouseleave', e => { if (!e.relatedTarget || !e.relatedTarget.closest('.palette-item')) scheduleHidePalettePreview(); });
    palettePreviewContainer?.addEventListener('mouseenter', cancelHidePreview);

    if (insightsGrid) {
        insightsGrid.addEventListener('click', handleGridAction); 
        
        const existingPanelElements = insightsGrid.querySelectorAll('.insight-panel:not(.dragging-placeholder):not(.dragging-clone)');
        const initPromises = [];
        
        const panelDataList = Array.from(existingPanelElements).map(panelEl => {
            const analysisDetailsForDefault = getAnalysisDetails(panelEl.dataset.analysisType);
            const originalConfig = JSON.parse(panelEl.dataset.configuration || JSON.stringify(analysisDetailsForDefault?.default_config || {}));
            let current_config_for_display = null;
            if (panelEl.dataset.isShared === 'true') {
                current_config_for_display = {
                    group_id: panelEl.dataset.sharedConfigGroupId || 'all',
                    startDate: panelEl.dataset.sharedConfigStartDate || null,
                    endDate: panelEl.dataset.sharedConfigEndDate || null,
                };
            }
            return { 
                id: panelEl.dataset.panelId, 
                analysis_type: panelEl.dataset.analysisType,
                title: panelEl.dataset.staticTitle,
                configuration: originalConfig, 
                is_shared: panelEl.dataset.isShared === 'true',
                shared_instance_id: panelEl.dataset.sharedInstanceId,
                access_mode: panelEl.dataset.accessMode,
                sharer_username: panelEl.dataset.sharerUsername,
                current_config_for_display: current_config_for_display 
            };
        });

        for (const panelData of panelDataList) {
            const panelElement = insightsGrid.querySelector(`.insight-panel[data-panel-instance-key="${getPanelInstanceKey(panelData)}"]`);
            if (!panelElement) {
                console.warn("Could not find panel element for instance key:", getPanelInstanceKey(panelData));
                continue;
            }
            makePanelDraggable(panelElement);
            // Attach share button listener for pre-rendered owned panels
            if (!panelData.is_shared) { 
                const shareBtn = panelElement.querySelector('.panel-share-btn');
                if (shareBtn && !shareBtn._clickHandler) { 
                     const shareModalOpener = (e) => {
                        e.stopPropagation();
                        openSharePanelModal(panelElement);
                    };
                    shareBtn.addEventListener('click', shareModalOpener);
                    shareBtn._clickHandler = shareModalOpener;
                }
            }
            
            _initializePanelConfigurationControls(panelElement, panelData); 
            
            let initialRecipientConfig = null;
            if (panelData.is_shared && panelData.access_mode === 'dynamic') {
                try { initialRecipientConfig = JSON.parse(panelElement.dataset.recipientChosenConfig || 'null'); } catch(e){}
            }
            initPromises.push(loadPanelContent(panelElement, false, initialRecipientConfig));
        }
        try {
            await Promise.all(initPromises);
            console.log("[Init] Existing panels initialization complete.");
             existingPanelElements.forEach(panel => {
                 if (!panel.dataset.panelInstanceKey?.startsWith('temp-')) {
                     _updatePanelConfigSummary(panel); 
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
    console.log("%c[Insights] initInsightsManager - START (Share Panel v3 - Listener Fix)", "background-color: yellow; color: black; font-weight:bold;");
    insightsView = document.getElementById('insights-view'); insightsGridContainer = document.getElementById('insights-grid-container'); insightsGrid = document.getElementById('insights-grid'); palette = document.getElementById('analysis-palette'); paletteHeader = document.getElementById('palette-header'); paletteToggleBtn = document.getElementById('palette-toggle-btn'); paletteScrollContainer = document.getElementById('palette-scroll-container'); emptyMessage = document.getElementById('insights-empty-message'); palettePreviewContainer = document.getElementById('palette-preview-container');

    if (typeof wNumb === 'function') { try { sliderNumberFormatter = wNumb({ decimals: 0 }); } catch (e) { console.error("[Init] wNumb error:", e); sliderNumberFormatter = { to:v=>String(Math.round(parseFloat(v))), from:v=>parseFloat(v) }; } }
    else { console.warn("[Init] wNumb missing."); sliderNumberFormatter = { to:v=>String(Math.round(parseFloat(v))), from:v=>parseFloat(v) }; }

    let criticalElementsFound = true; const elementsToCheck = { insightsView, insightsGridContainer, insightsGrid, palette, paletteHeader, paletteToggleBtn, paletteScrollContainer, emptyMessage, palettePreviewContainer }; for (const [name, el] of Object.entries(elementsToCheck)) { if (!el) { console.error(`[Init] Missing element: ${name}`); criticalElementsFound = false; } } if (!criticalElementsFound) { alert("Insights UI init error."); return; }
    if (typeof Chart === 'undefined') console.error("[Init] Chart.js missing."); if (typeof noUiSlider === 'undefined') console.warn("[Init] noUiSlider missing.");

    isDragging = false; if(draggedElement) { draggedElement.remove(); draggedElement = null; } document.querySelectorAll('.dragging-placeholder.drop-slot-indicator').forEach(el => el.remove()); document.removeEventListener('pointermove', onPointerMove); document.removeEventListener('pointerup', onPointerUp); document.removeEventListener('contextmenu', preventContextMenuDuringDrag, {capture:true});

    try {
        await fetchUserGroups(); 
        calculateGridCellLayout();
        await setupEventListeners(); 
        checkGridEmpty();
        hidePalettePreview();
        if (palette) insightsView.classList.toggle('palette-collapsed', palette.classList.contains('collapsed'));
        updateToggleButtonIcon();
        console.log("%c[Insights] initInsightsManager - Initialized Successfully (Share Panel v3 - Listener Fix)", "background-color: lightgreen; color: black; font-weight:bold;");
    } catch (error) {
        console.error("%c[Insights] initInsightsManager - FAILED:", "background-color: red; color: white; font-weight:bold;", error);
        alert("Insights initialization failed.");
    }
}

// Analysis Type Definitions
function getAnalysisDetails(analysisTypeId) { const localAvailableAnalyses = { "spending-by-category": { id: "spending-by-category", title: "💸 Spending by Category", description: "Total attended event costs grouped by node/category.", preview_title: "Spending by Category", preview_image_filename: null, preview_description: "Visualizes where your event budget went, categorized by the event's assigned node. Filters apply.", placeholder_html: `<div class='loading-placeholder' style='text-align: center; padding: 20px; color: #aaa;'><i class='fas fa-chart-pie fa-2x'></i><p style='margin-top: 10px;'>Loading spending data...</p></div>`, default_config: { time_period: "all_time", group_id: "all", startDate: null, endDate: null } } }; return localAvailableAnalyses[analysisTypeId]; }
// --- END OF FILE insightsManager.js ---