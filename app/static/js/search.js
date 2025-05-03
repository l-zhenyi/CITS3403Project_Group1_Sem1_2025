import { debounce } from './viewportManager.js';

export function setupSearchWidget() {
    const searchWidget = document.getElementById('search-widget');
    const toggleButton = document.getElementById('search-toggle-btn');
    const searchInput = document.getElementById('user-search-input');
    const resultsDropdown = document.getElementById('search-results');

    if (!searchWidget || !toggleButton || !searchInput || !resultsDropdown) {
        // console.warn("Search widget elements not found, skipping setup.");
        return;
    }

    // --- Toggle Search Input Visibility ---
    toggleButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent body click handler below if active
        const isActive = searchWidget.classList.toggle('active');
        toggleButton.setAttribute('aria-expanded', isActive);
        if (isActive) {
            searchInput.focus(); // Focus input when opened
        } else {
            searchInput.value = ''; // Clear input when closing
            clearSearchResults(); // Hide results dropdown
        }
    });

    // --- Handle Search Input ---
    searchInput.addEventListener('input', debounce(async () => {
        const query = searchInput.value.trim();

        if (query.length < 1) { // Require at least 1 char? Adjust as needed
            clearSearchResults();
            setResultsMessage("Start typing to search...");
            return;
        }

        showLoadingState();

        try {
            const response = await fetch(`/api/search/users?q=${encodeURIComponent(query)}`);
            if (!response.ok) {
                // Try to parse error from backend
                let errorMsg = `Search failed (${response.status})`;
                try {
                    const errData = await response.json();
                    errorMsg = errData.error || errorMsg;
                } catch (e) { /* Ignore json parsing error */ }
                throw new Error(errorMsg);
            }
            const users = await response.json();
            renderSearchResults(users);

        } catch (error) {
            console.error("Search API error:", error);
            showErrorState(`Error: ${error.message}`);
        }

    }, 300)); // 300ms debounce delay

    // --- Prevent closing dropdown when clicking inside it ---
    resultsDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // --- Close dropdown if clicking outside the widget ---
    document.addEventListener('click', (e) => {
        if (!searchWidget.contains(e.target) && searchWidget.classList.contains('active')) {
            // Click was outside the active search widget
            searchWidget.classList.remove('active');
            toggleButton.setAttribute('aria-expanded', 'false');
            clearSearchResults();
            searchInput.value = ''; // Clear input
        }
    });

    window.addEventListener('resize', positionResultsDropdown);
    window.addEventListener('scroll', positionResultsDropdown);

    // --- Helper Functions for Results Dropdown ---
    function clearSearchResults() {
        resultsDropdown.innerHTML = '';
        resultsDropdown.classList.remove('visible');
    }

    function setResultsMessage(message, type = 'placeholder') {
        clearSearchResults();
        const msgDiv = document.createElement('div');
        msgDiv.className = `search-results-${type}`; // placeholder, loading, error, empty
        msgDiv.textContent = message;
        resultsDropdown.appendChild(msgDiv);
        positionResultsDropdown();
        resultsDropdown.classList.add('visible');
    }

    function showLoadingState() {
        setResultsMessage("Searching...", "loading");
    }

    function showErrorState(message) {
        setResultsMessage(message, "error");
    }

    function renderSearchResults(users) {
        clearSearchResults(); // Clear previous results or messages

        if (!users || users.length === 0) {
            setResultsMessage("No users found.", "empty");
            return;
        }

        users.forEach(user => {
            const itemLink = document.createElement('a');
            itemLink.href = `/user/${user.username}`; // Link to user profile
            itemLink.className = 'search-result-item';

            const avatar = document.createElement('img');
            avatar.src = user.avatar_url || '/static/img/default-avatar.png'; // Use provided avatar or default
            avatar.alt = `${user.username}'s avatar`;
            avatar.className = 'search-result-avatar';

            const usernameSpan = document.createElement('span');
            usernameSpan.className = 'search-result-username';
            usernameSpan.textContent = user.username;

            itemLink.appendChild(avatar);
            itemLink.appendChild(usernameSpan);
            resultsDropdown.appendChild(itemLink);
        });
        positionResultsDropdown();
        resultsDropdown.classList.add('visible'); // Make dropdown visible
    }


    function positionResultsDropdown() {
        const rect = searchWidget.getBoundingClientRect();
        resultsDropdown.style.position = 'fixed';
        resultsDropdown.style.top = `${rect.bottom + 8}px`; // 8px below the search bar
        resultsDropdown.style.left = `${rect.left}px`;
        resultsDropdown.style.width = `${rect.width}px`;
    }
}
