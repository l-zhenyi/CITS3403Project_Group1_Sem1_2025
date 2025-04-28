// --- START OF FILE modalManager.js ---

// --- Date Formatting Helper (Copied here for self-containment) ---
// Consider moving to a shared utils.js if used elsewhere extensively
function formatEventDateForDisplay(date) {
    if (!date || !(date instanceof Date)) return 'Date not specified';
    try {
        if (isNaN(date.getTime())) return 'Invalid Date';
        return date.toLocaleString(undefined, {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true
        });
    } catch (e) {
        console.error("Error formatting date:", date, e);
        return 'Error displaying date';
    }
}
// --- End Date Formatting ---


// --- Module-Scoped Variables for DOM Elements ---
let modalElement, modalContent, closeButton, modalEventImage, modalEventTitle,
    modalGroupName, modalEventDate, modalEventLocation, modalEventCost,
    modalEventDescription, modalRsvpControls, rsvpButtons = [], rsvpConfirmationMessage,
    clearRsvpButton, modalAttendeeList, modalAttendeeCount, attendeeListContainer,
    attendeeListMessage, attendeeLoadingIndicator;

let isInitialized = false;

// --- Internal Helper Functions ---

function _initializeModalElements() {
    modalElement = document.getElementById('event-details-modal');
    if (!modalElement) {
        console.error("Modal element (#event-details-modal) not found!");
        return false;
    }
    // Use optional chaining safely for finding sub-elements
    modalContent = modalElement.querySelector('.modal-content');
    closeButton = modalElement.querySelector('.modal-close-btn');
    modalEventImage = modalElement.querySelector('#modal-event-image-header'); // Use querySelector within modal
    modalEventTitle = modalElement.querySelector('#modal-event-title');
    modalGroupName = modalElement.querySelector('#modal-group-name');
    modalEventDate = modalElement.querySelector('#modal-event-date');
    modalEventLocation = modalElement.querySelector('#modal-event-location');
    modalEventCost = modalElement.querySelector('#modal-event-cost');
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

    // Basic check for essential elements
    if (!modalContent || !closeButton || !modalEventTitle) {
        console.error("One or more essential modal sub-elements not found!");
        return false;
    }
    console.log("Modal elements initialized successfully.");
    isInitialized = true;
    return true;
}

function _resetModal() {
    if (!isInitialized) return;
    console.log("Resetting modal content.");

    if (modalEventImage) modalEventImage.setAttribute('src', '/static/img/default-event-logo.png');
    if (modalEventTitle) modalEventTitle.textContent = 'Loading...';
    if (modalGroupName) modalGroupName.textContent = 'Loading...';
    if (modalEventDate) modalEventDate.textContent = 'Loading...';
    if (modalEventLocation) modalEventLocation.textContent = 'Loading...';
    if (modalEventCost) modalEventCost.textContent = 'Loading...';
    if (modalEventDescription) modalEventDescription.textContent = 'Loading...';
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

    if (normalizedStatus && normalizedStatus !== 'none') {
        const activeButton = modalRsvpControls?.querySelector(`.rsvp-btn[data-status="${normalizedStatus}"]`);
        if (activeButton) activeButton.setAttribute('aria-pressed', 'true');
        if (clearRsvpButton) clearRsvpButton.style.display = 'inline-flex';
    } else {
        if (clearRsvpButton) clearRsvpButton.style.display = 'none';
    }
}

async function _fetchEventDetails(eventId) {
    if (!isInitialized || !attendeeLoadingIndicator || !attendeeListMessage || !attendeeListContainer || !modalRsvpControls) return;
    console.log(`Fetching details for event ID: ${eventId}`);

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

        if (!attendeesRes.ok) throw new Error(`Attendees fetch failed: ${attendeesRes.status} ${attendeesRes.statusText}`);
        if (!myRsvpRes.ok) throw new Error(`RSVP fetch failed: ${myRsvpRes.status} ${myRsvpRes.statusText}`);

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
    } finally {
        if (attendeeLoadingIndicator) attendeeLoadingIndicator.style.display = 'none';
        if (modalRsvpControls) {
            modalRsvpControls.style.pointerEvents = 'auto';
            modalRsvpControls.style.opacity = '1';
        }
    }
}

function _closeEventModal() {
    if (!isInitialized || !modalElement || !modalElement.classList.contains('visible')) return;
    console.log("Closing modal (internal).");

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
    setTimeout(() => { // Fallback
        if (modalElement.style.display !== 'none') {
            modalElement.style.display = 'none';
            modalElement.removeEventListener('transitionend', handleTransitionEnd);
            _resetModal();
        }
    }, transitionDuration + 50);
}

