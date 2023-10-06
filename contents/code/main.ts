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
    constructor(debug: boolean = false) {
        this.logLevel = debug ? LogLevel.DEBUG: LogLevel.NOTICE;
        this.logMaximize = debug
        this.logDebugTree = debug
        this.logEvents = debug
    }

    setLogWindowProperties(value: boolean){
        this.logWindowProperties = value;
    }
    logLevel: LogLevel;
    logMaximize: boolean;
    logEvents: boolean;
    logWindowProperties: boolean = false;
    logDebugTree: boolean;
    logDebugScreens: boolean = false;
    doMaximizeSingleWindow: boolean = true;
    doMaximizeWhenNoLayoutExists: boolean = true;
    doShowOutline: boolean = true;
}

class Tiler{
    config: Config;
    clientFinishUserMovedResizedListener: (client: AbstractClient) => void;
    clientStepUserMovedResizedListener: (client: AbstractClient, geometry: QRect) => void;
    desktopChangedListener: () => void;

    constructor(config: Config){
        this.config = config;

        this.clientFinishUserMovedResizedListener = (client: AbstractClient) => {
            this.event( `clientFinishUserMovedResized ${this.clientToString(client)}`)
            this.tileClient(client, "clientFinishUserMovedResized")
        };

        this.clientStepUserMovedResizedListener = (client: AbstractClient, geometry: QRect) => {
            this.event( `clientStepUserMovedResizedListener ${this.clientToString(client)}`)
            if(!this.config.doShowOutline){
                return
            }

            // Calculate the outline geometry
            const center = this.getCenter(geometry);
            const tile = workspace.tilingForScreen(client.screen)?.bestTileForPosition(center.x, center.y)
            let outlineGeometry = tile ? tile.absoluteGeometry : null;

            // If we have more than one window on the screen, show the outline maximized
            const numberOfOtherTiledWindows = this.getTiledClientsOnScreen(client.screen).filter((otherClient: AbstractClient) => otherClient !== client).length;
            const numberOfOtherUnTiledWindows = this.getUntiledClientOnScreen(client.screen).filter((otherClient: AbstractClient) => otherClient !== client).length;

            if(numberOfOtherTiledWindows + numberOfOtherUnTiledWindows === 0 && this.config.doMaximizeSingleWindow){
                outlineGeometry = workspace.clientArea(KWin.MaximizeArea, client.screen, client.desktop);
            }

            if(outlineGeometry !== null){
                workspace.showOutline(outlineGeometry);
            }
        };

        this.desktopChangedListener = () => {
            this.event(`currentDesktopChanged`)
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
            this.tileClient(client, "Unminimized")
        });

        workspace.clientMinimized.connect((client: AbstractClient) => {
            if(! this.isSupportedClient(client)){
                return;
            }
            this.event( `clientMinimized: ${this.clientToString(client)}`)
            client.tile = null;
            this.retileOther(client)
        });

