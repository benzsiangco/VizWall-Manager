// JS script for VizWall Premiere Plugin with Previews Grid, Docked Sidebar & Audio Waveforms
const path = require('path');
const fs = require('fs');
const os = require('os');

// UI Elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const projectSelect = document.getElementById('projectSelect');
const searchInput = document.getElementById('searchInput');
const scrollArea = document.getElementById('scrollArea');
const refreshBtn = document.getElementById('refreshBtn');

const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
const closeSidebarBtn = document.getElementById('closeSidebarBtn');
const sidebar = document.getElementById('sidebar');
const folderTree = document.getElementById('folderTree');
const activeFolderRow = document.getElementById('activeFolderRow');
const activeFolderName = document.getElementById('activeFolderName');
const clearFolderFilterBtn = document.getElementById('clearFolderFilterBtn');
const gridSlider = document.getElementById('gridSlider');
const sortSelect = document.getElementById('sortSelect');
const importProjectBtn = document.getElementById('importProjectBtn');

let db = null;
let SQL = null;
let currentProjectId = '';
let currentProjectPath = '';
let libraryPath = '';
let assetsCache = [];
let projectsMap = {}; // Maps project_id -> { name, path }

let selectedFolder = ''; // Path filter relative to project root
let openFolders = new Set(); // Stores expanded folder tree paths

const audioWaveforms = {}; // Cache decoded waveform data and playback state: { id: { data, duration } }
const activeAudioPlayers = {}; // Cache active HTML5 Audio elements

// Lucide SVG rendering helpers
const SVGS = {
    Music: (color, width = 13, height = 13) => `<svg viewBox="0 0 24 24" width="${width}" height="${height}" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-music" style="display:inline-block; vertical-align:middle;"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`,
    Video: (color, width = 13, height = 13) => `<svg viewBox="0 0 24 24" width="${width}" height="${height}" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-video" style="display:inline-block; vertical-align:middle;"><path d="m22 8-6 4 6 4V8Z"></path><rect width="14" height="12" x="2" y="6" rx="2" ry="2"></rect></svg>`,
    HardDrive: (color, width = 13, height = 13) => `<svg viewBox="0 0 24 24" width="${width}" height="${height}" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-hard-drive" style="display:inline-block; vertical-align:middle;"><rect width="20" height="8" x="2" y="14" rx="2"></rect><path d="M6 18h.01M10 18h.01M2 14 6 4h12l4 10"></path></svg>`,
    ImageIcon: (color, width = 13, height = 13) => `<svg viewBox="0 0 24 24" width="${width}" height="${height}" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image" style="display:inline-block; vertical-align:middle;"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path></svg>`,
    FileText: (color, width = 13, height = 13) => `<svg viewBox="0 0 24 24" width="${width}" height="${height}" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-text" style="display:inline-block; vertical-align:middle;"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path><path d="M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8"></path></svg>`,
    Archive: (color, width = 13, height = 13) => `<svg viewBox="0 0 24 24" width="${width}" height="${height}" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-archive" style="display:inline-block; vertical-align:middle;"><rect width="20" height="5" x="2" y="3" rx="1"></rect><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"></path></svg>`,
    Folder: (color, width = 13, height = 13) => `<svg viewBox="0 0 24 24" width="${width}" height="${height}" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder" style="display:inline-block; vertical-align:middle;"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path></svg>`,
    FolderOpen: (color, width = 13, height = 13) => `<svg viewBox="0 0 24 24" width="${width}" height="${height}" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-open" style="display:inline-block; vertical-align:middle;"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"></path></svg>`
};

const CATEGORY_STYLE_MAP = {
    SFX:           { svg: 'Music',     color: '#fb923c' }, // text-orange-400
    MUSIC:         { svg: 'Music',     color: '#34d399' }, // text-emerald-400
    AUDIO:         { svg: 'Music',     color: '#60a5fa' }, // text-blue-400
    VOICEOVER:     { svg: 'Music',     color: '#38bdf8' }, // text-sky-400
    A_ROLL:        { svg: 'Video',     color: '#f87171' }, // text-red-400
    B_ROLL:        { svg: 'Video',     color: '#c084fc' }, // text-violet-400
    EXPORTS:       { svg: 'HardDrive', color: '#2dd4bf' }, // text-teal-400
    GRAPHICS:      { svg: 'ImageIcon', color: '#22d3ee' }, // text-cyan-400
    THUMBNAILS:    { svg: 'ImageIcon', color: '#f472b6' }, // text-pink-400
    PROJECT_FILES: { svg: 'FileText',  color: '#fbbf24' }, // text-amber-400
    ARCHIVE:       { svg: 'Archive',   color: '#94a3b8' }, // text-slate-400
};

function getCategoryIcon(category, width = 13, height = 13) {
    const cfg = CATEGORY_STYLE_MAP[category];
    if (cfg && SVGS[cfg.svg]) {
        return SVGS[cfg.svg](cfg.color, width, height);
    }
    return SVGS.FileText('rgba(255, 255, 255, 0.4)', width, height);
}

