import {Config} from "./config";
import {LogLevel} from "./logLevel";
import {log} from "./logger";
import {clientToString, clientProperties} from "./clientHelper";

export class Tiler{
    config: Config;
    clientFinishUserMovedResizedListener: (client: AbstractClient) => void;
    clientStepUserMovedResizedListener: (client: AbstractClient, geometry: QRect) => void;

    constructor(config: Config){
        this.config = config;

        this.clientFinishUserMovedResizedListener = (client: AbstractClient) => {
            this.event( `clientFinishUserMovedResized ${clientToString(client)}`)
            this.tileClient(client, "clientFinishUserMovedResized")
        };

        this.clientStepUserMovedResizedListener = (client: AbstractClient, geometry: QRect) => {
            this.event( `clientStepUserMovedResizedListener ${clientToString(client)}`)
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

        // Listen for layout change on each screen's root tile (TODO: Handle new screen via screenChanged)
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
        this.doLog(LogLevel.DEBUG,  `${clientProperties(client)}\n---> Supported? ${this.isSupportedClient(client)}`);
    }

    /**
     * Add listeners and tile new client
     */
    private attachClient(client: AbstractClient){
        this.doLog(LogLevel.INFO, `> attachClient ${clientToString(client)}`);
        client.clientFinishUserMovedResized.connect(this.clientFinishUserMovedResizedListener);
        client.clientStepUserMovedResized.connect(this.clientStepUserMovedResizedListener);
        this.tileClient(client, "attachClient");
    }

    /**
     * Remove listeners and re-tile other windows
     */
    private detachClient(client: AbstractClient){
        this.doLog(LogLevel.INFO, `> detachClient ${clientToString(client)}`);
        client.clientFinishUserMovedResized.disconnect(this.clientFinishUserMovedResizedListener);
        client.clientStepUserMovedResized.disconnect(this.clientStepUserMovedResizedListener);

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
     * Return the center of the geometry, it's used to find the best tile for a window
     * TODO: Find a way to use the cursor position instead of the center of the window
     */
    private getCenter(geometry: QRect){
        const x: number = geometry.x + (geometry.width/2)
        const y: number = geometry.y + (geometry.height/2)
        return {x,y};
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

        // Take the windows current position at center
        const center = this.getCenter(client.geometry);

        // Get the tiling manager from KDE
        const tileManager = workspace.tilingForScreen(client.screen);

        // Ask where is the best location for this current window and assign it to the client.
        const bestTileForPosition = tileManager.bestTileForPosition(center.x, center.y);
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
            !(client.resourceClass.includes("jetbrains") && client.caption === "splash")
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

        // Tile all clients (this will un-maximize maximized window)
        workspace.clientList()
            .filter(this.isSupportedClient)
            .filter(this.isSameActivityAndDesktop)
            .filter((otherClient) => !otherClient.minimized)
            .filter((otherClient: AbstractClient) => otherClient.tile === null)
            .forEach((otherClient: AbstractClient) => {
                this.doTile(otherClient, "retileOther: Untiled windows"); // We skip the client that changed
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

                // As the tile is used by more than one client, move one of them to a free tile on the same screen.
                if (otherClientsOnTile.length > 1 && freeTileOnScreen.length > 0) {
                    if(this.moveClientToFreeTile(client, otherClientsOnTile, freeTileOnScreen,  "otherClientsOnTile")){
                        const usedTile = freeTileOnScreen.shift();
                        freeTilesOverall = freeTilesOverall.filter((tile: Tile) => tile !== usedTile);
                        return;
                    }
                }

                // Move untiled client to a free tile if any, as we try to have all the clients tiled
                if(untiledClientsOnScreen.length > 0 && freeTileOnScreen.length > 0){
                    if(this.moveClientToFreeTile( client, untiledClientsOnScreen, freeTileOnScreen, "untilled client")){
                        const usedTile = freeTileOnScreen.shift();
                        freeTilesOverall = freeTilesOverall.filter((tile: Tile) => tile !== usedTile);
                        return
                    }
                }

                // As the tile is used by more than one client, move one of them to a free tile on another screen.
                if(otherClientsOnTile.length > 1 && freeTilesOverall.length > 0) {
                    this.doLog(LogLevel.DEBUG, `TODO We could move one client to a free tile on another screen`);
                }
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
            client.tile.padding += 1;
            client.tile.padding -= 1;
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
            output += `screen ${screen} - tiled: ${this.getTiledClientsOnScreen(screen).length} untiled: ${this.getUntiledClientOnScreen(screen).length} \n`;
            if(this.getUntiledClientOnScreen(screen).length > 0) {
                output += `${tab2} - untiled:\n${this.getUntiledClientOnScreen(screen).map((client: AbstractClient) => `${tab3} - ${clientToString(client)}`).join(", ")}\n`;
            }
            this.getAllTiles(screen).forEach((tile: Tile) => {
                output += (`${tab2} -  ${tile.toString()} clients: ${this.getClientOnTile(tile).length} (un-filtered ${tile.windows.length})\n`)
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
}