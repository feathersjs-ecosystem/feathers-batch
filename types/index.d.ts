// TypeScript Version: 4.0
import { Application, Id, Query, ServiceMethods } from '@feathersjs/feathers';

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
  exclude?: string[];
}

export function batchClient(options: BatchClientOptions): (app: Application) => void;
