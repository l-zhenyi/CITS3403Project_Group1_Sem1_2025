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

// --- Cost Parsing Helper (Enhanced version) ---
function parseCostInput(inputText) {
    const text = String(inputText || '').trim();
    let cost_display = text;
    let cost_value = null;
    let interpreted_as_free = false;
    const lowerText = text.toLowerCase();

    if (['free', 'free entry', 'no cost', '0', '0.0', '0.00'].includes(lowerText)) {
        cost_display = 'Free'; cost_value = 0.0; interpreted_as_free = true;
    } else if (['donation', 'by donation', 'donations welcome', 'pay what you can', 'pwyc'].includes(lowerText)) {
        cost_display = 'By Donation'; cost_value = null;
    } else if (['varies', 'tbd', 'contact for price', 'see description'].includes(lowerText)) {
        if (lowerText === 'varies') cost_display = 'Varies';
        else if (lowerText === 'tbd') cost_display = 'TBD';
        else if (lowerText === 'contact for price') cost_display = 'Contact for Price';
        else if (lowerText === 'see description') cost_display = 'See Description';
        else cost_display = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
        cost_value = null;
    } else if (!interpreted_as_free) {
        let numericString = lowerText.replace(/(usd|eur|gbp|jpy|aud|cad)/gi, '');
        numericString = numericString.replace(/\s*(per person|pp)\s*/gi, '');
        numericString = numericString.replace(/[$,€£¥₹]/g, '');
        const centsMatch = numericString.match(/^(\d+)\s*(c|cent|cents)$/);
        if (centsMatch) {
            const cents = parseInt(centsMatch[1], 10);
            if (!isNaN(cents)) { cost_value = cents / 100.0; /* cost_display = text; // Keep original for display */ }
        } else {
            // Allow for formats like "1,500.50" or "1500.50"
            const potentialValue = parseFloat(numericString.replace(/,/g, ''));
            if (!isNaN(potentialValue)) { cost_value = potentialValue; /* cost_display = text; or reformat */ }
        }
    }
    return { cost_display, cost_value };
}

let modalElement, modalContent, closeButton, modalEventImage, modalEventTitle,
    modalGroupName, modalEventDate, modalEventLocation, modalEventCost,
    modalEventDescription, modalDescriptionWrapper,
    modalRsvpControls, rsvpButtons = [], rsvpConfirmationMessage,
    clearRsvpButton, modalAttendeeList, modalAttendeeCount, attendeeListContainer,
    attendeeListMessage, attendeeLoadingIndicator;
    // NO global costInterpretationHelperElement reference here anymore

