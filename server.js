import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import WebTorrent from 'webtorrent';
import parseTorrent from 'parse-torrent';
import axios from 'axios';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3333;
const DATA_DIR = path.join(__dirname, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const DOWNLOADS_FILE = path.join(DATA_DIR, 'downloads.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Persistent Settings
const defaultSettings = {
    downloadPath: path.join('C:', 'Games', 'Downloads'),
    defaultDownloadOptional: false
};

function loadJson(file, defaultVal) {
    try {
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        }
    } catch (e) {
        console.error(`Failed to load ${file}:`, e.message);
    }
    return defaultVal;
}

function saveJson(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error(`Failed to save ${file}:`, e.message);
    }
}

let settings = { ...defaultSettings, ...loadJson(SETTINGS_FILE, defaultSettings) };
let savedDownloads = loadJson(DOWNLOADS_FILE, {});

try {
    if (!fs.existsSync(settings.downloadPath)) fs.mkdirSync(settings.downloadPath, { recursive: true });
} catch (e) {}

const BEST_TRACKERS = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://opentor.net:6969/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://tracker.qu.ax:6969/announce',
    'udp://tracker.openbittorrent.com:80/announce',
    'udp://tracker.coppersurfer.tk:6969/announce',
    'udp://tracker.leechers-paradise.org:6969/announce',
    'udp://tracker.zer0day.to:1337/announce'
];

const torrentClient = new WebTorrent({
    maxConns: 120,
    dht: true,
    tracker: true,
    strategy: 'rarest'
});

