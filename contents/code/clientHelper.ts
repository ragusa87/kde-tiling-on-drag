import {Point} from './point';
import {Config} from './config';
import {LoggerInterface} from './logger';

export function clientToString(client: AbstractClient|undefined|null):string{
    if(!client){
        return 'null'
    }
    return `${client.resourceName} ${client.caption} (${client.internalId})`;
}

export function tileToString(tile: Tile|undefined|null):string{
    if(!tile){
        return 'null'
    }
    const direction = tile.layoutDirection == 0 ? 'F' : (tile.layoutDirection == 1 ? 'H' : 'V')
    return `${tile.toString()}[${direction}]` // - ${tile.parent ? tile.parent.toString() : 'no parent'}`
}


export function isSupportedClient(client: AbstractClient):boolean{
    return client.normalWindow &&
        // Ignore notifications
        !client.notification &&
        // Ignore Konsole's confirm dialogs
        !(client.caption.startsWith('Confirm ') && ['org.kde.konsole', 'konsole'].includes(client.resourceClass)) &&
        // Ignore Spectacle's dialogs (spectacle on X11, org.kde.spectacle on wayland)
        !(['org.kde.spectacle','spectacle'].includes(client.resourceClass)) &&
        // Ignore jetbrains's "Splash screen"
        !(client.resourceClass.includes('jetbrains') && client.caption === 'splash') &&
        // Ignore "Steam apps"
        !(client.resourceClass.startsWith('steam_app_')) &&
        // Ignore ktorrent
        !(client.resourceClass.startsWith('org.kde.ktorrent') || client.resourceClass.startsWith('ktorrent')) &&
        // Ignore Eclipse windows
        !(client.resourceClass.startsWith('Eclipse') || client.resourceClass.startsWith('eclipse')) &&
        // KDE Greater (login/logout dialog)
        !(client.resourceClass.startsWith('ksmserver-')) &&
        // Plasma Shell (logout dialog, etc.) + Ignore Klipper's "Action Popup menu"
        !(['org.kde.plasmashell', 'plasmashell'].includes(client.resourceClass) && ['Plasma', 'plasmashell'].includes(client.caption)) &&
        // Lock screen
        client.resourceClass !== 'kwin_wayland' &&
        // Outline of the window
        ![null, undefined, ''].includes(client.caption)

}

export function isSameActivityAndDesktop(client: AbstractClient):boolean{
    return (client.onAllDesktops || client.desktops.includes(workspace.currentDesktop)) &&
        (client.activities.length === 0 || client.activities.includes(workspace.currentActivity));
}

// Debounce function with QTimer in TypeScript
/* eslint-disable @typescript-eslint/no-explicit-any */
export function debounce<T extends (...args: any[]) => void>(func: T, wait: number): (...args: Parameters<T>) => void {
    // Create the QTimer instance
    const timer: QTimerInterface = new QTimer();
    timer.singleShot = true; // Set the timer to single-shot mode

    let debouncedCallback: (() => void) | null = null;

    return function(...args: Parameters<T>){
        // If the timer is already active (running), stop it
        if (timer.active) {
            timer.stop();
        }

        if (debouncedCallback !== null) {
            timer.timeout.disconnect(debouncedCallback);
        }

        // Create a new closure to capture the current arguments
        debouncedCallback = () => {
            func(...args);  // Execute the debounced function with the provided arguments
        };

        timer.timeout.connect(debouncedCallback);

        // Start the timer, which will trigger `func` after the `wait` time
        timer.start(wait);
    };
}