let currentEventId = null;
let isInitialized = false;
let activeEditField = null; // Will store { target, cancelChanges, inputElement, costInterpretationHelper (if any) }

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

    // No helper element to initialize here from HTML

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
        activeEditField.cancelChanges(true); // This will also remove the helper if it exists
    }
    activeEditField = null;

    // No need to query for stray helpers if they are managed by activeEditField

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
        delete field.dataset.currentDisplayValue;
        delete field.dataset.currentNumericValue;
        delete field.dataset.currentDataValue;
    });

    if (modalEventImage) modalEventImage.setAttribute('src', '/static/img/default-event-logo.png');
    if (modalEventTitle) modalEventTitle.textContent = 'Loading...';
    // ... (rest of modal element resets)
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
function _makeFieldEditable(targetElement, apiFieldName, initialValue, config = {}) {
    if (!targetElement || targetElement.dataset.isEditing === 'true') {
        return;
    }

    const inputType = config.inputType || 'text';
    const originalDisplayIsHTML = config.isHTML || false;
    // If not specified, targetElement itself is the content display.
    const contentDisplayElement = config.contentDisplayElementId 
    const contentDisplayElement = config.contentDisplayElementId
        ? document.getElementById(config.contentDisplayElementId)
        : targetElement;

    if (!contentDisplayElement) {
        console.error("Content display element not found for", targetElement);
        return;
    }

    if (!contentDisplayElement) { console.error("Content display element not found for", targetElement); return; }

    targetElement.classList.add('editable-field');
    targetElement.dataset.apiFieldName = apiFieldName;
    targetElement.dataset.originalContentForReset = originalDisplayIsHTML ? contentDisplayElement.innerHTML : contentDisplayElement.textContent;
    targetElement.dataset.editMode = apiFieldNameOrMode;
    targetElement.dataset.originalDisplayIsHtml = originalDisplayIsHTML.toString();
    targetElement.dataset.inputType = inputType;
    if (config.contentDisplayElementId) {
        targetElement.dataset.contentDisplayElementId = config.contentDisplayElementId;
    }


    targetElement.dataset.currentDataValue = (apiFieldName === 'date' && initialValue)
        ? new Date(initialValue).toISOString()
        : String(initialValue || '');


    const handleClickToEdit = (e) => {
        if (targetElement.dataset.isEditing === 'true' || !currentEventId) return;
        if (e.target.closest('.edit-action-button')) return;

        if (activeEditField && activeEditField.target !== targetElement) {
            if (!activeEditField.cancelChanges()) { 
                return; 
            }
        }

        targetElement.classList.add('is-editing-field');
        targetElement.dataset.isEditing = 'true';

        // Store the current visual display for cancellation (from the actual display element)
        const originalVisualForCancel = targetElement.dataset.originalContentForReset;
        const currentValueForInput = targetElement.dataset.currentDataValue;
        // This is what the input field will be populated with initially.
        const initialInputValueForDirtyCheck = (apiFieldName === 'date' && currentValueForInput)
            ? new Date(new Date(currentValueForInput).getTime() - new Date(currentValueForInput).getTimezoneOffset() * 60000).toISOString().slice(0,16)
            : currentValueForInput;

        targetElement.innerHTML = ''; // Clear the targetElement (e.g., the wrapper)
        }

        targetElement.innerHTML = '';
        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'editable-input-wrapper';

        let inputElement;
        if (currentEditMode === 'cost') {
            inputElement = document.createElement('input');
            inputElement.type = 'text';
            inputElement.className = 'editable-input editable-cost-input';
            inputElement.value = targetElement.dataset.currentDisplayValue || '';
            initialInputValueForDirtyCheck = inputElement.value;
            inputWrapper.appendChild(inputElement);

            if (costInterpretationHelper) { // This check is fine
                const updateCostInterpretation = () => {
                    const parsed = parseCostInput(inputElement.value);
                    let numericValDisplay = parsed.cost_value === null || parsed.cost_value === undefined ? '<em>Not set</em>' : String(parsed.cost_value);
                    if (typeof parsed.cost_value === 'number') {
                         numericValDisplay = `<strong>${parsed.cost_value.toFixed(2)}</strong>`;
                    }
                    costInterpretationHelper.innerHTML = `Interpreted: Display as "<strong>${parsed.cost_display}</strong>", Value as ${numericValDisplay}`;

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
        } else {
            if (targetElement.dataset.inputType === 'textarea') {
                inputElement = document.createElement('textarea');
                inputElement.value = originalVisualForCancel;
            } else if (targetElement.dataset.inputType === 'datetime-local') {
                inputElement = document.createElement('input');
                inputElement.type = 'datetime-local';
                const dateVal = targetElement.dataset.currentDataValue;
                inputElement.value = (dateVal) ? new Date(new Date(dateVal).getTime() - new Date(dateVal).getTimezoneOffset() * 60000).toISOString().slice(0,16) : '';
            } else {
                inputElement = document.createElement('input');
                inputElement.type = 'text';
                inputElement.value = originalVisualForCancel;
            }
            initialInputValueForDirtyCheck = inputElement.value;
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
            // costInterpretationHelper will be null if not in cost mode, this is fine.
            if (!targetElement.contains(event.target) &&
                event.target !== costInterpretationHelper &&
                !costInterpretationHelper?.contains(event.target)
               ) {
                cancelChanges();
            }
        };

        const exitEditMode = (savedServerData) => {
            document.removeEventListener('click', handleDocumentClick, true);

            if (costInterpretationHelper) { // This is correct
                costInterpretationHelper.remove();
            }

            targetElement.innerHTML = '';
            const isHTMLContent = targetElement.dataset.originalDisplayIsHtml === 'true';

            if (savedServerData !== undefined) {
                let newDisplayToShow;
                if (currentEditMode === 'cost') {
                    newDisplayToShow = savedServerData.cost_display;
                    targetElement.dataset.currentDisplayValue = savedServerData.cost_display || '';
                    targetElement.dataset.currentNumericValue = savedServerData.cost_value === null || savedServerData.cost_value === undefined ? '' : String(savedServerData.cost_value);
                } else if (currentEditMode === 'description') {
                    newDisplayToShow = savedServerData.description;
                } else if (currentEditMode === 'date') {
                    newDisplayToShow = formatEventDateForDisplay(new Date(savedServerData.date));
                    targetElement.dataset.currentDataValue = savedServerData.date;
                } else {
                    newDisplayToShow = savedServerData[currentEditMode];
                    targetElement.dataset.currentDataValue = newDisplayToShow;
                }
                if (isHTMLContent || currentEditMode === 'description') { contentDisplayElement.innerHTML = newDisplayToShow || ''; }
                else { contentDisplayElement.textContent = newDisplayToShow || ''; }
                targetElement.dataset.originalContentForReset = newDisplayToShow || '';
            } else {
                if (isHTMLContent) { contentDisplayElement.innerHTML = originalVisualForCancel; }
                else { contentDisplayElement.textContent = originalVisualForCancel; }
            }
            if (targetElement !== contentDisplayElement && !targetElement.contains(contentDisplayElement)) {
                 targetElement.appendChild(contentDisplayElement);
            }
            targetElement.classList.remove('is-editing-field');
            delete targetElement.dataset.isEditing;
            activeEditField = null;
        };

        const cancelChanges = (force = false) => {
            const isDirty = inputElement.value !== initialInputValueForDirtyCheck;
            if (!force && isDirty) {
                if (!window.confirm("You have unsaved changes. Are you sure you want to discard them?")) {
                    inputElement.focus(); return false;
                }
            }
            exitEditMode();
            return true;
        };

        // ***** THE FIX IS HERE *****
        // Use the correctly scoped variable `costInterpretationHelper`
        activeEditField = { target: targetElement, cancelChanges, inputElement, costInterpretationHelper };
        // ***** END OF FIX *****

        setTimeout(() => {
            document.addEventListener('click', handleDocumentClick, true);
        }, 0);

        saveBtn.onclick = async () => {
            let payload = {};
            let apiActualFieldName = currentEditMode;
            if (currentEditMode === 'cost') {
                const parsed = parseCostInput(inputElement.value);
                payload.cost_display = parsed.cost_display;
                payload.cost_value = parsed.cost_value;
            } else if (currentEditMode === 'date') {
                if (!inputElement.value) { payload[apiActualFieldName] = null; }
                else { try { payload[apiActualFieldName] = new Date(inputElement.value).toISOString(); }
                    catch (err) { inputElement.classList.add('input-error-glow'); setTimeout(() => inputElement.classList.remove('input-error-glow'), 2000); return; }
                }
            } else { payload[apiActualFieldName] = inputElement.value; }
            saveBtn.classList.add('is-loading'); saveBtn.innerHTML = ''; saveBtn.disabled = true; cancelBtn.disabled = true;
            try {
                const response = await fetch(`/api/events/${currentEventId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ detail: `Update failed (${response.status})` }));
                    throw new Error(errorData.detail || `Update failed (${response.status})`);
                }
                const updatedEvent = await response.json();
                exitEditMode(updatedEvent);
                const eventDataUpdatedEvent = new CustomEvent('eventDataUpdated', {
                    detail: { eventId: currentEventId, field: currentEditMode, value: (currentEditMode === 'cost' ? payload : updatedEvent[currentEditMode]), fullEvent: updatedEvent },
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
        cancelBtn.onclick = () => { cancelChanges(); };
        inputElement.onkeydown = (ev) => {
            const nonTextareaEnter = targetElement.dataset.inputType !== 'textarea' && !(currentEditMode ==='cost' && ev.shiftKey);
            if (ev.key === 'Enter' && nonTextareaEnter) { ev.preventDefault(); saveBtn.click(); }
            else if (ev.key === 'Escape') { cancelChanges(); }
        };
    };

    if (targetElement.clickHandler) { targetElement.removeEventListener('click', targetElement.clickHandler); }
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
    if (closeButton) {
        closeButton.addEventListener('click', _closeEventModal);
    }
    modalElement.addEventListener('click', (event) => {
        if (event.target === modalElement && !activeEditField) {
            _closeEventModal();
        }
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
                await _fetchEventDetails(eventId); // Re-fetch to ensure consistent state
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
    if (isInitialized) {
        console.warn("Modal already initialized."); return;
    }
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
        const initialCostDisplay = eventData.cost_display || 'No cost information';
        modalEventCost.textContent = initialCostDisplay;
        _makeFieldEditable(modalEventCost, 'cost',
            { display: initialCostDisplay, value: eventData.cost_value } // Pass object
        );
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
    requestAnimationFrame(() => {
        modalElement.classList.add('visible');
    });

    await _fetchEventDetails(eventData.id);
}

// --- END OF FILE modalManager.js ---