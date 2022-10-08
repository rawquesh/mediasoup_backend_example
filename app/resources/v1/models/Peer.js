const mongoose = require('mongoose');
const deepPopulate = require('mongoose-deep-populate')(mongoose);
const softDelete = require('mongoose-delete');
const castAggregation = require('mongoose-cast-aggregation');

const Schema = mongoose.Schema;

const schema = new Schema({
  _id: String,
  room: {
    type: String,
    ref: 'rooms',
    index: true
  },
  serverIp: String,
  serverPort: Number,
  ecsTaskId: String,
  producers: [String],
  consumers: [String],
  transports: [String],
  connected: Boolean,
  deleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: Date
},
{
  timestamps: true
});

schema.plugin(castAggregation);
schema.plugin(deepPopulate);
schema.plugin(softDelete, { overrideMethods: true });
const Peer = mongoose.model('peers', schema);

module.exports = Peer;
