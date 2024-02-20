import {clientToString} from "./clientHelper";

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
    Above = "Above",
    Below = "Below",
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

    public constructor(){
        this.addShortcut(new Shortcuts("ApiTilingFocusRight", "ApiTiling: Focus Right", "Meta+Right", () => {
            this.focusClientInDirection(Direction.Right);
        }));
        this.addShortcut(new Shortcuts("ApiTilingFocusAbove", "ApiTiling: Focus Above", "Meta+Up", () => {
            this.focusClientInDirection(Direction.Above);
        }));
        this.addShortcut(new Shortcuts("ApiTilingFocusBelow", "ApiTiling: Focus Below", "Meta+Down", () => {
            this.focusClientInDirection(Direction.Below);
        }));
        this.addShortcut(new Shortcuts("ApiTilingFocusLeft", "ApiTiling: Focus Left", "Meta+Left", () => {
            this.focusClientInDirection(Direction.Left);
        }));

        this.addShortcut(new Shortcuts("ApiTilingMoveRight", "ApiTiling: Move Right", "Meta+Shift+Right", () => {
            this.moveClientInDirection(Direction.Right);
        }));
        this.addShortcut(new Shortcuts("ApiTilingMoveAbove", "ApiTiling: Move Above", "Meta+Shift+Up", () => {
            this.moveClientInDirection(Direction.Above);
        }));
        this.addShortcut(new Shortcuts("ApiTilingMoveBelow", "ApiTiling: Move Below", "Meta+Shift+Down", () => {
            this.moveClientInDirection(Direction.Below);
        }));
        this.addShortcut(new Shortcuts("ApiTilingMoveLeft", "ApiTiling: Move Left", "Meta+Shift+Left", () => {
            this.moveClientInDirection(Direction.Left);
        }));
    }

    protected focusClientInDirection(direction: Direction){
        console.log("Focus to " + direction.toString());

        const client = this.getClientInDirection(direction);
        if(client === null){
            console.log("No client in direction " + direction)
            return;
        }
        console.log("Focusing.. " + clientToString(client))

        workspace.activeClient = client
    }

    protected getActiveClient() {
        return workspace.activeClient;
    }

    public getClientInDirection(direction: Direction): AbstractClient|null{
        const tile = this.getTileInDirection(direction);
        if(tile === null){
            return null;
        }
        // TODO Consider ignored windows
        return tile.windows[0] ?? null;
    }

    protected swapClient(client1: AbstractClient, client2: AbstractClient){
        if(client1 === client2){
            console.debug("Clients are the same, no need to swap them")
            return;
        }
        console.debug("Swapping " + clientToString(client1) + " with " + clientToString(client2))
        const tile = client1.tile
        client1.tile = client2.tile;
        client2.tile = tile;
    }


    public getTileInDirection(direction: Direction): Tile|null {
        const activeClient = this.getActiveClient();
        if (activeClient === null) {
            console.warn("No active client")
            return null;
        }
        const point = this.getPointInDirection(direction);
        if (point === null) {
            console.warn("No point on the direction " + direction + " of active client")
            return null;
        }

        console.debug("Active client: " + activeClient.resourceClass +" " + activeClient.geometry.toString())
        console.debug("Point: " + point.toString())


        const tile = workspace.tilingForScreen(activeClient.screen).bestTileForPosition(point.x, point.y);
        if (tile === null) {
            console.warn("No tile on the direction " + direction + " of active client")
            return null;
        }

        console.log("Tile found: " + tile.toString())
        return tile;
    }

    protected getPointInDirection(direction: Direction): QPoint | null{
        const activeClient = this.getActiveClient();
        if(activeClient === null){
            console.warn("No active client")
            return null;
        }
        const geometry = activeClient.frameGeometry;


        const increment = 10; // TODO Use padding as increment ?
        switch (direction) {
            case Direction.Above:
                return point(geometry.x , geometry.y - increment);
            case Direction.Below:
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
            throw new Error("Shortcut " + name + " not found");
        }

        const shortcut = this.shortcuts.get(name)
        if(shortcut == undefined){
            throw new Error("Shortcut "+ name +" not found");
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
            console.warn("No active client")
            return;
        }

        const tile = this.getTileInDirection(direction);
        if(tile === null){
            console.warn("No tile in direction " + direction)
            return;
        }

        const windows = tile.windows.filter((client: AbstractClient) => client !== activeClient);
        if(windows.length > 0) {
            this.swapClient(activeClient, windows[0]);
            return;
        }

        console.log("Moving client " + clientToString(activeClient) + " to " + tile.toString())
        activeClient.tile = tile;
    }
}