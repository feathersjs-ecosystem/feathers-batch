import feathers from '@feathersjs/feathers';
import { BatchService } from 'feathers-batch';
import { batchClient } from 'index';

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