function getFolderIcon(node, isOpen, width = 13, height = 13) {
    const effectiveCat = node.overrideCategory || node.dominantCategory;
    if (effectiveCat) {
        const cfg = CATEGORY_STYLE_MAP[effectiveCat];
        if (cfg && SVGS[cfg.svg]) {
            return SVGS[cfg.svg](cfg.color, width, height);
        }
    }
    
    // Fallback: name-based detection
    const n = node.name.toUpperCase();
    if (node.path === '') {
        return SVGS.FolderOpen('#8b5cf6', width, height);
    } else if (n.includes('SFX') || n.includes('SOUND') || n.includes('FOLEY') || n.includes('RISER')
        || n.includes('STINGER') || n.includes('WHOOSH') || n.includes('IMPACT')) {
        return SVGS.Music('#fb923c', width, height);
    } else if (n.includes('MUSIC') || n.includes('BEAT') || n.includes('TRACK') || n.includes('AUDIO')
        || n.includes('AMBIENCE') || n.includes('AMBIENT')) {
        return SVGS.Music('#34d399', width, height);
    } else if (n.includes('A_ROLL') || n.includes('AROLL') || n.includes('INTERVIEW')) {
        return SVGS.Video('#f87171', width, height);
    } else if (n.includes('B_ROLL') || n.includes('BROLL') || n.includes('MEDIA') || n.includes('FOOTAGE')
        || n.includes('VIDEO') || n.includes('STOCK') || n.includes('DRONE')) {
        return SVGS.Video('#c084fc', width, height);
    } else if (n.includes('GRAPHIC') || n.includes('THUMB') || n.includes('PNG') || n.includes('LOGO')
        || n.includes('OVERLAY') || n.includes('MOTION') || n.includes('TEMPLATE') || n.includes('GFX')
        || n.includes('FONT') || n.includes('LUT') || n.includes('MOGRT')) {
        return SVGS.ImageIcon('#22d3ee', width, height);
    } else if (n.includes('EXPORT') || n.includes('DELIVER') || n.includes('FINAL') || n.includes('RENDER')) {
        return SVGS.HardDrive('#2dd4bf', width, height);
    } else if (n.includes('PROJECT') || n.includes('PREMIERE') || n.includes('RESOLVE')) {
        return SVGS.FileText('#fbbf24', width, height);
    } else if (n.includes('ARCHIVE')) {
        return SVGS.Archive('#94a3b8', width, height);
    }
    
    return isOpen ? SVGS.FolderOpen('rgba(255, 255, 255, 0.4)', width, height) : SVGS.Folder('rgba(255, 255, 255, 0.4)', width, height);
}

// Folder type overrides keys (stored in localStorage)
const FOLDER_TYPE_KEY = "vizwall_folder_types";

function getFolderTypes() {
    try {
        return JSON.parse(localStorage.getItem(FOLDER_TYPE_KEY) || "{}");
    } catch (e) {
        return {};
    }
}

function setFolderType(folderPath, category) {
    const types = getFolderTypes();
    if (category === "") {
        delete types[folderPath];
    } else {
        types[folderPath] = category;
    }
    localStorage.setItem(FOLDER_TYPE_KEY, JSON.stringify(types));
}

// View mode: 'grid' or 'list'
let viewMode = localStorage.getItem('vizwall_view_mode') || 'grid';
const gridSliderContainer = document.getElementById('gridSliderContainer');
const viewToggleBtn = document.getElementById('viewToggleBtn');

function applyViewMode() {
    if (viewMode === 'list') {
        scrollArea.classList.add('list-view');
        gridSliderContainer.style.display = 'none';
        viewToggleBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>
        </svg>`;
    } else {
        scrollArea.classList.remove('list-view');
        gridSliderContainer.style.display = 'flex';
        viewToggleBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line>
            <line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>
        </svg>`;
    }
}

applyViewMode();

viewToggleBtn.addEventListener('click', () => {
    viewMode = viewMode === 'grid' ? 'list' : 'grid';
    localStorage.setItem('vizwall_view_mode', viewMode);
    applyViewMode();
    filterAndRenderAssets();
});

// Setup grid slider listener
gridSlider.addEventListener('input', () => {
    scrollArea.style.setProperty('--grid-cols', gridSlider.value);
});

// Setup sidebar width and toggle logic
let sidebarWidth = parseInt(localStorage.getItem('vizwall_sidebar_width') || '200', 10);
if (sidebar.classList.contains('open')) {
    sidebar.style.width = `${sidebarWidth}px`;
} else {
    sidebar.style.width = '0px';
}

toggleSidebarBtn.addEventListener('click', () => {
    const isOpen = sidebar.classList.toggle('open');
    toggleSidebarBtn.classList.toggle('active');
    sidebar.style.width = isOpen ? `${sidebarWidth}px` : '0px';
});

closeSidebarBtn.addEventListener('click', () => {
    sidebar.classList.remove('open');
    toggleSidebarBtn.classList.remove('active');
    sidebar.style.width = '0px';
});

// Setup sidebar resize drag listener
const resizer = document.getElementById('sidebarResizer');
if (resizer) {
    let isResizing = false;
    
    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        sidebar.classList.add('resizing');
        resizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const rect = sidebar.getBoundingClientRect();
        let newWidth = e.clientX - rect.left;
        
        if (newWidth < 120) newWidth = 120;
        if (newWidth > 350) newWidth = 350;
        
        sidebarWidth = newWidth;
        localStorage.setItem('vizwall_sidebar_width', sidebarWidth);
        sidebar.style.width = `${sidebarWidth}px`;
    });
    
    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            sidebar.classList.remove('resizing');
            resizer.classList.remove('resizing');
            document.body.style.cursor = 'default';
        }
    });
}

clearFolderFilterBtn.addEventListener('click', () => {
    clearFolderFilter();
});

sortSelect.addEventListener('change', () => {
    filterAndRenderAssets();
});

function clearFolderFilter() {
    selectedFolder = '';
    activeFolderRow.style.display = 'none';
    filterAndRenderAssets();
    updateFolderTreeUI();
}

// Locate local vizwall.db path in AppData
function getDbPath() {
    if (process.platform === 'win32') {
        return path.join(os.homedir(), 'AppData', 'Roaming', 'com.vizwall.workspace', 'vizwall.db');
    } else {
        return path.join(os.homedir(), 'Library', 'Application Support', 'com.vizwall.workspace', 'vizwall.db');
    }
}

