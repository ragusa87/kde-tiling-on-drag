import {Point} from './shortcuts';

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
    return `${tile.toString()} - ${tile.parent ? tile.parent.toString() : 'no parent'}`
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
