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
    let original_input_text = text; // Keep the raw input for the edit field
    let cost_display_standardized = text; // This will be the standardized display for static view
    let cost_value = null;
    const lowerText = text.toLowerCase();

    const freeKeywords = ['free', 'free entry', 'no cost', '0', '0.0', '0.00'];
    const donationKeywords = ['donation', 'by donation', 'donations welcome', 'pay what you can', 'pwyc'];
    const otherSpecialKeywords = {
        'varies': 'Varies',
        'tbd': 'TBD',
        'contact for price': 'Contact for Price',
        'see description': 'See Description'
    };

    if (freeKeywords.includes(lowerText)) {
        cost_display_standardized = 'Free';
        cost_value = 0.0;
    } else if (donationKeywords.includes(lowerText)) {
        cost_display_standardized = 'By Donation';
        cost_value = null;
    } else if (otherSpecialKeywords[lowerText]) {
        cost_display_standardized = otherSpecialKeywords[lowerText];
        cost_value = null;
    } else {
        // Attempt to parse as a number (dollars or cents)
        let numericString = lowerText.replace(/(usd|eur|gbp|jpy|aud|cad)/gi, ''); // Remove currency symbols/codes
        numericString = numericString.replace(/\s*(per person|pp)\s*/gi, ''); // Remove "per person"
        numericString = numericString.replace(/[$,€£¥₹]/g, ''); // Remove common currency symbols again

        const centsMatch = numericString.match(/^(\d+)\s*(c|cent|cents)$/);
        let potentialNumber;

        if (centsMatch) {
            const cents = parseInt(centsMatch[1], 10);
            if (!isNaN(cents)) {
                potentialNumber = cents / 100.0;
            }
        } else {
            potentialNumber = parseFloat(numericString.replace(/,/g, ''));
        }

        if (!isNaN(potentialNumber) && potentialNumber !== null) {
            cost_value = potentialNumber;
            if (cost_value === 0) { // If parsed number is 0, treat as "Free"
                cost_display_standardized = 'Free';
            } else {
                cost_display_standardized = `$${cost_value.toFixed(2)}`;
            }
        } else {
            // If it's not recognized, keep the original text for display, value remains null
            // but we'll use the original_input_text for the input field if editing.
            // For static display, if not any special keyword or number, use original input.
            cost_display_standardized = original_input_text;
            cost_value = null;
        }
    }
    // The input field during editing will show original_input_text (or currentDisplayValue from dataset)
    // The static display (modalEventCost) will show cost_display_standardized
    return { original_input_text, cost_display_standardized, cost_value };
}


let modalElement, modalContent, closeButton, modalEventImage, modalEventTitle,
    modalGroupName, modalEventDate, modalEventLocation, modalEventCost,
    modalEventDescription, modalDescriptionWrapper,
    modalRsvpControls, rsvpButtons = [], rsvpConfirmationMessage,
    clearRsvpButton, modalAttendeeList, modalAttendeeCount, attendeeListContainer,
    attendeeListMessage, attendeeLoadingIndicator;

let currentEventId = null;
let isInitialized = false;
let activeEditField = null;

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

    if (!modalContent || !closeButton || !modalEventTitle || !modalDescriptionWrapper || !modalEventDescription) {
        console.error("One or more essential modal sub-elements not found!");
        return false;
    }
    isInitialized = true;
    return true;
}

