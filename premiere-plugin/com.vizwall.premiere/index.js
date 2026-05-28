// JS script for VizWall Premiere Plugin
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

let db = null;
let SQL = null;
let currentProjectId = '';
let assetsCache = [];

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
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Escapes file paths for ExtendScript
function escapePath(filePath) {
    // Replace single backslashes with double backslashes
    return filePath.replace(/\\/g, '\\\\');
}

// Initialise Database Connection using sql.js (pure JS/Wasm SQLite)
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
        
        // Initialize sql.js
        initSqlJs({
            locateFile: file => path.join(__dirname, 'lib', file)
        }).then(sqlInstance => {
            SQL = sqlInstance;
            db = new SQL.Database(filebuffer);
            updateStatus(true, "Connected to local database");
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
        const stmt = db.prepare("SELECT id, name FROM projects WHERE archived = 0 ORDER BY name ASC");
        
        // Clear previous options except placeholder
        projectSelect.innerHTML = '<option value="">Select Project...</option>';
        
        while (stmt.step()) {
            const row = stmt.getAsObject();
            const option = document.createElement('option');
            option.value = row.id;
            option.textContent = row.name;
            projectSelect.appendChild(option);
        }
        stmt.free();
    } catch (e) {
        console.error("Error loading projects:", e);
        updateStatus(false, "Failed to load projects");
    }
}

// Load assets for selected project
function loadAssets(projectId) {
    if (!db || !projectId) {
        assetsCache = [];
        renderAssets([]);
        return;
    }
    
    try {
        const stmt = db.prepare("SELECT name, original_name, path, size, category FROM assets WHERE project_id = ? ORDER BY created_at DESC");
        stmt.bind([projectId]);
        
        assetsCache = [];
        while (stmt.step()) {
            assetsCache.push(stmt.getAsObject());
        }
        stmt.free();
        
        filterAndRenderAssets();
    } catch (e) {
        console.error("Error loading assets:", e);
        renderEmptyState("Query Failed", "Failed to retrieve assets from database.");
    }
}

// Filter cached assets by search query and render
function filterAndRenderAssets() {
    const query = searchInput.value.toLowerCase().trim();
    if (!query) {
        renderAssets(assetsCache);
        return;
    }
    
    const filtered = assetsCache.filter(asset => {
        return (asset.name && asset.name.toLowerCase().includes(query)) ||
               (asset.original_name && asset.original_name.toLowerCase().includes(query)) ||
               (asset.category && asset.category.toLowerCase().includes(query));
    });
    
    renderAssets(filtered);
}

// Render asset list in panel UI
function renderAssets(assets) {
    scrollArea.innerHTML = '';
    
    if (assets.length === 0) {
        if (currentProjectId) {
            renderEmptyState("No assets found", searchInput.value ? "Try modifying your search." : "This project has no assets imported.");
        } else {
            renderEmptyState("No project selected", "Choose a project from the dropdown above to view assets.");
        }
        return;
    }
    
    assets.forEach(asset => {
        const item = document.createElement('div');
        item.className = 'asset-item';
        
        // Decide icon based on category
        let iconSvg = `
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
        `; // default image icon
        
        const cat = (asset.category || '').toUpperCase();
        if (cat.includes('MEDIA') || cat.includes('A_ROLL') || cat.includes('B_ROLL') || cat.includes('FOOTAGE')) {
            iconSvg = `
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
                    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
                    <line x1="7" y1="2" x2="7" y2="22"></line>
                    <line x1="17" y1="2" x2="17" y2="22"></line>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <line x1="2" y1="7" x2="7" y2="7"></line>
                    <line x1="2" y1="17" x2="7" y2="17"></line>
                    <line x1="17" y1="17" x2="22" y2="17"></line>
                    <line x1="17" y1="7" x2="22" y2="7"></line>
                </svg>
            `; // video icon
        } else if (cat.includes('AUDIO') || cat.includes('MUSIC') || cat.includes('SFX')) {
            iconSvg = `
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
                    <path d="M9 18V5l12-2v13"></path>
                    <circle cx="6" cy="18" r="3"></circle>
                    <circle cx="18" cy="16" r="3"></circle>
                </svg>
            `; // audio icon
        }

        item.innerHTML = `
            <div class="asset-icon-box">${iconSvg}</div>
            <div class="asset-info">
                <div class="asset-name" title="${asset.name}">${asset.name}</div>
                <div class="asset-meta">
                    <span class="asset-category">${asset.category}</span>
                    <span>${formatBytes(asset.size)}</span>
                </div>
            </div>
        `;
        
        // Single click imports file directly into active Premiere Pro project
        item.addEventListener('click', () => {
            importToPremiere(asset.path);
        });
        
        scrollArea.appendChild(item);
    });
}

// Call Premiere Pro ExtendScript to import selected file
function importToPremiere(filePath) {
    if (!filePath) return;
    
    // Check if file actually exists
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
    currentProjectId = e.target.value;
    loadAssets(currentProjectId);
});

searchInput.addEventListener('input', () => {
    filterAndRenderAssets();
});

refreshBtn.addEventListener('click', () => {
    initDatabase();
});

// Initialize on load
window.onload = () => {
    initDatabase();
};
