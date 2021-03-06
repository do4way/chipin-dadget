declare module "@chip-in/resource-node" {
    import * as http from "http";

    export class Logger {
        category: string;
        debug(msg: string, ...substN: Array<string | number>): void;
        info(msg: string, ...substN: Array<string | number>): void;
        warn(msg: string, ...substN: Array<string | number>): void;
        error(msg: string, ...substN: Array<string | number>): void;
    }

    interface ServiceEngineConstructor {
        new(option?: {}): ServiceEngine;
    }

    export class ResourceNode {
        coreNodeURL: string;
        isConnected: boolean;
//        logger: Logger;
        mqttConnections: {};
        nodeClassName: string;
        password: string;
        proxies: {};
        serviceClasses: object;
        serviceInstances: ServiceEngine[];
        sessionTable: {};
        started: boolean;
        userId: string;

        constructor(coreNodeURL: string, nodeClassName: string)
        fetch(path: string, option?: {}): Promise<Response>;
        mount(path: string, mode: string, proxy: Proxy, option?: object): Promise<string>;
        publish(topicName: string, message: string): Promise<void>;
        registerServiceClasses(mapping: { [key: string]: ServiceEngineConstructor }): void;
        searchServiceEngine(serviceClassName: string, query: { [key: string]: any }): ServiceEngine[];
        setBasicAuthorization(userid: string, password: string): void;
        start(): Promise<any>;
        stop(): Promise<void>;
        subscribe(topicName: string, subscriber: Subscriber): Promise<string>;
        unmount(handle: string): Promise<void>;
        unsubscribe(key: string): Promise<void>;
        setJWTAuthorization(jwt: string, updatePath: string): void;
    }

    export abstract class Proxy {
//        logger: Logger;
        constructor()
        abstract onReceive(req: http.IncomingMessage, res: http.ServerResponse): Promise<http.ServerResponse>;
    }

    export abstract class ServiceEngine {
//        logger: Logger;
        constructor(option?: {})
        abstract start(node: ResourceNode): Promise<void>;
        abstract stop(node: ResourceNode): Promise<void>;
    }

    export abstract class Subscriber {
//        logger: Logger;
        constructor()
        abstract onReceive(msg: string): void;
    }
}
