// --- START OF FILE static/js/eventCreationModalManager.js ---
import { parseAndFormatCost } from './modalManager.js'; // For cost parsing

let modal, form, closeButton, cancelButton, // Added cancelButton
    titleInput, dateInput, locationInput, costInput, descriptionInput,
    permissionsSection, allowOthersEditTitleCheckbox, allowOthersEditDetailsCheckbox,
    errorMessageElement, saveButton;

let currentGroupIdForEventCreation = null;
let currentNodeIdForEventCreation = null;
let isCurrentUserGroupOwner = false;
let isInitialized = false; // Flag to prevent re-initialization

async function _checkIfUserIsGroupOwner(groupId) {
    if (!groupId) return false;
    try {
        const response = await fetch(`/api/groups/${groupId}`);
        if (!response.ok) return false;
        const groupData = await response.json();
        return groupData.is_current_user_owner || false;
    } catch (error) {
        console.error("Error checking group ownership:", error);
        return false;
    }
}

function _initializeElements() {
    if (isInitialized) return true; // Already initialized

    modal = document.getElementById('event-creation-modal');
    if (!modal) {
        console.error("Event Creation Modal element (#event-creation-modal) not found.");
        return false;
    }
    form = modal.querySelector('#event-creation-form');
    closeButton = modal.querySelector('#event-creation-modal-close-btn');
    cancelButton = modal.querySelector('#event-creation-cancel-btn'); // Initialize cancel button
    titleInput = modal.querySelector('#new-event-title');
    dateInput = modal.querySelector('#new-event-date');
    locationInput = modal.querySelector('#new-event-location');
    costInput = modal.querySelector('#new-event-cost');
    descriptionInput = modal.querySelector('#new-event-description');
    
    permissionsSection = modal.querySelector('#new-event-permissions-section');
    allowOthersEditTitleCheckbox = modal.querySelector('#new-event-allow-others-edit-title');
    allowOthersEditDetailsCheckbox = modal.querySelector('#new-event-allow-others-edit-details');

    errorMessageElement = modal.querySelector('#event-creation-error-message');
    saveButton = modal.querySelector('#event-creation-save-btn');

    if (!form || !closeButton || !cancelButton || !titleInput || !dateInput || !locationInput || !costInput || !descriptionInput || !permissionsSection || !allowOthersEditTitleCheckbox || !allowOthersEditDetailsCheckbox || !errorMessageElement || !saveButton) {
        console.error("One or more essential elements for Event Creation Modal are missing.");
        modal = null; 
        return false;
    }

    // Attach event listeners only once
    closeButton.addEventListener('click', closeEventCreationModal);
    cancelButton.addEventListener('click', closeEventCreationModal);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeEventCreationModal();
        }
    });
    form.addEventListener('submit', _handleSubmit);

    isInitialized = true; // Set flag after successful initialization
    return true;
}

function _resetForm() {
    if (!form) return;
    form.reset();
    titleInput.value = 'New Event'; // Default title

    // Set default date to one hour from now
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const year = oneHourFromNow.getFullYear();
    const month = (oneHourFromNow.getMonth() + 1).toString().padStart(2, '0');
    const day = oneHourFromNow.getDate().toString().padStart(2, '0');
    const hours = oneHourFromNow.getHours().toString().padStart(2, '0');
    const minutes = oneHourFromNow.getMinutes().toString().padStart(2, '0');
    if(dateInput) dateInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
    
    if(locationInput) locationInput.value = 'TBD';
    if(costInput) costInput.value = 'Free';
    if(descriptionInput) descriptionInput.value = '';

    if (errorMessageElement) {
        errorMessageElement.textContent = '';
        errorMessageElement.style.display = 'none';
    }
    if(permissionsSection) permissionsSection.style.display = 'none';
    if(allowOthersEditTitleCheckbox) {
        allowOthersEditTitleCheckbox.checked = false;
        allowOthersEditTitleCheckbox.disabled = true;
    }
    if(allowOthersEditDetailsCheckbox) {
        allowOthersEditDetailsCheckbox.checked = false;
        allowOthersEditDetailsCheckbox.disabled = true;
    }
}

