// Establish UI element hooks
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('imageInput');
const browseBtn = document.getElementById('browseBtn');
const processingUI = document.getElementById('processingUI');
const resultsArea = document.getElementById('resultsArea');
const controls = document.getElementById('controls');
const previewImage = document.getElementById('previewImage');
const resultImage = document.getElementById('resultImage');

// ==========================================
// Telemetry & Analytics Wrapper
// ==========================================

function trackEvent(action, params = {}) {
    if (typeof gtag === 'function') {
        gtag('event', action, params);
    }
    console.log(`[Analytics Event Tracker] ${action}`, params); // UI Debugging
}

// ==========================================
// File Input & Drag/Drop Mechanics
// ==========================================

browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
dropZone.addEventListener('click', () => { fileInput.click(); });
fileInput.addEventListener('change', handleFileSelection);

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
});
function preventDefaults(e) {
    e.preventDefault(); e.stopPropagation();
}
['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add('active'));
});
['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('active'));
});
dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer; fileInput.files = dt.files; handleFileSelection();
});

// ==========================================
// Processing Logic
// ==========================================

function handleFileSelection() {
    if (!fileInput.files.length) return;
    const file = fileInput.files[0];
    if (!file.type.startsWith('image/')) { alert('Please upload a valid image file!'); return; }

    const reader = new FileReader();
    reader.onload = (e) => { previewImage.src = e.target.result; };
    reader.readAsDataURL(file);

    dropZone.style.display = 'none';
    processingUI.style.display = 'flex';
    resultsArea.style.display = 'none';
    controls.style.display = 'none';

    uploadImage(file);
}

async function uploadImage(file) {
    const formData = new FormData(); formData.append('image', file);
    try {
        const res = await fetch('/remove-bg', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to successfully connect to API proxy.");
        
        resultImage.src = data.image + "?t=" + new Date().getTime(); 
        processingUI.style.display = 'none';
        resultsArea.style.display = 'grid';
        controls.style.display = 'flex'; // Flexible control box
        trackEvent('extract_success', { file_size: file.size });
    } catch(err) {
        console.error(err);
        alert("Error: " + err.message + "\nDid you set your API Key in server.js?");
        resetApp(); 
    }
}

window.resetApp = function() {
    fileInput.value = '';
    dropZone.style.display = 'block';
    processingUI.style.display = 'none';
    resultsArea.style.display = 'none';
    controls.style.display = 'none';
    previewImage.src = '';
    resultImage.src = '';
};

// ==========================================
// Downloader, Compositing & Formatting
// ==========================================

let customBgImage = null;

// Read custom background image from user
document.getElementById('bgImageInput').addEventListener('change', function(e) {
    if (e.target.files && e.target.files[0]) {
        const reader = new FileReader();
        reader.onload = function(event) {
            customBgImage = new Image();
            customBgImage.onload = () => updatePreviewBackground();
            customBgImage.src = event.target.result;
        }
        reader.readAsDataURL(e.target.files[0]);
    } else {
        customBgImage = null;
        updatePreviewBackground();
    }
});

function constructFinalCanvas(forcePassport = false) {
    const img = document.getElementById('resultImage');
    const pos = document.getElementById('subjectPosition').value;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Bounds definitions
    if (forcePassport) {
        canvas.width = 600; canvas.height = 600;
    } else if (customBgImage) {
        canvas.width = customBgImage.width; canvas.height = customBgImage.height;
    } else {
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    }

    // Paint Solid Background Base
    const format = document.getElementById('formatSelect').value;
    const useBg = document.getElementById('useBgColor').checked;
    const bgColor = document.getElementById('bgColor').value;
    if (useBg || (format === 'jpeg' && !customBgImage)) {
        ctx.fillStyle = useBg ? bgColor : '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    // Paint Image Background Layer
    if (customBgImage && !forcePassport) {
        ctx.drawImage(customBgImage, 0, 0, canvas.width, canvas.height);
    }
    
    // Paint Foreground Subject & Positioning Geometry
    let drawWidth = img.naturalWidth;
    let drawHeight = img.naturalHeight;
    let dx = 0, dy = 0;
    
    if (forcePassport || customBgImage) {
        const imgRatio = img.naturalWidth / img.naturalHeight;
        
        if (imgRatio < 1) { // Tall 
            drawHeight = canvas.height * (forcePassport ? 0.95 : 0.85); // Passports stay tighter
            drawWidth = drawHeight * imgRatio;
        } else { // Wide
            drawWidth = canvas.width * 0.85;
            drawHeight = drawWidth / imgRatio;
        }
        
        // Dynamic Anchor Calculations
        if (pos === 'center') {
            dx = (canvas.width - drawWidth) / 2;
            dy = (canvas.height - drawHeight) / 2;
        } else if (pos === 'bottom-center') {
            dx = (canvas.width - drawWidth) / 2;
            dy = canvas.height - drawHeight;
        } else if (pos === 'bottom-right') {
            dx = canvas.width - drawWidth;
            dy = canvas.height - drawHeight;
        } else if (pos === 'bottom-left') {
            dx = 0;
            dy = canvas.height - drawHeight;
        }
        
        if (forcePassport) {
            dx = (canvas.width - drawWidth) / 2;
            dy = canvas.height - drawHeight;
        }
    }
    
    ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
    return canvas;
}

window.downloadPassport = function() {
    const canvas = constructFinalCanvas(true);
    canvas.toBlob(blob => {
        triggerBlobDownload(blob, 'jpg', 'Official-Passport');
        trackEvent('download_passport', { action: 'export_jpg' });
    }, 'image/jpeg', 1.0);
};

window.downloadImage = function() {
    const format = document.getElementById('formatSelect').value;
    const canvas = constructFinalCanvas(false);
    canvas.toBlob(blob => {
        triggerBlobDownload(blob, format === 'jpeg' ? 'jpg' : format, 'Exos-Cutout');
        trackEvent('download_image', { format: format, composite: customBgImage ? true : false });
    }, 'image/' + format, 1.0);
};

function triggerBlobDownload(blob, ext, prefix) {
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `${prefix}-${Date.now()}.${ext}`;
    link.href = blobUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Revoke the object URL cleanly to prevent system memory leaks on mobile
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

// ==========================================
// Native Sharing
// ==========================================

window.shareImage = async function() {
    const format = document.getElementById('formatSelect').value || 'png';
    const canvas = constructFinalCanvas(false);
    
    const blob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/' + format, 1.0);
    });

    const ext = format === 'jpeg' ? 'jpg' : format;
    const file = new File([blob], `AI-Removed-BG.${ext}`, { type: blob.type });
    const shareData = { title: 'Check out this cutout!', text: 'Awesome background removal!', files: [file] };

    if (navigator.canShare && navigator.canShare(shareData)) {
        try { await navigator.share(shareData); } 
        catch (err) { if (err.name !== 'AbortError') alert("Share failed: " + err.message); }
    } else {
        alert('Web Share Protocol not available.');
    }
};

// ==========================================
// Legal & Compliance Controllers
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    // Check cookie consent state securely
    if (!localStorage.getItem('antigravity_cookie_consent')) {
        const banner = document.getElementById('cookieBanner');
        if(banner) banner.classList.remove('hidden');
    }
});

