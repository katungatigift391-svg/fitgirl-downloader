// State Management
let currentPage = 1;
let totalPages = 1;
let currentSearch = '';
let searchTimeout = null;
let currentCatalog = [];
let activeDownloads = new Map();
let appSettings = {};
let pendingDownloadGame = null;
let pendingTorrentInspect = null;

// DOM Elements
const catalogGrid = document.getElementById('catalogGrid');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const refreshCatalogBtn = document.getElementById('refreshCatalogBtn');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageInfo = document.getElementById('pageInfo');
const dlBadge = document.getElementById('dlBadge');
const globalDlSpeed = document.getElementById('globalDlSpeed');
const globalUpSpeed = document.getElementById('globalUpSpeed');
const downloadsList = document.getElementById('downloadsList');
const detailsModal = document.getElementById('detailsModal');
const modalBody = document.getElementById('modalBody');
const closeModalBtn = document.getElementById('closeModalBtn');
const toastContainer = document.getElementById('toastContainer');

// Download Options Modal Elements
const downloadOptionsModal = document.getElementById('downloadOptionsModal');
const downloadOptionsBody = document.getElementById('downloadOptionsBody');
const closeDownloadOptionsBtn = document.getElementById('closeDownloadOptionsBtn');

// Settings Elements
const settingDownloadPath = document.getElementById('settingDownloadPath');
const settingDefaultOptional = document.getElementById('settingDefaultOptional');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');

// Navigation Tabs
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        
        btn.classList.add('active');
        const tab = btn.getAttribute('data-tab');
        const targetPanel = document.getElementById(`tab-${tab}`);
        if (targetPanel) targetPanel.classList.add('active');

        if (tab === 'downloads') loadDownloads();
        if (tab === 'settings') loadSettings();
    });
});

// Format Helpers
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSec) {
    return formatBytes(bytesPerSec) + '/s';
}

function formatTime(seconds) {
    if (!seconds || seconds <= 0 || !isFinite(seconds)) return '--:--';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m ${secs}s`;
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// -------------------------------------------------------------
// Catalog Logic
// -------------------------------------------------------------
async function fetchCatalog(page = 1) {
    catalogGrid.innerHTML = `
        <div class="loading-spinner">
            <div class="spinner"></div>
            <p>Fetching releases from FitGirl...</p>
        </div>
    `;

    try {
        const res = await fetch(`/api/catalog?page=${page}&per_page=24`);
        const data = await res.json();
        if (data.success) {
            currentPage = data.page;
            totalPages = data.totalPages;
            currentCatalog = data.games;
            renderCatalog(data.games);
            updatePagination();
        } else {
            catalogGrid.innerHTML = `<div class="empty-state"><h3>Failed to load catalog</h3><p>${data.error}</p></div>`;
        }
    } catch (e) {
        catalogGrid.innerHTML = `<div class="empty-state"><h3>Network Error</h3><p>${e.message}</p></div>`;
    }
}

async function searchGames(query) {
    if (!query.trim()) {
        fetchCatalog(1);
        return;
    }

    catalogGrid.innerHTML = `
        <div class="loading-spinner">
            <div class="spinner"></div>
            <p>Searching FitGirl for "${query}"...</p>
        </div>
    `;

    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data.success) {
            currentCatalog = data.games;
            renderCatalog(data.games);
            document.getElementById('paginationArea').style.display = 'none';
        } else {
            catalogGrid.innerHTML = `<div class="empty-state"><h3>Search Error</h3><p>${data.error}</p></div>`;
        }
    } catch (e) {
        catalogGrid.innerHTML = `<div class="empty-state"><h3>Search Error</h3><p>${e.message}</p></div>`;
    }
}

function renderCatalog(games) {
    if (!games || games.length === 0) {
        catalogGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <h3>No Games Found</h3>
                <p>Try searching for a different title or refresh the catalog.</p>
            </div>
        `;
        return;
    }

    catalogGrid.innerHTML = games.map((game, idx) => `
        <div class="game-card">
            <div class="card-cover-wrap" onclick="openDetailsModal(${idx})">
                <img src="${game.cover || 'https://placehold.co/400x600/181824/7c3aed?text=Cover'}" alt="${game.title}" onerror="this.src='https://placehold.co/400x600/181824/7c3aed?text=Cover'">
                <div class="card-badges">
                    <span class="badge-repack-size">Repack: ${game.repackSize}</span>
                    ${game.originalSize !== 'N/A' ? `<span class="badge-orig-size">${game.originalSize}</span>` : ''}
                </div>
            </div>
            <div class="card-details">
                <div class="card-title" onclick="openDetailsModal(${idx})" title="${game.title}">${game.title}</div>
                <div class="card-genres">
                    ${game.genres.slice(0, 3).map(g => `<span class="genre-tag">${g}</span>`).join('')}
                </div>
                <div class="card-actions">
                    <button class="btn-download-fast" onclick="initiateDownload(${idx})">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        <span>Download</span>
                    </button>
                    <button class="btn-details" onclick="openDetailsModal(${idx})">Mirrors & Info</button>
                </div>
            </div>
        </div>
    `).join('');
}

