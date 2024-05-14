import {clientToString, isSameActivityAndDesktop, isSupportedClient, point} from './clientHelper';
import {Console} from './logger';
import {LogLevel} from './logLevel';

export class Point implements QPoint {
    x: number;
    y: number;
    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }
    toString(): string {
        return 'GtQPoint(' + this.x + ', ' + this.y + ')';
    }
}

enum Direction {
    Up = 'Up',
    Down = 'Down',
    Left = 'Left',
    Right = 'Right',
}
class Shortcuts{

    name: string
    description: string
    shortcut: string
    callback: () => void | null
    public constructor(name: string, description: string, shortcut: string, callback: () => void | null){
        this.name = name;
        this.description = description;
        this.shortcut = shortcut;
        this.callback = callback;
    }
}

export class ShortcutManager{
    private shortcuts: Map<string, Shortcuts> = new Map<string, Shortcuts>();
    logger: Console

    public constructor(){
        this.logger = new Console(LogLevel.WARNING)

        for(const directionKey of (Object.keys(Direction) as (keyof typeof Direction)[])){
            const direction = Direction[directionKey]
            this.addShortcut(new Shortcuts('ApiTilingFocus' + direction, 'ApiTiling: Focus window on ' + direction, 'Meta+' + direction, () => {
                this.focusClientInDirection(direction);
            }));
            this.addShortcut(new Shortcuts('ApiTilingMove' + direction, 'ApiTiling: Move window to ' + direction, 'Meta+Shift+' + direction, () => {
                this.moveClientInDirection(direction);
            }));
        }
    }

    protected focusClientInDirection(direction: Direction){
        this.logger.error(`Focus to ${direction.toString()} of ${clientToString(workspace.activeWindow)} on screen ${workspace.activeScreen}`)

        const clients = this.getClientsInDirection(direction);
        if(clients.length === 0){
            this.logger.debug(`No clients in direction ${direction.toString()}`)
            return;
        }
        const client = clients.pop();
        if(client === undefined){
            this.logger.warn(`No client found in direction ${direction}`)
            return;
        }
        this.logger.debug(`Focusing.. ${clientToString(client)}. Alternative clients: ${clients.map((client: AbstractClient) => clientToString(client)).join(', ')}`)

        workspace.activeWindow = client
    }

    protected getactiveWindow() {
        return workspace.activeWindow;
    }

    public getClientsInDirection(direction: Direction, myOutput: Output|undefined = undefined, geometry: QRect|undefined = undefined, attempts: number = 0): AbstractClient[]{
        const output = myOutput ?? workspace.activeScreen;
        if(output === null || output === undefined){
            console.warn('No output found')
            return [];
        }
        geometry = geometry ?? this.getactiveWindow()?.clientGeometry
        const clients = workspace.windowList()
            .filter(isSupportedClient)
            .filter(client => client.output.name === output.name)
            .filter(isSameActivityAndDesktop)
            .filter((client: AbstractClient) => client !== this.getactiveWindow() && !client.minimized)
            .filter((client: AbstractClient) => {
                const x =  geometry?.x
                const y =  geometry?.y

                if(y === undefined || x === undefined) {
                    return false;
                }

                return (direction === Direction.Up && client.clientGeometry.y < y)
                    || (direction === Direction.Down && client.clientGeometry.y > y)
                    || (direction === Direction.Left && client.clientGeometry.x < x)
                    || (direction === Direction.Right && client.clientGeometry.x > x)
        });

        function nextTo(clients: AbstractClient[], compareFn: (client1: AbstractClient, client2: AbstractClient) => number) {
            return clients.sort(compareFn).reverse().shift(); // As we sort by direction, we want the closest element, not the farthest, so we reverse the array
        }

        let client: AbstractClient | undefined;
        switch (direction) {
            case Direction.Up:
                client = nextTo(clients, (client1: AbstractClient, client2: AbstractClient) => client1.clientGeometry.y - client2.clientGeometry.y);
                break;
            case Direction.Down:
                client = nextTo(clients, (client1: AbstractClient, client2: AbstractClient) => client2.clientGeometry.y - client1.clientGeometry.y);
                break;
            case Direction.Left:
                client = nextTo(clients, (client1: AbstractClient, client2: AbstractClient) => client1.clientGeometry.x - client2.clientGeometry.x);
                break;
            case Direction.Right:
                client = nextTo(clients, (client1: AbstractClient, client2: AbstractClient) => client2.clientGeometry.x - client1.clientGeometry.x);
                break;
            }

        console.log('client on direction ' + direction)

        // Find client in another screen
        if(client === undefined && (workspace.screens.length > 1 || workspace.windowList().length > 1) && attempts < 2) {
            const nextScreen = this.getScreenNumberInDirection(direction);
            const rect = workspace.clientArea(KWin.MaximizeArea, nextScreen, workspace.currentDesktop)
            return this.getClientsInDirection(direction, nextScreen, rect, ++attempts);
        }

        return client ? [client] : [];
    }


