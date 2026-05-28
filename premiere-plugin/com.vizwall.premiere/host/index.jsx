// ExtendScript for VizWall Premiere Plugin

function importAsset(filePath) {
    try {
        if (!app.project) {
            return "Error: No project open in Premiere Pro.";
        }
        var paths = [filePath];
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

function importFileToBin(filePath, relativeBinPath) {
    try {
        if (!app.project) {
            return "Error: No project open in Premiere Pro.";
        }
        
        // Resolve bin
        var currentBin = app.project.rootItem;
        if (relativeBinPath) {
            var folders = relativeBinPath.replace(/\\/g, '/').split('/');
            for (var i = 0; i < folders.length; i++) {
                var folderName = folders[i];
                if (!folderName) continue;
                
                var foundBin = null;
                for (var j = 0; j < currentBin.children.numItems; j++) {
                    var child = currentBin.children[j];
                    if (child.type === ProjectItemType.BIN && child.name === folderName) {
                        foundBin = child;
                        break;
                    }
                }
                
                if (foundBin) {
                    currentBin = foundBin;
                } else {
                    currentBin = currentBin.createBin(folderName);
                }
            }
        }
        
        // Import file
        var success = app.project.importFiles(
            [filePath],
            true,
            currentBin,
            false
        );
        if (success) {
            return "Success";
        } else {
            return "Error: Premiere failed to import file.";
        }
    } catch (e) {
        return "Error: " + e.toString();
    }
}

function importAllAssets(serializedData) {
    try {
        if (!app.project) {
            return "Error: No project open in Premiere Pro.";
        }
        
        var items = serializedData.split('///');
        var successCount = 0;
        
        for (var idx = 0; idx < items.length; idx++) {
            var itemStr = items[idx];
            if (!itemStr) continue;
            
            var parts = itemStr.split('|||');
            var filePath = parts[0];
            var relativeBinPath = parts[1];
            
            // Resolve bin
            var currentBin = app.project.rootItem;
            if (relativeBinPath) {
                var folders = relativeBinPath.replace(/\\/g, '/').split('/');
                for (var i = 0; i < folders.length; i++) {
                    var folderName = folders[i];
                    if (!folderName) continue;
                    
                    var foundBin = null;
                    for (var j = 0; j < currentBin.children.numItems; j++) {
                        var child = currentBin.children[j];
                        if (child.type === ProjectItemType.BIN && child.name === folderName) {
                            foundBin = child;
                            break;
                        }
                    }
                    
                    if (foundBin) {
                        currentBin = foundBin;
                    } else {
                        currentBin = currentBin.createBin(folderName);
                    }
                }
            }
            
            // Import file
            var success = app.project.importFiles(
                [filePath],
                true,
                currentBin,
                false
            );
            if (success) {
                successCount++;
            }
        }
        return "Success: Imported " + successCount + " files.";
    } catch (e) {
        return "Error: " + e.toString();
    }
}

function createStandardBins() {
    try {
        if (!app.project) {
            return "Error: No project open in Premiere Pro.";
        }
        var bins = ["01 Sequences", "02 Footage", "03 Audio", "04 Graphics", "05 Exports"];
        var root = app.project.rootItem;
        for (var i = 0; i < bins.length; i++) {
            var binName = bins[i];
            var found = false;
            for (var j = 0; j < root.children.numItems; j++) {
                var child = root.children[j];
                if (child.type === ProjectItemType.BIN && child.name === binName) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                root.createBin(binName);
            }
        }
        return "Success";
    } catch (e) {
        return "Error: " + e.toString();
    }
}

