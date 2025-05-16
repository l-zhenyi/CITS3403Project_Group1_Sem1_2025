// --- START OF FILE static/js/eventRenderer.js ---
// REVISED: Export layoutInstances

// eventRenderer.js
import { groupsData, allEventsData, eventsByDate } from './dataHandle.js';
import { OrbitLayoutManager } from './orbitLayoutDOM.js';
import { getTransformState } from './viewportManager.js';
// NEW: Import for event creation modal
import { openEventCreationModal } from './eventCreationModalManager.js';


const eventPanelsContainer = document.getElementById('event-panels-container');
const calendarMonthYearEl = document.getElementById('calendar-month-year');
const calendarGridEl = document.getElementById('calendar-grid');
const eventListContainer = document.getElementById('event-list-container');
const collageViewport = document.getElementById('collage-viewport');

// Store layout instances (Node Element -> Layout Manager Instance)
export const layoutInstances = new Map();

const OVERFLOW_THRESHOLD = 3; // If more than this number of events, show fade and 'more' indicator

// --- Day Events Modal Elements ---
let dayEventsModalEl = null;
let dayEventsModalTitleEl = null;
let dayEventsModalListEl = null;
let dayEventsModalCloseBtn = null;

// --- Context Menu Element (Module Scope) ---
let contextMenuInstance = null;

// --- Click Outside Handler for Context Menu (Module Scope Function) ---
function handleClickOutsideContextMenu(event) {
    if (contextMenuInstance && contextMenuInstance.style.display === 'block') {
        if (!contextMenuInstance.contains(event.target)) {
            hideContextMenu(); // Call a dedicated hide function
        }
    }
}

// --- Helper Function to Hide Context Menu and Remove Listener ---
export function hideContextMenu() {
    if (contextMenuInstance) {
        contextMenuInstance.style.display = 'none';
        document.removeEventListener('click', handleClickOutsideContextMenu, true);
    }
}

// --- Node Creation Modal Elements & Logic ---
let nodeCreationModal = null;
let nodeNameInput = null;
let nodeCreationForm = null;
let nodeCreationErrorMessage = null;
let currentCoordsForNodeCreation = { x: 0, y: 0 }; // Store coords for node creation

function setupNodeCreationModal() {
    if (nodeCreationModal) return; // Already set up

    nodeCreationModal = document.getElementById('node-creation-modal');
    if (!nodeCreationModal) {
        console.error("Node creation modal element (#node-creation-modal) not found.");
        return;
    }
    nodeNameInput = nodeCreationModal.querySelector('#new-node-name-input');
    nodeCreationForm = nodeCreationModal.querySelector('#node-creation-form');
    nodeCreationErrorMessage = nodeCreationModal.querySelector('#node-creation-error-message');
    const closeBtn = nodeCreationModal.querySelector('.modal-close-btn');
    const cancelBtn = nodeCreationModal.querySelector('#node-creation-cancel-btn');

    if (!nodeNameInput || !nodeCreationForm || !closeBtn || !cancelBtn || !nodeCreationErrorMessage) {
        console.error("Essential elements for node creation modal are missing.");
        nodeCreationModal = null; // Prevent usage
        return;
    }

    closeBtn.addEventListener('click', closeNodeCreationModal);
    cancelBtn.addEventListener('click', closeNodeCreationModal);
    nodeCreationModal.addEventListener('click', (event) => {
        if (event.target === nodeCreationModal) {
            closeNodeCreationModal();
        }
    });

    nodeCreationForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const nodeName = nodeNameInput.value.trim();
        if (!nodeName) {
            nodeCreationErrorMessage.textContent = "Node name cannot be empty.";
            nodeCreationErrorMessage.style.display = 'block';
            nodeNameInput.focus();
            return;
        }

        const activeGroupId = getActiveGroupId();
        if (!activeGroupId) {
            alert("Cannot create node: No active group selected.");
            closeNodeCreationModal();
            return;
        }
        
        nodeCreationErrorMessage.textContent = "";
        nodeCreationErrorMessage.style.display = 'none';
        const saveButton = nodeCreationForm.querySelector('button[type="submit"]');
        saveButton.disabled = true;
        saveButton.textContent = 'Creating...';

        try {
            const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
            const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
            if (csrfTokenMeta) headers['X-CSRFToken'] = csrfTokenMeta.getAttribute('content');

            const response = await fetch(`/api/groups/${activeGroupId}/nodes`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    label: nodeName,
                    x: currentCoordsForNodeCreation.x,
                    y: currentCoordsForNodeCreation.y
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `Node creation failed (${response.status})` }));
                throw new Error(errorData.error || `HTTP error ${response.status}`);
            }
            // Success
            closeNodeCreationModal();
            await renderGroupEvents(activeGroupId); // Refresh view
        } catch (error) {
            console.error("Error creating node:", error);
            nodeCreationErrorMessage.textContent = `Error: ${error.message}`;
            nodeCreationErrorMessage.style.display = 'block';
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = 'Create Node';
        }
    });
}

