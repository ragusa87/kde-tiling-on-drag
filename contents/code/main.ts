enum LogLevel
{
    // Highest priority => lowest number
    EMERGENCY = 1 << 1,
    ALERT     = 1 << 2,
    CRITICAL  = 1 << 3,
    ERROR     = 1 << 4,
    WARNING   = 1 << 5,
    NOTICE    = 1 << 6,
    INFO      = 1 << 7,
    DEBUG     = 1 << 8,
}

class Tiler{
    logLevel: LogLevel;
    clientFinishUserMovedResizedListener: (client: AbstractClient) => void;
    desktopChangedListener: () => void;

    constructor(level: LogLevel = LogLevel.DEBUG){
        this.logLevel = level;


        this.clientFinishUserMovedResizedListener = (client: AbstractClient) => {
            this.doLog(LogLevel.INFO, `event: clientFinishUserMovedResized`)
            this.tileClient(client)
        };

        this.desktopChangedListener = () => {
            this.doLog(LogLevel.INFO, `event: currentDesktopChanged`)
            // We do not know the previous desktop, so we need to re-tile all desktops
            for(let i = 1; i <= workspace.desktops; i++){
                this.tileDesktop(i);
            }
        }

         workspace.clientList().filter(this.isSupportedClient).forEach((client: AbstractClient) => {
            this.detachClient(client);
            this.attachClient(client);
        });

        workspace.clientAdded.connect((client: AbstractClient) => {
            if(! this.isSupportedClient(client)){
                return;
            }
            this.doLog(LogLevel.INFO, `event: clientAdded: ${client.resourceName}`)
            this.attachClient(client)
        });
        workspace.clientRemoved.connect((client: AbstractClient) => {
            if(! this.isSupportedClient(client)){
                return;
            }
            this.doLog(LogLevel.INFO, `event: clientRemoved: ${client.resourceName}`)
            this.detachClient(client)
        });

        workspace.clientUnminimized.connect((client: AbstractClient) => {
            if(! this.isSupportedClient(client)){
                return;
            }
            this.doLog(LogLevel.INFO, `event: clientUnminimized: ${client.resourceName}`)
            this.tileClient(client)
        });

        workspace.clientMinimized.connect((client: AbstractClient) => {
            if(! this.isSupportedClient(client)){
                return;
            }
            this.doLog(LogLevel.INFO, `event: clientMinimized: ${client.resourceName}`)
            client.tile = null;
            this.retileOther(client)
        });
    };


    attachClient(client: AbstractClient){
        this.doLog(LogLevel.INFO, `> attachClient ${client.resourceName}`);
        client.clientFinishUserMovedResized.connect(this.clientFinishUserMovedResizedListener);
        client.desktopChanged.connect(this.desktopChangedListener);
        this.tileClient(client);
    }


    detachClient(client: AbstractClient){
        this.doLog(LogLevel.INFO, `> detachClient  ${client.resourceName}`);
        client.clientFinishUserMovedResized.disconnect(this.clientFinishUserMovedResizedListener);
        client.desktopChanged.disconnect(this.desktopChangedListener);
        client.tile = null;
        this.retileOther(client);
    }

    doLog(level: LogLevel, value: any){
        if(level > this.logLevel){
            console.log("Skip log level", level, this.logLevel);
            return;
        }

        if(level === LogLevel.DEBUG) {
            console.log(value);
            return;
        }
        if(level === LogLevel.INFO) {
            console.info(value);
            return;
        }
        if(level === LogLevel.WARNING) {
            console.warn(value);
            return;
        }
        if(level === LogLevel.ALERT) {
            console.warn("Alert: ", value);
            return;
        }
        if(level === LogLevel.NOTICE) {
            console.warn("Notice: ", value);
            return;
        }
        if(level === LogLevel.EMERGENCY) {
            console.warn("EMERGENCY: ", value);
            return;
        }
        if(level === LogLevel.CRITICAL) {
            console.warn("CRITICAL: ", value);
            return;
        }
        if(level === LogLevel.ERROR) {
            console.error(value);
            return;
        }

        console.log("Unknown log level: ", level, value);
    }
    private debug(value: any){
        this.doLog(LogLevel.DEBUG, value);
    }
    public log(value: any){
        this.doLog(LogLevel.INFO, value);
    }

    getCenter(geometry: QRect){
        const x: number = geometry.x + (geometry.width/2)
        const y: number = geometry.y + (geometry.height/2)
        return {x,y};
    }

