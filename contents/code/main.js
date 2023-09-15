/* global workspace, print, console, QTimer */

// If you want to debug this script, set a duration for 15 second, so the script is automatically unloaded.
// As kde doesn't unload script, your event will never be removed. See also "make debug-run".
const DEFAULT_BIND_DURATION = -1;

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
function connectTemporarily(object, callback, duration){
    duration = duration ?? DEFAULT_BIND_DURATION;
    object.connect(callback);
    if(duration < 0) {
        return;
    }

    setTimeout(function(){
        debug(`disconnect`)
        object.disconnect(callback);
    }, duration)
}

// Some clients are never tiled (popup, splash, menu, etc)
const ignoreClient = function(client){
    return ! client.normalWindow;
}

// When the user moves a window, tile it !
const clientStartUserMovedResized = function(client){
    print(`clientFinishUserMovedResized`);
    tileClient(client)
}

// ===
// Listener that are client specific
function addListenersOnClient(client){
    print(`Add listeners ` + client.resourceName)
    connectTemporarily(client.clientFinishUserMovedResized, clientStartUserMovedResized, -1);
}

function removeListenersOnClient(client){
    print(`remove listeners ` + client.resourceName)
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
const debug = function(obj){
    for (let key in obj) {
        if (Object.hasOwnProperty.call(obj, key)) {
            console.log(key, obj[key]);
        }
    }
}

// Do title the window using KDE 5.27 tiling system
const tileClient = function(client){

    if(ignoreClient(client)){
        return;
    }

    // Take the windows current position at center
    const center = getCenter(client.geometry);

    // Get the tiling manager from KDE
    const tileManager = workspace.tilingForScreen(client.screen);

    // Ask where is the best location for this current window and assign it to the client.
    client.tile = tileManager.bestTileForPosition(center.x, center.y);
}

connectTemporarily(workspace.clientAdded,function(client) {
    print(`> clientAdded ` + client)
    tileClient(client);
    addListenersOnClient(client)
});

connectTemporarily(workspace.clientRemoved,function(client) {
    print(`> clientRemoved ` + client)
    removeListenersOnClient(client)
});


connectTemporarily(workspace.clientUnminimized,function(client) {
    print(`> clientUnminimized ${client} current: {client.minimized}`);
    tileClient(client);
});

// On script initialization, handle existing clients
workspace.clientList().forEach((d) => {
    removeListenersOnClient(d)
    addListenersOnClient(d)
});
