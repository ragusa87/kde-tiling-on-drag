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
    logGetFreeTile: boolean = true;
    logWindowProperties: boolean = false;
    logDebugTree: boolean = true;

    canGetFreeTileOnAllOutputs: boolean = true;
    canHandleMultipleOutputs: boolean = false; // TODO Not working yet
    maximizeOnSingleWindow: boolean = true;
    canRealocateNewWindow: boolean = false;
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
    tileChangedListener: (tile: Tile) => void;

    constructor(config: Config){
        this.config = config;

        this.clientFinishUserMovedResizedListener = (client: AbstractClient) => {
            this.event( `clientFinishUserMovedResized ${this.clientToString(client)}`)
            this.tileClient(client)
        };

        this.tileChangedListener = (tile: Tile) => {
            //this.event( `tileChanged ${tile?.toString()}`)
            //this.debugTree();
        }

        this.desktopChangedListener = () => {
            this.event(`currentDesktopChanged`)
            // We do not know the previous desktop, so we need to re-tile all desktops
            for(let i = 1; i <= workspace.desktops; i++){
                this.handleMaximizeMinimize(i);
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

            this.event( `clientAdded: ${this.clientToString(client)}`)
            this.attachClient(client)
        });

        workspace.clientRemoved.connect((client: AbstractClient) => {
            if(! this.isSupportedClient(client)){
                return;
            }
            this.event(`clientRemoved: ${this.clientToString(client)}`)
            this.detachClient(client)
        });

        workspace.clientUnminimized.connect((client: AbstractClient) => {
            if(! this.isSupportedClient(client)){
                return;
            }
            this.event( `clientUnminimized: ${this.clientToString(client)}`)
            this.tileClient(client)
        });

        workspace.clientMinimized.connect((client: AbstractClient) => {
            if(! this.isSupportedClient(client)){
                return;
            }
            this.event( `clientMinimized: ${this.clientToString(client)}`)
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
        client.tileChanged.connect(this.tileChangedListener);

        //client.desktop = workspace.activeScreen;

        this.tileClient(client);
    }


    detachClient(client: AbstractClient){
        this.doLog(LogLevel.INFO, `> detachClient ${this.clientToString(client)}`);
        client.clientFinishUserMovedResized.disconnect(this.clientFinishUserMovedResizedListener);
        client.desktopChanged.disconnect(this.desktopChangedListener);
        client.tileChanged.disconnect(this.tileChangedListener);

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

        this.debug(`> tileClient ${this.clientToString(client)} - screen ${client.desktop} // ${workspace.activeScreen}`);

        this.doTile(client);

        // Re-tile other windows on the same screen
        // TODO Delay, the information are not yet updated, the client is still not assigned to the tile
        setTimeout(() => {
            this.retileOther(client);
        },   500);
    }

    doTile(client: AbstractClient){

        // Take the windows current position at center
        const center = this.getCenter(client.geometry);

        // Get the tiling manager from KDE
        const tileManager = workspace.tilingForScreen(client.screen);

        // Ask where is the best location for this current window and assign it to the client.
        let bestTileForPosition = tileManager.bestTileForPosition(center.x, center.y);


        this.debug(`doTile: ${this.clientToString(client)} to ${bestTileForPosition?.toString()}`);

        client.tile = bestTileForPosition
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
    clientToString(client: AbstractClient|undefined|null){
        if(!client){
            return `null`
        }
        return `${client.resourceName} ${client.internalId}`;
    }

    private getClientOnTile(tile: Tile) {
        return tile.windows.filter(this.isSupportedClient).filter((otherClient: AbstractClient) => !otherClient.minimized)
    }

    private maximize(client: AbstractClient) {

        if(this.config.logMaximize){
            this.doLog(LogLevel.INFO, `> maximize ${this.clientToString(client)} ${client.tile?.toString()}`);
        }
        // FIXME Sometime maximize is not working
        const manager = workspace.tilingForScreen(client.screen);

        if(manager !== null && manager.rootTile !== null){
            this.debug(`maximize ${this.clientToString(client)} - setFrameGeomerty`);
            client.frameGeometry = manager.rootTile.absoluteGeometry
        }
        client.setMaximize(true,true);
        client.tile = null;
    }

    private retileOther(client: AbstractClient) {
        this.debug(`re-tile other windows due to change on ${this.clientToString(client)}.`);

        // Tile all clients (this will un-maximize maximized window)
        workspace.clientList().filter(this.isSupportedClient).filter((otherClient) => !otherClient.minimized).filter((otherClient: AbstractClient) => client !== otherClient).forEach((otherClient: AbstractClient) => {
            this.doTile(otherClient); // We skip the client that changed
        })

        let freeTileOnScreens: Map<Number, Tile[]> = new Map();
        const freeTilesOverall = []



        this.getAllScreensNumbers(client.screen).forEach((screen: number) => {
            // Process the list of free tiles
            freeTileOnScreens.set(screen, []);
            this.getAllTiles(screen).forEach((tile: Tile) => {
                if (tile.windows.filter(this.isSupportedClient).filter((client: AbstractClient) => !client.minimized).length === 0) {
                    // @ts-ignore
                    freeTileOnScreens.get(screen).push(tile);
                    freeTilesOverall.push(tile);
                }
            });
        });

        // For each screen
        this.getAllScreensNumbers(client.screen).forEach((screen: number) =>
        {
            const freeTileOnScreen = freeTileOnScreens.get(screen) ?? [];
            // Move stacked window to a free tile if any
            this.getAllTiles(screen).forEach((tile: Tile) => {

                const otherClientsOnTile = this.getClientOnTile(tile);
                const untilledClientsOnScreen = this.getUntiledClientOnScreen(screen);
                this.debug(`Screen ${screen}, Tile ${tile.toString()} : has ${otherClientsOnTile.length} clients and ${freeTileOnScreen.length} free tiles. Clients: ${otherClientsOnTile.map((client: AbstractClient) => this.clientToString(client)).join(", ")})}`);
                this.debug(`Screen ${screen} has ${untilledClientsOnScreen.length} untiled clients. ${untilledClientsOnScreen.map((client: AbstractClient) => this.clientToString(client)).join(", ")})}`)
                if (otherClientsOnTile.length > 1 && freeTileOnScreen.length > 0) {
                    this.moveClientToFreeTile(screen, client, otherClientsOnTile, freeTileOnScreen);
                    return;
                }
                if(untilledClientsOnScreen.length > 0 && freeTileOnScreen.length > 0){
                    this.moveClientToFreeTile(screen, client, untilledClientsOnScreen, freeTileOnScreen)
                    return
                }


                if(otherClientsOnTile.length > 1 && freeTilesOverall.length > 0) {
                    // TODO Could have moved the window to another screen
                    this.debug(`could move one client from tile to a free one on another screen`);
                }
            });

           // Minimize/maximize windows
           this.handleMaximizeMinimize(screen);
        })
    }


    private isSameActivity(client: AbstractClient, otherClient: AbstractClient) : boolean {
        // empty activities means all activities
        // TODO Maybe we need to sort the activities list before comparing ?
        return client.activities.length === 0 || otherClient.activities.length === 0 || client.activities.join(",") === otherClient.activities.join(",");
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
            return client.screen === screen && client.tile === null && !client.minimized;
        })
    }

    private unmaximize(client: AbstractClient) {
        if(this.config.logMaximize){
            this.doLog(LogLevel.INFO, `> un-maximize ${this.clientToString(client)} - ${client.tile?.toString()}`);
        }

        // Force a tile so unmaximize will work
        if(client.tile === null){
            this.doTile(client);
        }
        // FIXME Sometime un-maximize is not working
        if(client.tile !== null){
            this.debug(`un-maximize ${this.clientToString(client)} - setFrameGeomerty`);
            client.frameGeometry = client.tile.absoluteGeometry
            this.debug(`tile is occuped by ${this.getClientOnTile(client.tile).map((client: AbstractClient) => this.clientToString(client)).join(", ")}`);
            this.debugTree()
            if(this.getClientOnTile(client.tile).filter((otherClient: AbstractClient) => otherClient !== client).length > 0){
                this.debug("un-maximize: there is another client on the same tile, re-tile it");
                const freeTiles = this.getFreeTile(client);
                client.tile = freeTiles ?? null;
                client.frameGeometry = freeTiles?.absoluteGeometry ?? client.frameGeometry
            }
        }
        client.setMaximize(false,false)


    }

    private debugTree() {
        if(!this.config.logDebugTree){
            return;
        }
        let output = "> debugTree\n";
        this.getAllScreensNumbers(0).forEach((screen: number) => {
            output += (`screen ${screen} - ${workspace.clientList().filter(this.isSupportedClient).filter((client: AbstractClient) => client.screen === screen).length} clients on screen, untiled: ${this.getUntiledClientOnScreen(screen).length} \n`);
            output += `\tuntiled: ${this.getUntiledClientOnScreen(screen).map((client: AbstractClient) => this.clientToString(client)).join(", ")}\n`;
            this.getAllTiles(screen).forEach((tile: Tile) => {
                output += (`screen ${screen} - tile ${tile.toString()} clients: ${this.getClientOnTile(tile).length} (un-filtered ${tile.windows.length})\n`)
              this.getClientOnTile(tile).forEach((client: AbstractClient) => {
                  output += (`screen ${screen} - tile ${tile.toString()} => ${this.clientToString(client)}\n`);
              })
          })
        });
        this.debug(output);
    }

    private event(message: string) {
        this.doLog(LogLevel.ERROR, `> Event ${message}`);
    }

    private handleMaximizeMinimize(screen: Number) {
        // TODO Use getOtherClientsOnSameScreen

        const clientsOnThisScreen = workspace.clientList().filter(this.isSupportedClient).filter((otherClient: AbstractClient) => otherClient.screen === screen ).filter((otherClient: AbstractClient) => !otherClient.minimized);
        this.debug(`change maximize for screen ${screen} , ${clientsOnThisScreen.length} clients: \n${
            clientsOnThisScreen.map((client: AbstractClient) => ` - ${this.clientToString(client)}`).join(`\n`)
        }`);
        switch (clientsOnThisScreen.length) {
            case 1:
                this.maximize(clientsOnThisScreen[0]);
                break;
            default:
                clientsOnThisScreen.forEach((clientOnThisScreen: AbstractClient) => { this.unmaximize(clientOnThisScreen) });
                break;
        }
    }

    private moveClientToFreeTile(screen: Number, client: AbstractClient, otherClientsOnTile: AbstractClient[], freeTileOnScreen: Tile[]) {
        this.debug(`Move one client from tile to a free one`);
        let clientToMove = otherClientsOnTile.pop();
        if (clientToMove === client) {

            clientToMove = otherClientsOnTile.pop();
            this.debug(`Skip ${this.clientToString(client)} as it is the one that changed, use ${this.clientToString(clientToMove)} instead`)

        }
        if (clientToMove) {
            this.debug(`Move ${this.clientToString(clientToMove)} from ${clientToMove.tile?.toString()} to ${freeTileOnScreen[0].toString()}`);
            // @ts-ignore freeTileOnScreen is not empty
            clientToMove.tile = freeTileOnScreen.pop();
            this.handleMaximizeMinimize(screen);
            return;
        }
    }
}

(new Tiler(new Config()));