        // If you edit the layout, re-tile all windows
        this.getAllScreensNumbers(0).forEach((screen: number) => {
            const tileManager = workspace.tilingForScreen(screen);
            if(tileManager === null){
                this.doLog(LogLevel.WARNING, `No tileManager for screen ${screen} ??`);
                return
            }
            if(tileManager.rootTile === null){
                this.doLog(LogLevel.WARNING, `No root tile for screen ${screen} ??`);
                return
            }
            workspace.tilingForScreen(screen).rootTile.layoutModified.connect(() => {
                this.event(`layoutModified on screen: ${screen}`)
                this.handleMaximizeMinimize(screen, "layoutModified")
            });
        });
    }

    private isSameActivityAndDesktop(client: AbstractClient): boolean{
        return (client.onAllDesktops || client.desktop === workspace.currentDesktop) &&
            (client.activities.length === 0 || client.activities.includes(workspace.currentActivity));
    }


    private logWindowProperties(client: AbstractClient): void{
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


    private attachClient(client: AbstractClient){
        this.doLog(LogLevel.INFO, `> attachClient ${this.clientToString(client)}`);
        client.clientFinishUserMovedResized.connect(this.clientFinishUserMovedResizedListener);
        client.clientStepUserMovedResized.connect(this.clientStepUserMovedResizedListener);
        client.desktopChanged.connect(this.desktopChangedListener);
        this.tileClient(client, "attachClient");
    }


    private detachClient(client: AbstractClient){
        this.doLog(LogLevel.INFO, `> detachClient ${this.clientToString(client)}`);
        client.clientFinishUserMovedResized.disconnect(this.clientFinishUserMovedResizedListener);
        client.clientStepUserMovedResized.disconnect(this.clientStepUserMovedResizedListener);
        client.desktopChanged.disconnect(this.desktopChangedListener);

        client.tile = null;
        this.retileOther(client);
    }

    /* eslint-disable  @typescript-eslint/no-explicit-any */
    private doLog(level: LogLevel, ...value: any){
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

    private getCenter(geometry: QRect){
        const x: number = geometry.x + (geometry.width/2)
        const y: number = geometry.y + (geometry.height/2)
        return {x,y};
    }

    private tileClient(client: AbstractClient, reason: string = ""){

        this.debug(`> tileClient ${this.clientToString(client)} (${reason})`);

        this.doTile(client, "tileClient");

        // Re-tile other windows on the same screen
        this.retileOther(client);
    }

    private doTile(client: AbstractClient, reason: string = ""){

        // Take the windows current position at center
        const center = this.getCenter(client.geometry);

        // Get the tiling manager from KDE
        const tileManager = workspace.tilingForScreen(client.screen);

        // Ask where is the best location for this current window and assign it to the client.
        const bestTileForPosition = tileManager.bestTileForPosition(center.x, center.y);
        if(bestTileForPosition === null && this.config.doMaximizeWhenNoLayoutExists){
            this.doLog(LogLevel.DEBUG, `No tile exists for ${this.clientToString(client)}, maximize it instead`);
            client.geometry = workspace.clientArea(KWin.MaximizeArea, client.screen, client.desktop);
        }
        this.doLog(LogLevel.INFO, `doTile: ${this.clientToString(client)} to ${bestTileForPosition?.toString()} (${reason}) screen ${client.screen}`);

        client.tile = bestTileForPosition
    }

    private getAllTiles(...screens: number[]): Tile[]{
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
            const toHandle: Tile[] = [root];
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

        // Take the leaves at first
        tiles.sort((a: Tile, b: Tile) => {
            if((a.parent !== null || b.parent !== null) && a.parent !== b.parent){
                return -1;
            }
            return 0;
        });

        return tiles;
    }

    /**
     * Return all screen number available.
     * favoriteNumber  will be the first screen number returned.
     * @param favoriteNumber
     */
    private getAllScreensNumbers(favoriteNumber: number): number[]{
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
        this.doLogIf(this.config.logDebugScreens, LogLevel.DEBUG, `screens: ${screens.join(', ')} (favorite: ${favoriteNumber}, total: ${workspace.numScreens})`)

        return screens;
    }


    // Check if the client is supported
    private isSupportedClient(client: AbstractClient){
        return client.normalWindow && !client.deleted &&
            // Ignore Konsole's confirm dialogs
            !(client.caption.startsWith("Confirm ") && client.resourceClass === "org.kde.konsole") &&
            // Ignore Spectacle's dialogs
            !(client.resourceClass === "org.kde.spectacle")
    }

    // Used for logging
    private clientToString(client: AbstractClient|undefined|null){
        if(!client){
            return `null`
        }
        return `${client.resourceName} ${client.internalId} ${client.screen}, ${client.desktop} ${client.activities.join(", ")}`;
    }

    private getClientOnTile(tile: Tile) {
        return tile.windows.filter(this.isSupportedClient).filter(this.isSameActivityAndDesktop).filter((otherClient: AbstractClient) => !otherClient.minimized)
    }

    private maximize(client: AbstractClient) {

        this.doLogIf(this.config.logMaximize,LogLevel.INFO, `> maximize ${this.clientToString(client)} ${client.tile?.toString()}`);

        client.tile = null;
        client.geometry = workspace.clientArea(KWin.MaximizeArea, client.screen, client.desktop);
    }

    private retileOther(client: AbstractClient) {
        this.debug(`re-tile other windows due to change on ${this.clientToString(client)}. Screen: ${client.screen}`);

        // Tile all clients (this will un-maximize maximized window)
        workspace.clientList()
            .filter(this.isSupportedClient)
            .filter(this.isSameActivityAndDesktop)
            .filter((otherClient) => !otherClient.minimized)
            .filter((otherClient: AbstractClient) => otherClient.tile === null)
            .forEach((otherClient: AbstractClient) => {
                this.doTile(otherClient, "retileOther: Untiled windows"); // We skip the client that changed
        })

        const freeTileOnScreens: Map<number, Tile[]> = new Map();
        let freeTilesOverall: Tile[] = []



        this.getAllScreensNumbers(client.screen).forEach((screen: number) => {
            // Process the list of free tiles
            const currentFreeTiles : Tile[] = []
            freeTileOnScreens.set(screen, currentFreeTiles);
            this.getAllTiles(screen).forEach((tile: Tile) => {
                if (tile.windows.filter(this.isSupportedClient).filter((client: AbstractClient) => !client.minimized).length === 0) {
                    currentFreeTiles.push(tile);
                    freeTilesOverall.push(tile);
                }
            });

            freeTileOnScreens.set(screen,currentFreeTiles)
        });



        // For each screen
        this.getAllScreensNumbers(client.screen).forEach((screen: number) =>
        {
            const freeTileOnScreen = freeTileOnScreens.get(screen) ?? [];

            // Move stacked window to a free tile if any
            this.getAllTiles(screen).forEach((tile: Tile) => {

                const otherClientsOnTile = this.getClientOnTile(tile);
                const untiledClientsOnScreen = this.getUntiledClientOnScreen(screen);
                if (otherClientsOnTile.length > 1 && freeTileOnScreen.length > 0) {
                    if(this.moveClientToFreeTile(client, otherClientsOnTile, freeTileOnScreen,  "otherClientsOnTile")){
                        const usedTile = freeTileOnScreen.shift();
                        freeTilesOverall = freeTilesOverall.filter((tile: Tile) => tile !== usedTile);
                        return;
                    }
                }
                if(untiledClientsOnScreen.length > 0 && freeTileOnScreen.length > 0){
                    if(this.moveClientToFreeTile( client, untiledClientsOnScreen, freeTileOnScreen, "untilled client")){
                        const usedTile = freeTileOnScreen.shift();
                        freeTilesOverall = freeTilesOverall.filter((tile: Tile) => tile !== usedTile);
                        return
                    }
                }

                if(otherClientsOnTile.length > 1 && freeTilesOverall.length > 0) {
                    // TODO Could have moved the window to another screen
                    this.debug(`could move one client from tile to a free one on another screen`);
                }
            });
        })

        // Minimize/maximize windows
        this.getAllScreensNumbers(client.screen).forEach((screen: number) => {
            this.handleMaximizeMinimize(screen, `finished retileOther: Screen: ${screen}`);
        });

        this.debugTree(client.desktop)
    }

    private tileScreen(i: number,reason: string) {
        this.getUntiledClientOnScreen(i).forEach((client: AbstractClient) => {
            this.debug(`re-tile ${this.clientToString(client)} for screen ${i} - reorganization (${reason})`);
            this.doTile(client, reason);
        });
    }

    private getUntiledClientOnScreen(screen: number) {
        return workspace.clientList().filter(this.isSupportedClient).filter(this.isSameActivityAndDesktop).filter((client: AbstractClient) => {
            return client.screen === screen && client.tile === null && !client.minimized;
        })
    }

    private unmaximize(client: AbstractClient) {
        if(this.config.logMaximize){
            this.doLog(LogLevel.INFO, `> un-maximize ${this.clientToString(client)} - ${client.tile?.toString()}`);
        }

        // Force a tile so unmaximize will work
        if(client.tile === null){
            this.doLogIf(this.config.logMaximize, LogLevel.WARNING, `Force tiling an untiled window ${this.clientToString(client)}`)
            this.doTile(client, "unmaximize without tile");
        }

        // Change a tile setting, so all windows in it got repositioned
        if(client.tile !== null){
            this.doLogIf(this.config.logMaximize, LogLevel.DEBUG, `Change padding to resize ${this.clientToString(client)}`)
            client.tile.padding += 1;
            client.tile.padding -= 1;
        }else{
            this.doLogIf(this.config.logMaximize, LogLevel.WARNING, `Force tiling an untiled window ${this.clientToString(client)}`)

            // setMaximize is buggy,avoid using it while tiling...
            client.setMaximize(false,false)
        }
    }

    private debugTree(desktop: number) {
        if(!this.config.logDebugTree){
            return;
        }
        let output = `> debugTree (desktop: ${desktop}, activity: ${workspace.currentActivity})\n`;
        const tab= " "
        const tab2 = tab + tab;
        const tab3 = tab2 + tab;
        const tab4 = tab3 + tab;
        this.getAllScreensNumbers(0).forEach((screen: number) => {
            output += `screen ${screen} - tiled: ${this.getTiledClientsOnScreen(screen).length} untiled: ${this.getUntiledClientOnScreen(screen).length} \n`;
            if(this.getUntiledClientOnScreen(screen).length > 0) {
                output += `${tab2} - untiled:\n${this.getUntiledClientOnScreen(screen).map((client: AbstractClient) => `${tab3} - ${this.clientToString(client)}`).join(", ")}\n`;
            }
            this.getAllTiles(screen).forEach((tile: Tile) => {
                output += (`${tab2} -  ${tile.toString()} clients: ${this.getClientOnTile(tile).length} (un-filtered ${tile.windows.length})\n`)
                this.getClientOnTile(tile).forEach((client: AbstractClient) => {
                    output += (`${tab4} * ${this.clientToString(client)}\n`);
                })
            })
        });
        this.debug(output);
    }

    private event(message: string) {
        this.doLogIf(this.config.logEvents, LogLevel.ERROR, `> Event ${message}`);
    }

    private handleMaximizeMinimize(screen: number, reason: string) {

        // Make sure all client are tiled
        this.tileScreen(screen, "handleMaximizeMinimize");


        const clientsOnThisScreen = this.getTiledClientsOnScreen(screen);

        // If there is un-tilled clients, take them into account
        this.getUntiledClientOnScreen(screen).forEach((client: AbstractClient) => {
            clientsOnThisScreen.push(client);
        });


        this.doLogIf(this.config.logMaximize, LogLevel.DEBUG, `> handleMaximizeMinimize ${clientsOnThisScreen.length} clients on screen ${screen} (${reason})`);
        switch (clientsOnThisScreen.length) {
            case 1:
                if(!this.config.doMaximizeSingleWindow){
                    this.unmaximize(clientsOnThisScreen[0])
                    break;
                }
                this.maximize(clientsOnThisScreen[0]);
                break;
            default:
                clientsOnThisScreen.forEach((clientOnThisScreen: AbstractClient) => {
                    this.unmaximize(clientOnThisScreen)
                });
                break;
        }
    }

    /**
     * Move client to a free tile and return the used tile if any
     */
    private moveClientToFreeTile(client: AbstractClient, otherClientsOnTile: AbstractClient[], freeTileOnScreen: Tile[], reason: string): Tile|null {
        this.debug(`Move one client from tile to a free one (${reason}). Clients on tile:\n  ${otherClientsOnTile.map((client: AbstractClient) => `  - ${this.clientToString(client)}`).join("\n")}\nFree tiles : ${freeTileOnScreen.map((tile: Tile) => `- ${tile.toString()}`).join(", ")})}`);
        let clientToMove = otherClientsOnTile.pop();
        if (clientToMove === client) {
            clientToMove = otherClientsOnTile.pop();
            if(clientToMove === null){
                this.debug(`Do not move ${client} as it is being tiled. No other client to move to a free tile.`)
                return null;
            }
            this.debug(`Skip ${this.clientToString(client)} as it is the one that changed, use ${this.clientToString(clientToMove)} instead`)
        }
        const freeTile = freeTileOnScreen[0] ?? null;

        if (clientToMove && freeTile) {
            this.debug(`Move ${this.clientToString(clientToMove)} from ${clientToMove.tile?.toString()} to ${freeTile.toString()}`);
            clientToMove.tile = freeTile;
            return freeTile
        }
        return null;
    }

    private doLogIf(enabled: boolean, level: LogLevel, message: string) {
        if(!enabled){
            return;
        }
        this.doLog(level, message);

    }

    private getTiledClientsOnScreen(screen: number) {
        return workspace.clientList()
            .filter(this.isSupportedClient)
            .filter(this.isSameActivityAndDesktop)
            .filter((client: AbstractClient) => client.screen === screen )
            .filter((client: AbstractClient) => !client.minimized)
            .filter((client: AbstractClient) => client.tile !== null)
            ;
    }

    public toString(){
        return "Tiler"
    }
}

const isDebug = readConfig("isDebug", false);
const config = new Config(isDebug);
config.setLogWindowProperties(readConfig("logWindowProperties", false))

console.log(`Tiling started with debug: ${isDebug}`)
new Tiler(config);
