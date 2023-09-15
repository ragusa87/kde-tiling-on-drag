// If you want to edit this file, set a duration for 15 second, so the script is automatically unloaded afterwards.
DEFAULT_BIND_DURATION = -1

// Implement setTimeout as it's missing
function setTimeout(callbackFunc, milliseconds) {
    var timer = new QTimer();
    timer.timeout.connect(function() {
        timer.stop();
        callbackFunc();
    });
    timer.start(milliseconds);
    return timer;
}

// Bind to an event on temporal basis, useful for debugging as "kwin" don't unload script on change.
function connectTemporarily(object, callback, duration = null){
    duration = duration ?? DEFAULT_BIND_DURATION
    object.connect(callback);
    if(duration < 0)
        return;

    setTimeout(function(){
        console.log("disconnect")
        object.disconnect(callback);
    }, duration)
}

// When the user move a window, tile it !
const clientStartUserMovedResized = function(client){
    print("clientFinishUserMovedResized");
    tileClient(client)
}

// ===
// Listener that are client specific
function addListenersOnClient(client){
    print("Add listeners " + client.resourceName)
    connectTemporarily(client.clientFinishUserMovedResized, clientStartUserMovedResized, -1);
}

function removeListenersOnClient(client){
    print("remove listeners " + client.resourceName)
    client.clientFinishUserMovedResized.disconnect(clientStartUserMovedResized);
}

// ===

// Get the window's center position
const getCenter = function(g){
    const x = g.x + (g.width/2)
    const y = g.y + (g.height/2)
    return {x:x,y:y};
}

// Print debug information
const debug = function(tileManager){
    for (let key in tileManager) {
        if (tileManager.hasOwnProperty(key)) {
            console.log(key, tileManager[key]);
        }
    }
}

// Do title the window using KDE 5.27 tiling system
const tileClient = function(client){

    if(ignoreClient(client)){
        return;
    }

    // Take the windows current postion at center
    const center = getCenter(client.geometry);

    // Get the tiling manager from KDE
    const tileManager = workspace.tilingForScreen(client.screen);

    // Ask where is the best location for this current window
    const tile = tileManager.bestTileForPosition(center.x, center.y);

    // Assign the location to the window
    client.tile = tile;
}

connectTemporarily(workspace.clientAdded,function(client) {
    print("> clientAdded " + client)
    tileClient(client);
    addListenersOnClient(client)
});

connectTemporarily(workspace.clientRemoved,function(client) {
    print("> clientRemoved " + client)
    removeListenersOnClient(client)
});


connectTemporarily(workspace.clientUnminimized,function(client, h, v) {
    print("> clientUnminimized " + client + " current: " + client.minimized);
    tileClient(client);
});



//connectTemporarily(workspace.quickTileModeChanged,function() {
//print("> quickTileModeChanged ");
//});

print("Counts " + workspace.clientList().length);
//debug(workspace.clientList())
workspace.clientList().forEach((d) => {
    removeListenersOnClient(d)
    addListenersOnClient(d)
});

const ignoreClient = function(client){
    return ! client.normalWindow;
}