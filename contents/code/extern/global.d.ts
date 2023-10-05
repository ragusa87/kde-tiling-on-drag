// Copyright (c) 2018 Eon S. Jeon <esjeon@hyunmu.am>
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the "Software"),
// to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense,
// and/or sell copies of the Software, and to permit persons to whom the
// Software is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL
// THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.


declare interface Signal<T> {
    connect(callback: T): void;
    disconnect(callback: T): void;
}

declare interface QSignal {
    connect(callback: any): void;
    disconnect(callback: any): void;
}

interface QTimer {
    timeout: QSignal;
    start(durationMs: number): void;
    stop(): void;
}

/* Common Javascript globals */


// QJSEngine::ConsoleExtension https://doc.qt.io/qt-5/qjsengine.html#ConsoleExtension-enum
interface Console {
    assert(condition?: boolean, ...data: any[]): void;
    debug(...data: any[]): void;
    exception(message?: string, ...optionalParams: any[]): void;
    info(...data: any[]): void;
    log(...data: any[]): void;
    error(...data: any[]): void;
    time(label?: string): void;
    timeEnd(label?: string): void;
    trace(...data: any[]): void;
    count(label?: string): void;
    warn(...data: any[]): void;
    print(...data: any[]): void;
}


declare let QTimer:  QQmlTimer;

/* KWin global objects */
declare let console: Console;
declare var workspace: WorkspaceWrapper;
declare var KWin: KWinEnums;