    tileClient(client: AbstractClient){
        //this.debug(`> tileClient ${this.clientToString(client)}`);

        // Un-maximize all windows on the same screen (maximized is not available on AbstractClient)
        this.getOtherClientsOnSameScreen(client).filter((localClient: AbstractClient) => !localClient.minimized).forEach((notMinimizedClient: AbstractClient) => {
            //this.debug(`unmaximize ${this.clientToString(notMinimizedClient)}`);
            notMinimizedClient.setMaximize(false,false)
            notMinimizedClient.tile = null;
        });

        // If this is the only not-minimized window on the screen, maximize it.
        if(this.shouldMaximize(client)){
            this.maximize(client)
            return;
        }else {
            this.doTile(client);
        }

        // Re-tile other windows on the same screen
        this.retileOther(client);
    }

    doTile(client: AbstractClient){

        // Take the windows current position at center
        const center = this.getCenter(client.geometry);

        // Get the tiling manager from KDE
        const tileManager = workspace.tilingForScreen(client.screen);

        // Ask where is the best location for this current window and assign it to the client.
        client.tile = tileManager.bestTileForPosition(center.x, center.y);

    }
    // Get all clients on the same screen
    getOtherClientsOnSameScreen(client: AbstractClient) {
        return workspace.clientList().filter(this.isSupportedClient).filter((otherClient: AbstractClient) => {
            const sameWindowId = client.internalId === otherClient.internalId; // Using internalId because it is working, unlike windowId that might be undefined.
            const sameScreen = client.screen === otherClient.screen;
            const sameActivity = this.isSameActivity(client, otherClient);
            const sameDesktop = client.desktop === otherClient.desktop || client.onAllDesktops || otherClient.onAllDesktops;
            return (!sameWindowId) && sameScreen && sameActivity && sameDesktop;
        })
    }


    getAllTiles(...screens: number[]): Tile[]{
        let tiles: Tile[] = [];
        screens.forEach((screen: number) => {
            const tileManager = workspace.tilingForScreen(screen);
            if(tileManager === null){
                this.doLog(LogLevel.NOTICE, `no tileManager for screen ${screen} ??`);
                return []
            }
            const root = tileManager.rootTile;
            if(root === null){
                this.doLog(LogLevel.NOTICE, `no root tile for screen ${screen} ??`);
                return [];
            }
            let toHandle: Tile[] = [root];
            // Get all tiles
            while(toHandle.length > 0){
                const tile = toHandle.pop();
                if(tile === null || tile === undefined){
                    continue;
                }
                if(! tiles.includes(tile)){
                    tiles.push(tile);
                }
                (tile.tiles ?? []).forEach((subTile: Tile) => {
                    toHandle.push(subTile);
                });
            }

            // Remove duplicates https://stackoverflow.com/a/9229821
            tiles = tiles.filter(function(item, pos) {
                return tiles.indexOf(item) == pos;
            })

            // Remove root tile
            tiles = tiles.filter((tile: Tile) => {
                return tile !== root;
            })

        });

        return tiles;
    }

    /**
     * Return all screen number available.
     * If favoriteNumber is set, it will be the first screen number returned.
     * @param favoriteNumber
     */
    getAllScreensNumbers(favoriteNumber = -1): number[]{
        const screens: number[] = [];
        if(favoriteNumber !== -1 && favoriteNumber <= 0 && favoriteNumber < workspace.numScreens ){
            screens.push(favoriteNumber);
        }
        for(let i = 0; i < workspace.numScreens; i++){
            if(!screens.includes(i)) {
                screens.push(i);
            }
        }
        this.doLog(LogLevel.DEBUG, "screens: ".concat(screens.join(", ")));
        return screens;
    }
    // Get a free tile that can be used
    // FIXME: Avoid getting the root tile and blacklist the tile you want to move from
    getFreeTile(client: AbstractClient): Tile|null{

        let tiles = this.getAllTiles(...this.getAllScreensNumbers(client.screen));

        this.debug(`tiles: ${tiles.length} : ${tiles.map((tile: Tile) => `${tile.toString()} - ${this.getClientOnTile(tile).length}`).join(", ")}`)
        // Keep only the free tiles
        tiles = tiles.filter((tile: Tile) => {
            return this.getClientOnTile(tile).length === 0;
        });


        this.debug(`free tiles found: ${tiles.length} : ${tiles.map((tile: Tile) => `${tile.toString()} - ${this.getClientOnTile(tile).length}`).join(", ")}`)
        return tiles[0] ?? null;
    }

    // Check if the client is supported
    isSupportedClient(client: AbstractClient){
        return client.normalWindow; // client.isClient; //&& client.normalWindow && !client.isComboBox;
    }

    // Used for logging
    clientToString(client: AbstractClient){
        return `${client.resourceName} ${client.internalId}`;
    }

    // If there is only one window on the screen (no other window), maximize it
    private shouldMaximize(client: AbstractClient): boolean {
        // We do not have any other clients on the same screen that are not minimized
        const otherClients = this.getOtherClientsOnSameScreen(client).filter((client2: AbstractClient) =>  !client2.minimized);
        const answer =  otherClients.length === 0 && client.maximizable && ! client.minimized

        // const stringListOfOtherWindow = otherClients.map((client2: AbstractClient) => `${this.clientToString(client2)}`);
        // this.debug(`shouldMaximize ${this.clientToString(client)} - minimized ? ${client.minimized} maximizable ? ${client.maximizable}, other windows ? ${otherClients.length} (${stringListOfOtherWindow.join(", ")}) => ${answer}`)

        return answer

    }

