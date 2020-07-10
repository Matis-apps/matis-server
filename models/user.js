const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const followingObject = {
  _obj: String,
  _from: String,
  _uid: String,
  id: Schema.Types.Mixed,
  name: String,
  profile: String,
  fullname: String,
  picture: String
};

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
    follow: [followingObject]
});

mongoose.model('User', UserSchema);
