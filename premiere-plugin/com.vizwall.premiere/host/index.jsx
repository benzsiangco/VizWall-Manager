// ExtendScript for VizWall Premiere Plugin

function importAsset(filePath) {
    try {
        if (!app.project) {
            return "Error: No project open in Premiere Pro.";
        }
        var paths = [filePath];
        // Import files: importFiles(paths, suppressWarnings, targetBin, importAsNumberedStills)
        // Using app.project.getInsertionBin() places it in the user's currently selected bin
        var success = app.project.importFiles(
            paths, 
            true, 
            app.project.getInsertionBin(), 
            false
        );
        
        if (success) {
            return "Success: Imported " + filePath;
        } else {
            return "Error: Premiere failed to import file.";
        }
    } catch (e) {
        return "Error in ExtendScript: " + e.toString();
    }
}
