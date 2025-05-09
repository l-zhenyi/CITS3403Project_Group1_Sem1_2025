document.addEventListener("DOMContentLoaded", () => {
    const chatContainer = document.querySelector(".messages-section");
    if (chatContainer) {
        chatContainer.classList.add("animate-down");
    }

    const messageFeed = document.querySelector(".message-feed");
    if (messageFeed) {
        messageFeed.scrollTo({
            top: messageFeed.scrollHeight,
            behavior: "smooth"
        });
    }
});
