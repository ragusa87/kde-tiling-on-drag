/* eslint-disable  @typescript-eslint/no-explicit-any */
import {LogLevel} from "./logLevel";

function log(level: LogLevel, ...value: any){
    if(level === LogLevel.DEBUG) {
        console.log(value);
        return;
    }
    if(level === LogLevel.INFO) {
        console.info(value);
        return;
    }
    if(level === LogLevel.WARNING) {
        console.warn(value);
        return;
    }
    if(level === LogLevel.ALERT) {
        console.warn("Alert: ", value);
        return;
    }
    if(level === LogLevel.NOTICE) {
        console.warn("Notice: ", value);
        return;
    }
    if(level === LogLevel.EMERGENCY) {
        console.warn("EMERGENCY: ", value);
        return;
    }
    if(level === LogLevel.CRITICAL) {
        console.warn("CRITICAL: ", value);
        return;
    }
    if(level === LogLevel.ERROR) {
        console.error(value);
        return;
    }

    console.log("Unknown log level: ", level, value);
}


// Inspired by https://www.php-fig.org/psr/psr-3/
type consoleContext = {[key:string]:any}
interface LoggerInterface
{
    debug(message: string, context: consoleContext): void
    info(message: string, context: consoleContext): void
    warn(message: string, context: consoleContext): void
    alert(message: string, context: consoleContext): void
    notice(message: string, context: consoleContext): void
    emergency(message: string, context: consoleContext): void
    critical(message: string, context: consoleContext): void
    error(message: string, context: consoleContext): void
    log(level: LogLevel, message: string, context: consoleContext): void
}


export class Console implements LoggerInterface{

    minLevel: LogLevel;
    constructor(min: LogLevel = LogLevel.DEBUG) {
        this.minLevel = min;
    }

    debug(message: string, context: consoleContext = {}) {
        this.log(LogLevel.DEBUG, message, context);
    }

    info(message: string, context: consoleContext = {}) {
        this.log(LogLevel.INFO , message, context);
    }

    warn(message: string, context: consoleContext = {}) {
        this.log(LogLevel.WARNING, message, context);
    }

    alert(message: string, context: consoleContext = {}) {
        this.log(LogLevel.ALERT, message, context);
    }

    notice(message: string, context: consoleContext = {}) {
        this.log(LogLevel.NOTICE, message, context);
    }

    emergency(message: string, context: consoleContext = {}) {
        this.log(LogLevel.EMERGENCY, message, context);
    }

    critical(message: string, context: consoleContext = {}) {
        this.log(LogLevel.CRITICAL, message, context);
    }

    error(message: string, context: consoleContext = {}) {
        this.log(LogLevel.ERROR, message, context);
    }

    log(level: LogLevel, message: string, context: consoleContext = {}) {
        if(level > this.minLevel){
            return;
        }

        // Replace placeholders {} in message
        message = message.replace(/{\w+}/g, function(key: string) {
            return Object.prototype.hasOwnProperty.call(context, key) ? context[key] : key;
        });

        log(level, message, context);
    }
}

