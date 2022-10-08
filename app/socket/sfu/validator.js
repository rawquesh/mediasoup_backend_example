const Joi = require('joi');

exports.subscribe = (data) => {
  const schema = Joi.object({
    roomId: Joi.string().required()
  });
  const { value, error } = schema.validate(data);
  if (error) throw error;
  return value;
};

exports.createOrJoinRoom = (data) => {
  const schema = Joi.object({
    peerId: Joi.string().required(),
    roomId: Joi.string().required(),
  });
  const { value, error } = schema.validate(data);
  if (error) throw error;
  return value;
};

exports.createRoom = (data) => {
  const schema = Joi.object({
    peerId: Joi.string().required(),
    roomId: Joi.string().required(),
  });
  const { value, error } = schema.validate(data);
  if (error) throw error;
  return value;
};

exports.joinRoom = (data) => {
  const schema = Joi.object({
    peerId: Joi.string().required(),
    roomId: Joi.string().required(),
  });
  const { value, error } = schema.validate(data);
  if (error) throw error;
  return value;
};

exports.leaveRoom = (data) => {
  const schema = Joi.object({
    peerId: Joi.string().required()
  });
  const { value, error } = schema.validate(data);
  if (error) throw error;
  return value;
};

exports.createWebRtcTransport = (data) => {
  const schema = Joi.object({
    peerId: Joi.string().required()
  });
  const { value, error } = schema.validate(data);
  if (error) throw error;
  return value;
};

exports.connectWebRtcTransport = (data) => {
  const schema = Joi.object({
    peerId: Joi.string().required(),
    transportId: Joi.string().required(),
    dtlsParameters: Joi.object().required()
  });
  const { value, error } = schema.validate(data);
  if (error) throw error;
  return value;
};

exports.produce = (data) => {
  const schema = Joi.object({
    peerId: Joi.string().required(),
    transportId: Joi.string().required(),
    produceParams: Joi.object().required()
  });
  const { value, error } = schema.validate(data);
  if (error) throw error;
  return value;
};

exports.consume = (data) => {
  const schema = Joi.object({
    peerId: Joi.string().required(),
    producerId: Joi.string().required(),
    transportId: Joi.string().required(),
    rtpCapabilities: Joi.object().required()
  });
  const { value, error } = schema.validate(data);
  if (error) throw error;
  return value;
};

exports.getOtherPeers = (data) => {
  const schema = Joi.object({
    peerId: Joi.string().required()
  });
  const { value, error } = schema.validate(data);
  if (error) throw error;
  return value;
};

exports.pipeConsume = (data) => {
  const schema = Joi.object({
    producerId: Joi.string().required(),
    ip: Joi.string().ip().required(),
    port: Joi.number().required()
  });
  const { value, error } = schema.validate(data);
  if (error) throw error;
  return value;
};

exports.pipeProduce = (data) => {
  const schema = Joi.object({
    ip: Joi.string().ip().required(),
    port: Joi.number().required(),
    pipeConsumer: Joi.object().required()
  });
  const { value, error } = schema.validate(data);
  if (error) throw error;
  return value;
};

exports.pauseConsumer = (data) => {
  const schema = Joi.object({
    peerId: Joi.string().required(),
    consumerId: Joi.string().required()
  });
  const { value, error } = schema.validate(data);
  if (error) throw error;
  return value;
};

exports.resumeConsumer = (data) => {
  const schema = Joi.object({
    peerId: Joi.string().required(),
    consumerId: Joi.string().required()
  });
  const { value, error } = schema.validate(data);
  if (error) throw error;
  return value;
};

exports.closeConsumer = (data) => {
  const schema = Joi.object({
    peerId: Joi.string().required(),
    consumerId: Joi.string().required()
  });
  const { value, error } = schema.validate(data);
  if (error) throw error;
  return value;
};

exports.pauseProducer = (data) => {
  const schema = Joi.object({
    peerId: Joi.string().required(),
    producerId: Joi.string().required()
  });
  const { value, error } = schema.validate(data);
  if (error) throw error;
  return value;
};

exports.resumeProducer = (data) => {
  const schema = Joi.object({
    peerId: Joi.string().required(),
    producerId: Joi.string().required()
  });
  const { value, error } = schema.validate(data);
  if (error) throw error;
  return value;
};

exports.closeProducer = (data) => {
  const schema = Joi.object({
    peerId: Joi.string().required(),
    producerId: Joi.string().required()
  });
  const { value, error } = schema.validate(data);
  if (error) throw error;
  return value;
};

exports.closeTransport = (data) => {
  const schema = Joi.object({
    peerId: Joi.string().required(),
    transportId: Joi.string().required()
  });
  const { value, error } = schema.validate(data);
  if (error) throw error;
  return value;
};

exports.restartIce = (data) => {
  const schema = Joi.object({
    peerId: Joi.string().required(),
    transportId: Joi.string().required()
  });
  const { value, error } = schema.validate(data);
  if (error) throw error;
  return value;
};

exports.getProducerStats = (data) => {
  const schema = Joi.object({
    producerId: Joi.string().required()
  });
  const { value, error } = schema.validate(data);
  if (error) throw error;
  return value;
};
