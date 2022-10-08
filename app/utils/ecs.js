const axios = require('axios');
exports.getTaskId = async () => {
  try {
    const URL = `${process.env.ECS_CONTAINER_METADATA_URI_V4}/task`;
    const response = await axios.get(URL);
    const metadata = response.data;
    const taskId = metadata.TaskARN.split('/')[2];
    return taskId;
  } catch (error) {
    console.log('Error getting ECS Task ID:', error.message);
  }
  return process.pid;
};
