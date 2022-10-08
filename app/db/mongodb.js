const mongoose = require('mongoose');

module.exports = () => {
  mongoose.connection.on('connected', () => console.log('Connected to database successfully!'));
  mongoose.connection.on('error', (error) => console.error(error));
  mongoose.connection.on('disconnected', () => console.log('Database is disconneted!'));
  mongoose.connect(process.env.MONGDB_URI, {});
};