const activeTorrents = new Map();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function broadcast(type, payload) {
    const msg = JSON.stringify({ type, data: payload });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

function cleanHtmlEntities(str) {
    if (!str) return '';
    return str
        .replace(/&#038;/g, '&')
        .replace(/&#8211;/g, '-')
        .replace(/&#8217;/g, "'")
        .replace(/&#8230;/g, '...')
        .replace(/&quot;/g, '"');
}

function classifyTorrentFile(file, defaultDownloadOptional = false) {
    const nameLower = file.name.toLowerCase();
    const isOptional = nameLower.startsWith('fg-opt') || 
                       nameLower.startsWith('fg-selective') || 
                       nameLower.includes('optional') || 
                       nameLower.includes('selective') ||
                       (nameLower.endsWith('.bin') && !nameLower.match(/^fg-\d+\.bin$/));
                       
    let category = 'Main Repack Files';
    if (nameLower.endsWith('.exe')) category = 'Setup Executable';
    else if (nameLower.includes('soundtrack') || nameLower.includes('ost')) category = 'Bonus Soundtrack';
    else if (nameLower.includes('bonus') || nameLower.includes('dlc')) category = 'Bonus Content / DLC';
    else if (nameLower.includes('selective') || nameLower.includes('lang') || nameLower.includes('voice')) category = 'Voice / Language Pack';
    else if (nameLower.endsWith('.md5') || nameLower.includes('quicksfv') || nameLower.endsWith('.bat')) category = 'Checksum / Verification';

    return {
        name: file.name,
        path: file.path,
        length: file.length,
        isOptional,
        isSelected: isOptional ? defaultDownloadOptional : true,
        category
    };
}

function parseFitGirlPost(post) {
    const rawContent = post.content?.rendered || '';
    const title = cleanHtmlEntities(post.title?.rendered) || 'Unknown Game';
    
    const rawMagnets = rawContent.match(/href="?(magnet:[^"'>\s]+)"?/gi) || rawContent.match(/magnet:\?xt=urn:btih:[a-zA-Z0-9%_\-\.\:\=\&]+/gi) || [];
    const cleanMagnets = rawMagnets.map(m => {
        let clean = m.replace(/^href=["']?/i, '').replace(/["']$/, '');
        clean = cleanHtmlEntities(clean);
        return clean;
    });
    let primaryMagnet = cleanMagnets[0] || null;

    if (primaryMagnet && !primaryMagnet.includes('tr=')) {
        primaryMagnet += '&' + BEST_TRACKERS.map(t => 'tr=' + encodeURIComponent(t)).join('&');
    }

    let torrentUrl = null;
    let rutorUrl = null;
    const rutorMatch = rawContent.match(/href=["'](https?:\/\/rutor\.info\/torrent\/(\d+)[^"']*)["']/i);
    if (rutorMatch) {
        rutorUrl = rutorMatch[1];
        torrentUrl = `http://d.rutor.info/download/${rutorMatch[2]}`;
    }

    let l33tUrl = null;
    const l33tMatch = rawContent.match(/href=["'](https?:\/\/1337x\.to\/torrent\/[^"']*)["']/i);
    if (l33tMatch) {
        l33tUrl = l33tMatch[1];
    }

    const filehosters = [];
    const fhMatches = rawContent.matchAll(/href=["'](https?:\/\/(?:datanodes|fuckingfast|multiup|gofile|1fichier|rapidgator|pastebin)[^"']*)["'][^>]*>([^<]+)<\/a>/gi);
    for (const match of fhMatches) {
        filehosters.push({ host: match[2].trim(), link: match[1] });
    }

    let cover = '';
    const imgMatch = rawContent.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch) cover = imgMatch[1];

    let originalSize = 'N/A';
    let repackSize = 'N/A';
    const origSizeMatch = rawContent.match(/Original Size:[^<]*<strong>([^<]+)<\/strong>/i) || rawContent.match(/Original Size:\s*([^<\n]+)/i);
    if (origSizeMatch) originalSize = origSizeMatch[1].trim();

    const repackSizeMatch = rawContent.match(/Repack Size:[^<]*<strong>([^<]+)<\/strong>/i) || rawContent.match(/Repack Size:\s*([^<\n]+)/i);
    if (repackSizeMatch) repackSize = repackSizeMatch[1].trim();

    const genres = [];
    const genreMatch = rawContent.match(/Genres\/Tags:[^<]*<strong>([^<]+)<\/strong>/i) || rawContent.match(/Genres\/Tags:\s*([^<\n]+)/i);
    if (genreMatch) {
        genreMatch[1].split(',').forEach(g => {
            const clean = g.trim();
            if (clean) genres.push(clean);
        });
    }

    let snippet = post.excerpt?.rendered ? cleanHtmlEntities(post.excerpt.rendered.replace(/<[^>]+>/g, '').trim()) : '';
    if (!snippet) {
        const textOnly = rawContent.replace(/<[^>]+>/g, ' ');
        snippet = textOnly.slice(0, 240).trim();
    }

    return {
        id: post.id,
        title,
        date: post.date,
        link: post.link,
        cover,
        originalSize,
        repackSize,
        genres,
        snippet,
        magnet: primaryMagnet,
        magnets: cleanMagnets,
        torrentUrl,
        rutorUrl,
        l33tUrl,
        filehosters
    };
}

function isGameRepackPost(g) {
    if (!g || !g.title) return false;
    const titleLower = g.title.toLowerCase();

    // Filter out announcements, digests, troubleshooting posts, etc.
    if (titleLower.includes('upcoming repack') || 
        titleLower.includes('updates digest') || 
        titleLower.includes('monthly digest') ||
        titleLower.includes('site update') ||
        titleLower.includes('donation') ||
        titleLower.includes('notice') ||
        titleLower.includes('troubleshooting') ||
        titleLower.includes('faq')) {
        return false;
    }

    // Must have a valid magnet URI, torrent URL, or valid repack size
    if (!g.magnet && !g.torrentUrl && (!g.repackSize || g.repackSize === 'N/A')) {
        return false;
    }

    return true;
}

// -------------------------------------------------------------
// Catalog & Search APIs
// -------------------------------------------------------------
app.get('/api/catalog', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.per_page) || 24;
        const category = req.query.category || '';

        let url = `https://fitgirl-repacks.site/wp-json/wp/v2/posts?page=${page}&per_page=${perPage}&_fields=id,date,title,link,content,excerpt`;
        if (category) {
            url += `&categories=${category}`;
        }

        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 12000
        });

        const totalPages = parseInt(response.headers['x-wp-totalpages']) || 1;
        const totalPosts = parseInt(response.headers['x-wp-total']) || 0;
        const rawPosts = response.data || [];

        const games = rawPosts.map(parseFitGirlPost).filter(isGameRepackPost);

        res.json({
            success: true,
            page,
            perPage,
            totalPages,
            totalPosts,
            games
        });
    } catch (e) {
        console.error('[Catalog Error]', e.message);
        res.status(500).json({
            success: false,
            error: e.response?.data?.message || e.message
        });
    }
});

app.get('/api/search', async (req, res) => {
    try {
        const q = req.query.q || '';
        if (!q.trim()) return res.json({ success: true, games: [] });

        const url = `https://fitgirl-repacks.site/wp-json/wp/v2/posts?search=${encodeURIComponent(q)}&per_page=25&_fields=id,date,title,link,content,excerpt`;
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 12000
        });

        const rawPosts = response.data || [];
        const games = rawPosts.map(parseFitGirlPost).filter(isGameRepackPost);

        res.json({ success: true, query: q, games });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Pre-Download Torrent Inspector
app.post('/api/torrent/inspect', async (req, res) => {
    try {
        const { torrentUrl, magnet } = req.body;
        let parsed = null;

        if (torrentUrl) {
            try {
                const torRes = await axios.get(torrentUrl, {
                    responseType: 'arraybuffer',
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 8000
                });
                parsed = await parseTorrent(Buffer.from(torRes.data));
            } catch (e) {
                console.warn('[Torrent Inspect] Direct .torrent fetch failed, falling back to magnet info');
            }
        }

        if (!parsed && magnet) {
            parsed = await parseTorrent(magnet);
        }

        if (!parsed) {
            return res.status(400).json({ success: false, error: 'Could not resolve torrent metadata' });
        }

        const files = (parsed.files || []).map(f => classifyTorrentFile(f, settings.defaultDownloadOptional));

        res.json({
            success: true,
            name: parsed.name || 'FitGirl Repack',
            totalSize: parsed.length || 0,
            hasFiles: files.length > 0,
            files
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// -------------------------------------------------------------
// Torrent Downloader Engine
// -------------------------------------------------------------
async function setupTorrentInstance(id, sourceData, meta = {}) {
    const downloadDest = settings.downloadPath;
    console.log(`[Torrent] Initiating download for: ${meta.title || id}`);

    let torrentSource = sourceData;

    if (meta.torrentUrl && (!torrentSource || !torrentSource.startsWith('magnet:'))) {
        try {
            console.log(`[Torrent] Fetching direct .torrent from: ${meta.torrentUrl}`);
            const torRes = await axios.get(meta.torrentUrl, {
                responseType: 'arraybuffer',
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 7000
            });
            torrentSource = Buffer.from(torRes.data);
            console.log(`[Torrent] Loaded direct .torrent buffer (${torrentSource.length} bytes)`);
        } catch (e) {
            console.warn(`[Torrent] Direct .torrent fetch failed, using Magnet URI fallback`);
            torrentSource = meta.magnet || sourceData;
        }
    }

    const item = {
        id,
        magnet: meta.magnet || (typeof sourceData === 'string' ? sourceData : ''),
        torrentUrl: meta.torrentUrl || '',
        title: meta.title || 'Torrent Download',
        cover: meta.cover || '',
        repackSize: meta.repackSize || 'N/A',
        originalSize: meta.originalSize || 'N/A',
        name: meta.title || 'Resolving...',
        status: 'downloading',
        progress: 0,
        downloadSpeed: 0,
        uploadSpeed: 0,
        downloaded: 0,
        totalSize: 0,
        peers: 0,
        eta: 0,
        torrent: null,
        addedAt: Date.now(),
        completedAt: null,
        downloadFolder: null,
        selectedFiles: meta.selectedFiles || null,
        files: []
    };

    const torrent = torrentClient.add(torrentSource, { path: downloadDest }, (t) => {
        console.log(`[Torrent] Metadata ready for: ${t.name} (${(t.length / (1024*1024*1024)).toFixed(2)} GB)`);
        item.name = t.name;
        item.totalSize = t.length;
        item.downloadFolder = path.join(downloadDest, t.name);

        // Apply Selective File Download
        const selectedList = item.selectedFiles;
        let selectedCount = 0;
        let deselectedCount = 0;

        item.files = t.files.map(f => {
            const classified = classifyTorrentFile(f, settings.defaultDownloadOptional);
            
            let isSelected = true;
            if (selectedList && Array.isArray(selectedList)) {
                // Strictly follow the user's selected files array
                isSelected = selectedList.includes(f.name) || selectedList.includes(f.path);
            } else if (classified.isOptional) {
                isSelected = settings.defaultDownloadOptional;
            }

            if (!isSelected) {
                f.deselect();
                deselectedCount++;
            } else {
                f.select();
                selectedCount++;
            }

            return {
                name: f.name,
                length: f.length,
                path: f.path,
                isOptional: classified.isOptional,
                category: classified.category,
                selected: isSelected
            };
        });

        console.log(`[Torrent] File selection configured: ${selectedCount} active, ${deselectedCount} deselected`);
        saveDownloadsState();
    });

    item.torrent = torrent;

    torrent.on('download', () => {
        item.progress = torrent.progress;
        item.downloaded = torrent.downloaded;
        item.totalSize = torrent.length;
        item.downloadSpeed = torrent.downloadSpeed;
        item.uploadSpeed = torrent.uploadSpeed;
        item.peers = torrent.numPeers;
        item.eta = torrent.timeRemaining ? Math.round(torrent.timeRemaining / 1000) : 0;
    });

    torrent.on('done', () => {
        console.log(`[Torrent] ✅ Download Complete: ${item.title}`);
        item.status = 'completed';
        item.progress = 1;
        item.completedAt = Date.now();
        item.downloadSpeed = 0;
        item.uploadSpeed = 0;
        item.downloadFolder = path.join(downloadDest, torrent.name);
        
        saveDownloadsState();
        broadcast('download_done', { 
            id, 
            title: item.title, 
            folder: item.downloadFolder,
            message: 'Download complete! Files saved to your Downloads directory.' 
        });

        // Release file locks after download completes
        setTimeout(() => {
            try {
                torrent.destroy({ destroyStore: false }, () => {
                    console.log(`[Torrent] Released file locks for: ${item.title}`);
                    item.torrent = null;
                });
            } catch (e) {
                console.warn(`[Torrent] File handle release warning:`, e.message);
                item.torrent = null;
            }
        }, 2000);
    });

    torrent.on('error', (err) => {
        console.error(`[Torrent Error] ${item.title}:`, err.message);
        item.status = 'error';
        item.error = err.message;
        saveDownloadsState();
    });

    activeTorrents.set(id, item);
    saveDownloadsState();
    return item;
}

function saveDownloadsState() {
    const serializable = {};
    for (const [id, item] of activeTorrents.entries()) {
        serializable[id] = {
            id: item.id,
            magnet: item.magnet,
            torrentUrl: item.torrentUrl,
            title: item.title,
            cover: item.cover,
            repackSize: item.repackSize,
            name: item.name,
            status: item.status,
            progress: item.progress,
            downloaded: item.downloaded,
            totalSize: item.totalSize,
            addedAt: item.addedAt,
            completedAt: item.completedAt,
            downloadFolder: item.downloadFolder,
            selectedFiles: item.selectedFiles,
            files: item.files
        };
    }
    saveJson(DOWNLOADS_FILE, serializable);
}

// -------------------------------------------------------------
// Downloads Management APIs
// -------------------------------------------------------------
app.post('/api/downloads/start', async (req, res) => {
    try {
        const { magnet, torrentUrl, title, cover, repackSize, originalSize, selectedFiles } = req.body;
        if (!magnet && !torrentUrl) {
            return res.status(400).json({ success: false, error: 'Magnet URI or Torrent URL is required' });
        }

        const id = 'dl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const item = await setupTorrentInstance(id, torrentUrl || magnet, {
            magnet,
            torrentUrl,
            title,
            cover,
            repackSize,
            originalSize,
            selectedFiles
        });

        res.json({ success: true, id, item: { id: item.id, title: item.title, status: item.status } });
    } catch (e) {
        console.error('[Download Start Error]', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/downloads/pause', (req, res) => {
    const { id } = req.body;
    const item = activeTorrents.get(id);
    if (!item) return res.status(404).json({ success: false, error: 'Download not found' });

    if (item.torrent && item.status === 'downloading') {
        item.torrent.pause();
        item.status = 'paused';
        item.downloadSpeed = 0;
        saveDownloadsState();
    }
    res.json({ success: true, id });
});

app.post('/api/downloads/resume', (req, res) => {
    const { id } = req.body;
    const item = activeTorrents.get(id);
    if (!item) return res.status(404).json({ success: false, error: 'Download not found' });

    if (item.torrent && item.status === 'paused') {
        item.torrent.resume();
        item.status = 'downloading';
        saveDownloadsState();
    }
    res.json({ success: true, id });
});

app.post('/api/downloads/delete', (req, res) => {
    const { id, deleteFiles } = req.body;
    const item = activeTorrents.get(id);
    if (!item) return res.status(404).json({ success: false, error: 'Download not found' });

    if (item.torrent) {
        try {
            item.torrent.destroy({ destroyStore: !!deleteFiles });
        } catch (e) {}
    }

    if (deleteFiles && item.downloadFolder && fs.existsSync(item.downloadFolder)) {
        try {
            fs.rmSync(item.downloadFolder, { recursive: true, force: true });
        } catch (e) {}
    }

    activeTorrents.delete(id);
    saveDownloadsState();
    res.json({ success: true, id });
});

app.post('/api/downloads/open-folder', (req, res) => {
    const { folder } = req.body;
    const targetFolder = folder || settings.downloadPath;
    if (targetFolder && fs.existsSync(targetFolder)) {
        exec(`explorer.exe "${targetFolder}"`);
        return res.json({ success: true });
    }
    res.status(400).json({ success: false, error: 'Folder does not exist' });
});

app.get('/api/downloads', (req, res) => {
    const list = [];
    for (const [id, item] of activeTorrents.entries()) {
        list.push({
            id: item.id,
            title: item.title,
            cover: item.cover,
            repackSize: item.repackSize,
            name: item.name,
            status: item.status,
            progress: item.progress,
            downloadSpeed: item.downloadSpeed || 0,
            uploadSpeed: item.uploadSpeed || 0,
            downloaded: item.downloaded || 0,
            totalSize: item.totalSize || 0,
            peers: item.peers || 0,
            eta: item.eta || 0,
            addedAt: item.addedAt,
            completedAt: item.completedAt,
            downloadFolder: item.downloadFolder,
            files: item.files
        });
    }
    res.json({ success: true, downloads: list });
});

// Settings APIs
app.get('/api/settings', (req, res) => {
    res.json({ success: true, settings });
});

app.post('/api/settings', (req, res) => {
    const { downloadPath, defaultDownloadOptional } = req.body;
    if (downloadPath) settings.downloadPath = downloadPath;
    if (defaultDownloadOptional !== undefined) settings.defaultDownloadOptional = !!defaultDownloadOptional;
    
    saveJson(SETTINGS_FILE, settings);
    try {
        if (!fs.existsSync(settings.downloadPath)) fs.mkdirSync(settings.downloadPath, { recursive: true });
    } catch (e) {}
    res.json({ success: true, settings });
});

// Periodic Download State Persistence (every 10s during active downloads)
setInterval(() => {
    if (activeTorrents.size > 0) {
        const hasActiveDownloads = Array.from(activeTorrents.values())
            .some(item => item.status === 'downloading' && item.progress < 1);
        
        if (hasActiveDownloads) {
            saveDownloadsState();
        }
    }
}, 10000);

// Telemetry Broadcast (1s)
setInterval(() => {
    if (wss.clients.size === 0) return;

    let totalDown = 0;
    let totalUp = 0;
    const downloadsStatus = [];

    for (const [id, item] of activeTorrents.entries()) {
        totalDown += item.downloadSpeed || 0;
        totalUp += item.uploadSpeed || 0;

        downloadsStatus.push({
            id: item.id,
            title: item.title,
            status: item.status,
            progress: item.progress,
            downloadSpeed: item.downloadSpeed || 0,
            uploadSpeed: item.uploadSpeed || 0,
            downloaded: item.downloaded || 0,
            totalSize: item.totalSize || 0,
            peers: item.peers || 0,
            eta: item.eta || 0
        });
    }

    broadcast('telemetry', {
        totalDownloadSpeed: totalDown,
        totalUploadSpeed: totalUp,
        activeCount: activeTorrents.size,
        downloads: downloadsStatus
    });
}, 1000);

// Resume Saved Torrents on Boot
for (const [id, saved] of Object.entries(savedDownloads)) {
    if (saved.status === 'downloading' || saved.status === 'paused') {
        try {
            setupTorrentInstance(id, saved.torrentUrl || saved.magnet, saved);
        } catch (e) {}
    } else {
        activeTorrents.set(id, saved);
    }
}

server.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`🚀 FitGirl Repack Downloader is LIVE on http://localhost:${PORT}`);
    console.log(`📂 Downloads Path: ${settings.downloadPath}`);
    console.log(`✅ Download Resume: ENABLED (saves every 10s)`);
    console.log(`=================================================`);
});