function openNodeCreationModal(x, y) {
    if (!nodeCreationModal) setupNodeCreationModal();
    if (!nodeCreationModal) return; // Setup failed

    currentCoordsForNodeCreation = { x, y };
    nodeNameInput.value = '';
    if(nodeCreationErrorMessage) nodeCreationErrorMessage.style.display = 'none';
    nodeCreationModal.style.display = 'flex';
    requestAnimationFrame(() => {
        nodeCreationModal.classList.add('visible');
        nodeNameInput.focus();
    });
}

function closeNodeCreationModal() {
    if (nodeCreationModal) {
        nodeCreationModal.classList.remove('visible');
        // Use timeout to allow fade-out animation
        setTimeout(() => {
            nodeCreationModal.style.display = 'none';
            if(nodeCreationErrorMessage) nodeCreationErrorMessage.style.display = 'none';

        }, 300); // Match CSS transition duration
    }
}


// --- Helper: Format Event Time for Day Modal ---
/**
 * Formats the time portion of a Date object for display in the Day Events Modal.
 * If the date's time is midnight (00:00:00 local time), it's displayed as "All Day".
 *
 * @param {Date | null} date - The Date object representing the event's date and time, or null.
 * @returns {string} A formatted time string (e.g., "10:30 AM", "All Day", "Time TBD").
 */
function formatEventTimeForDayModal(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        return 'Time TBD'; // Or "No Time Specified"
    }

    // Check if the time is exactly midnight (00:00:00.000) in the local timezone.
    if (date.getHours() === 0 &&
        date.getMinutes() === 0 &&
        date.getSeconds() === 0 &&
        date.getMilliseconds() === 0) {
        return 'All Day';
    }

    try {
        return date.toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    } catch (e) {
        console.error("Error formatting time for day modal:", date, e);
        return 'Invalid Time'; // Fallback for unexpected errors
    }
}

function setupDayEventsModal() {
    dayEventsModalEl = document.getElementById('day-events-modal');

    if (!dayEventsModalEl) {
        return; 
    }
    if (dayEventsModalTitleEl) {
        return; 
    }

    dayEventsModalTitleEl = dayEventsModalEl.querySelector('#day-events-modal-title');
    dayEventsModalListEl = dayEventsModalEl.querySelector('#day-events-modal-list');
    dayEventsModalCloseBtn = dayEventsModalEl.querySelector('#day-events-modal-close-btn');

    if (!dayEventsModalTitleEl || !dayEventsModalListEl || !dayEventsModalCloseBtn) {
        console.error("Could not find all required child elements within #day-events-modal.");
        dayEventsModalEl = null; 
        return;
    }

    dayEventsModalCloseBtn.addEventListener('click', closeDayEventsModal);
    dayEventsModalEl.addEventListener('click', (event) => {
        if (event.target === dayEventsModalEl) {
            closeDayEventsModal();
        }
    });
}

