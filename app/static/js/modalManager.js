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
    // console.log("Resetting modal content."); // Less noisy logs

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
            // Ensure status mapping matches your backend and desired display classes
            const status = attendee.status?.toLowerCase() || 'unknown'; // going, maybe, not_going, etc.
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

    // Normalize status to match data-status attributes (e.g., 'going', 'maybe', 'not_going')
    const normalizedStatus = status?.toLowerCase();
    rsvpButtons.forEach(btn => btn.setAttribute('aria-pressed', 'false'));

    // Check if status is one of the valid RSVP states (not null or 'none')
    if (normalizedStatus && ['attending', 'maybe', 'declined'].includes(normalizedStatus)) {
        const activeButton = modalRsvpControls?.querySelector(`.rsvp-btn[data-status="${normalizedStatus}"]`);
        if (activeButton) activeButton.setAttribute('aria-pressed', 'true');
        if (clearRsvpButton) clearRsvpButton.style.display = 'inline-flex';
    } else {
        // If status is null, undefined, or 'none', no button is active
        if (clearRsvpButton) clearRsvpButton.style.display = 'none';
    }
}

async function _fetchEventDetails(eventId) {
    if (!isInitialized || !attendeeLoadingIndicator || !attendeeListMessage || !attendeeListContainer || !modalRsvpControls) return;
    // console.log(`Fetching details for event ID: ${eventId}`); // Less noisy

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

        // Simplified error check
        if (!attendeesRes.ok || !myRsvpRes.ok) {
             throw new Error(`Failed to fetch details (${attendeesRes.status}/${myRsvpRes.status})`);
        }

        const attendees = await attendeesRes.json();
        const myRsvp = await myRsvpRes.json();

        _populateAttendeeList(attendees);
        _updateRSVPButtonState(myRsvp.status); // Pass the status fetched from the API

    } catch (error) {
        console.error("Error fetching event details:", error);
        if (attendeeListMessage) {
            attendeeListMessage.textContent = `Error loading details: ${error.message}`;
            attendeeListMessage.style.display = 'block';
        }
        _updateRSVPButtonState(null); // Reset button state on error
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
    // console.log("Closing modal (internal)."); // Less noisy

    modalElement.classList.remove('visible');
    const transitionDuration = 300; // Match CSS transition duration

    // Use transitionend for smoother closing
    const handleTransitionEnd = (event) => {
        // Make sure it's the modal itself and the opacity transition
        if (event.target === modalElement && event.propertyName === 'opacity') {
            modalElement.style.display = 'none'; // Hide after fade out
            modalElement.removeEventListener('transitionend', handleTransitionEnd);
            _resetModal(); // Reset content AFTER hiding
        }
    };
    modalElement.addEventListener('transitionend', handleTransitionEnd);

    // Fallback timer in case transitionend doesn't fire (e.g., interrupted transition)
    setTimeout(() => {
        if (modalElement.style.display !== 'none') { // Check if still visible
             console.warn("Modal transitionend fallback triggered.");
            modalElement.style.display = 'none';
            modalElement.removeEventListener('transitionend', handleTransitionEnd);
            _resetModal();
        }
    }, transitionDuration + 50); // Slightly longer than transition
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
        // Only close if the click is directly on the modal backdrop (modalElement)
        // and not on its content (modalContent) or children
        if (event.target === modalElement) {
            _closeEventModal();
        }
    });

    // --- Listener for RSVP button clicks (with event dispatch) ---
    if (modalRsvpControls) {
        modalRsvpControls.addEventListener('click', async (event) => {
            const button = event.target.closest('.rsvp-btn');
            if (!button) return; // Ignore clicks not on a button

            const eventId = modalRsvpControls.dataset.eventId;
            // Get status from button ('going', 'maybe', 'not_going', 'none')
            const buttonStatus = button.dataset.status;
            // Translate 'none' to null for the API, keep others as is
            const apiStatus = buttonStatus === 'none' ? null : buttonStatus;

            if (!eventId) {
                console.error("Cannot update RSVP: eventId missing from controls.");
                return;
            }

            console.log(`RSVP button clicked: Event ID ${eventId}, Button Status: ${buttonStatus}, API Status: ${apiStatus}`);

            // --- UI Feedback ---
            if (rsvpConfirmationMessage) {
                rsvpConfirmationMessage.textContent = "Updating RSVP...";
                rsvpConfirmationMessage.style.color = ''; // Reset color
                rsvpConfirmationMessage.style.display = 'block';
            }
            modalRsvpControls.style.pointerEvents = 'none';
            modalRsvpControls.style.opacity = '0.6';
            _updateRSVPButtonState(apiStatus); // Optimistic UI update for button state

            try {
                // --- API Call ---
                const response = await fetch(`/api/events/${eventId}/rsvp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: apiStatus }) // Send 'going', 'maybe', 'not_going', or null
                });

                if (!response.ok) {
                    // Try to get error detail from backend response
                    const errorData = await response.json().catch(() => ({ detail: `Update failed (${response.status})` }));
                    throw new Error(errorData.detail || `Update failed (${response.status})`);
                }

                // --- Success ---
                const result = await response.json(); // result should contain { message: "...", status: "..." }
                console.log("RSVP update successful:", result);

                // Update confirmation message based on the *actual* status returned by the API
                if (rsvpConfirmationMessage) {
                     const friendlyStatus = result.status ? result.status.charAt(0).toUpperCase() + result.status.slice(1) : 'cleared';
                     rsvpConfirmationMessage.textContent = result.status ? `Your RSVP is set to ${friendlyStatus}!` : "Your RSVP has been cleared.";
                     setTimeout(() => { if(rsvpConfirmationMessage) rsvpConfirmationMessage.style.display = 'none'; }, 3000);
                }

                // --- !!! DISPATCH EVENT FOR ORBIT LAYOUT !!! ---
                const rsvpEvent = new CustomEvent('rsvpUpdated', {
                    detail: {
                        eventId: parseInt(eventId, 10), // Ensure it's a number
                        newStatus: result.status // Use the status from the API response!
                    },
                    bubbles: true,
                    composed: true
                });
                document.dispatchEvent(rsvpEvent);
                console.log(`[modalManager] Dispatched 'rsvpUpdated' event. Detail:`, rsvpEvent.detail);
                // --- !!! END DISPATCH EVENT !!! ---

                // Refresh attendee list in the modal AFTER dispatching
                // No need to call _fetchEventDetails unless you want to refresh attendees immediately
                // _updateRSVPButtonState was already called optimistically and the backend confirmed via result.status
                // If you need the attendee list refreshed:
                await _populateAttendeeList(await fetch(`/api/events/${eventId}/attendees`).then(res => res.json()));


            } catch (error) {
                // --- Error Handling ---
                console.error("Error updating RSVP:", error);
                if (rsvpConfirmationMessage) {
                    rsvpConfirmationMessage.textContent = `Error: ${error.message || 'Could not update.'}`;
                    rsvpConfirmationMessage.style.color = 'red';
                    // Optionally hide the error message after a delay
                    // setTimeout(() => { if(rsvpConfirmationMessage) rsvpConfirmationMessage.style.display = 'none'; }, 5000);
                }
                // Fetch the *actual* current state on error to revert optimistic UI
                console.log("Re-fetching details after RSVP error...");
                await _fetchEventDetails(eventId);

            } finally {
                // --- Re-enable Controls ---
                // This happens regardless of success/error after fetching details or catching error
                if (modalRsvpControls) {
                    modalRsvpControls.style.pointerEvents = 'auto';
                    modalRsvpControls.style.opacity = '1';
                }
            }
        });
    } else {
        console.warn("RSVP controls container not found during internal setup.");
    }
     // console.log("Internal modal event listeners set up."); // Less noisy
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
        // Provide user feedback directly if possible
        alert("Error: Cannot display event details right now. Please try again later.");
        return;
    }
    if (!eventData || !eventData.id) {
        console.error("Cannot open modal: Invalid event data provided.", eventData);
        alert("Sorry, could not load details for this event.");
        return;
    }
    console.log(`Opening modal for event: ${eventData.title} (ID: ${eventData.id})`);

    _resetModal(); // Clear previous content immediately

    // Populate initial known data from the object passed in
    // These details don't require an extra fetch if already available
    if (modalEventImage) modalEventImage.src = eventData.image_url || '/static/img/default-event-logo.png';
    if (modalEventTitle) modalEventTitle.textContent = eventData.title || 'Untitled Event';
    if (modalGroupName) modalGroupName.textContent = eventData.group_name || 'Group'; // Make sure 'group_name' is in eventData if needed
    if (modalEventDate) modalEventDate.textContent = formatEventDateForDisplay(eventData.date ? new Date(eventData.date) : null);
    if (modalEventLocation) modalEventLocation.textContent = eventData.location || 'Location not specified';
    if (modalEventCost) modalEventCost.textContent = eventData.cost_display || 'No cost information provided';
    if (modalEventDescription) modalEventDescription.innerHTML = eventData.description || 'No description provided.'; // Use innerHTML if description might contain HTML
    if (modalRsvpControls) {
        modalRsvpControls.dataset.eventId = eventData.id;
        modalRsvpControls.style.display = 'flex'; // Show controls
        // Controls initially disabled until async data loads
        modalRsvpControls.style.pointerEvents = 'none';
        modalRsvpControls.style.opacity = '0.6';
    }

    // Show the modal using CSS transition
    modalElement.style.display = 'flex'; // Make it visible for transition
    // Use requestAnimationFrame to ensure 'display: flex' is applied before adding 'visible' class
    requestAnimationFrame(() => {
        modalElement.classList.add('visible');
    });

    // Fetch async details (attendees and MY rsvp status)
    // This will update the attendee list and the RSVP button state
    await _fetchEventDetails(eventData.id);
}

// --- END OF FILE modalManager.js ---