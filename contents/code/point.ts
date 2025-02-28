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