async function _handleSubmit(event) {
    event.preventDefault();
    if (!form || !currentGroupIdForEventCreation || !currentNodeIdForEventCreation) return;

    const title = titleInput.value.trim();
    const date = dateInput.value;
    const location = locationInput.value.trim();
    const costText = costInput.value.trim();
    const description = descriptionInput.value.trim();

    if (!title) {
        errorMessageElement.textContent = "Event title is required.";
        errorMessageElement.style.display = 'block';
        titleInput.focus();
        return;
    }
    if (!date) {
        errorMessageElement.textContent = "Event date and time are required.";
        errorMessageElement.style.display = 'block';
        dateInput.focus();
        return;
    }

    const parsedCost = parseAndFormatCost(costText);

    const eventData = {
        title: title,
        date: new Date(date).toISOString(),
        location: location || "TBD",
        description: description,
        cost_display: parsedCost.cost_display_standardized,
        cost_value: parsedCost.cost_value,
        is_cost_split: parsedCost.is_split_cost,
        node_id: currentNodeIdForEventCreation,
        allow_others_edit_title: isCurrentUserGroupOwner && allowOthersEditTitleCheckbox ? allowOthersEditTitleCheckbox.checked : false,
        allow_others_edit_details: isCurrentUserGroupOwner && allowOthersEditDetailsCheckbox ? allowOthersEditDetailsCheckbox.checked : false,
    };

    saveButton.disabled = true;
    saveButton.textContent = 'Creating...';
    errorMessageElement.style.display = 'none';

    try {
        const csrfTokenMeta = document.querySelector('meta[name="csrf-token"]');
        const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        if (csrfTokenMeta) headers['X-CSRFToken'] = csrfTokenMeta.getAttribute('content');

        const response = await fetch(`/api/groups/${currentGroupIdForEventCreation}/events`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(eventData)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Event creation failed (${response.status})` }));
            throw new Error(errorData.detail || errorData.error || `HTTP error ${response.status}`);
        }

        const newEventFromServer = await response.json();
        
        document.dispatchEvent(new CustomEvent('eventDataUpdated', {
            detail: { 
                eventId: newEventFromServer.id, 
                updatedEvent: newEventFromServer 
            },
            bubbles: true, composed: true
        }));

        closeEventCreationModal();

    } catch (error) {
        console.error("Error creating event:", error);
        errorMessageElement.textContent = `Error: ${error.message}`;
        errorMessageElement.style.display = 'block';
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Create Event';
    }
}

export function setupEventCreationModal() {
    if (!_initializeElements()) { // This now handles the isInitialized check
        return; 
    }
    console.log("Event Creation Modal setup complete.");
}

export async function openEventCreationModal(groupId, nodeId) {
    if (!isInitialized) { // Ensure elements are initialized before trying to use them
        console.warn("Event Creation Modal not fully initialized. Attempting setup now.");
        if(!setupEventCreationModal()){ // setup also calls _initializeElements
            alert("Error: Event creation form is not ready. Please try again or refresh.");
            return;
        }
    }
    
    currentGroupIdForEventCreation = groupId;
    currentNodeIdForEventCreation = nodeId;
    
    _resetForm(); // Reset form fields to defaults

    isCurrentUserGroupOwner = await _checkIfUserIsGroupOwner(groupId);
    
    if (permissionsSection) {
        permissionsSection.style.display = isCurrentUserGroupOwner ? 'block' : 'none';
    }
    if (allowOthersEditTitleCheckbox) allowOthersEditTitleCheckbox.disabled = !isCurrentUserGroupOwner;
    if (allowOthersEditDetailsCheckbox) allowOthersEditDetailsCheckbox.disabled = !isCurrentUserGroupOwner;

    modal.style.display = 'flex';
    requestAnimationFrame(() => {
        modal.classList.add('visible');
        if(titleInput) titleInput.focus();
    });
}

export function closeEventCreationModal() {
    if (!modal) return;
    modal.classList.remove('visible');
    setTimeout(() => {
        if (modal) modal.style.display = 'none'; // Check modal again in timeout
        _resetForm(); 
        currentGroupIdForEventCreation = null;
        currentNodeIdForEventCreation = null;
        isCurrentUserGroupOwner = false;
    }, 300); 
}

// Auto-setup if this script is loaded after DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupEventCreationModal);
} else {
    setupEventCreationModal();
}
// --- END OF FILE static/js/eventCreationModalManager.js ---