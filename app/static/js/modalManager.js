// --- START OF FILE modalManager.js ---

// --- Date Formatting Helper ---
function formatEventDateForDisplay(date) {
    if (!date || !(date instanceof Date)) return 'Date not specified';
    try {
        if (isNaN(date.getTime())) return 'Invalid Date';
        return date.toLocaleString(undefined, {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true
        });
    } catch (e) { console.error("Error formatting date:", date, e); return 'Error displaying date'; }
}

// --- Cost Parsing and Formatting Helper ---
function parseAndFormatCost(inputText) {
    const text = String(inputText || '').trim();
    let original_input_text = text;
    let cost_display_standardized = text;
    let cost_value = null;
    const lowerText = text.toLowerCase();
    const freeKeywords = ['free', 'free entry', 'no cost', '0', '0.0', '0.00'];
    const donationKeywords = ['donation', 'by donation', 'donations welcome', 'pay what you can', 'pwyc'];
    const otherSpecialKeywords = { 'varies': 'Varies', 'tbd': 'TBD', 'contact for price': 'Contact for Price', 'see description': 'See Description' };
    if (freeKeywords.includes(lowerText)) { cost_display_standardized = 'Free'; cost_value = 0.0; }
    else if (donationKeywords.includes(lowerText)) { cost_display_standardized = 'By Donation'; cost_value = null; }
    else if (otherSpecialKeywords[lowerText]) { cost_display_standardized = otherSpecialKeywords[lowerText]; cost_value = null; }
    else {
        let numericString = lowerText.replace(/(usd|eur|gbp|jpy|aud|cad)/gi, '').replace(/\s*(per person|pp)\s*/gi, '').replace(/[$,€£¥₹]/g, '');
        const centsMatch = numericString.match(/^(\d+)\s*(c|cent|cents)$/);
        let potentialNumber;
        if (centsMatch) { const cents = parseInt(centsMatch[1], 10); if (!isNaN(cents)) potentialNumber = cents / 100.0; }
        else { potentialNumber = parseFloat(numericString.replace(/,/g, '')); }
        if (!isNaN(potentialNumber) && potentialNumber !== null) { cost_value = potentialNumber; cost_display_standardized = cost_value === 0 ? 'Free' : `$${cost_value.toFixed(2)}`; }
        else { cost_display_standardized = original_input_text; cost_value = null; }
    }
    return { original_input_text, cost_display_standardized, cost_value };
}

// --- Location Options & Map Configuration ---
// AVAILABLE_LOCATIONS is now primarily for matching saved keys or initial display, not for quick jumps in this version.
const AVAILABLE_LOCATIONS_DATA = [
    { key: "online", text: "Online Event", mapQuery: null },
    { key: "main_hall", text: "Main Hall", mapQuery: "Main Hall, 123 Event Street, Anytown, USA" },
    { key: "conference_room_a", text: "Conference Room A", mapQuery: "Conference Room A, Business Center, Anytown, USA" },
    { key: "community_center_room_101", text: "Community Center Room 101", mapQuery: "Anytown Community Center" },
    { key: "outdoor_park_stage", text: "Outdoor Park Stage", mapQuery: "Central Park Stage, Anytown, USA" },
    { key: "tbd_location", text: "Location TBD", mapQuery: null },
];
const NOMINATIM_REVERSE_GEOCODE_URL = "https://nominatim.openstreetmap.org/reverse?format=jsonv2";
const NOMINATIM_FORWARD_GEOCODE_URL = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1";
const DEFAULT_MAP_CENTER = [20, 0];
const DEFAULT_MAP_ZOOM = 2;
const FOCUSED_MAP_ZOOM = 13;


let modalElement, modalContent, closeButton, modalEventImage, modalEventTitle,
    modalGroupName, modalEventDate, modalEventLocation, modalEventCost,
    modalEventDescription, modalDescriptionWrapper,
    modalRsvpControls, rsvpButtons = [], rsvpConfirmationMessage,
    clearRsvpButton, modalAttendeeList, modalAttendeeCount, attendeeListContainer,
    attendeeListMessage, attendeeLoadingIndicator;

let currentEventId = null;
let isInitialized = false;
let activeEditField = null;
let geocodeTimeout = null;


function _initializeModalElements() { /* ... (same) ... */
    modalElement = document.getElementById('event-details-modal');
    if (!modalElement) { console.error("Modal element (#event-details-modal) not found!"); return false; }
    modalContent = modalElement.querySelector('.modal-content');
    closeButton = modalElement.querySelector('.modal-close-btn');
    modalEventImage = modalElement.querySelector('#modal-event-image-header');
    modalEventTitle = modalElement.querySelector('#modal-event-title');
    modalGroupName = modalElement.querySelector('#modal-group-name');
    modalEventDate = modalElement.querySelector('#modal-event-date');
    modalEventLocation = modalElement.querySelector('#modal-event-location');
    modalEventCost = modalElement.querySelector('#modal-event-cost');
    modalDescriptionWrapper = modalElement.querySelector('#modal-description-wrapper');
    modalEventDescription = modalElement.querySelector('#modal-event-description');
    modalRsvpControls = modalElement.querySelector('#modal-rsvp-controls');
    rsvpButtons = modalRsvpControls ? Array.from(modalRsvpControls.querySelectorAll('.rsvp-btn')) : [];
    rsvpConfirmationMessage = modalElement.querySelector('#rsvp-confirmation-message');
    clearRsvpButton = modalRsvpControls ? modalRsvpControls.querySelector('.rsvp-btn.rsvp-remove') : null;
    modalAttendeeList = modalElement.querySelector('#modal-attendee-list');
    modalAttendeeCount = modalElement.querySelector('#modal-attendee-count');
    attendeeListContainer = modalElement.querySelector('.attendee-list-container');
    attendeeListMessage = modalElement.querySelector('#attendee-list-message');
    attendeeLoadingIndicator = modalElement.querySelector('#attendee-loading-indicator');
    if (!modalContent || !closeButton || !modalEventTitle || !modalDescriptionWrapper || !modalEventDescription) {
        console.error("One or more essential modal sub-elements not found!"); return false;
    }
    isInitialized = true;
    return true;
}