// Format bytes to readable size
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Format seconds into MM:SS
function formatDuration(sec) {
    if (sec == null || sec <= 0) return '';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

// Escapes file paths for ExtendScript
function escapePath(filePath) {
    return filePath.replace(/\\/g, '\\\\');
}

// Formats paths for CEF file:/// URL (Uses encodeURI to preserve drive colon like D:)
function formatFileUrl(filePath) {
    if (!filePath) return '';
    let normalized = filePath.replace(/\\/g, '/');
    if (!normalized.startsWith('/')) {
        normalized = '/' + normalized;
    }
    return 'file://' + encodeURI(normalized);
}

// Recursive local directory scanner for global library assets (no DB)
function scanFolderAssets(dirPath) {
    let assets = [];
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    function walk(dir) {
        if (!fs.existsSync(dir)) return;
        let entries = [];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (e) {
            console.error("Read dir error:", e);
            return;
        }

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
                continue;
            }
            
            const name = entry.name;
            if (name.startsWith('.')) continue; // skip hidden
            
            const ext = path.extname(name).toLowerCase().replace('.', '');
            const stem = path.basename(name, path.extname(name)).toLowerCase();
            
            let category = '';
            let mimeType = '';
            
            // Asset classification matching Rust backend
            if (["mp4", "mov", "mkv", "avi", "mxf", "m4v", "wmv", "webm", "ts", "mp2t"].includes(ext)) {
                if (stem.includes("export") || stem.includes("final") || stem.includes("render") || stem.includes("master")) {
                    category = "EXPORTS";
                } else if (stem.includes("a_roll") || stem.includes("aroll") || stem.includes("interview") || stem.includes("talking")) {
                    category = "A_ROLL";
                } else {
                    category = "B_ROLL";
                }
                mimeType = "video/mp4";
            } else if (["mp3", "wav", "aac", "flac", "ogg", "m4a", "aiff", "aif", "wma"].includes(ext)) {
                if (stem.includes("music") || stem.includes("track") || stem.includes("beat") || stem.includes("bgm") || stem.includes("score") || stem.includes("ost") || stem.includes("theme") || stem.includes("loop")) {
                    category = "MUSIC";
                } else {
                    category = "SFX";
                }
                mimeType = "audio/wav";
            } else if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff", "tif", "heic", "heif", "svg", "avif"].includes(ext)) {
                if (stem.includes("thumb") || stem.includes("cover") || stem.includes("poster") || stem.includes("banner")) {
                    category = "THUMBNAILS";
                } else {
                    category = "GRAPHICS";
                }
                mimeType = "image/jpeg";
            } else if (["mogrt", "mogrts", "aet", "aepx", "ffx", "prfpset", "jsx", "jsxbin", "cube", "3dl", "lut"].includes(ext)) {
                category = "GRAPHICS";
                mimeType = "application/octet-stream";
            } else {
                continue; // skip other extensions
            }
            
            let stat;
            try {
                stat = fs.statSync(fullPath);
            } catch (e) {
                continue;
            }
            
            const size = stat.size;
            const mtimeStr = stat.mtime.toISOString().replace('T', ' ').slice(0, 19);
            
            // Simple hash id
            let hash = 0;
            for (let i = 0; i < fullPath.length; i++) {
                hash = (hash << 5) - hash + fullPath.charCodeAt(i);
                hash |= 0;
            }
            const id = 'lib_' + Math.abs(hash).toString(16);
            
            assets.push({
                id,
                project_id: "GLOBAL_LIBRARY",
                name,
                original_name: name,
                path: fullPath,
                size,
                mime_type: mimeType,
                category,
                thumbnail_path: null,
                duration: null,
                created_at: mtimeStr
            });
        }
    }
    
    walk(dirPath);
    return assets;
}

// Initialise Database Connection
function initDatabase() {
    const dbPath = getDbPath();
    console.log("Locating database at:", dbPath);
    
    if (!fs.existsSync(dbPath)) {
        updateStatus(false, "Database not found in AppData");
        renderEmptyState("Database not found", "Ensure the main VizWall Workspace app has run once to initialize.");
        return;
    }

    try {
        const filebuffer = fs.readFileSync(dbPath);
        
        initSqlJs({
            locateFile: file => path.join(__dirname, 'lib', file)
        }).then(sqlInstance => {
            SQL = sqlInstance;
            db = new SQL.Database(filebuffer);
            updateStatus(true, "Connected to local database");
            
            // Load global library setting
            try {
                const stmt = db.prepare("SELECT value FROM ai_settings WHERE key = 'library_path'");
                if (stmt.step()) {
                    libraryPath = stmt.getAsObject().value;
                    console.log("Global library path:", libraryPath);
                }
                stmt.free();
            } catch (e) {
                console.error("Failed to load library path:", e);
            }

            loadProjects();
            
            projectSelect.disabled = false;
            searchInput.disabled = false;
            refreshBtn.style.display = 'inline';
        }).catch(err => {
            console.error("SQL.js init error:", err);
            updateStatus(false, "Failed to load SQLite module");
        });
    } catch (e) {
        console.error("Database reading error:", e);
        updateStatus(false, "Error reading database file");
    }
}

// Update connection status UI
function updateStatus(connected, message) {
    if (connected) {
        statusDot.className = 'status-dot connected';
        statusDot.title = 'Database Connected';
        statusText.textContent = 'Connected';
    } else {
        statusDot.className = 'status-dot';
        statusDot.title = message;
        statusText.textContent = 'Error';
    }
}

// Load list of projects from database
function loadProjects() {
    if (!db) return;
    
    try {
        const stmt = db.prepare("SELECT id, name, path FROM projects WHERE archived = 0 ORDER BY name ASC");
        
        projectSelect.innerHTML = '<option value="">Select Project...</option>';
        projectsMap = {};
        
        while (stmt.step()) {
            const row = stmt.getAsObject();
            projectsMap[row.id] = { name: row.name, path: row.path };
            
            const option = document.createElement('option');
            option.value = row.id;
            option.textContent = row.name;
            projectSelect.appendChild(option);
        }
        stmt.free();

        // Add Global Library if configured
        if (libraryPath && fs.existsSync(libraryPath)) {
            const option = document.createElement('option');
            option.value = "GLOBAL_LIBRARY";
            option.textContent = "🌐 Global Library";
            projectSelect.appendChild(option);
            projectsMap["GLOBAL_LIBRARY"] = { name: "Global Library", path: libraryPath };
        }
    } catch (e) {
        console.error("Error loading projects:", e);
        updateStatus(false, "Failed to load projects");
    }
}

// Load assets for selected project or library
function loadAssets(projectId) {
    // Stop any active audio playbacks
    Object.values(activeAudioPlayers).forEach(p => {
        try { p.pause(); } catch(e) {}
    });
    
    selectedFolder = '';
    activeFolderRow.style.display = 'none';
    openFolders.clear();

    if (!projectId) {
        assetsCache = [];
        currentProjectPath = '';
        renderAssets([]);
        renderFolderTreeUI([]);
        importProjectBtn.style.display = 'none';
        return;
    }

    currentProjectId = projectId;
    const proj = projectsMap[projectId];
    currentProjectPath = proj ? proj.path : '';
    // Hide Import Project button for Global Library — it's a read-only asset browser
    importProjectBtn.style.display = projectId === "GLOBAL_LIBRARY" ? 'none' : 'flex';
    
    if (projectId === "GLOBAL_LIBRARY") {
        console.log("Loading global library assets from:", libraryPath);
        // Normalize the library path so folder tree relative paths work correctly
        currentProjectPath = libraryPath;
        assetsCache = scanFolderAssets(libraryPath);
        filterAndRenderAssets();
        renderFolderTreeUI(getDisplayAssets());
    } else if (db) {
        try {
            const stmt = db.prepare("SELECT name, original_name, path, size, category, thumbnail_path, duration, created_at FROM assets WHERE project_id = ? ORDER BY created_at DESC");
            stmt.bind([projectId]);
            
            assetsCache = [];
            while (stmt.step()) {
                assetsCache.push(stmt.getAsObject());
            }
            stmt.free();
            
            filterAndRenderAssets();
            renderFolderTreeUI(getDisplayAssets());
        } catch (e) {
            console.error("Error loading assets:", e);
            renderEmptyState("Query Failed", "Failed to retrieve assets from database.");
        }
    }
}