    protected isSameActivityAndDesktop = function (client: AbstractClient):boolean {
        return isSameActivityAndDesktop(client);
    };
    protected swapClient(client1: AbstractClient, client2: AbstractClient){
        if(client1 === client2){
            this.logger.debug('Clients are the same, no need to swap them')
            return;
        }
        this.logger.debug(`Swapping ${clientToString(client1)} with ${clientToString(client2)}`)
        const tile = client1.tile
        client1.tile = client2.tile;
        client2.tile = tile;
    }


    public getTilesInDirection(direction: Direction, useAlternatives: boolean = true): Tile[] {
        const activeWindow = this.getactiveWindow();
        if (activeWindow === null) {
            this.logger.warn('No active client')
            return [];
        }
        const point = this.getPointInDirection(direction);
        if (point === null) {
            this.logger.warn(`No point on the direction ${direction} of active client`)
            return [];
        }

        this.logger.debug(`Active client: ${activeWindow.resourceClass} ${activeWindow.clientGeometry.toString()}`)
        this.logger.debug(`Point: ${point.toString()}`)
        this.logger.debug(`Tile: ${activeWindow.tile?.toString()}`)


        const tile = workspace.tilingForScreen( activeWindow.output.name).bestTileForPosition(point.x, point.y);
        let response = tile !== null && tile !== activeWindow.tile ? [tile] : [];
        if(useAlternatives) {
            response.push(...this.getBestTilesFromAnotherScreen(direction))
            response = response.filter((tile: Tile) => tile !== activeWindow.tile);
        }
        this.logger.debug(`Tiles in direction ${direction} ${response.map((tile: Tile) => tile.toString()).join(', ')}`)
        return response;
    }

    protected getScreensInDirection(direction: Direction): {screen: string}[]{
        this.logger.debug(`Finding tile in another screen for direction : ${direction}`);
        workspace.screens.forEach((screen) => {
            const geometry = workspace.clientArea(KWin.MaximizeArea, screen, workspace.currentDesktop)
            this.logger.debug(`Screen ${screen.name} > ${geometry.toString()}`)
        })

        const point = this.getPointInDirection(direction)
        if(point === null){
            this.logger.warn(`No point on the direction ${direction}`)
            return [];
        }
        type ScreenInfo = {screen: string}
        const response: ScreenInfo[] = []
        workspace.screens.forEach((screen) => {
            // Skip active screen
            if(workspace.activeScreen.name === screen.name){
                return;
            }

            if(workspace.activeWindow !== null && this.geometryContains(screen.name, workspace.activeWindow, direction)) {
                response.push({screen: screen.name});
            }
        });
        return response;
    }

    protected getPointInDirection(direction: Direction): QPoint | null{
        const activeWindow = this.getactiveWindow();
        if(activeWindow === null){
            this.logger.warn('No active client')
            return null;
        }
        const geometry = activeWindow.frameGeometry;


        const increment = 10; // TODO Use padding as increment ?
        switch (direction) {
            case Direction.Up:
                return point(geometry.x , geometry.y - increment);
            case Direction.Down:
                return point(geometry.x, geometry.y + geometry.height + increment);
            case Direction.Left:
                return point(geometry.x - increment, geometry.y);
            case Direction.Right:
                return point(geometry.x + increment + geometry.width, geometry.y);
        }

    }

    protected addShortcut(shortcuts: Shortcuts): void{
        this.shortcuts.set(shortcuts.name, shortcuts);
    }

    public setShortcut(name: string, callback: () => void | null): void{
        if(!this.shortcuts.has(name)) {
            throw new Error(`Shortcut ${name} not found`);
        }

        const shortcut = this.shortcuts.get(name)
        if(shortcut == undefined){
            throw new Error(`Shortcut ${name} not found`);
        }

        shortcut.callback = callback;
    }

    public apply(): void{
        this.shortcuts.forEach((shortcut: Shortcuts) => {
            registerShortcut(shortcut.name, shortcut.description, shortcut.shortcut, shortcut.callback);
        });
    }

