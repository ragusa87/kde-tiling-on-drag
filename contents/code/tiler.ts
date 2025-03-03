import {Config} from './config';
import {Console} from './logger';
import {
    logWindowProperties,
    clientToString,
    debounce,
    isSupportedClient,
    getTiledClientsOnOutput,
    getUntiledClientOnOutput,
    padGeometry,
    getAllOutputs,
} from './clientHelper';

import {ShortcutManager} from './shortcuts';
import {EngineInterface, Engine} from './engine';
export class Tiler{
    config: Config;
    logger: Console;
    engine: EngineInterface;
    shortcuts: ShortcutManager;
    minimizedChanged: (myClient: AbstractClient) => void;
    lastWindowActivated: AbstractClient|null = null
    minimizedChangedHandlers: Map<AbstractClient, () => void>;
    interactiveMoveResizeFinishedHandlers: Map<AbstractClient, () => void>;
    outputChangedHandlers: Map<AbstractClient, () => void>;
    interactiveMoveResizeSteppedHandlers: Map<AbstractClient, () => void>;
    desktopChangedHandlers: Map<AbstractClient, () => void>;
    previousActivity: string
    previousDesktop: VirtualDesktop
    constructor(config: Config){
        this.config = config;
        this.logger = new Console(this.config.logLevel)
        this.engine = new Engine(config, this.logger)
        this.shortcuts = new ShortcutManager();
        this.minimizedChangedHandlers = new Map<AbstractClient, () => void>();
        this.outputChangedHandlers = new Map<AbstractClient, () => void>();
        this.interactiveMoveResizeFinishedHandlers = new Map<AbstractClient, () => void>();
        this.interactiveMoveResizeSteppedHandlers = new Map<AbstractClient, () => void>();
        this.desktopChangedHandlers = new Map<AbstractClient, () => void>();
        this.previousDesktop = workspace.currentDesktop
        this.previousActivity = workspace.currentActivity

        this.minimizedChanged = (client: AbstractClient) => {
            this.event( `minimizedChanged: ${clientToString(client)} ${client.minimized ? 'minimized' : 'unminimized'}`)

            this.engine.minimizedChanged(client)
        }

        // Log properties at startup
        workspace.windowList().forEach((oneClient: AbstractClient) => {
            logWindowProperties(this.config, oneClient)
        });

        // Attach all existing windows at startup
        workspace.windowList().filter(isSupportedClient).forEach((client: AbstractClient) => {
            this.detachClient(client);
            this.attachClient(client);
        });

        // Attach new client
        workspace.windowAdded.connect((client: AbstractClient) => {
            logWindowProperties(this.config, client)

            if(! isSupportedClient(client)){
                return;
            }
            this.event( `clientAdded: ${clientToString(client)}`)
            this.attachClient(client)
        });

        workspace.windowActivated.connect(client => {
            if(client === null || ! isSupportedClient(client)){
                return;
            }
            this.event(`windowActivated: ${clientToString(client)}`)
            this.lastWindowActivated = client
            if(this.previousDesktop.id !== workspace.currentDesktop.id){
                this.event('workspace changed')
                this.engine.workspaceChanged()
            }
            if(this.previousActivity !== workspace.currentActivity){
                this.event('Activity changed')
                this.engine.workspaceChanged() // TODO add event ?
            }
            this.previousDesktop = workspace.currentDesktop
            this.previousActivity = workspace.currentActivity
        })

        // Detach old client
        workspace.windowRemoved.connect((client: AbstractClient) => {
            if(! isSupportedClient(client)){
                return;
            }

            this.event(`windowRemoved: ${clientToString(client)}`)
            this.detachClient(client)
        });

        // Listen for layout change on each screen's root tile
        getAllOutputs(workspace.activeScreen).forEach((output: Output) => {
            const tileManager = workspace.tilingForScreen(output.name);
            if(tileManager === null){
                this.logger.warn(`No tileManager for screen ${output.name} ??`);
                return
            }
            if(tileManager.rootTile === null){
                this.logger.warn(`No root tile for screen ${output.name} ??`);
                return
            }
            workspace.tilingForScreen(output.name).rootTile.layoutModified.connect(debounce(() => {
                    this.event(`layoutModified on screen: ${output.name}`)
                    this.engine.layoutModified(output)
            }, 50));
        });
    }


    /**
     * Show a window outline while moving a window (as when the user is pressing shift)
     * WARNING: This seems to only works with X11 windows, not Wayland windows
     */
    public interactiveMoveResizeStepped(client: AbstractClient) {
        // This event is triggered when the user is moving a window
        if (this.config.logEventsInteractiveResize) {
           this.event('interactiveMoveResizeStepped ' + client)
        }
        try{
            this.showMovingOutline()
        }catch (e){
            this.logger.error(`Error in showMovingOutline: ${e}`)
        }
    };
    public interactiveMoveResizeFinished(client: AbstractClient): void{
        this.event(`interactiveMoveResizeFinished ${clientToString(client)} : ${client.output.name}`)
        this.engine.interactiveMoveResizeFinished(client, workspace.cursorPos);
    };