// Returns assets with folder overrides dynamically applied, and filters out non-media files globally
function getDisplayAssets() {
    const folderTypes = getFolderTypes();
    const normRoot = currentProjectPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const mediaCategories = ["A_ROLL", "B_ROLL", "AUDIO", "MUSIC", "SFX", "VOICEOVER", "GRAPHICS", "THUMBNAILS", "EXPORTS"];
    const NON_MEDIA_EXTENSIONS = ["ttf", "otf", "woff", "woff2", "eot", "zip", "rar", "7z", "pdf", "txt", "doc", "docx", "xls", "xlsx", "csv"];
    
    const mapped = assetsCache.map(asset => {
        const normAsset = asset.path.replace(/\\/g, '/');
        const normAssetLower = normAsset.toLowerCase();
        
        let rel = normAsset;
        if (normRoot && normAssetLower.startsWith(normRoot)) {
            rel = normAsset.slice(normRoot.length).replace(/^[/\\]+/, '');
        } else {
            rel = normAsset.split('/').pop() || normAsset;
        }
        
        const parts = rel.split('/');
        parts.pop(); // Remove file name
        
        let overrideCat = null;
        for (let i = parts.length; i >= 1; i--) {
            const folderPath = parts.slice(0, i).join('/');
            const override = folderTypes[folderPath] || folderTypes[folderPath.toLowerCase()];
            if (override) {
                overrideCat = override;
                break;
            }
        }
        
        if (overrideCat) {
            return {
                ...asset,
                category: overrideCat
            };
        }
        return asset;
    });
    
    return mapped.filter(asset => {
        if (!asset.category || !mediaCategories.includes(asset.category)) return false;
        if (asset.path) {
            const ext = asset.path.split('.').pop().toLowerCase();
            if (NON_MEDIA_EXTENSIONS.includes(ext)) return false;
        }
        return true;
    });
}

// Helper to filter assets by folder selection and search query, then render
function filterAndRenderAssets() {
    let filtered = getDisplayAssets();

    // 1. Folder Tree Filter
    if (selectedFolder && currentProjectPath) {
        const normRoot = currentProjectPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
        filtered = filtered.filter(asset => {
            const normPath = asset.path.replace(/\\/g, '/');
            const normPathLower = normPath.toLowerCase();
            
            let rel = normPath;
            if (normRoot && normPathLower.startsWith(normRoot)) {
                rel = normPath.slice(normRoot.length).replace(/^[/\\]+/, '');
            }
            
            const parts = rel.split('/');
            parts.pop(); // Remove filename
            const assetFolder = parts.join('/');
            
            return assetFolder === selectedFolder || assetFolder.startsWith(selectedFolder + '/');
        });
    }

    // 2. Search Filter
    const query = searchInput.value.toLowerCase().trim();
    if (query) {
        filtered = filtered.filter(asset => {
            return (asset.name && asset.name.toLowerCase().includes(query)) ||
                   (asset.original_name && asset.original_name.toLowerCase().includes(query)) ||
                   (asset.category && asset.category.toLowerCase().includes(query));
        });
    }

    // 3. Sort Filter (With safe defaults to prevent crashes)
    const sortVal = sortSelect.value;
    const [field, order] = sortVal.split('-');
    
    filtered.sort((a, b) => {
        let comparison = 0;
        if (field === 'name') {
            const nameA = (a.name || '').toLowerCase();
            const nameB = (b.name || '').toLowerCase();
            comparison = nameA.localeCompare(nameB);
        } else if (field === 'size') {
            const sizeA = a.size || 0;
            const sizeB = b.size || 0;
            comparison = sizeA - sizeB;
        } else if (field === 'created_at') {
            const dateA = a.created_at || '';
            const dateB = b.created_at || '';
            comparison = dateA.localeCompare(dateB);
            // Fallback to name if created_at is identical
            if (comparison === 0) {
                const nameA = (a.name || '').toLowerCase();
                const nameB = (b.name || '').toLowerCase();
                comparison = nameA.localeCompare(nameB);
            }
        }
        
        return order === 'asc' ? comparison : -comparison;
    });

    renderAssets(filtered);
}

// Renders the folder tree list in the sidebar
function renderFolderTreeUI(assets) {
    folderTree.innerHTML = '';
    if (!assets || assets.length === 0 || !currentProjectPath) return;

    const rootNode = buildFolderTree(assets, currentProjectPath);
    
    // Auto expand immediate top-level children
    rootNode.children.forEach(child => {
        openFolders.add(child.path);
    });

    const treeHtml = createFolderTreeDom(rootNode);
    folderTree.appendChild(treeHtml);
}

// Triggers redraw of folder tree when node collapse/expand occurs
function updateFolderTreeUI() {
    folderTree.innerHTML = '';
    const rootNode = buildFolderTree(getDisplayAssets(), currentProjectPath);
    const treeHtml = createFolderTreeDom(rootNode);
    folderTree.appendChild(treeHtml);
}

