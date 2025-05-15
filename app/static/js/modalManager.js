// --- START OF FILE static/js/modalManager.js ---

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

// --- Cost Parsing and Formatting Helper (REVISED) ---
export function parseAndFormatCost(inputText) {
    const text = String(inputText || '').trim();
    const original_input_text_for_field = text; 
    let cost_display_standardized = text; 
    let cost_value = null;
    let is_split_cost = false;

    const lowerText = text.toLowerCase();

    const explicitSplitRegex = /(?:split\s*\$?(\d+(?:\.\d{1,2})?)|(?:\$?(\d+(?:\.\d{1,2})?)\s*(?:total\s*)?split))/i;
    const explicitSplitMatch = lowerText.match(explicitSplitRegex);

    if (explicitSplitMatch) {
        is_split_cost = true;
        const amountInSplit = explicitSplitMatch[1] || explicitSplitMatch[2];
        if (amountInSplit) {
            const numericAmount = parseFloat(amountInSplit);
            if (!isNaN(numericAmount)) {
                cost_value = numericAmount;
            }
        }
    } else {
        if (lowerText.includes('(split)')) {
            is_split_cost = true;
        }
        let textForNumericParse = lowerText;
        if (is_split_cost && textForNumericParse.includes('(split)')) {
            textForNumericParse = textForNumericParse.replace(/\(split\)/gi, '').trim();
        }

        const freeKeywords = ['free', 'free entry', 'no cost', '0', '0.0', '0.00'];
        const donationKeywords = ['donation', 'by donation', 'donations welcome', 'pay what you can', 'pwyc'];
        if (freeKeywords.some(kw => lowerText.startsWith(kw) && (lowerText.length === kw.length || !/\w/.test(lowerText[kw.length])) ) ) {
            cost_value = 0.0;
            is_split_cost = false; 
        } else if (donationKeywords.some(kw => lowerText.startsWith(kw))) {
            cost_value = null;
        } else {
            let numericString = textForNumericParse.replace(/(usd|eur|gbp|jpy|aud|cad)/gi, '').replace(/\s*(per person|pp)\s*/gi, '').replace(/[$,€£¥₹]/g, '');
            const centsMatch = numericString.match(/^(\d+)\s*(c|cent|cents)$/);
            let potentialNumber;

            if (centsMatch) {
                const cents = parseInt(centsMatch[1], 10);
                if (!isNaN(cents)) potentialNumber = cents / 100.0;
            } else {
                potentialNumber = parseFloat(numericString.replace(/,/g, ''));
            }

            if (!isNaN(potentialNumber) && potentialNumber !== null) {
                cost_value = potentialNumber;
            }
        }
    }

    const otherSpecialKeywords = { 'varies': 'Varies', 'tbd': 'TBD', 'contact for price': 'Contact for Price', 'see description': 'See Description' };

    if (cost_value === 0.0) {
        cost_display_standardized = 'Free';
    } else if (cost_value !== null) {
        cost_display_standardized = `$${cost_value.toFixed(2)}`;
        if (is_split_cost) {
            cost_display_standardized += " (Split)";
        }
    } else { 
        const freeKeywords = ['free', 'free entry', 'no cost', '0', '0.0', '0.00']; 
        const donationKeywords = ['donation', 'by donation', 'donations welcome', 'pay what you can', 'pwyc']; 

        if (is_split_cost) {
             if (freeKeywords.some(kw => original_input_text_for_field.toLowerCase().includes(kw))) {
                 cost_display_standardized = 'Free'; is_split_cost = false; cost_value = 0.0;
             } else if (donationKeywords.some(kw => original_input_text_for_field.toLowerCase().includes(kw))) {
                 cost_display_standardized = 'By Donation';
             } else {
                 cost_display_standardized = "Split Cost";
             }
        } else {
            if (freeKeywords.includes(original_input_text_for_field.toLowerCase())) {
                cost_display_standardized = 'Free'; cost_value = 0.0;
            } else if (donationKeywords.includes(original_input_text_for_field.toLowerCase())) {
                cost_display_standardized = 'By Donation';
            } else if (otherSpecialKeywords[original_input_text_for_field.toLowerCase()]) {
                cost_display_standardized = otherSpecialKeywords[original_input_text_for_field.toLowerCase()];
            } else {
                 cost_display_standardized = original_input_text_for_field || 'Not specified';
            }
        }
    }
    return { original_input_text: original_input_text_for_field, cost_display_standardized, cost_value, is_split_cost };
}


// --- Location Options & Map Configuration ---
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
const DEFAULT_MAP_CENTER = [20, 0]; // Latitude, Longitude
const DEFAULT_MAP_ZOOM = 2;
const FOCUSED_MAP_ZOOM = 13;


let modalElement, modalContent, closeButton, modalEventImage, modalEventTitle,
    modalGroupName, modalEventDate, modalEventLocation, modalEventCost,
    modalEventDescription, modalDescriptionWrapper,
    modalRsvpControls, rsvpButtons = [], rsvpConfirmationMessage,
    clearRsvpButton, modalAttendeeList, modalAttendeeCount, attendeeListContainer,
    attendeeListMessage, attendeeLoadingIndicator,
    eventPermissionsSection, eventAllowOthersEditTitleCheckbox, eventAllowOthersEditDetailsCheckbox;