function updatePagination() {
    const area = document.getElementById('paginationArea');
    area.style.display = 'flex';
    pageInfo.innerText = `Page ${currentPage} of ${totalPages}`;
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
}

prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) fetchCatalog(currentPage - 1);
});

nextPageBtn.addEventListener('click', () => {
    if (currentPage < totalPages) fetchCatalog(currentPage + 1);
});

refreshCatalogBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    fetchCatalog(1);
});

searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    clearSearchBtn.style.display = val ? 'block' : 'none';
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        searchGames(val);
    }, 400);
});

clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    fetchCatalog(1);
});

// -------------------------------------------------------------
// Details & Mirrors Modal
// -------------------------------------------------------------
window.openDetailsModal = function(idx) {
    const game = currentCatalog[idx];
    if (!game) return;

    modalBody.innerHTML = `
        <div class="modal-content-grid">
            <img class="modal-cover" src="${game.cover}" alt="${game.title}" onerror="this.src='https://placehold.co/400x600/181824/7c3aed?text=Cover'">
            <div class="modal-info">
                <h2 class="modal-title">${game.title}</h2>
                <div class="spec-table">
                    <div class="spec-item">
                        <span class="label">Repack Size</span>
                        <span class="val" style="color: var(--emerald); font-weight: 700;">${game.repackSize}</span>
                    </div>
                    <div class="spec-item">
                        <span class="label">Original Size</span>
                        <span class="val">${game.originalSize}</span>
                    </div>
                    <div class="spec-item">
                        <span class="label">Release Date</span>
                        <span class="val">${new Date(game.date).toLocaleDateString()}</span>
                    </div>
                    <div class="spec-item">
                        <span class="label">Genres</span>
                        <span class="val">${game.genres.join(', ') || 'General'}</span>
                    </div>
                </div>

                <div class="modal-desc">
                    <p>${game.snippet}...</p>
                </div>

                <div class="mirrors-section">
                    <span class="mirrors-title">Available Download Mirrors:</span>
                    <div class="mirrors-list">
                        ${game.torrentUrl ? `
                            <a href="${game.torrentUrl}" target="_blank" class="mirror-pill rutor">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                <span>Direct .torrent (RuTor)</span>
                            </a>
                        ` : ''}
                        ${game.l33tUrl ? `
                            <a href="${game.l33tUrl}" target="_blank" class="mirror-pill leet">
                                <span>1337x Mirror</span>
                            </a>
                        ` : ''}
                        ${game.rutorUrl ? `
                            <a href="${game.rutorUrl}" target="_blank" class="mirror-pill rutor-topic">
                                <span>RuTor Topic</span>
                            </a>
                        ` : ''}
                        ${game.filehosters && game.filehosters.length > 0 ? game.filehosters.map(fh => `
                            <a href="${fh.link}" target="_blank" class="mirror-pill filehoster">
                                <span>📁 ${fh.host}</span>
                            </a>
                        `).join('') : ''}
                    </div>
                </div>

                <div class="modal-actions-bar">
                    <button class="primary-btn" onclick="initiateDownload(${idx}); closeModal();">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        <span>Configure & Download</span>
                    </button>
                    <a href="${game.link}" target="_blank" class="btn-secondary" style="text-decoration: none; display: flex; align-items: center; gap: 6px;">
                        <span>FitGirl Page</span>
                    </a>
                </div>
            </div>
        </div>
    `;
    detailsModal.classList.add('active');
};

window.closeModal = function() {
    detailsModal.classList.remove('active');
};
closeModalBtn.addEventListener('click', closeModal);
detailsModal.addEventListener('click', (e) => {
    if (e.target === detailsModal) closeModal();
});