// Builds the hierarchical folder tree data structure
function buildFolderTree(assets, projectPath) {
    const root = { name: "All Files", path: "", children: [], assetCount: assets.length };
    const nodeMap = new Map();
    const categoryCounts = new Map();
    nodeMap.set("", root);

    const normRoot = projectPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const folderTypes = getFolderTypes();

    for (const asset of assets) {
        const normAsset = asset.path.replace(/\\/g, '/');
        const normAssetLower = normAsset.toLowerCase();

        let rel = "";
        if (normRoot && normAssetLower.startsWith(normRoot)) {
            rel = normAsset.slice(normRoot.length).replace(/^[/\\]+/, '');
        } else {
            rel = normAsset.split('/').pop() || normAsset;
        }

        const parts = rel.split('/');
        parts.pop(); // remove file name

        let currentPath = "";
        const folderPaths = [];
        for (const part of parts) {
            if (!part) continue;
            const parentPath = currentPath;
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            folderPaths.push(currentPath);

            if (!nodeMap.has(currentPath)) {
                const override = folderTypes[currentPath] || folderTypes[currentPath.toLowerCase()];
                const node = {
                    name: part,
                    path: currentPath,
                    children: [],
                    assetCount: 0,
                    overrideCategory: override
                };
                nodeMap.set(currentPath, node);
                const parent = nodeMap.get(parentPath) || root;
                parent.children.push(node);
            }
        }

        // Increment counts and category stats for this folder and all ancestors
        for (let i = folderPaths.length - 1; i >= 0; i--) {
            const p = folderPaths[i];
            const node = nodeMap.get(p);
            if (node) {
                node.assetCount++;
                if (!categoryCounts.has(p)) {
                    categoryCounts.set(p, {});
                }
                const counts = categoryCounts.get(p);
                counts[asset.category] = (counts[asset.category] || 0) + 1;
            }
        }
    }

    // Compute dominant category from counts
    for (const [path, node] of nodeMap) {
        if (!path) continue;
        const counts = categoryCounts.get(path);
        if (counts) {
            const sortedCounts = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            if (sortedCounts.length > 0) {
                node.dominantCategory = sortedCounts[0][0];
            }
        }
    }

    const sortNode = (n) => {
        n.children.sort((a, b) => a.name.localeCompare(b.name));
        n.children.forEach(sortNode);
    };
    sortNode(root);

    return root;
}

// Right-click menu to override folder category
function showFolderTypeMenu(x, y, node) {
    const existing = document.getElementById('folderTypeMenu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'folderTypeMenu';
    menu.style.position = 'fixed';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.zIndex = '9999';
    menu.style.backgroundColor = '#0c0a14';
    menu.style.border = '1px solid rgba(255, 255, 255, 0.08)';
    menu.style.borderRadius = '10px';
    menu.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.6)';
    menu.style.padding = '4px 0';
    menu.style.width = '160px';

    const header = document.createElement('div');
    header.style.padding = '6px 10px';
    header.style.fontSize = '9px';
    header.style.fontWeight = 'bold';
    header.style.color = 'rgba(255, 255, 255, 0.3)';
    header.style.textTransform = 'uppercase';
    header.style.letterSpacing = '0.5px';
    header.style.borderBottom = '1px solid rgba(255, 255, 255, 0.05)';
    header.textContent = 'Set Folder Type';
    menu.appendChild(header);

    const options = [
        { value: 'SFX', label: 'SFX', color: '#fb923c' },
        { value: 'MUSIC', label: 'Music', color: '#34d399' },
        { value: 'GRAPHICS', label: 'Graphics', color: '#22d3ee' },
        { value: 'THUMBNAILS', label: 'Thumbnails', color: '#f472b6' },
        { value: 'B_ROLL', label: 'B-Roll', color: '#c084fc' },
        { value: 'A_ROLL', label: 'A-Roll', color: '#f87171' },
        { value: 'EXPORTS', label: 'Exports', color: '#2dd4bf' },
        { value: 'PROJECT_FILES', label: 'Project Files', color: '#fbbf24' },
        { value: '', label: 'Auto-detect', color: '#94a3b8' }
    ];

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.style.width = '100%';
        btn.style.background = 'none';
        btn.style.border = 'none';
        btn.style.padding = '6px 10px';
        btn.style.color = node.overrideCategory === opt.value ? '#a78bfa' : 'rgba(255, 255, 255, 0.7)';
        btn.style.textAlign = 'left';
        btn.style.fontFamily = 'inherit';
        btn.style.fontSize = '11px';
        btn.style.cursor = 'pointer';
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';
        btn.style.gap = '8px';
        btn.style.transition = 'background-color 0.15s ease';

        if (node.overrideCategory === opt.value) {
            btn.style.backgroundColor = 'rgba(139, 92, 246, 0.1)';
        }

        btn.addEventListener('mouseenter', () => {
            btn.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.backgroundColor = node.overrideCategory === opt.value ? 'rgba(139, 92, 246, 0.1)' : 'transparent';
        });

        btn.addEventListener('click', () => {
            setFolderType(node.path, opt.value);
            menu.remove();
            filterAndRenderAssets();
            updateFolderTreeUI();
        });

        const dot = document.createElement('span');
        dot.style.width = '6px';
        dot.style.height = '6px';
        dot.style.borderRadius = '50%';
        dot.style.backgroundColor = opt.color;
        btn.appendChild(dot);

        const text = document.createElement('span');
        text.textContent = opt.label;
        btn.appendChild(text);

        menu.appendChild(btn);
    });

    document.body.appendChild(menu);

    const dismiss = (e) => {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('mousedown', dismiss);
        }
    };
    document.addEventListener('mousedown', dismiss);
}

