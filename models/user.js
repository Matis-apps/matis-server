const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: String,
    email: String,
    deezer: Object,
    spotify: Object,
    discogs: Object,
    temp_discogs_oauth: String,
    hash: String,
    salt: String,
    register_date: Date,
});

mongoose.model('User', UserSchema);