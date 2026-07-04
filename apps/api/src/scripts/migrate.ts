import { getDb } from '../db';

if (require.main === module) {
  getDb();
  console.log('Migrations applied successfully.');
}