function _setupInternalModalEventListeners() {
    if (!isInitialized) return;

    // Listener to close the modal via button
    if (closeButton) {
        closeButton.addEventListener('click', _closeEventModal);
    } else {
        console.warn("Modal close button not found during internal setup.");
    }

    // Listener to close modal on backdrop click
    modalElement.addEventListener('click', (event) => {
        if (event.target === modalElement) {
            _closeEventModal();
        }
    });

    // Listener for RSVP button clicks
    if (modalRsvpControls) {
        modalRsvpControls.addEventListener('click', async (event) => {
            const button = event.target.closest('.rsvp-btn');
            if (!button) return;

            const eventId = modalRsvpControls.dataset.eventId;
            const newStatus = button.dataset.status;
            const apiStatus = newStatus === 'none' ? null : newStatus;
            if (!eventId) return;

            console.log(`RSVP button clicked: Event ID ${eventId}, Status: ${newStatus}`);

            if (rsvpConfirmationMessage) {
                rsvpConfirmationMessage.textContent = "Updating RSVP...";
                rsvpConfirmationMessage.style.color = '';
                rsvpConfirmationMessage.style.display = 'block';
            }
            modalRsvpControls.style.pointerEvents = 'none';
            modalRsvpControls.style.opacity = '0.6';
            _updateRSVPButtonState(apiStatus); // Optimistic UI update

            try {
                const response = await fetch(`/api/events/${eventId}/rsvp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: apiStatus })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ detail: 'Update failed.' }));
                    throw new Error(errorData.detail || `Update failed (${response.status})`);
                }
                const result = await response.json();
                console.log("RSVP update successful:", result);

                if (rsvpConfirmationMessage) {
                     rsvpConfirmationMessage.textContent = apiStatus ? `Your RSVP is set to ${newStatus}!` : "Your RSVP has been cleared.";
                     setTimeout(() => { if(rsvpConfirmationMessage) rsvpConfirmationMessage.style.display = 'none'; }, 3000);
                }

                await _fetchEventDetails(eventId); // Refresh list

            } catch (error) {
                console.error("Error updating RSVP:", error);
                if (rsvpConfirmationMessage) {
                    rsvpConfirmationMessage.textContent = `Error: ${error.message || 'Could not update.'}`;
                    rsvpConfirmationMessage.style.color = 'red';
                }
                // Re-enable buttons even on error (handled by finally in _fetchEventDetails)
                // but ensure state reflects reality by re-fetching
                await _fetchEventDetails(eventId); // Fetch again to potentially revert optimistic UI
            }
             // _fetchEventDetails re-enables controls in its finally block
        });
    } else {
        console.warn("RSVP controls container not found during internal setup.");
    }
     console.log("Internal modal event listeners set up.");
}


// --- Exported Functions ---

/**
 * Initializes the modal elements and sets up internal event listeners.
 * Should be called once when the DOM is ready.
 */
export function setupModal() {
    if (isInitialized) {
        console.warn("Modal already initialized.");
        return;
    }
    if (_initializeModalElements()) {
        _setupInternalModalEventListeners();
    } else {
        console.error("Modal setup failed because elements could not be initialized.");
    }
}

/**
 * Opens the event details modal and populates it with data.
 * @param {object} eventData The event data object (must include id, title, etc.)
 */
export async function openEventModal(eventData) {
    if (!isInitialized) {
        console.error("Modal is not initialized. Cannot open.");
        alert("Cannot display event details right now.");
        return;
    }
    if (!eventData || !eventData.id) {
        console.error("Cannot open modal: Invalid event data provided.", eventData);
        alert("Sorry, could not load details for this event.");
        return;
    }
    console.log("Opening modal externally for event:", eventData.title);

    _resetModal(); // Clear previous content

    // Populate initial known data
    if (modalEventImage) modalEventImage.src = eventData.image_url || '/static/img/default-event-logo.png';
    if (modalEventTitle) modalEventTitle.textContent = eventData.title || 'Untitled Event';
    if (modalGroupName) modalGroupName.textContent = eventData.group_name || 'Group'; // Assuming group_name is available
    if (modalEventDate) modalEventDate.textContent = formatEventDateForDisplay(eventData.date ? new Date(eventData.date) : null);
    if (modalEventLocation) modalEventLocation.textContent = eventData.location || 'Location not specified';
    if (modalEventCost) modalEventCost.textContent = eventData.cost_display || 'No cost information provided';
    if (modalEventDescription) modalEventDescription.textContent = eventData.description || 'No description provided.';
    if (modalRsvpControls) {
        modalRsvpControls.dataset.eventId = eventData.id;
        modalRsvpControls.style.display = 'flex';
        modalRsvpControls.style.pointerEvents = 'none'; // Disable until async data loads
        modalRsvpControls.style.opacity = '0.6';
    }

    // Show the modal
    modalElement.style.display = 'flex';
    requestAnimationFrame(() => {
        modalElement.classList.add('visible');
    });

    // Fetch async details
    await _fetchEventDetails(eventData.id);
}

// --- END OF FILE modalManager.js ---