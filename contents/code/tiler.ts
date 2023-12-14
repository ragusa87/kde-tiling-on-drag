import {Config} from "./config";
import {LogLevel} from "./logLevel";
import {log} from "./logger";
import {clientProperties, clientToString, tileToString} from "./clientHelper";
import {cancelTimeout, setTimeout} from "./timeout";

export class Tiler{
    config: Config;
    clientFinishUserMovedResizedListener: (client: AbstractClient) => void;
    clientStepUserMovedResizedListener: (client: AbstractClient, geometry: QRect) => void;
    private timer: QTimerInterface|null = null;
    clientScreenChangedListener: () => void;
    isMoving: boolean = false; // True if the user is moving a window (set by clientStepUserMovedResizedListener/clientFinishUserMovedResizedListener)
    constructor(config: Config){
        this.config = config;

        this.clientFinishUserMovedResizedListener = (client: AbstractClient) => {
            this.event( `clientFinishUserMovedResized ${clientToString(client)}`)
            this.isMoving = false;
            this.tileClient(client, "clientFinishUserMovedResized")
        };

        this.clientScreenChangedListener = () => {
            // When the used is moving a window (clientStepUserMovedResized) to another screen, the screenChanged event is triggered.
            // We need to skip it, otherwise the window will be re-tiled even if the user did not complete the move (clientFinishUserMovedResizedListener)
            if(this.isMoving){
                return;
            }
            this.event(`clientScreenChangedListener`)
            if(workspace.activeClient === null){
                this.doLog(LogLevel.WARNING, `clientScreenChangedListener: workspace.activeClient is null`);
                return;
            }
            this.retileOther(workspace.activeClient)
        }

        this.clientStepUserMovedResizedListener = (client: AbstractClient, geometry: QRect) => {
            this.event( `clientStepUserMovedResizedListener`)
            this.isMoving = true;
            if(!this.config.doShowOutline){
                return
            }

            // Calculate the outline geometry
            const position = this.getPosition(geometry);
            const tile = workspace.tilingForScreen(client.screen)?.bestTileForPosition(position.x, position.y)
            let outlineGeometry = tile ? tile.absoluteGeometry : null;

            // If we have more than one window on the screen, show the outline maximized
            const numberOfOtherTiledWindows = this.getTiledClientsOnScreen(client.screen).filter((otherClient: AbstractClient) => otherClient !== client).length;
            const numberOfOtherUnTiledWindows = this.getUntiledClientOnScreen(client.screen).filter((otherClient: AbstractClient) => otherClient !== client).length;

            if(numberOfOtherTiledWindows + numberOfOtherUnTiledWindows === 0 && this.config.doMaximizeSingleWindow){
                outlineGeometry = workspace.clientArea(KWin.MaximizeArea, client.screen, client.desktop);
            }

            if(outlineGeometry !== null){
                // Show the outline, note that we have no way to set the "outline visualParentGeometry" so no animation is shown
                // A "TypeError exception" is thrown if the outlineGeometry object is altered, so the padding is not supported.
                workspace.showOutline(outlineGeometry);
            }
        };

        // Log properties at startup
        workspace.clientList().forEach((oneClient: AbstractClient) => {
            this.logWindowProperties(oneClient)
        });

        // Attach all existing windows at startup
        workspace.clientList().filter(this.isSupportedClient).forEach((client: AbstractClient) => {
            this.detachClient(client);
            this.attachClient(client);
        });

        // Attach new client
        workspace.clientAdded.connect((client: AbstractClient) => {
            this.logWindowProperties(client)

            if(! this.isSupportedClient(client)){
                return;
            }

            this.event( `clientAdded: ${clientToString(client)}`)
            this.attachClient(client)
        });

        // Detach old client
        workspace.clientRemoved.connect((client: AbstractClient) => {
            if(! this.isSupportedClient(client)){
                return;
            }
            this.event(`clientRemoved: ${clientToString(client)}`)
            this.detachClient(client)
        });

        // On un-minimize, re-tile the window
        workspace.clientUnminimized.connect((client: AbstractClient) => {
            if(! this.isSupportedClient(client)){
                return;
            }
            this.event( `clientUnminimized: ${clientToString(client)}`)
            this.tileClient(client, "Unminimized")
        });

        // On minimize, re-tile other window
        workspace.clientMinimized.connect((client: AbstractClient) => {
            if(! this.isSupportedClient(client)){
                return;
            }
            this.event( `clientMinimized: ${clientToString(client)}`)
            client.tile = null;
            this.retileOther(client)
        });

        // Listen for layout change on each screen's root tile
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
                // defer execution to avoid multiple calls on tile resizing
                if(this.timer !== null){
                    cancelTimeout(this.timer);
                }
                this.timer = setTimeout(() =>{
                    this.event(`layoutModified on screen: ${screen}`)
                    this.handleMaximizeMinimize(screen, "layoutModified")

                }, 1000)
            });
        });
    }

    /**
     * Filter client to be on the same activity and desktop
     */
    private isSameActivityAndDesktop(client: AbstractClient): boolean{
        return (client.onAllDesktops || client.desktop === workspace.currentDesktop) &&
            (client.activities.length === 0 || client.activities.includes(workspace.currentActivity));
    }

    /**
     * Log window properties, useful to tweak the supported client list. Must be enabled via config
     */
    private logWindowProperties(client: AbstractClient): void{
        if(!this.config.logWindowProperties){
            return;
        }
        // we use console debug here, so we can log properties without enabling the debug mode
        console.debug(`${clientProperties(client)}\n---> Supported? ${this.isSupportedClient(client)}`);
    }

    /**
     * Add listeners and tile new client
     */
    private attachClient(client: AbstractClient){
        this.doLog(LogLevel.INFO, `> attachClient ${clientToString(client)}`);
        client.clientFinishUserMovedResized.connect(this.clientFinishUserMovedResizedListener);
        client.clientStepUserMovedResized.connect(this.clientStepUserMovedResizedListener);
        client.screenChanged.connect(this.clientScreenChangedListener);
        this.tileClient(client, "attachClient");
    }

    /**
     * Remove listeners and re-tile other windows
     */
    private detachClient(client: AbstractClient){
        this.doLog(LogLevel.INFO, `> detachClient ${clientToString(client)}`);
        client.clientFinishUserMovedResized.disconnect(this.clientFinishUserMovedResizedListener);
        client.clientStepUserMovedResized.disconnect(this.clientStepUserMovedResizedListener);
        client.screenChanged.disconnect(this.clientScreenChangedListener);

        client.tile = null;
        this.retileOther(client);
    }

    /* eslint-disable  @typescript-eslint/no-explicit-any */
    private doLog(level: LogLevel, ...value: any){
        if(level > this.config.logLevel){
            return;
        }
        log(level, value)
    }

    /**
     * Return the coordinate used to find the best tile for a window.
     * Either the cursor's position or the center of the window.
     */
    private getPosition(geometry: QRect){
        const cursorX = workspace.cursorPos.x
        const cursorY = workspace.cursorPos.y
        // If the cursor is within the window's bounds, we are dragging the window => use the cursor's position
        if(cursorX >= geometry.x && cursorX <= geometry.x + geometry.width && cursorY >= geometry.y && cursorY <= geometry.y + geometry.height){
            return {x:cursorX,y:cursorY};
        }

        // Use the center of the window (Not sure if we even need this)
        const x: number = geometry.x + (geometry.width/2)
        const y: number = geometry.y + (geometry.height/2)

        return {x,y}
    }

    /**
     * Tile a client and retile other client.
     */
    private tileClient(client: AbstractClient, reason: string = ""){

        this.doLog(LogLevel.DEBUG, `> tileClient ${clientToString(client)} (${reason})`);

        this.doTile(client, "tileClient");

        // Re-tile other windows on the same screen
        this.retileOther(client);
    }

    /**
     * Tile a client
     * @internal
     */
    private doTile(client: AbstractClient, reason: string = ""){

        // Take the current position to find the best tile
        const position = this.getPosition(client.geometry);

        // Get the tiling manager from KDE
        const tileManager = workspace.tilingForScreen(client.screen);

        // Ask where is the best location for this current window and assign it to the client.
        const bestTileForPosition = tileManager.bestTileForPosition(position.x, position.y);
        if(bestTileForPosition === null && this.config.doMaximizeWhenNoLayoutExists){
            this.doLog(LogLevel.DEBUG, `No tile exists for ${clientToString(client)}, maximize it instead`);
            client.geometry = workspace.clientArea(KWin.MaximizeArea, client.screen, client.desktop);
        }
        this.doLog(LogLevel.INFO, `doTile: ${clientToString(client)} to ${bestTileForPosition?.toString()} (${reason}) screen ${client.screen}`);

        client.tile = bestTileForPosition
    }

    /**
     * Return all available tiles for the given screens (except the root tiles)
     */
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

            // Keep only tiles without sub-tiles
            tiles = tiles.filter((tile: Tile) => {
                return tile.tiles.length ===  0;
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
     * @param favoriteNumber will be the first screen number returned.
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


    /**
     * Check if the client is supported by the tiler.
     * We ignore splash screen, dialogs, etc.
     */
    private isSupportedClient(client: AbstractClient){
        return client.normalWindow && !client.deleted &&
            // Ignore Konsole's confirm dialogs
            !(client.caption.startsWith("Confirm ") && client.resourceClass === "org.kde.konsole") &&
            // Ignore Spectacle's dialogs
            !(client.resourceClass === "org.kde.spectacle") &&
            // Ignore Klipper's "Action Popup menu"
            !(client.resourceClass === "org.kde.plasmashell" && client.caption === "Plasma") &&
            // Ignore jetbrains's "Splash screen"
            !(client.resourceClass.includes("jetbrains") && client.caption === "splash") &&
            // Ignore "Steam apps"
            !(client.resourceClass.startsWith("steam_app_")) &&
            // Ignore ktorrent
            !(client.resourceClass.startsWith("org.kde.ktorrent"))
    }

    /**
     * Return all supported clients on the given tile that could be tiled.
     */
    private getClientOnTile(tile: Tile) {
        return tile.windows.filter(this.isSupportedClient).filter(this.isSameActivityAndDesktop).filter((otherClient: AbstractClient) => !otherClient.minimized)
    }

    /**
     * Maximize a client
     * Note: setMaximize is not supported correctly, we use the geometry instead.
     * TODO We might need to consider the tile's padding setting
     * TODO We do not respect the client's min/max size
     */
    private maximize(client: AbstractClient) {

        this.doLogIf(this.config.logMaximize,LogLevel.INFO, `> maximize ${clientToString(client)} ${client.tile?.toString()}`);

        client.tile = null;
        client.geometry = workspace.clientArea(KWin.MaximizeArea, client.screen, client.desktop);
    }

    /**
     * Re-tile other windows (so they can fit a better position due to the change of the given client)
     */
    private retileOther(client: AbstractClient) {
        this.doLog(LogLevel.DEBUG, `re-tile other windows due to change on ${clientToString(client)}. Screen: ${client.screen}`);

        const justRetiled: AbstractClient[] = [];
        // Tile all clients (this will un-maximize maximized window)
        workspace.clientList()
            .filter(this.isSupportedClient)
            .filter(this.isSameActivityAndDesktop)
            .filter((otherClient) => !otherClient.minimized)
            .filter((otherClient: AbstractClient) => otherClient.tile === null)
            .forEach((otherClient: AbstractClient) => {
                this.doTile(otherClient, "retileOther: Untiled windows"); // We skip the client that changed
                justRetiled.push(otherClient);
            })


        // Build the list of free tiles "per screen" and "overall"
        const freeTileOnScreens: Map<number, Tile[]> = new Map();
        let freeTilesOverall: Tile[] = []
        this.getAllScreensNumbers(client.screen).forEach((screen: number) => {
            const currentFreeTiles : Tile[] = []
            freeTileOnScreens.set(screen, currentFreeTiles);
            this.getAllTiles(screen).forEach((tile: Tile) => {
                if (tile.windows.filter(this.isSupportedClient).filter((client: AbstractClient) => !client.minimized).length === 0) {
                    currentFreeTiles.push(tile);
                    freeTilesOverall.push(tile);
                }
            });

            // Update the list of free tiles on the screen, given that justRetiled windows are not yet pushed to the tile's windows list.
            justRetiled.forEach((retiledClient: AbstractClient) => {
                if (retiledClient.tile) {
                    currentFreeTiles.indexOf(retiledClient.tile) !== -1 && currentFreeTiles.splice(currentFreeTiles.indexOf(retiledClient.tile), 1);
                    freeTilesOverall.indexOf(retiledClient.tile) !== -1 && freeTilesOverall.splice(freeTilesOverall.indexOf(retiledClient.tile), 1);
                }
            });
            freeTileOnScreens.set(screen,currentFreeTiles)
        });

        // For each screen
        this.getAllScreensNumbers(client.screen).forEach((screen: number) =>
        {
            const freeTileOnScreen = freeTileOnScreens.get(screen) ?? [];
            // Move stacked window to a free tile if any
            this.getAllTiles(screen).every((tile: Tile) => {
                this.doLog(LogLevel.DEBUG, `re-tile other windows. \n\tScreen: ${screen}\n\ttile: ${tileToString(tile)}`);

                const otherClientsOnTile = this.getClientOnTile(tile);
                // Re-tiled clients are not detected by getClientOnTile, so we need to add them manually.
                // I don't know why Kwin does update the tile's windows list on the fly.
                justRetiled.forEach((client: AbstractClient) => {
                     if(client.tile === tile){
                        this.doLog(LogLevel.DEBUG, `Add ${clientToString(client)} to otherClientsOnTile`)
                        otherClientsOnTile.push(client);
                    }
                 });

                const untiledClientsOnScreen = this.getUntiledClientOnScreen(screen);

                this.doLog(LogLevel.DEBUG, `re-tile other windows. \n\tScreen: ${screen}\n\ttile: ${tileToString(tile)}\n\totherClientsOnTile: ${otherClientsOnTile.length}\n\tuntiledClientsOnScreen: ${untiledClientsOnScreen.length}`);

                // As the tile is used by more than one client, move one of them to a free tile on the same screen.
                if (otherClientsOnTile.length > 1 && freeTileOnScreen.length > 0) {
                    if(this.moveClientToFreeTile(client, otherClientsOnTile, freeTileOnScreen,  "otherClientsOnTile")){
                        const usedTile = freeTileOnScreen.shift();
                        freeTilesOverall = freeTilesOverall.filter((tile: Tile) => tile !== usedTile);
                        return false;
                    }
                }
                // Move untiled client to a free tile if any, as we try to have all the clients tiled
                if(untiledClientsOnScreen.length > 0 && freeTileOnScreen.length > 0){
                    if(this.moveClientToFreeTile( client, untiledClientsOnScreen, freeTileOnScreen, "untilled client")){
                        const usedTile = freeTileOnScreen.shift();
                        freeTilesOverall = freeTilesOverall.filter((tile: Tile) => tile !== usedTile);
                        return false
                    }
                }

                // As the tile is used by more than one client, move one of them to a free tile on another screen.
                if(this.config.rearrangeBetweenMonitors && otherClientsOnTile.length > 1 && freeTilesOverall.length > 0) {
                    this.doLog(LogLevel.DEBUG, `Move one client to a free tile on another screen`);
                    let oneClient = otherClientsOnTile.pop();
                    if(oneClient === client){
                        // The client that changed is on this tile, so we need to take another one
                        oneClient = otherClientsOnTile.pop();
                    }
                    if(oneClient !== undefined) {
                        const oneTile = freeTilesOverall.shift() || null
                        this.doLog(LogLevel.DEBUG, `Move ${clientToString(oneClient)} to ${oneTile}`)
                        oneClient.tile = oneTile;
                        this.forceRedraw(oneTile);
                        return false;
                    }
                }
                return true;
            });
        })

        // Minimize/maximize all windows on the screen
        this.getAllScreensNumbers(client.screen).forEach((screen: number) => {
            this.handleMaximizeMinimize(screen, `finished retileOther: Screen: ${screen}`);
        });

        // Output the client's list if the option is enabled
        this.debugTree(client.desktop)
    }

    /**
     * Tile all clients on a given screen
     */
    private tileScreen(screen: number,reason: string) {
        this.getUntiledClientOnScreen(screen).forEach((client: AbstractClient) => {
            this.doLog(LogLevel.DEBUG, `re-tile ${clientToString(client)} for screen ${screen} - reorganization (${reason})`);
            this.doTile(client, reason);
        });
    }

    /**
     * List all untiled clients on a given screen
     */
    private getUntiledClientOnScreen(screen: number) {
        return workspace.clientList().filter(this.isSupportedClient).filter(this.isSameActivityAndDesktop).filter((client: AbstractClient) => {
            return client.screen === screen && client.tile === null && !client.minimized;
        })
    }

    /**
     * Un-maximize a client as it share the same screen with other clients
     * Note: setMaximize is not supported correctly, we use the geometry instead.
     * TODO We might need to consider the tile's padding setting
     * TODO We do not respect the client's min/max size
     */
    private unmaximize(client: AbstractClient) {
        if(this.config.logMaximize){
            this.doLog(LogLevel.INFO, `> un-maximize ${clientToString(client)} - ${client.tile?.toString()}`);
        }

        // Force a tile so unmaximize will work
        if(client.tile === null){
            this.doLogIf(this.config.logMaximize, LogLevel.WARNING, `Force tiling an untiled window ${clientToString(client)}`)
            this.doTile(client, "unmaximize without tile");
        }

        // Change a tile setting, so all windows in it got repositioned
        if(client.tile !== null){
            this.doLogIf(this.config.logMaximize, LogLevel.DEBUG, `Change padding to resize ${clientToString(client)}`)
            this.forceRedraw(client.tile)
        }else{
            // Sometimes, the client is not tiled as doMaximizeWhenNoLayoutExists is off, so we do not have any tile.
            this.doLogIf(this.config.logMaximize, LogLevel.WARNING, `Force tiling an untiled window ${clientToString(client)}`)
            client.setMaximize(false,false)
        }
    }

    /**
     * Output information about the current screen, list the tiles and clients.
     */
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
            output += `screen ${screen} - tiled: ${this.getTiledClientsOnScreen(screen).length} untiled: ${this.getUntiledClientOnScreen(screen).length} number of tiles: ${this.getAllTiles(screen).length} \n`;
            if(this.getUntiledClientOnScreen(screen).length > 0) {
                output += `${tab2} - untiled:\n${this.getUntiledClientOnScreen(screen).map((client: AbstractClient) => `${tab3} - ${clientToString(client)}`).join(", ")}\n`;
            }
            this.getAllTiles(screen).forEach((tile: Tile) => {
                output += (`${tab2} -  ${tileToString(tile)} clients: ${this.getClientOnTile(tile).length} (un-filtered ${tile.windows.length})\n`)
                this.getClientOnTile(tile).forEach((client: AbstractClient) => {
                    output += (`${tab4} * ${clientToString(client)}\n`);
                })
            })
        });
        this.doLog(LogLevel.DEBUG, output);
    }

    /**
     * Log an event if the option is enabled
     */
    private event(message: string) {
        this.doLogIf(this.config.logEvents, LogLevel.ERROR, `> Event ${message}`);
    }

    /**
     * Maximize or un-Maximize all windows on the given screen
     */
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
            case 1: // Only one client on this screen, maximize it if allowed
                if(!this.config.doMaximizeSingleWindow){
                    this.unmaximize(clientsOnThisScreen[0])
                    break;
                }
                this.maximize(clientsOnThisScreen[0]);
                break;
            default: // Multiple clients on this screen, un-maximize them
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
        this.doLog(LogLevel.DEBUG, `Move one client from tile to a free one (${reason}). Clients on tile:\n  ${otherClientsOnTile.map((client: AbstractClient) => `  - ${clientToString(client)}`).join("\n")}\nFree tiles : ${freeTileOnScreen.map((tile: Tile) => `- ${tile.toString()}`).join(", ")})}`);
        let clientToMove = otherClientsOnTile.pop();
        if (clientToMove === client) {
            clientToMove = otherClientsOnTile.pop();
            if(clientToMove === null){
                this.doLog(LogLevel.DEBUG, `Do not move ${client} as it is being tiled. No other client to move to a free tile.`)
                return null;
            }
            this.doLog(LogLevel.DEBUG, `Skip ${clientToString(client)} as it is the one that changed, use ${clientToString(clientToMove)} instead`)
        }
        const freeTile = freeTileOnScreen[0] ?? null;

        if (clientToMove && freeTile) {
            this.doLog(LogLevel.DEBUG, `Move ${clientToString(clientToMove)} from ${clientToMove.tile?.toString()} to ${freeTile.toString()}`);
            clientToMove.tile = freeTile;
            this.forceRedraw(freeTile);
            return freeTile
        }
        return null;
    }

    /**
     * Log a message if the `enabled` condition is true
     */
    private doLogIf(enabled: boolean, level: LogLevel, message: string) {
        if(!enabled){
            return;
        }
        this.doLog(level, message);
    }

    /**
     * Get all tiled clients on the given screen
     */
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

    private forceRedraw(tile: Tile|null) {
        if(tile === null || !this.config.doForceRedraw) {
            return;
        }
        tile.padding += 1;
        tile.padding -= 1;
    }
}
