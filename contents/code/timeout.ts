
export function setTimeout (callback: () => void, duration: number): QTimerInterface{
    // QTimer is exposed by KWIN/QT, so it exists anyway.
    const timer: QTimerInterface = new QTimer();
    timer.singleShot = true;
    timer.timeout.connect(callback);
    timer.start(duration);

    return timer;
}

export function cancelTimeout(timer: QTimerInterface): void{
    timer.stop();
}