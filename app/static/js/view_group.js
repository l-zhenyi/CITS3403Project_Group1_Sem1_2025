document.addEventListener("DOMContentLoaded", () => {
    const messageFeed = document.querySelector(".message-feed");
    if (messageFeed) {
        messageFeed.scrollTo({
            top: messageFeed.scrollHeight,
            behavior: "smooth"
        });
    }
});