export function openDayEventsModal(dateString, eventsForDay) {
    if (!dayEventsModalEl) {
        setupDayEventsModal();
        if (!dayEventsModalEl) { 
            console.warn("Day Events Modal could not be initialized or found. Cannot open.");
            return;
        }
    }

    const dateObj = new Date(dateString + 'T00:00:00'); 
    dayEventsModalTitleEl.textContent = `Events on ${dateObj.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;

    dayEventsModalListEl.innerHTML = ''; 

    if (!eventsForDay || eventsForDay.length === 0) {
        dayEventsModalListEl.innerHTML = '<li>No events scheduled for this day.</li>';
    } else {
        eventsForDay.forEach(event => {
            const li = document.createElement('li');
            li.className = 'day-event-item';
            li.dataset.eventId = event.id;

            const titleSpan = document.createElement('span');
            titleSpan.className = 'day-event-title';
            titleSpan.textContent = event.title || 'Untitled Event';

            const groupSpan = document.createElement('span');
            groupSpan.className = 'day-event-group';
            groupSpan.textContent = event.group_name || 'Personal'; 

            const timeSpan = document.createElement('span');
            timeSpan.className = 'day-event-time';
            let eventDateForTime = null;
            const fullEventData = allEventsData.find(e => String(e.id) === String(event.id));
            if (fullEventData && fullEventData.date instanceof Date) {
                eventDateForTime = fullEventData.date;
            }
            timeSpan.textContent = formatEventTimeForDayModal(eventDateForTime);

            li.appendChild(titleSpan);
            li.appendChild(groupSpan);
            li.appendChild(timeSpan);

            li.addEventListener('click', () => {
                const fullEvent = allEventsData.find(e => String(e.id) === String(event.id));
                if (fullEvent) {
                    document.dispatchEvent(new CustomEvent('openEventModalRequest', {
                        detail: { eventData: fullEvent },
                        bubbles: true, composed: true
                    }));
                    closeDayEventsModal();
                } else {
                    console.warn(`Full event data not found for ID ${event.id} to open main modal.`);
                }
            });
            dayEventsModalListEl.appendChild(li);
        });
    }

    dayEventsModalEl.classList.add('visible');
    dayEventsModalEl.style.display = 'flex';
}

function closeDayEventsModal() {
    if (dayEventsModalEl) {
        dayEventsModalEl.classList.remove('visible');
        setTimeout(() => {
            dayEventsModalEl.style.display = 'none';
        }, 300);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setupDayEventsModal();
        setupNodeCreationModal(); // Setup node creation modal on DOMContentLoaded
    });
} else {
    setupDayEventsModal();
    setupNodeCreationModal(); // Setup node creation modal if DOM already loaded
}



// --- Helper: Format Date ---
function formatEventDateForDisplay(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return 'No Date';
    try {
        return date.toLocaleString(undefined, {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true
        });
    } catch (e) {
        console.error("Error formatting date:", date, e);
        return 'Invalid Date';
    }
}

// --- Create Event Panel DOM Element ---
function createEventPanel(event) {
    if (!event || typeof event.id === 'undefined') {
        console.error("createEventPanel called with invalid event data:", event);
        return null;
    }
    const panel = document.createElement('div');
    panel.className = 'event-panel';
    panel.id = `event-panel-${event.id}`;
    panel.dataset.eventId = event.id;

    if (event.node_id !== null && event.node_id !== undefined && String(event.node_id).trim() !== '') {
        panel.dataset.snappedToNode = String(event.node_id);
    }

    panel._eventData = event; 

    const dateText = formatEventDateForDisplay(event.date); 
    const imageUrl = event.image_url;

    const originalContentWrapper = document.createElement('div');
    originalContentWrapper.className = 'orbit-element-original-content';

    originalContentWrapper.innerHTML = `
        <img src="${imageUrl}" alt="${event.title || 'Event'}" class="event-image">
        <div class="event-info-overlay">
            <div class="event-panel-title" title="${event.title || ''}">${event.title || 'Untitled Event'}</div>
            <div class="event-panel-date">${dateText}</div>
        </div>
    `;
    panel.appendChild(originalContentWrapper);
    panel.style.position = 'absolute';
    if (!panel.dataset.snappedToNode) {
        panel.style.left = `${Number(event.x || 0)}px`;
        panel.style.top = `${Number(event.y || 0)}px`;
    }

    return panel;
}


// --- Node Dragging Logic ---
function makeDraggableNode(element) {
    let isDragging = false;
    let startX, startY, initialNodeLeft, initialNodeTop;

    function onPointerDown(e) {
        if (e.target !== element || e.button !== 0 || !window.draggingAllowed) return;
        e.stopPropagation();
        isDragging = true;
        element.classList.add('dragging');
        element.style.zIndex = 1000;
        element.style.cursor = 'grabbing';
        startX = e.clientX;
        startY = e.clientY;
        initialNodeLeft = parseFloat(element.style.left) || 0;
        initialNodeTop = parseFloat(element.style.top) || 0;
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);
    }

    function onPointerMove(e) {
        if (!isDragging) return;
        const scale = getCurrentZoomScale();
        const dx = (e.clientX - startX) / scale;
        const dy = (e.clientY - startY) / scale;
        const newX = initialNodeLeft + dx;
        const newY = initialNodeTop + dy;
        element.style.left = `${newX}px`;
        element.style.top = `${newY}px`;
        const instance = layoutInstances.get(element);
        if (instance) {
            instance.updateLayout();
        }
    }

    function onPointerUp() {
        if (!isDragging) return;
        isDragging = false;
        element.classList.remove('dragging');
        element.style.zIndex = '';
        element.style.cursor = '';
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);

        const instance = layoutInstances.get(element);
        if (instance) {
            instance.updateLayout();
        }

        const nodeId = element.dataset.nodeId;
        if (nodeId) {
            const x = parseFloat(element.style.left) || 0;
            const y = parseFloat(element.style.top) || 0;

            const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };
            if (csrfTokenMeta) {
                headers['X-CSRFToken'] = csrfTokenMeta.getAttribute('content');
            } else {
                console.warn("CSRF token meta tag not found. Node update PATCH request may fail.");
            }

            fetch(`/api/nodes/${nodeId}`, {
                method: 'PATCH',
                headers: headers,
                body: JSON.stringify({ x, y })
            })
            .then(res => { if (!res.ok) console.error(`Failed to update node ${nodeId} pos.`); })
            .catch(err => console.error(`Error updating node ${nodeId}:`, err));
        }
    }
    element.addEventListener('pointerdown', onPointerDown);
}

function getCurrentZoomScale() {
    if (!eventPanelsContainer) return 1;
    try {
        const { scale: viewportScale } = getTransformState(); 
        if (viewportScale) return viewportScale;
    } catch (e) { /* ignore */ }
    const transform = eventPanelsContainer.style.transform;
    const match = transform?.match(/scale\(([\d.]+)\)/);
    return match ? parseFloat(match[1]) : 1;
}


export function createNodeElement(node) {
    if (!node || typeof node.id === 'undefined') {
        console.error("createNodeElement called with invalid node data:", node);
        return null;
    }
    const el = document.createElement('div');
    el.className = 'event-node';
    el.id = `node-${node.id}`;
    el.dataset.nodeId = node.id;
    el.style.left = `${Number(node.x || 0)}px`;
    el.style.top = `${Number(node.y || 0)}px`;
    el.style.position = 'absolute';
    el.textContent = node.label || 'Untitled';
    makeDraggableNode(el);
    return el;
}

// --- Event Tile Sizing Logic ---
const TILE_MIN_WIDTH = 280; // px
const TILE_MAX_WIDTH = 380; // px
const TILE_GAP = 16;        // px

/**
 * Calculates the optimal number of columns and tile width.
 * @param {number} containerWidth - The width of the container for tiles.
 * @param {number} minTileWidth - Minimum width for a tile.
 * @param {number} maxTileWidth - Maximum width for a tile.
 * @param {number} gap - Gap between tiles.
 * @returns {{tileWidth: number, numCols: number}}
 */
function calculateTileLayout(containerWidth, minTileWidth, maxTileWidth, gap) {
    if (containerWidth <= 0) {
        return { tileWidth: minTileWidth, numCols: 1 };
    }

    // Case 1: Container is too narrow for even one minWidth tile (ignoring gap as numCols=1 means no inter-tile gap)
    if (containerWidth < minTileWidth) {
        return { tileWidth: containerWidth, numCols: 1 };
    }

    // Determine the maximum number of columns possible if tiles were at their minWidth
    let maxColsPossible = Math.floor((containerWidth + gap) / (minTileWidth + gap));
    maxColsPossible = Math.max(1, maxColsPossible); // Ensure at least 1 column

    // Iterate downwards from maxPossibleCols to find the best fit
    for (let numCols = maxColsPossible; numCols >= 1; numCols--) {
        const totalGapWidth = (numCols - 1) * gap;
        const availableWidthForTiles = containerWidth - totalGapWidth;

        if (availableWidthForTiles <= 0 && numCols > 1) continue; // Not enough space for gaps with this many columns
        if (availableWidthForTiles <= 0 && numCols === 1) return { tileWidth: containerWidth, numCols: 1};


        const calculatedTileWidth = availableWidthForTiles / numCols;

        if (calculatedTileWidth <= maxTileWidth) {
            // This is a good fit. tileWidth will be >= minTileWidth because of how maxColsPossible was derived.
            // And it's <= maxTileWidth. This ensures tiles are within desired constraints and fill the row.
            return { tileWidth: calculatedTileWidth, numCols: numCols };
        }
    }
    
    // Fallback: If the loop finishes, it means for numCols=1, calculatedTileWidth (containerWidth) was > maxTileWidth.
    // To "perfectly fill", we must use more columns to bring tile width down, aiming for maxTileWidth.
    let numColsNeededForMaxWidth = Math.ceil((containerWidth + gap) / (maxTileWidth + gap));
    numColsNeededForMaxWidth = Math.max(1, numColsNeededForMaxWidth); // Ensure at least 1

    const totalGapForTheseCols = (numColsNeededForMaxWidth - 1) * gap;
    const finalTileWidth = (containerWidth - totalGapForTheseCols) / numColsNeededForMaxWidth;
    
    // This finalTileWidth might be less than minTileWidth in some edge cases to achieve perfect fill.
    // e.g. container = 450, min=280, max=300, gap=16 => numCols=2, tileWidth=217
    return { tileWidth: finalTileWidth, numCols: numColsNeededForMaxWidth };
}


/**
 * Adjusts the sizes of event tiles in the event list view.
 */
export function adjustEventTileSizesIfNeeded() {
    if (!eventListContainer) {
        console.warn("Event list container not found for adjustEventTileSizesIfNeeded.");
        return;
    }

    // Check if the container is actually visible and has a width
    if (eventListContainer.offsetParent === null || eventListContainer.clientWidth === 0) {
        // console.log("Event list container is not visible or has no width, skipping tile size adjustment.");
        return;
    }

    const containerWidth = eventListContainer.clientWidth;
    const { tileWidth, numCols } = calculateTileLayout(containerWidth, TILE_MIN_WIDTH, TILE_MAX_WIDTH, TILE_GAP);

    // Style the container
    eventListContainer.style.display = 'flex';
    eventListContainer.style.flexWrap = 'wrap';
    eventListContainer.style.gap = `${TILE_GAP}px`;
    // Optional: Add padding to the container itself if desired, or handle via CSS
    // eventListContainer.style.padding = `${TILE_GAP / 2}px`;

    const tiles = eventListContainer.querySelectorAll('.event-tile');
    tiles.forEach(tile => {
        tile.style.width = `${tileWidth}px`;
        // Ensure tiles handle their own padding/border correctly with box-sizing
        tile.style.boxSizing = 'border-box'; 
    });
     // console.log(`Adjusted event tiles: ${numCols} columns, ${tileWidth.toFixed(2)}px width each.`);
}


export function renderAllEventsList(filter = 'upcoming') {
    if (!eventListContainer) {
        console.warn("Event list container not found for renderAllEventsList.");
        return;
    }
    const now = new Date();
    let filtered = [];

    const eventsWithValidDates = allEventsData.map(event => ({
        ...event,
        date: event.date instanceof Date ? event.date : (event.date ? new Date(event.date) : null)
    })).filter(event => event.date && !isNaN(event.date.getTime()));


    try {
        filtered = eventsWithValidDates.filter(event => {
            if (filter === 'upcoming') return event.date >= now;
            if (filter === 'past') return event.date < now;
            return true; 
        });
        filtered.sort((a, b) => {
            return filter === 'past' ? b.date - a.date : a.date - b.date;
        });
    } catch (error) {
        console.error("Error filtering/sorting events:", error, allEventsData);
        eventListContainer.innerHTML = '<p class="error-message">Error loading event list.</p>';
        return;
    }

    if (filtered.length === 0) {
        eventListContainer.innerHTML = `<p class="no-events-message">No ${filter} events found.</p>`;
    } else {
        eventListContainer.innerHTML = filtered.map(event => {
            const dateDisplay = formatEventDateForDisplay(event.date);
            let rsvpText = 'Not RSVP\'d';
            if (event.current_user_rsvp_status === 'attending') rsvpText = 'Attending';
            else if (event.current_user_rsvp_status === 'maybe') rsvpText = 'Maybe';
            else if (event.current_user_rsvp_status === 'declined') rsvpText = 'Declined';
            return `
            <div class="event-tile" data-event-id="${event.id}">
                <h4>${event.title || 'Untitled Event'}</h4>
                <p class="tile-detail">📅 ${dateDisplay}</p>
                <p class="tile-detail">👥 ${event.group_name || 'Unknown Group'}</p>
                <p class="tile-detail">📍 ${event.location || 'TBD'}</p>
                <p class="tile-detail">✔️ ${rsvpText}</p>
            </div>`;
        }).join('');

        if (!eventListContainer._eventTileClickListenerAttached) {
            eventListContainer.addEventListener('click', (e) => {
                const tile = e.target.closest('.event-tile');
                if (tile) {
                    const eventId = tile.dataset.eventId;
                    if (eventId) {
                        const fullEvent = allEventsData.find(evt => String(evt.id) === String(eventId));
                        if (fullEvent) {
                            document.dispatchEvent(new CustomEvent('openEventModalRequest', {
                                detail: { eventData: fullEvent },
                                bubbles: true, composed: true
                            }));
                        } else {
                            console.warn(`Event data not found for ID ${eventId} in allEventsData when clicking event tile.`);
                        }
                    }
                }
            });
            eventListContainer._eventTileClickListenerAttached = true;
        }
    }
    // Adjust tile sizes after rendering content
    adjustEventTileSizesIfNeeded();
}


export async function renderGroupEvents(groupId) {
    if (!eventPanelsContainer || !collageViewport) {
        console.error("Cannot render group events: Event panels container or viewport not found.");
        return;
    }
    if (!groupId) {
        console.warn("renderGroupEvents called without groupId.");
        eventPanelsContainer.innerHTML = '<p class="info-message">Select a group to view events.</p>';
        layoutInstances.forEach(instance => instance.destroy());
        layoutInstances.clear();
        removeOutsideClickListener();
        return;
    }

    eventPanelsContainer.innerHTML = '<div class="loading-indicator">Loading events...</div>';

    try {
        const res = await fetch(`/api/groups/${groupId}/nodes?include=events`);
        if (!res.ok) throw new Error(`Failed to fetch group nodes/events: ${res.status} ${res.statusText}`);
        const groupNodesData = await res.json(); 

        layoutInstances.forEach((instance, nodeEl) => {
            try { instance.destroy(); }
            catch(e) { console.error(`Error destroying layout instance for node ${nodeEl.id}:`, e); }
        });
        layoutInstances.clear();
        eventPanelsContainer.innerHTML = ''; 

        const renderedNodes = {};
        if (groupNodesData.length === 0) {
            // console.log(`[renderGroupEvents] No nodes for group ${groupId}.`);
        }
        groupNodesData.forEach(nodeData => {
            const nodeEl = createNodeElement(nodeData);
            if (nodeEl) {
                eventPanelsContainer.appendChild(nodeEl);
                renderedNodes[nodeData.id] = nodeEl;
            }
        });

        const allGroupEvents = groupNodesData.flatMap(node => node.events || []);

        if (allGroupEvents.length === 0 && groupNodesData.length === 0) {
            eventPanelsContainer.innerHTML = '<p class="info-message">This group has no nodes or events yet.</p>';
        }

        allGroupEvents.forEach(eventDataFromNode => {
            let eventToRender = allEventsData.find(e => String(e.id) === String(eventDataFromNode.id));

            if (eventToRender) {
                eventToRender.date = eventToRender.date instanceof Date ? eventToRender.date : (eventToRender.date ? new Date(eventToRender.date) : null);
            } else {
                console.warn(`[renderGroupEvents] Event ID ${eventDataFromNode.id} from group nodes not found in allEventsData. Using node data as fallback.`);
                eventToRender = {
                    ...eventDataFromNode,
                    date: eventDataFromNode.date ? new Date(eventDataFromNode.date) : null,
                };
            }

            if (eventToRender.date && isNaN(eventToRender.date.getTime())) {
                console.warn(`[renderGroupEvents] Invalid date format for event ID ${eventToRender.id}:`, eventToRender.date);
                eventToRender.date = null;
            }
            const panel = createEventPanel(eventToRender);
            if (panel) {
                eventPanelsContainer.appendChild(panel);
            }
        });

        Object.entries(renderedNodes).forEach(([nodeId, nodeEl]) => {
            const panelsForNode = Array.from(
                eventPanelsContainer.querySelectorAll(`.event-panel[data-snapped-to-node="${nodeId}"]`)
            );
            if (panelsForNode.length > 0) {
                try {
                    const newInstance = new OrbitLayoutManager(nodeEl, panelsForNode);
                    layoutInstances.set(nodeEl, newInstance);
                } catch (error) {
                    console.error(`Error creating OrbitLayoutManager for node ${nodeId}:`, error);
                }
            }
        });

        addOutsideClickListener();

    } catch (error) {
        console.error(`Error rendering group events for group ID ${groupId}:`, error);
        eventPanelsContainer.innerHTML = `<p class="error-message">Could not load events. ${error.message}</p>`;
        layoutInstances.forEach(instance => instance.destroy());
        layoutInstances.clear();
        removeOutsideClickListener();
    }
}

export function renderCalendar(year, month) {
    if (!calendarGridEl || !calendarMonthYearEl) {
        console.error("Calendar grid or month/year element not found.");
        return;
    }
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfPrevMonth = new Date(year, month, 0);
    const lastDayOfCurrentMonth = new Date(year, month + 1, 0);
    const firstDayWeekday = firstDayOfMonth.getDay();
    const numDays = lastDayOfCurrentMonth.getDate();
    const prevMonthDays = lastDayOfPrevMonth.getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);

    calendarMonthYearEl.textContent = `${monthNames[month]} ${year}`;
    calendarGridEl.innerHTML = '';

    const createOtherMonthCellElement = (dayNum) => {
        const cell = document.createElement('div');
        cell.className = "calendar-cell other-month";
        cell.innerHTML = `<span class="day-number">${dayNum}</span><div class="calendar-events-preview-list"></div>`;
        return cell;
    };

    for (let i = 0; i < firstDayWeekday; i++) {
        const dayNum = prevMonthDays - firstDayWeekday + 1 + i;
        calendarGridEl.appendChild(createOtherMonthCellElement(dayNum));
    }

    for (let i = 1; i <= numDays; i++) {
        const currentDate = new Date(year, month, i); currentDate.setHours(0,0,0,0);
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const isToday = currentDate.getTime() === today.getTime();
        const eventsOnThisDay = eventsByDate[dateStr] || []; 

        const cell = document.createElement('div');
        cell.className = "calendar-cell";
        if (isToday) cell.classList.add("today");
        if (eventsOnThisDay.length > 0) cell.classList.add("has-events");
        cell.dataset.date = dateStr;

        const dayNumberEl = document.createElement('span');
        dayNumberEl.className = 'day-number';
        dayNumberEl.textContent = i;
        cell.appendChild(dayNumberEl);

        const previewListContainer = document.createElement('div');
        previewListContainer.className = 'calendar-events-preview-list';

        eventsOnThisDay.forEach((event, j) => { 
            const eventItemEl = document.createElement('div');
            eventItemEl.className = 'calendar-event-item-preview';

            const eventDot = document.createElement('span');
            eventDot.className = 'event-dot';
            eventDot.classList.add(`color-${(j % 6) + 1}`); 

            const eventTitlePreview = document.createElement('span');
            eventTitlePreview.className = 'event-title-preview';
            eventTitlePreview.textContent = event.title || 'Untitled Event';

            eventItemEl.appendChild(eventDot);
            eventItemEl.appendChild(eventTitlePreview);
            eventItemEl.title = `${event.title || 'Untitled Event'} (${event.group_name || 'Personal'})`;

            previewListContainer.appendChild(eventItemEl);
        });
        cell.appendChild(previewListContainer);

        if (eventsOnThisDay.length > OVERFLOW_THRESHOLD) {
            const moreIndicator = document.createElement('div');
            moreIndicator.className = 'more-events-indicator';
            moreIndicator.textContent = `+${eventsOnThisDay.length - OVERFLOW_THRESHOLD} more`;
            cell.appendChild(moreIndicator);
            previewListContainer.classList.add('has-overflow');
        }

        // Always make the day cell clickable so the modal can open even when
        // there are no events (the modal will simply show a "No events" message).
        cell.addEventListener('click', () => {
            // Re‑lookup events at click time in case eventsByDate mutates later.
            const eventsForClick = eventsByDate[dateStr] || [];
            openDayEventsModal(dateStr, eventsForClick);
        });
        calendarGridEl.appendChild(cell);
    }

    const totalCellsRendered = firstDayWeekday + numDays;
    const remainingCells = totalCellsRendered % 7 === 0 ? 0 : 7 - (totalCellsRendered % 7);
    for (let i = 1; i <= remainingCells; i++) {
        calendarGridEl.appendChild(createOtherMonthCellElement(i));
    }

    const totalCellsInGrid = firstDayWeekday + numDays + remainingCells;
    const numRows = Math.ceil(totalCellsInGrid / 7);
    calendarGridEl.style.gridTemplateRows = `repeat(${numRows}, minmax(90px, 1fr))`;
}


// --- Context Menu Logic ---
function createContextMenuElement() {
    if (!contextMenuInstance) {
        contextMenuInstance = document.getElementById('custom-context-menu');
        if (!contextMenuInstance) {
            contextMenuInstance = document.createElement('div');
            contextMenuInstance.id = 'custom-context-menu';
            contextMenuInstance.className = 'context-menu';
            document.body.appendChild(contextMenuInstance);
        }
        contextMenuInstance.addEventListener('mousedown', (e) => {
             e.stopPropagation();
        });
    }
    return contextMenuInstance;
}

async function handleContextAction(label, x, y, id, elementType) {
    const groupId = getActiveGroupId();
    if (!groupId && (label === 'Create Node' || label === 'Create Event on Node')) {
        alert("Please select an active group first."); return;
    }
    const { x: relX, y: relY } = getRelativeCoordsToContainer(x, y);

    try {
        switch (label) {
            // MODIFIED: Call openNodeCreationModal instead of createNodeAt directly
            case 'Create Node': openNodeCreationModal(relX, relY); break;
            // MODIFIED: Call openEventCreationModal (from imported module)
            case 'Create Event on Node':
                if (elementType !== 'event-node') return;
                openEventCreationModal(groupId, id); // Pass groupId and nodeId
                break;
            case 'Rename Event': if (elementType !== 'event-panel') return; await renameEvent(id); break;
            case 'Delete Event': if (elementType !== 'event-panel') return; if(confirm('Are you sure you want to delete this event?')) await deleteEvent(id); break;
            case 'Rename Node': if (elementType !== 'event-node') return; await renameNode(id); break;
            case 'Delete Node': if (elementType !== 'event-node') return; if(confirm('Are you sure you want to delete this node? Associated events will be unassigned.')) await deleteNode(id); break;
            default: console.warn("Unknown context menu action:", label);
        }
    } catch (error) {
        console.error(`Error executing context action "${label}":`, error);
        alert(`Action failed: ${error.message}`);
    }

    // This refresh might still be needed if node/event creation modals don't trigger eventDataUpdated
    // or if a direct render is preferred after modal actions.
    const activeGroupId = getActiveGroupId();
    if (activeGroupId && (label === 'Delete Node' || label === 'Rename Node' || label === 'Delete Event' || label === 'Rename Event')) {
        // Only re-render for actions that don't already cause a refresh via eventDataUpdated or modal close
         await renderGroupEvents(activeGroupId);
    }
}

export function showContextMenu({ x, y, type, id }) {
    const menu = createContextMenuElement();
    menu.innerHTML = '';
    const optionsMap = {
        'event-panel': ['Rename Event', 'Delete Event'],
        'event-node': ['Create Event on Node', 'Rename Node', 'Delete Node'],
        'canvas': ['Create Node']
    };
    const options = optionsMap[type] || [];
    if (options.length === 0) { hideContextMenu(); return; }

    options.forEach(label => {
        const option = document.createElement('div');
        option.className = 'context-menu-option';
        option.textContent = label;
        option.onclick = (e) => { 
            e.stopPropagation(); 
            hideContextMenu(); 
            handleContextAction(label, x, y, id, type);
        };
        menu.appendChild(option);
    });
    menu.style.left = `${x + 2}px`; menu.style.top = `${y + 2}px`; menu.style.display = 'block';

    setTimeout(() => {
        document.addEventListener('click', handleClickOutsideContextMenu, true);
    }, 0);
}

// --- CRUD Actions (Called by Context Menu Handler) ---
async function renameEvent(eventId) {
    const panel = document.querySelector(`.event-panel[data-event-id="${eventId}"]`);
    const currentData = panel?._eventData;
    if (!panel || !currentData) return;
    const newName = prompt('Rename event:', currentData.title);
    if (newName === null || newName.trim() === '' || newName === currentData.title) return;

    const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (csrfTokenMeta) headers['X-CSRFToken'] = csrfTokenMeta.getAttribute('content');

    try {
        const response = await fetch(`/api/events/${eventId}`, { method: 'PATCH', headers: headers, body: JSON.stringify({ title: newName }) });
        if (!response.ok) throw new Error(`Failed to rename event (${response.status})`);
        const updatedEventFromServer = await response.json();

        const plainUpdatedEvent = { ...updatedEventFromServer }; // Create plain object

        document.dispatchEvent(new CustomEvent('eventDataUpdated', {
            detail: { eventId: plainUpdatedEvent.id, updatedEvent: plainUpdatedEvent },
            bubbles: true, composed: true
        }));
    } catch (error) { console.error("Error renaming event:", error); alert(`Rename failed: ${error.message}`); }
}

async function deleteEvent(eventId) {
    const panel = document.querySelector(`.event-panel[data-event-id="${eventId}"]`);
    if (!panel) return;
    const eventDataToDelete = panel._eventData; 

    const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (csrfTokenMeta) headers['X-CSRFToken'] = csrfTokenMeta.getAttribute('content');

    try {
        const response = await fetch(`/api/events/${eventId}`, { method: 'DELETE', headers: headers });
        if (!response.ok) throw new Error(`Failed to delete event (${response.status})`);
        const data = await response.json(); // Expect {"success": true, ...}
        if (data.success) {
            const plainDeletedEventMarker = { 
                ...eventDataToDelete, 
                id: parseInt(eventId, 10),
                _deleted: true 
            };
            const originalGroupId = eventDataToDelete?.group_id;

            document.dispatchEvent(new CustomEvent('eventDataUpdated', {
                detail: { 
                    eventId: parseInt(eventId, 10), 
                    updatedEvent: plainDeletedEventMarker,
                    originalGroupId: originalGroupId 
                }, 
                bubbles: true, composed: true
            }));
        } else { throw new Error(data.message || "Server reported delete failed."); }
    } catch (error) { console.error("Error deleting event:", error); alert(`Delete failed: ${error.message}`); }
}

async function renameNode(nodeId) {
    const nodeEl = document.querySelector(`.event-node[data-node-id="${nodeId}"]`);
    if (!nodeEl) return;
    const currentLabel = nodeEl.textContent || '';
    const newLabel = prompt('Rename node:', currentLabel);
    if (newLabel === null || newLabel.trim() === '' || newLabel === currentLabel) return;

    const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (csrfTokenMeta) headers['X-CSRFToken'] = csrfTokenMeta.getAttribute('content');

    try {
        const response = await fetch(`/api/nodes/${nodeId}`, { method: 'PATCH', headers: headers, body: JSON.stringify({ label: newLabel }) });
        if (!response.ok) throw new Error(`Failed to rename node (${response.status})`);
        // Re-render of group events will be handled by handleContextAction calling renderGroupEvents
    } catch (error) { console.error("Error renaming node:", error); alert(`Rename failed: ${error.message}`); }
}

async function deleteNode(nodeId) {
    const nodeEl = document.querySelector(`.event-node[data-node-id="${nodeId}"]`);
    if (!nodeEl) return;

    const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (csrfTokenMeta) headers['X-CSRFToken'] = csrfTokenMeta.getAttribute('content');

    try {
        const response = await fetch(`/api/nodes/${nodeId}`, { method: 'DELETE', headers: headers });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({error: "Unknown error"}));
            throw new Error(errorData.error || `Failed to delete node (${response.status})`);
        }
        const data = await response.json();
        if (data.success) {
            // Deleting a node unassigns events. renderGroupEvents in handleContextAction will refresh.
            // To ensure allEventsData is also up-to-date regarding unassigned events (node_id -> null),
            // a full reload of all user events might be beneficial, or ensure the PATCH to events (unassigning)
            // also triggers eventDataUpdated for each affected event.
            // For now, relying on renderGroupEvents to fetch latest node/event structure.
        } else { throw new Error(data.message || "Server reported node delete failed."); }
    } catch(error) { console.error("Error deleting node:", error); alert(`Delete failed: ${error.message}`); }
}

// REMOVED createNodeAt - now handled by modal
// REMOVED createEvent - now handled by eventCreationModalManager.js (imported and called by context menu)


function getActiveGroupId() {
    const activeLi = document.querySelector('.group-list-area ul .group-item.active');
    return activeLi?.dataset.groupId;
}

function getRelativeCoordsToContainer(pageX, pageY) {
    if (!eventPanelsContainer) return { x: 0, y: 0 };
    const rect = eventPanelsContainer.getBoundingClientRect();
    let transformState = { panX: 0, panY: 0, scale: 1 };
    try { transformState = getTransformState(); }
    catch(e) { const style = window.getComputedStyle(eventPanelsContainer); try { const matrix = new DOMMatrixReadOnly(style.transform); transformState = { panX: matrix.m41, panY: matrix.m42, scale: matrix.a }; } catch { /* fallback */ } }
    const { panX, panY, scale } = transformState;
    const mouseX_rel_viewport = pageX - rect.left;
    const mouseY_rel_viewport = pageY - rect.top;
    const relX = (mouseX_rel_viewport - panX) / scale;
    const relY = (mouseY_rel_viewport - panY) / scale;
    return { x: relX, y: relY };
}


// --- Outside Click Handling ---
let isOutsideClickListenerActive = false;

function handleOutsideClick(event) {
    const clickedPanel = event.target.closest('.event-panel');
    const clickedNode = event.target.closest('.event-node');
    // Context menu "click outside" is now handled by its own dynamic listener

    if (!clickedPanel && !clickedNode) {
        layoutInstances.forEach(instance => {
            instance.unclickActivePanel();
        });
    }
}

function addOutsideClickListener() {
    if (!isOutsideClickListenerActive && collageViewport) {
        document.addEventListener('mousedown', handleOutsideClick, { capture: false });
        isOutsideClickListenerActive = true;
    }
}

function removeOutsideClickListener() {
    if (isOutsideClickListenerActive) {
        document.removeEventListener('mousedown', handleOutsideClick, { capture: false });
        isOutsideClickListenerActive = false;
    }
}
// --- END OF FILE static/js/eventRenderer.js ---