// Recursively builds the DOM tree for the Sidebar Folders
function createFolderTreeDom(node, depth = 0) {
    const row = document.createElement('div');
    row.className = 'tree-node-row';
    
    const item = document.createElement('button');
    item.className = 'tree-item';
    if (selectedFolder === node.path) {
        item.classList.add('selected');
    }
    
    item.style.paddingLeft = (8 + depth * 12) + 'px';
    
    const hasChildren = node.children && node.children.length > 0;
    const isOpen = openFolders.has(node.path);
    
    let chevronHtml = '<span class="tree-chevron"></span>';
    if (hasChildren) {
        chevronHtml = `<span class="tree-chevron ${isOpen ? 'open' : ''}">▸</span>`;
    }
    
    const folderIconSvg = getFolderIcon(node, isOpen, 13, 13);
    
    item.innerHTML = `
        ${chevronHtml}
        <span class="tree-icon" style="margin-right: 4px;">${folderIconSvg}</span>
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex-grow:1;">
            ${node.name === '' ? 'All Files' : node.name.replace(/_/g, ' ')}
        </span>
        ${node.overrideCategory ? `<span style="font-size: 7px; font-weight: bold; color: rgba(139, 92, 246, 0.60); font-family: monospace; margin-right: 4px;">${node.overrideCategory.replace('_', ' ')}</span>` : ''}
        <span class="tree-count">${node.assetCount}</span>
    `;
    
    // Left click selects/expands
    item.addEventListener('click', (e) => {
        const rect = item.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        
        const isChevronClick = e.target.classList.contains('tree-chevron') || 
                               (clickX < (20 + depth * 12) && !e.target.closest('.tree-icon'));
        
        if (hasChildren && isChevronClick) {
            e.stopPropagation();
            if (isOpen) {
                openFolders.delete(node.path);
            } else {
                openFolders.add(node.path);
            }
            updateFolderTreeUI();
            return;
        }
        
        selectedFolder = node.path;
        activeFolderName.textContent = node.name === '' ? 'All Files' : node.name.replace(/_/g, ' ');
        activeFolderRow.style.display = node.path === '' ? 'none' : 'flex';
        
        filterAndRenderAssets();
        updateFolderTreeUI();
    });

    // Right click triggers Folder Type override context menu
    item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showFolderTypeMenu(e.clientX, e.clientY, node);
    });
    
    row.appendChild(item);
    
    if (hasChildren && (isOpen || node.path === '')) {
        const childContainer = document.createElement('div');
        node.children.forEach(child => {
            childContainer.appendChild(createFolderTreeDom(child, depth + 1));
        });
        row.appendChild(childContainer);
    }
    
    return row;
}

function getAudioAccents(category) {
    const cat = (category || '').toUpperCase();
    if (cat === 'MUSIC') return { played: '#10b981', unplayed: 'rgba(16, 185, 129, 0.7)' };
    if (cat === 'SFX') return { played: '#f97316', unplayed: 'rgba(249, 115, 22, 0.7)' };
    if (cat === 'VOICEOVER') return { played: '#38bdf8', unplayed: 'rgba(56, 189, 248, 0.7)' };
    return { played: '#3b82f6', unplayed: 'rgba(59, 130, 246, 0.7)' };
}

// Draw static placeholder waveform inside canvas
function drawPlaceholderWaveform(ctx, W, H, category) {
    ctx.clearRect(0, 0, W, H);
    const accents = getAudioAccents(category);
    ctx.fillStyle = accents.unplayed;
    const barsCount = 35;
    const barW = W / barsCount;
    for (let i = 0; i < barsCount; i++) {
        const x = i * barW;
        const h = 8 + Math.sin(i * 0.4) * 12;
        const y = (H - h) / 2;
        ctx.fillRect(x + 1, y, barW - 1, h);
    }
}

// Draw decoded array waveform inside canvas
function drawDecodedWave(ctx, W, H, data, progress = 0, category) {
    ctx.clearRect(0, 0, W, H);
    const barW = W / data.length;
    const progressX = progress * W;
    const accents = getAudioAccents(category);
    
    for (let i = 0; i < data.length; i++) {
        const x = i * barW;
        const val = data[i];
        const h = Math.max(3, val * H * 0.85);
        const y = (H - h) / 2;
        
        if (x < progressX) {
            ctx.fillStyle = accents.played;
        } else {
            ctx.fillStyle = accents.unplayed;
        }
        ctx.fillRect(x + 0.5, y, Math.max(1, barW - 1), h);
    }
}

// Asynchronously loads and decodes audio files to draw custom waveforms (Accepts canvas element directly)
function drawAudioWaveform(filePath, canvas, assetId, category) {
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const W = canvas.width = 300;
    const H = canvas.height = 80;
    
    drawPlaceholderWaveform(ctx, W, H, category);
    
    if (!fs.existsSync(filePath)) return;
    
    // Read file using Node.js fs module (prevents browser CORS or absolute-path bugs)
    fs.readFile(filePath, (err, buffer) => {
        if (err) return;
        
        let arrayBuffer;
        if (buffer.buffer) {
            arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        } else {
            arrayBuffer = new Uint8Array(buffer).buffer;
        }
        
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        audioCtx.decodeAudioData(arrayBuffer, (decodedData) => {
            const raw = decodedData.getChannelData(0);
            const bars = 150;
            const step = Math.floor(raw.length / bars);
            const data = new Float32Array(bars);
            
            for (let i = 0; i < bars; i++) {
                let max = 0;
                for (let j = 0; j < step; j++) {
                    const idx = i * step + j;
                    if (idx < raw.length) {
                        max = Math.max(max, Math.abs(raw[idx]));
                    }
                }
                data[i] = max;
            }
            
            audioWaveforms[assetId] = {
                data: data,
                duration: decodedData.duration,
                category: category
            };
            
            drawDecodedWave(ctx, W, H, data, 0, category);
            audioCtx.close();
        }, (e) => {
            console.error("Decode fail:", filePath, e);
        });
    });
}

// Setup audio listeners for interactive playback & playhead progression (Accepts canvas element directly)
function setupAudioCardListeners(card, asset, canvas) {
    let animFrame = null;
    let audio = null;
    
    card.addEventListener('mouseenter', () => {
        // Stop any other currently playing audio players first
        Object.keys(activeAudioPlayers).forEach(key => {
            if (key !== asset.id && activeAudioPlayers[key]) {
                try {
                    activeAudioPlayers[key].pause();
                    activeAudioPlayers[key].currentTime = 0;
                } catch(e) {}
            }
        });

        if (!activeAudioPlayers[asset.id]) {
            audio = new Audio(formatFileUrl(asset.path));
            audio.volume = 0.85;
            activeAudioPlayers[asset.id] = audio;
        } else {
            audio = activeAudioPlayers[asset.id];
        }
        
        audio.currentTime = 0;
        audio.play().catch(e => console.error("Audio play error", e));
        
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        
        function tick() {
            const info = audioWaveforms[asset.id];
            if (info && audio && audio.duration > 0) {
                const progress = audio.currentTime / audio.duration;
                drawDecodedWave(ctx, W, H, info.data, progress, info.category);
            }
            animFrame = requestAnimationFrame(tick);
        }
        animFrame = requestAnimationFrame(tick);
    });
    
    card.addEventListener('mouseleave', () => {
        if (animFrame) cancelAnimationFrame(animFrame);
        
        const audio = activeAudioPlayers[asset.id];
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }
        
        if (canvas) {
            const ctx = canvas.getContext('2d');
            const info = audioWaveforms[asset.id];
            if (info) {
                drawDecodedWave(ctx, canvas.width, canvas.height, info.data, 0, info.category);
            } else {
                drawPlaceholderWaveform(ctx, canvas.width, canvas.height, asset.category);
            }
        }
    });
}