function _resetModal() { /* ... (same) ... */
    if (!isInitialized) return;
    if (activeEditField && activeEditField.cancelChanges) activeEditField.cancelChanges(true);
    activeEditField = null;
    const editableFields = modalElement.querySelectorAll('.editable-field');
    editableFields.forEach(field => {
        const contentDisplayElId = field.dataset.contentDisplayElementId;
        const contentDisplayEl = contentDisplayElId ? document.getElementById(contentDisplayElId) : field;
        const originalContent = field.dataset.originalContentForReset || '';
        const isHTML = field.dataset.originalDisplayIsHtml === 'true';
        if (isHTML) { contentDisplayEl.innerHTML = originalContent; }
        else { contentDisplayEl.textContent = originalContent; }
        if (field !== contentDisplayEl && !field.contains(contentDisplayEl)) { field.innerHTML = ''; field.appendChild(contentDisplayEl); }
        field.classList.remove('is-editing-field', 'editable-field');
        if (field.clickHandler) { field.removeEventListener('click', field.clickHandler); delete field.clickHandler; }
        delete field.dataset.isEditing; delete field.dataset.editMode; delete field.dataset.originalContentForReset;
        delete field.dataset.originalDisplayIsHtml; delete field.dataset.inputType; delete field.dataset.contentDisplayElementId;
        delete field.dataset.currentDisplayValue; delete field.dataset.currentNumericValue; delete field.dataset.currentDataValue;
        delete field.dataset.currentCoordinates; delete field.dataset.currentPredefinedKey;
    });
    if (modalEventImage) modalEventImage.src = '/static/img/default-event-logo.png';
    if (modalEventTitle) modalEventTitle.textContent = 'Loading...';
    if (modalGroupName) modalGroupName.textContent = 'Loading...';
    if (modalEventDate) modalEventDate.textContent = 'Loading...';
    if (modalEventLocation) modalEventLocation.textContent = 'Loading...';
    if (modalEventCost) modalEventCost.textContent = 'Loading...';
    if (modalEventDescription) modalEventDescription.innerHTML = 'Loading...';
    if (modalRsvpControls) modalRsvpControls.dataset.eventId = '';
    if (modalAttendeeList) modalAttendeeList.innerHTML = '';
    if (modalAttendeeCount) modalAttendeeCount.textContent = '0';
    if (attendeeListMessage) attendeeListMessage.style.display = 'none';
    if (attendeeLoadingIndicator) attendeeLoadingIndicator.style.display = 'none';
    if (rsvpConfirmationMessage) { rsvpConfirmationMessage.style.display = 'none'; rsvpConfirmationMessage.textContent = ''; rsvpConfirmationMessage.style.color = ''; }
    _updateRSVPButtonState(null);
    currentEventId = null;
}

function _populateAttendeeList(attendees = []) { /* ... (same) ... */
    if (!isInitialized || !modalAttendeeList || !attendeeListContainer || !attendeeListMessage || !modalAttendeeCount) return;
    modalAttendeeList.innerHTML = '';
    modalAttendeeCount.textContent = attendees.length;
    if (attendees.length === 0) {
        attendeeListMessage.textContent = 'No one has RSVP\'d yet.';
        attendeeListMessage.style.display = 'block';
        attendeeListContainer.style.display = 'none';
    } else {
        attendeeListMessage.style.display = 'none';
        attendeeListContainer.style.display = 'block';
        attendees.forEach(attendee => {
            const li = document.createElement('li');
            const status = attendee.status?.toLowerCase() || 'unknown';
            const displayName = attendee.username || 'Guest User';
            li.innerHTML = `
                <img src="${attendee.avatar_url || '/static/img/default-avatar.png'}" alt="${displayName} Avatar" class="attendee-avatar">
                <span class="attendee-name" title="${displayName}">${displayName}</span>
                <span class="status-pill status-${status}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>
            `;
            modalAttendeeList.appendChild(li);
        });
    }
}

