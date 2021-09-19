const { model, Schema} = require('mongoose');

const messageSchema = new Schema({
    username: String,
    content: String,
    createdAt: String,
});

module.exports = model('Message', messageSchema);