function _resetModal() {
    if (!isInitialized) return;
    if (activeEditField && activeEditField.cancelChanges) {
        activeEditField.cancelChanges(true);
    }
    activeEditField = null;

    const editableFields = modalElement.querySelectorAll('.editable-field');
    editableFields.forEach(field => {
        const contentDisplayElId = field.dataset.contentDisplayElementId;
        const contentDisplayEl = contentDisplayElId ? document.getElementById(contentDisplayElId) : field;
        const originalContent = field.dataset.originalContentForReset || '';
        const isHTML = field.dataset.originalDisplayIsHtml === 'true';

        if (isHTML) { contentDisplayEl.innerHTML = originalContent; }
        else { contentDisplayEl.textContent = originalContent; }
        if (field !== contentDisplayEl && !field.contains(contentDisplayEl)) {
            field.innerHTML = ''; field.appendChild(contentDisplayEl);
        }
        field.classList.remove('is-editing-field', 'editable-field');
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
        delete field.dataset.currentDisplayValue; // For cost, this was the raw input value
        delete field.dataset.currentNumericValue;
        delete field.dataset.currentDataValue;
    });

    if (modalEventImage) modalEventImage.setAttribute('src', '/static/img/default-event-logo.png');
    if (modalEventTitle) modalEventTitle.textContent = 'Loading...';
    if (modalGroupName) modalGroupName.textContent = 'Loading...';
    if (modalEventDate) modalEventDate.textContent = 'Loading...';
    if (modalEventLocation) modalEventLocation.textContent = 'Loading...';
    if (modalEventCost) modalEventCost.textContent = 'Loading...'; // Will be updated by openEventModal
    if (modalEventDescription) modalEventDescription.innerHTML = 'Loading...';
    if (modalRsvpControls) modalRsvpControls.dataset.eventId = '';
    if (modalAttendeeList) modalAttendeeList.innerHTML = '';
    if (modalAttendeeCount) modalAttendeeCount.textContent = '0';
    if (attendeeListMessage) attendeeListMessage.style.display = 'none';
    if (attendeeLoadingIndicator) attendeeLoadingIndicator.style.display = 'none';
    if (rsvpConfirmationMessage) {
        rsvpConfirmationMessage.style.display = 'none';
        rsvpConfirmationMessage.textContent = '';
        rsvpConfirmationMessage.style.color = '';
    }
    _updateRSVPButtonState(null);
    currentEventId = null;
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

    if (!contentDisplayElement) { console.error("Content display element not found for", targetElement); return; }

    targetElement.classList.add('editable-field');
    targetElement.dataset.editMode = apiFieldNameOrMode;
    targetElement.dataset.originalDisplayIsHtml = originalDisplayIsHTML.toString();
    targetElement.dataset.inputType = inputType;
    if (config.contentDisplayElementId) {
        targetElement.dataset.contentDisplayElementId = config.contentDisplayElementId;
    }

    // Store initial values for reset and input field initialization
    if (apiFieldNameOrMode === 'cost') {
        // initialData is { raw_input_for_field: '...', standardized_display: '...', value: ... }
        targetElement.dataset.originalContentForReset = initialData.standardized_display || ''; // Standardized for static display
        targetElement.dataset.currentDisplayValue = initialData.raw_input_for_field || ''; // Raw text for input field
        targetElement.dataset.currentNumericValue = initialData.value === null || initialData.value === undefined ? '' : String(initialData.value);
    } else {
        const initialText = originalDisplayIsHTML ? contentDisplayElement.innerHTML : contentDisplayElement.textContent;
        targetElement.dataset.originalContentForReset = initialText;
        targetElement.dataset.currentDataValue = (apiFieldNameOrMode === 'date' && initialData)
            ? new Date(initialData).toISOString() : String(initialData || '');
    }

    const handleClickToEdit = (e) => {
        if (targetElement.dataset.isEditing === 'true' || !currentEventId) return;
        if (e.target.closest('.edit-action-button') || e.target.closest('.cost-interpretation-helper')) return;

        if (activeEditField && activeEditField.target !== targetElement) {
            if (!activeEditField.cancelChanges()) { return; }
        }

        targetElement.classList.add('is-editing-field');
        targetElement.dataset.isEditing = 'true';

        const originalStaticDisplayForCancel = targetElement.dataset.originalContentForReset; // For static display on cancel
        const initialInputFieldValue = (apiFieldNameOrMode === 'cost')
            ? targetElement.dataset.currentDisplayValue // Use raw input for cost field
            : originalStaticDisplayForCancel; // For other fields, it's the same as static

        let currentEditMode = targetElement.dataset.editMode;
        let costInterpretationHelper = null;

        if (currentEditMode === 'cost') {
            costInterpretationHelper = document.createElement('div');
            costInterpretationHelper.id = 'cost-interpretation-helper-dynamic';
            costInterpretationHelper.className = 'cost-interpretation-helper';
            document.body.appendChild(costInterpretationHelper);
        }

        targetElement.innerHTML = '';
        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'editable-input-wrapper';
        let inputElement;

        if (currentEditMode === 'cost') {
            inputElement = document.createElement('input');
            inputElement.type = 'text';
            inputElement.className = 'editable-input editable-cost-input';
            inputElement.value = initialInputFieldValue; // Raw input value
            inputWrapper.appendChild(inputElement);

            if (costInterpretationHelper) {
                const updateCostInterpretation = () => { // Renamed for clarity
                    const parsed = parseAndFormatCost(inputElement.value); // Use new helper
                    let numericValDisplay = parsed.cost_value === null || parsed.cost_value === undefined ? '<em>Not set</em>' : String(parsed.cost_value);
                    if (typeof parsed.cost_value === 'number') {
                         numericValDisplay = `<strong>${parsed.cost_value.toFixed(2)}</strong>`;
                    }
                    // Display the *standardized* version in the helper
                    costInterpretationHelper.innerHTML = `Interpreted: Display as "<strong>${parsed.cost_display_standardized}</strong>", Value as ${numericValDisplay}`;

                    const targetRect = targetElement.getBoundingClientRect();
                    costInterpretationHelper.style.position = 'absolute';
                    costInterpretationHelper.style.boxSizing = 'border-box';
                    costInterpretationHelper.style.left = `${targetRect.left + window.pageXOffset}px`;
                    costInterpretationHelper.style.top = `${targetRect.bottom + window.pageYOffset + 5}px`;
                    costInterpretationHelper.style.width = `${targetRect.width}px`;
                    costInterpretationHelper.style.textAlign = 'center';
                    costInterpretationHelper.style.zIndex = '1060';
                    costInterpretationHelper.classList.add('visible');
                };
                inputElement.addEventListener('input', updateCostInterpretation);
                inputElement.addEventListener('focus', updateCostInterpretation);
                requestAnimationFrame(updateCostInterpretation);
            }
        } else { // Non-cost fields
            if (targetElement.dataset.inputType === 'textarea') {
                inputElement = document.createElement('textarea');
            } else if (targetElement.dataset.inputType === 'datetime-local') {
                inputElement = document.createElement('input');
                inputElement.type = 'datetime-local';
                const dateVal = targetElement.dataset.currentDataValue;
                inputElement.value = (dateVal) ? new Date(new Date(dateVal).getTime() - new Date(dateVal).getTimezoneOffset() * 60000).toISOString().slice(0,16) : '';
                // For datetime, initialInputFieldValue is not directly used, but inputElement.value is set here.
            } else {
                inputElement = document.createElement('input');
                inputElement.type = 'text';
            }
            if(targetElement.dataset.inputType !== 'datetime-local') {
                inputElement.value = initialInputFieldValue; // From originalStaticDisplayForCancel
            }
            inputElement.classList.add('editable-input');
            inputWrapper.appendChild(inputElement);
        }

        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'editable-actions-container';
        const saveBtn = document.createElement('button');
        saveBtn.innerHTML = '✔'; saveBtn.className = 'edit-action-button edit-save-btn'; saveBtn.title = 'Save';
        const cancelBtn = document.createElement('button');
        cancelBtn.innerHTML = '✖'; cancelBtn.className = 'edit-action-button edit-cancel-btn'; cancelBtn.title = 'Cancel';
        actionsContainer.appendChild(saveBtn);
        actionsContainer.appendChild(cancelBtn);
        inputWrapper.appendChild(actionsContainer);
        targetElement.appendChild(inputWrapper);
        inputElement.focus();
        if (inputElement.setSelectionRange && inputType !== 'datetime-local') {
            inputElement.setSelectionRange(inputElement.value.length, inputElement.value.length);
        }

        const handleDocumentClick = (event) => {
            if (!targetElement.contains(event.target) &&
                event.target !== costInterpretationHelper &&
                !costInterpretationHelper?.contains(event.target)) {
                cancelChanges();
            }
        };

        const exitEditMode = (savedDataFromServer) => {
            document.removeEventListener('click', handleDocumentClick, true);
            if (costInterpretationHelper) costInterpretationHelper.remove();
            targetElement.innerHTML = '';

            const isHTML = targetElement.dataset.originalDisplayIsHtml === 'true';
            let finalDisplayToShow;

            if (savedDataFromServer) { // Data was saved successfully
                if (currentEditMode === 'cost') {
                    // Server returns cost_display (standardized) and cost_value
                    finalDisplayToShow = savedDataFromServer.cost_display || '';
                    targetElement.dataset.currentDisplayValue = savedDataFromServer.original_input_text || inputElement.value; // Store raw input if available from server, else current input
                    targetElement.dataset.currentNumericValue = savedDataFromServer.cost_value === null || savedDataFromServer.cost_value === undefined ? '' : String(savedDataFromServer.cost_value);
                } else if (currentEditMode === 'date') {
                    finalDisplayToShow = formatEventDateForDisplay(new Date(savedDataFromServer.date));
                    targetElement.dataset.currentDataValue = savedDataFromServer.date;
                } else if (currentEditMode === 'description') {
                    finalDisplayToShow = savedDataFromServer.description || '';
                } else {
                    finalDisplayToShow = savedDataFromServer[currentEditMode] || '';
                    targetElement.dataset.currentDataValue = finalDisplayToShow;
                }
                targetElement.dataset.originalContentForReset = finalDisplayToShow; // Update baseline for next edit
            } else { // Edit was cancelled
                finalDisplayToShow = originalStaticDisplayForCancel; // Revert to what was there before edit
                // For cost, dataset.currentDisplayValue (raw input) remains as it was at start of edit
            }

            // Update the static display element
            if (isHTML || currentEditMode === 'description') {
                contentDisplayElement.innerHTML = finalDisplayToShow;
            } else {
                contentDisplayElement.textContent = finalDisplayToShow;
            }

            if (targetElement !== contentDisplayElement && !targetElement.contains(contentDisplayElement)) {
                targetElement.appendChild(contentDisplayElement);
            }
            targetElement.classList.remove('is-editing-field');
            delete targetElement.dataset.isEditing;
            activeEditField = null;
        };

        const cancelChanges = (force = false) => {
            const isDirty = inputElement.value !== initialInputFieldValue; // Compare with input field's initial value
            if (!force && isDirty) {
                if (!window.confirm("You have unsaved changes. Are you sure you want to discard them?")) {
                    inputElement.focus(); return false;
                }
            }
            exitEditMode(null); // Pass null to indicate cancellation
            return true;
        };

        activeEditField = { target: targetElement, cancelChanges, inputElement, costInterpretationHelper };
        setTimeout(() => document.addEventListener('click', handleDocumentClick, true), 0);

        saveBtn.onclick = async () => {
            let payload = {};
            if (currentEditMode === 'cost') {
                const parsedForSave = parseAndFormatCost(inputElement.value);
                payload.cost_display = parsedForSave.cost_display_standardized; // Send standardized display
                payload.cost_value = parsedForSave.cost_value;
                payload.original_input_text = inputElement.value; // Also send the raw input
            } else if (currentEditMode === 'date') {
                if (!inputElement.value) { payload.date = null; }
                else { try { payload.date = new Date(inputElement.value).toISOString(); }
                    catch (err) { inputElement.classList.add('input-error-glow'); setTimeout(() => inputElement.classList.remove('input-error-glow'), 2000); return; }
                }
            } else {
                payload[currentEditMode] = inputElement.value;
            }

            saveBtn.classList.add('is-loading'); saveBtn.innerHTML = ''; saveBtn.disabled = true; cancelBtn.disabled = true;
            try {
                const response = await fetch(`/api/events/${currentEventId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ detail: `Update failed (${response.status})` }));
                    throw new Error(errorData.detail || `Update failed (${response.status})`);
                }
                const updatedEventDataFromServer = await response.json(); // Server should return the updated event fields
                exitEditMode(updatedEventDataFromServer);
                const eventDataUpdatedEvent = new CustomEvent('eventDataUpdated', {
                    detail: {
                        eventId: currentEventId, field: currentEditMode,
                        value: updatedEventDataFromServer, // Send the whole updated field data from server
                        fullEvent: updatedEventDataFromServer // Or the full event if server returns that
                    },
                    bubbles: true, composed: true });
                document.dispatchEvent(eventDataUpdatedEvent);
            } catch (error) {
                console.error(`Error updating ${currentEditMode}:`, error);
                const errorMsgElement = targetElement.querySelector('.edit-error-message') || document.createElement('span');
                errorMsgElement.className = 'edit-error-message'; errorMsgElement.textContent = `Error: ${error.message}`;
                if(inputWrapper && !inputWrapper.querySelector('.edit-error-message')) inputWrapper.appendChild(errorMsgElement);
                setTimeout(() => errorMsgElement.remove(), 3000);
            } finally {
                saveBtn.classList.remove('is-loading'); saveBtn.innerHTML = '✔'; saveBtn.disabled = false; cancelBtn.disabled = false;
            }
        };
        cancelBtn.onclick = () => cancelChanges();
        inputElement.onkeydown = (ev) => {
            const nonTextareaEnter = targetElement.dataset.inputType !== 'textarea' && !(currentEditMode ==='cost' && ev.shiftKey);
            if (ev.key === 'Enter' && nonTextareaEnter) { ev.preventDefault(); saveBtn.click(); }
            else if (ev.key === 'Escape') cancelChanges();
        };
    };

    if (targetElement.clickHandler) targetElement.removeEventListener('click', targetElement.clickHandler);
    targetElement.clickHandler = handleClickToEdit;
    targetElement.addEventListener('click', targetElement.clickHandler);
}
// --- End EDITABLE FIELD LOGIC ---

function _closeEventModal() {
    if (!isInitialized || !modalElement || !modalElement.classList.contains('visible')) return;
    if (activeEditField && activeEditField.cancelChanges) {
        if (!activeEditField.cancelChanges()) return;
    }
    modalElement.classList.remove('visible');
    const transitionDuration = 300;
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
        if (event.target === modalElement && !activeEditField) _closeEventModal();
    });
    if (modalRsvpControls) {
        modalRsvpControls.addEventListener('click', async (event) => {
            const button = event.target.closest('.rsvp-btn');
            if (!button) return;
            const eventId = modalRsvpControls.dataset.eventId;
            const buttonStatus = button.dataset.status;
            const apiStatus = buttonStatus === 'none' ? null : buttonStatus;
            if (!eventId) return;
            if (rsvpConfirmationMessage) {
                rsvpConfirmationMessage.textContent = "Updating RSVP...";
                rsvpConfirmationMessage.style.color = '';
                rsvpConfirmationMessage.style.display = 'block';
            }
            modalRsvpControls.style.pointerEvents = 'none';
            modalRsvpControls.style.opacity = '0.6';
            _updateRSVPButtonState(apiStatus);
            try {
                const response = await fetch(`/api/events/${eventId}/rsvp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: apiStatus })
                });
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ detail: `Update failed (${response.status})` }));
                    throw new Error(errorData.detail || `Update failed (${response.status})`);
                }
                const result = await response.json();
                if (rsvpConfirmationMessage) {
                     const friendlyStatus = result.status ? result.status.charAt(0).toUpperCase() + result.status.slice(1) : 'cleared';
                     rsvpConfirmationMessage.textContent = result.status ? `Your RSVP is set to ${friendlyStatus}!` : "Your RSVP has been cleared.";
                     setTimeout(() => { if(rsvpConfirmationMessage) rsvpConfirmationMessage.style.display = 'none'; }, 3000);
                }
                const rsvpEvent = new CustomEvent('rsvpUpdated', {
                    detail: { eventId: parseInt(eventId, 10), newStatus: result.status },
                    bubbles: true, composed: true
                });
                document.dispatchEvent(rsvpEvent);
                await _populateAttendeeList(await fetch(`/api/events/${eventId}/attendees`).then(res => res.json()));
            } catch (error) {
                console.error("Error updating RSVP:", error);
                if (rsvpConfirmationMessage) {
                    rsvpConfirmationMessage.textContent = `Error: ${error.message || 'Could not update.'}`;
                    rsvpConfirmationMessage.style.color = 'red';
                }
                await _fetchEventDetails(eventId);
            } finally {
                if (modalRsvpControls) {
                    modalRsvpControls.style.pointerEvents = 'auto';
                    modalRsvpControls.style.opacity = '1';
                }
            }
        });
    }
}

