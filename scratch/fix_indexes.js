const mongoose = require('mongoose');

async function fixIndexes() {
  const MONGODB_URI = 'mongodb://localhost:27017/bistai';
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const collection = db.collection('portfolios');
    
    console.log('Current indexes:');
    const indexes = await collection.indexes();
    console.log(indexes);
    
    // Drop the old unique 'name' index if it exists
    try {
      await collection.dropIndex('name_1');
      console.log('Successfully dropped name_1 index');
    } catch (e) {
      console.log('name_1 index not found or already dropped');
    }
    
    console.log('Done!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

fixIndexes();
