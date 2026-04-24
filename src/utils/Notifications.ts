export class Notifications {

    static info(message: string): void {
        ui.notifications?.info(message);
    }

    static warn(message: string): void {
        ui.notifications?.warn(message);
    }

    static error(message: string): void {
        ui.notifications?.error(message);
    }
}
