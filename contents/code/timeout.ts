
interface QTimer {
    timeout: QSignal;
    start(durationMs: number): void;
    stop(): void;
}

declare interface QSignal {
    connect(callback: any): void;
    disconnect(callback: any): void;
}

let timers: QTimer[] = [];
export function setTimeout (callback: any, duration: number): number{
    // @ts-ignore QTime is exposed by KWIN/QT, so it exists anyway.
    let timer = new QTimer();
    timers.push(timer);
    timer.singleShot = true;
    timer.timeout.connect(callback);
    timer.start(duration);
    return timers.length -1
}

export function cancelTimeout(timerId: number): boolean{
    if(timers[timerId] === undefined){
        return false;
    }
    timers[timerId].stop();
    return true;
}