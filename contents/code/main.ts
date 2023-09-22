enum LogLevel
{
    // Highest priority => the lowest number
    EMERGENCY = 1 << 1,
    ALERT     = 1 << 2,
    CRITICAL  = 1 << 3,
    ERROR     = 1 << 4,
    WARNING   = 1 << 5,
    NOTICE    = 1 << 6,
    INFO      = 1 << 7,
    DEBUG     = 1 << 8,
}

class Config {
    logLevel: LogLevel = LogLevel.DEBUG;
    logMaximize: boolean = true;
    logGetFreeTile: boolean = false;
    logWindowProperties: boolean = false;
    logDebugTree: boolean = false;

    canGetFreeTileOnAllOutputs: boolean = true;
    canHandleMultipleOutputs: boolean = true;
    maximizeOnSingleWindow: boolean = true;
}

// KWin global objects exposes "QTimer" that can be used to implement setTimeout
function setTimeout (callback: any, duration: number): void{
    // @ts-ignore
    let timer = new QTimer();
    timer.singleShot = true;
    timer.timeout.connect(callback);
    timer.start(duration);
}


class Tiler{
    config: Config;
    clientFinishUserMovedResizedListener: (client: AbstractClient) => void;
    desktopChangedListener: () => void;

    constructor(config: Config){
        this.config = config;

        this.clientFinishUserMovedResizedListener = (client: AbstractClient) => {
            this.doLog(LogLevel.INFO, `event: clientFinishUserMovedResized ${this.clientToString(client)}`)
            this.tileClient(client)
        };

        this.desktopChangedListener = () => {
            this.doLog(LogLevel.INFO, `event: currentDesktopChanged`)
            // We do not know the previous desktop, so we need to re-tile all desktops
            for(let i = 1; i <= workspace.desktops; i++){
                this.tileDesktop(i);
            }
        }

        workspace.clientList().forEach((oneClient: AbstractClient) => {
            this.logWindowProperties(oneClient)
        });

        workspace.clientList().filter(this.isSupportedClient).forEach((client: AbstractClient) => {
            this.detachClient(client);
            this.attachClient(client);
        });

        workspace.clientAdded.connect((client: AbstractClient) => {
            this.logWindowProperties(client)

            if(! this.isSupportedClient(client)){
                return;
            }

            this.doLog(LogLevel.INFO, `event: clientAdded: ${this.clientToString(client)}`)
            this.attachClient(client)
        });

        workspace.clientRemoved.connect((client: AbstractClient) => {
            if(! this.isSupportedClient(client)){
                return;
            }
            this.doLog(LogLevel.INFO, `event: clientRemoved: ${this.clientToString(client)}`)
            this.detachClient(client)
        });

        workspace.clientUnminimized.connect((client: AbstractClient) => {
            if(! this.isSupportedClient(client)){
                return;
            }
            this.doLog(LogLevel.INFO, `event: clientUnminimized: ${this.clientToString(client)}`)
            this.tileClient(client)
        });

        workspace.clientMinimized.connect((client: AbstractClient) => {
            if(! this.isSupportedClient(client)){
                return;
            }
            this.doLog(LogLevel.INFO, `event: clientMinimized: ${this.clientToString(client)}`)
            client.tile = null;
            this.retileOther(client)
        });
    };

    logWindowProperties(client: AbstractClient){
        if(!this.config.logWindowProperties){
            return;
        }
        this.doLog(LogLevel.DEBUG, `> properties for ${this.clientToString(client)}
                normalWindow? ${client.normalWindow}
                clientSideDecorated? ${client.clientSideDecorated}
                dialog ? ${client.dialog}
                splash ? ${client.splash}
                utility ? ${client.utility}
                dropDownMenu ? ${client.dropDownMenu}
                popupMenu ? ${client.popupMenu}
                tooltip ? ${client.tooltip}
                notification ? ${client.notification}
                criticalNotification ? ${client.criticalNotification}
                appletPopup ? ${client.appletPopup}
                onScreenDisplay ? ${client.onScreenDisplay}
                comboBox ? ${client.comboBox}
                dndIcon ? ${client.dndIcon}
                resourceClass ? ${client.resourceClass}
                caption ? ${client.caption}
                windowRole ? ${client.windowRole}
                windowType ? ${client.windowType}
                --> Supported ? ${this.isSupportedClient(client)}
            `);
    }


