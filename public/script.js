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
    
    if(document.getElementById('filterScale')) {
        document.getElementById('filterScale').value = 1;
        document.getElementById('filterBright').value = 100;
        document.getElementById('filterContrast').value = 100;
        document.getElementById('filterSat').value = 100;
        document.getElementById('scaleVal').innerText = "100%";
        document.getElementById('brightVal').innerText = "100%";
        document.getElementById('contrastVal').innerText = "100%";
        document.getElementById('satVal').innerText = "100%";
        if(window.updatePreviewBackground) window.updatePreviewBackground();
    }
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
    
    // Target Resolution Scaling
    const resNode = document.getElementById('exportResolution');
    const resScale = forcePassport ? 1 : (resNode ? parseFloat(resNode.value) || 1 : 1);

    // Determine base dimensions and scale entirely!
    let baseWidth, baseHeight;
    if (forcePassport) {
        baseWidth = 600; baseHeight = 600;
    } else if (customBgImage) {
        baseWidth = customBgImage.width; baseHeight = customBgImage.height;
    } else {
        baseWidth = img.naturalWidth; baseHeight = img.naturalHeight;
    }
    
    // Expand the physical canvas constraints
    canvas.width = baseWidth * resScale;
    canvas.height = baseHeight * resScale;
    
    // Apply geometric multiplier mapping to all rendering mathematics natively!
    ctx.scale(resScale, resScale);

    // Paint Solid Background Base
    const format = document.getElementById('formatSelect').value;
    const useBg = document.getElementById('useBgColor').checked;
    const bgColor = document.getElementById('bgColor').value;
    if (useBg || (format === 'jpeg' && !customBgImage)) {
        ctx.fillStyle = useBg ? bgColor : '#ffffff';
        ctx.fillRect(0, 0, baseWidth, baseHeight);
    }
    
    // Paint Image Background Layer
    if (customBgImage && !forcePassport) {
        ctx.drawImage(customBgImage, 0, 0, baseWidth, baseHeight);
    }
    
    // Paint Foreground Subject & Positioning Geometry
    let drawWidth = img.naturalWidth;
    let drawHeight = img.naturalHeight;
    let dx = 0, dy = 0;
    
    let scaleMult = parseFloat(document.getElementById('filterScale').value) || 1;
    
    // Setup Context Filters matching browser visually
    ctx.filter = `brightness(${document.getElementById('filterBright').value}%) contrast(${document.getElementById('filterContrast').value}%) saturate(${document.getElementById('filterSat').value}%)`;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    if (forcePassport || customBgImage) {
        const imgRatio = img.naturalWidth / img.naturalHeight;
        
        if (imgRatio < 1) { // Tall 
            drawHeight = baseHeight * (forcePassport ? 0.95 : 0.85); // Passports stay tighter
            drawWidth = drawHeight * imgRatio;
        } else { // Wide
            drawWidth = baseWidth * 0.85;
            drawHeight = drawWidth / imgRatio;
        }
    }

    if (!forcePassport) {
        drawWidth *= scaleMult;
        drawHeight *= scaleMult;
    }
        
    // Dynamic Anchor Calculations
    if (pos === 'center') {
        dx = (baseWidth - drawWidth) / 2;
        dy = (baseHeight - drawHeight) / 2;
    } else if (pos === 'bottom-center') {
        dx = (baseWidth - drawWidth) / 2;
        dy = baseHeight - drawHeight;
    } else if (pos === 'bottom-right') {
        dx = baseWidth - drawWidth;
        dy = baseHeight - drawHeight;
    } else if (pos === 'bottom-left') {
        dx = 0;
        dy = baseHeight - drawHeight;
    } else if (pos === 'custom') {
        dx = (baseWidth - drawWidth) * customPosX;
        dy = (baseHeight - drawHeight) * customPosY;
    }
    
    if (forcePassport) {
        dx = (baseWidth - drawWidth) / 2;
        dy = baseHeight - drawHeight;
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
// Enhancer Sliders Logic
// ==========================================

const filterScale = document.getElementById('filterScale');
const filterBright = document.getElementById('filterBright');
const filterContrast = document.getElementById('filterContrast');
const filterSat = document.getElementById('filterSat');

// Drag Variables
let customPosX = 0.5;
let customPosY = 0.5;
let isDragging = false;
let startX, startY, initialPctX, initialPctY;
const resultImgNode = document.getElementById('resultImage');
const previewContNode = document.getElementById('previewContainer');
const posSelectNode = document.getElementById('subjectPosition');

posSelectNode.addEventListener('change', () => {
    // Reset defaults visually if user clicks away from custom
    if(posSelectNode.value === 'center') { customPosX = 0.5; customPosY = 0.5; }
    else if(posSelectNode.value === 'bottom-center') { customPosX = 0.5; customPosY = 1.0; }
    else if(posSelectNode.value === 'bottom-right') { customPosX = 1.0; customPosY = 1.0; }
    else if(posSelectNode.value === 'bottom-left') { customPosX = 0.0; customPosY = 1.0; }
    window.updatePreviewBackground();
});

resultImgNode.addEventListener('pointerdown', (e) => {
    isDragging = true;
    resultImgNode.style.cursor = 'grabbing';
    resultImgNode.setPointerCapture(e.pointerId);
    
    if(posSelectNode.value !== 'custom') {
        posSelectNode.value = 'custom';
    }
    
    startX = e.clientX;
    startY = e.clientY;
    initialPctX = customPosX;
    initialPctY = customPosY;
});

resultImgNode.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    const contRect = previewContNode.getBoundingClientRect();
    // Invert scale sensitivity so larger images don't drag way too fast
    const scaleMult = parseFloat(document.getElementById('filterScale').value) || 1;
    let deltaPctX = (dx / contRect.width) / scaleMult;
    let deltaPctY = (dy / contRect.height) / scaleMult;
    
    customPosX = initialPctX + deltaPctX;
    customPosY = initialPctY + deltaPctY;
    
    window.updatePreviewBackground();
});

