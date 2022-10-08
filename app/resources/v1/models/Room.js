const mongoose = require('mongoose');
const deepPopulate = require('mongoose-deep-populate')(mongoose);
const softDelete = require('mongoose-delete');
const castAggregation = require('mongoose-cast-aggregation');

const Schema = mongoose.Schema;
const ObjectId = Schema.ObjectId;

const schema = new Schema({
  _id: String,
  routerId: {
    type: String
  },
  peers: [String],
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
const Room = mongoose.model('rooms', schema);

module.exports = Room;