export function setupModal() {
    if (isInitialized) { console.warn("Modal already initialized."); return; }
    if (_initializeModalElements()) {
        _setupInternalModalEventListeners();
        console.log("Modal setup complete.");
    } else {
        console.error("Modal setup failed: elements not initialized.");
    }
}

export async function openEventModal(eventData) {
    if (!isInitialized) {
        console.error("Modal is not initialized. Cannot open.");
        alert("Error: Cannot display event details right now. Please try again later.");
        return;
    }
    if (!eventData || !eventData.id) {
        console.error("Cannot open modal: Invalid event data provided.", eventData);
        alert("Sorry, could not load details for this event.");
        return;
    }
    _resetModal();
    currentEventId = eventData.id;

    if (modalEventImage) modalEventImage.src = eventData.image_url || '/static/img/default-event-logo.png';
    if (modalGroupName) modalGroupName.textContent = eventData.group_name || 'Group';

    if (modalEventTitle) {
        modalEventTitle.textContent = eventData.title || 'Untitled Event';
        _makeFieldEditable(modalEventTitle, 'title', eventData.title);
    }
    if (modalEventDate) {
        modalEventDate.textContent = formatEventDateForDisplay(eventData.date ? new Date(eventData.date) : null);
        _makeFieldEditable(modalEventDate, 'date', eventData.date, { inputType: 'datetime-local' });
    }
    if (modalEventLocation) {
        modalEventLocation.textContent = eventData.location || 'Location not specified';
        _makeFieldEditable(modalEventLocation, 'location', eventData.location);
    }
    if (modalEventCost) {
        // eventData.cost_display is assumed to be the user's raw input or a previously saved raw input.
        // eventData.cost_value is the numeric value.
        // We need to parse it to get the standardized display for the static view.
        const initialRawCostInput = eventData.cost_display_raw || eventData.cost_display || 'Not specified'; // Prefer a raw field if server provides it
        const parsedInitialCost = parseAndFormatCost(initialRawCostInput);

        modalEventCost.textContent = parsedInitialCost.cost_display_standardized; // Show standardized initially

        _makeFieldEditable(modalEventCost, 'cost', {
            raw_input_for_field: initialRawCostInput, // This is what goes into the input field
            standardized_display: parsedInitialCost.cost_display_standardized, // For static display and reset
            value: parsedInitialCost.cost_value
        });
    }
    if (modalDescriptionWrapper && modalEventDescription) {
        modalEventDescription.innerHTML = eventData.description || 'No description provided.';
        _makeFieldEditable(modalDescriptionWrapper, 'description', eventData.description, {
            inputType: 'textarea', isHTML: true, contentDisplayElementId: 'modal-event-description'
        });
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
// --- END OF FILE modalManager.js ---