function _updateRSVPButtonState(status) { /* ... (same) ... */
    if (!isInitialized || !rsvpButtons || rsvpButtons.length === 0) return;
    const normalizedStatus = status?.toLowerCase();
    rsvpButtons.forEach(btn => btn.setAttribute('aria-pressed', 'false'));
    if (normalizedStatus && ['attending', 'maybe', 'declined'].includes(normalizedStatus)) {
        const activeButton = modalRsvpControls?.querySelector(`.rsvp-btn[data-status="${normalizedStatus}"]`);
        if (activeButton) activeButton.setAttribute('aria-pressed', 'true');
        if (clearRsvpButton) clearRsvpButton.style.display = 'inline-flex';
    } else {
        if (clearRsvpButton) clearRsvpButton.style.display = 'none';
    }
}
async function _fetchEventDetails(eventId) { /* ... (same) ... */
    if (!isInitialized || !attendeeLoadingIndicator || !attendeeListMessage || !attendeeListContainer || !modalRsvpControls) return;
    attendeeLoadingIndicator.style.display = 'block';
    attendeeListMessage.style.display = 'none';
    attendeeListContainer.style.display = 'none';
    modalRsvpControls.style.pointerEvents = 'none';
    modalRsvpControls.style.opacity = '0.6';
    try {
        const [attendeesRes, myRsvpRes] = await Promise.all([
            fetch(`/api/events/${eventId}/attendees`),
            fetch(`/api/events/${eventId}/my-rsvp`)
        ]);
        if (!attendeesRes.ok || !myRsvpRes.ok) {
             throw new Error(`Failed to fetch details (${attendeesRes.status}/${myRsvpRes.status})`);
        }
        const attendees = await attendeesRes.json();
        const myRsvp = await myRsvpRes.json();
        _populateAttendeeList(attendees);
        _updateRSVPButtonState(myRsvp.status);
    } catch (error) {
        console.error("Error fetching event details:", error);
        if (attendeeListMessage) {
            attendeeListMessage.textContent = `Error loading details: ${error.message}`;
            attendeeListMessage.style.display = 'block';
        }
        _updateRSVPButtonState(null);
    } finally {
        if (attendeeLoadingIndicator) attendeeLoadingIndicator.style.display = 'none';
        if (modalRsvpControls) {
            modalRsvpControls.style.pointerEvents = 'auto';
            modalRsvpControls.style.opacity = '1';
        }
    }
}