window.acceptCookies = function() {
    localStorage.setItem('antigravity_cookie_consent', 'true');
    const banner = document.getElementById('cookieBanner');
    if(banner) banner.classList.add('hidden');
};

window.openModal = function(modalId) {
    document.getElementById(modalId).classList.add('active');
};

window.closeModal = function(event, force = false) {
    // Close if clicking the background overlay OR the explicit close button
    if (force || event.target.classList.contains('legal-modal-overlay')) {
        document.querySelectorAll('.legal-modal-overlay').forEach(el => el.classList.remove('active'));
    }
};

// ==========================================
// Dynamic Format UI Feedback
// ==========================================

window.updatePreviewBackground = function() {
    const format = document.getElementById('formatSelect').value;
    const useBg = document.getElementById('useBgColor').checked;
    const bgColor = document.getElementById('bgColor').value;
    const pos = document.getElementById('subjectPosition').value;
    const resultImg = document.getElementById('resultImage');
    
    // Position rendering
    resultImg.style.objectFit = customBgImage ? 'contain' : 'fill';
    if (pos === 'center') resultImg.style.objectPosition = '50% 50%';
    else if (pos === 'bottom-center') resultImg.style.objectPosition = '50% 100%';
    else if (pos === 'bottom-right') resultImg.style.objectPosition = '100% 100%';
    else if (pos === 'bottom-left') resultImg.style.objectPosition = '0% 100%';
    
    // Background rendering
    if (customBgImage && customBgImage.src) {
        resultImg.style.background = `url(${customBgImage.src}) center/cover no-repeat`;
    } else if (useBg || format === 'jpeg') {
        resultImg.style.background = useBg ? bgColor : '#ffffff';
    } else {
        resultImg.style.background = 'repeating-conic-gradient(#334155 0% 25%, #1e293b 0% 50%) 50% / 20px 20px';
    }
}

document.getElementById('formatSelect').addEventListener('change', updatePreviewBackground);
document.getElementById('bgColor').addEventListener('input', updatePreviewBackground);
document.getElementById('useBgColor').addEventListener('change', updatePreviewBackground);
document.getElementById('subjectPosition').addEventListener('change', updatePreviewBackground);