    public outputChanged(client: AbstractClient) {
        // When the user is moving a window (clientStepUserMovedResized) to another screen, the screenChanged event is triggered.
        // We need to skip it, otherwise the window will be re-tiled even if the user did not complete the move (clientFinishUserMovedResizedListener)
        this.event(`> outputChanged ${clientToString(client)}: ${client.output.name}`);
        this.engine.layoutModified(client.output);
    }

    /**
     * Add listeners and tile new client
     */
    private attachClient(client: AbstractClient){
        this.event(`> attachClient: ${clientToString(client)}`);

        this.minimizedChangedHandlers.set(client, () => this.minimizedChanged(client));
        client.minimizedChanged.connect(this.minimizedChangedHandlers.get(client)!);

        this.outputChangedHandlers.set(client, () => this.outputChanged(client))
        client.outputChanged.connect( this.outputChangedHandlers.get(client)!);

        this.interactiveMoveResizeFinishedHandlers.set(client, () => this.interactiveMoveResizeFinished(client));
        client.interactiveMoveResizeFinished.connect(this.interactiveMoveResizeFinishedHandlers.get(client)!);

        this.interactiveMoveResizeSteppedHandlers.set(client, () => this.interactiveMoveResizeStepped(client));
        client.interactiveMoveResizeStepped.connect(this.interactiveMoveResizeSteppedHandlers.get(client)!);

        this.desktopChangedHandlers.set(client, () => this.desktopChanged(client));
        client.desktopsChanged.connect(this.desktopChangedHandlers.get(client)!);

        this.engine.attachClient(client);
    }


    private detachClient(client: AbstractClient){
        this.event(`> detachClient ${clientToString(client)}`);

        client.outputChanged.disconnect(this.outputChangedHandlers.get(client)?? (() => {}));
        this.outputChangedHandlers.delete(client)

        client.minimizedChanged.disconnect(this.minimizedChangedHandlers.get(client) ?? (() => {}));
        this.minimizedChangedHandlers.delete(client)

        client.interactiveMoveResizeFinished.disconnect(this.interactiveMoveResizeFinishedHandlers.get(client) ?? (() => {}));
        this.interactiveMoveResizeFinishedHandlers.delete(client)


        client.interactiveMoveResizeStepped.disconnect(this.interactiveMoveResizeSteppedHandlers.get(client) ?? (() => {}));
        this.interactiveMoveResizeSteppedHandlers.delete(client)

        client.desktopsChanged.disconnect(this.desktopChangedHandlers.get(client) ?? (() => {}));
        this.desktopChangedHandlers.delete(client)


        if(this.lastWindowActivated === client){
            this.lastWindowActivated = null;
        }

        this.engine.detachClient(client)
    }

    /**
     * Log an event if the option is enabled
     */
    private event(message: string) {
        if(!this.config.logEvents){
            return
        }
        this.logger.error(`> Event ${message}`);
    }

    public toString(){
        return 'Tiler'
    }

    private showMovingOutline() {
        if(!this.config.doShowOutline){
            return
        }
        const client: AbstractClient = workspace.activeWindow!
        // Calculate the outline geometry
        const position = workspace.cursorPos;

        // If you drag to another screen, client.output is not always updated. So we do the calculation instead.
        const currentScreen: Output = workspace.screens.filter((screen) => {
            return screen.geometry.x <= position.x &&
                position.x <= screen.geometry.x + screen.geometry.width &&
                screen.geometry.y <= position.y &&
                position.y <= screen.geometry.y + screen.geometry.height;
        }).pop() ?? client.output;
        const tile = workspace.tilingForScreen(currentScreen.name)?.bestTileForPosition(position.x, position.y)
        let outlineGeometry = tile ? tile.absoluteGeometry : null;

        // If we have more than one window on the screen, show the outline maximized
        const numberOfOtherTiledWindows = getTiledClientsOnOutput(currentScreen).filter((otherClient: AbstractClient) => otherClient !== client).length;
        const numberOfOtherUnTiledWindows = getUntiledClientOnOutput(currentScreen).filter((otherClient: AbstractClient) => otherClient !== client).length;

        if(numberOfOtherTiledWindows + numberOfOtherUnTiledWindows === 0 && this.config.doMaximizeSingleWindow){
            outlineGeometry = padGeometry(this.config, workspace.clientArea(KWin.MaximizeArea, currentScreen, workspace.currentDesktop), currentScreen.name);
        }

        if(outlineGeometry !== null){
            // Show the outline, note that we have no way to set the "outline visualParentGeometry" so no animation is shown
            // A "TypeError exception" is thrown if the outlineGeometry object is altered, so the padding is not supported.
            workspace.showOutline(outlineGeometry);
        }
    }

    private desktopChanged(client: AbstractClient) {
        this.engine.layoutModified(client.output);
    }
}
