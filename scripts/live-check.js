import { createDataService } from '../server/data.js';
const data = await createDataService().get();
if (!data.rows.length || data.mode !== 'live') throw new Error('No live records');
console.log(JSON.stringify({ timestamp: data.timestamp, records: data.rows.length, excluded: data.excluded, stale: data.stale }, null, 2));