    private moveClientInDirection(direction: Direction) {
        const activeWindow = this.getactiveWindow();
        if(activeWindow === null){
            this.logger.error('No active client')
            return;
        }

        this.logger.error('Move ' + clientToString(activeWindow) + ' to ' + direction.toString() + ' - screen ' + workspace.activeScreen);

        const tiles = this.getTilesInDirection(direction, false);
        if(tiles.length  === 0){
            this.logger.debug(`No tiles in direction ${direction}. Try to send to another screen`)
            workspace.screens.forEach(i => {
                if(i.name === activeWindow.output.name){
                    return
                }
                if(this.geometryContains(i.name, activeWindow, direction)){
                    this.logger.warn(`Moving client ${clientToString(activeWindow)} to screen ${i}`)
                    //activeWindow.tile = null;
                    workspace.sendClientToScreen(activeWindow, i.name);
                    return;
                }
            })
            this.logger.warn(`No screen found in direction ${direction}`)

            switch (direction) {
                case Direction.Up:
                    activeWindow.tile = null;
                    workspace.slotWindowQuickTileTop()
                    break
                case Direction.Down:
                    activeWindow.tile = null;
                    workspace.slotWindowQuickTileBottom()
                    break;
                case Direction.Left:
                    workspace.slotWindowQuickTileLeft()
                    break;
                case Direction.Right:
                    workspace.slotWindowQuickTileRight()
                    break;
            }
            return;
        }

        const tile = tiles[0];
        const windows = tile.windows.filter((client: AbstractClient) => client !== activeWindow).filter((client: AbstractClient) => isSupportedClient(client) && this.isSameActivityAndDesktop(client) && !client.minimized);
        if(windows.length > 0) {
            this.swapClient(activeWindow, windows[0]);
            return;
        }

        this.logger.debug(`Moving client ${clientToString(activeWindow)} to ${tile.toString()}`)
        activeWindow.tile = tile;
        tile.windows.push(activeWindow);

    }

    private geometryContains(screenName: string, client: AbstractClient, direction: Direction) : boolean {
        const screenClientArea = workspace.clientArea(KWin.MaximizeArea, client.output, workspace.currentDesktop)
        const screenNumberArea = workspace.clientArea(KWin.MaximizeArea, workspace.screens.filter((output) => output.name === screenName )[0], workspace.currentDesktop)
        this.logger.debug(`Checking if screen ${screenName} is on ${direction} from screen ${client.output.name} : ${screenNumberArea.toString()} -> ${screenClientArea.toString()}`);
        let response = false;
        switch (direction) {
            case Direction.Up:
                response = screenClientArea.y > screenNumberArea.y;
                break;
            case Direction.Down:
                response = screenClientArea.y < screenNumberArea.y;
                break;
            case Direction.Left:
                response = screenClientArea.x >= screenNumberArea.x + screenNumberArea.width;
                break;
            case Direction.Right:
                response = screenClientArea.x <= screenNumberArea.x;
                break;
        }
        this.logger.debug(`Screen ${screenName}  ${response ? 'match' : 'doesn\'t match'} direction ${direction}`)
        return response;
    }



    private getBestTilesFromAnotherScreen(direction: Direction): Tile[] {
        const screenInfos = this.getScreensInDirection(direction);
        if(screenInfos.length == 0){
            this.logger.warn(`No screen in direction ${direction}`)
            return [];
        }
        this.logger.debug(`${screenInfos.length} screen(s) in direction ${direction}`)
        const response: Tile[] = [];

        screenInfos.forEach((screenInfo) => {
            if(workspace.activeWindow === null){
                return;
            }
            const geometry = workspace.clientArea(KWin.MaximizeArea, workspace.activeWindow)
            const tile = workspace.tilingForScreen(screenInfo.screen).bestTileForPosition(geometry.x, geometry.y)
            if(tile !== null){
                this.logger.debug(`Tile found in screen ${screenInfo.screen} ${tile.toString()}`)
                response.push(tile);
            }

            const alternatives = workspace.tilingForScreen(screenInfo.screen).rootTile?.tiles.filter((tile: Tile) => tile !== null).filter((tile) => !response.includes(tile)) ?? [];
            if(alternatives.length > 0) {
                this.logger.debug(`Alternative tiles found in screen ${screenInfo.screen} : ${alternatives?.map((tile: Tile) => tile.toString()).join(', ')}`)
                response.push(...alternatives);
            }
        });

        return response.filter((tile: Tile) => tile !== null);
    }

    private getScreenNumberInDirection(direction: Direction.Up | Direction.Down | Direction.Left | Direction.Right): Output {
        let currentScreenIndex: number = 0;
        workspace.screens.forEach((screen, index) => {
            if(screen === workspace.activeScreen){
                currentScreenIndex = index
            }
        });
        const nextScreen: Output = workspace.screens[(currentScreenIndex + 1) % workspace.screens.length];
        const geom = workspace.activeWindow?.clientGeometry
        if(geom === undefined){
            return nextScreen;
        }

        const delta = 5;
        switch (direction) {
            case Direction.Up:
                return workspace.screenAt(new Point(geom.x, geom.y - delta)) || nextScreen
            case Direction.Down:
                return workspace.screenAt(new Point(geom.x, geom.y + geom.height + delta)) || nextScreen
            case Direction.Left:
                return workspace.screenAt(new Point(geom.x - delta, geom.y)) || nextScreen
            case Direction.Right:
                return workspace.screenAt(new Point(geom.x + geom.width + delta, geom.y)) || nextScreen
        }


    }
}