export function clientProperties (client: AbstractClient):string{
       return `> properties for ${clientToString(client)}
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
                deleted ? ${client.deleted}
            `
    }

    export const point = (x: number, y: number): QPoint => new Point(x, y);
    export function logWindowProperties(config: Config, client: AbstractClient): void{
        if(!config.logWindowProperties){
            return;
        }
        // we use console debug here, so we can log properties without enabling the debug mode
        console.debug(`${clientProperties(client)}\n---> Supported? ${isSupportedClient(client)}`);
    }
    /**
     * List all untiled clients on a given screen
     */

    export function getClientsOnOutput(output: Output) {
        return workspace.windowList().filter(isSupportedClient).filter(isSameActivityAndDesktop).filter((client: AbstractClient) => {
            return client.output.name === output.name && !client.minimized;
        })
    }

    export function getUntiledClientOnOutput(output: Output) {
        return getClientsOnOutput(output)
            .filter((client: AbstractClient) => client.tile === null)
            ;
    }

    export function getClientsOnRootTile(output: Output) {
        const root = workspace.tilingForScreen(output.name)!.rootTile
        return workspace.windowList().filter(isSupportedClient).filter(isSameActivityAndDesktop).filter((client: AbstractClient) => {
            return client.output.name === output.name && !client.minimized && client.tile === root;
        })
    }

    /**
     * Get all tiled clients on the given screen
     */
    export function getTiledClientsOnOutput(output: Output) {
        return getClientsOnOutput(output)
            .filter((client: AbstractClient) => client.tile !== null)
    }

    /**
     * Return all output available.
     * @param favoriteScreen will be the first screen number returned.
     */
    export function getAllOutputs(favoriteScreen: Output|null|undefined): Output[]{
        const screens: Output[] = [];
        if(favoriteScreen !== null && favoriteScreen !== undefined) {
            screens.push(favoriteScreen);
        }
        workspace.screens.forEach(output  => {
            if(!screens.includes(output)) {
                screens.push(output);
            }
        })

        return screens
    }



    /**
    * Return all available tiles for the given screens (except the root tiles)
    */
    export function getAllTiles(screens: string[], removeRoot: boolean = true): Tile[]{
        let tiles: Tile[] = [];
        screens.forEach((screen: string) => {
            const tileManager = workspace.tilingForScreen(screen);
            if(tileManager === null){
                return []
            }
            const root = tileManager.rootTile;
            if(root === null){
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
                return tile !== root || ! removeRoot;
            })

            // Keep only tiles without sub-tiles
            tiles = tiles.filter((tile: Tile) => {
                return tile.tiles.length ===  0 || tile === root;
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
     * Return all supported clients on the given tile that could be tiled.
     */
    export function getClientOnTile(tile: Tile) {
        return tile.windows.filter(isSupportedClient).filter(isSameActivityAndDesktop).filter((otherClient: AbstractClient) => !otherClient.minimized)
    }

    /**
     * Output information about the current screen, list the tiles and clients.
     */
    export function debugTree(config: Config, logger: LoggerInterface, currentScreenOnly: boolean = false){
        if(!config.logDebugTree){
            return;
        }
        let result = `> debugTree (activity: ${workspace.currentActivity})\n`;
        const tab= ' '
        const tab2 = tab + tab;
        const tab3 = tab2 + tab;
        const tab4 = tab3 + tab;
        const outputs = currentScreenOnly ? [workspace.activeScreen] : getAllOutputs(workspace.activeScreen);
        result += `> outputs: ${outputs.length}\n`;

        outputs.forEach((output: Output) => {
            const screen = output.name
            result += `screen ${screen} - tiled: ${getTiledClientsOnOutput(output).length} untiled: ${getUntiledClientOnOutput(output).length} number of tiles: ${getAllTiles( [screen]).length} \n`;
            if(getUntiledClientOnOutput(output).length > 0) {
                result += `${tab2} - untiled:\n${getUntiledClientOnOutput(output).map((client: AbstractClient) => `${tab4} - ${clientToString(client)}`).join(', ')}\n`;
            }
            const root = workspace.tilingForScreen(screen)!.rootTile
            const tiles = [root, ...root.tiles]
            tiles.forEach((tile: Tile) => {
                result += (`${tab2} -  ${tileToString(tile)} (parent ${tileToString(tile.parent)}) - clients: ${getClientOnTile(tile).length} (un-filtered ${tile.windows.length})\n`)
                getClientOnTile(tile).forEach((client: AbstractClient) => {
                    result += (`${tab4} * ${clientToString(client)}\n`);
                })
            })
        });
        logger.debug(result, {});
    }


    export function padGeometry(config: Config, geometry: QRect, currentScreen: string) {
        const padding = config.maximizeWithPadding ? (workspace.tilingForScreen(currentScreen)?.rootTile?.padding ?? 0) : 0;
        return {
            x: geometry.x + padding,
            y: geometry.y + padding,
            width: geometry.width - 2 * padding,
            height: geometry.height - 2 * padding
        }
    }

    /**
     * Return the client center
     */
    export function getWindowCenter(client: AbstractClient|null): QPoint{
        const geometry = client?.clientGeometry ?? null
        if(!geometry){
            console.warn('No geometry provided')
            return {x: 0, y: 0}
        }

        // Use the center of the window (Not sure if we even need this)
        const x: number = geometry.x + (geometry.width/2)
        const y: number = geometry.y + (geometry.height/2)
        return {x,y}
    }
    /**
     * Return empty tiles, excluding root tile
     */
    export function getEmptyTilesByOutput(output: Output): Tile[]
    {
        const tiles: Tile[] = []
        for (const tile of getAllTiles([output.name], true)) {
            if (getClientOnTile(tile).length === 0) {
                tiles.push(tile)
            }
        }

        return tiles;
    }
    export function getTileCenter(tile: Tile): QPoint{
        const geometry = tile?.absoluteGeometryInScreen ?? null
        if(!geometry){
            console.warn('No geometry provided')
            return {x: 0, y: 0}
        }

        // Use the center of the window (Not sure if we even need this)
        const x: number = geometry.x + (geometry.width/2)
        const y: number = geometry.y + (geometry.height/2)
        return {x,y}
    }

    /**
     * Maximize a client
     * Note: setMaximize is not supported correctly, we use the geometry instead.
     * TODO We might need to consider the tile's padding setting
     * TODO We do not respect the client's min/max size
     */
    export function maximize(config: Config, client: AbstractClient) {
        client.frameGeometry = padGeometry(config, workspace.clientArea(KWin.MaximizeArea, client.output, workspace.currentDesktop), client.output.name);
    }

    export function getFreeTilesMap(outputs: Output[]): Map<string, Tile[]> {
        const freeTiles: Map<string, Tile[]> = new Map();
        workspace.screens.filter((output: Output) => outputs.includes(output)).forEach((output: Output) => {
            const freeTilesOnThisScreen: Tile[] = []
            getAllTiles([output.name]).forEach((tile: Tile) => {
                if (tile.windows.filter(isSupportedClient).filter((client: AbstractClient) => !client.minimized).length === 0) {
                    freeTilesOnThisScreen.push(tile);
                }
            });
            freeTiles.set(output.name, [...freeTilesOnThisScreen]);
        });
        return freeTiles
    }