    attachClient(client: AbstractClient){
        this.doLog(LogLevel.INFO, `> attachClient ${this.clientToString(client)}`);
        client.clientFinishUserMovedResized.connect(this.clientFinishUserMovedResizedListener);
        client.desktopChanged.connect(this.desktopChangedListener);
        this.tileClient(client);
    }


    detachClient(client: AbstractClient){
        this.doLog(LogLevel.INFO, `> detachClient ${this.clientToString(client)}`);
        client.clientFinishUserMovedResized.disconnect(this.clientFinishUserMovedResizedListener);
        client.desktopChanged.disconnect(this.desktopChangedListener);
        client.tile = null;
        this.retileOther(client);
    }

    doLog(level: LogLevel, ...value: any){
        if(level > this.config.logLevel){
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

    getCenter(geometry: QRect){
        const x: number = geometry.x + (geometry.width/2)
        const y: number = geometry.y + (geometry.height/2)
        return {x,y};
    }

    tileClient(client: AbstractClient){
        this.debug(`> tileClient ${this.clientToString(client)}`);

        // Un-maximize all windows on the same screen (maximized is not available on AbstractClient)
        this.getOtherClientsOnSameScreen(client).filter((localClient: AbstractClient) => !localClient.minimized).forEach((notMinimizedClient: AbstractClient) => {
            this.unmaximize(notMinimizedClient);
        });

        // If this is the only not-minimized window on the screen, maximize it.
        if(this.shouldMaximize(client)){
            this.maximize(client)
        }else {
            this.doTile(client);
        }

        // Re-tile other windows on the same screen
        this.retileOther(client);

        this.debugTree();

    }

    doTile(client: AbstractClient){

        // Take the windows current position at center
        const center = this.getCenter(client.geometry);

        // Get the tiling manager from KDE
        const tileManager = workspace.tilingForScreen(client.screen);

        // Ask where is the best location for this current window and assign it to the client.
        let bestTileForPosition = tileManager.bestTileForPosition(center.x, center.y);

        // If there is a tile available, use it instead
        const freeTile = this.getFreeTile(client, false);
        if(bestTileForPosition !== null && this.getClientOnTile(bestTileForPosition).length > 0 && freeTile !== null){
            this.debug(`tile is already used by ${this.getClientOnTile(bestTileForPosition).map((client: AbstractClient) => this.clientToString(client)).join(", ")}, using free tile instead ${freeTile.toString()}`)
            bestTileForPosition = freeTile;
        }
        client.tile = bestTileForPosition
    }
    // Get all clients on the same screen
    // @see {this.getOtherClientsOnSameDesktop}
    getOtherClientsOnSameScreen(client: AbstractClient) {
        return this.getOtherClientsOnSameDesktop(client).filter((otherClient: AbstractClient) => {
            return otherClient.screen === client.screen;
        });
    }

    getAllTilesOnAllOutput(favoriteOutput : number) {
        if(! this.config.canGetFreeTileOnAllOutputs) {
            return this.getAllTiles(favoriteOutput);
        }
        return this.getAllTiles(...this.getAllScreensNumbers(favoriteOutput));
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
        //this.debug(`getAllTiles ${screens.join(', ')} => ${tiles.length} tiles`);

        return tiles;
    }

    /**
     * Return all screen number available.
     * favoriteNumber  will be the first screen number returned.
     * @param favoriteNumber
     */
    getAllScreensNumbers(favoriteNumber: number): number[]{
        const screens: number[] = [];
        if(favoriteNumber < 0 || favoriteNumber > workspace.numScreens -1 ){
            this.doLog(LogLevel.WARNING, `favoriteNumber is invalid: ${favoriteNumber} (numScreens: ${workspace.numScreens})`);
        }
        screens.push(favoriteNumber);

        for(let i = 0; i < workspace.numScreens; i++){
            if(!screens.includes(i)) {
                screens.push(i);
            }
        }
        return screens;
    }
    // Get a free tile that can be used
    getFreeTile(client: AbstractClient, onAllOutputs = true): Tile|null{
        if(this.config.logGetFreeTile) {
            this.debug(`Search for a free tile on ${onAllOutputs ? 'all output' :  `output ${client.screen}`} ? `);
        }

        let tiles = onAllOutputs ? this.getAllTilesOnAllOutput(client.screen) : this.getAllTiles(client.screen);
        if(this.config.logGetFreeTile) {
            this.debug(`tiles: ${tiles.length} : ${tiles.map((tile: Tile) => `${tile.toString()} - ${this.getClientOnTile(tile).length}`).join(", ")}`)
        }
        // Keep only the free tiles
        tiles = tiles.filter((tile: Tile) => {
            return this.getClientOnTile(tile).length === 0;
        });
        if(this.config.logGetFreeTile) {
            this.debug(`free tiles found: ${tiles.length} : ${tiles.map((tile: Tile) => `${tile.toString()} - ${this.getClientOnTile(tile).length}`).join(", ")}`)
        }
        return tiles[0] ?? null;
    }

    // Check if the client is supported
    isSupportedClient(client: AbstractClient){
        return client.normalWindow && !client.deleted &&
            // Ignore Konsole's confirm dialogs
            !(client.caption.startsWith("Confirm ") && client.resourceClass === "org.kde.konsole") &&
            // Ignore Spectacle's dialogs
            !(client.resourceClass === "org.kde.spectacle")
    }

    // Used for logging
    clientToString(client: AbstractClient){
        return `${client.resourceName} ${client.internalId}`;
    }

    // If there is only one window on the screen (no other window), maximize it
    private shouldMaximize(client: AbstractClient): boolean {
        if(!this.config.maximizeOnSingleWindow){
            return false;
        }
        // We do not have any other clients on the same screen that are not minimized
        const otherClients = this.getOtherClientsOnSameScreen(client).filter((client2: AbstractClient) =>  !client2.minimized);
        const answer =  otherClients.length === 0 && client.maximizable && ! client.minimized

        const stringListOfOtherWindow = otherClients.map((client2: AbstractClient) => `${this.clientToString(client2)}`);
        if(this.config.logMaximize) {
            this.debug(`shouldMaximize ${this.clientToString(client)} - minimized ? ${client.minimized} maximizable ? ${client.maximizable}, other windows ? ${otherClients.length} (${stringListOfOtherWindow.join(", ")}) => ${answer}`)
        }

        return answer
    }

    /**
     * Get all clients on the same desktop, Desktop N is spread across all screens.
     * @param client
     */
    getOtherClientsOnSameDesktop(client: AbstractClient) {
        return workspace.clientList().filter(this.isSupportedClient).filter((otherClient: AbstractClient) => {
            const sameWindowId = client.internalId === otherClient.internalId; // Using internalId because it is working, unlike windowId that might be undefined.
            const sameActivity = this.isSameActivity(client, otherClient);
            const sameDesktop = client.desktop === otherClient.desktop || client.onAllDesktops || otherClient.onAllDesktops;
            const sameScreen = this.config.canHandleMultipleOutputs || client.screen === otherClient.screen
            return (!sameWindowId) && sameScreen && sameActivity && sameDesktop;
        })
    }

    private maximize(client: AbstractClient) {

        if(this.config.logMaximize){
            this.doLog(LogLevel.INFO, `> maximize ${this.clientToString(client)} ${client.tile?.toString()} ${client.resize}`);
        }

        // FIXME Force a root-tile so maximize will work when not empty
        if(client.tile !== null){
            client.tile = workspace.tilingForScreen(client.screen)?.rootTile
        }
        client.setMaximize(true,true);
    }

    private retileOther(client: AbstractClient) {
        this.debug(`re-tile other windows due to change on ${this.clientToString(client)}.`);
        // Re-tile other windows on the same desktop
        const otherClients = this.getOtherClientsOnSameDesktop(client).filter((localClient: AbstractClient) =>  !localClient.minimized);
        otherClients.forEach((otherClient: AbstractClient) => {

            // If the client can be maximized, just do that.
            if(this.shouldMaximize(otherClient)){
                this.maximize(otherClient);
                return false; // end the loop
            }

            // tile client that are not tiled
            if (otherClient.tile === null) {
                this.doTile(otherClient);
            }
        })

        // Make sure client are not sharing a tile with another client when possible
        otherClients.forEach((otherClient: AbstractClient) => {

            if(! this.sameTile(client,otherClient)){
                // this.debug(`no other client sharing the same tile ${client.tile} with ${this.clientToString(otherClient)} ${otherClient.tile}`);

                return true; // continue the loop, this tile is okay
            }

            // Search for an empty tile and use it, note that the tile might be on another screen
            const bestEmptyTile = this.getFreeTile(otherClient);
            if(bestEmptyTile !== null){
                this.doLog(LogLevel.INFO, `re-tile ${this.clientToString(otherClient)} to another tile ${bestEmptyTile} (tile already used by ${this.clientToString(client)})`)
                otherClient.tile = bestEmptyTile
                this.retileOther(otherClient);

                // Sometime maximize/unmaximize is not working when we change the maximized state of a window and the tile at the same time.
                // So we do it again...
                // if(this.shouldMaximize(otherClient)){
                //     this.maximize(otherClient);
                // }else{
                //     this.unmaximize(otherClient)
                // }

                return false; // end the loop
            }

            // We do not know what to do, just tile it on top of another client
            // TODO A real tiling manager will split a tile and move the client to the new tile
            // TODO We could also just move window to a new desktop..
            this.doLog(LogLevel.INFO, `tile ${this.clientToString(otherClient)} somewhere else (as the tile is already used)`);
            this.doTile(otherClient);

            return false; // end the loop

        });

        // Detect if there is tiles that are empty (due to windows closing/minimizing)
        const emptyTiles = this.getAllTilesOnAllOutput(client.screen).filter((tile: Tile) => {
            return this.getClientOnTile(tile).length === 0;
        })

        // Detect if there is tiles with multiple windows
        const tilesWithMultipleWindows = this.getAllTilesOnAllOutput(client.screen).filter((tile: Tile) => {
            return this.getClientOnTile(tile).length > 1;
        });

        // Move a window to an empty tile
        if(emptyTiles.length > 0 && tilesWithMultipleWindows.length > 0){
            tilesWithMultipleWindows.every((tile: Tile) => {
                const client = this.getClientOnTile(tile)[0];
                this.doLog(LogLevel.INFO, `re-tile a client ${this.clientToString(client)} to an empty tile ${emptyTiles[0].toString()} (empty tile found)`);
                client.tile = emptyTiles[0];
                this.retileOther(client);

                return false; // Exit the loop.
            });
        }
    }

    private sameGeometry(one: QRect, two: QRect) {
        return false;
        //return  one.x === two.x && one.y === two.y && one.height === two.height && one.width === two.height;
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

    getUntiledClientOnScreen(screen: number) {
        return workspace.clientList().filter(this.isSupportedClient).filter((client: AbstractClient) => {
            return client.screen === screen && client.tile === null;
        })
    }

    private unmaximize(client: AbstractClient) {
        if(this.config.logMaximize){
            this.doLog(LogLevel.INFO, `> un-maximize ${this.clientToString(client)}`);
        }

        // Force a tile so unmaximize will work
        if(client.tile !== null){
            client.tile = workspace.tilingForScreen(client.screen)?.rootTile
        }

        client.setMaximize(false,false)
    }

    private debugTree() {
        if(!this.config.logDebugTree){
            return;
        }
        this.debug("> debugTree");
        this.getAllScreensNumbers(0).forEach((screen: number) => {
            this.debug(`screen ${screen} - ${workspace.clientList().filter(this.isSupportedClient).filter((client: AbstractClient) => client.screen === screen).length} clients on screen, untiled: ${this.getUntiledClientOnScreen(screen).length}`);
            this.getAllTiles(screen).forEach((tile: Tile) => {
              this.debug(`screen ${screen} - tile ${tile.toString()} clients: ${this.getClientOnTile(tile).length} (un-filtered ${tile.windows.length})`)
              this.getClientOnTile(tile).forEach((client: AbstractClient) => {
                  this.debug(`screen ${screen} - tile ${tile.toString()} => ${this.clientToString(client)}`);
              })
          })
        });
    }
}

(new Tiler(new Config()));