// --- EDITABLE FIELD LOGIC ---
function _makeFieldEditable(targetElement, apiFieldNameOrMode, initialData, config = {}) {
    if (!targetElement || targetElement.dataset.isEditing === 'true') return;

    const inputType = config.inputType || 'text';
    const originalDisplayIsHTML = config.isHTML || false;
    const contentDisplayElement = config.contentDisplayElementId
        ? document.getElementById(config.contentDisplayElementId)
        : targetElement;

    if (!contentDisplayElement) { console.error("Content display element not found for", targetElement, config); return; }

    targetElement.classList.add('editable-field');
    targetElement.dataset.editMode = apiFieldNameOrMode;
    targetElement.dataset.originalDisplayIsHtml = originalDisplayIsHTML.toString();
    targetElement.dataset.inputType = inputType;
    if (config.contentDisplayElementId) {
        targetElement.dataset.contentDisplayElementId = config.contentDisplayElementId;
    }

    if (apiFieldNameOrMode === 'cost') {
        targetElement.dataset.originalContentForReset = initialData.standardized_display || '';
        targetElement.dataset.currentDisplayValue = initialData.raw_input_for_field || '';
        targetElement.dataset.currentNumericValue = initialData.value === null || initialData.value === undefined ? '' : String(initialData.value);
    } else if (apiFieldNameOrMode === 'location') {
        targetElement.dataset.originalContentForReset = initialData.text || 'Not specified';
        if (initialData.coordinates) targetElement.dataset.currentCoordinates = initialData.coordinates;
        if (initialData.predefinedKey) targetElement.dataset.currentPredefinedKey = initialData.predefinedKey;
    } else {
        const initialTextOrHTML = originalDisplayIsHTML ? contentDisplayElement.innerHTML : contentDisplayElement.textContent;
        targetElement.dataset.originalContentForReset = initialTextOrHTML;
        targetElement.dataset.currentDataValue = (apiFieldNameOrMode === 'date' && initialData && !isNaN(new Date(initialData).getTime()))
            ? new Date(initialData).toISOString() : String(initialData || '');
    }

    const handleClickToEdit = (e) => {
        if (targetElement.dataset.isEditing === 'true' || !currentEventId) return;
        if (e.target.closest('.edit-action-button') || e.target.closest('.cost-interpretation-helper') || e.target.closest('.location-map-floating-panel')) return;

        if (activeEditField && activeEditField.target !== targetElement) {
            if (!activeEditField.cancelChanges(true)) { return; }
        }

        targetElement.classList.add('is-editing-field');
        targetElement.dataset.isEditing = 'true';

        const originalStaticDisplayForCancel = targetElement.dataset.originalContentForReset;
        let initialInputFieldValue = originalStaticDisplayForCancel;

        let currentEditMode = targetElement.dataset.editMode;
        let costInterpretationHelper = null;
        let locationMapFloatingPanel = null; // The floating div for the map
        let locationMapController = null;    // Holds map logic
        let inputElementForDirtyCheckAndSave; // The primary input for the field
        
        const inputWrapper = document.createElement('div'); // General wrapper for input and actions
        inputWrapper.className = 'editable-input-wrapper';

        if (currentEditMode === 'cost') {
            initialInputFieldValue = targetElement.dataset.currentDisplayValue;
            costInterpretationHelper = document.createElement('div');
            /* ... cost helper setup ... */
            costInterpretationHelper.id = 'cost-interpretation-helper-dynamic';
            costInterpretationHelper.className = 'cost-interpretation-helper';
            document.body.appendChild(costInterpretationHelper);

            const costInput = document.createElement('input');
            costInput.type = 'text';
            costInput.className = 'editable-input editable-cost-input';
            costInput.value = initialInputFieldValue;
            inputWrapper.appendChild(costInput); // costInput is inside inputWrapper
            inputElementForDirtyCheckAndSave = costInput;
            
            targetElement.innerHTML = ''; // Clear static text from targetElement
            targetElement.appendChild(inputWrapper); // Put inputWrapper (with input) into targetElement

            if (costInterpretationHelper) { /* ... (cost interpreter logic) ... */
                const updateCostInterpretation = () => {
                    const parsed = parseAndFormatCost(costInput.value);
                    let numericValDisplay = parsed.cost_value === null || parsed.cost_value === undefined ? '<em>Not set</em>' : String(parsed.cost_value);
                    if (typeof parsed.cost_value === 'number') numericValDisplay = `<strong>${parsed.cost_value.toFixed(2)}</strong>`;
                    costInterpretationHelper.innerHTML = `Interpreted: Display as "<strong>${parsed.cost_display_standardized}</strong>", Value as ${numericValDisplay}`;
                    const targetRect = targetElement.getBoundingClientRect();
                    costInterpretationHelper.style.position = 'absolute'; costInterpretationHelper.style.boxSizing = 'border-box';
                    costInterpretationHelper.style.left = `${targetRect.left + window.pageXOffset}px`;
                    costInterpretationHelper.style.top = `${targetRect.bottom + window.pageYOffset + 20}px`;
                    costInterpretationHelper.style.width = `${targetRect.width}px`;
                    costInterpretationHelper.classList.add('visible');
                };
                costInput.addEventListener('input', updateCostInterpretation); costInput.addEventListener('focus', updateCostInterpretation);
                requestAnimationFrame(updateCostInterpretation);
            }
        } else if (currentEditMode === 'location') {
            // `targetElement` itself will get the text input
            targetElement.innerHTML = ''; // Clear static text
            const locationTextInput = document.createElement('input');
            locationTextInput.type = 'text';
            locationTextInput.className = 'editable-input location-text-input-main'; // Class for styling
            locationTextInput.value = initialInputFieldValue; // From originalContentForReset
            inputWrapper.appendChild(locationTextInput); // Text input is inside inputWrapper
            targetElement.appendChild(inputWrapper); // inputWrapper (with text input) goes into targetElement
            inputElementForDirtyCheckAndSave = locationTextInput;

            // Create the separate floating panel for the map
            locationMapFloatingPanel = document.createElement('div');
            locationMapFloatingPanel.className = 'location-map-floating-panel'; // For styling

            const mapContainer = document.createElement('div');
            mapContainer.id = `leaflet-map-container-${Date.now()}`;
            mapContainer.style.height = '250px'; mapContainer.style.width = '100%';
            locationMapFloatingPanel.appendChild(mapContainer);

            const mapStatusElement = document.createElement('small');
            mapStatusElement.className = 'map-status-text';
            mapStatusElement.innerHTML = 'Initializing map... <span style="float:right;">© OpenStreetMap contributors</span>';
            locationMapFloatingPanel.appendChild(mapStatusElement);

            document.body.appendChild(locationMapFloatingPanel); // Add floating panel to body

            locationMapController = {
                mapContainer, statusElement: mapStatusElement, map: null, marker: null,
                // currentText, currentCoords, currentKey will be managed by interaction with locationTextInput and map
                currentCoords: targetElement.dataset.currentCoordinates || null, // Initial coords for map
                currentKey: targetElement.dataset.currentPredefinedKey || null,    // Initial key
                // locationTextInput is inputElementForDirtyCheckAndSave
            };
            
            // Style and position the floating map panel
            locationMapFloatingPanel.style.position = 'absolute';
            locationMapFloatingPanel.style.zIndex = '1050'; // Below cost helper if both open
            locationMapFloatingPanel.style.backgroundColor = '#fff';
            locationMapFloatingPanel.style.border = '1px solid #ccc';
            locationMapFloatingPanel.style.padding = '10px';
            locationMapFloatingPanel.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
            const textInputRect = locationTextInput.getBoundingClientRect(); // Position below the text input
            locationMapFloatingPanel.style.left = `${textInputRect.left + window.pageXOffset}px`;
            locationMapFloatingPanel.style.top = `${textInputRect.bottom + window.pageYOffset + 20}px`;
            locationMapFloatingPanel.style.width = `${Math.max(textInputRect.width, 350)}px`; // Min width

            setTimeout(() => { // Initialize Leaflet Map
                try {
                    let initialLat = DEFAULT_MAP_CENTER[0], initialLon = DEFAULT_MAP_CENTER[1], initialZoom = DEFAULT_MAP_ZOOM;
                    if (locationMapController.currentCoords) {
                        const [lat, lon] = locationMapController.currentCoords.split(',').map(parseFloat);
                        if (!isNaN(lat) && !isNaN(lon)) { initialLat = lat; initialLon = lon; initialZoom = FOCUSED_MAP_ZOOM; }
                    }
                    locationMapController.map = L.map(locationMapController.mapContainer.id).setView([initialLat, initialLon], initialZoom);
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '' }).addTo(locationMapController.map);
                    locationMapController.marker = L.marker([initialLat, initialLon], { draggable: true }).addTo(locationMapController.map);
                    locationMapController.statusElement.innerHTML = 'Map ready. Type in field above, click map, or drag marker. <span style="float:right;">© OSM</span>';
                    
                    const updateLocationFromMapInteraction = async (latlng) => {
                        locationMapController.marker.setLatLng(latlng);
                        locationMapController.map.panTo(latlng);
                        locationMapController.statusElement.innerHTML = `Fetching address... <span style="float:right;">© OSM</span>`;
                        locationMapController.currentKey = null; // Custom interaction

                        clearTimeout(geocodeTimeout);
                        geocodeTimeout = setTimeout(async () => {
                            try {
                                const response = await fetch(`${NOMINATIM_REVERSE_GEOCODE_URL}&lat=${latlng.lat}&lon=${latlng.lng}`);
                                if (!response.ok) throw new Error(`Nominatim error: ${response.status}`);
                                const data = await response.json();
                                const displayName = data.display_name || `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
                                
                                inputElementForDirtyCheckAndSave.value = displayName; // Update the text input
                                locationMapController.currentCoords = `${latlng.lat},${latlng.lng}`;
                                locationMapController.statusElement.innerHTML = `Selected: ${displayName.substring(0, 50)}... <span style="float:right;">© OSM</span>`;
                            } catch (err) { console.error("Reverse geocoding error:", err); locationMapController.statusElement.innerHTML = `Error fetching address. <span style="float:right;">© OSM</span>`; }
                        }, 1000);
                    };
                    locationMapController.map.on('click', (e) => updateLocationFromMapInteraction(e.latlng));
                    locationMapController.marker.on('dragend', (e) => updateLocationFromMapInteraction(e.target.getLatLng()));

                    const searchLocationOnMapFromTextInput = async (query) => {
                        if (!query || !query.trim()) return;
                        locationMapController.statusElement.innerHTML = `Searching for "${query}"... <span style="float:right;">© OSM</span>`;
                        locationMapController.currentKey = null; // Manual search clears predefined key

                        clearTimeout(geocodeTimeout);
                        geocodeTimeout = setTimeout(async () => {
                            try {
                                const response = await fetch(`${NOMINATIM_FORWARD_GEOCODE_URL}&q=${encodeURIComponent(query)}`);
                                if (!response.ok) throw new Error(`Nominatim error: ${response.status}`);
                                const data = await response.json();
                                if (data && data.length > 0) {
                                    const { lat, lon, display_name } = data[0];
                                    const newLatLng = L.latLng(parseFloat(lat), parseFloat(lon));
                                    locationMapController.map.setView(newLatLng, FOCUSED_MAP_ZOOM);
                                    locationMapController.marker.setLatLng(newLatLng);
                                    locationMapController.currentCoords = `${newLatLng.lat},${newLatLng.lng}`;
                                    // DO NOT update inputElementForDirtyCheckAndSave.value here, as user is typing.
                                    // Let user confirm by saving, or map click updates it.
                                    locationMapController.statusElement.innerHTML = `Map centered on: ${display_name.substring(0,50)}... <span style="float:right;">© OSM</span>`;
                                } else {
                                    locationMapController.statusElement.innerHTML = `No map results for "${query}". <span style="float:right;">© OSM</span>`;
                                }
                            } catch (err) { console.error("Forward geocoding error:", err); locationMapController.statusElement.innerHTML = `Error searching. <span style="float:right;">© OSM</span>`; }
                        }, 1000);
                    };
                    inputElementForDirtyCheckAndSave.addEventListener('input', () => {
                        searchLocationOnMapFromTextInput(inputElementForDirtyCheckAndSave.value);
                    });

                    // Initial map centering based on existing data (if any, beyond default coords)
                    if (locationMapController.currentKey && !locationMapController.currentCoords) {
                        const pDef = AVAILABLE_LOCATIONS_DATA.find(l => l.key === locationMapController.currentKey);
                        if (pDef && pDef.mapQuery) {
                           searchLocationOnMapFromTextInput(pDef.mapQuery);
                        }
                    } else if (!locationMapController.currentCoords && inputElementForDirtyCheckAndSave.value.trim() !== '' && inputElementForDirtyCheckAndSave.value !== 'Not specified') {
                        searchLocationOnMapFromTextInput(inputElementForDirtyCheckAndSave.value);
                    }

                } catch (mapError) { console.error("Leaflet map init error:", mapError); if(locationMapController) locationMapController.statusElement.innerHTML = `Error initializing map. <span style="float:right;">© OSM</span>`; }
            }, 0);
        } else { // For other input types like 'text' (title), 'textarea', 'datetime-local'
            let genericInput;
            if (inputType === 'textarea') {
                genericInput = document.createElement('textarea');
                genericInput.value = initialInputFieldValue;
            } else if (inputType === 'datetime-local') {
                genericInput = document.createElement('input');
                genericInput.type = 'datetime-local';
                const dateVal = targetElement.dataset.currentDataValue;
                genericInput.value = (dateVal && !isNaN(new Date(dateVal).getTime()))
                    ? new Date(new Date(dateVal).getTime() - new Date(dateVal).getTimezoneOffset() * 60000).toISOString().slice(0,16)
                    : '';
                initialInputFieldValue = genericInput.value;
            } else {
                genericInput = document.createElement('input');
                genericInput.type = 'text';
                genericInput.value = initialInputFieldValue;
            }
            genericInput.classList.add('editable-input');
            inputWrapper.appendChild(genericInput); // input is inside inputWrapper
            inputElementForDirtyCheckAndSave = genericInput;
            
            targetElement.innerHTML = ''; // Clear static text from targetElement
            targetElement.appendChild(inputWrapper); // Put inputWrapper (with input) into targetElement
        }

        // Action buttons (Save/Cancel) are appended to inputWrapper
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'editable-actions-container';
        actionsContainer.style.marginTop = '10px';
        const saveBtn = document.createElement('button');
        saveBtn.innerHTML = '✔'; saveBtn.className = 'edit-action-button edit-save-btn'; saveBtn.title = 'Save';
        const cancelBtn = document.createElement('button');
        cancelBtn.innerHTML = '✖'; cancelBtn.className = 'edit-action-button edit-cancel-btn'; cancelBtn.title = 'Cancel (no prompt for this field)';
        actionsContainer.appendChild(saveBtn); actionsContainer.appendChild(cancelBtn);
        inputWrapper.appendChild(actionsContainer);
        
        if (inputElementForDirtyCheckAndSave) {
            inputElementForDirtyCheckAndSave.focus();
            if (inputElementForDirtyCheckAndSave.setSelectionRange && inputElementForDirtyCheckAndSave.type !== 'datetime-local') {
                // For location, the input is directly in target, no need to select all.
                // For others, this is fine.
                if (currentEditMode !== 'location') {
                    inputElementForDirtyCheckAndSave.setSelectionRange(inputElementForDirtyCheckAndSave.value.length, inputElementForDirtyCheckAndSave.value.length);
                }
            }
        }

        const handleDocumentClick = (event) => {
            const clickedInsideEditorItself = targetElement.contains(event.target); // Check if click is in the original target field (which now holds the input)
            const clickedInsideFloatingMap = locationMapFloatingPanel && locationMapFloatingPanel.contains(event.target);
            const clickedInsideCostHelper = costInterpretationHelper && costInterpretationHelper.contains(event.target);

            if (!clickedInsideEditorItself && !clickedInsideFloatingMap && !clickedInsideCostHelper) {
                cancelChanges(true);
            }
        };

        const exitEditMode = (savedDataFromServer) => {
            document.removeEventListener('click', handleDocumentClick, true);
            if (costInterpretationHelper) costInterpretationHelper.remove();
            if (locationMapFloatingPanel) { // This is the floating map panel
                if (locationMapController && locationMapController.map) locationMapController.map.remove();
                locationMapFloatingPanel.remove();
            }
            
            // For all fields, clear the targetElement (which contained the inputWrapper or was the input itself for location)
            targetElement.innerHTML = '';

            const isHTML = targetElement.dataset.originalDisplayIsHtml === 'true';
            let finalDisplayToShow;

            if (savedDataFromServer) {
                if (currentEditMode === 'cost') { /* ... (same data update logic) ... */
                    finalDisplayToShow = savedDataFromServer.cost_display || '';
                    targetElement.dataset.currentDisplayValue = savedDataFromServer.original_input_text || inputElementForDirtyCheckAndSave.value;
                    targetElement.dataset.currentNumericValue = savedDataFromServer.cost_value === null || savedDataFromServer.cost_value === undefined ? '' : String(savedDataFromServer.cost_value);
                } else if (currentEditMode === 'date') { /* ... (same) ... */
                    finalDisplayToShow = formatEventDateForDisplay(new Date(savedDataFromServer.date));
                    targetElement.dataset.currentDataValue = savedDataFromServer.date;
                } else if (currentEditMode === 'location') {
                    finalDisplayToShow = savedDataFromServer.location || 'Not specified';
                    targetElement.dataset.originalContentForReset = finalDisplayToShow;
                    if (savedDataFromServer.location_coordinates) targetElement.dataset.currentCoordinates = savedDataFromServer.location_coordinates;
                    else delete targetElement.dataset.currentCoordinates;
                    if (savedDataFromServer.location_key) targetElement.dataset.currentPredefinedKey = savedDataFromServer.location_key;
                    else delete targetElement.dataset.currentPredefinedKey;
                } else if (currentEditMode === 'description') { /* ... (same) ... */
                    finalDisplayToShow = savedDataFromServer.description || '';
                } else { /* ... (title, etc. - same) ... */
                    finalDisplayToShow = savedDataFromServer[currentEditMode] || '';
                    targetElement.dataset.currentDataValue = finalDisplayToShow;
                }
                // Update originalContentForReset for all fields based on what was saved
                targetElement.dataset.originalContentForReset = finalDisplayToShow;
            } else { // Edit was cancelled
                finalDisplayToShow = originalStaticDisplayForCancel;
            }

            // Restore static display IN the original targetElement (or its designated contentDisplayElement if different)
            if (isHTML || currentEditMode === 'description') contentDisplayElement.innerHTML = finalDisplayToShow;
            else contentDisplayElement.textContent = finalDisplayToShow;
            
            // If contentDisplayElement was a sub-element and targetElement was just a wrapper, re-add it.
            // However, in this new setup, targetElement is usually the direct display or becomes the input.
            if (targetElement !== contentDisplayElement && !targetElement.contains(contentDisplayElement)) {
                 targetElement.appendChild(contentDisplayElement);
            }

            targetElement.classList.remove('is-editing-field');
            delete targetElement.dataset.isEditing;
            activeEditField = null;
        };

        const cancelChanges = (force = false) => {
            const currentInputValue = inputElementForDirtyCheckAndSave.value;
            const isDirty = currentInputValue !== initialInputFieldValue;
            if (!force && isDirty) {
                if (!window.confirm("You have unsaved changes. Are you sure you want to discard them?")) {
                    if(inputElementForDirtyCheckAndSave) inputElementForDirtyCheckAndSave.focus();
                    return false;
                }
            }
            exitEditMode(null);
            return true;
        };

        activeEditField = { target: targetElement, cancelChanges, inputElement: inputElementForDirtyCheckAndSave, costInterpretationHelper, locationMapFloatingPanel, locationMapController };
        setTimeout(() => document.addEventListener('click', handleDocumentClick, true), 0);

        saveBtn.onclick = async () => {
            let payload = {};
            if (currentEditMode === 'cost') { /* ... (payload from inputElementForDirtyCheckAndSave) ... */
                const parsedForSave = parseAndFormatCost(inputElementForDirtyCheckAndSave.value);
                payload.cost_display = parsedForSave.cost_display_standardized; payload.cost_value = parsedForSave.cost_value;
                payload.original_input_text = inputElementForDirtyCheckAndSave.value;
            } else if (currentEditMode === 'date') { /* ... (payload from inputElementForDirtyCheckAndSave) ... */
                if (!inputElementForDirtyCheckAndSave.value) { payload.date = null; }
                else { try { payload.date = new Date(inputElementForDirtyCheckAndSave.value).toISOString(); }
                    catch (err) { inputElementForDirtyCheckAndSave.classList.add('input-error-glow'); setTimeout(() => inputElementForDirtyCheckAndSave.classList.remove('input-error-glow'), 2000); return; }
                }
            } else if (currentEditMode === 'location') {
                payload.location = inputElementForDirtyCheckAndSave.value; // Text from the main input field
                payload.location_coordinates = locationMapController.currentCoords; // Coords from map interaction
                payload.location_key = locationMapController.currentKey;

            } else { /* ... (payload from inputElementForDirtyCheckAndSave) ... */
                payload[currentEditMode] = inputElementForDirtyCheckAndSave.value;
            }
            saveBtn.classList.add('is-loading'); saveBtn.innerHTML = ''; saveBtn.disabled = true; cancelBtn.disabled = true;
            try {
                // **** START CSRF TOKEN HANDLING ****
                const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
                let csrfToken = null;
                if (csrfTokenMeta) {
                    csrfToken = csrfTokenMeta.getAttribute('content');
                } else {
                    console.warn('CSRF token meta tag not found. PATCH request might fail.');
                }

                const requestHeaders = {
                    'Content-Type': 'application/json'
                };
                if (csrfToken) {
                    requestHeaders['X-CSRFToken'] = csrfToken;
                }
                // **** END CSRF TOKEN HANDLING ****

                const response = await fetch(`/api/events/${currentEventId}`, {
                    method: 'PATCH',
                    headers: requestHeaders, // Use the updated headers
                    body: JSON.stringify(payload)
                });
                if (!response.ok) { const errData = await response.json().catch(()=>({})); throw new Error(errData.detail || `Update failed (${response.status})`);}
                const updatedEventDataFromServer = await response.json();
                exitEditMode(updatedEventDataFromServer);
                document.dispatchEvent(new CustomEvent('eventDataUpdated', { detail: { eventId: currentEventId, field: currentEditMode, value: updatedEventDataFromServer[currentEditMode], fullEvent: updatedEventDataFromServer }, bubbles: true, composed: true }));
            } catch (error) {
                console.error(`Error updating ${currentEditMode}:`, error);
                const errorWrapperForMsg = (currentEditMode === 'location') ? locationMapFloatingPanel : inputWrapper;
                const errorMsgElement = errorWrapperForMsg.querySelector('.edit-error-message') || document.createElement('span');
                errorMsgElement.className = 'edit-error-message'; errorMsgElement.textContent = `Error: ${error.message}`;
                if(!errorWrapperForMsg.querySelector('.edit-error-message')) errorWrapperForMsg.appendChild(errorMsgElement);
                setTimeout(() => errorMsgElement.remove(), 3000);
            } finally {
                saveBtn.classList.remove('is-loading'); saveBtn.innerHTML = '✔'; saveBtn.disabled = false; cancelBtn.disabled = false;
            }
        };
        cancelBtn.onclick = () => cancelChanges(true);

        if (inputElementForDirtyCheckAndSave) { /* ... (keydown handler) ... */
            inputElementForDirtyCheckAndSave.onkeydown = (ev) => {
                const isTextarea = (inputElementForDirtyCheckAndSave && inputElementForDirtyCheckAndSave.tagName === 'TEXTAREA');
                const nonTextareaEnter = !isTextarea && !(currentEditMode ==='cost' && ev.shiftKey);
                if (ev.key === 'Enter' && nonTextareaEnter) { // Enter saves for all non-textarea fields now
                    ev.preventDefault(); saveBtn.click();
                } else if (ev.key === 'Escape') { cancelChanges(true); }
            };
        }
    };

    if (targetElement.clickHandler) targetElement.removeEventListener('click', targetElement.clickHandler);
    targetElement.clickHandler = handleClickToEdit;
    targetElement.addEventListener('click', targetElement.clickHandler);
}
// --- End EDITABLE FIELD LOGIC ---

function _closeEventModal() { /* ... (same) ... */
    if (!isInitialized || !modalElement || !modalElement.classList.contains('visible')) return;
    if (activeEditField && activeEditField.cancelChanges) {
        if (!activeEditField.cancelChanges(false)) return;
    }
    modalElement.classList.remove('visible'); const transitionDuration = 300;
    const handleTransitionEnd = (event) => {
        if (event.target === modalElement && event.propertyName === 'opacity') {
            modalElement.style.display = 'none'; modalElement.removeEventListener('transitionend', handleTransitionEnd); _resetModal();
        }
    };
    modalElement.addEventListener('transitionend', handleTransitionEnd);
    setTimeout(() => { if (modalElement.style.display !== 'none') { modalElement.style.display = 'none'; modalElement.removeEventListener('transitionend', handleTransitionEnd); _resetModal();}}, transitionDuration + 50);
}

function _setupInternalModalEventListeners() { /* ... (same, RSVP verified) ... */
    if (!isInitialized) return;
    if (closeButton) closeButton.addEventListener('click', _closeEventModal);
    modalElement.addEventListener('click', (event) => {
        if (event.target === modalElement) { _closeEventModal(); }
    });
    if (modalRsvpControls) {
        modalRsvpControls.addEventListener('click', async (event) => {
            const button = event.target.closest('.rsvp-btn'); if (!button) return;
            const eventId = modalRsvpControls.dataset.eventId; const buttonStatus = button.dataset.status;
            const apiStatus = buttonStatus === 'none' ? null : buttonStatus; if (!eventId) return;
            if (rsvpConfirmationMessage) { rsvpConfirmationMessage.textContent = "Updating RSVP..."; rsvpConfirmationMessage.style.color = ''; rsvpConfirmationMessage.style.display = 'block';}
            modalRsvpControls.style.pointerEvents = 'none'; modalRsvpControls.style.opacity = '0.6';
            try {
                // **** START CSRF TOKEN HANDLING ****
                const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
                let csrfToken = null;
                if (csrfTokenMeta) {
                    csrfToken = csrfTokenMeta.getAttribute('content');
                } else {
                    console.warn('CSRF token meta tag not found for RSVP. POST request might fail.');
                }

                const requestHeaders = {
                    'Content-Type': 'application/json'
                };
                if (csrfToken) {
                    requestHeaders['X-CSRFToken'] = csrfToken;
                }
                // **** END CSRF TOKEN HANDLING ****

                const response = await fetch(`/api/events/${eventId}/rsvp`, {
                    method: 'POST',
                    headers: requestHeaders, // Use the updated headers
                    body: JSON.stringify({ status: apiStatus })
                });
                if (!response.ok) { const errorData = await response.json().catch(()=>({ detail: `RSVP Update failed (${response.status})` })); throw new Error(errorData.detail);}
                const result = await response.json();
                _updateRSVPButtonState(result.status);
                if (rsvpConfirmationMessage) { const friendlyStatus = result.status ? result.status.charAt(0).toUpperCase() + result.status.slice(1) : 'cleared'; rsvpConfirmationMessage.textContent = result.status ? `Your RSVP is set to ${friendlyStatus}!` : "Your RSVP has been cleared."; setTimeout(() => { if(rsvpConfirmationMessage) rsvpConfirmationMessage.style.display = 'none'; }, 3000);}
                document.dispatchEvent(new CustomEvent('rsvpUpdated', { detail: { eventId: parseInt(eventId, 10), newStatus: result.status }, bubbles: true, composed: true }));
                _populateAttendeeList(await fetch(`/api/events/${eventId}/attendees`).then(res => res.json()));
            } catch (error) {
                console.error("Error updating RSVP:", error);
                if (rsvpConfirmationMessage) { rsvpConfirmationMessage.textContent = `Error: ${error.message || 'Could not update.'}`; rsvpConfirmationMessage.style.color = 'red';}
                await _fetchEventDetails(eventId); // Re-fetch details on error to ensure UI consistency
            } finally { if (modalRsvpControls) { modalRsvpControls.style.pointerEvents = 'auto'; modalRsvpControls.style.opacity = '1';} }
        });
    }
}

export function setupModal() { /* ... (same) ... */
    if (isInitialized) { console.warn("Modal already initialized."); return; }
    if (_initializeModalElements()) { _setupInternalModalEventListeners(); console.log("Modal setup complete."); }
    else { console.error("Modal setup failed: elements not initialized."); }
}

export async function openEventModal(eventData) { /* ... (same) ... */
    if (!isInitialized) { alert("Error: Modal not ready."); return; }
    if (!eventData || !eventData.id) { alert("Error: Invalid event data."); return; }
    _resetModal(); currentEventId = eventData.id;
    if (modalEventImage) modalEventImage.src = eventData.image_url || '/static/img/default-event-logo.png';
    if (modalGroupName) modalGroupName.textContent = eventData.group_name || 'Group';
    if (modalEventTitle) { modalEventTitle.textContent = eventData.title || 'Untitled Event'; _makeFieldEditable(modalEventTitle, 'title', eventData.title); }
    if (modalEventDate) { const d = eventData.date ? new Date(eventData.date) : null; modalEventDate.textContent = formatEventDateForDisplay(d); _makeFieldEditable(modalEventDate, 'date', d ? d.toISOString() : null, { inputType: 'datetime-local' }); }
    if (modalEventLocation) {
        const initialLocationData = {
            text: eventData.location || 'Not specified',
            coordinates: eventData.location_coordinates || null,
            predefinedKey: eventData.location_key || null
        };
        modalEventLocation.textContent = initialLocationData.text;
        _makeFieldEditable(modalEventLocation, 'location', initialLocationData, { inputType: 'custom-location-map' });
    }
    if (modalEventCost) {
        const initialRawCostInput = eventData.cost_display_raw || eventData.cost_display || 'Not specified';
        const parsedInitialCost = parseAndFormatCost(initialRawCostInput);
        modalEventCost.textContent = parsedInitialCost.cost_display_standardized;
        _makeFieldEditable(modalEventCost, 'cost', { raw_input_for_field: initialRawCostInput, standardized_display: parsedInitialCost.cost_display_standardized, value: parsedInitialCost.cost_value });
    }
    if (modalDescriptionWrapper && modalEventDescription) {
        const descContent = eventData.description || 'No description provided.';
        modalEventDescription.innerHTML = descContent;
        _makeFieldEditable(modalDescriptionWrapper, 'description', descContent, { inputType: 'textarea', isHTML: true, contentDisplayElementId: 'modal-event-description' });
    }
    if (modalRsvpControls) { modalRsvpControls.dataset.eventId = eventData.id; modalRsvpControls.style.display = 'flex'; modalRsvpControls.style.pointerEvents = 'none'; modalRsvpControls.style.opacity = '0.6'; }
    modalElement.style.display = 'flex';
    requestAnimationFrame(() => modalElement.classList.add('visible'));
    await _fetchEventDetails(eventData.id);
}
// --- END OF FILE modalManager.js ---