// Render asset grid or list
function renderAssets(assets) {
    scrollArea.innerHTML = '';
    
    if (assets.length === 0) {
        if (currentProjectId) {
            renderEmptyState("No assets found", searchInput.value ? "Try modifying your search." : "This folder contains no assets.");
        } else {
            renderEmptyState("No project selected", "Choose a project from the dropdown above to view assets.");
        }
        return;
    }
    
    const isList = viewMode === 'list';
    
    assets.forEach(asset => {
        const card = document.createElement('div');
        card.className = 'asset-card';
        
        const isVideo = asset.category === "A_ROLL" || asset.category === "B_ROLL";
        const isAudio = asset.category === "AUDIO" || asset.category === "MUSIC" || asset.category === "SFX" || asset.category === "VOICEOVER";
        const isImage = asset.category === "THUMBNAILS" || asset.category === "GRAPHICS";

        // Determine thumbnail source
        let thumbUrl = '';
        let hasThumb = false;
        
        if (asset.thumbnail_path) {
            thumbUrl = formatFileUrl(asset.thumbnail_path);
            hasThumb = true;
        } else if (isImage && asset.path) {
            thumbUrl = formatFileUrl(asset.path);
            hasThumb = true;
        }

        let thumbHtml = '';
        const canvasId = `wave_${asset.id}`;
        
        // Audio always gets waveform canvas (both grid and list)
        if (isAudio) {
            thumbHtml = `<canvas class="waveform-canvas" id="${canvasId}"></canvas>`;
        } else if (hasThumb) {
            thumbHtml = `
                <img src="${thumbUrl}" class="card-thumb-image-blur" />
                <img src="${thumbUrl}" class="card-thumb-image" />
            `;
        } else {
            const svgIcon = getCategoryIcon(asset.category, isList ? 18 : 26, isList ? 18 : 26);
            thumbHtml = `
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0.5;">
                    ${svgIcon}
                </div>
            `;
        }

        // Duration badge
        const durationHtml = asset.duration ? `<span class="duration-badge">${formatDuration(asset.duration)}</span>` : '';
        
        // Category badge
        const catClass = `category-badge badge-${asset.category.toLowerCase()}`;
        const catLabel = asset.category.replace('_', ' ');

        if (isList) {
            // List layout: thumb | name | category | size | duration
            card.innerHTML = `
                <div class="card-thumb-area">
                    ${thumbHtml}
                    ${isVideo ? `<video class="card-video" muted playsinline></video>` : ''}
                </div>
                <div class="card-details">
                    <div class="card-title" title="${asset.name}">${asset.name}</div>
                    <span class="${catClass}" style="position:static;font-size:7px;">${catLabel}</span>
                    <div class="card-meta" style="margin-left:auto;">
                        <span>${formatBytes(asset.size)}</span>
                        ${asset.duration ? `<span style="margin-left:6px;color:rgba(255,255,255,0.5);">${formatDuration(asset.duration)}</span>` : ''}
                    </div>
                </div>
            `;
        } else {
            card.innerHTML = `
                <div class="card-thumb-area">
                    ${thumbHtml}
                    ${durationHtml}
                    <span class="${catClass}">${catLabel}</span>
                    <div class="card-play-overlay">
                        <div class="play-btn-circle">
                            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="0" fill="currentColor">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                        </div>
                    </div>
                    ${isVideo ? `<video class="card-video" muted playsinline></video>` : ''}
                </div>
                <div class="card-details">
                    <div class="card-title" title="${asset.name}">${asset.name}</div>
                    <div class="card-meta">
                        <span>${formatBytes(asset.size)}</span>
                    </div>
                </div>
            `;
        }
        
        // Asynchronously render custom audio waveforms
        if (isAudio && asset.path) {
            const canvas = card.querySelector('.waveform-canvas');
            drawAudioWaveform(asset.path, canvas, asset.id, asset.category);
            setupAudioCardListeners(card, asset, canvas);
        }

        // Video hover preview interaction
        if (isVideo && asset.path) {
            const video = card.querySelector('.card-video');
            let playTimeout = null;

            card.addEventListener('mouseenter', () => {
                playTimeout = setTimeout(() => {
                    video.src = formatFileUrl(asset.path);
                    video.classList.add('playing');
                    video.play().catch(e => console.error("Video play fail", e));
                }, 200);
            });
            
            card.addEventListener('mouseleave', () => {
                if (playTimeout) clearTimeout(playTimeout);
                video.pause();
                video.classList.remove('playing');
                video.src = ''; // Clear source to unlock the file immediately
            });
        }

        // Single click to import asset directly to Premiere Pro
        card.addEventListener('click', (e) => {
            importToPremiere(asset.path);
        });
        
        // ── Drag to timeline / project bin ───────────────────────────────
        // HTML5 dataTransfer does NOT work for dropping into Premiere's timeline
        // from a CEP panel. We must use the native CEP drag API instead.
        // Strategy:
        //   mousedown → record start position
        //   mousemove → once moved >4px, call window.__adobe_cep__.startDrag()
        //               which hands the drag off to the OS/Premiere natively
        //   mouseup   → cancel if drag never started (treat as click)
        
        let dragStartX = 0, dragStartY = 0, dragInitiated = false;
        
        card.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // left button only
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            dragInitiated = false;
            
            const onMouseMove = (me) => {
                const dx = me.clientX - dragStartX;
                const dy = me.clientY - dragStartY;
                if (!dragInitiated && Math.sqrt(dx * dx + dy * dy) > 4) {
                    dragInitiated = true;
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    
                    // Use native CEP drag — this is what allows dropping into
                    // Premiere's timeline and project bin from a panel.
                    // The path must be an absolute OS path (backslashes on Windows).
                    const nativePath = asset.path.replace(/\//g, '\\');
                    
                    if (window.__adobe_cep__) {
                        // CEP native file drag — works with Premiere timeline
                        window.__adobe_cep__.startDrag(
                            'application/x-premiere-project-item',
                            nativePath
                        );
                    } else {
                        // Fallback for non-CEP environments (dev/testing)
                        console.log('CEP not available, would drag:', nativePath);
                    }
                }
            };
            
            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
        
        // Keep draggable=true as a hint but the actual drag is handled above
        card.setAttribute('draggable', 'false');
        
        scrollArea.appendChild(card);
    });
}

// Call Premiere Pro ExtendScript to import selected file
function importToPremiere(filePath) {
    if (!filePath) return;
    
    if (!fs.existsSync(filePath)) {
        alert("File does not exist on disk: " + filePath);
        return;
    }
    
    const cs = new CSInterface();
    const escaped = escapePath(filePath);
    console.log("Importing to Premiere Pro:", escaped);
    
    cs.evalScript(`importAsset("${escaped}")`, (response) => {
        console.log("Adobe ExtendScript Response:", response);
        if (response && response.indexOf("Error") > -1) {
            alert(response);
        }
    });
}

// Helper to render empty states
function renderEmptyState(title, text) {
    scrollArea.innerHTML = `
        <div class="empty-state">
            <svg class="empty-icon" viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <div style="font-weight: 500; font-size: 12px; color: rgba(255,255,255,0.7);">${title}</div>
            <div style="font-size: 10px; color: rgba(255,255,255,0.35); max-width: 180px; margin: 0 auto;">${text}</div>
        </div>
    `;
}

// Event Listeners
projectSelect.addEventListener('change', (e) => {
    loadAssets(e.target.value);
});

searchInput.addEventListener('input', () => {
    filterAndRenderAssets();
});

refreshBtn.addEventListener('click', () => {
    initDatabase();
});

importProjectBtn.addEventListener('click', () => {
    importWholeProject();
});

function getAssetRelativeFolder(asset) {
    if (!currentProjectPath) return '';
    const normRoot = currentProjectPath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const normAsset = asset.path.replace(/\\/g, '/');
    const normAssetLower = normAsset.toLowerCase();
    
    let rel = normAsset;
    if (normRoot && normAssetLower.startsWith(normRoot)) {
        rel = normAsset.slice(normRoot.length).replace(/^[/\\]+/, '');
    } else {
        rel = normAsset.split('/').pop() || normAsset;
    }
    
    const parts = rel.split('/');
    parts.pop(); // Remove filename
    return parts.join('/');
}

function evalScriptAsync(script) {
    return new Promise((resolve, reject) => {
        const cs = new CSInterface();
        cs.evalScript(script, (response) => {
            resolve(response);
        });
    });
}

async function importWholeProject() {
    const mediaCategories = ["A_ROLL", "B_ROLL", "AUDIO", "MUSIC", "SFX", "VOICEOVER", "GRAPHICS", "THUMBNAILS", "EXPORTS"];
    const validAssets = getDisplayAssets().filter(asset => mediaCategories.includes(asset.category));
    
    if (validAssets.length === 0) {
        alert("No media files found in this project to import.");
        return;
    }
    
    // Confirm import with user
    const msg = `Import all ${validAssets.length} media files and organize them into standard project bins (Sequences, Footage, Audio, etc.) in Premiere Pro? (Non-media files will be ignored)`;
    if (!confirm(msg)) return;
    
    // Get modal components
    const importModal = document.getElementById('importModal');
    const progressBarFill = document.getElementById('importProgressBarFill');
    const progressStatus = document.getElementById('importProgressStatus');
    const progressFile = document.getElementById('importProgressFile');
    const modalFooter = document.getElementById('importModalFooter');
    const closeBtn = document.getElementById('closeImportModalBtn');
    
    // Show modal and initialize progress
    importModal.style.display = 'flex';
    progressBarFill.style.width = '0%';
    progressStatus.textContent = `Preparing import of ${validAssets.length} assets...`;
    progressFile.textContent = '';
    modalFooter.style.display = 'none';
    
    closeBtn.onclick = () => {
        importModal.style.display = 'none';
    };

    // Create standard structure bins first (Sequences, Footage, Audio, Graphics, Exports)
    try {
        progressStatus.textContent = "Creating standard project folder structure...";
        await evalScriptAsync(`createStandardBins()`);
    } catch (err) {
        console.error("Failed to create standard bins structure:", err);
    }
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < validAssets.length; i++) {
        const asset = validAssets[i];
        const percent = Math.round((i / validAssets.length) * 100);
        
        // Update UI
        progressBarFill.style.width = `${percent}%`;
        progressStatus.textContent = `Importing asset ${i + 1} of ${validAssets.length}...`;
        progressFile.textContent = asset.name;
        
        const relativeFolder = getAssetRelativeFolder(asset);
        
        // Map asset categories to standard structure bins
        let folderPrefix = "";
        const cat = asset.category;
        if (cat === "A_ROLL" || cat === "B_ROLL") {
            folderPrefix = "02 Footage";
        } else if (cat === "AUDIO" || cat === "MUSIC" || cat === "SFX" || cat === "VOICEOVER") {
            folderPrefix = "03 Audio";
        } else if (cat === "GRAPHICS" || cat === "THUMBNAILS") {
            folderPrefix = "04 Graphics";
        } else if (cat === "EXPORTS") {
            folderPrefix = "05 Exports";
        } else {
            folderPrefix = "02 Footage"; // Default fallback
        }
        
        const finalFolder = relativeFolder ? `${folderPrefix}/${relativeFolder}` : folderPrefix;
        const escapedPath = escapePath(asset.path);
        const escapedFolder = escapePath(finalFolder);
        
        try {
            // Call individual file import in ExtendScript
            const result = await evalScriptAsync(`importFileToBin("${escapedPath}", "${escapedFolder}")`);
            if (result && result.indexOf("Error") === -1) {
                successCount++;
            } else {
                console.error(`Import failed for ${asset.path}:`, result);
                failCount++;
            }
        } catch (err) {
            console.error(`Error during ExtendScript execution for ${asset.path}:`, err);
            failCount++;
        }
    }
    
    // Complete state
    progressBarFill.style.width = '100%';
    progressStatus.textContent = `Import completed! ${successCount} files imported successfully, ${failCount} failed.`;
    progressFile.textContent = '';
    modalFooter.style.display = 'flex';
}

// Initialize on load
window.onload = () => {
    initDatabase();
};