// -------------------------------------------------------------
// Pre-Download Component Picker Flow
// -------------------------------------------------------------
window.closeDownloadOptions = function() {
    downloadOptionsModal.classList.remove('active');
    pendingDownloadGame = null;
    pendingTorrentInspect = null;
};
closeDownloadOptionsBtn.addEventListener('click', closeDownloadOptions);
downloadOptionsModal.addEventListener('click', (e) => {
    if (e.target === downloadOptionsModal) closeDownloadOptions();
});

window.initiateDownload = async function(idx) {
    const game = currentCatalog[idx];
    if (!game || (!game.magnet && !game.torrentUrl)) {
        showToast('No download source available for this release', 'error');
        return;
    }

    pendingDownloadGame = game;

    // Show loading modal
    downloadOptionsBody.innerHTML = `
        <div class="loading-spinner">
            <div class="spinner"></div>
            <p>Analyzing selective components & .bin archives for "${game.title}"...</p>
        </div>
    `;
    downloadOptionsModal.classList.add('active');

    try {
        const res = await fetch('/api/torrent/inspect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                torrentUrl: game.torrentUrl,
                magnet: game.magnet
            })
        });
        const data = await res.json();

        if (data.success && data.files && data.files.length > 0) {
            pendingTorrentInspect = data;
            renderDownloadOptions(game, data.files);
        } else {
            // Direct download fallback
            closeDownloadOptions();
            executeDirectDownload(game);
        }
    } catch (e) {
        console.warn('Torrent inspection failed, falling back to direct download:', e);
        closeDownloadOptions();
        executeDirectDownload(game);
    }
};

