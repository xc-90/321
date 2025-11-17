function isMobileDevice() {
    const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
    const isMobileUA = mobileRegex.test(navigator.userAgent);
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const isSmallScreen = window.innerWidth <= 768;
    
    return isMobileUA || (isTouchDevice && isSmallScreen);
}

function blockMobileAccess() {
    if (isMobileDevice()) {
        document.body.innerHTML = `
            <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                background-color: #000;
                color: #fff;
                font-family: Arial, sans-serif;
                text-align: center;
                padding: 20px;">
                <h2 style="font-size: 2rem; margin-bottom: 20px;">Mobile Not Supported</h2>
            </div>
        `;
        return true;
    }
    return false;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', blockMobileAccess);
} else {
    blockMobileAccess();
}