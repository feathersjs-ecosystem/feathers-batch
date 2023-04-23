import { feathers } from '@feathersjs/feathers';
import { BatchService, batchClient } from 'feathers-batch';

const app = feathers();

app.use('/batch', new BatchService(app));

const service: BatchService = app.service('batch');

service.create({
  calls: [
    [ 'find', 'messages', {} ],
    [ 'get', 'user', 1 ]
  ]
});

app.configure(batchClient({
  batchService: 'batch'
}));