resultImgNode.addEventListener('pointerup', (e) => {
    isDragging = false;
    resultImgNode.style.cursor = 'grab';
    resultImgNode.releasePointerCapture(e.pointerId);
});

resultImgNode.addEventListener('pointercancel', (e) => {
    isDragging = false;
    resultImgNode.style.cursor = 'grab';
});

['input', 'change'].forEach(evt => {
    filterScale.addEventListener(evt, () => { document.getElementById('scaleVal').innerText = Math.round(filterScale.value * 100) + '%'; window.updatePreviewBackground(); });
    filterBright.addEventListener(evt, () => { document.getElementById('brightVal').innerText = filterBright.value + '%'; window.updatePreviewBackground(); });
    filterContrast.addEventListener(evt, () => { document.getElementById('contrastVal').innerText = filterContrast.value + '%'; window.updatePreviewBackground(); });
    filterSat.addEventListener(evt, () => { document.getElementById('satVal').innerText = filterSat.value + '%'; window.updatePreviewBackground(); });
});

// ==========================================
// Dynamic Format UI Feedback
// ==========================================

window.updatePreviewBackground = function() {
    const format = document.getElementById('formatSelect').value;
    const useBg = document.getElementById('useBgColor').checked;
    const bgColor = document.getElementById('bgColor').value;
    const pos = document.getElementById('subjectPosition').value;
    const resultImg = document.getElementById('resultImage');
    const pCont = document.getElementById('previewContainer');
    
    // Position & Scale rendering
    resultImg.style.objectFit = 'contain';
    if (pos === 'center') resultImg.style.objectPosition = '50% 50%';
    else if (pos === 'bottom-center') resultImg.style.objectPosition = '50% 100%';
    else if (pos === 'bottom-right') resultImg.style.objectPosition = '100% 100%';
    else if (pos === 'bottom-left') resultImg.style.objectPosition = '0% 100%';
    else if (pos === 'custom') resultImg.style.objectPosition = `${customPosX * 100}% ${customPosY * 100}%`;
    
    resultImg.style.transform = `scale(${filterScale.value})`;
    resultImg.style.filter = `brightness(${filterBright.value}%) contrast(${filterContrast.value}%) saturate(${filterSat.value}%) drop-shadow(0 10px 20px rgba(0,0,0,0.3))`;

    // Background rendering decoupled to previewContainer
    if (customBgImage && customBgImage.src) {
        pCont.style.background = `url(${customBgImage.src}) center/cover no-repeat`;
    } else if (useBg || format === 'jpeg') {
        pCont.style.background = useBg ? bgColor : '#ffffff';
    } else {
        pCont.style.background = 'repeating-conic-gradient(#334155 0% 25%, #1e293b 0% 50%) 50% / 20px 20px';
    }
}

document.getElementById('formatSelect').addEventListener('change', updatePreviewBackground);
document.getElementById('bgColor').addEventListener('input', updatePreviewBackground);
document.getElementById('useBgColor').addEventListener('change', updatePreviewBackground);
document.getElementById('subjectPosition').addEventListener('change', updatePreviewBackground);