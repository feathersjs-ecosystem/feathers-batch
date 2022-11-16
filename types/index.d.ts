// TypeScript Version: 4.0
import {
  Application,
  HookContext,
  Id,
  Query,
  ServiceMethods
} from '@feathersjs/feathers';

export type BatchCall = [ method: 'find', service: string, query?: Query ] |
  [ method: 'get', service: string, id: Id, query?: Query ] |
  [ method: 'remove', service: string, id: Id, query?: Query ] |
  [ method: 'update', service: string, id: Id, data: any, query?: Query ] |
  [ method: 'patch', service: string, id: Id, data: any, query?: Query ] |
  [ method: 'create', service: string, data: any, query?: Query ];

export interface BatchData {
  calls: BatchCall[];
}

export class BatchService implements Partial<ServiceMethods<any>> {
  constructor(app: Application);
  create(data: BatchData): Promise<any>;
}

export interface BatchClientOptions {
  batchService: string;
  timeout?: number;
  exclude?: string[] | ((context: HookContext) => boolean);
  dedupe?: boolean | ((context: HookContext) => boolean);
}

export interface BatchHookOptions {
  batchService?: string;
  timeout?: number;
  exclude?: string[] | ((context: HookContext) => boolean);
  dedupe?: boolean | ((context: HookContext) => boolean);
}

export function batchClient(options: BatchClientOptions): (app: Application) => void;

export function batchHook(options: BatchHookOptions): (context: HookContext) => void;