let currentEventId = null;
let isInitialized = false; 
let activeEditField = null;
let geocodeTimeout = null;
let currentEventDataForModal = null; 
let costInputBlurTimeout = null; 


function _initializeModalElements() {
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

    eventPermissionsSection = modalElement.querySelector('#event-permissions-section');
    eventAllowOthersEditTitleCheckbox = modalElement.querySelector('#event-allow-others-edit-title');
    eventAllowOthersEditDetailsCheckbox = modalElement.querySelector('#event-allow-others-edit-details');


    if (!modalContent || !closeButton || !modalEventTitle || !modalDescriptionWrapper || !modalEventDescription || !modalRsvpControls || !modalAttendeeList || !eventPermissionsSection) {
        console.error("One or more essential modal sub-elements (including event permissions section) not found!"); return false;
    }
    isInitialized = true; 
    return true;
}

function _resetModal() {
    if (!isInitialized) return;
    if (activeEditField && activeEditField.cancelChanges) activeEditField.cancelChanges(true); 
    activeEditField = null;
    currentEventDataForModal = null;
    clearTimeout(costInputBlurTimeout); 

    const editableFields = modalElement.querySelectorAll('.editable-field');
    editableFields.forEach(field => {
        const contentDisplayElId = field.dataset.contentDisplayElementId;
        const contentDisplayEl = contentDisplayElId ? document.getElementById(contentDisplayElId) : field;
        const originalContent = field.dataset.originalContentForReset || '';
        const isHTML = field.dataset.originalDisplayIsHtml === 'true';

        if (contentDisplayEl) {
            if (isHTML) { contentDisplayEl.innerHTML = originalContent; }
            else { contentDisplayEl.textContent = originalContent; }
            if (field !== contentDisplayEl && !field.contains(contentDisplayEl)) {
                 field.innerHTML = '';
                 field.appendChild(contentDisplayEl);
            }
        } else if (field) {
            if (isHTML) { field.innerHTML = originalContent; }
            else { field.textContent = originalContent; }
        }

        field.classList.remove('is-editing-field', 'editable-field');
        field.classList.remove('field-disabled-for-user'); 
        if (field.clickHandler) {
            field.removeEventListener('click', field.clickHandler);
            delete field.clickHandler;
        }
        delete field.dataset.isEditing;
        delete field.dataset.editMode;
        delete field.dataset.originalContentForReset;
        delete field.dataset.originalDisplayIsHtml;
        delete field.dataset.inputType;
        delete field.dataset.contentDisplayElementId;
        delete field.dataset.currentDisplayValue;
        delete field.dataset.currentNumericValue;
        delete field.dataset.currentDataValue;
        delete field.dataset.currentCoordinates;
        delete field.dataset.currentPredefinedKey;
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
    
    if (eventPermissionsSection) eventPermissionsSection.style.display = 'none';
    if (eventAllowOthersEditTitleCheckbox) { eventAllowOthersEditTitleCheckbox.checked = false; eventAllowOthersEditTitleCheckbox.disabled = true;}
    if (eventAllowOthersEditDetailsCheckbox) { eventAllowOthersEditDetailsCheckbox.checked = false; eventAllowOthersEditDetailsCheckbox.disabled = true;}


    _updateRSVPButtonState(null);
    currentEventId = null;
}

// --- Helper to update displayed cost with per-person calculation (REVISED) ---
function _updateDisplayedCost(eventDataToDisplay) {
    if (!modalEventCost || !eventDataToDisplay) return;

    let displayCostText = eventDataToDisplay.cost_display || 'Not specified';

    if (eventDataToDisplay.is_cost_split && typeof eventDataToDisplay.cost_value === 'number' && eventDataToDisplay.cost_value > 0) {
        const rsvps = currentEventDataForModal?.attendees || []; 
        const attendingCount = rsvps.filter(rsvp => rsvp.status && rsvp.status.toLowerCase() === 'attending').length;

        if (attendingCount > 0) {
            const perPersonCost = eventDataToDisplay.cost_value / attendingCount;
             if (!displayCostText.toLowerCase().includes("split") && typeof eventDataToDisplay.cost_value === 'number') {
                displayCostText = `$${eventDataToDisplay.cost_value.toFixed(2)} (Split / $${perPersonCost.toFixed(2)} pp)`;
            } else if (displayCostText.toLowerCase().includes("(split)")) {
                 displayCostText = displayCostText.replace(/\(Split\)/i, `(Split / $${perPersonCost.toFixed(2)} pp)`);
            } else if (displayCostText.toLowerCase() === "split cost") { 
                 displayCostText = `Split Cost ($${perPersonCost.toFixed(2)} pp)`;
            } else { 
                 displayCostText += ` ($${perPersonCost.toFixed(2)} pp)`;
            }
        } else { 
            if (!displayCostText.toLowerCase().includes("split")) {
                 if (typeof eventDataToDisplay.cost_value === 'number') {
                    displayCostText = `$${eventDataToDisplay.cost_value.toFixed(2)} (Split)`;
                } else {
                    displayCostText = "Split Cost";
                }
            }
        }
    }
    modalEventCost.textContent = displayCostText;

    if (modalEventCost.classList.contains('editable-field')) {
        modalEventCost.dataset.originalContentForReset = displayCostText;
    }
}


function _populateAttendeeList(attendees = []) {
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

function _updateRSVPButtonState(status) {
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
async function _fetchEventDetails(eventId) {
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
        
        if (currentEventDataForModal && String(currentEventDataForModal.id) === String(eventId)) {
            currentEventDataForModal.attendees = attendees;
            currentEventDataForModal.current_user_rsvp_status = myRsvp.status;
        }

        _populateAttendeeList(attendees);
        _updateRSVPButtonState(myRsvp.status);
        if (currentEventDataForModal) {
             _updateDisplayedCost(currentEventDataForModal);
        }


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
function _makeFieldEditable(targetElement, apiFieldNameOrMode, initialData, config = {}, canEditField = true) {
    if (!targetElement) return;
    if (targetElement.dataset.isEditing === 'true') return; 

    if (!canEditField) {
        targetElement.classList.add('field-disabled-for-user');
        targetElement.style.cursor = 'default';
        if (targetElement.clickHandler) {
            targetElement.removeEventListener('click', targetElement.clickHandler);
            delete targetElement.clickHandler;
        }
        return; 
    }
    targetElement.classList.remove('field-disabled-for-user');
    targetElement.style.cursor = 'pointer';


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
        targetElement.dataset.originalContentForReset = contentDisplayElement.textContent; 
        targetElement.dataset.currentDisplayValue = initialData.raw_input_for_field || ''; 
        targetElement.dataset.currentNumericValue = initialData.value === null || initialData.value === undefined ? '' : String(initialData.value);
        targetElement.dataset.isSplitCost = initialData.is_split_cost ? 'true' : 'false';
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
            if (!activeEditField.cancelChanges(true)) { 
                return;
            }
        }

        targetElement.classList.add('is-editing-field');
        targetElement.dataset.isEditing = 'true';

        const originalStaticDisplayForCancel = targetElement.dataset.originalContentForReset;
        let initialInputFieldValue; 

        let currentEditMode = targetElement.dataset.editMode;
        let costInterpretationHelper = null;
        let locationMapFloatingPanel = null;
        let locationMapController = null;
        let inputElementForDirtyCheckAndSave;
        let isBlurDueToAction = false; 

        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'editable-input-wrapper';

        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'editable-actions-container';
        const saveBtn = document.createElement('button');
        saveBtn.innerHTML = '✔'; saveBtn.className = 'edit-action-button edit-save-btn'; saveBtn.title = 'Save';
        const cancelBtn = document.createElement('button');
        cancelBtn.innerHTML = '✖'; cancelBtn.className = 'edit-action-button edit-cancel-btn'; cancelBtn.title = 'Cancel';
        
        const onActionMousedown = () => { isBlurDueToAction = true; };
        saveBtn.addEventListener('mousedown', onActionMousedown);
        cancelBtn.addEventListener('mousedown', onActionMousedown);

        actionsContainer.appendChild(saveBtn); actionsContainer.appendChild(cancelBtn);

        if (currentEditMode === 'cost') {
            initialInputFieldValue = targetElement.dataset.currentDisplayValue; 
            costInterpretationHelper = document.createElement('div');
            costInterpretationHelper.id = 'cost-interpretation-helper-dynamic';
            costInterpretationHelper.className = 'cost-interpretation-helper';
            document.body.appendChild(costInterpretationHelper);
            costInterpretationHelper.addEventListener('mousedown', (event) => event.stopPropagation());


            const costInput = document.createElement('input');
            costInput.type = 'text';
            costInput.className = 'editable-input editable-cost-input';
            costInput.value = initialInputFieldValue;
            costInput.placeholder = "e.g., Free, 10, 50 split, Donation"; 
            inputWrapper.appendChild(costInput);
            inputElementForDirtyCheckAndSave = costInput;

            targetElement.innerHTML = ''; 
            targetElement.appendChild(inputWrapper);

            const updateCostInterpretation = () => {
                const parsed = parseAndFormatCost(costInput.value);
                let numericValDisplay = parsed.cost_value === null || parsed.cost_value === undefined ? '<em>Not set</em>' : String(parsed.cost_value);
                if (typeof parsed.cost_value === 'number') numericValDisplay = `<strong>${parsed.cost_value.toFixed(2)}</strong>`;
                let splitText = parsed.is_split_cost ? " (Cost to be split)" : "";
                costInterpretationHelper.innerHTML = `Interpreted: Display as "<strong>${parsed.cost_display_standardized}</strong>"${splitText}, Value as ${numericValDisplay}`;
                const targetRect = targetElement.getBoundingClientRect();
                costInterpretationHelper.style.position = 'fixed';
                costInterpretationHelper.style.boxSizing = 'border-box';
                costInterpretationHelper.style.left = `${targetRect.left}px`;
                costInterpretationHelper.style.top = `${targetRect.bottom + 5}px`;
                costInterpretationHelper.style.width = `${targetRect.width}px`;
                costInterpretationHelper.style.zIndex = '1060';
                costInterpretationHelper.classList.add('visible');
            };
            costInput.addEventListener('input', updateCostInterpretation);
            costInput.addEventListener('focus', updateCostInterpretation);
            requestAnimationFrame(updateCostInterpretation);
            
            costInput.addEventListener('blur', () => {
                clearTimeout(costInputBlurTimeout);
                costInputBlurTimeout = setTimeout(() => {
                    if (isBlurDueToAction) {
                        isBlurDueToAction = false; 
                        return; 
                    }
                    if (costInput.value !== initialInputFieldValue) {
                        console.log("Cost field blurred (not to action button) and value changed, attempting auto-save.");
                        if (!saveBtn.disabled) { 
                             saveBtn.click(); 
                        }
                    }
                }, 50); // A small delay to allow mousedown to set the flag
            });


        } else if (currentEditMode === 'location') {
            initialInputFieldValue = targetElement.dataset.originalContentForReset;
            targetElement.innerHTML = '';
            const locationTextInput = document.createElement('input');
            locationTextInput.type = 'text';
            locationTextInput.className = 'editable-input location-text-input-main';
            locationTextInput.value = initialInputFieldValue;
            inputWrapper.appendChild(locationTextInput);
            targetElement.appendChild(inputWrapper);
            inputElementForDirtyCheckAndSave = locationTextInput;

            locationMapFloatingPanel = document.createElement('div');
            locationMapFloatingPanel.className = 'location-map-floating-panel';
            locationMapFloatingPanel.addEventListener('mousedown', (event) => event.stopPropagation()); 

            const mapContainer = document.createElement('div');
            mapContainer.id = `leaflet-map-container-${Date.now()}`;
            mapContainer.style.height = '250px'; mapContainer.style.width = '100%';
            locationMapFloatingPanel.appendChild(mapContainer);
            const mapStatusElement = document.createElement('small');
            mapStatusElement.className = 'map-status-text';
            mapStatusElement.innerHTML = 'Initializing map... <span style="float:right;">© OpenStreetMap contributors</span>';
            locationMapFloatingPanel.appendChild(mapStatusElement);
            document.body.appendChild(locationMapFloatingPanel);

            locationMapController = {
                mapContainer, statusElement: mapStatusElement, map: null, marker: null,
                currentCoords: targetElement.dataset.currentCoordinates || null,
                currentKey: targetElement.dataset.currentPredefinedKey || null,
            };

            const textInputRect = locationTextInput.getBoundingClientRect();
            locationMapFloatingPanel.style.left = `${textInputRect.left}px`;
            locationMapFloatingPanel.style.top = `${textInputRect.bottom + 5}px`;
            locationMapFloatingPanel.style.width = `${Math.max(textInputRect.width, 350)}px`;

            setTimeout(() => {
                try {
                    let initialLat = DEFAULT_MAP_CENTER[0], initialLon = DEFAULT_MAP_CENTER[1], initialZoom = DEFAULT_MAP_ZOOM;
                    if (locationMapController.currentCoords) {
                        const [lat, lon] = locationMapController.currentCoords.split(',').map(parseFloat);
                        if (!isNaN(lat) && !isNaN(lon)) { initialLat = lat; initialLon = lon; initialZoom = FOCUSED_MAP_ZOOM; }
                    }
                    locationMapController.map = L.map(locationMapController.mapContainer.id).setView([initialLat, initialLon], initialZoom);
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '' }).addTo(locationMapController.map);
                    locationMapController.marker = L.marker([initialLat, initialLon], { draggable: true }).addTo(locationMapController.map);
                    locationMapController.statusElement.innerHTML = 'Map ready. Type or click map. <span style="float:right;">© OSM</span>';

                    const updateLocationFromMapInteraction = async (latlng) => {
                        locationMapController.marker.setLatLng(latlng);
                        locationMapController.map.panTo(latlng);
                        locationMapController.statusElement.innerHTML = `Fetching address... <span style="float:right;">© OSM</span>`;
                        locationMapController.currentKey = null;
                        clearTimeout(geocodeTimeout);
                        geocodeTimeout = setTimeout(async () => {
                            try {
                                const response = await fetch(`${NOMINATIM_REVERSE_GEOCODE_URL}&lat=${latlng.lat}&lon=${latlng.lng}`);
                                if (!response.ok) throw new Error(`Nominatim error: ${response.status}`);
                                const data = await response.json();
                                const displayName = data.display_name || `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
                                inputElementForDirtyCheckAndSave.value = displayName;
                                locationMapController.currentCoords = `${latlng.lat},${latlng.lng}`;
                                locationMapController.statusElement.innerHTML = `Selected: ${displayName.substring(0, 50)}... <span style="float:right;">© OSM</span>`;
                            } catch (err) { console.error("Reverse geocoding error:", err); locationMapController.statusElement.innerHTML = `Error fetching address. <span style="float:right;">© OSM</span>`; }
                        }, 800);
                    };
                    locationMapController.map.on('click', (e) => updateLocationFromMapInteraction(e.latlng));
                    locationMapController.marker.on('dragend', (e) => updateLocationFromMapInteraction(e.target.getLatLng()));

                    const searchLocationOnMapFromTextInput = async (query) => {
                        if (!query || !query.trim()) return;
                        locationMapController.statusElement.innerHTML = `Searching for "${query}"... <span style="float:right;">© OSM</span>`;
                        locationMapController.currentKey = null;
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
                                    locationMapController.statusElement.innerHTML = `Map centered: ${display_name.substring(0,50)}... <span style="float:right;">© OSM</span>`;
                                } else {
                                    locationMapController.statusElement.innerHTML = `No map results for "${query}". <span style="float:right;">© OSM</span>`;
                                }
                            } catch (err) { console.error("Forward geocoding error:", err); locationMapController.statusElement.innerHTML = `Error searching. <span style="float:right;">© OSM</span>`; }
                        }, 800);
                    };
                    inputElementForDirtyCheckAndSave.addEventListener('input', () => {
                        searchLocationOnMapFromTextInput(inputElementForDirtyCheckAndSave.value);
                    });

                    if (locationMapController.currentKey && !locationMapController.currentCoords) {
                        const pDef = AVAILABLE_LOCATIONS_DATA.find(l => l.key === locationMapController.currentKey);
                        if (pDef && pDef.mapQuery) searchLocationOnMapFromTextInput(pDef.mapQuery);
                    } else if (!locationMapController.currentCoords && inputElementForDirtyCheckAndSave.value.trim() !== '' && inputElementForDirtyCheckAndSave.value !== 'Not specified') {
                        searchLocationOnMapFromTextInput(inputElementForDirtyCheckAndSave.value);
                    }
                } catch (mapError) { console.error("Leaflet map init error:", mapError); if(locationMapController) locationMapController.statusElement.innerHTML = `Error initializing map. <span style="float:right;">© OSM</span>`; }
            }, 0);

        } else { 
            let genericInput;
            initialInputFieldValue = targetElement.dataset.currentDataValue;
            if (inputType === 'textarea') {
                genericInput = document.createElement('textarea');
                genericInput.value = initialInputFieldValue;
            } else if (inputType === 'datetime-local') {
                genericInput = document.createElement('input');
                genericInput.type = 'datetime-local';
                const dateVal = initialInputFieldValue; 
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
            inputWrapper.appendChild(genericInput);
            inputElementForDirtyCheckAndSave = genericInput;
            targetElement.innerHTML = '';
            targetElement.appendChild(inputWrapper);
        }
        
        inputWrapper.appendChild(actionsContainer); 

        if (inputElementForDirtyCheckAndSave) {
            inputElementForDirtyCheckAndSave.focus();
            if (inputElementForDirtyCheckAndSave.setSelectionRange && inputElementForDirtyCheckAndSave.type !== 'datetime-local') {
                 inputElementForDirtyCheckAndSave.setSelectionRange(inputElementForDirtyCheckAndSave.value.length, inputElementForDirtyCheckAndSave.value.length);
            }
        }

        const handleDocumentClick = (event) => {
             const isClickInsideThisEditor = targetElement.contains(event.target) ||
                                           (costInterpretationHelper && costInterpretationHelper.contains(event.target)) ||
                                           (locationMapFloatingPanel && locationMapFloatingPanel.contains(event.target));

            if (!isClickInsideThisEditor) {
                cancelChanges(false); 
            }
        };

        const exitEditMode = (savedDataFromServer) => {
            document.removeEventListener('click', handleDocumentClick, true);
            saveBtn.removeEventListener('mousedown', onActionMousedown); 
            cancelBtn.removeEventListener('mousedown', onActionMousedown);
            clearTimeout(costInputBlurTimeout); // Clear any pending blur action

            if (costInterpretationHelper) costInterpretationHelper.remove();
            if (locationMapFloatingPanel) {
                if (locationMapController && locationMapController.map) locationMapController.map.remove();
                locationMapFloatingPanel.remove();
            }
            targetElement.innerHTML = ''; 
            const isHTMLOutput = targetElement.dataset.originalDisplayIsHtml === 'true';
            let finalDisplayToShow;

            if (savedDataFromServer) {
                currentEventDataForModal = savedDataFromServer; 
                
                if (currentEditMode === 'cost') {
                    _updateDisplayedCost(savedDataFromServer); 
                    finalDisplayToShow = modalEventCost.textContent; 
                    targetElement.dataset.originalContentForReset = finalDisplayToShow;
                    targetElement.dataset.currentDisplayValue = savedDataFromServer.original_input_text || inputElementForDirtyCheckAndSave.value;
                    targetElement.dataset.currentNumericValue = savedDataFromServer.cost_value === null || savedDataFromServer.cost_value === undefined ? '' : String(savedDataFromServer.cost_value);
                    targetElement.dataset.isSplitCost = savedDataFromServer.is_cost_split ? 'true' : 'false';
                } else if (currentEditMode === 'date') {
                    finalDisplayToShow = formatEventDateForDisplay(new Date(savedDataFromServer.date));
                    targetElement.dataset.originalContentForReset = finalDisplayToShow;
                    targetElement.dataset.currentDataValue = savedDataFromServer.date;
                } else if (currentEditMode === 'location') {
                    finalDisplayToShow = savedDataFromServer.location || 'Not specified';
                    targetElement.dataset.originalContentForReset = finalDisplayToShow;
                    if (savedDataFromServer.location_coordinates) targetElement.dataset.currentCoordinates = savedDataFromServer.location_coordinates;
                    else delete targetElement.dataset.currentCoordinates;
                    if (savedDataFromServer.location_key) targetElement.dataset.currentPredefinedKey = savedDataFromServer.location_key;
                    else delete targetElement.dataset.currentPredefinedKey;
                } else { 
                    finalDisplayToShow = savedDataFromServer[currentEditMode] || '';
                    targetElement.dataset.originalContentForReset = finalDisplayToShow;
                    targetElement.dataset.currentDataValue = finalDisplayToShow;
                }
            } else { 
                finalDisplayToShow = originalStaticDisplayForCancel;
            }
            const displayTarget = contentDisplayElement || targetElement;
            if (isHTMLOutput || currentEditMode === 'description') displayTarget.innerHTML = finalDisplayToShow;
            else displayTarget.textContent = finalDisplayToShow;

            if (targetElement !== displayTarget && !targetElement.contains(displayTarget)) {
                 targetElement.appendChild(displayTarget);
            }
            targetElement.classList.remove('is-editing-field');
            delete targetElement.dataset.isEditing;
            activeEditField = null;
        };

        const cancelChanges = (force = false) => { 
            const currentInputValue = inputElementForDirtyCheckAndSave.value;
            let isDirty = currentInputValue !== initialInputFieldValue; 
            if (currentEditMode === 'location') {
                const originalCoords = targetElement.dataset.currentCoordinates; 
                const currentMapCoords = locationMapController?.currentCoords;
                if (originalCoords !== currentMapCoords) isDirty = true;
            }
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
            isBlurDueToAction = false; 
            let payload = {};
            if (currentEditMode === 'cost') {
                const parsedForSave = parseAndFormatCost(inputElementForDirtyCheckAndSave.value);
                payload.cost_display = parsedForSave.cost_display_standardized;
                payload.cost_value = parsedForSave.cost_value;
                payload.is_cost_split = parsedForSave.is_split_cost;
                payload.original_input_text = parsedForSave.original_input_text; 
            } else if (currentEditMode === 'date') {
                if (!inputElementForDirtyCheckAndSave.value) { payload.date = null; }
                else {
                    try { payload.date = new Date(inputElementForDirtyCheckAndSave.value).toISOString(); }
                    catch (err) { inputElementForDirtyCheckAndSave.classList.add('input-error-glow'); setTimeout(() => inputElementForDirtyCheckAndSave.classList.remove('input-error-glow'), 2000); return; }
                }
            } else if (currentEditMode === 'location') {
                payload.location = inputElementForDirtyCheckAndSave.value;
                payload.location_coordinates = locationMapController.currentCoords;
            } else { 
                payload[currentEditMode] = inputElementForDirtyCheckAndSave.value;
            }

            if (currentEventDataForModal && (currentEventDataForModal.is_current_user_creator || currentEventDataForModal.is_current_user_group_owner)) {
                if (eventAllowOthersEditTitleCheckbox && eventAllowOthersEditTitleCheckbox.checked !== currentEventDataForModal.allow_others_edit_title) {
                    payload.allow_others_edit_title = eventAllowOthersEditTitleCheckbox.checked;
                }
                if (eventAllowOthersEditDetailsCheckbox && eventAllowOthersEditDetailsCheckbox.checked !== currentEventDataForModal.allow_others_edit_details) {
                    payload.allow_others_edit_details = eventAllowOthersEditDetailsCheckbox.checked;
                }
            }


            saveBtn.classList.add('is-loading'); saveBtn.innerHTML = ''; saveBtn.disabled = true; cancelBtn.disabled = true;
            try {
                const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
                const requestHeaders = {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                };
                if (csrfTokenMeta) {
                    requestHeaders['X-CSRFToken'] = csrfTokenMeta.getAttribute('content');
                } else {
                     console.warn('CSRF token meta tag not found. PATCH request might fail.');
                }
                const response = await fetch(`/api/events/${currentEventId}`, {
                    method: 'PATCH',
                    headers: requestHeaders,
                    body: JSON.stringify(payload)
                });
                if (!response.ok) { const errData = await response.json().catch(()=>({})); throw new Error(errData.detail || errData.error || `Update failed (${response.status})`);}
                const updatedEventDataFromServer = await response.json();
                
                currentEventDataForModal = updatedEventDataFromServer; 
                
                exitEditMode(updatedEventDataFromServer); 
                document.dispatchEvent(new CustomEvent('eventDataUpdated', {
                    detail: {
                        eventId: updatedEventDataFromServer.id,
                        updatedEvent: updatedEventDataFromServer
                    },
                    bubbles: true,
                    composed: true
                }));
            } catch (error) {
                console.error(`Error updating ${currentEditMode}:`, error);
                const errorWrapperForMsg = (currentEditMode === 'location' && locationMapFloatingPanel) ? locationMapFloatingPanel : inputWrapper;
                let errorMsgElement = errorWrapperForMsg.querySelector('.edit-error-message');
                if (!errorMsgElement) {
                    errorMsgElement = document.createElement('span');
                    errorMsgElement.className = 'edit-error-message';
                    if (actionsContainer) actionsContainer.insertAdjacentElement('afterend', errorMsgElement);
                    else errorWrapperForMsg.appendChild(errorMsgElement);
                }
                errorMsgElement.textContent = `Error: ${error.message}`;
                errorMsgElement.style.display = 'block';
                setTimeout(() => { errorMsgElement.remove(); }, 3000);
            } finally {
                saveBtn.classList.remove('is-loading'); saveBtn.innerHTML = '✔'; saveBtn.disabled = false; cancelBtn.disabled = false;
            }
        };
        cancelBtn.onclick = () => {
            isBlurDueToAction = false; 
            cancelChanges(true); 
        }; 

        if (inputElementForDirtyCheckAndSave) {
            inputElementForDirtyCheckAndSave.onkeydown = (ev) => {
                const isTextarea = (inputElementForDirtyCheckAndSave.tagName === 'TEXTAREA');
                const nonTextareaEnter = !isTextarea && !(currentEditMode ==='cost' && ev.shiftKey); 
                if (ev.key === 'Enter' && nonTextareaEnter) {
                    ev.preventDefault(); 
                    if (!saveBtn.disabled) saveBtn.click();
                } else if (ev.key === 'Escape') { 
                    cancelChanges(true); 
                }
            };
        }
    };
    if (targetElement.clickHandler) targetElement.removeEventListener('click', targetElement.clickHandler);
    targetElement.clickHandler = handleClickToEdit;
    targetElement.addEventListener('click', targetElement.clickHandler);
}

export function _closeEventModal() { 
    if (!isInitialized || !modalElement || !modalElement.classList.contains('visible')) return;
    if (activeEditField && activeEditField.cancelChanges) {
        if (!activeEditField.cancelChanges(true)) return; 
    }
    modalElement.classList.remove('visible'); const transitionDuration = 300;
    const handleTransitionEnd = (event) => {
        if (event.target === modalElement && event.propertyName === 'opacity') {
            modalElement.style.display = 'none';
            modalElement.removeEventListener('transitionend', handleTransitionEnd);
            _resetModal();
        }
    };
    modalElement.addEventListener('transitionend', handleTransitionEnd);
    setTimeout(() => {
        if (modalElement.style.display !== 'none') {
            modalElement.style.display = 'none';
            modalElement.removeEventListener('transitionend', handleTransitionEnd);
            _resetModal();
        }
    }, transitionDuration + 50);
}

function _setupInternalModalEventListeners() {
    if (!isInitialized) return; 
    if (closeButton) closeButton.addEventListener('click', _closeEventModal);
    modalElement.addEventListener('click', (event) => {
        if (event.target === modalElement) { _closeEventModal(); }
    });

    if (modalRsvpControls) {
        modalRsvpControls.addEventListener('click', async (event) => {
            const button = event.target.closest('.rsvp-btn'); if (!button) return;
            const eventId = modalRsvpControls.dataset.eventId; const buttonStatus = button.dataset.status;
            const apiStatus = buttonStatus === 'none' ? null : buttonStatus;
            if (!eventId) return;

            if (rsvpConfirmationMessage) { rsvpConfirmationMessage.textContent = "Updating RSVP..."; rsvpConfirmationMessage.style.color = ''; rsvpConfirmationMessage.style.display = 'block';}
            modalRsvpControls.style.pointerEvents = 'none'; modalRsvpControls.style.opacity = '0.6';

            try {
                const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
                const requestHeaders = {
                    'Content-Type': 'application/json',
                     'Accept': 'application/json'
                };
                if (csrfTokenMeta) {
                    requestHeaders['X-CSRFToken'] = csrfTokenMeta.getAttribute('content');
                } else {
                    console.warn('CSRF token meta tag not found for RSVP. POST request might fail.');
                }

                const response = await fetch(`/api/events/${eventId}/rsvp`, {
                    method: 'POST',
                    headers: requestHeaders,
                    body: JSON.stringify({ status: apiStatus })
                });

                if (!response.ok) { const errorData = await response.json().catch(()=>({ detail: `RSVP Update failed (${response.status})` })); throw new Error(errorData.detail || errorData.error);}
                const rsvpResult = await response.json();

                const eventResponse = await fetch(`/api/events/${eventId}`); 
                if (!eventResponse.ok) throw new Error(`Failed to fetch updated event data after RSVP: ${eventResponse.status}`);
                const fullUpdatedEventFromServer = await eventResponse.json();
                currentEventDataForModal = fullUpdatedEventFromServer; 

                _updateRSVPButtonState(rsvpResult.status);
                if (rsvpConfirmationMessage) { const friendlyStatus = rsvpResult.status ? rsvpResult.status.charAt(0).toUpperCase() + rsvpResult.status.slice(1) : 'cleared'; rsvpConfirmationMessage.textContent = rsvpResult.status ? `Your RSVP is set to ${friendlyStatus}!` : "Your RSVP has been cleared."; setTimeout(() => { if(rsvpConfirmationMessage) rsvpConfirmationMessage.style.display = 'none'; }, 3000);}

                document.dispatchEvent(new CustomEvent('eventDataUpdated', {
                    detail: {
                        eventId: parseInt(eventId, 10),
                        updatedEvent: fullUpdatedEventFromServer 
                    },
                    bubbles: true,
                    composed: true
                }));
                await _fetchEventDetails(eventId); 

            } catch (error) {
                console.error("Error updating RSVP:", error);
                if (rsvpConfirmationMessage) { rsvpConfirmationMessage.textContent = `Error: ${error.message || 'Could not update.'}`; rsvpConfirmationMessage.style.color = 'red';}
                await _fetchEventDetails(eventId); 
            } finally {
                if (modalRsvpControls) { modalRsvpControls.style.pointerEvents = 'auto'; modalRsvpControls.style.opacity = '1';}
            }
        });
    }

    const setupPermissionCheckboxListener = (checkbox, permissionField) => {
        if (checkbox) {
            checkbox.addEventListener('change', async () => {
                if (!currentEventDataForModal || !(currentEventDataForModal.is_current_user_creator || currentEventDataForModal.is_current_user_group_owner)) {
                    return; 
                }
                const payload = { [permissionField]: checkbox.checked };
                try {
                     const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
                     const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
                     if (csrfTokenMeta) headers['X-CSRFToken'] = csrfTokenMeta.getAttribute('content');
                     const response = await fetch(`/api/events/${currentEventId}`, {
                         method: 'PATCH', headers: headers, body: JSON.stringify(payload)
                     });
                    if (!response.ok) throw new Error('Failed to update event permission.');
                    const updatedEvent = await response.json();
                    currentEventDataForModal = updatedEvent; 
                    document.dispatchEvent(new CustomEvent('eventDataUpdated', {
                        detail: { eventId: currentEventId, updatedEvent: updatedEvent },
                        bubbles: true, composed: true
                    }));

                } catch (err) {
                    console.error("Error updating event permission:", err);
                    checkbox.checked = !checkbox.checked; 
                    alert("Failed to update permission. Please try again.");
                }
            });
        }
    };
    setupPermissionCheckboxListener(eventAllowOthersEditTitleCheckbox, 'allow_others_edit_title');
    setupPermissionCheckboxListener(eventAllowOthersEditDetailsCheckbox, 'allow_others_edit_details');


}

export function setupModal() {
    if (isInitialized) { 
        console.warn("Modal already initialized.");
        return;
    }
    if (_initializeModalElements()) { 
        _setupInternalModalEventListeners();
        console.log("Modal setup complete.");
    }
    else {
        console.error("Modal setup failed: elements not initialized. Modal will not function.");
    }
}

export async function openEventModal(eventData) {
    if (!isInitialized) { 
        alert("Error: Event details modal is not ready. Please try again shortly.");
        console.error("openEventModal called before modal was initialized.");
        return;
    }
    if (!eventData || !eventData.id) {
        alert("Error: Invalid event data provided for modal.");
        console.error("openEventModal called with invalid eventData:", eventData);
        return;
    }

    _resetModal(); 
    currentEventId = eventData.id;
    currentEventDataForModal = eventData; 

    const canManageEventPermissions = eventData.is_current_user_creator || eventData.is_current_user_group_owner;

    if (eventPermissionsSection) {
        eventPermissionsSection.style.display = canManageEventPermissions ? 'block' : 'none';
    }
    if (eventAllowOthersEditTitleCheckbox) {
        eventAllowOthersEditTitleCheckbox.checked = eventData.allow_others_edit_title || false;
        eventAllowOthersEditTitleCheckbox.disabled = !canManageEventPermissions;
    }
    if (eventAllowOthersEditDetailsCheckbox) {
        eventAllowOthersEditDetailsCheckbox.checked = eventData.allow_others_edit_details || false;
        eventAllowOthersEditDetailsCheckbox.disabled = !canManageEventPermissions;
    }


    if (modalEventImage) modalEventImage.src = eventData.image_url;
    if (modalGroupName) modalGroupName.textContent = eventData.group_name || 'Group';

    const isMember = eventData.group_id ? true : false; 
    const canEditTitle = eventData.is_current_user_creator || eventData.is_current_user_group_owner || (eventData.allow_others_edit_title && isMember); 
    const canEditDetails = eventData.is_current_user_creator || eventData.is_current_user_group_owner || (eventData.allow_others_edit_details && isMember);

    if (modalEventTitle) {
        modalEventTitle.textContent = eventData.title || 'Untitled Event';
        _makeFieldEditable(modalEventTitle, 'title', eventData.title, {}, canEditTitle);
    }
    if (modalEventDate) {
        const d = eventData.date ? new Date(eventData.date) : null; 
        modalEventDate.textContent = formatEventDateForDisplay(d);
        _makeFieldEditable(modalEventDate, 'date', d ? d.toISOString() : null, { inputType: 'datetime-local' }, canEditDetails);
    }
    if (modalEventLocation) {
        const initialLocationData = {
            text: eventData.location || 'Not specified',
            coordinates: eventData.location_coordinates || null,
            predefinedKey: null 
        };
        modalEventLocation.textContent = initialLocationData.text;
        _makeFieldEditable(modalEventLocation, 'location', initialLocationData, { inputType: 'custom-location-map' }, canEditDetails);
    }
    
    if (modalEventCost) {
        _updateDisplayedCost(eventData); 

        _makeFieldEditable(modalEventCost, 'cost', {
            raw_input_for_field: eventData.original_input_text || eventData.cost_display || '',
            standardized_display: eventData.cost_display, 
            value: eventData.cost_value,
            is_split_cost: eventData.is_cost_split 
        }, canEditDetails);
    }

    if (modalDescriptionWrapper && modalEventDescription) {
        const descContent = eventData.description || 'No description provided.';
        modalEventDescription.innerHTML = descContent;
        _makeFieldEditable(modalDescriptionWrapper, 'description', descContent, { inputType: 'textarea', isHTML: true, contentDisplayElementId: 'modal-event-description' }, canEditDetails);
    }


    if (modalRsvpControls) {
        modalRsvpControls.dataset.eventId = eventData.id;
        modalRsvpControls.style.display = 'flex';
        modalRsvpControls.style.pointerEvents = 'none';
        modalRsvpControls.style.opacity = '0.6';
    }

    modalElement.style.display = 'flex';
    requestAnimationFrame(() => modalElement.classList.add('visible'));

    await _fetchEventDetails(eventData.id); 
}

export function getCurrentModalEventId() {
    return currentEventId;
}
// --- END OF FILE static/js/modalManager.js ---