    private maximize(client: AbstractClient) {
        client.tile = null // Remove the tile, so it will be maximized full screen
        // Fixme: Sometimes maximize does not work, find why
        client.setMaximize(true,true);
    }

    private retileOther(client: AbstractClient) {
        // Re-tile other windows on the same screen
        const otherClients = this.getOtherClientsOnSameScreen(client).filter((localClient: AbstractClient) =>  !localClient.minimized);
        otherClients.forEach((otherClient: AbstractClient) => {

            // If the client can be maximized, just do that.
            if(this.shouldMaximize(otherClient)){
                this.maximize(otherClient);
                return false; // end the loop
            }

            // Re-tile client that are not tiled
            if (otherClient.tile == null) {
                this.doTile(otherClient);
            }
        })

        // Make sure client are not sharing a tile with another client when possible
        otherClients.forEach((otherClient: AbstractClient) => {

            if(! this.sameTile(client,otherClient)){
                    // this.debug(`no other client sharing the same tile ${client.tile} with ${this.clientToString(otherClient)} ${otherClient.tile}`);

                    return true; // continue the loop, this tile is okay
            }

            // this.debug(`${this.clientToString(client)} and ${this.clientToString(otherClient)} share the same tile`)

            // Search for an empty tile and use it
            const bestEmptyTile = this.getFreeTile(otherClient);
            if(bestEmptyTile !== null){
                this.debug(`re-tile ${this.clientToString(otherClient)} to another tile ${bestEmptyTile} (tile already used)`)
                otherClient.tile = bestEmptyTile
                return false; // end the loop
            }

            // We do not know what to do, just tile it on top of another client
            // TODO A real tiling manager will split a tile and move the client to the new tile
            // TODO We could also just move window to a new desktop..
            this.debug(`re-tile ${this.clientToString(otherClient)} somewhere (tile already used)`);
            this.doTile(otherClient);

            return false; // end the loop

        });

        // Detect if there is tiles that are empty (due to windows closing/minimizing)
        const emptyTiles = this.getAllTiles(client.screen).filter((tile: Tile) => {
            return this.getClientOnTile(tile).length === 0;
        })

        // Detect if there is tiles with multiple windows
        const tilesWithMultipleWindows = this.getAllTiles(client.screen).filter((tile: Tile) => {
            return this.getClientOnTile(tile).length > 1;
        });

        // Move a window to an empty tile
        if(emptyTiles.length > 0 && tilesWithMultipleWindows.length > 0){
            tilesWithMultipleWindows.every((tile: Tile) => {
                const client = this.getClientOnTile(tile)[0];
                this.debug(`re-tile a client ${this.clientToString(client)} to an empty tile ${emptyTiles[0].toString()} (empty tile found)`);
                client.tile = emptyTiles[0];

                return false; // Exit the loop.
            });
        }
    }

    private sameGeometry(one: QRect, two: QRect) {
        return  one.x === two.x && one.y === two.y && one.height === two.height && one.width === two.height;
        //this.debug(`x: ${one.x}-${two.x} y: ${one.y}-${two.y} h: ${one.height}-${two.height} w: ${one.width}-${two.width} => ${result}`)
    }

    private isSameActivity(client: AbstractClient, otherClient: AbstractClient) : boolean {
        // empty activities means all activities
        // TODO Maybe we need to sort the activities list before comparing ?
        return client.activities.length === 0 || otherClient.activities.length === 0 || client.activities.join(",") === otherClient.activities.join(",");
    }

    private sameTile(client: AbstractClient, otherClient: AbstractClient) {
        // If there is a client already using the same tile, move it to another tile
        if(otherClient.tile === null || client.tile === null){
            return false;
        }

        return otherClient.tile === client.tile || this.sameGeometry(otherClient.tile.absoluteGeometry, client.tile.absoluteGeometry);
     }

    private getClientOnTile(tile: Tile) {
        return tile.windows.filter(this.isSupportedClient).filter((tile: AbstractClient) => !tile.minimized)
    }

    private tileDesktop(i: number) {

        // Find a client on the same desktop and re-tile it. // TODO What if the activity is different ?
        workspace.clientList().filter(this.isSupportedClient).filter((client: AbstractClient) => {
            return client.desktop === i;
        }).every((client: AbstractClient) => {
            this.debug(`re-tile ${this.clientToString(client)} to trigger a desktop reorganization for desktop number ${i}`);
            this.tileClient(client);
            return false; // Exit the loop.
        });
    }
}

(new Tiler(LogLevel.DEBUG));
