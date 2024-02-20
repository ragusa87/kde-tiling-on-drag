import {clientToString, isSameActivityAndDesktop, isSupportedClient} from "./clientHelper";
import {Console} from "./logger";
import {LogLevel} from "./logLevel";

export class Point implements QPoint {
    x: number;
    y: number;
    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }
    toString(): string {
        return "GtQPoint(" + this.x + ", " + this.y + ")";
    }
}

const point = (x: number, y: number): QPoint => new Point(x, y);
enum Direction {
    Up = "Up",
    Down = "Down",
    Left = "Left",
    Right = "Right",
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
            this.addShortcut(new Shortcuts("ApiTilingFocus" + direction, "ApiTiling: Focus window on " + direction, "Meta+" + direction, () => {
                this.focusClientInDirection(direction);
            }));
            this.addShortcut(new Shortcuts("ApiTilingMove" + direction, "ApiTiling: Move window to " + direction, "Meta+Shift+" + direction, () => {
                this.moveClientInDirection(direction);
            }));
        }
    }

    protected focusClientInDirection(direction: Direction){
        this.logger.error(`Focus to ${direction.toString()} of ${clientToString(workspace.activeClient)} on screen ${workspace.activeScreen}`)

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
        this.logger.debug(`Focusing.. ${clientToString(client)}. Alternative clients: ${clients.map((client: AbstractClient) => clientToString(client)).join(", ")}`)

        workspace.activeClient = client
    }

    protected getActiveClient() {
        return workspace.activeClient;
    }

    public getClientsInDirection(direction: Direction, screenNumber: number|undefined = undefined, geometry: QRect|undefined = undefined, attempts: number = 0): AbstractClient[]{
        screenNumber = screenNumber ?? workspace.activeScreen;
        geometry = geometry ?? this.getActiveClient()?.geometry
        const clients = workspace.clientList()
            .filter(isSupportedClient)
            .filter(client => client.screen === screenNumber)
            .filter(isSameActivityAndDesktop)
            .filter((client: AbstractClient) => client !== this.getActiveClient() && !client.minimized)
            .filter((client: AbstractClient) => {
                const x =  geometry?.x
                const y =  geometry?.y

                if(y === undefined || x === undefined) {
                    return false;
                }

                return (direction === Direction.Up && client.geometry.y < y)
                    || (direction === Direction.Down && client.geometry.y > y)
                    || (direction === Direction.Left && client.geometry.x < x)
                    || (direction === Direction.Right && client.geometry.x > x)
        });

        function nextTo(clients: AbstractClient[], compareFn: (client1: AbstractClient, client2: AbstractClient) => number) {
            return clients.sort(compareFn).reverse().shift(); // As we sort by direction, we want the closest element, not the farthest, so we reverse the array
        }

        let client: AbstractClient | undefined;
        switch (direction) {
            case Direction.Up:
                client = nextTo(clients, (client1: AbstractClient, client2: AbstractClient) => client1.geometry.y - client2.geometry.y);
                break;
            case Direction.Down:
                client = nextTo(clients, (client1: AbstractClient, client2: AbstractClient) => client2.geometry.y - client1.geometry.y);
                break;
            case Direction.Left:
                client = nextTo(clients, (client1: AbstractClient, client2: AbstractClient) => client1.geometry.x - client2.geometry.x);
                break;
            case Direction.Right:
                client = nextTo(clients, (client1: AbstractClient, client2: AbstractClient) => client2.geometry.x - client1.geometry.x);
                break;
            }

        console.log("client on direction " + direction)

        // Find client in another screen
        if(client === undefined && (workspace.numScreens > 1 || workspace.clientList().length > 1) && attempts < 2) {
            const nextScreen = this.getScreenNumberInDirection(direction);
            const rect = workspace.clientArea(KWin.MaximizeArea, nextScreen, this.getActiveClient()?.desktop ?? 0)
            return this.getClientsInDirection(direction, nextScreen, rect, ++attempts);
        }

        return client ? [client] : [];
    }


    protected isSameActivityAndDesktop = function (client: AbstractClient):boolean {
        return isSameActivityAndDesktop(client);
    };
    protected swapClient(client1: AbstractClient, client2: AbstractClient){
        if(client1 === client2){
            this.logger.debug("Clients are the same, no need to swap them")
            return;
        }
        this.logger.debug(`Swapping ${clientToString(client1)} with ${clientToString(client2)}`)
        const tile = client1.tile
        client1.tile = client2.tile;
        client2.tile = tile;
    }


    public getTilesInDirection(direction: Direction, useAlternatives: boolean = true): Tile[] {
        const activeClient = this.getActiveClient();
        if (activeClient === null) {
            this.logger.warn(`No active client`)
            return [];
        }
        const point = this.getPointInDirection(direction);
        if (point === null) {
            this.logger.warn(`No point on the direction ${direction} of active client`)
            return [];
        }

        this.logger.debug(`Active client: ${activeClient.resourceClass} ${activeClient.geometry.toString()}`)
        this.logger.debug(`Point: ${point.toString()}`)
        this.logger.debug(`Tile: ${activeClient.tile?.toString()}`)


        const tile = workspace.tilingForScreen( activeClient.screen).bestTileForPosition(point.x, point.y);
        let response = tile !== null && tile !== activeClient.tile ? [tile] : [];
        if(useAlternatives) {
            response.push(...this.getBestTilesFromAnotherScreen(direction))
            response = response.filter((tile: Tile) => tile !== activeClient.tile);
        }
        this.logger.debug(`Tiles in direction ${direction} ${response.map((tile: Tile) => tile.toString()).join(", ")}`)
        return response;
    }

    protected getScreensInDirection(direction: Direction): {screen: number}[]{
        this.logger.debug(`Finding tile in another screen for direction : ${direction}`);
        for(let i = 0; i < workspace.numScreens; i++) {
            const geometry = workspace.clientArea(KWin.MaximizeArea, i, this.getActiveClient()?.desktop ?? 0)
            this.logger.debug(`Screen ${i} > ${geometry.toString()}`)
        }

        const point = this.getPointInDirection(direction)
        if(point === null){
            this.logger.warn(`No point on the direction ${direction}`)
            return [];
        }

        const response = [];
        for(let i = 0; i < workspace.numScreens; i++){
            // Skip active screen
            if(workspace.activeScreen === i){
                continue;
            }

            if(workspace.activeClient !== null && this.geometryContains(i, workspace.activeClient, direction)) {
                response.push({screen: i});
            }
        }
        return response;
    }

    protected getPointInDirection(direction: Direction): QPoint | null{
        const activeClient = this.getActiveClient();
        if(activeClient === null){
            this.logger.warn(`No active client`)
            return null;
        }
        const geometry = activeClient.frameGeometry;


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
        const activeClient = this.getActiveClient();
        if(activeClient === null){
            this.logger.error("No active client")
            return;
        }

        this.logger.error("Move " + clientToString(activeClient) + " to " + direction.toString() + " - screen " + workspace.activeScreen);

        const tiles = this.getTilesInDirection(direction, false);
        if(tiles.length  === 0){
            this.logger.debug(`No tiles in direction ${direction}. Try to send to another screen`)
            for(let i = 0; i < workspace.numScreens; i++) {
                if(i === activeClient.screen){
                    continue
                }
                if(this.geometryContains(i, activeClient, direction)){
                    this.logger.warn(`Moving client ${clientToString(activeClient)} to screen ${i}`)
                    //activeClient.tile = null;
                    workspace.sendClientToScreen(activeClient, i);
                    return;
                }
            }
            this.logger.warn(`No screen found in direction ${direction}`)

            switch (direction) {
                case Direction.Up:
                    activeClient.tile = null;
                    workspace.slotWindowQuickTileTop()
                    break
                case Direction.Down:
                    activeClient.tile = null;
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
        const windows = tile.windows.filter((client: AbstractClient) => client !== activeClient).filter((client: AbstractClient) => isSupportedClient(client) && this.isSameActivityAndDesktop(client) && !client.minimized);
        if(windows.length > 0) {
            this.swapClient(activeClient, windows[0]);
            return;
        }

        this.logger.debug(`Moving client ${clientToString(activeClient)} to ${tile.toString()}`)
        activeClient.tile = tile;
        tile.windows.push(activeClient);

    }

    private geometryContains(screenNumber: number, client: AbstractClient, direction: Direction) : boolean {
        const screenClientArea = workspace.clientArea(KWin.MaximizeArea, client.screen, client.desktop)
        const screenNumberArea = workspace.clientArea(KWin.MaximizeArea, screenNumber, client.desktop)
        this.logger.debug(`Checking if screen ${screenNumber} is on ${direction} from screen ${client.screen} : ${screenNumberArea.toString()} -> ${screenClientArea.toString()}`);
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
        this.logger.debug(`Screen ${screenNumber}  ${response ? "match" : "doesn't match"} direction ${direction}`)
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
            const geometry = workspace.clientArea(KWin.MaximizeArea, screenInfo.screen, this.getActiveClient()?.desktop ?? 0)
            const tile = workspace.tilingForScreen(screenInfo.screen).bestTileForPosition(geometry.x, geometry.y)
            if(tile !== null){
                this.logger.debug(`Tile found in screen ${screenInfo.screen} ${tile.toString()}`)
                response.push(tile);
            }

            const alternatives = workspace.tilingForScreen(screenInfo.screen).rootTile?.tiles.filter((tile: Tile) => tile !== null).filter((tile) => !response.includes(tile)) ?? [];
            if(alternatives.length > 0) {
                this.logger.debug(`Alternative tiles found in screen ${screenInfo.screen} : ${alternatives?.map((tile: Tile) => tile.toString()).join(", ")}`)
                response.push(...alternatives);
            }
        });

        return response.filter((tile: Tile) => tile !== null);
    }

    private getScreenNumberInDirection(direction: Direction.Up | Direction.Down | Direction.Left | Direction.Right) {
        const nextScreen = (workspace.activeScreen + 1) % workspace.numScreens;
        const geom = workspace.activeClient?.geometry
        if(geom === undefined){
            return nextScreen;
        }

        const delta = 5;
        switch (direction) {
            case Direction.Up:
                return workspace.screenAt(new Point(geom.x, geom.y - delta)) || nextScreen;
            case Direction.Down:
                return workspace.screenAt(new Point(geom.x, geom.y + geom.height + delta)) || nextScreen;
            case Direction.Left:
                return workspace.screenAt(new Point(geom.x - delta, geom.y)) || nextScreen;
            case Direction.Right:
                return workspace.screenAt(new Point(geom.x + geom.width + delta, geom.y)) || nextScreen;
        }


    }
}