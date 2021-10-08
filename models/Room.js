const { model, Schema} = require('mongoose');

const roomSchema = new Schema({
    username: String,
    roomname: String,
    createdAt: String,
    messages: [{
        username: String,
        content: String,
        createdAt: String,
    }],
});

module.exports = model('Room', roomSchema);