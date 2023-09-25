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

let timers: QTimer[] = [];
function setTimeout (callback: any, duration: number): number{
    // @ts-ignore
    let timer = new QTimer();
    timers.push(timer);
    timer.singleShot = true;
    timer.timeout.connect(callback);
    timer.start(duration);
    return timers.length -1
}

function cancelTimeout(timerId: number): boolean{
    if(timers[timerId] === undefined){
        return false;
    }
    timers[timerId].stop();
    return true;
}



class Tiler{
    config: Config;
    isTiling: boolean = false;
    clientFinishUserMovedResizedListener: (client: AbstractClient) => void;
    desktopChangedListener: () => void;

    constructor(config: Config){
        this.config = config;

        this.clientFinishUserMovedResizedListener = (client: AbstractClient) => {
            this.event( `clientFinishUserMovedResized ${this.clientToString(client)}`)
            this.tileClient(client, "clientFinishUserMovedResized")
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

        //client.desktop = workspace.activeScreen;

        this.tileClient(client, "attachClient");
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

    tileClient(client: AbstractClient, reason: string = ""){
        if(this.isTiling){
            this.doLog(LogLevel.WARNING, `tileClient is already running, skip ${this.clientToString(client)} (${reason})`);
            return;
        }
        this.isTiling= true;
        this.debug(`> tileClient ${this.clientToString(client)} (${reason})`);

        this.doTile(client, "tileClient");

        // Re-tile other windows on the same screen
        this.retileOther(client);
        this.isTiling= false;
    }

    doTile(client: AbstractClient, reason: string = ""){

        // Take the windows current position at center
        const center = this.getCenter(client.geometry);

        // Get the tiling manager from KDE
        const tileManager = workspace.tilingForScreen(client.screen);

        // Ask where is the best location for this current window and assign it to the client.
        let bestTileForPosition = tileManager.bestTileForPosition(center.x, center.y);

        this.doLog(LogLevel.INFO, `doTile: ${this.clientToString(client)} to ${bestTileForPosition?.toString()} (${reason}) screen ${client.screen}`);

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
        this.doLogIf(this.config.logMaximize,LogLevel.INFO, `> maximize ${this.clientToString(client)} ${client.tile?.toString()}`);

        // const manager = workspace.tilingForScreen(client.screen);
        // if(manager !== null && manager.rootTile !== null){
        //     this.doLogIf(this.config.logMaximize, LogLevel.DEBUG,`maximize ${this.clientToString(client)} - setFrameGeomerty`);
        //     client.frameGeometry = manager.rootTile.absoluteGeometry
        // }

        client.tile = null;
        const MaximizeArea = 2; // TODO Read global enum instead
        client.frameGeometry = workspace.clientArea(MaximizeArea, client.screen, client.desktop);

    }

    private retileOther(client: AbstractClient) {
        this.debug(`re-tile other windows due to change on ${this.clientToString(client)}. Screen: ${client.screen}`);

        // Tile all clients (this will un-maximize maximized window)
        workspace.clientList().filter(this.isSupportedClient).filter((otherClient) => !otherClient.minimized).filter((otherClient: AbstractClient) => otherClient.tile === null).forEach((otherClient: AbstractClient) => {
            this.doTile(otherClient, "retileOther: Untilled windows"); // We skip the client that changed
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
            let freeTileOnScreen = freeTileOnScreens.get(screen) ?? [];

            // Move stacked window to a free tile if any
            this.getAllTiles(screen).forEach((tile: Tile) => {

                const otherClientsOnTile = this.getClientOnTile(tile);
                const untilledClientsOnScreen = this.getUntiledClientOnScreen(screen, client.desktop);
                //this.debug(`Screen ${screen}, Tile ${tile.toString()} : has ${otherClientsOnTile.length} clients and ${freeTileOnScreen.length} free tiles. Clients: ${otherClientsOnTile.map((client: AbstractClient) => this.clientToString(client)).join(", ")})}`);
                //this.debug(`Screen ${screen} has ${untilledClientsOnScreen.length} untiled clients. ${untilledClientsOnScreen.map((client: AbstractClient) => this.clientToString(client)).join(", ")})}`)
                if (otherClientsOnTile.length > 1 && freeTileOnScreen.length > 0) {
                    this.moveClientToFreeTile(screen, client, otherClientsOnTile, freeTileOnScreen,  "otherClientsOnTile");
                    return;
                }
                if(untilledClientsOnScreen.length > 0 && freeTileOnScreen.length > 0){
                    this.moveClientToFreeTile(screen, client, untilledClientsOnScreen, freeTileOnScreen, "untilled client")
                    return
                }

                if(otherClientsOnTile.length > 1 && freeTilesOverall.length > 0) {
                    // TODO Could have moved the window to another screen
                    this.debug(`could move one client from tile to a free one on another screen`);
                }
            });
        })

        // Minimize/maximize windows
        this.getAllScreensNumbers(client.screen).forEach((screen: number) => {
            this.handleMaximizeMinimize(screen, client.desktop, `finished retileOther: Screen: ${screen}`);
        });

        this.debugTree(client.desktop)
    }


    private isSameActivity(client: AbstractClient, otherClient: AbstractClient) : boolean {
        // empty activities means all activities
        // TODO Maybe we need to sort the activities list before comparing ?
        return client.activities.length === 0 || otherClient.activities.length === 0 || client.activities.join(",") === otherClient.activities.join(",");
    }

    private tileDesktop(i: number, desktop: number, reason: string) {
        this.getUntiledClientOnScreen(i, desktop).forEach((client: AbstractClient) => {
            this.debug(`re-tile ${this.clientToString(client)} for screen ${i} and desktop ${desktop} - reorganization (${reason})`);
            this.doTile(client, reason);
        });
    }

    getUntiledClientOnScreen(screen: Number, desktop: number) {
        return workspace.clientList().filter(this.isSupportedClient).filter((client: AbstractClient) => {
            return client.screen === screen && client.tile === null && !client.minimized && client.desktop === desktop;
        })
    }

    private unmaximize(client: AbstractClient) {
        if(this.config.logMaximize){
            this.doLog(LogLevel.INFO, `> un-maximize ${this.clientToString(client)} - ${client.tile?.toString()}`);
        }

        // Force a tile so unmaximize will work
        if(client.tile === null){
            this.doLog(LogLevel.WARNING, `Force tiling an untiled window ${this.clientToString(client)}`)
            this.doTile(client, "unmaximize without tile");
        }

        // Change and restore layoutDirection so all tiled windows are repositioned again
        if(client.tile !== null && client.tile.layoutDirection !== 0){
            const oldLayoutDirection = client.tile.layoutDirection
            client.tile.layoutDirection = client.tile.layoutDirection === 1 ? 2 : 1;
            client.tile.layoutDirection = oldLayoutDirection;
        }else{
            // setMaximize is buggy,avoid using it while tiling...
            client.setMaximize(false,false)
        }
    }

    private debugTree(desktop: number) {
        if(!this.config.logDebugTree){
            return;
        }
        let output = `> debugTree ${desktop}`;
        const tab= " "
        const tab2 = tab + tab;
        const tab3 = tab2 + tab;
        const tab4 = tab3 + tab;
        this.getAllScreensNumbers(0).forEach((screen: number) => {
            output += `screen ${screen} - ${workspace.clientList().filter(this.isSupportedClient).filter((client: AbstractClient) => client.screen === screen).length} clients on screen, untiled: ${this.getUntiledClientOnScreen(screen,desktop).length} \n`;
            if(this.getUntiledClientOnScreen(screen,desktop).length > 0) {
                output += `${tab2} - untiled:\n${this.getUntiledClientOnScreen(screen,desktop).map((client: AbstractClient) => `${tab3} - ${this.clientToString(client)}`).join(", ")}\n`;
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
        this.doLog(LogLevel.ERROR, `> Event ${message}`);
    }

    private handleMaximizeMinimize(screen: number, desktop: number, reason: string) {

        // Make sure all client are tiled
        this.tileDesktop(screen,desktop, "handleMaximizeMinimize");

        const clientsOnThisScreen = workspace.clientList().filter(this.isSupportedClient).filter((otherClient: AbstractClient) => otherClient.screen === screen ).filter((otherClient: AbstractClient) => !otherClient.minimized);

        // If there is untilled clients, take them into account
        this.getUntiledClientOnScreen(screen,desktop).forEach((client: AbstractClient) => {
            clientsOnThisScreen.push(client);
        });


        this.doLog(LogLevel.DEBUG, `> handleMaximizeMinimize ${clientsOnThisScreen.length} clients on screen ${screen} (${reason})`);
        switch (clientsOnThisScreen.length) {
            case 1:
                this.maximize(clientsOnThisScreen[0]);
                break;
            default:
                clientsOnThisScreen.forEach((clientOnThisScreen: AbstractClient) => {
                    this.unmaximize(clientOnThisScreen)
                });
                break;
        }
    }

    private moveClientToFreeTile(screen: Number, client: AbstractClient, otherClientsOnTile: AbstractClient[], freeTileOnScreen: Tile[], reason: string) {
        this.debug(`Move one client from tile to a free one (${reason}). Clients on tile:\n  ${otherClientsOnTile.map((client: AbstractClient) => `  - ${this.clientToString(client)}`).join("\n")}\nFree tiles : ${freeTileOnScreen.map((tile: Tile) => `- ${tile.toString()}`).join(", ")})}`);
        let clientToMove = otherClientsOnTile.pop();
        if (clientToMove === client) {
            clientToMove = otherClientsOnTile.pop();
            if(clientToMove === null){
                this.debug(`Do not move ${client} as it beeing tiled. No other client to move to a free tile.`)
                return;
            }
            this.debug(`Skip ${this.clientToString(client)} as it is the one that changed, use ${this.clientToString(clientToMove)} instead`)
        }
        const freeTile = freeTileOnScreen[0] ?? null;

        if (clientToMove && freeTile) {
            this.debug(`Move ${this.clientToString(clientToMove)} from ${clientToMove.tile?.toString()} to ${freeTile.toString()}`);
            // @ts-ignore freeTileOnScreen is not empty
            clientToMove.tile = freeTile;
        }
    }

    private waitFor(signal: Signal<any>,client: AbstractClient, timeout = 5000) {
        const myPromise :Promise<AbstractClient> = new Promise((resolve, reject) => {
            let timeoutId: number | null = null;

            const callbackFunction = function (){
                if(timeoutId !== null){
                    cancelTimeout(timeoutId);
                }
                resolve(client);
                signal.disconnect(callbackFunction);
            }

            if(timeout > 0 ) {
                setTimeout(() => {
                    signal.disconnect(callbackFunction);
                    reject("Timed-out")
                }, timeout)
            }

            signal.connect(callbackFunction);
        });

        return myPromise;
    }
    private doLogIf(enabled: boolean, level: LogLevel, message: string) {
        if(!enabled){
            return;
        }
        this.doLog(level, message);

    }
}

(new Tiler(new Config()));
