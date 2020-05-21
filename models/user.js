const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    email: String,
    hash: String,
    salt: String
});

mongoose.model('User', UserSchema);