function renderDownloadOptions(game, files) {
    let totalBytes = 0;
    let selectedBytes = 0;

    files.forEach(f => {
        totalBytes += f.length;
        if (f.isSelected) selectedBytes += f.length;
    });

    const hasOptional = files.some(f => f.isOptional);

    downloadOptionsBody.innerHTML = `
        <div class="component-modal-header">
            <img class="component-modal-cover" src="${game.cover}" alt="" onerror="this.src='https://placehold.co/400x600/181824/7c3aed?text=Cover'">
            <div class="component-modal-titles">
                <h3>${game.title}</h3>
                <span class="component-modal-subtitle">${hasOptional ? 'Selective Repack — Select or Deselect Any Files to Download' : 'Standard Repack — Complete Archive'}</span>
            </div>
        </div>

        <div class="component-picker-summary">
            <span>Selected Download Size: <strong class="size-stat" id="compSelectedSize">${formatBytes(selectedBytes)}</strong> / ${formatBytes(totalBytes)}</span>
            <div class="component-quick-toggles">
                <button class="btn-secondary" onclick="toggleAllComponents(true)">Select All</button>
                <button class="btn-secondary" onclick="toggleAllComponents(false)">Required Only</button>
            </div>
        </div>

        <div class="component-picker-list" id="compFilesList">
            ${files.map((file, i) => {
                let badgeClass = 'main';
                if (file.category.includes('Soundtrack')) badgeClass = 'soundtrack';
                else if (file.category.includes('DLC') || file.category.includes('Bonus')) badgeClass = 'dlc';
                else if (file.isOptional) badgeClass = 'optional';

                return `
                    <div class="component-row ${file.isOptional ? 'optional' : 'required'}">
                        <div class="component-row-left">
                            <label class="custom-checkbox" style="margin: 0;">
                                <input type="checkbox" 
                                    class="comp-file-checkbox" 
                                    data-index="${i}" 
                                    ${file.isSelected ? 'checked' : ''} 
                                    onchange="onComponentCheckChanged()">
                                <span class="checkmark"></span>
                            </label>
                            <div class="component-info">
                                <span class="component-name">${file.name}</span>
                                <span class="component-cat-badge ${badgeClass}">${file.category}</span>
                            </div>
                        </div>
                        <div class="component-row-right">
                            ${formatBytes(file.length)}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>

        <div class="component-modal-footer">
            <span style="font-size: 0.78rem; color: var(--text-dim);">
                💡 Every file is toggleable. Deselect optional language packs or bonus media to save bandwidth.
            </span>
            <div style="display: flex; gap: 10px;">
                <button class="btn-secondary" onclick="closeDownloadOptions()">Cancel</button>
                <button class="primary-btn" onclick="confirmDownloadWithComponents()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    <span>Start Download</span>
                </button>
            </div>
        </div>
    `;
}

window.onComponentCheckChanged = function() {
    if (!pendingTorrentInspect || !pendingTorrentInspect.files) return;
    
    const checkboxes = document.querySelectorAll('.comp-file-checkbox');
    let selectedBytes = 0;

    checkboxes.forEach(cb => {
        const idx = parseInt(cb.getAttribute('data-index'), 10);
        const isChecked = cb.checked;
        pendingTorrentInspect.files[idx].isSelected = isChecked;
        if (isChecked) {
            selectedBytes += pendingTorrentInspect.files[idx].length;
        }
    });

    const sizeEl = document.getElementById('compSelectedSize');
    if (sizeEl) sizeEl.innerText = formatBytes(selectedBytes);
};

window.toggleAllComponents = function(selectAll) {
    if (!pendingTorrentInspect || !pendingTorrentInspect.files) return;

    const checkboxes = document.querySelectorAll('.comp-file-checkbox');
    checkboxes.forEach(cb => {
        const idx = parseInt(cb.getAttribute('data-index'), 10);
        const file = pendingTorrentInspect.files[idx];
        if (selectAll) {
            cb.checked = true;
            file.isSelected = true;
        } else {
            cb.checked = !file.isOptional;
            file.isSelected = !file.isOptional;
        }
    });

    onComponentCheckChanged();
};

window.confirmDownloadWithComponents = async function() {
    if (!pendingDownloadGame || !pendingTorrentInspect) return;

    const selectedFiles = pendingTorrentInspect.files
        .filter(f => f.isSelected)
        .map(f => f.name);

    if (selectedFiles.length === 0) {
        showToast('Please select at least one file to download', 'error');
        return;
    }

    const game = pendingDownloadGame;
    closeDownloadOptions();

    showToast(`Adding "${game.title}" to downloads (${selectedFiles.length} files selected)...`, 'info');

    try {
        const res = await fetch('/api/downloads/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                magnet: game.magnet,
                torrentUrl: game.torrentUrl,
                title: game.title,
                cover: game.cover,
                repackSize: game.repackSize,
                originalSize: game.originalSize,
                selectedFiles
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`🚀 Download started for "${game.title}"!`, 'success');
            loadDownloads();
            document.querySelector('[data-tab="downloads"]').click();
        } else {
            showToast('Failed to start download: ' + data.error, 'error');
        }
    } catch (e) {
        showToast('Download start error: ' + e.message, 'error');
    }
};

async function executeDirectDownload(game) {
    showToast(`Adding "${game.title}" to downloads...`, 'info');

    try {
        const res = await fetch('/api/downloads/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                magnet: game.magnet,
                torrentUrl: game.torrentUrl,
                title: game.title,
                cover: game.cover,
                repackSize: game.repackSize,
                originalSize: game.originalSize
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`🚀 Download started for "${game.title}"!`, 'success');
            loadDownloads();
            document.querySelector('[data-tab="downloads"]').click();
        } else {
            showToast('Failed to start download: ' + data.error, 'error');
        }
    } catch (e) {
        showToast('Download start error: ' + e.message, 'error');
    }
}

// -------------------------------------------------------------
// Downloads Management Logic
// -------------------------------------------------------------
async function loadDownloads() {
    try {
        const res = await fetch('/api/downloads');
        const data = await res.json();
        if (data.success) {
            dlBadge.innerText = data.downloads.length;
            renderDownloads(data.downloads);
        }
    } catch (e) {
        console.error('Failed to load downloads:', e);
    }
}

function renderDownloads(downloads) {
    if (!downloads || downloads.length === 0) {
        downloadsList.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                <h3>No Active Downloads</h3>
                <p>Go to the Catalog and click "Download" on any game to start downloading.</p>
            </div>
        `;
        return;
    }

    downloadsList.innerHTML = downloads.map(item => {
        const pct = (item.progress * 100).toFixed(1);
        const isComplete = item.status === 'completed' || item.progress >= 1;
        const isPaused = item.status === 'paused';

        return `
            <div class="download-card" id="dlCard_${item.id}">
                <img class="dl-cover" src="${item.cover || 'https://placehold.co/400x600/181824/7c3aed?text=Cover'}" alt="">
                <div class="dl-info">
                    <div class="dl-header-row">
                        <div class="dl-title">${item.title}</div>
                        <span class="dl-status-badge ${item.status}">${item.status}</span>
                    </div>

                    <div class="progress-bar-wrap">
                        <div class="progress-bar-fill" style="width: ${pct}%"></div>
                    </div>

                    <div class="dl-metrics font-mono">
                        <span>${pct}% • ${formatBytes(item.downloaded)} / ${formatBytes(item.totalSize || 0)}</span>
                        <span>${isComplete ? 'Download Finished' : `${formatSpeed(item.downloadSpeed)} • ${item.peers || 0} peers • ETA: ${formatTime(item.eta)}`}</span>
                    </div>

                    <div class="meta-badges-row">
                        <span class="meta-pill active">📦 Repack: ${item.repackSize || 'N/A'}</span>
                        ${item.originalSize !== 'N/A' ? `<span class="meta-pill">💾 Original: ${item.originalSize}</span>` : ''}
                    </div>
                </div>

                <div class="dl-actions">
                    ${!isComplete ? (isPaused ? `
                        <button class="icon-btn" title="Resume" onclick="resumeDownload('${item.id}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                        </button>
                    ` : `
                        <button class="icon-btn" title="Pause" onclick="pauseDownload('${item.id}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                        </button>
                    `) : ''}

                    ${item.downloadFolder ? `
                        <button class="btn-secondary" onclick="openDownloadFolder('${escapeQuotes(item.downloadFolder)}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                            <span>Open Folder</span>
                        </button>
                    ` : ''}

                    <button class="icon-btn danger" title="Cancel / Remove" onclick="deleteDownload('${item.id}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function escapeQuotes(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

window.pauseDownload = async function(id) {
    await fetch('/api/downloads/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    loadDownloads();
};

window.resumeDownload = async function(id) {
    await fetch('/api/downloads/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    loadDownloads();
};

window.deleteDownload = async function(id) {
    const deleteFiles = confirm('Do you also want to delete downloaded files from disk?');
    await fetch('/api/downloads/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, deleteFiles })
    });
    showToast('Download removed', 'info');
    loadDownloads();
};

window.openDownloadFolder = async function(folder) {
    try {
        await fetch('/api/downloads/open-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder })
        });
    } catch (e) {
        showToast('Could not open folder', 'error');
    }
};

// -------------------------------------------------------------
// Settings Logic
// -------------------------------------------------------------
async function loadSettings() {
    try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (data.success) {
            appSettings = data.settings;
            settingDownloadPath.value = data.settings.downloadPath || '';
            if (settingDefaultOptional) settingDefaultOptional.checked = !!data.settings.defaultDownloadOptional;
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
}

saveSettingsBtn.addEventListener('click', async () => {
    const newSettings = {
        downloadPath: settingDownloadPath.value.trim(),
        defaultDownloadOptional: settingDefaultOptional ? settingDefaultOptional.checked : false
    };

    try {
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSettings)
        });
        const data = await res.json();
        if (data.success) {
            appSettings = data.settings;
            showToast('Settings saved successfully!', 'success');
            loadDownloads();
        }
    } catch (e) {
        showToast('Failed to save settings: ' + e.message, 'error');
    }
});

// -------------------------------------------------------------
// WebSocket Live Telemetry
// -------------------------------------------------------------
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'telemetry') {
                globalDlSpeed.innerText = formatSpeed(msg.data.totalDownloadSpeed || 0);
                globalUpSpeed.innerText = formatSpeed(msg.data.totalUploadSpeed || 0);

                if (msg.data.downloads) {
                    dlBadge.innerText = msg.data.downloads.length;
                    msg.data.downloads.forEach(dl => {
                        const card = document.getElementById(`dlCard_${dl.id}`);
                        if (card) {
                            const pct = (dl.progress * 100).toFixed(1);
                            const fill = card.querySelector('.progress-bar-fill');
                            const metrics = card.querySelector('.dl-metrics');
                            const isComplete = dl.status === 'completed' || dl.progress >= 1;

                            if (fill) fill.style.width = `${pct}%`;
                            if (metrics) {
                                metrics.innerHTML = `
                                    <span>${pct}% • ${formatBytes(dl.downloaded)} / ${formatBytes(dl.totalSize || 0)}</span>
                                    <span>${isComplete ? 'Download Finished' : `${formatSpeed(dl.downloadSpeed)} • ${dl.peers || 0} peers • ETA: ${formatTime(dl.eta)}`}</span>
                                `;
                            }
                        }
                    });
                }
            } else if (msg.type === 'download_done') {
                showToast(`✅ Download Complete: "${msg.data.title}".`, 'success');
                loadDownloads();
            }
        } catch (e) {}
    };

    ws.onclose = () => {
        setTimeout(connectWebSocket, 3000);
    };
}

// Initial Boot
fetchCatalog(1);
loadDownloads();
loadSettings();
connectWebSocket();
